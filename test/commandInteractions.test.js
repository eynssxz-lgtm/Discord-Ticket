const test = require('node:test');
const assert = require('node:assert/strict');
const { getCommands, buildHelpEmbed, isCommaHelpCommand } = require('../src/commandInteractions');
const welcomeInteractions = require('../src/welcomeInteractions');

test('registers slash commands for every former prefix command family', () => {
  const commands = [...welcomeInteractions.getCommands(), ...getCommands()];
  const commandNames = commands.map(({ name }) => name);
  assert.deepEqual(commandNames, [
    'edit-embed', 'set-welcome-channel', 'set-welcome-message', 'welcome', 'help', 'set',
    'kick', 'ban', 'timeout', 'mute', 'purge', 'jail', 'unjail', 'avatar', 'cover',
    'mod', 'role', 'add', 'ticket', 'afk', 'autoresponder', 'antinuke', 'antinsfw',
  ]);

  const setCommand = commands.find(({ name }) => name === 'set');
  assert.deepEqual(setCommand.options.map(({ name }) => name), ['logs', 'temp-voice', 'jail-role']);
  const logOptions = setCommand.options.find(({ name }) => name === 'logs').options;
  assert.deepEqual(logOptions.map(({ name }) => name), ['channel', 'type']);
  assert.deepEqual(logOptions[1].choices.map(({ value }) => value), [
    'default', 'voice', 'message-delete', 'image-delete', 'video-delete', 'security',
  ]);
  const roleCommand = commands.find(({ name }) => name === 'role');
  assert.equal(roleCommand.default_member_permissions, '268435456');
  assert.deepEqual(roleCommand.options.map(({ name }) => name), ['add']);
  assert.deepEqual(roleCommand.options[0].options.map(({ name }) => name), ['member', 'role']);
  const bulkRoleCommand = commands.find(({ name }) => name === 'add');
  assert.deepEqual(bulkRoleCommand.options.map(({ name }) => name), ['role']);
  assert.deepEqual(bulkRoleCommand.options[0].options.map(({ name }) => name), ['all']);
  assert.deepEqual(bulkRoleCommand.options[0].options[0].options.map(({ name }) => name), ['role', 'members']);
  assert.deepEqual(bulkRoleCommand.options[0].options[0].options[1].choices.map(({ value }) => value), ['users', 'bots', 'all']);
  const afkCommand = commands.find(({ name }) => name === 'afk');
  assert.deepEqual(afkCommand.options.map(({ name }) => name), ['reason']);
  const ticketCommand = commands.find(({ name }) => name === 'ticket');
  assert.deepEqual(ticketCommand.options.map(({ name }) => name), ['setup']);
  assert.deepEqual(ticketCommand.options[0].options.map(({ name }) => name), ['channel', 'category', 'support-role']);
  const antinsfwCommand = commands.find(({ name }) => name === 'antinsfw');
  assert.deepEqual(antinsfwCommand.options.map(({ name }) => name), ['server']);
  assert.deepEqual(antinsfwCommand.options[0].options.map(({ name }) => name), ['link']);
  const antinukeCommand = commands.find(({ name }) => name === 'antinuke');
  assert.ok(antinukeCommand.options.some(({ name }) => name === 'setup'));
  assert.ok(antinukeCommand.options.some(({ name }) => name === 'set-action-punishment'));
  assert.ok(antinukeCommand.options.some(({ name }) => name === 'raid-config'));
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

test('help lists slash commands without prefix variants', () => {
  const help = buildHelpEmbed();
  const text = help.fields.map(({ value }) => value).join('\n');
  assert.match(text, /`\/set logs \[channel\] \[type\]`/);
  assert.match(text, /`\/antinsfw server link enabled:true\|false`/);
  assert.match(text, /`\/role add member role`/);
  assert.match(text, /`\/ticket setup/);
  assert.match(text, /`\/antinsfw server link/);
  assert.match(text, /`\/afk \[reason\]`/);
  assert.match(text, /`\/autoresponder add trigger response`/);
  assert.match(text, /`\/antinuke set-punishment punishment`/);
  assert.match(text, /`\/antinuke setup`/);
  assert.match(text, /`\/antinuke raid-config/);
  assert.match(text, /`\/antinuke whitelist-role add\|remove\|list role`/);
  assert.match(text, /`\/antinuke whitelist-category add\|remove\|list channel`/);
  assert.match(text, /`\/welcome embed edit`/);
  assert.match(text, /`\/welcome embed clear \[field\]`/);
  assert.match(text, /`\/jail member`/);
  assert.match(text, /`\/mod kick\|ban\|timeout\|mute\|purge\|jail\|unjail\|av\|cover`/);
  assert.doesNotMatch(text, /!/);
});

test('recognizes the comma help alias and uses the same complete help embed', () => {
  assert.equal(isCommaHelpCommand(',help'), true);
  assert.equal(isCommaHelpCommand(' ,HELP '), true);
  assert.equal(isCommaHelpCommand(',help extra'), false);
  const helpText = buildHelpEmbed().fields.map(({ value }) => value).join('\n');
  assert.match(helpText, /`\/antinsfw server link enabled:true\|false`/);
  assert.match(helpText, /`,role add <user ID or mention> <role name, ID, or mention>`/);
  assert.match(helpText, /`\/ticket setup/);
});