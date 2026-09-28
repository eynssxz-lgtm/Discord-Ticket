const fs = require('node:fs');
const path = require('node:path');

const DATA_DIRECTORY = path.join(__dirname, '..', 'data');
const CONFIG_FILE = path.join(DATA_DIRECTORY, 'guild-antinuke.json');
const PUNISHMENTS = ['timeout', 'kick', 'ban', 'none'];
const EMPTY_CONFIG = Object.freeze({
  enabled: false,
  punishment: 'timeout',
  roleIds: [],
  categoryIds: [],
  channelIds: [],
});

function readConfigs() {
  try {
    return JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));
  } catch (error) {
    if (error.code === 'ENOENT') {
      return {};
    }
    throw error;
  }
}

function writeConfigs(configs) {
  fs.mkdirSync(DATA_DIRECTORY, { recursive: true });
  fs.writeFileSync(CONFIG_FILE, `${JSON.stringify(configs, null, 2)}\n`);
}

function getConfig(guildId) {
  return { ...EMPTY_CONFIG, ...readConfigs()[guildId] };
}

function updateConfig(guildId, update) {
  const configs = readConfigs();
  configs[guildId] = { ...EMPTY_CONFIG, ...configs[guildId], ...update };
  writeConfigs(configs);
  return configs[guildId];
}

function setEnabled(guildId, enabled) {
  updateConfig(guildId, { enabled });
}

function setPunishment(guildId, punishment) {
  if (!PUNISHMENTS.includes(punishment)) {
    return false;
  }
  updateConfig(guildId, { punishment });
  return true;
}

function updateWhitelist(guildId, type, id, shouldAdd) {
  const key = `${type}Ids`;
  if (!['roleIds', 'categoryIds', 'channelIds'].includes(key)) {
    throw new Error(`Invalid whitelist type: ${type}`);
  }

  const config = getConfig(guildId);
  const currentlyListed = config[key].includes(id);
  if (currentlyListed === shouldAdd) {
    return false;
  }

  const ids = shouldAdd
    ? [...config[key], id]
    : config[key].filter((entry) => entry !== id);
  updateConfig(guildId, { [key]: ids });
  return true;
}

module.exports = { getConfig, setEnabled, setPunishment, updateWhitelist };