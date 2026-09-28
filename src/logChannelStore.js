const fs = require('node:fs');
const path = require('node:path');

const DATA_DIRECTORY = path.join(__dirname, '..', 'data');
const LOG_CHANNEL_FILE = path.join(DATA_DIRECTORY, 'guild-log-channels.json');

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

function getLogChannel(guildId) {
  return readLogChannels()[guildId] || null;
}

function setLogChannel(guildId, channelId) {
  const channels = readLogChannels();
  channels[guildId] = channelId;
  fs.mkdirSync(DATA_DIRECTORY, { recursive: true });
  fs.writeFileSync(LOG_CHANNEL_FILE, `${JSON.stringify(channels, null, 2)}\n`);
}

module.exports = { getLogChannel, setLogChannel };
