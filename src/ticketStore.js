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
    panelTitle: 'Support Tickets',
    panelDescription: 'Select a button below to create a private support ticket.',
    buttonLabels: ['Create Ticket'],
    buttonRoleIds: null,
    transcriptChannelId: null,
    nextTicketNumber: 1,
    ...readConfigs()[guildId],
  };
}

function setConfig(guildId, config) {
  const configs = readConfigs();
  const previous = getConfig(guildId);
  configs[guildId] = {
    ...previous,
    ...config,
    ...(Object.hasOwn(config, 'openTickets') ? { openTickets: config.openTickets } : {}),
  };
  writeConfigs(configs);
  return configs[guildId];
}

function reserveTicketNumber(guildId) {
  const configs = readConfigs();
  const current = configs[guildId] || getConfig(guildId);
  const ticketNumber = Number.isInteger(current.nextTicketNumber) && current.nextTicketNumber > 0
    ? current.nextTicketNumber
    : 1;
  configs[guildId] = { ...current, nextTicketNumber: ticketNumber + 1 };
  writeConfigs(configs);
  return ticketNumber;
}

module.exports = { getConfig, setConfig, reserveTicketNumber };