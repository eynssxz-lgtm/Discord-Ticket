const test = require('node:test');
const assert = require('node:assert/strict');
const {
  parseRoleAddCommand,
  parseSnowflake,
  resolveRole,
  assignRole,
  handlePrefixRoleAdd,
} = require('../src/roleAssignment');

test('parses comma role command with user ID and multiword role name', () => {
  assert.deepEqual(parseRoleAddCommand(',role add 123456789012345678 Senior Support'), {
    memberQuery: '123456789012345678',
    roleQuery: 'Senior Support',
  });
  assert.deepEqual(parseRoleAddCommand(',role add <@123456789012345678> <@&234567890123456789>'), {
    memberQuery: '<@123456789012345678>',
    roleQuery: '<@&234567890123456789>',
  });
  assert.equal(parseRoleAddCommand('hello there'), null);
  assert.equal(parseSnowflake('<@!123456789012345678>'), '123456789012345678');
});

test('resolves role mentions, IDs, and case-insensitive exact names', async () => {
  const role = { id: '234567890123456789', name: 'Senior Support' };
  const guild = { roles: { cache: new Map([[role.id, role]]), fetch: async (id) => id === role.id ? role : null } };
  assert.equal(await resolveRole(guild, '<@&234567890123456789>'), role);
  assert.equal(await resolveRole(guild, 'senior support'), role);
  assert.equal(await resolveRole(guild, 'missing role'), null);
});

test('assigns a role when member and role are manageable', async () => {
  const calls = [];
  const guild = {
    id: 'guild-1',
    members: { me: { permissions: { has: () => true } } },
  };
  const role = { id: 'role-1', managed: false, editable: true };
  const member = {
    id: 'user-1',
    user: { tag: 'Casey#1234' },
    manageable: true,
    roles: {
      cache: new Map(),
      add: async (...args) => calls.push(args),
    },
  };
  const result = await assignRole(guild, member, role, 'test reason');
  assert.equal(result.ok, true);
  assert.equal(calls[0][0], role);
  assert.equal(calls[0][1], 'test reason');
  assert.match(result.message, /Casey#1234/);
});

test('comma command accepts IDs and role names and enforces permissions', async () => {
  const role = { id: 'role-1', name: 'Senior Support', managed: false, editable: true };
  const calls = [];
  const member = {
    id: '123456789012345678',
    user: { tag: 'Target#0001' },
    manageable: true,
    roles: { cache: new Map(), add: async (...args) => calls.push(args) },
  };
  const guild = {
    id: 'guild-1',
    members: {
      me: { permissions: { has: () => true } },
      fetch: async (id) => id === member.id ? member : null,
    },
    roles: { cache: new Map([[role.id, role]]), fetch: async () => null },
  };
  const replies = [];
  const message = {
    content: ',role add 123456789012345678 senior support',
    guild,
    member: { permissions: { has: () => true } },
    author: { id: 'moderator-1', tag: 'Mod#0001' },
    reply: async (content) => replies.push(content),
  };

  assert.equal(await handlePrefixRoleAdd(message), true);
  assert.equal(calls[0][0], role);
  assert.match(replies[0], /Added <@&role-1>/);

  replies.length = 0;
  message.member.permissions.has = () => false;
  await handlePrefixRoleAdd(message);
  assert.match(replies[0], /Manage Roles/);
});