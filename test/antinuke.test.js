const test = require('node:test');
const assert = require('node:assert/strict');
const { AuditLogEvent } = require('discord.js');
const {
  parseCommand,
  parseSnowflake,
  getActionGroup,
  isWhitelistedTarget,
  hasWhitelistedRole,
  applyPunishment,
  THRESHOLD,
  WINDOW_MS,
  TIMEOUT_MS,
  PUNISHMENTS,
} = require('../src/antinuke');

test('parses antinuke enable and whitelist commands', () => {
  assert.deepEqual(parseCommand('!antinuke enable', '!'), { action: 'enable' });
  assert.deepEqual(parseCommand('!antinuke whitelist role add <@&123>', '!'), {
    action: 'whitelist',
    targetType: 'role',
    operation: 'add',
    target: '<@&123>',
  });
  assert.deepEqual(parseCommand('!antinuke set punishment BAN', '!'), {
    action: 'set-punishment',
    punishment: 'ban',
  });
  assert.equal(parseCommand('!antinuke enable', '?'), null);
});

test('parses role, channel, category mentions and raw IDs', () => {
  assert.equal(parseSnowflake('<@&123>'), '123');
  assert.equal(parseSnowflake('<#456>'), '456');
  assert.equal(parseSnowflake('789'), '789');
  assert.equal(parseSnowflake('not-an-id'), null);
});

test('groups destructive audit actions for threshold counting', () => {
  assert.equal(getActionGroup(AuditLogEvent.MemberBanAdd), 'member-removal');
  assert.equal(getActionGroup(AuditLogEvent.MemberKick), 'member-removal');
  assert.equal(getActionGroup(AuditLogEvent.ChannelDelete), 'channel-delete');
  assert.equal(getActionGroup(AuditLogEvent.RoleDelete), 'role-delete');
  assert.equal(getActionGroup(AuditLogEvent.MessageDelete), null);
});

test('matches actor roles and target channel/category exemptions', () => {
  const config = {
    roleIds: ['role-a'],
    channelIds: ['channel-a'],
    categoryIds: ['category-a'],
  };
  assert.equal(hasWhitelistedRole(config, ['role-b', 'role-a']), true);
  assert.equal(hasWhitelistedRole(config, ['role-b']), false);
  assert.equal(isWhitelistedTarget(config, 'channel-a', null, false), true);
  assert.equal(isWhitelistedTarget(config, 'channel-b', 'category-a', false), true);
  assert.equal(isWhitelistedTarget(config, 'category-a', null, true), true);
  assert.equal(isWhitelistedTarget(config, 'channel-b', 'category-b', false), false);
});

test('uses a conservative default action threshold and timeout', () => {
  assert.equal(THRESHOLD, 3);
  assert.equal(WINDOW_MS, 10_000);
  assert.equal(TIMEOUT_MS, 600_000);
});

test('supports every configured antinuke punishment', async () => {
  const calls = [];
  const member = {
    timeout: async (...args) => calls.push(['timeout', ...args]),
    kick: async (...args) => calls.push(['kick', ...args]),
    ban: async (...args) => calls.push(['ban', ...args]),
  };

  assert.deepEqual(PUNISHMENTS, ['timeout', 'kick', 'ban', 'none']);
  assert.equal(await applyPunishment(member, 'timeout', 'test'), true);
  assert.equal(await applyPunishment(member, 'kick', 'test'), true);
  assert.equal(await applyPunishment(member, 'ban', 'test'), true);
  assert.equal(await applyPunishment(member, 'none', 'test'), false);
  assert.deepEqual(calls.map(([type]) => type), ['timeout', 'kick', 'ban']);
});