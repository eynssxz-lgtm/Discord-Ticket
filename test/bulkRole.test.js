const test = require('node:test');
const assert = require('node:assert/strict');
const { matchesAudience, getAssignableMembers, buildConfirmation } = require('../src/bulkRole');

function makeMember(id, bot = false, hasRole = false, manageable = true) {
  return {
    id,
    user: { bot },
    manageable,
    roles: { cache: new Map(hasRole ? [['role-1', {}]] : []) },
  };
}

test('filters role targets as human users, bots, or all', () => {
  const human = makeMember('human');
  const bot = makeMember('bot', true);
  assert.equal(matchesAudience(human, 'users'), true);
  assert.equal(matchesAudience(bot, 'users'), false);
  assert.equal(matchesAudience(bot, 'bots'), true);
  assert.equal(matchesAudience(human, 'all'), true);
  assert.equal(matchesAudience(bot, 'invalid'), false);
});

test('bulk target preview skips unmanageable and already assigned members', async () => {
  const members = [
    makeMember('human-1'),
    makeMember('human-2', false, true),
    makeMember('bot-1', true),
    makeMember('bot-2', true, false, false),
  ];
  const guild = { members: { fetch: async () => new Map(members.map((member) => [member.id, member])) } };
  const role = { id: 'role-1', managed: false, editable: true };
  assert.deepEqual((await getAssignableMembers(guild, role, 'users')).map(({ id }) => id), ['human-1']);
  assert.deepEqual((await getAssignableMembers(guild, role, 'bots')).map(({ id }) => id), ['bot-1']);
  assert.deepEqual((await getAssignableMembers(guild, role, 'all')).map(({ id }) => id), ['human-1', 'bot-1']);
});

test('bulk assignment confirmation states audience, role, and target count', () => {
  const confirmation = buildConfirmation({ id: 'role-1' }, 'bots', 'admin-1', 12);
  assert.match(confirmation.embeds[0].data.description, /<@&role-1>/);
  assert.match(confirmation.embeds[0].data.description, /12 bots/);
  assert.deepEqual(confirmation.components[0].components.map(({ data }) => data.label), ['Confirm', 'Cancel']);
});