const fs = require('node:fs');
const path = require('node:path');

const DATA_DIRECTORY = path.join(__dirname, '..', 'data');
const CONFIG_FILE = path.join(DATA_DIRECTORY, 'guild-afk.json');

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

function get(guildId, userId) {
  return readConfigs()[guildId]?.[userId] || null;
}

function set(guildId, userId, reason, originalNickname = null) {
  const configs = readConfigs();
  configs[guildId] ||= {};
  configs[guildId][userId] = {
    reason: reason.trim() || 'AFK',
    since: Date.now(),
    originalNickname: originalNickname ? String(originalNickname).trim() : null,
  };
  writeConfigs(configs);
  return configs[guildId][userId];
}

function clear(guildId, userId) {
  const configs = readConfigs();
  if (!configs[guildId]?.[userId]) return false;
  delete configs[guildId][userId];
  if (Object.keys(configs[guildId]).length === 0) delete configs[guildId];
  writeConfigs(configs);
  return true;
}

module.exports = { get, set, clear };