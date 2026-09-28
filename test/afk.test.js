const test = require('node:test');
const assert = require('node:assert/strict');
const { handleMessage } = require('../src/afk');

function makeStore(statuses) {
  return {
    get: (guildId, userId) => statuses.get(`${guildId}:${userId}`) || null,
    clear: (guildId, userId) => statuses.delete(`${guildId}:${userId}`),
  };
}

test('clears the author AFK status when they speak and notifies mentioned AFK users', async () => {
  const statuses = new Map([
    ['guild-1:author-1', { reason: 'Back soon' }],
    ['guild-1:mentioned-1', { reason: 'At lunch' }],
  ]);
  const sent = [];
  const message = {
    guild: { id: 'guild-1' },
    author: { id: 'author-1', username: 'Casey', bot: false },
    member: { displayName: 'Casey' },
    mentions: { users: new Map([
      ['author-1', { id: 'author-1' }],
      ['mentioned-1', { id: 'mentioned-1' }],
    ]) },
    channel: { send: async (payload) => sent.push(payload) },
  };

  await handleMessage(message, makeStore(statuses));

  assert.equal(statuses.has('guild-1:author-1'), false);
  assert.equal(sent.length, 1);
  assert.match(sent[0].content, /welcome back/);
  assert.match(sent[0].content, /<@mentioned-1> is AFK: At lunch/);
  assert.deepEqual(sent[0].allowedMentions, { parse: [] });
});

test('notifies when a message mentions an AFK user', async () => {
  const statuses = new Map([['guild-1:away-1', { reason: 'In a meeting' }]]);
  const sent = [];
  const message = {
    guild: { id: 'guild-1' },
    author: { id: 'author-1', username: 'Casey', bot: false },
    mentions: { users: new Map([['away-1', { id: 'away-1' }]]) },
    channel: { send: async (payload) => sent.push(payload) },
  };

  await handleMessage(message, makeStore(statuses));

  assert.equal(sent.length, 1);
  assert.match(sent[0].content, /is AFK: In a meeting/);
});

test('ignores bot messages and direct messages', async () => {
  const store = { get: () => assert.fail('should not query AFK status'), clear: () => {} };
  await handleMessage({ author: { id: 'bot-1', bot: true }, guild: { id: 'guild-1' } }, store);
  await handleMessage({ author: { id: 'user-1', bot: false } }, store);
});