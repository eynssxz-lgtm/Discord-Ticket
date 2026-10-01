const { PermissionFlagsBits } = require('discord.js');

function parseRoleAddCommand(content) {
  const match = content.match(/^,role\s+add\s+(<@!?\d+>|\d+)\s+([\s\S]+)$/i);
  if (!match) return null;
  return { memberQuery: match[1], roleQuery: match[2].trim() };
}

function parseSnowflake(value) {
  const match = value.match(/^(?:<@!?|<@&|>)?(\d+)>?$/);
  return match?.[1] || null;
}

async function resolveMember(guild, query) {
  const memberId = parseSnowflake(query);
  if (!memberId) return null;
  return guild.members.fetch(memberId).catch(() => null);
}

async function resolveRole(guild, query) {
  const roleId = parseSnowflake(query);
  if (roleId) {
    return guild.roles.cache.get(roleId) || guild.roles.fetch(roleId).catch(() => null);
  }

  let roles = guild.roles.cache;
  if (![...roles.values()].some((role) => role.name.toLowerCase() === query.toLowerCase())) {
    roles = await guild.roles.fetch().catch(() => null) || roles;
  }
  const matches = [...roles.values()].filter((role) => role.name.toLowerCase() === query.toLowerCase());
  if (matches.length !== 1) return null;
  return matches[0];
}

async function assignRole(guild, member, role, reason) {
  if (!guild.members.me?.permissions.has(PermissionFlagsBits.ManageRoles)) {
    return { ok: false, message: 'I need the Manage Roles permission to assign roles.' };
  }
  if (role.id === guild.id || role.managed || !role.editable) {
    return { ok: false, message: 'I cannot assign that role. It must be unmanaged and below my highest role.' };
  }
  if (!member.manageable) {
    return { ok: false, message: 'I cannot manage that member. Move my highest role above theirs first.' };
  }
  if (member.roles.cache.has(role.id)) {
    return { ok: false, message: `${member.user.tag} already has <@&${role.id}>.` };
  }
  await member.roles.add(role, reason);
  return { ok: true, message: `Added <@&${role.id}> to ${member.user.tag}.` };
}

async function handlePrefixRoleAdd(message) {
  const parsed = parseRoleAddCommand(message.content);
  if (!parsed) return false;

  if (!message.member.permissions.has(PermissionFlagsBits.ManageRoles)) {
    await message.reply('You need the Manage Roles permission to assign roles.');
    return true;
  }
  const member = await resolveMember(message.guild, parsed.memberQuery);
  if (!member) {
    await message.reply('I could not find that server member. Use a mention or user ID.');
    return true;
  }
  const role = await resolveRole(message.guild, parsed.roleQuery);
  if (!role) {
    await message.reply('I could not find one exact role match. Use its exact name, mention, or role ID.');
    return true;
  }

  try {
    const result = await assignRole(
      message.guild,
      member,
      role,
      `Role assigned by ${message.author.tag || message.author.id}`,
    );
    await message.reply(result.message);
  } catch (error) {
    console.error(`Could not assign role ${role.id} to ${member.id} in guild ${message.guild.id}:`, error.message);
    await message.reply('I could not assign that role. Check my permissions and role hierarchy.');
  }
  return true;
}

module.exports = {
  parseRoleAddCommand,
  parseSnowflake,
  resolveMember,
  resolveRole,
  assignRole,
  handlePrefixRoleAdd,
};