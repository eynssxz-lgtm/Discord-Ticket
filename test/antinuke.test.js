const test = require('node:test');
const assert = require('node:assert/strict');
const { AuditLogEvent, PermissionsBitField } = require('discord.js');
const antinukeStore = require('../src/antinukeStore');
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
  getReadiness,
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
  assert.equal(getActionGroup(AuditLogEvent.ChannelCreate), 'channel-create');
  assert.equal(getActionGroup(AuditLogEvent.RoleDelete), 'role-delete');
  assert.equal(getActionGroup(AuditLogEvent.RoleCreate), 'role-create');
  assert.equal(getActionGroup(AuditLogEvent.MemberPrune), 'member-prune');
  assert.equal(getActionGroup(AuditLogEvent.InviteCreate), 'invite-create');
  assert.equal(getActionGroup(AuditLogEvent.InviteDelete), 'invite-change');
  assert.equal(getActionGroup(AuditLogEvent.WebhookUpdate), 'webhook-change');
  assert.equal(getActionGroup(AuditLogEvent.IntegrationCreate), 'integration-change');
  assert.equal(getActionGroup(AuditLogEvent.AutoModerationRuleDelete), 'automod-rule-change');
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

test('reports missing gateway intent and permissions for antinuke setup', () => {
  const guild = {
    members: {
      me: { permissions: new PermissionsBitField(PermissionsBitField.Flags.ViewAuditLog) },
    },
  };
  const client = { options: { intents: { has: () => false } } };
  assert.deepEqual(getReadiness(guild, client, 'remove-roles'), {
    moderationIntent: false,
    viewAuditLog: true,
    punishmentPermission: false,
    punishmentPermissionName: 'Manage Roles',
    missingPunishmentPermissions: ['Manage Roles'],
  });
});

test('uses an immediate action threshold and ten-minute timeout', () => {
  assert.equal(THRESHOLD, 1);
  assert.equal(WINDOW_MS, 1_000);
  assert.equal(TIMEOUT_MS, 600_000);
});

test('uses action-specific punishment before the global fallback', () => {
  assert.equal(antinukeStore.getActionPunishment({
    punishment: 'remove-roles',
    actionPunishments: { 'channel-delete': 'ban' },
  }, 'channel-delete'), 'ban');
  assert.equal(antinukeStore.getActionPunishment({
    punishment: 'remove-roles',
    actionPunishments: {},
  }, 'channel-delete'), 'remove-roles');
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

test('handles a channel deletion audit event and logs the punishment', async () => {
  let auditLogHandler;
  const logs = [];
  const member = {
    id: 'moderator-id',
    roles: { cache: new Map() },
    send: async () => {},
    kick: async () => {},
  };
  const guild = {
    id: 'guild-id',
    name: 'Example server',
    ownerId: 'owner-id',
    channels: { cache: new Map() },
    members: { fetch: async () => member },
  };
  const client = {
    user: { id: 'bot-id' },
    on: (event, handler) => {
      if (event === 'guildAuditLogEntryCreate') auditLogHandler = handler;
    },
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
  attach(client, store, async (_targetGuild, message) => logs.push(message));

  await auditLogHandler({
    action: AuditLogEvent.ChannelDelete,
    executorId: member.id,
    targetId: 'deleted-channel',
  }, guild);

  assert.equal(logs.length, 1);
  assert.match(logs[0], /channel-delete/);
  assert.match(logs[0], /applied kick/);
});

test('starts kick enforcement without waiting for the DM request', async () => {
  let auditLogHandler;
  let releaseDm;
  let kicked = false;
  const member = {
    id: 'moderator-id',
    roles: { cache: new Map() },
    send: () => new Promise((resolve) => { releaseDm = resolve; }),
    kick: async () => { kicked = true; },
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
  attach(client, store);

  const pending = auditLogHandler({
    action: AuditLogEvent.RoleDelete,
    executorId: member.id,
    targetId: 'role-id',
  }, guild);
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(kicked, true);
  releaseDm();
  await pending;
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

test('only applies join-raid punishment after configured burst threshold', async () => {
  let memberAddHandler;
  const logs = [];
  const punished = [];
  const client = {
    user: { id: 'bot-id' },
    on: (event, handler) => {
      if (event === 'guildMemberAdd') memberAddHandler = handler;
    },
  };
  const guild = { id: 'guild-id', name: 'Example server', ownerId: 'owner-id' };
  const store = {
    getConfig: () => ({
      enabled: true,
      punishment: 'remove-roles',
      actionPunishments: {},
      roleIds: [],
      raid: { enabled: true, threshold: 3, windowSeconds: 10, punishment: 'kick' },
    }),
  };
  attach(client, store, async (targetGuild, message) => logs.push(message));
  const makeMember = (id) => ({
    id,
    guild,
    roles: { cache: new Map() },
    send: async () => {},
    kick: async () => punished.push(id),
  });

  await memberAddHandler(makeMember('join-1'));
  await memberAddHandler(makeMember('join-2'));
  assert.equal(punished.length, 0);
  await memberAddHandler(makeMember('join-3'));

  assert.deepEqual(punished, ['join-3']);
  assert.match(logs[0], /raid-join-burst/);
  assert.match(logs[0], /applied kick/);
});

test('DMs kick and ban details before punishment and continues if DMs are closed', async () => {
  const calls = [];
  const guild = { name: 'Example server' };
  const member = {
    id: 'member-id',
    send: async (payload) => {
      calls.push(['dm', payload]);
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
  assert.match(calls[0][1].embeds[0].data.title, /User Punished/);
  assert.match(calls[0][1].embeds[0].data.fields.find(({ name }) => name === 'Action').value, /invite link/);
  assert.match(calls[0][1].embeds[0].data.fields.find(({ name }) => name === 'Punishment Type').value, /kick/);
  assert.match(calls[2][1].embeds[0].data.fields.find(({ name }) => name === 'Action').value, /channel delete/);
  assert.match(calls[2][1].embeds[0].data.fields.find(({ name }) => name === 'Punishment Type').value, /ban/);
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
  assert.deepEqual(calls[0][1].map(({ id }) => id), ['role-a']);
  assert.equal(calls[0][2], 'test');
});

test('fails visibly when no member roles are manageable by the bot', async () => {
  await assert.rejects(
    applyPunishment({
      roles: {
        cache: new Map([['high-role', { id: 'high-role', editable: false }]]),
        remove: async () => assert.fail('must not issue an empty removal'),
      },
    }, 'remove-roles', 'test'),
    /cannot manage any of this member's roles/,
  );
});

test('DMs the member when antinuke removes their roles', async () => {
  let notice;
  await sendPunishmentNotice({
    id: 'member-id',
    user: { tag: 'member#0001' },
    send: async (payload) => { notice = payload; },
  }, { name: 'Example server' }, 'channel-delete', 'remove-roles');

  const embed = notice.embeds[0].data;
  assert.equal(embed.title, 'User Punished');
  assert.match(embed.description, /Security responded in 1 second! AYOKO SAYO WANNA BE NUKER KA BOBO/);
  assert.match(embed.description, /Anti Nuke has punished a user, details:/);
  assert.deepEqual(embed.fields.map(({ name }) => name), ['Server', 'User', 'Action', 'Punishment Type']);
  assert.equal(embed.fields[0].value, 'Example server');
  assert.equal(embed.fields[1].value, 'member#0001 (<@member-id>)');
  assert.equal(embed.fields[2].value, 'channel delete');
  assert.equal(embed.fields[3].value, 'remove-roles');
  assert.deepEqual(notice.allowedMentions, { parse: [] });
});