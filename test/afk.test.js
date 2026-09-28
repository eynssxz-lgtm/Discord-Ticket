const test = require('node:test');
const assert = require('node:assert/strict');
const { formatAfkDuration, handleMessage, applyAfkNickname, restoreAfkNickname } = require('../src/afk');

function makeStore(statuses) {
  return {
    get: (guildId, userId) => statuses.get(`${guildId}:${userId}`) || null,
    clear: (guildId, userId) => statuses.delete(`${guildId}:${userId}`),
  };
}

test('clears the author AFK status when they speak and notifies mentioned AFK users', async () => {
  const now = Date.now();
  const statuses = new Map([
    ['guild-1:author-1', { reason: 'Back soon', since: now - 125_000 }],
    ['guild-1:mentioned-1', { reason: 'At lunch', since: now - 65_000 }],
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
  assert.match(sent[0].content, /welcome back\. You were AFK for 2 minutes/);
  assert.match(sent[0].content, /<@mentioned-1> is AFK for 1 minute, 5 seconds: At lunch/);
  assert.deepEqual(sent[0].allowedMentions, { parse: [] });
});

test('notifies when a message mentions an AFK user', async () => {
  const statuses = new Map([['guild-1:away-1', { reason: 'In a meeting', since: Date.now() - 60_000 }]]);
  const sent = [];
  const message = {
    guild: { id: 'guild-1' },
    author: { id: 'author-1', username: 'Casey', bot: false },
    mentions: { users: new Map([['away-1', { id: 'away-1' }]]) },
    channel: { send: async (payload) => sent.push(payload) },
  };

  await handleMessage(message, makeStore(statuses));

  assert.equal(sent.length, 1);
  assert.match(sent[0].content, /is AFK for 1 minute: In a meeting/);
});

test('formats AFK durations using up to two readable units', () => {
  assert.equal(formatAfkDuration(0, 0), 'less than a second');
  assert.equal(formatAfkDuration(0, 65_000), '1 minute, 5 seconds');
  assert.equal(formatAfkDuration(0, 3_600_000), '1 hour');
  assert.equal(formatAfkDuration(0, 90_061_000), '1 day, 1 hour');
});

test('adds and restores the AFK nickname marker without duplicating it', async () => {
  const member = {
    nickname: 'Jamie',
    user: { username: 'Jamie' },
    setNickname: async (nickname) => {
      member.nickname = nickname;
    },
  };

  await applyAfkNickname(member);
  assert.equal(member.nickname, '[AFK] Jamie');

  await restoreAfkNickname(member, { originalNickname: 'Jamie' });
  assert.equal(member.nickname, 'Jamie');

  await applyAfkNickname(member);
  assert.equal(member.nickname, '[AFK] Jamie');
});

test('ignores bot messages and direct messages', async () => {
  const store = { get: () => assert.fail('should not query AFK status'), clear: () => {} };
  await handleMessage({ author: { id: 'bot-1', bot: true }, guild: { id: 'guild-1' } }, store);
  await handleMessage({ author: { id: 'user-1', bot: false } }, store);
});