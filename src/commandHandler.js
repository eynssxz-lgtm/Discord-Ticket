const {
  ActionRowBuilder,
  AttachmentBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelType,
  PermissionFlagsBits,
  PermissionsBitField,
} = require('discord.js');
const autoresponder = require('./autoresponder');
const autoresponderStore = require('./autoresponderStore');
const antinukeStore = require('./antinukeStore');
const antinuke = require('./antinuke');
const { THRESHOLD, WINDOW_MS } = antinuke;
const jailStore = require('./jailStore');
const logChannelStore = require('./logChannelStore');
const tempVoiceStore = require('./tempVoiceStore');
const afkStore = require('./afkStore');
const welcome = require('./welcome');
const welcomeStore = require('./welcomeStore');
const welcomeInteractions = require('./welcomeInteractions');
const { jailMember, unjailMember } = require('./jail');
const { parseDuration, buildUserCardEmbed } = require('./moderation');
const { buildHelpEmbed, MODERATION_PERMISSIONS } = require('./commandInteractions');

const TICKET_OPEN_BUTTON_ID = 'ticket:open';
const TICKET_CLOSE_BUTTON_ID = 'ticket:close';
const MAX_TRANSCRIPT_MESSAGES = 5_000;
const MAX_TRANSCRIPT_BYTES = 7 * 1024 * 1024;

function buildAfkEmbed(reason) {
  return {
    color: 0x57f287,
    title: 'You are now AFK',
    description: reason,
    footer: { text: 'Your AFK status clears when you send a message.' },
  };
}

function buildTicketOpenRow() {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(TICKET_OPEN_BUTTON_ID)
      .setLabel('Create Ticket')
      .setStyle(ButtonStyle.Primary),
  );
}

function buildTicketCloseRow() {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(TICKET_CLOSE_BUTTON_ID)
      .setLabel('Close Ticket')
      .setStyle(ButtonStyle.Danger),
  );
}

async function createTicketChannel(guild, user, config) {
  const existing = guild.channels.cache.find((channel) => (
    channel.parentId === config.categoryId && channel.topic === `ticket-owner:${user.id}`
  ));
  if (existing) return { channel: existing, alreadyOpen: true };

  const username = user.username.toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
  const channel = await guild.channels.create({
    name: `ticket-${username || user.id}`.slice(0, 100),
    type: ChannelType.GuildText,
    parent: config.categoryId,
    topic: `ticket-owner:${user.id}`,
    permissionOverwrites: [
      {
        id: guild.id,
        deny: [PermissionsBitField.Flags.ViewChannel],
      },
      {
        id: user.id,
        allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages, PermissionsBitField.Flags.ReadMessageHistory],
      },
      {
        id: config.supportRoleId,
        allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages, PermissionsBitField.Flags.ReadMessageHistory],
      },
      {
        id: guild.client.user.id,
        allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages, PermissionsBitField.Flags.ReadMessageHistory],
      },
    ],
  });
  await channel.send({
    content: `Welcome <@${user.id}>. Support staff will be with you shortly.`,
    components: [buildTicketCloseRow()],
  });
  return { channel, alreadyOpen: false };
}

function parseTicketMessage(content) {
  const match = /^,ticket(?:\s+([\s\S]*))?$/i.exec(content.trim());
  if (!match) return null;
  const [action, ...args] = (match[1] || '').trim().split(/\s+/).filter(Boolean);
  return { action: action?.toLowerCase() || 'help', args };
}

function getMentionedId(value, type) {
  const patterns = {
    channel: /^(?:<#(\d+)>|(\d+))$/,
    role: /^(?:<@&(\d+)>|(\d+))$/,
  };
  const match = patterns[type]?.exec(value);
  return match?.[1] || match?.[2] || null;
}

function tokenizePrefixArgs(value) {
  const args = [];
  const pattern = /"([^"]*)"|'([^']*)'|(\S+)/g;
  let match;
  while ((match = pattern.exec(value)) !== null) args.push(match[1] ?? match[2] ?? match[3]);
  return args;
}

function parsePrefixCommand(content) {
  const match = /^,([a-z][\w-]*)(?:\s+([\s\S]*))?$/i.exec(content.trim());
  if (!match) return null;
  const rawArgs = (match[2] || '').trim();
  return { name: match[1].toLowerCase(), rawArgs, args: tokenizePrefixArgs(rawArgs) };
}

function createPrefixInteraction(message, { subcommand, group = null, values = {} } = {}) {
  const resolveUser = (value) => {
    if (!value) return null;
    const id = value.match(/^(?:<@!?(\d+)>|(\d+))$/)?.slice(1).find(Boolean);
    if (!id) return null;
    return message.mentions.users.get(id)
      || message.guild.members.cache.get(id)?.user
      || message.client.users.cache.get(id)
      || null;
  };
  const resolveRole = (value) => {
    const id = value && getMentionedId(value, 'role');
    return id ? message.guild.roles.cache.get(id) || null : null;
  };
  const resolveChannel = (value) => {
    const id = value && getMentionedId(value, 'channel');
    return id ? message.guild.channels.cache.get(id) || null : null;
  };
  let deferred = false;
  const send = (payload) => {
    const { ephemeral, ...messagePayload } = typeof payload === 'string' ? { content: payload } : payload;
    return message.reply(messagePayload);
  };

  return {
    guild: message.guild,
    guildId: message.guild.id,
    channel: message.channel,
    client: message.client,
    user: message.author,
    member: message.member,
    memberPermissions: message.member.permissions,
    get deferred() { return deferred; },
    options: {
      getSubcommand: () => subcommand,
      getSubcommandGroup: () => group,
      getUser: (name) => resolveUser(values[name]),
      getRole: (name) => resolveRole(values[name]),
      getChannel: (name) => resolveChannel(values[name]),
      getString: (name) => values[name] ?? null,
      getInteger: (name) => {
        const value = Number.parseInt(values[name], 10);
        return Number.isInteger(value) ? value : null;
      },
    },
    reply: send,
    deferReply: async () => { deferred = true; },
    editReply: send,
  };
}

function isTicketStaff(member, config) {
  return Boolean(member?.roles?.cache?.has(config.supportRoleId)
    || member?.permissions?.has(PermissionFlagsBits.ManageGuild));
}

async function sendTicketTranscript(channel, config, closedBy = null) {
  if (!config.transcriptChannelId) {
    throw new Error('Set a transcript log channel with ,ticket logs #channel before requesting a transcript.');
  }
  const logChannel = await channel.guild.channels.fetch(config.transcriptChannelId).catch(() => null);
  if (!logChannel?.isTextBased?.() || !logChannel.send) {
    throw new Error('The configured transcript log channel is unavailable or is not a text channel.');
  }

  const messages = [];
  let before;
  while (messages.length < MAX_TRANSCRIPT_MESSAGES) {
    const page = await channel.messages.fetch({
      limit: Math.min(100, MAX_TRANSCRIPT_MESSAGES - messages.length),
      ...(before ? { before } : {}),
    });
    if (!page.size) break;
    messages.push(...page.values());
    before = page.last()?.id;
    if (page.size < 100) break;
  }

  const transcript = messages
    .sort((left, right) => left.createdTimestamp - right.createdTimestamp)
    .map((message) => {
      const timestamp = message.createdAt.toISOString();
      const attachments = [...message.attachments.values()].map(({ url }) => ` [Attachment: ${url}]`).join('');
      const body = message.content || (message.embeds.length ? '[Embed]' : '[No text]');
      return `[${timestamp}] ${message.author.tag} (${message.author.id}): ${body}${attachments}`;
    })
    .join('\n');
  const content = Buffer.from(transcript || 'No messages were found in this ticket.', 'utf8');
  const clipped = content.length > MAX_TRANSCRIPT_BYTES;
  const transcriptBuffer = clipped ? content.subarray(0, MAX_TRANSCRIPT_BYTES) : content;
  const fileName = `${channel.name}-transcript.txt`.replace(/[^a-zA-Z0-9_.-]/g, '-');
  await logChannel.send({
    content: `Transcript for <#${channel.id}>${closedBy ? `, closed by ${closedBy}` : ''}.${clipped ? ' Transcript was shortened to fit the upload limit.' : ''}`,
    files: [new AttachmentBuilder(transcriptBuffer, { name: fileName })],
  });
  return logChannel;
}

async function closeTicketChannel(channel, config, closedBy) {
  await sendTicketTranscript(channel, config, closedBy);
  await channel.delete(`Ticket closed by ${closedBy}`);
}

async function requirePermission(interaction, permission, message) {
  if (interaction.memberPermissions?.has(permission)) return true;
  await interaction.reply({ content: message, ephemeral: true });
  return false;
}

async function getMember(interaction, optionName = 'member') {
  const user = interaction.options.getUser(optionName, true);
  return interaction.guild.members.fetch(user.id).catch(() => null);
}

async function runJail(interaction, action, member) {
  if (!await requirePermission(
    interaction,
    PermissionFlagsBits.ManageRoles,
    'You need the Manage Roles permission to jail or unjail members.',
  )) return;
  if (!interaction.guild.members.me?.permissions.has(PermissionFlagsBits.ManageRoles)) {
    await interaction.reply({ content: 'I need the Manage Roles permission to jail or unjail members.', ephemeral: true });
    return;
  }

  const jailRoleId = jailStore.getJailRole(interaction.guildId);
  const jailRole = jailRoleId && interaction.guild.roles.cache.get(jailRoleId);
  if (!jailRole || !jailRole.editable) {
    await interaction.reply({ content: 'Set a manageable jail role first with `/set jail-role`.', ephemeral: true });
    return;
  }

  if (!member) {
    await interaction.reply({ content: 'That member could not be found in this server.', ephemeral: true });
    return;
  }

  try {
    if (action === 'jail') {
      const result = await jailMember(member, jailRole, jailStore);
      await interaction.reply({
        content: result.alreadyJailed
          ? `${member.user.tag} is already jailed.`
          : result.blockedRoleIds?.length
            ? `I cannot remove every role from ${member.user.tag}; move my role above their assigned roles first.`
            : `Jailed ${member.user.tag} and saved ${result.savedRoleCount} role(s).`,
        ephemeral: true,
      });
      return;
    }

    const result = await unjailMember(member, jailRole, jailStore);
    await interaction.reply({
      content: result.blockedRoleIds?.length
        ? `I cannot restore every role for ${member.user.tag}; move my role above their assigned roles first.`
        : result.wasJailed
          ? `Unjailed ${member.user.tag} and restored ${result.restoredRoleCount} role(s).`
          : `${member.user.tag} was not jailed.`,
      ephemeral: true,
    });
  } catch (error) {
    console.error(`Could not ${action} ${member.id} in guild ${interaction.guildId}:`, error.message);
    await interaction.reply({
      content: `I could not ${action} that member. Check my role hierarchy and permissions.`,
      ephemeral: true,
    });
  }
}

async function runModeration(interaction, action) {
  const permission = MODERATION_PERMISSIONS[action];
  if (permission && !await requirePermission(
    interaction,
    permission,
    `You need the ${action === 'purge' ? 'Manage Messages' : 'appropriate moderation'} permission to use this command.`,
  )) return;

  if (action === 'jail' || action === 'unjail') {
    await runJail(interaction, action, await getMember(interaction));
    return;
  }

  if (action === 'avatar' || action === 'cover') {
    const selectedUser = interaction.options.getUser('member') || interaction.user;
    if (action === 'cover') {
      await interaction.deferReply({ ephemeral: true });
      const user = await interaction.client.users.fetch(selectedUser.id, { force: true }).catch(() => selectedUser);
      const embed = buildUserCardEmbed(user, action);
      await interaction.editReply(embed.image
        ? { embeds: [embed] }
        : { content: `${user.username || 'This user'} does not have a banner photo.` });
      return;
    }
    await interaction.reply({
      embeds: [buildUserCardEmbed(selectedUser, action)],
      ephemeral: true,
    });
    return;
  }

  if (action === 'purge') {
    const amount = interaction.options.getInteger('amount') || 50;
    const deleted = await interaction.channel.bulkDelete(amount, true).catch(() => null);
    await interaction.reply({
      content: deleted ? `Purged ${deleted.size} messages.` : 'I could not purge messages in this channel.',
      ephemeral: true,
    });
    return;
  }

  const member = await getMember(interaction);
  if (!member) {
    await interaction.reply({ content: 'That member could not be found in this server.', ephemeral: true });
    return;
  }
  const reason = interaction.options.getString('reason') || 'No reason provided';

  try {
    if (action === 'kick') {
      await member.kick(reason);
      await interaction.reply({ content: `Kicked ${member.user.tag}.`, ephemeral: true });
      return;
    }
    if (action === 'ban') {
      await member.ban({ reason });
      await interaction.reply({ content: `Banned ${member.user.tag}.`, ephemeral: true });
      return;
    }
    if (action === 'timeout') {
      const durationValue = interaction.options.getString('duration') || '10m';
      const duration = parseDuration(durationValue);
      if (!duration || duration < 1000 || duration > 28 * 24 * 60 * 60 * 1000) {
        await interaction.reply({ content: 'Choose a duration from 1 second to 28 days, such as `10m` or `2h`.', ephemeral: true });
        return;
      }
      await member.timeout(duration, reason);
      await interaction.reply({ content: `Timed out ${member.user.tag} for ${durationValue}.`, ephemeral: true });
      return;
    }
    if (action === 'mute') {
      await member.timeout(10 * 60 * 1000, reason);
      await interaction.reply({ content: `Muted ${member.user.tag} for 10 minutes.`, ephemeral: true });
    }
  } catch (error) {
    console.error(`Could not ${action} ${member.id} in guild ${interaction.guildId}:`, error.message);
    await interaction.reply({ content: `I could not ${action} that member. Check my permissions and role hierarchy.`, ephemeral: true });
  }
}

async function runRole(interaction) {
  if (!await requirePermission(
    interaction,
    PermissionFlagsBits.ManageRoles,
    'You need the Manage Roles permission to assign roles.',
  )) return;
  if (!interaction.guild.members.me?.permissions.has(PermissionFlagsBits.ManageRoles)) {
    await interaction.reply({ content: 'I need the Manage Roles permission to assign roles.', ephemeral: true });
    return;
  }

  const user = interaction.options.getUser('member', true);
  const role = interaction.options.getRole('role', true);
  const member = await interaction.guild.members.fetch(user.id).catch(() => null);
  if (!member) {
    await interaction.reply({ content: 'That user is not a member of this server.', ephemeral: true });
    return;
  }
  if (role.id === interaction.guildId || role.managed || !role.editable) {
    await interaction.reply({ content: 'I cannot assign that role. Check that it is not managed and is below my highest role.', ephemeral: true });
    return;
  }
  if (!member.manageable) {
    await interaction.reply({ content: 'I cannot manage that member. Move my highest role above theirs first.', ephemeral: true });
    return;
  }
  if (member.roles.cache.has(role.id)) {
    await interaction.reply({ content: `${member.user.tag} already has <@&${role.id}>.`, ephemeral: true });
    return;
  }

  try {
    await member.roles.add(role, `Role assigned by ${interaction.user.tag}`);
    await interaction.reply({ content: `Added <@&${role.id}> to ${member.user.tag}.`, ephemeral: true });
  } catch (error) {
    console.error(`Could not assign role ${role.id} to ${member.id} in guild ${interaction.guildId}:`, error.message);
    await interaction.reply({ content: 'I could not assign that role. Check my permissions and role hierarchy.', ephemeral: true });
  }
}

async function runSet(interaction) {
  const setting = interaction.options.getSubcommand();
  if (setting === 'jail-role') {
    if (!await requirePermission(interaction, PermissionFlagsBits.ManageRoles, 'You need the Manage Roles permission to set the jail role.')) return;
    const role = interaction.options.getRole('role', true);
    if (role.id === interaction.guildId || !role.editable) {
      await interaction.reply({ content: 'The bot must be able to manage the selected role.', ephemeral: true });
      return;
    }
    jailStore.setJailRole(interaction.guildId, role.id);
    await interaction.reply({ content: `Jail role set to <@&${role.id}>.`, ephemeral: true });
    return;
  }

  if (!await requirePermission(interaction, PermissionFlagsBits.ManageGuild, 'You need the Manage Server permission to change server settings.')) return;
  const channel = interaction.options.getChannel('channel');
  if (setting === 'logs') {
    logChannelStore.setLogChannel(interaction.guildId, channel?.id || null);
    await interaction.reply({
      content: channel ? `Log channel updated to <#${channel.id}>.` : 'Log channel cleared.',
      ephemeral: true,
    });
    return;
  }

  if (channel && channel.type !== ChannelType.GuildVoice) {
    await interaction.reply({ content: 'Choose a voice channel from this server.', ephemeral: true });
    return;
  }
  tempVoiceStore.setTriggerChannel(interaction.guildId, channel?.id || null);
  await interaction.reply({
    content: channel
      ? `Members joining <#${channel.id}> will get their own temporary voice channel.`
      : 'Temporary voice channels are disabled.',
    ephemeral: true,
  });
}

async function runAutoresponder(interaction) {
  if (!await requirePermission(interaction, PermissionFlagsBits.ManageGuild, 'You need the Manage Server permission to manage autoresponders.')) return;
  const action = interaction.options.getSubcommand();
  if (action === 'add') {
    const trigger = interaction.options.getString('trigger', true).trim();
    const response = interaction.options.getString('response', true).trim();
    if (!autoresponder.isValidTrigger(trigger) || !response || response.length > 2000) {
      await interaction.reply({ content: 'Provide a non-empty trigger (up to 100 characters) and response (up to 2,000 characters).', ephemeral: true });
      return;
    }
    if (!autoresponderStore.add(interaction.guildId, trigger, response)) {
      await interaction.reply({ content: 'An autoresponder already exists for that trigger.', ephemeral: true });
      return;
    }
    await interaction.reply({ content: `Autoresponder added for \`${trigger}\`.`, ephemeral: true });
    return;
  }

  if (action === 'remove') {
    const trigger = interaction.options.getString('trigger', true).trim();
    if (!autoresponder.isValidTrigger(trigger)) {
      await interaction.reply({ content: 'Provide the trigger to remove (up to 100 characters).', ephemeral: true });
      return;
    }
    await interaction.reply({
      content: autoresponderStore.remove(interaction.guildId, trigger)
        ? `Autoresponder removed for \`${trigger}\`.`
        : 'No autoresponder was found for that trigger.',
      ephemeral: true,
    });
    return;
  }

  const entries = autoresponderStore.list(interaction.guildId);
  if (!entries.length) {
    await interaction.reply({ content: 'There are no autoresponders configured for this server.', ephemeral: true });
    return;
  }
  const triggers = entries.slice(0, 20).map(({ trigger }) => `- ${trigger}`).join('\n');
  const remaining = entries.length - 20;
  await interaction.reply({
    content: `Configured triggers:\n${triggers}${remaining > 0 ? `\n...and ${remaining} more.` : ''}`,
    ephemeral: true,
  });
}

async function runTicket(interaction) {
  const action = interaction.options.getSubcommand();
  const ticketStore = require('./ticketStore');
  const config = ticketStore.getConfig(interaction.guildId);
  if (!config.categoryId || !config.supportRoleId) {
    await interaction.reply({ content: 'Set up tickets first with `/ticket setup category:@tickets role:@Support`.', ephemeral: true });
    return;
  }

  if (action === 'create') {
    const isSupport = interaction.member?.roles?.cache?.has(config.supportRoleId);
    const isManager = interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild);
    if (!isSupport && !isManager) {
      await interaction.reply({ content: 'Only support staff can create a ticket for another member.', ephemeral: true });
      return;
    }
    const member = interaction.options.getUser('member', true);
    await interaction.deferReply({ ephemeral: true });
    const result = await createTicketChannel(interaction.guild, member, config);
    await interaction.editReply({
      content: result.alreadyOpen
        ? `${member.tag} already has an open ticket: <#${result.channel.id}>`
        : `Ticket created: <#${result.channel.id}>`,
    });
    return;
  }

  if (action === 'close') {
    const channel = interaction.options.getChannel('channel') || interaction.channel;
    const ownerId = channel?.topic?.match(/^ticket-owner:(\d+)$/)?.[1];
    const isSupport = interaction.member?.roles?.cache?.has(config.supportRoleId);
    const isManager = interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild);
    if (channel && channel.parentId === config.categoryId && ownerId
      && (ownerId === interaction.user.id || isSupport || isManager)) {
      await interaction.deferReply({ ephemeral: true });
      await closeTicketChannel(channel, config, interaction.user.tag);
      await interaction.editReply({ content: `Closed ticket channel <#${channel.id}>.` });
      return;
    }
    await interaction.reply({ content: 'Only the ticket owner or support staff can close a ticket channel.', ephemeral: true });
  }
}

async function handleTicketMessage(message) {
  if (!message.guild || message.author.bot) return false;
  const command = parseTicketMessage(message.content);
  if (!command) return false;

  const { action, args } = command;
  const ticketStore = require('./ticketStore');
  const config = ticketStore.getConfig(message.guild.id);
  const manageGuild = message.member.permissions.has(PermissionFlagsBits.ManageGuild);

  if (action === 'setup') {
    if (!manageGuild) {
      await message.reply('You need the Manage Server permission to set up tickets.');
      return true;
    }
    const categoryId = getMentionedId(args[0] || '', 'channel');
    const supportRoleId = getMentionedId(args[1] || '', 'role');
    const panelChannelId = args[2] ? getMentionedId(args[2], 'channel') : message.channel.id;
    const category = categoryId && message.guild.channels.cache.get(categoryId);
    const role = supportRoleId && message.guild.roles.cache.get(supportRoleId);
    const panelChannel = panelChannelId && message.guild.channels.cache.get(panelChannelId);
    if (category?.type !== ChannelType.GuildCategory || !role || !panelChannel?.isTextBased?.() || !panelChannel.send) {
      await message.reply('Usage: `,ticket setup #category @support-role [#panel-channel]`');
      return true;
    }
    ticketStore.setConfig(message.guild.id, {
      categoryId: category.id,
      supportRoleId: role.id,
      panelChannelId: panelChannel.id,
    });
    await panelChannel.send({
      content: '**Need help?** Select the button below to open a private support ticket.',
      components: [buildTicketOpenRow()],
    });
    await message.reply(`Ticket setup saved. Panel posted in <#${panelChannel.id}>; tickets will be created in <#${category.id}>.`);
    return true;
  }

  if (action === 'panel') {
    if (!manageGuild) {
      await message.reply('You need the Manage Server permission to post a ticket panel.');
      return true;
    }
    if (!config.categoryId || !config.supportRoleId) {
      await message.reply('Set up tickets first with `,ticket setup #category @support-role [#panel-channel]`.');
      return true;
    }
    const panelChannelId = args[0] ? getMentionedId(args[0], 'channel') : message.channel.id;
    const panelChannel = panelChannelId && message.guild.channels.cache.get(panelChannelId);
    if (!panelChannel?.isTextBased?.() || !panelChannel.send) {
      await message.reply('Usage: `,ticket panel [#channel]`');
      return true;
    }
    ticketStore.setConfig(message.guild.id, { panelChannelId: panelChannel.id });
    await panelChannel.send({
      content: '**Need help?** Select the button below to open a private support ticket.',
      components: [buildTicketOpenRow()],
    });
    await message.reply(`Ticket panel posted in <#${panelChannel.id}>.`);
    return true;
  }

  if (action === 'logs') {
    if (!manageGuild) {
      await message.reply('You need the Manage Server permission to configure ticket transcript logs.');
      return true;
    }
    if (args[0]?.toLowerCase() === 'off') {
      ticketStore.setConfig(message.guild.id, { transcriptChannelId: null });
      await message.reply('Ticket transcript logging is disabled.');
      return true;
    }
    const channelId = getMentionedId(args[0] || '', 'channel');
    const channel = channelId && message.guild.channels.cache.get(channelId);
    if (!channel?.isTextBased?.() || !channel.send) {
      await message.reply('Usage: `,ticket logs #transcript-channel` or `,ticket logs off`');
      return true;
    }
    ticketStore.setConfig(message.guild.id, { transcriptChannelId: channel.id });
    await message.reply(`Ticket transcripts will be logged in <#${channel.id}>.`);
    return true;
  }

  if (action === 'create') {
    if (!isTicketStaff(message.member, config)) {
      await message.reply('Only support staff can create a ticket for another member.');
      return true;
    }
    const userId = args[0]?.match(/^(?:<@!?(\d+)>|(\d+))$/)?.slice(1).find(Boolean);
    const user = userId && (message.mentions.users.get(userId)
      || message.guild.members.cache.get(userId)?.user
      || message.client.users.cache.get(userId));
    if (!user) {
      await message.reply('Usage: `,ticket create @member`');
      return true;
    }
    const result = await createTicketChannel(message.guild, user, config);
    await message.reply(result.alreadyOpen
      ? `${user.tag} already has an open ticket: <#${result.channel.id}>`
      : `Ticket created: <#${result.channel.id}>`);
    return true;
  }

  if (!['transcript', 'close'].includes(action)) {
    await message.reply('Ticket commands: `,ticket setup`, `,ticket panel`, `,ticket logs`, `,ticket create @member`, `,ticket transcript`, `,ticket close [#channel]`.');
    return true;
  }

  const targetChannel = action === 'close' && args[0]
    ? message.guild.channels.cache.get(getMentionedId(args[0], 'channel'))
    : message.channel;
  const ownerId = targetChannel?.topic?.match(/^ticket-owner:(\d+)$/)?.[1];
  if (!ownerId || targetChannel.parentId !== config.categoryId) {
    await message.reply('Use this command inside a ticket channel.');
    return true;
  }
  if (ownerId !== message.author.id && !isTicketStaff(message.member, config)) {
    await message.reply('Only the ticket owner or support staff can manage this ticket.');
    return true;
  }
  if (action === 'transcript') {
    const logChannel = await sendTicketTranscript(targetChannel, config);
    await message.reply(`Transcript uploaded to <#${logChannel.id}>.`);
    return true;
  }

  await closeTicketChannel(targetChannel, config, message.author.tag);
  return true;
}

async function handleTicketButton(interaction) {
  if (!interaction.isButton?.() || ![TICKET_OPEN_BUTTON_ID, TICKET_CLOSE_BUTTON_ID].includes(interaction.customId)) return false;
  const ticketStore = require('./ticketStore');
  const config = ticketStore.getConfig(interaction.guildId);

  if (interaction.customId === TICKET_OPEN_BUTTON_ID) {
    if (!config.categoryId || !config.supportRoleId) {
      await interaction.reply({ content: 'Tickets are not configured in this server yet.', ephemeral: true });
      return true;
    }
    await interaction.deferReply({ ephemeral: true });
    const result = await createTicketChannel(interaction.guild, interaction.user, config);
    await interaction.editReply({
      content: result.alreadyOpen
        ? `You already have an open ticket: <#${result.channel.id}>`
        : `Your ticket is ready: <#${result.channel.id}>`,
    });
    return true;
  }

  const ownerId = interaction.channel?.topic?.match(/^ticket-owner:(\d+)$/)?.[1];
  const isSupport = interaction.member?.roles?.cache?.has(config.supportRoleId);
  const isManager = interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild);
  if (!ownerId || (ownerId !== interaction.user.id && !isSupport && !isManager)) {
    await interaction.reply({ content: 'Only the ticket owner or support staff can close this ticket.', ephemeral: true });
    return true;
  }
  await interaction.deferReply({ ephemeral: true });
  await closeTicketChannel(interaction.channel, config, interaction.user.tag);
  await interaction.editReply({ content: 'Ticket transcript logged and channel closed.' });
  return true;
}

async function runAntinuke(interaction) {
  if (!await requirePermission(interaction, PermissionFlagsBits.ManageGuild, 'You need the Manage Server permission to configure antinuke.')) return;
  const group = interaction.options.getSubcommandGroup(false);
  const action = interaction.options.getSubcommand();
  if (group) {
    const targetType = group.slice('whitelist-'.length);
    if (action === 'list') {
      const ids = antinukeStore.getConfig(interaction.guildId)[`${targetType}Ids`];
      await interaction.reply({
        content: ids.length
          ? `Whitelisted ${targetType}s: ${ids.map((id) => `\`${id}\``).join(', ')}`
          : `No ${targetType}s are whitelisted.`,
        ephemeral: true,
      });
      return;
    }

    const target = targetType === 'role'
      ? interaction.options.getRole('role', true)
      : interaction.options.getChannel('channel', true);
    if ((targetType === 'category' && target.type !== ChannelType.GuildCategory)
      || (targetType === 'channel' && target.type === ChannelType.GuildCategory)) {
      await interaction.reply({ content: `Choose a valid ${targetType} from this server.`, ephemeral: true });
      return;
    }
    const shouldAdd = action === 'add';
    const changed = antinukeStore.updateWhitelist(interaction.guildId, targetType, target.id, shouldAdd);
    await interaction.reply({
      content: changed
        ? `${shouldAdd ? 'Whitelisted' : 'Removed'} ${targetType} <${targetType === 'role' ? '@&' : '#'}${target.id}>.`
        : `${targetType} \`${target.id}\` was already in that state.`,
      ephemeral: true,
    });
    return;
  }

  if (action === 'enable' || action === 'disable') {
    antinukeStore.setEnabled(interaction.guildId, action === 'enable');
    await interaction.reply({ content: `Antinuke is now ${action === 'enable' ? 'enabled' : 'disabled'}.`, ephemeral: true });
    return;
  }
  if (action === 'set-punishment') {
    const punishment = interaction.options.getString('punishment', true);
    antinukeStore.setPunishment(interaction.guildId, punishment);
    await interaction.reply({ content: `Antinuke punishment set to \`${punishment}\`.`, ephemeral: true });
    return;
  }

  const config = antinukeStore.getConfig(interaction.guildId);
  const punishment = {
    'remove-roles': 'remove all manageable roles',
    timeout: '10-minute timeout',
  }[config.punishment] || config.punishment;
  const actionWord = THRESHOLD === 1 ? 'action' : 'actions';
  const secondWord = WINDOW_MS === 1_000 ? 'second' : 'seconds';
  const status = `Antinuke is ${config.enabled ? 'enabled' : 'disabled'}. Threshold: ${THRESHOLD} matching ${actionWord} within ${WINDOW_MS / 1000} ${secondWord}; punishment: ${punishment}.`;
  const readiness = antinuke.getReadiness(interaction.guild, interaction.client, config.punishment);
  const checks = [
    `GuildModeration intent: ${readiness.moderationIntent ? 'ready' : 'MISSING'}`,
    `View Audit Log: ${readiness.viewAuditLog ? 'ready' : 'MISSING'}`,
    `Punishment permission${readiness.punishmentPermissionName ? ` (${readiness.punishmentPermissionName})` : ''}: ${readiness.punishmentPermission ? 'ready' : 'MISSING'}`,
    'The bot role must be above the actor and any roles it needs to remove.',
    'The server owner and whitelisted actors/targets are exempt.',
  ].join('\n');
  const allLists = action === 'whitelist-list'
    ? `\nRoles: ${config.roleIds.length ? config.roleIds.map((id) => `<@&${id}>`).join(', ') : 'none'}\nCategories: ${config.categoryIds.length ? config.categoryIds.map((id) => `<#${id}>`).join(', ') : 'none'}\nChannels: ${config.channelIds.length ? config.channelIds.map((id) => `<#${id}>`).join(', ') : 'none'}`
    : '';
  await interaction.reply({ content: `${status}\n${checks}${allLists}`, ephemeral: true });
}

async function handlePrefixWelcome(message, command) {
  const { name, args, rawArgs } = command;
  const hasManageGuild = message.member.permissions.has(PermissionFlagsBits.ManageGuild);
  if (!hasManageGuild) {
    await message.reply('You need the Manage Server permission to configure welcome messages.');
    return true;
  }

  if (name === 'set-welcome-channel' || (name === 'welcome' && args[0] === 'channel')) {
    const token = name === 'welcome' ? args[1] : args[0];
    const channel = token && message.guild.channels.cache.get(getMentionedId(token, 'channel'));
    if (!channel?.isTextBased?.() || channel.isThread?.()) {
      await message.reply('Usage: `,welcome channel #text-channel`');
      return true;
    }
    welcomeStore.update(message.guild.id, { channelId: channel.id, enabled: true });
    await message.reply(`Welcome messages are enabled in <#${channel.id}>.`);
    return true;
  }

  if (name === 'set-welcome-message' || (name === 'welcome' && args[0] === 'message')) {
    const value = name === 'welcome' ? args.slice(1).join(' ') : rawArgs;
    const messageText = value.replace(/^("([\s\S]*)"|'([\s\S]*)')$/, '$2$3').trim();
    if (!messageText || messageText.length > 2000) {
      await message.reply('Provide a welcome message up to 2,000 characters.');
      return true;
    }
    welcomeStore.update(message.guild.id, { message: messageText });
    await message.reply('Welcome message updated.');
    return true;
  }

  if (name === 'edit-embed' || (name === 'welcome' && args[0] === 'embed' && args[1] === 'edit')) {
    await message.channel.send({
      content: 'Choose an embed section to edit:',
      components: [welcomeInteractions.buildEmbedEditorMenu()],
    });
    return true;
  }

  if (name === 'welcome' && args[0] === 'embed' && args[1] === 'clear') {
    const field = args[2] || null;
    const update = welcome.parseEmbedUpdate('clear', field);
    if (!update) {
      await message.reply('Choose a valid embed field: title, description, color, footer, author, image, or thumbnail.');
      return true;
    }
    welcomeStore.update(message.guild.id, { embed: update });
    await message.reply(field ? `Welcome embed field \`${field}\` cleared.` : 'Welcome embed cleared.');
    return true;
  }

  if (name === 'welcome' && args[0] === 'disable') {
    welcomeStore.update(message.guild.id, { enabled: false });
    await message.reply('Welcome messages are disabled.');
    return true;
  }

  if (name === 'welcome' && args[0] === 'status') {
    const config = welcomeStore.getConfig(message.guild.id);
    await message.reply(`Welcome messages are ${config.enabled ? 'enabled' : 'disabled'}; channel: ${config.channelId ? `<#${config.channelId}>` : 'not set'}.`);
    return true;
  }

  if (name === 'welcome' && args[0] === 'preview') {
    const payload = welcome.buildPayload(welcomeStore.getConfig(message.guild.id), message.member);
    if (!payload.content && payload.embeds.length === 0) {
      await message.reply('Set a welcome message or embed content before previewing.');
      return true;
    }
    await message.channel.send(payload);
    await message.reply('Welcome preview sent.');
    return true;
  }

  return false;
}

async function handlePrefixCommand(message) {
  if (!message.guild || message.author.bot) return false;
  const command = parsePrefixCommand(message.content);
  if (!command) return false;
  if (command.name === 'ticket') return handleTicketMessage(message);

  const { name, args } = command;
  if (name === 'help') {
    await message.reply({ embeds: [buildHelpEmbed()] });
    return true;
  }
  if (['welcome', 'set-welcome-channel', 'set-welcome-message', 'edit-embed'].includes(name)) {
    const handled = await handlePrefixWelcome(message, command);
    if (handled) return true;
  }
  if (name === 'afk') {
    const reason = command.rawArgs.trim() || 'AFK';
    const member = message.member;
    const originalNickname = member?.nickname || member?.user?.username || null;
    afkStore.set(message.guild.id, message.author.id, reason, originalNickname);
    if (member && typeof member.setNickname === 'function') {
      await require('./afk').applyAfkNickname(member);
    }
    await message.reply({ embeds: [buildAfkEmbed(reason)] });
    return true;
  }

  if (name === 'set') {
    const action = args[0]?.toLowerCase();
    const value = args[1] || null;
    const roleRequired = action === 'jail-role';
    const resolved = roleRequired
      ? getMentionedId(value || '', 'role') && message.guild.roles.cache.get(getMentionedId(value || '', 'role'))
      : getMentionedId(value || '', 'channel') && message.guild.channels.cache.get(getMentionedId(value || '', 'channel'));
    if (!['logs', 'temp-voice', 'jail-role'].includes(action)
      || (roleRequired && !resolved)
      || (value && !resolved)) {
      await message.reply('Usage: `,set logs [#channel]`, `,set temp-voice [#voice-channel]`, or `,set jail-role @role`');
      return true;
    }
    const interaction = createPrefixInteraction(message, {
      subcommand: action,
      values: { channel: roleRequired ? null : value, role: roleRequired ? value : null },
    });
    await runSet(interaction);
    return true;
  }

  if (name === 'role') {
    if (args[0]?.toLowerCase() !== 'add' || !args[1] || !args[2]) {
      await message.reply('Usage: `,role add @member @role`');
      return true;
    }
    await runRole(createPrefixInteraction(message, {
      subcommand: 'add',
      values: { member: args[1], role: args[2] },
    }));
    return true;
  }

  if (MODERATION_PERMISSIONS[name] || ['avatar', 'cover'].includes(name)) {
    const values = { member: args[0] || null };
    if (name === 'purge') values.amount = args[0] || null;
    if (name === 'timeout') {
      values.duration = args[1] || null;
      values.reason = args.slice(2).join(' ') || null;
    } else if (['kick', 'ban', 'mute'].includes(name)) {
      values.reason = args.slice(1).join(' ') || null;
    }
    const requiresMember = ['kick', 'ban', 'timeout', 'mute', 'jail', 'unjail'].includes(name);
    if (requiresMember && !createPrefixInteraction(message, { values }).options.getUser('member')) {
      await message.reply(`Usage: \,${name} @member${name === 'timeout' ? ' 10m [reason]' : ' [reason]'}`);
      return true;
    }
    await runModeration(createPrefixInteraction(message, { values }), name);
    return true;
  }

  if (name === 'autoresponder') {
    const action = args[0]?.toLowerCase();
    if (!['add', 'remove', 'list'].includes(action)) {
      await message.reply('Usage: `,autoresponder add trigger response`, `,autoresponder remove trigger`, or `,autoresponder list`');
      return true;
    }
    const trigger = args[1] || null;
    const response = args.slice(2).join(' ') || null;
    if ((action === 'add' && (!trigger || !response)) || (action === 'remove' && !trigger)) {
      await message.reply('Usage: `,autoresponder add trigger response` or `,autoresponder remove trigger`');
      return true;
    }
    await runAutoresponder(createPrefixInteraction(message, {
      subcommand: action,
      values: { trigger, response },
    }));
    return true;
  }

  if (name === 'antinuke') {
    let action = args[0]?.toLowerCase() || 'status';
    let group = null;
    let target = null;
    if (action.startsWith('whitelist-role') || action.startsWith('whitelist-category') || action.startsWith('whitelist-channel')) {
      group = action;
      action = args[1]?.toLowerCase() || 'list';
      target = args[2] || null;
    }
    const targetType = group?.slice('whitelist-'.length);
    if (!['enable', 'disable', 'status', 'set-punishment', 'whitelist-list', 'add', 'remove', 'list'].includes(action)
      || ((action === 'add' || action === 'remove') && !target)) {
      await message.reply('Use `,antinuke status`, `enable`, `disable`, `set-punishment <type>`, or `whitelist-role|category|channel add|remove|list <target>`.');
      return true;
    }
    await runAntinuke(createPrefixInteraction(message, {
      subcommand: action,
      group,
      values: {
        punishment: group ? null : args[1] || null,
        role: targetType === 'role' ? target : null,
        channel: ['category', 'channel'].includes(targetType) ? target : null,
      },
    }));
    return true;
  }

  await message.reply(`Unknown command. Use \,help. Slash commands remain available too.`);
  return true;
}

async function handleCommand(interaction) {
  const name = interaction.commandName;
  if (name === 'help') {
    await interaction.reply({ embeds: [buildHelpEmbed()], ephemeral: true });
    return true;
  }
  if (name === 'set') {
    await runSet(interaction);
    return true;
  }
  if (name === 'role') {
    await runRole(interaction);
    return true;
  }
  if (name === 'afk') {
    const reason = interaction.options.getString('reason')?.trim() || 'AFK';
    const member = interaction.member || await interaction.guild.members.fetch(interaction.user.id).catch(() => null);
    const originalNickname = member?.nickname || member?.user?.username || null;
    afkStore.set(interaction.guildId, interaction.user.id, reason, originalNickname);
    if (member && typeof member.setNickname === 'function') {
      const afk = require('./afk');
      await afk.applyAfkNickname(member);
    }
    await interaction.reply({ embeds: [buildAfkEmbed(reason)], ephemeral: true });
    return true;
  }
  if (name === 'autoresponder') {
    await runAutoresponder(interaction);
    return true;
  }
  if (name === 'ticket') {
    await runTicket(interaction);
    return true;
  }
  if (name === 'antinuke') {
    await runAntinuke(interaction);
    return true;
  }
  if (MODERATION_PERMISSIONS[name] || ['avatar', 'cover'].includes(name)) {
    await runModeration(interaction, name);
    return true;
  }
  return false;
}

module.exports = handleCommand;
module.exports.handleTicketButton = handleTicketButton;
module.exports.handleTicketMessage = handleTicketMessage;
module.exports.handlePrefixCommand = handlePrefixCommand;
module.exports.parsePrefixCommand = parsePrefixCommand;
module.exports.buildAfkEmbed = buildAfkEmbed;
module.exports.parseTicketMessage = parseTicketMessage;