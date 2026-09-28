const test = require('node:test');
const assert = require('node:assert/strict');
const { jailMember, unjailMember } = require('../src/jail');

function createMember() {
  const everyone = { id: 'guild-1', editable: false };
  const memberRole = { id: 'member-role', editable: true };
  const jailRole = { id: 'jail-role', editable: true };
  const roleMap = new Map([[everyone.id, everyone], [memberRole.id, memberRole], [jailRole.id, jailRole]]);
  const assigned = new Map([[everyone.id, everyone], [memberRole.id, memberRole]]);
  const roles = {
    cache: assigned,
    async add(ids) {
      for (const id of Array.isArray(ids) ? ids : [ids]) assigned.set(id, roleMap.get(id));
    },
    async remove(ids) {
      for (const id of Array.isArray(ids) ? ids : [ids]) assigned.delete(id);
    },
  };
  const member = { id: 'member-1', guild: { id: 'guild-1', roles: { cache: roleMap } }, roles };
  const saved = new Map();
  const store = {
    saveMemberRoles: (guildId, memberId, ids) => saved.set(`${guildId}:${memberId}`, [...ids]),
    getSavedRoles: (guildId, memberId) => saved.get(`${guildId}:${memberId}`) || null,
    clearMemberRoles: (guildId, memberId) => saved.delete(`${guildId}:${memberId}`),
  };
  return { member, store, jailRole, assigned, saved };
}

test('jailing removes assigned roles and unjailing restores them', async () => {
  const { member, store, jailRole, assigned, saved } = createMember();

  const jailed = await jailMember(member, jailRole, store);
  assert.equal(jailed.savedRoleCount, 1);
  assert.deepEqual([...assigned.keys()], ['guild-1', 'jail-role']);
  assert.deepEqual(saved.get('guild-1:member-1'), ['member-role']);

  const unjailed = await unjailMember(member, jailRole, store);
  assert.equal(unjailed.restoredRoleCount, 1);
  assert.deepEqual([...assigned.keys()], ['guild-1', 'member-role']);
  assert.equal(saved.has('guild-1:member-1'), false);
});

test('jailing refuses to change roles the bot cannot manage', async () => {
  const { member, store, jailRole, assigned, saved } = createMember();
  const blockedRole = { id: 'blocked-role', editable: false };
  member.guild.roles.cache.set(blockedRole.id, blockedRole);
  assigned.set(blockedRole.id, blockedRole);

  const result = await jailMember(member, jailRole, store);
  assert.deepEqual(result.blockedRoleIds, ['blocked-role']);
  assert.equal(assigned.has('jail-role'), false);
  assert.equal(saved.has('guild-1:member-1'), false);
});