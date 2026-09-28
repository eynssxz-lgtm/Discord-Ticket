const fs = require('node:fs');
const path = require('node:path');

const DATA_DIRECTORY = path.join(__dirname, '..', 'data');
const CONFIG_FILE = path.join(DATA_DIRECTORY, 'guild-tickets.json');

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
  return {
    categoryId: null,
    supportRoleId: null,
    panelChannelId: null,
    transcriptChannelId: null,
    ...readConfigs()[guildId],
  };
}

function setConfig(guildId, config) {
  const configs = readConfigs();
  const previous = getConfig(guildId);
  configs[guildId] = {
    ...previous,
    ...config,
  };
  writeConfigs(configs);
  return configs[guildId];
}

module.exports = { getConfig, setConfig };