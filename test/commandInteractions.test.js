const test = require('node:test');
const assert = require('node:assert/strict');
const { getCommands, buildHelpEmbed } = require('../src/commandInteractions');
const { parseTicketMessage } = require('../src/commandHandler');
const welcomeInteractions = require('../src/welcomeInteractions');

test('parses comma-prefixed ticket commands and ignores other messages', () => {
  assert.deepEqual(parseTicketMessage(',ticket setup #tickets @Support #panel'), {
    action: 'setup',
    args: ['#tickets', '@Support', '#panel'],
  });
  assert.deepEqual(parseTicketMessage(',TICKET logs #transcripts'), {
    action: 'logs',
    args: ['#transcripts'],
  });
  assert.deepEqual(parseTicketMessage(',ticket'), { action: 'help', args: [] });
  assert.equal(parseTicketMessage('ticket setup #tickets @Support'), null);
});

test('registers slash commands for every supported command family', () => {
  const commands = [...welcomeInteractions.getCommands(), ...getCommands()];
  const commandNames = commands.map(({ name }) => name);
  assert.deepEqual(commandNames, [
    'edit-embed', 'set-welcome-channel', 'set-welcome-message', 'welcome', 'help', 'set',
    'mod', 'ticket', 'role', 'afk', 'autoresponder', 'antinuke',
  ]);

  const setCommand = commands.find(({ name }) => name === 'set');
  assert.deepEqual(setCommand.options.map(({ name }) => name), ['logs', 'temp-voice', 'jail-role']);
  const ticketCommand = commands.find(({ name }) => name === 'ticket');
  assert.deepEqual(ticketCommand.options.map(({ name }) => name), ['create', 'close']);
  const roleCommand = commands.find(({ name }) => name === 'role');
  assert.equal(roleCommand.default_member_permissions, '268435456');
  assert.deepEqual(roleCommand.options.map(({ name }) => name), ['add']);
  assert.deepEqual(roleCommand.options[0].options.map(({ name }) => name), ['member', 'role']);
  const afkCommand = commands.find(({ name }) => name === 'afk');
  assert.deepEqual(afkCommand.options.map(({ name }) => name), ['reason']);
  const antinukeCommand = commands.find(({ name }) => name === 'antinuke');
  const punishmentChoices = antinukeCommand.options
    .find(({ name }) => name === 'set-punishment').options[0].choices;
  assert.ok(punishmentChoices.some(({ value }) => value === 'remove-roles'));
  assert.ok(antinukeCommand.options.some(({ name }) => name === 'whitelist-role'));
  assert.ok(antinukeCommand.options.some(({ name }) => name === 'whitelist-category'));
  assert.ok(antinukeCommand.options.some(({ name }) => name === 'whitelist-channel'));
  const welcomeCommand = commands.find(({ name }) => name === 'welcome');
  assert.ok(welcomeCommand.options.some(({ name }) => name === 'status'));
  assert.ok(welcomeCommand.options.some(({ name }) => name === 'embed'));
});

test('help lists the supported command families and ticket setup', () => {
  const help = buildHelpEmbed();
  const text = help.fields.map(({ value }) => value).join('\n');
  assert.match(text, /`\/set logs \[channel\]`/);
  assert.match(text, /`\/role add member role`/);
  assert.match(text, /`\/afk \[reason\]`/);
  assert.match(text, /`\/autoresponder add trigger response`/);
  assert.match(text, /`\/antinuke set-punishment punishment`/);
  assert.match(text, /`,ticket setup #tickets @Support \[#panel\]`/);
  assert.match(text, /`,ticket panel \[#channel\]`/);
  assert.match(text, /`,ticket logs #transcripts`/);
  assert.match(text, /`,ticket transcript`/);
  assert.doesNotMatch(text, /`\/ticket setup/);
  assert.match(text, /`\/mod kick\|ban\|timeout\|mute\|purge\|jail\|unjail\|av\|cover`/);
  assert.doesNotMatch(text, /!/);
});