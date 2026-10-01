const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelType,
  EmbedBuilder,
  ModalBuilder,
  PermissionFlagsBits,
  TextInputBuilder,
  TextInputStyle,
} = require('discord.js');

const SETUP_MODAL_ID = 'ticket:setup';
const CREATE_BUTTON_ID = 'ticket:create';
const CLOSE_BUTTON_ID = 'ticket:close';

function buildSetupModal(channelId, categoryId, supportRoleId) {
  return new ModalBuilder()
    .setCustomId(`${SETUP_MODAL_ID}:${channelId}:${categoryId || '-'}:${supportRoleId || '-'}`)
    .setTitle('Set Up Ticket Panel')
    .addComponents(
      new ActionRowBuilder().addComponents(new TextInputBuilder()
        .setCustomId('title')
        .setLabel('Panel title')
        .setStyle(TextInputStyle.Short)
        .setMaxLength(256)
        .setRequired(true)
        .setValue('Support Tickets')),
      new ActionRowBuilder().addComponents(new TextInputBuilder()
        .setCustomId('description')
        .setLabel('Panel description')
        .setStyle(TextInputStyle.Paragraph)
        .setMaxLength(4000)
        .setRequired(true)
        .setValue('Select a button below to create a private support ticket.')),
    );
}

function buildPanel(config) {
  const panel = new EmbedBuilder()
    .setColor(0x202225)
    .setTitle(config.panelTitle)
    .setDescription(config.panelDescription);
  const buttonLabels = config.buttonLabels?.length ? config.buttonLabels : ['Create Ticket'];
  const components = buttonLabels.slice(0, 5).map((label, index) => (
    new ButtonBuilder()
      .setCustomId(`${CREATE_BUTTON_ID}:${index}`)
      .setLabel(label.slice(0, 80))
      .setStyle(ButtonStyle.Primary)
  ));
  return {
    embeds: [panel],
    components: [new ActionRowBuilder().addComponents(...components)],
  };
}

function buildTicketWelcome(user) {
  return {
    embeds: [new EmbedBuilder()
      .setColor(0x202225)
      .setTitle('Ticket Opened')
      .setDescription(`<@${user.id}>, staff will be with you soon. Describe what you need help with here.`)],
    components: [new ActionRowBuilder().addComponents(new ButtonBuilder()
      .setCustomId(CLOSE_BUTTON_ID)
      .setLabel('Close Ticket')
      .setStyle(ButtonStyle.Danger))],
    allowedMentions: { parse: [], users: [user.id] },
  };
}

function ticketChannelName(user) {
  const username = (user.username || 'user')
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 70) || 'user';
  return `ticket-${username}-${user.id.slice(-4)}`.slice(0, 100);
}

function isTicketInteraction(interaction) {
  return Boolean(
    (interaction.isButton?.() && (interaction.customId.startsWith(CREATE_BUTTON_ID) || interaction.customId === CLOSE_BUTTON_ID))
    || (interaction.isModalSubmit?.() && interaction.customId.startsWith(`${SETUP_MODAL_ID}:`)),
  );
}

function canManageTickets(interaction, config) {
  return Boolean(
    interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)
    || (config.supportRoleId && interaction.member?.roles?.cache?.has(config.supportRoleId)),
  );
}

async function handleSetupCommand(interaction) {
  if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) {
    await interaction.reply({ content: 'You need the Manage Server permission to set up tickets.', ephemeral: true });
    return;
  }
  if (!interaction.guild.members.me?.permissions.has(PermissionFlagsBits.ManageChannels)
    || !interaction.guild.members.me?.permissions.has(PermissionFlagsBits.ManageRoles)) {
    await interaction.reply({ content: 'I need Manage Channels and Manage Roles to create private ticket channels.', ephemeral: true });
    return;
  }
  const channel = interaction.options.getChannel('channel') || interaction.channel;
  if (!channel?.isTextBased?.() || channel.isThread?.()) {
    await interaction.reply({ content: 'Run this in a text channel or choose a text panel channel.', ephemeral: true });
    return;
  }
  const category = interaction.options.getChannel('category');
  const supportRole = interaction.options.getRole('support-role');
  await interaction.showModal(buildSetupModal(channel.id, category?.id, supportRole?.id));
}

async function handleSetupSubmit(interaction, store) {
  if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) {
    await interaction.reply({ content: 'You need the Manage Server permission to set up tickets.', ephemeral: true });
    return;
  }
  const [, , channelId, categoryId, supportRoleId] = interaction.customId.split(':');
  const channel = interaction.guild.channels.cache.get(channelId)
    || await interaction.guild.channels.fetch(channelId).catch(() => null);
  if (!channel?.isTextBased?.() || channel.isThread?.()) {
    await interaction.reply({ content: 'The selected ticket panel channel is no longer available.', ephemeral: true });
    return;
  }

  const panelTitle = interaction.fields.getTextInputValue('title').trim();
  const panelDescription = interaction.fields.getTextInputValue('description').trim();
  if (!panelTitle || !panelDescription) {
    await interaction.reply({ content: 'Panel title and description cannot be empty.', ephemeral: true });
    return;
  }
  const previous = store.getConfig(interaction.guildId);
  const panelMessage = await channel.send(buildPanel({ ...previous, panelTitle, panelDescription }));
  store.setConfig(interaction.guildId, {
    panelChannelId: channel.id,
    panelMessageId: panelMessage.id,
    panelTitle,
    panelDescription,
    categoryId: categoryId === '-' ? null : categoryId,
    supportRoleId: supportRoleId === '-' ? null : supportRoleId,
  });
  if (previous.panelChannelId && previous.panelMessageId) {
    const previousChannel = interaction.guild.channels.cache.get(previous.panelChannelId);
    const previousMessage = previousChannel
      ? await previousChannel.messages.fetch(previous.panelMessageId).catch(() => null)
      : null;
    await previousMessage?.delete().catch(() => null);
  }
  await interaction.reply({ content: `Ticket panel posted in <#${channel.id}>.`, ephemeral: true });
}

async function handleCreateTicket(interaction, store) {
  const config = store.getConfig(interaction.guildId);
  if (!config.panelMessageId
    || interaction.channelId !== config.panelChannelId
    || interaction.message.id !== config.panelMessageId) {
    await interaction.reply({ content: 'This ticket panel is no longer active.', ephemeral: true });
    return;
  }
  if (!interaction.guild.members.me?.permissions.has(PermissionFlagsBits.ManageChannels)) {
    await interaction.reply({ content: 'I need Manage Channels to create your private ticket.', ephemeral: true });
    return;
  }

  const openTickets = { ...(config.openTickets || {}) };
  const existingId = openTickets[interaction.user.id];
  if (existingId) {
    const existingChannel = await interaction.guild.channels.fetch(existingId).catch(() => null);
    if (existingChannel) {
      await interaction.reply({ content: `You already have an open ticket: <#${existingId}>.`, ephemeral: true });
      return;
    }
    delete openTickets[interaction.user.id];
    store.setConfig(interaction.guildId, { openTickets });
  }

  await interaction.deferReply({ ephemeral: true });
  const permissions = [
    { id: interaction.guildId, deny: [PermissionFlagsBits.ViewChannel] },
    {
      id: interaction.user.id,
      allow: [
        PermissionFlagsBits.ViewChannel,
        PermissionFlagsBits.SendMessages,
        PermissionFlagsBits.ReadMessageHistory,
        PermissionFlagsBits.AttachFiles,
        PermissionFlagsBits.EmbedLinks,
      ],
    },
    {
      id: interaction.client.user.id,
      allow: [
        PermissionFlagsBits.ViewChannel,
        PermissionFlagsBits.SendMessages,
        PermissionFlagsBits.ReadMessageHistory,
        PermissionFlagsBits.ManageChannels,
      ],
    },
  ];
  if (config.supportRoleId) {
    permissions.push({
      id: config.supportRoleId,
      allow: [
        PermissionFlagsBits.ViewChannel,
        PermissionFlagsBits.SendMessages,
        PermissionFlagsBits.ReadMessageHistory,
      ],
    });
  }

  const channel = await interaction.guild.channels.create({
    name: ticketChannelName(interaction.user),
    type: ChannelType.GuildText,
    ...(config.categoryId ? { parent: config.categoryId } : {}),
    permissionOverwrites: permissions,
    reason: `Support ticket opened by ${interaction.user.tag || interaction.user.id}`,
  });
  try {
    await channel.send(buildTicketWelcome(interaction.user));
    store.setConfig(interaction.guildId, {
      openTickets: { ...openTickets, [interaction.user.id]: channel.id },
    });
  } catch (error) {
    await channel.delete('Could not initialize ticket').catch(() => null);
    throw error;
  }
  await interaction.editReply({ content: `Your private ticket is ready: <#${channel.id}>.` });
}

async function handleCloseTicket(interaction, store) {
  const config = store.getConfig(interaction.guildId);
  const ownerId = Object.entries(config.openTickets || {})
    .find(([, channelId]) => channelId === interaction.channelId)?.[0];
  if (!ownerId || (ownerId !== interaction.user.id && !canManageTickets(interaction, config))) {
    await interaction.reply({ content: 'Only the ticket creator or configured support staff can close this ticket.', ephemeral: true });
    return;
  }
  await interaction.deferReply({ ephemeral: true });
  await interaction.channel.delete(`Ticket closed by ${interaction.user.tag || interaction.user.id}`);
  const openTickets = { ...config.openTickets };
  delete openTickets[ownerId];
  store.setConfig(interaction.guildId, { openTickets });
}

async function handleInteraction(interaction, store) {
  if (!isTicketInteraction(interaction)) return false;
  if (interaction.isModalSubmit()) {
    await handleSetupSubmit(interaction, store);
    return true;
  }
  if (interaction.customId.startsWith(CREATE_BUTTON_ID)) {
    await handleCreateTicket(interaction, store);
    return true;
  }
  if (interaction.customId === CLOSE_BUTTON_ID) {
    await handleCloseTicket(interaction, store);
    return true;
  }
  return false;
}

module.exports = {
  SETUP_MODAL_ID,
  CREATE_BUTTON_ID,
  CLOSE_BUTTON_ID,
  buildSetupModal,
  buildPanel,
  buildTicketWelcome,
  isTicketInteraction,
  handleSetupCommand,
  handleInteraction,
  ticketChannelName,
};