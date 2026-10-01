const test = require('node:test');
const assert = require('node:assert/strict');
const {
  getDiscordInviteCodes,
  isNsfwInvite,
  handleMessage,
  clearInviteCache,
} = require('../src/nsfwLinkGuard');

test('extracts Discord invite codes without matching unrelated hosts', () => {
  assert.deepEqual(getDiscordInviteCodes('discord.gg/one https://discord.com/invite/two'), ['one', 'two']);
  assert.deepEqual(getDiscordInviteCodes('notdiscord.gg/one discord.gg/one'), ['one']);
  assert.deepEqual(getDiscordInviteCodes('no invite here'), []);
});

test('only marks invites targeting NSFW channels as restricted', async () => {
  clearInviteCache();
  assert.equal(await isNsfwInvite('adult', async () => ({ channel: { nsfw: true } }), 1), true);
  clearInviteCache();
  assert.equal(await isNsfwInvite('general', async () => ({ channel: { nsfw: false } }), 1), false);
  clearInviteCache();
  assert.equal(await isNsfwInvite('unknown', async () => { throw new Error('Unknown invite'); }, 1), false);
});

test('deletes confirmed NSFW invites and warns without pinging; leaves other links', async () => {
  const calls = [];
  const store = { getEnabled: () => true };
  const message = {
    guild: { id: 'guild-1' },
    author: { id: 'user-1', bot: false, toString: () => '<@user-1>' },
    content: 'Visit https://discord.gg/adult',
    delete: async () => calls.push('delete'),
    channel: { send: async (payload) => calls.push(payload) },
  };
  assert.equal(await handleMessage(message, store, async () => ({ channel: { nsfw: true } })), true);
  assert.equal(calls[0], 'delete');
  assert.deepEqual(calls[1].allowedMentions, { parse: [] });

  calls.length = 0;
  message.content = 'Visit https://discord.gg/general';
  assert.equal(await handleMessage(message, store, async () => ({ channel: { nsfw: false } })), false);
  assert.deepEqual(calls, []);
});