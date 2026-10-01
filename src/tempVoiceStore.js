const fs = require('node:fs');
const path = require('node:path');

const DATA_DIRECTORY = path.join(__dirname, '..', 'data');
const CONFIG_FILE = path.join(DATA_DIRECTORY, 'guild-temp-voice.json');
const EMPTY_CONFIG = Object.freeze({
  triggerChannelId: null,
  temporaryChannelIds: [],
  temporaryChannelOwners: {},
  controlMessageIds: {},
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

function addTemporaryChannel(guildId, channelId, ownerId = null) {
  const config = getConfig(guildId);
  const temporaryChannelIds = config.temporaryChannelIds.includes(channelId)
    ? config.temporaryChannelIds
    : [...config.temporaryChannelIds, channelId];
  updateConfig(guildId, {
    temporaryChannelIds,
    temporaryChannelOwners: {
      ...config.temporaryChannelOwners,
      ...(ownerId ? { [channelId]: ownerId } : {}),
    },
  });
}

function removeTemporaryChannel(guildId, channelId) {
  const config = getConfig(guildId);
  const temporaryChannelOwners = { ...config.temporaryChannelOwners };
  const controlMessageIds = { ...config.controlMessageIds };
  delete temporaryChannelOwners[channelId];
  delete controlMessageIds[channelId];
  updateConfig(guildId, {
    temporaryChannelIds: config.temporaryChannelIds.filter((id) => id !== channelId),
    temporaryChannelOwners,
    controlMessageIds,
  });
}

function getTemporaryOwner(guildId, channelId) {
  return getConfig(guildId).temporaryChannelOwners[channelId] || null;
}

function setTemporaryOwner(guildId, channelId, ownerId) {
  const config = getConfig(guildId);
  updateConfig(guildId, {
    temporaryChannelOwners: { ...config.temporaryChannelOwners, [channelId]: ownerId },
  });
}

function setControlMessageId(guildId, channelId, messageId) {
  const config = getConfig(guildId);
  updateConfig(guildId, {
    controlMessageIds: { ...config.controlMessageIds, [channelId]: messageId },
  });
}

function getControlMessageId(guildId, channelId) {
  return getConfig(guildId).controlMessageIds[channelId] || null;
}

module.exports = {
  getConfig,
  setTriggerChannel,
  isTemporaryChannel,
  addTemporaryChannel,
  removeTemporaryChannel,
  getTemporaryOwner,
  setTemporaryOwner,
  setControlMessageId,
  getControlMessageId,
};