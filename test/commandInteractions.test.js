const test = require('node:test');
const assert = require('node:assert/strict');
const { getCommands, buildHelpEmbed } = require('../src/commandInteractions');
const {
  buildAfkEmbed,
  getRepliedUser,
  parsePrefixCommand,
  parseTicketMessage,
} = require('../src/commandHandler');
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
  assert.deepEqual(parseTicketMessage(',ticket set transcript-channel #transcripts'), {
    action: 'set',
    args: ['transcript-channel', '#transcripts'],
  });
  assert.deepEqual(parseTicketMessage(',ticket'), { action: 'help', args: [] });
  assert.equal(parseTicketMessage('ticket setup #tickets @Support'), null);
});

test('parses comma-prefixed aliases for regular slash command families', () => {
  assert.deepEqual(parsePrefixCommand(',timeout @member 10m "breaking rules"'), {
    name: 'timeout',
    rawArgs: '@member 10m "breaking rules"',
    args: ['@member', '10m', 'breaking rules'],
  });
  assert.deepEqual(parsePrefixCommand(',welcome embed clear title'), {
    name: 'welcome',
    rawArgs: 'embed clear title',
    args: ['embed', 'clear', 'title'],
  });
  assert.deepEqual(parsePrefixCommand(',av @member'), {
    name: 'avatar',
    rawArgs: '@member',
    args: ['@member'],
  });
  assert.equal(parsePrefixCommand(',cover @member').name, 'cover');
  assert.equal(parsePrefixCommand('/timeout member:@member duration:10m'), null);
});

test('resolves the user from a replied-to message for avatar and cover shortcuts', async () => {
  const repliedUser = { id: 'user-123', username: 'Taylor' };
  const message = {
    reference: { messageId: 'message-456' },
    channel: { messages: { fetch: async () => ({ author: repliedUser }) } },
  };

  assert.equal(await getRepliedUser(message), repliedUser);
  assert.equal(await getRepliedUser({ reference: null }), null);
});

test('builds the AFK confirmation as an embed containing the reason', () => {
  const embed = buildAfkEmbed({ id: 'user-123' }, 'Away for lunch');
  assert.equal(embed.title, '<@user-123> is AFK');
  assert.equal(embed.description, 'Away for lunch');
  assert.match(embed.footer.text, /clears when you send a message/);
});

test('registers slash commands for every supported command family', () => {
  const commands = [...welcomeInteractions.getCommands(), ...getCommands()];
  const commandNames = commands.map(({ name }) => name);
  assert.deepEqual(commandNames, [
    'edit-embed', 'set-welcome-channel', 'set-welcome-message', 'welcome', 'help', 'set',
    'kick', 'ban', 'timeout', 'mute', 'purge', 'jail', 'unjail', 'avatar', 'cover',
    'ticket', 'role', 'afk', 'autoresponder', 'antinuke',
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
  assert.match(text, /`,ticket set transcript-channel #transcripts`/);
  assert.match(text, /`,ticket create @member`/);
  assert.match(text, /`,ticket transcript`/);
  assert.match(text, /`,timeout @member 10m \[reason\]`/);
  assert.match(text, /`,av \[@member\]`/);
  assert.match(text, /`,cover \[@member\]`/);
  assert.match(text, /`,autoresponder add trigger response`/);
  assert.match(text, /`,antinuke enable\|disable\|status`/);
  assert.match(text, /`,welcome status\|disable\|preview`/);
  assert.doesNotMatch(text, /`\/ticket setup/);
  assert.match(text, /`\/kick member \[reason\]`/);
  assert.match(text, /`\/cover \[member\]`/);
  assert.equal((text.match(/`\/jail member`/g) || []).length, 1);
  assert.doesNotMatch(text, /`\/mod\b/);
  assert.doesNotMatch(text, /!/);
});