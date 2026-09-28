const fs = require('node:fs');
const path = require('node:path');

const DATA_DIRECTORY = path.join(__dirname, '..', 'data');
const PREFIX_FILE = path.join(DATA_DIRECTORY, 'guild-prefixes.json');

function readPrefixes() {
  try {
    return JSON.parse(fs.readFileSync(PREFIX_FILE, 'utf8'));
  } catch (error) {
    if (error.code === 'ENOENT') {
      return {};
    }
    throw error;
  }
}

function getPrefix(guildId, defaultPrefix) {
  return readPrefixes()[guildId] || defaultPrefix;
}

function setPrefix(guildId, prefix) {
  const prefixes = readPrefixes();
  prefixes[guildId] = prefix;
  fs.mkdirSync(DATA_DIRECTORY, { recursive: true });
  fs.writeFileSync(PREFIX_FILE, `${JSON.stringify(prefixes, null, 2)}\n`);
}

module.exports = { getPrefix, setPrefix };