const test = require('node:test');
const assert = require('node:assert/strict');
const { AuditLogEvent, PermissionsBitField } = require('discord.js');
const {
  parseSnowflake,
  getActionGroup,
  containsDangerousPermission,
  hasDangerousPermissionGrant,
  hasDangerousRoleAssignment,
  isMonitoredEntry,
  isWhitelistedTarget,
  hasWhitelistedRole,
  applyPunishment,
  attach,
  THRESHOLD,
  WINDOW_MS,
  TIMEOUT_MS,
  PUNISHMENTS,
} = require('../src/antinuke');

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
  assert.equal(getActionGroup(AuditLogEvent.RoleCreate), 'role-create');
  assert.equal(getActionGroup(AuditLogEvent.MemberPrune), 'member-prune');
  assert.equal(getActionGroup(AuditLogEvent.InviteCreate), 'invite-create');
  assert.equal(getActionGroup(AuditLogEvent.ChannelOverwriteUpdate), 'dangerous-permission-grant');
  assert.equal(getActionGroup(AuditLogEvent.MemberRoleUpdate), 'dangerous-role-assignment');
  assert.equal(getActionGroup(AuditLogEvent.MessageDelete), null);
});

test('detects dangerous permission grants but ignores removals and harmless edits', () => {
  const admin = PermissionsBitField.Flags.Administrator;
  assert.equal(containsDangerousPermission(admin), true);
  assert.equal(hasDangerousPermissionGrant({
    changes: [{ key: 'permissions', old: '0', new: admin.toString() }],
  }), true);
  assert.equal(hasDangerousPermissionGrant({
    changes: [{ key: 'permissions', old: admin.toString(), new: '0' }],
  }), false);
  assert.equal(hasDangerousPermissionGrant({
    changes: [{ key: 'permissions', old: '0', new: '0' }],
  }), false);
  assert.equal(hasDangerousPermissionGrant({
    changes: [{ key: 'name', old: 'Members', new: 'Staff' }],
  }), false);
});

test('detects assignment of dangerous roles but ignores ordinary role assignments', () => {
  const guild = {
    roles: {
      cache: new Map([
        ['admin-role', { permissions: new PermissionsBitField(PermissionsBitField.Flags.Administrator) }],
        ['member-role', { permissions: new PermissionsBitField(0n) }],
      ]),
    },
  };
  const dangerousAssignment = {
    action: AuditLogEvent.MemberRoleUpdate,
    changes: [{ key: '$add', new: [{ id: 'admin-role' }] }],
  };
  const ordinaryAssignment = {
    action: AuditLogEvent.MemberRoleUpdate,
    changes: [{ key: '$add', new: [{ id: 'member-role' }] }],
  };
  assert.equal(hasDangerousRoleAssignment(dangerousAssignment, guild), true);
  assert.equal(isMonitoredEntry(dangerousAssignment, guild), 'dangerous-role-assignment');
  assert.equal(hasDangerousRoleAssignment(ordinaryAssignment, guild), false);
  assert.equal(isMonitoredEntry(ordinaryAssignment, guild), null);
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
  assert.equal(WINDOW_MS, 1_000);
  assert.equal(TIMEOUT_MS, 600_000);
});

test('logs an antinuke incident after three matching actions in one second', async () => {
  let auditLogHandler;
  const logs = [];
  const member = { roles: { cache: new Map() } };
  const client = {
    user: { id: 'bot-id' },
    on: (event, handler) => {
      if (event === 'guildAuditLogEntryCreate') auditLogHandler = handler;
    },
  };
  const guild = {
    id: 'guild-id',
    ownerId: 'owner-id',
    channels: { cache: new Map() },
    members: { fetch: async () => member },
  };
  const store = {
    getConfig: () => ({
      enabled: true,
      punishment: 'none',
      roleIds: [],
      categoryIds: [],
      channelIds: [],
    }),
  };
  attach(client, store, async (targetGuild, message) => logs.push([targetGuild.id, message]));

  const entry = {
    action: AuditLogEvent.RoleDelete,
    executorId: 'moderator-id',
    targetId: 'role-id',
  };
  await auditLogHandler(entry, guild);
  await auditLogHandler(entry, guild);
  await auditLogHandler(entry, guild);

  assert.equal(logs.length, 1);
  assert.equal(logs[0][0], 'guild-id');
  assert.match(logs[0][1], /role-delete/);
  assert.match(logs[0][1], /3 matching actions within 1 second/);
  assert.match(logs[0][1], /moderator-id/);
  assert.match(logs[0][1], /no punishment configured/);
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