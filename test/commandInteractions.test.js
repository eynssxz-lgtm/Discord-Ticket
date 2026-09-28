const test = require('node:test');
const assert = require('node:assert/strict');
const { getCommands, buildHelpEmbed } = require('../src/commandInteractions');
const welcomeInteractions = require('../src/welcomeInteractions');

test('registers slash commands for every former prefix command family', () => {
  const commands = [...welcomeInteractions.getCommands(), ...getCommands()];
  const commandNames = commands.map(({ name }) => name);
  assert.deepEqual(commandNames, [
    'edit-embed', 'set-welcome-channel', 'set-welcome-message', 'welcome', 'help', 'set',
    'kick', 'ban', 'timeout', 'mute', 'purge', 'jail', 'unjail', 'avatar', 'cover',
    'mod', 'role', 'afk', 'autoresponder', 'antinuke',
  ]);

  const setCommand = commands.find(({ name }) => name === 'set');
  assert.deepEqual(setCommand.options.map(({ name }) => name), ['logs', 'temp-voice', 'jail-role']);
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

test('help lists slash commands without prefix variants', () => {
  const help = buildHelpEmbed();
  const text = help.fields.map(({ value }) => value).join('\n');
  assert.match(text, /`\/set logs \[channel\]`/);
  assert.match(text, /`\/role add member role`/);
  assert.match(text, /`\/afk \[reason\]`/);
  assert.match(text, /`\/autoresponder add trigger response`/);
  assert.match(text, /`\/antinuke set-punishment punishment`/);
  assert.match(text, /`\/antinuke whitelist-role add\|remove\|list role`/);
  assert.match(text, /`\/antinuke whitelist-category add\|remove\|list channel`/);
  assert.match(text, /`\/welcome embed edit`/);
  assert.match(text, /`\/welcome embed clear \[field\]`/);
  assert.match(text, /`\/jail member`/);
  assert.match(text, /`\/mod kick\|ban\|timeout\|mute\|purge\|jail\|unjail\|av\|cover`/);
  assert.doesNotMatch(text, /!/);
});