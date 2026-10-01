const fs = require('node:fs');
const path = require('node:path');

const DATA_DIRECTORY = path.join(__dirname, '..', 'data');
const CONFIG_FILE = path.join(DATA_DIRECTORY, 'guild-antinuke.json');
const PUNISHMENTS = ['remove-roles', 'timeout', 'kick', 'ban', 'none'];
const DEFAULT_RAID_CONFIG = Object.freeze({
  enabled: false,
  threshold: 5,
  windowSeconds: 10,
  punishment: 'kick',
});
const EMPTY_CONFIG = Object.freeze({
  enabled: false,
  punishment: 'remove-roles',
  actionPunishments: {},
  raid: DEFAULT_RAID_CONFIG,
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
  const stored = readConfigs()[guildId] || {};
  return {
    ...EMPTY_CONFIG,
    ...stored,
    actionPunishments: { ...stored.actionPunishments },
    raid: { ...DEFAULT_RAID_CONFIG, ...stored.raid },
  };
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

function getActionPunishment(config, actionGroup) {
  return config.actionPunishments?.[actionGroup] || config.punishment;
}

function setActionPunishment(guildId, actionGroup, punishment) {
  if (!actionGroup || !PUNISHMENTS.includes(punishment)) return false;
  const config = getConfig(guildId);
  updateConfig(guildId, {
    actionPunishments: { ...config.actionPunishments, [actionGroup]: punishment },
  });
  return true;
}

function updateRaidConfig(guildId, update) {
  const config = getConfig(guildId);
  const next = { ...config.raid, ...update };
  if (typeof next.enabled !== 'boolean'
    || !Number.isInteger(next.threshold) || next.threshold < 2 || next.threshold > 50
    || !Number.isInteger(next.windowSeconds) || next.windowSeconds < 5 || next.windowSeconds > 60
    || !PUNISHMENTS.includes(next.punishment)) {
    return false;
  }
  updateConfig(guildId, { raid: next });
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

module.exports = {
  getConfig,
  setEnabled,
  setPunishment,
  getActionPunishment,
  setActionPunishment,
  updateRaidConfig,
  updateWhitelist,
  PUNISHMENTS,
  DEFAULT_RAID_CONFIG,
};