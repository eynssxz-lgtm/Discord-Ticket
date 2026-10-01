const test = require('node:test');
const assert = require('node:assert/strict');
const { ChannelType, PermissionFlagsBits } = require('discord.js');
const {
  CREATE_BUTTON_ID,
  CLOSE_BUTTON_ID,
  buildPanel,
  handleSetupCommand,
  handleInteraction,
  ticketChannelName,
} = require('../src/tickets');

function createStore(initial = {}) {
  const config = {
    panelChannelId: 'panel-channel',
    panelMessageId: 'panel-message',
    categoryId: 'ticket-category',
    supportRoleId: 'support-role',
    panelTitle: 'Support',
    panelDescription: 'Open a ticket.',
    buttonLabels: ['Create Ticket'],
    openTickets: {},
    ...initial,
  };
  return {
    config,
    getConfig: () => ({ ...config, openTickets: { ...config.openTickets } }),
    setConfig: (_guildId, update) => {
      Object.assign(config, update);
      if (Object.hasOwn(update, 'openTickets')) config.openTickets = { ...update.openTickets };
      return config;
    },
  };
}

function createGuild({ panelChannel, ticketChannel } = {}) {
  const channels = new Map();
  if (panelChannel) channels.set(panelChannel.id, panelChannel);
  if (ticketChannel) channels.set(ticketChannel.id, ticketChannel);
  const created = [];
  return {
    created,
    guild: {
      id: 'guild-1',
      channels: {
        cache: channels,
        fetch: async (id) => channels.get(id) || null,
        create: async (options) => {
          created.push(options);
          const channel = {
            id: 'ticket-channel',
            name: options.name,
            send: async (payload) => created.push(payload),
            delete: async (reason) => created.push(['deleted', reason]),
          };
          channels.set(channel.id, channel);
          return channel;
        },
      },
      members: { me: { permissions: { has: () => true } } },
    },
  };
}

function createInteraction(guild, overrides = {}) {
  const replies = [];
  return {
    replies,
    guild,
    guildId: guild.id,
    channelId: 'panel-channel',
    channel: { id: 'panel-channel' },
    user: { id: 'user-1234', username: 'Casey', tag: 'Casey#1234' },
    client: { user: { id: 'bot-1' } },
    member: { roles: { cache: new Map([['support-role', {}]]) } },
    memberPermissions: { has: () => true },
    message: { id: 'panel-message' },
    isButton: () => true,
    isModalSubmit: () => false,
    options: {
      getChannel: (name) => (name === 'channel' ? null : null),
      getRole: () => null,
    },
    reply: async (payload) => replies.push(['reply', payload]),
    deferReply: async (payload) => replies.push(['defer', payload]),
    editReply: async (payload) => replies.push(['edit', payload]),
    showModal: async (payload) => replies.push(['modal', payload]),
    ...overrides,
  };
}

test('builds a ticket panel with title, description, and create button', () => {
  const panel = buildPanel({
    panelTitle: 'Get help',
    panelDescription: 'Open a private ticket with staff.',
    buttonLabels: ['Create Ticket'],
  });
  assert.equal(panel.embeds[0].data.title, 'Get help');
  assert.equal(panel.embeds[0].data.description, 'Open a private ticket with staff.');
  assert.equal(panel.components[0].components[0].data.custom_id, `${CREATE_BUTTON_ID}:0`);
});

test('setup command opens title and description modal for selected panel options', async () => {
  const panelChannel = { id: 'panel-channel', isTextBased: () => true, isThread: () => false };
  const { guild } = createGuild({ panelChannel });
  const interaction = createInteraction(guild, {
    options: {
      getChannel: (name) => (name === 'channel' ? panelChannel : { id: 'ticket-category' }),
      getRole: () => ({ id: 'support-role' }),
    },
  });

  await handleSetupCommand(interaction);

  const [type, modalBuilder] = interaction.replies[0];
  const modal = modalBuilder.toJSON();
  assert.equal(type, 'modal');
  assert.equal(modal.title, 'Set Up Ticket Panel');
  assert.equal(modal.components.length, 2);
  assert.match(modal.custom_id, /panel-channel:ticket-category:support-role/);
});

test('create button opens a private ticket and stores the user-channel association', async () => {
  const { guild, created } = createGuild();
  const store = createStore();
  const interaction = createInteraction(guild);
  interaction.customId = `${CREATE_BUTTON_ID}:0`;
  interaction.deferReply = async (payload) => interaction.replies.push(['defer', payload]);
  interaction.editReply = async (payload) => interaction.replies.push(['edit', payload]);

  await handleInteraction(interaction, store);

  const createOptions = created[0];
  assert.equal(createOptions.type, ChannelType.GuildText);
  assert.equal(createOptions.parent, 'ticket-category');
  assert.ok(createOptions.permissionOverwrites.some(({ id, deny }) => (
    id === guild.id && deny.includes(PermissionFlagsBits.ViewChannel)
  )));
  assert.ok(createOptions.permissionOverwrites.some(({ id, allow }) => (
    id === interaction.user.id && allow.includes(PermissionFlagsBits.SendMessages)
  )));
  assert.ok(createOptions.permissionOverwrites.some(({ id }) => id === 'support-role'));
  assert.equal(store.config.openTickets[interaction.user.id], 'ticket-channel');
  assert.equal(created[1].embeds[0].data.title, 'Ticket Opened');
  assert.equal(created[1].components[0].components[0].data.custom_id, CLOSE_BUTTON_ID);
  assert.match(interaction.replies.at(-1)[1].content, /private ticket is ready/);
});

test('prevents a user from creating a second active ticket', async () => {
  const existing = { id: 'existing-ticket' };
  const { guild } = createGuild({ ticketChannel: existing });
  const store = createStore({ openTickets: { 'user-1234': 'existing-ticket' } });
  const interaction = createInteraction(guild);
  interaction.customId = `${CREATE_BUTTON_ID}:0`;

  await handleInteraction(interaction, store);

  assert.match(interaction.replies[0][1].content, /already have an open ticket/);
});

test('allows the ticket owner or support staff to close the ticket', async () => {
  const { guild, created } = createGuild();
  const store = createStore({ openTickets: { 'user-1234': 'ticket-channel' } });
  const channel = { id: 'ticket-channel', delete: async (reason) => created.push(['deleted', reason]) };
  const interaction = createInteraction(guild, { channel, channelId: channel.id });
  interaction.customId = CLOSE_BUTTON_ID;

  await handleInteraction(interaction, store);

  assert.equal(created[0][0], 'deleted');
  assert.equal(store.config.openTickets['user-1234'], undefined);
  assert.equal(interaction.replies[0][0], 'defer');
});

test('creates a stable safe ticket channel name', () => {
  assert.equal(ticketChannelName({ username: 'Casey User', id: 'user-1234' }), 'ticket-casey-user-1234');
});