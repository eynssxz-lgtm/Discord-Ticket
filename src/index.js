require('dotenv').config();

const {
  Client,
  GatewayIntentBits,
  PermissionsBitField,
  REST,
  Routes,
} = require('discord.js');
const logChannelStore = require('./logChannelStore');
const autoresponderStore = require('./autoresponderStore');
const antinuke = require('./antinuke');
const antinukeStore = require('./antinukeStore');
const welcome = require('./welcome');
const welcomeStore = require('./welcomeStore');
const welcomeInteractions = require('./welcomeInteractions');
const commandInteractions = require('./commandInteractions');
const commandHandler = require('./commandHandler');
const tempVoice = require('./tempVoice');

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

async function registerGuildCommands(guild) {
  if (!applicationId) return;
  const rest = new REST({ version: '10' }).setToken(token);
  try {
    await rest.put(Routes.applicationGuildCommands(applicationId, guild.id), {
      body: [...welcomeInteractions.getCommands(), ...commandInteractions.getCommands()],
    });
    console.log(`Registered slash commands in guild ${guild.id}`);
  } catch (error) {
    console.error(`Could not register slash commands in guild ${guild.id}:`, error.message);
  }
}

client.once('ready', async () => {
  console.log(`SINCLAIR is online as ${client.user.tag}`);
  if (!applicationId) {
    console.warn('DISCORD_CLIENT_ID is missing; slash commands were not registered.');
    return;
  }
  await Promise.all(client.guilds.cache.map(registerGuildCommands));
});

client.on('guildCreate', registerGuildCommands);

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

  await tempVoice.handleVoiceStateUpdate(oldState, newState).catch((error) => {
    console.error(`Could not manage temporary voice channel in guild ${guild.id}:`, error.message);
  });

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

  const attachment = [...message.attachments.values()].find((item) => (
    item.contentType?.startsWith('image/')
    || /\.(png|jpe?g|gif|webp|bmp|svg)(\?.*)?$/i.test(item.url)
  ));
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
    try {
      if (await commandHandler(interaction)) return;
    } catch (error) {
      console.error(`Could not handle /${interaction.commandName}:`, error.message);
      const response = { content: 'The command could not be completed. Check my permissions and try again.', ephemeral: true };
      if (interaction.deferred || interaction.replied) await interaction.editReply(response);
      else await interaction.reply(response);
      return;
    }

    if (!['edit-embed', 'set-welcome-channel', 'set-welcome-message', 'welcome'].includes(interaction.commandName)) return;
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
    if (interaction.commandName === 'set-welcome-message') {
      const message = interaction.options.getString('message', true);
      welcomeStore.update(interaction.guildId, { message });
      await interaction.reply({ content: 'Welcome message updated.', ephemeral: true });
      return;
    }

    const action = interaction.options.getSubcommand();
    if (interaction.options.getSubcommandGroup(false) === 'embed') {
      if (action === 'edit') {
        await interaction.showModal(welcomeInteractions.buildEmbedModal(
          welcomeStore.getConfig(interaction.guildId).embed,
        ));
        return;
      }
      const field = interaction.options.getString('field');
      const update = welcome.parseEmbedUpdate('clear', field);
      welcomeStore.update(interaction.guildId, { embed: update });
      await interaction.reply({
        content: field ? `Welcome embed field \`${field}\` cleared.` : 'Welcome embed cleared.',
        ephemeral: true,
      });
      return;
    }
    if (action === 'channel') {
      const channel = interaction.options.getChannel('channel', true);
      welcomeStore.update(interaction.guildId, { channelId: channel.id, enabled: true });
      await interaction.reply({ content: `Welcome messages are enabled in <#${channel.id}>.`, ephemeral: true });
      return;
    }
    if (action === 'message') {
      const message = interaction.options.getString('message', true);
      welcomeStore.update(interaction.guildId, { message });
      await interaction.reply({ content: 'Welcome message updated.', ephemeral: true });
      return;
    }
    if (action === 'disable') {
      welcomeStore.update(interaction.guildId, { enabled: false });
      await interaction.reply({ content: 'Welcome messages are disabled.', ephemeral: true });
      return;
    }
    if (action === 'status') {
      const config = welcomeStore.getConfig(interaction.guildId);
      await interaction.reply({
        content: `Welcome messages are ${config.enabled ? 'enabled' : 'disabled'}; channel: ${config.channelId ? `<#${config.channelId}>` : 'not set'}.`,
        ephemeral: true,
      });
      return;
    }
    if (action === 'preview') {
      const payload = welcome.buildPayload(welcomeStore.getConfig(interaction.guildId), interaction.member);
      if (!payload.content && payload.embeds.length === 0) {
        await interaction.reply({ content: 'Set a welcome message or embed content before previewing.', ephemeral: true });
        return;
      }
      await interaction.channel.send(payload);
      await interaction.reply({ content: 'Welcome preview sent.', ephemeral: true });
    }
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
  if (message.author.bot || !message.guild) return;
  const response = autoresponderStore.find(message.guild.id, message.content);
  if (response) await message.reply(response);
});

client.on('guildMemberAdd', async (member) => {
  const config = welcomeStore.getConfig(member.guild.id);
  if (!config.enabled || !config.channelId) return;
  const channel = member.guild.channels.cache.get(config.channelId);
  if (!channel?.isTextBased() || channel.isThread()) return;

  const payload = welcome.buildPayload(config, member);
  if (!payload.content && payload.embeds.length === 0) return;
  try {
    await channel.send(payload);
  } catch (error) {
    console.error(`Could not send welcome message in guild ${member.guild.id}:`, error.message);
  }
});

antinuke.attach(client, antinukeStore);

client.login(token);