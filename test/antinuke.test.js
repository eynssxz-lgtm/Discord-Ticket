const test = require('node:test');
const assert = require('node:assert/strict');
const { AuditLogEvent, PermissionsBitField } = require('discord.js');
const {
  parseSnowflake,
  getActionGroup,
  containsDiscordInvite,
  containsDangerousPermission,
  hasDangerousPermissionGrant,
  hasDangerousRoleAssignment,
  isMonitoredEntry,
  isWhitelistedTarget,
  hasWhitelistedRole,
  applyPunishment,
  sendPunishmentNotice,
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

test('detects common Discord invite links in messages', () => {
  assert.equal(containsDiscordInvite('Join at discord.gg/AbC123'), true);
  assert.equal(containsDiscordInvite('https://discord.com/invite/AbC123'), true);
  assert.equal(containsDiscordInvite('www.discordapp.com/invite/AbC123'), true);
  assert.equal(containsDiscordInvite('notdiscord.gg/AbC123'), false);
  assert.equal(containsDiscordInvite('discord.gg/'), false);
  assert.equal(containsDiscordInvite(null), false);
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

test('uses an immediate action threshold and ten-minute timeout', () => {
  assert.equal(THRESHOLD, 1);
  assert.equal(WINDOW_MS, 1_000);
  assert.equal(TIMEOUT_MS, 600_000);
});

test('punishes and logs after one matching audit action', async () => {
  let auditLogHandler;
  const logs = [];
  const actions = [];
  const member = {
    id: 'moderator-id',
    roles: { cache: new Map() },
    send: async () => actions.push('dm'),
    kick: async () => actions.push('kick'),
  };
  const client = {
    user: { id: 'bot-id' },
    on: (event, handler) => {
      if (event === 'guildAuditLogEntryCreate') auditLogHandler = handler;
    },
  };
  const guild = {
    id: 'guild-id',
    name: 'Example server',
    ownerId: 'owner-id',
    channels: { cache: new Map() },
    members: { fetch: async () => member },
  };
  const store = {
    getConfig: () => ({
      enabled: true,
      punishment: 'kick',
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

  assert.deepEqual(actions, ['dm', 'kick']);
  assert.equal(logs.length, 1);
  assert.equal(logs[0][0], 'guild-id');
  assert.match(logs[0][1], /role-delete/);
  assert.match(logs[0][1], /1 matching action within 1 second/);
  assert.match(logs[0][1], /moderator-id/);
  assert.match(logs[0][1], /applied kick/);
});

test('logs a single posted invite link through antinuke', async () => {
  let messageHandler;
  const logs = [];
  const member = { id: 'member-id', roles: { cache: new Map() } };
  const client = {
    user: { id: 'bot-id' },
    on: (event, handler) => {
      if (event === 'messageCreate') messageHandler = handler;
    },
  };
  const guild = {
    id: 'guild-id',
    name: 'Example server',
    ownerId: 'owner-id',
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
  attach(client, store, async (targetGuild, content) => logs.push([targetGuild.id, content]));

  const makeMessage = () => ({
    guild,
    author: { id: member.id, bot: false },
    member,
    content: 'Join my server: https://discord.gg/abc123',
    channelId: 'channel-id',
  });
  await messageHandler(makeMessage());

  assert.equal(logs.length, 1);
  assert.match(logs[0][1], /invite-link/);
  assert.match(logs[0][1], /member-id/);
});

test('DMs kick and ban details before punishment and continues if DMs are closed', async () => {
  const calls = [];
  const guild = { name: 'Example server' };
  const member = {
    id: 'member-id',
    send: async ({ content }) => {
      calls.push(['dm', content]);
      throw new Error('DMs closed');
    },
    kick: async () => calls.push(['kick']),
    ban: async () => calls.push(['ban']),
  };

  await sendPunishmentNotice(member, guild, 'invite-link', 'kick');
  await applyPunishment(member, 'kick', 'reason');
  await sendPunishmentNotice(member, guild, 'channel-delete', 'ban');
  await applyPunishment(member, 'ban', 'reason');

  assert.deepEqual(calls.map(([action]) => action), ['dm', 'kick', 'dm', 'ban']);
  assert.match(calls[0][1], /invite-link/);
  assert.match(calls[0][1], /kicked/);
  assert.match(calls[2][1], /channel-delete/);
  assert.match(calls[2][1], /banned/);
});

test('supports every configured antinuke punishment', async () => {
  const calls = [];
  const member = {
    roles: {
      cache: new Map([
        ['role-a', { id: 'role-a', editable: true }],
        ['role-b', { id: 'role-b', editable: false }],
      ]),
      remove: async (...args) => calls.push(['remove-roles', ...args]),
    },
    timeout: async (...args) => calls.push(['timeout', ...args]),
    kick: async (...args) => calls.push(['kick', ...args]),
    ban: async (...args) => calls.push(['ban', ...args]),
  };

  assert.deepEqual(PUNISHMENTS, ['remove-roles', 'timeout', 'kick', 'ban', 'none']);
  assert.equal(await applyPunishment(member, 'remove-roles', 'test'), true);
  assert.equal(await applyPunishment(member, 'timeout', 'test'), true);
  assert.equal(await applyPunishment(member, 'kick', 'test'), true);
  assert.equal(await applyPunishment(member, 'ban', 'test'), true);
  assert.equal(await applyPunishment(member, 'none', 'test'), false);
  assert.deepEqual(calls.map(([type]) => type), ['remove-roles', 'timeout', 'kick', 'ban']);
  assert.equal(calls[0][1].id, 'role-a');
  assert.equal(calls[0][2], 'test');
});

test('DMs the member when antinuke removes their roles', async () => {
  let notice;
  await sendPunishmentNotice({
    id: 'member-id',
    send: async ({ content }) => { notice = content; },
  }, { name: 'Example server' }, 'channel-delete', 'remove-roles');

  assert.match(notice, /stripped of all manageable roles/);
  assert.match(notice, /channel-delete/);
  assert.match(notice, /Action taken: \*\*remove-roles\*\*/);
});