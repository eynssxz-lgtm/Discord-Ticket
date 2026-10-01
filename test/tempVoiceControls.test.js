const test = require('node:test');
const assert = require('node:assert/strict');
const { PermissionsBitField } = require('discord.js');
const {
  BUTTON_IDS,
  buildControlPanel,
  handleControlInteraction,
} = require('../src/tempVoiceControls');

function createFixture({ ownerId = 'owner-1', actorId = ownerId, members = [ownerId], manager = false } = {}) {
  const calls = [];
  const denied = new Map();
  const deniedBits = new Map();
  const channel = {
    id: 'voice-1',
    name: 'Temporary room',
    guild: { id: 'guild-1' },
    members: new Map(members.map((id) => [id, { id }])),
    permissionOverwrites: {
      cache: denied,
      edit: async (id, permissions, options) => {
        calls.push(['overwrite', id, permissions, options]);
        const values = deniedBits.get(id) || new Set();
        for (const [key, value] of Object.entries(permissions)) {
          const flag = PermissionsBitField.Flags[key];
          if (value === false) values.add(flag);
          if (value === null || value === true) values.delete(flag);
        }
        deniedBits.set(id, values);
        denied.set(id, { deny: { has: (flag) => values.has(flag) } });
      },
    },
    userLimit: 0,
    createdTimestamp: 1_000,
    setName: async (name, reason) => calls.push(['rename', name, reason]),
    setUserLimit: async (limit, reason) => calls.push(['limit', limit, reason]),
    delete: async (reason) => calls.push(['delete', reason]),
    messages: {
      fetch: async (id) => ({ id, edit: async (payload) => calls.push(['panel-edit', payload]) }),
    },
  };
  const guild = {
    id: 'guild-1',
    channels: {
      cache: new Map([[channel.id, channel]]),
      fetch: async (id) => id === channel.id ? channel : null,
    },
  };
  channel.guild = guild;
  const store = {
    isTemporaryChannel: (guildId, channelId) => guildId === guild.id && channelId === channel.id,
    getTemporaryOwner: () => ownerId,
    setTemporaryOwner: (guildId, channelId, id) => {
      calls.push(['owner', guildId, channelId, id]);
      ownerId = id;
    },
    getControlMessageId: () => 'panel-1',
    removeTemporaryChannel: (...args) => calls.push(['remove', ...args]),
  };
  const replies = [];
  const interaction = {
    guildId: guild.id,
    channelId: channel.id,
    guild,
    user: { id: actorId, tag: `${actorId}#0001` },
    memberPermissions: { has: () => manager },
    isButton: () => true,
    isModalSubmit: () => false,
    reply: async (payload) => replies.push(payload),
    message: { id: 'panel-id', edit: async (payload) => calls.push(['panel-edit', payload]) },
    showModal: async (modal) => calls.push(['modal', modal.toJSON()]),
    deferReply: async (payload) => calls.push(['defer', payload]),
    editReply: async (content) => calls.push(['edit-reply', content]),
  };
  return { calls, channel, guild, store, interaction, replies };
}

test('builds a panel with all requested temporary voice controls', () => {
  const channel = {
    id: 'voice-1',
    guild: { id: 'guild-1' },
    userLimit: 4,
    permissionOverwrites: { cache: new Map() },
  };
  const panel = buildControlPanel(channel, 'owner-1');
  const buttons = panel.components.flatMap((row) => row.toJSON().components.map(({ custom_id: id }) => id));
  assert.deepEqual(buttons, [
    BUTTON_IDS.lock,
    BUTTON_IDS.unlock,
    BUTTON_IDS.hide,
    BUTTON_IDS.show,
    BUTTON_IDS.claim,
    BUTTON_IDS.rename,
    BUTTON_IDS.limit,
    BUTTON_IDS.info,
    BUTTON_IDS.delete,
  ]);
  assert.match(panel.embeds[0].data.description, /<#voice-1>/);
});

test('owner can lock and hide the room, while another member cannot', async () => {
  const fixture = createFixture();
  fixture.interaction.customId = BUTTON_IDS.lock;
  await handleControlInteraction(fixture.interaction, fixture.store);
  assert.deepEqual(fixture.calls[0].slice(0, 3), ['overwrite', 'guild-1', { Connect: false }]);

  fixture.calls.length = 0;
  fixture.interaction.customId = BUTTON_IDS.hide;
  await handleControlInteraction(fixture.interaction, fixture.store);
  assert.equal(fixture.calls[0][2].ViewChannel, false);
  assert.equal(fixture.calls[1][1], 'owner-1');
  assert.equal(fixture.calls[1][2].ViewChannel, true);

  const denied = createFixture({ actorId: 'other-1' });
  denied.interaction.customId = BUTTON_IDS.delete;
  await handleControlInteraction(denied.interaction, denied.store);
  assert.match(denied.replies[0].content, /Only this channel/);
  assert.equal(denied.calls.some(([action]) => action === 'delete'), false);
});

test('owner can unlock and show the room and inspect channel information', async () => {
  const fixture = createFixture();
  fixture.interaction.customId = BUTTON_IDS.unlock;
  await handleControlInteraction(fixture.interaction, fixture.store);
  assert.deepEqual(fixture.calls[0].slice(0, 3), ['overwrite', 'guild-1', { Connect: null }]);

  fixture.calls.length = 0;
  fixture.interaction.customId = BUTTON_IDS.show;
  await handleControlInteraction(fixture.interaction, fixture.store);
  assert.deepEqual(fixture.calls[0].slice(0, 3), ['overwrite', 'guild-1', { ViewChannel: null }]);

  fixture.interaction.customId = BUTTON_IDS.info;
  await handleControlInteraction(fixture.interaction, fixture.store);
  assert.match(fixture.replies.at(-1).embeds[0].data.title, /Information/);
  assert.match(fixture.replies.at(-1).embeds[0].data.fields[0].value, /voice-1/);
});

test('allows a member in an abandoned room to claim ownership', async () => {
  const fixture = createFixture({ ownerId: 'old-owner', actorId: 'new-owner', members: ['new-owner'] });
  fixture.interaction.customId = BUTTON_IDS.claim;
  await handleControlInteraction(fixture.interaction, fixture.store);
  assert.deepEqual(fixture.calls[0], ['owner', 'guild-1', 'voice-1', 'new-owner']);
  assert.match(fixture.replies[0].content, /now the owner/);
});

test('rename and user-limit controls open modals and apply validated values', async () => {
  const rename = createFixture();
  rename.interaction.customId = BUTTON_IDS.rename;
  await handleControlInteraction(rename.interaction, rename.store);
  assert.equal(rename.calls[0][0], 'modal');
  assert.match(rename.calls[0][1].custom_id, /:rename:voice-1:panel-id/);

  const renameSubmit = createFixture();
  renameSubmit.interaction.isButton = () => false;
  renameSubmit.interaction.isModalSubmit = () => true;
  renameSubmit.interaction.customId = 'tempvoice:modal:rename:voice-1:panel-1';
  renameSubmit.interaction.message = null;
  renameSubmit.interaction.fields = { getTextInputValue: () => 'New room name' };
  await handleControlInteraction(renameSubmit.interaction, renameSubmit.store);
  assert.equal(renameSubmit.calls.some(([action, name]) => action === 'rename' && name === 'New room name'), true);

  const limitSubmit = createFixture();
  limitSubmit.interaction.isButton = () => false;
  limitSubmit.interaction.isModalSubmit = () => true;
  limitSubmit.interaction.customId = 'tempvoice:modal:limit:voice-1:panel-1';
  limitSubmit.interaction.message = null;
  limitSubmit.interaction.fields = { getTextInputValue: () => '8' };
  await handleControlInteraction(limitSubmit.interaction, limitSubmit.store);
  assert.equal(limitSubmit.calls.some(([action, limit]) => action === 'limit' && limit === 8), true);
});

test('delete button removes the room and clears its temporary state', async () => {
  const fixture = createFixture();
  fixture.interaction.customId = BUTTON_IDS.delete;
  await handleControlInteraction(fixture.interaction, fixture.store);
  assert.equal(fixture.calls.some(([action]) => action === 'delete'), true);
  assert.deepEqual(fixture.calls.find(([action]) => action === 'remove'), ['remove', 'guild-1', 'voice-1']);
});