const test = require('node:test');
const assert = require('node:assert/strict');
const { parseChannelId, handleVoiceStateUpdate } = require('../src/tempVoice');

test('parses voice channel mentions and IDs', () => {
  assert.equal(parseChannelId('<#123>'), '123');
  assert.equal(parseChannelId('123'), '123');
  assert.equal(parseChannelId('nope'), null);
});

test('creates and moves a member into a temporary voice channel', async () => {
  const operations = [];
  let channel;
  const guild = {
    id: 'guild-1',
    channels: {
      create: async (options) => {
        operations.push(['create', options]);
        return channel;
      },
    },
  };
  channel = {
    id: 'temp-1',
    guild,
    userLimit: 0,
    permissionOverwrites: { cache: new Map() },
    send: async (payload) => {
      operations.push(['panel', payload]);
      return { id: 'panel-1' };
    },
  };
  const store = {
    getConfig: () => ({ triggerChannelId: 'trigger', temporaryChannelIds: [] }),
    isTemporaryChannel: () => false,
    addTemporaryChannel: (...args) => operations.push(['add', ...args]),
    removeTemporaryChannel: (...args) => operations.push(['remove', ...args]),
    setControlMessageId: (...args) => operations.push(['panel-id', ...args]),
  };
  const member = {
    id: 'member-1',
    user: { bot: false },
    displayName: 'Casey',
    voice: { setChannel: async (target) => operations.push(['move', target.id]) },
  };
  const trigger = { id: 'trigger', parentId: 'category-1' };

  await handleVoiceStateUpdate(
    { guild, channelId: null },
    { guild, member, channelId: 'trigger', channel: trigger },
    store,
  );

  assert.deepEqual(operations.slice(0, 3), [
    ['create', { name: "Casey's room", type: 2, parent: 'category-1' }],
    ['add', 'guild-1', 'temp-1', 'member-1'],
    ['move', 'temp-1'],
  ]);
  assert.deepEqual(operations.map(([operation]) => operation), ['create', 'add', 'move', 'panel', 'panel-id']);
  assert.equal(operations[3][1].embeds.length, 1);
  assert.equal(operations[3][1].components.length, 2);
  assert.deepEqual(operations[4], ['panel-id', 'guild-1', 'temp-1', 'panel-1']);
});

test('deletes an empty temporary channel after its last member leaves', async () => {
  const operations = [];
  const oldChannel = {
    members: { size: 0 },
    delete: async (reason) => operations.push(['delete', reason]),
  };
  const store = {
    getConfig: () => ({ triggerChannelId: 'trigger', temporaryChannelIds: [] }),
    isTemporaryChannel: () => true,
    addTemporaryChannel: () => assert.fail('should not create a channel'),
    removeTemporaryChannel: (...args) => operations.push(['remove', ...args]),
  };
  const guild = { id: 'guild-1' };
  const member = { user: { bot: false } };

  await handleVoiceStateUpdate(
    { guild, member, channelId: 'temp-1', channel: oldChannel },
    { guild, member, channelId: null },
    store,
  );

  assert.deepEqual(operations, [
    ['delete', 'Temporary voice channel is empty'],
    ['remove', 'guild-1', 'temp-1'],
  ]);
});