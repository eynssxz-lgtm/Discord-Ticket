const fs = require('node:fs');
const path = require('node:path');

const DATA_DIRECTORY = path.join(__dirname, '..', 'data');
const LOG_CHANNEL_FILE = path.join(DATA_DIRECTORY, 'guild-log-channels.json');
const LOG_TYPES = ['default', 'voice', 'message-delete', 'image-delete', 'video-delete', 'security'];

function readLogChannels() {
  try {
    return JSON.parse(fs.readFileSync(LOG_CHANNEL_FILE, 'utf8'));
  } catch (error) {
    if (error.code === 'ENOENT') {
      return {};
    }
    throw error;
  }
}

function resolveLogChannel(config, type = 'default') {
  if (typeof config === 'string') return config;
  if (!config || !LOG_TYPES.includes(type)) return null;
  return config[type] || config.default || null;
}

function getLogChannel(guildId, type = 'default') {
  return resolveLogChannel(readLogChannels()[guildId], type);
}

function setLogChannel(guildId, channelId, type = 'default') {
  if (!LOG_TYPES.includes(type)) return false;
  const channels = readLogChannels();
  const current = channels[guildId];
  const settings = typeof current === 'string' ? { default: current } : { ...current };
  if (channelId) settings[type] = channelId;
  else delete settings[type];
  if (Object.keys(settings).length === 0) delete channels[guildId];
  else channels[guildId] = settings;
  fs.mkdirSync(DATA_DIRECTORY, { recursive: true });
  fs.writeFileSync(LOG_CHANNEL_FILE, `${JSON.stringify(channels, null, 2)}\n`);
  return true;
}

module.exports = { getLogChannel, setLogChannel, resolveLogChannel, LOG_TYPES };
