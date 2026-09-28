const fs = require('node:fs');
const path = require('node:path');

const DATA_DIRECTORY = path.join(__dirname, '..', 'data');
const CONFIG_FILE = path.join(DATA_DIRECTORY, 'guild-welcome.json');
const DEFAULT_CONFIG = Object.freeze({
  enabled: false,
  channelId: null,
  message: 'Welcome {user} to {server}!',
  embed: {},
});

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

function getConfig(guildId) {
  const config = readConfigs()[guildId] || {};
  return { ...DEFAULT_CONFIG, ...config, embed: { ...config.embed } };
}

function update(guildId, update) {
  const configs = readConfigs();
  const current = configs[guildId] || {};
  configs[guildId] = {
    ...DEFAULT_CONFIG,
    ...current,
    ...update,
    embed: { ...DEFAULT_CONFIG.embed, ...current.embed, ...update.embed },
  };
  writeConfigs(configs);
  return configs[guildId];
}

module.exports = { getConfig, update };