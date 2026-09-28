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
    'mod', 'autoresponder', 'antinuke',
  ]);

  const setCommand = commands.find(({ name }) => name === 'set');
  assert.deepEqual(setCommand.options.map(({ name }) => name), ['logs', 'temp-voice', 'jail-role']);
  const antinukeCommand = commands.find(({ name }) => name === 'antinuke');
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
  assert.match(text, /`\/set logs`/);
  assert.match(text, /`\/autoresponder add\|remove\|list`/);
  assert.match(text, /`\/antinuke`/);
  assert.match(text, /`\/jail`/);
  assert.doesNotMatch(text, /!/);
});