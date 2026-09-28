const test = require('node:test');
const assert = require('node:assert/strict');
const { parseDuration, parsePurgeAmount, resolveTargetMember, buildUserCardEmbed } = require('../src/moderation');

test('parses common duration strings for moderation actions', () => {
  assert.equal(parseDuration('10m'), 10 * 60 * 1000);
  assert.equal(parseDuration('2h'), 2 * 60 * 60 * 1000);
  assert.equal(parseDuration('1d'), 24 * 60 * 60 * 1000);
  assert.equal(parseDuration('30s'), 30 * 1000);
  assert.equal(parseDuration('invalid'), null);
});

test('parses purge counts up to 500 messages', () => {
  assert.equal(parsePurgeAmount('25'), 25);
  assert.equal(parsePurgeAmount('500'), 500);
  assert.equal(parsePurgeAmount('501'), null);
  assert.equal(parsePurgeAmount('0'), null);
});

test('resolves a target member from a reply when no mention is provided', async () => {
  const message = {
    mentions: { members: { first: () => null } },
    reference: { messageId: '42' },
    channel: {
      messages: {
        fetch: async () => ({ author: { id: '99' } }),
      },
    },
  };

  const target = await resolveTargetMember(message, null);
  assert.equal(target.id, '99');
});

test('builds an avatar or cover embed with the correct image source', () => {
  const member = {
    user: {
      tag: 'alice#0001',
      id: '123',
      avatarURL: () => 'https://cdn.example.com/avatar.png',
      bannerURL: () => 'https://cdn.example.com/cover.png',
    },
    displayAvatarURL: () => 'https://cdn.example.com/avatar.png',
  };

  const avatarEmbed = buildUserCardEmbed(member, 'avatar');
  assert.equal(avatarEmbed.image.url, 'https://cdn.example.com/avatar.png');

  const coverEmbed = buildUserCardEmbed(member, 'cover');
  assert.equal(coverEmbed.image.url, 'https://cdn.example.com/cover.png');
  assert.equal(coverEmbed.thumbnail, undefined);
  assert.match(coverEmbed.title, /banner photo/);
});
