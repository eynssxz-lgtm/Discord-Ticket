const fs = require('node:fs');
const path = require('node:path');

const DATA_DIRECTORY = path.join(__dirname, '..', 'data');
const CONFIG_FILE = path.join(DATA_DIRECTORY, 'guild-temp-voice.json');
const EMPTY_CONFIG = Object.freeze({ triggerChannelId: null, temporaryChannelIds: [] });

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
  return { ...EMPTY_CONFIG, ...readConfigs()[guildId] };
}

function updateConfig(guildId, update) {
  const configs = readConfigs();
  configs[guildId] = { ...EMPTY_CONFIG, ...configs[guildId], ...update };
  writeConfigs(configs);
  return configs[guildId];
}

function setTriggerChannel(guildId, channelId) {
  return updateConfig(guildId, { triggerChannelId: channelId });
}

function isTemporaryChannel(guildId, channelId) {
  return getConfig(guildId).temporaryChannelIds.includes(channelId);
}

function addTemporaryChannel(guildId, channelId) {
  const config = getConfig(guildId);
  if (!config.temporaryChannelIds.includes(channelId)) {
    updateConfig(guildId, { temporaryChannelIds: [...config.temporaryChannelIds, channelId] });
  }
}

function removeTemporaryChannel(guildId, channelId) {
  const config = getConfig(guildId);
  updateConfig(guildId, {
    temporaryChannelIds: config.temporaryChannelIds.filter((id) => id !== channelId),
  });
}

module.exports = {
  getConfig,
  setTriggerChannel,
  isTemporaryChannel,
  addTemporaryChannel,
  removeTemporaryChannel,
};