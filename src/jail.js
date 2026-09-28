function getAssignedRoles(member, jailRoleId) {
  return [...member.roles.cache.values()].filter((role) => (
    role.id !== member.guild.id && role.id !== jailRoleId
  ));
}

async function jailMember(member, jailRole, store) {
  if (member.roles.cache.has(jailRole.id)) {
    return { alreadyJailed: true, savedRoleCount: 0, blockedRoleIds: [] };
  }

  const roles = getAssignedRoles(member, jailRole.id);
  const blockedRoleIds = roles.filter((role) => !role.editable).map((role) => role.id);
  if (blockedRoleIds.length > 0 || !jailRole.editable) {
    return {
      alreadyJailed: false,
      savedRoleCount: 0,
      blockedRoleIds: jailRole.editable ? blockedRoleIds : [...blockedRoleIds, jailRole.id],
    };
  }

  const roleIds = roles.map((role) => role.id);
  store.saveMemberRoles(member.guild.id, member.id, roleIds);
  let rolesRemoved = false;
  try {
    if (roleIds.length > 0) {
      await member.roles.remove(roleIds, 'Member jailed');
      rolesRemoved = true;
    }
    await member.roles.add(jailRole.id, 'Member jailed');
  } catch (error) {
    if (rolesRemoved) {
      try {
        if (roleIds.length > 0) await member.roles.add(roleIds, 'Restore roles after failed jail');
        store.clearMemberRoles(member.guild.id, member.id);
      } catch {}
    } else {
      store.clearMemberRoles(member.guild.id, member.id);
    }
    throw error;
  }

  return { alreadyJailed: false, savedRoleCount: roleIds.length, blockedRoleIds: [] };
}

async function unjailMember(member, jailRole, store) {
  const roleIds = store.getSavedRoles(member.guild.id, member.id);
  if (!roleIds) {
    return { wasJailed: false, restoredRoleCount: 0, blockedRoleIds: [] };
  }

  const restorableRoles = roleIds
    .map((id) => member.guild.roles.cache.get(id))
    .filter((role) => role && role.editable);
  const blockedRoleIds = roleIds.filter((id) => {
    const role = member.guild.roles.cache.get(id);
    return role && !role.editable;
  });
  if (blockedRoleIds.length > 0 || (member.roles.cache.has(jailRole.id) && !jailRole.editable)) {
    return {
      wasJailed: true,
      restoredRoleCount: 0,
      blockedRoleIds: member.roles.cache.has(jailRole.id) && !jailRole.editable
        ? [...blockedRoleIds, jailRole.id]
        : blockedRoleIds,
    };
  }

  if (restorableRoles.length > 0) {
    await member.roles.add(restorableRoles.map((role) => role.id), 'Member unjailed');
  }
  if (member.roles.cache.has(jailRole.id)) {
    await member.roles.remove(jailRole.id, 'Member unjailed');
  }
  store.clearMemberRoles(member.guild.id, member.id);

  return { wasJailed: true, restoredRoleCount: restorableRoles.length, blockedRoleIds: [] };
}

module.exports = { jailMember, unjailMember };