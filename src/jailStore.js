const fs = require('node:fs');
const path = require('node:path');

const DATA_DIRECTORY = path.join(__dirname, '..', 'data');
const CONFIG_FILE = path.join(DATA_DIRECTORY, 'guild-jails.json');

function readConfigs() {
  try {
    return JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));
  } catch (error) {
    if (error.code === 'ENOENT') return {};
    throw error;
  }
}

function writeConfigs(configs) {
  fs.mkdirSync(DATA_DIRECTORY, { recursive: true });
  fs.writeFileSync(CONFIG_FILE, `${JSON.stringify(configs, null, 2)}\n`);
}

function getGuildConfig(configs, guildId) {
  return configs[guildId] || { jailRoleId: null, members: {} };
}

function getJailRole(guildId) {
  return getGuildConfig(readConfigs(), guildId).jailRoleId;
}

function setJailRole(guildId, roleId) {
  const configs = readConfigs();
  const config = getGuildConfig(configs, guildId);
  configs[guildId] = { ...config, jailRoleId: roleId };
  writeConfigs(configs);
}

function getSavedRoles(guildId, memberId) {
  const roles = getGuildConfig(readConfigs(), guildId).members[memberId];
  return Array.isArray(roles) ? [...roles] : null;
}

function saveMemberRoles(guildId, memberId, roleIds) {
  const configs = readConfigs();
  const config = getGuildConfig(configs, guildId);
  configs[guildId] = {
    ...config,
    members: { ...config.members, [memberId]: [...roleIds] },
  };
  writeConfigs(configs);
}

function clearMemberRoles(guildId, memberId) {
  const configs = readConfigs();
  const config = getGuildConfig(configs, guildId);
  const members = { ...config.members };
  delete members[memberId];
  configs[guildId] = { ...config, members };
  writeConfigs(configs);
}

module.exports = { getJailRole, setJailRole, getSavedRoles, saveMemberRoles, clearMemberRoles };