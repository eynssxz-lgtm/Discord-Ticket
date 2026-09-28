const test = require('node:test');
const assert = require('node:assert/strict');
const { getCommands, buildHelpEmbed } = require('../src/commandInteractions');
const welcomeInteractions = require('../src/welcomeInteractions');

test('registers help, prefix, jail-role, jail, and unjail without replacing welcome commands', () => {
  const commands = [...welcomeInteractions.getCommands(), ...getCommands()];
  const commandNames = commands.map(({ name }) => name);
  assert.deepEqual(commandNames, [
    'edit-embed', 'set-welcome-channel', 'set-welcome-message', 'help', 'set', 'jail', 'unjail',
  ]);

  const setCommand = commands.find(({ name }) => name === 'set');
  assert.deepEqual(setCommand.options.map(({ name }) => name), ['prefix', 'jail-role']);
});

test('help lists slash commands and existing prefixed command families', () => {
  const help = buildHelpEmbed('?');
  const text = help.fields.map(({ value }) => value).join('\n');
  assert.match(text, /`\/set prefix`/);
  assert.match(text, /`\?autoresponder add/);
  assert.match(text, /`\?antinuke/);
  assert.match(text, /`\?jail @member`/);
});