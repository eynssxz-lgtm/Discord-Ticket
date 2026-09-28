const fs = require('node:fs');
const path = require('node:path');

const DATA_DIRECTORY = path.join(__dirname, '..', 'data');
const AUTORESPONDER_FILE = path.join(DATA_DIRECTORY, 'guild-autoresponders.json');

function readResponders() {
  try {
    return JSON.parse(fs.readFileSync(AUTORESPONDER_FILE, 'utf8'));
  } catch (error) {
    if (error.code === 'ENOENT') {
      return {};
    }
    throw error;
  }
}

function writeResponders(responders) {
  fs.mkdirSync(DATA_DIRECTORY, { recursive: true });
  fs.writeFileSync(AUTORESPONDER_FILE, `${JSON.stringify(responders, null, 2)}\n`);
}

function normalizeTrigger(trigger) {
  return trigger.trim().toLowerCase();
}

function list(guildId) {
  return readResponders()[guildId] || [];
}

function add(guildId, trigger, response) {
  const responders = readResponders();
  const entries = responders[guildId] || [];
  const normalizedTrigger = normalizeTrigger(trigger);
  if (entries.some((entry) => normalizeTrigger(entry.trigger) === normalizedTrigger)) {
    return false;
  }

  entries.push({ trigger: trigger.trim(), response });
  responders[guildId] = entries;
  writeResponders(responders);
  return true;
}

function remove(guildId, trigger) {
  const responders = readResponders();
  const entries = responders[guildId] || [];
  const normalizedTrigger = normalizeTrigger(trigger);
  const filteredEntries = entries.filter(
    (entry) => normalizeTrigger(entry.trigger) !== normalizedTrigger,
  );

  if (filteredEntries.length === entries.length) {
    return false;
  }

  responders[guildId] = filteredEntries;
  writeResponders(responders);
  return true;
}

function find(guildId, messageContent) {
  const normalizedMessage = messageContent.trim().toLowerCase();
  const match = list(guildId).find(
    (entry) => normalizeTrigger(entry.trigger) === normalizedMessage,
  );
  return match?.response || null;
}

module.exports = { list, add, remove, find };