require('dotenv').config();

const {
  Client,
  GatewayIntentBits,
  PermissionsBitField,
  REST,
  Routes,
} = require('discord.js');
const { DEFAULT_PREFIX, isValidPrefix, parseCommand } = require('./prefix');
const prefixStore = require('./prefixStore');
const logChannelStore = require('./logChannelStore');
const autoresponder = require('./autoresponder');
const autoresponderStore = require('./autoresponderStore');
const antinuke = require('./antinuke');
const antinukeStore = require('./antinukeStore');
const welcome = require('./welcome');
const welcomeStore = require('./welcomeStore');
const welcomeInteractions = require('./welcomeInteractions');
const { parseDuration, parsePurgeAmount, resolveTargetMember, buildUserCardEmbed } = require('./moderation');

const token = process.env.DISCORD_TOKEN;
const applicationId = process.env.DISCORD_CLIENT_ID;
if (!token) {
  throw new Error('DISCORD_TOKEN is missing. Set it in your .env file.');
}

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildModeration,
    GatewayIntentBits.GuildMembers,
  ],
});

async function registerWelcomeCommands(guild) {
  if (!applicationId) return;
  const rest = new REST({ version: '10' }).setToken(token);
  try {
    await rest.put(Routes.applicationGuildCommands(applicationId, guild.id), {
      body: welcomeInteractions.getCommands(),
    });
    console.log(`Registered welcome commands in guild ${guild.id}`);
  } catch (error) {
    console.error(`Could not register welcome commands in guild ${guild.id}:`, error.message);
  }
}

client.once('ready', async () => {
  console.log(`SINCLAIR is online as ${client.user.tag}`);
  if (!applicationId) {
    console.warn('DISCORD_CLIENT_ID is missing; welcome slash commands were not registered.');
    return;
  }
  await Promise.all(client.guilds.cache.map(registerWelcomeCommands));
});

client.on('guildCreate', registerWelcomeCommands);

async function getLogChannel(guild) {
  if (!guild) return null;
  const channelId = logChannelStore.getLogChannel(guild.id);
  if (!channelId) return null;
  return client.channels.cache.get(channelId) || client.channels.fetch(channelId).catch(() => null);
}

async function sendServerLog(guild, content) {
  const channel = await getLogChannel(guild);
  if (!channel || !channel.isTextBased?.()) return;
  await channel.send(content).catch(() => null);
}

client.on('voiceStateUpdate', async (oldState, newState) => {
  const guild = oldState.guild || newState.guild;
  if (!guild) return;

  const member = newState.member || oldState.member;
  if (!member || member.user.bot) return;

  const oldChannelId = oldState.channelId;
  const newChannelId = newState.channelId;
  if (oldChannelId === newChannelId) return;

  if (!oldChannelId && newChannelId) {
    await sendServerLog(guild, `🔊 ${member.user.tag} joined <#${newChannelId}>.`);
    return;
  }

  if (oldChannelId && !newChannelId) {
    await sendServerLog(guild, `🔊 ${member.user.tag} left <#${oldChannelId}>.`);
    return;
  }

  if (oldChannelId && newChannelId) {
    await sendServerLog(guild, `🔊 ${member.user.tag} moved from <#${oldChannelId}> to <#${newChannelId}>.`);
  }
});

client.on('messageDelete', async (message) => {
  if (!message.guild || message.author?.bot) return;

  const logChannel = await getLogChannel(message.guild);
  if (!logChannel) return;

  const attachment = [...message.attachments.values()].find((item) => {
    const isImageType = item.contentType?.startsWith('image/');
    const hasImageExtension = /\.(png|jpe?g|gif|webp|bmp|svg)(\?.*)?$/i.test(item.url);
    return isImageType || hasImageExtension;
  });

  if (message.content && message.content.trim()) {
    await logChannel.send(`🗑️ Message deleted in <#${message.channel.id}> by ${message.author.tag}:\n${message.content.slice(0, 1000)}`).catch(() => null);
  }

  if (attachment) {
    await logChannel.send({
      content: `🖼️ Deleted image from <#${message.channel.id}> by ${message.author.tag}.`,
      files: [attachment.url],
    }).catch(() => null);
  }
});

client.on('interactionCreate', async (interaction) => {
  if (!interaction.inGuild()) return;

  if (interaction.isChatInputCommand()) {
    if (!['edit-embed', 'set-welcome-channel', 'set-welcome-message'].includes(interaction.commandName)) {
      return;
    }

    if (!interaction.memberPermissions?.has(PermissionsBitField.Flags.ManageGuild)) {
      await interaction.reply({ content: 'You need the Manage Server permission to configure welcome messages.', ephemeral: true });
      return;
    }

    if (interaction.commandName === 'edit-embed') {
      await interaction.showModal(welcomeInteractions.buildEmbedModal(
        welcomeStore.getConfig(interaction.guildId).embed,
      ));
      return;
    }

    if (interaction.commandName === 'set-welcome-channel') {
      const channel = interaction.options.getChannel('channel', true);
      welcomeStore.update(interaction.guildId, { channelId: channel.id, enabled: true });
      await interaction.reply({ content: `Welcome messages are enabled in <#${channel.id}>.`, ephemeral: true });
      return;
    }

    const message = interaction.options.getString('message', true);
    welcomeStore.update(interaction.guildId, { message });
    await interaction.reply({ content: 'Welcome message updated.', ephemeral: true });
    return;
  }

  if (interaction.isModalSubmit() && interaction.customId === welcomeInteractions.EMBED_MODAL_ID) {
    if (!interaction.memberPermissions?.has(PermissionsBitField.Flags.ManageGuild)) {
      await interaction.reply({ content: 'You need the Manage Server permission to configure welcome messages.', ephemeral: true });
      return;
    }

    const values = Object.fromEntries(
      ['title', 'description', 'color', 'footer', 'image'].map((name) => [
        name,
        interaction.fields.getTextInputValue(name),
      ]),
    );
    const embed = welcomeInteractions.parseModalValues(values);
    if (!embed) {
      await interaction.reply({ content: 'Invalid embed value. Check the color hex code and image URL.', ephemeral: true });
      return;
    }

    welcomeStore.update(interaction.guildId, { embed });
    await interaction.reply({ content: 'Welcome embed saved.', ephemeral: true });
  }
});

client.on('messageCreate', async (message) => {
  if (message.author.bot || !message.guild) {
    return;
  }

  const prefix = prefixStore.getPrefix(message.guild.id, DEFAULT_PREFIX);
  const command = parseCommand(message.content, prefix);
  const welcomeCommand = welcome.parseCommand(message.content, prefix);

  const MODERATION_ACTIONS = new Set(['kick', 'ban', 'timeout', 'mute', 'jail', 'av', 'avatar', 'cover', 'purge']);
  const moderationAction = command && (MODERATION_ACTIONS.has(command.name) ? command.name : null);

  if (command?.name === 'setprefix') {
    if (!message.member.permissions.has(PermissionsBitField.Flags.ManageGuild)) {
      await message.reply('You need the Manage Server permission to change the prefix.');
      return;
    }

    const newPrefix = command.args[0];
    if (!isValidPrefix(newPrefix)) {
      await message.reply('Choose a prefix of 1-5 characters with no spaces.');
      return;
    }

    prefixStore.setPrefix(message.guild.id, newPrefix);
    await message.reply(`Prefix updated to \`${newPrefix}\`.`);
    return;
  }

  if (moderationAction || command?.name === 'mod' || command?.name === 'moderation') {
    const action = moderationAction || command.args[0]?.toLowerCase();
    const modifierArgs = moderationAction ? command.args : command.args.slice(1);
    const target = modifierArgs.filter((part) => !/^(?:\d+[smhd]|reason:.*)$/i.test(part)).join(' ');
    const isStaff = message.member.permissions.has(PermissionsBitField.Flags.ModerateMembers)
      || message.member.permissions.has(PermissionsBitField.Flags.KickMembers)
      || message.member.permissions.has(PermissionsBitField.Flags.BanMembers)
      || message.member.permissions.has(PermissionsBitField.Flags.ManageGuild);

    if (!isStaff) {
      await message.reply('You need a moderation permission to use moderator commands.');
      return;
    }

    const member = await resolveTargetMember(message, target);
    if (!member) {
      await message.reply('Tag a user or reply to their message to target them.');
      return;
    }

    const reasonTokens = modifierArgs.filter((part) => part.toLowerCase().startsWith('reason:'));
    const reason = reasonTokens.length > 0 ? reasonTokens[0].slice(6) : 'No reason provided';

    const moderatorAction = action || 'help';

    if (moderatorAction === 'kick') {
      await member.kick(reason);
      await message.reply(`Kicked ${member.user.tag}.`);
      return;
    }

    if (moderatorAction === 'ban') {
      await member.ban({ reason });
      await message.reply(`Banned ${member.user.tag}.`);
      return;
    }

    if (moderatorAction === 'timeout') {
      const durationToken = modifierArgs.find((part) => /^\d+[smhd]$/i.test(part));
      const timeoutMs = parseDuration(durationToken || '10m') || 10 * 60 * 1000;
      await member.timeout(timeoutMs, reason);
      await message.reply(`Timed out ${member.user.tag} for ${Math.round(timeoutMs / 1000)} seconds.`);
      return;
    }

    if (moderatorAction === 'mute') {
      await member.timeout(10 * 60 * 1000, reason);
      await message.reply(`Muted ${member.user.tag} for 10 minutes.`);
      return;
    }

    if (moderatorAction === 'purge') {
      if (!message.member.permissions.has(PermissionsBitField.Flags.ManageMessages)) {
        await message.reply('You need the Manage Messages permission to purge messages.');
        return;
      }

      const purgeAmount = parsePurgeAmount(modifierArgs.find((part) => /^\d+$/.test(part)) || '50');
      if (!purgeAmount) {
        await message.reply('Choose a purge amount between 1 and 500.');
        return;
      }

      const deleted = await message.channel.bulkDelete(purgeAmount, true).catch(() => null);
      await message.reply(deleted ? `Purged ${deleted.size} messages.` : 'I could not purge that many messages in this channel.');
      return;
    }

    if (moderatorAction === 'jail') {
      await message.reply(`Jail action for ${member.user.tag} is not configured in this bot yet. Use a server jail role manually.`);
      return;
    }

    if (moderatorAction === 'av' || moderatorAction === 'avatar') {
      const embed = buildUserCardEmbed(member, 'avatar');
      await message.reply({ embeds: [embed] });
      return;
    }

    if (moderatorAction === 'cover') {
      const embed = buildUserCardEmbed(member, 'cover');
      await message.reply({ embeds: [embed] });
      return;
    }

    if (moderatorAction === 'help') {
      await message.reply('Use `!mod kick @user`, `!mod ban @user`, `!mod timeout @user 10m`, `!mod mute @user`, `!mod purge 50`, `!mod jail @user`, `!mod av @user`, or `!mod cover @user`. You can also reply to a message to target the author.');
      return;
    }

    await message.reply('Unknown moderator action. Try `kick`, `ban`, `timeout`, `mute`, `purge`, `jail`, `av`, or `cover`.');
    return;
  }

  if (command?.name === 'setlogs') {
    if (!message.member.permissions.has(PermissionsBitField.Flags.ManageGuild)) {
      await message.reply('You need the Manage Server permission to change the log channel.');
      return;
    }

    const rawTarget = command.args[0];
    if (!rawTarget || rawTarget.toLowerCase() === 'off') {
      logChannelStore.setLogChannel(message.guild.id, null);
      await message.reply('Log channel cleared.');
      return;
    }

    const channelMatch = rawTarget.match(/<#(\d+)>|^(\d+)$/);
    const requestedChannelId = channelMatch?.[1] || channelMatch?.[2] || null;
    if (!requestedChannelId) {
      await message.reply('Use a channel mention or channel ID, for example `!set logs #mod-logs` or `!set logs off`.');
      return;
    }

    const channel = message.guild.channels.cache.get(requestedChannelId) || await message.guild.channels.fetch(requestedChannelId).catch(() => null);
    if (!channel || !channel.isTextBased?.()) {
      await message.reply('The target must be a text channel.');
      return;
    }

    logChannelStore.setLogChannel(message.guild.id, channel.id);
    await message.reply(`Log channel updated to <#${channel.id}>.`);
    return;
  }

  if (command?.name === 'autoresponder') {
    if (!message.member.permissions.has(PermissionsBitField.Flags.ManageGuild)) {
      await message.reply('You need the Manage Server permission to manage autoresponders.');
      return;
    }

    const autoresponderCommand = autoresponder.parseCommand(message.content, prefix);
    if (!autoresponderCommand) {
      await message.reply(`Use \`${prefix}autoresponder add <trigger> | <response>\`, \`${prefix}autoresponder remove <trigger>\`, or \`${prefix}autoresponder list\`.`);
      return;
    }

    if (autoresponderCommand.action === 'add') {
      const entry = autoresponder.parseAddPayload(autoresponderCommand.payload);
      if (!entry) {
        await message.reply('Provide a trigger and response separated by `|`.');
        return;
      }

      if (!autoresponderStore.add(message.guild.id, entry.trigger, entry.response)) {
        await message.reply('An autoresponder already exists for that trigger.');
        return;
      }

      await message.reply(`Autoresponder added for \`${entry.trigger}\`.`);
      return;
    }

    if (autoresponderCommand.action === 'remove') {
      const trigger = autoresponderCommand.payload;
      if (!autoresponder.isValidTrigger(trigger)) {
        await message.reply('Provide the trigger to remove (up to 100 characters).');
        return;
      }

      if (!autoresponderStore.remove(message.guild.id, trigger)) {
        await message.reply('No autoresponder was found for that trigger.');
        return;
      }

      await message.reply(`Autoresponder removed for \`${trigger}\`.`);
      return;
    }

    const entries = autoresponderStore.list(message.guild.id);
    if (entries.length === 0) {
      await message.reply('There are no autoresponders configured for this server.');
      return;
    }

    const triggerList = entries.slice(0, 20).map(({ trigger }) => `- ${trigger}`).join('\n');
    const remainingCount = entries.length - 20;
    const moreText = remainingCount > 0 ? `\n...and ${remainingCount} more.` : '';
    await message.reply(`Configured triggers:\n${triggerList}${moreText}`);
    return;
  }

  if (command?.name === 'antinuke') {
    if (!message.member.permissions.has(PermissionsBitField.Flags.ManageGuild)) {
      await message.reply('You need the Manage Server permission to configure antinuke.');
      return;
    }

    const antinukeCommand = antinuke.parseCommand(message.content, prefix);
    if (!antinukeCommand) {
      await message.reply(`Use \`${prefix}antinuke enable|disable|status\`, \`${prefix}antinuke set punishment timeout|kick|ban|none\`, or \`${prefix}antinuke whitelist role|category|channel add|remove|list [mention or ID]\`.`);
      return;
    }

    if (antinukeCommand.action === 'enable' || antinukeCommand.action === 'disable') {
      antinukeStore.setEnabled(message.guild.id, antinukeCommand.action === 'enable');
      await message.reply(`Antinuke is now ${antinukeCommand.action === 'enable' ? 'enabled' : 'disabled'}.`);
      return;
    }

    if (antinukeCommand.action === 'set-punishment') {
      antinukeStore.setPunishment(message.guild.id, antinukeCommand.punishment);
      await message.reply(`Antinuke punishment set to \`${antinukeCommand.punishment}\`.`);
      return;
    }

    if (antinukeCommand.action === 'status') {
      const config = antinukeStore.getConfig(message.guild.id);
      const punishment = config.punishment === 'timeout' ? '10-minute timeout' : config.punishment;
      await message.reply(`Antinuke is ${config.enabled ? 'enabled' : 'disabled'}. Threshold: 3 matching actions within 10 seconds; punishment: ${punishment}.`);
      return;
    }

    if (antinukeCommand.action === 'list') {
      const config = antinukeStore.getConfig(message.guild.id);
      const formatIds = (ids) => ids.length ? ids.map((id) => `\`${id}\``).join(', ') : 'none';
      await message.reply([
        `Whitelisted roles (actors): ${formatIds(config.roleIds)}`,
        `Whitelisted categories: ${formatIds(config.categoryIds)}`,
        `Whitelisted channels: ${formatIds(config.channelIds)}`,
      ].join('\n'));
      return;
    }

    if (antinukeCommand.action === 'whitelist') {
      if (antinukeCommand.operation === 'list') {
        const config = antinukeStore.getConfig(message.guild.id);
        const ids = config[`${antinukeCommand.targetType}Ids`];
        await message.reply(ids.length
          ? `Whitelisted ${antinukeCommand.targetType}s: ${ids.map((id) => `\`${id}\``).join(', ')}`
          : `No ${antinukeCommand.targetType}s are whitelisted.`);
        return;
      }

      const targetId = antinuke.parseSnowflake(antinukeCommand.target);
      if (!targetId) {
        await message.reply('Provide a valid role, category, or channel mention or ID.');
        return;
      }

      if (antinukeCommand.targetType === 'role' && !message.guild.roles.cache.has(targetId)) {
        await message.reply('That role was not found in this server.');
        return;
      }

      if (antinukeCommand.targetType === 'category') {
        const category = message.guild.channels.cache.get(targetId);
        if (!category || category.type !== 4) {
          await message.reply('That category was not found in this server.');
          return;
        }
      }

      if (antinukeCommand.targetType === 'channel') {
        const channel = message.guild.channels.cache.get(targetId);
        if (!channel || channel.type === 4) {
          await message.reply('That channel was not found in this server.');
          return;
        }
      }

      const changed = antinukeStore.updateWhitelist(
        message.guild.id,
        antinukeCommand.targetType,
        targetId,
        antinukeCommand.operation === 'add',
      );
      await message.reply(changed
        ? `Whitelisted ${antinukeCommand.targetType} \`${targetId}\`.`
        : `${antinukeCommand.targetType} \`${targetId}\` was already in that state.`);
      return;
    }
  }

  if (command?.name === 'welcome' || welcomeCommand) {
    if (!message.member.permissions.has(PermissionsBitField.Flags.ManageGuild)) {
      await message.reply('You need the Manage Server permission to configure welcome messages.');
      return;
    }

    if (!welcomeCommand) {
      await message.reply(welcome.help(prefix));
      return;
    }

    if (welcomeCommand.action === 'channel') {
      const channelId = welcome.parseChannelId(welcomeCommand.value);
      const channel = channelId && message.guild.channels.cache.get(channelId);
      if (!channel || !channel.isTextBased() || channel.isThread()) {
        await message.reply('Choose a text channel from this server.');
        return;
      }

      welcomeStore.update(message.guild.id, { channelId, enabled: true });
      await message.reply(`Welcome messages are enabled in <#${channelId}>.`);
      return;
    }

    if (welcomeCommand.action === 'message') {
      if (welcomeCommand.value.length > 2000) {
        await message.reply('Welcome messages must be 2,000 characters or fewer.');
        return;
      }
      welcomeStore.update(message.guild.id, { message: welcomeCommand.value });
      await message.reply('Welcome message updated.');
      return;
    }

    if (welcomeCommand.action === 'embed-edit') {
      const update = welcome.parseEmbedEdit(welcomeCommand.value);
      if (!update) {
        await message.reply(`Use \`${prefix}welcome embed edit title: Welcome! | description: Say hello! | color: #36a2eb\`. Fields: title, description, color, footer, author, image, thumbnail. Use \`clear\` as a value to remove a field.`);
        return;
      }
      welcomeStore.update(message.guild.id, { embed: update });
      await message.reply('Welcome embed updated.');
      return;
    }

    if (welcomeCommand.action === 'embed-clear') {
      const update = welcome.parseEmbedUpdate('clear', welcomeCommand.field);
      welcomeStore.update(message.guild.id, { embed: update });
      await message.reply(welcomeCommand.field ? `Welcome embed field \`${welcomeCommand.field}\` cleared.` : 'Welcome embed cleared.');
      return;
    }

    if (welcomeCommand.action === 'status') {
      const config = welcomeStore.getConfig(message.guild.id);
      const channelText = config.channelId ? `<#${config.channelId}>` : 'not set';
      await message.reply(`Welcome messages are ${config.enabled ? 'enabled' : 'disabled'}; channel: ${channelText}.`);
      return;
    }

    if (welcomeCommand.action === 'disable') {
      welcomeStore.update(message.guild.id, { enabled: false });
      await message.reply('Welcome messages are disabled.');
      return;
    }

    if (welcomeCommand.action === 'preview') {
      const config = welcomeStore.getConfig(message.guild.id);
      const payload = welcome.buildPayload(config, message.member);
      if (!payload.content && payload.embeds.length === 0) {
        await message.reply('Set a welcome message or embed content before previewing.');
        return;
      }
      await message.channel.send(payload);
      return;
    }
  }

  if (command) {
    return;
  }

  const response = autoresponderStore.find(message.guild.id, message.content);
  if (response) {
    await message.reply(response);
  }
});

client.on('guildMemberAdd', async (member) => {
  const config = welcomeStore.getConfig(member.guild.id);
  if (!config.enabled || !config.channelId) {
    return;
  }

  const channel = member.guild.channels.cache.get(config.channelId);
  if (!channel?.isTextBased() || channel.isThread()) {
    return;
  }

  const payload = welcome.buildPayload(config, member);
  if (!payload.content && payload.embeds.length === 0) {
    return;
  }

  try {
    await channel.send(payload);
  } catch (error) {
    console.error(`Could not send welcome message in guild ${member.guild.id}:`, error.message);
  }
});

antinuke.attach(client, antinukeStore);

client.login(token);