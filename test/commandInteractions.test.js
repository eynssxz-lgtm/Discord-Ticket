const test = require('node:test');
const assert = require('node:assert/strict');
const { getCommands, buildHelpEmbed } = require('../src/commandInteractions');
const {
  buildAfkEmbed,
  buildTicketOpenRow,
  buildTicketPanelEmbed,
  createTicketChannel,
  getRepliedUser,
  parseTicketPanelSettings,
  parsePrefixCommand,
  parseTicketMessage,
} = require('../src/commandHandler');
const welcomeInteractions = require('../src/welcomeInteractions');

test('parses comma-prefixed ticket commands and ignores other messages', () => {
  assert.deepEqual(parseTicketMessage(',ticket setup #tickets @Support #panel'), {
    action: 'setup',
    args: ['#tickets', '@Support', '#panel'],
  });
  assert.deepEqual(parseTicketMessage(',ticket setup #tickets @Default #panel "Support" "Pick a type" "Technical" @Tech @Lead'), {
    action: 'setup',
    args: ['#tickets', '@Default', '#panel', 'Support', 'Pick a type', 'Technical', '@Tech', '@Lead'],
  });
  assert.deepEqual(parseTicketMessage(',TICKET logs #transcripts'), {
    action: 'logs',
    args: ['#transcripts'],
  });
  assert.deepEqual(parseTicketMessage(',ticket set transcript-channel #transcripts'), {
    action: 'set',
    args: ['transcript-channel', '#transcripts'],
  });
  assert.deepEqual(parseTicketMessage(',ticket panel #support "Help desk" "Pick a type" "General help" "Billing"'), {
    action: 'panel',
    args: ['#support', 'Help desk', 'Pick a type', 'General help', 'Billing'],
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

test('builds a ticket panel embed and up to five labeled create buttons', () => {
  const embed = buildTicketPanelEmbed('Get support', 'Choose what you need help with.');
  assert.equal(embed.title, 'Get support');
  assert.equal(embed.description, 'Choose what you need help with.');
  assert.equal(embed.color, 0x000000);

  const row = buildTicketOpenRow(['General', 'Billing', 'Technical']);
  const buttons = row.toJSON().components;
  assert.deepEqual(buttons.map(({ label }) => label), ['General', 'Billing', 'Technical']);
  assert.ok(buttons.every(({ custom_id }) => custom_id.startsWith('ticket:open:')));
  assert.deepEqual(buttons.map(({ custom_id }) => custom_id), ['ticket:open:0', 'ticket:open:1', 'ticket:open:2']);
  assert.throws(() => buildTicketOpenRow(['1', '2', '3', '4', '5', '6']).toJSON());
});

test('parses one to three support roles for each ticket button', () => {
  const guild = {
    roles: {
      cache: new Map([['111', {}], ['222', {}], ['333', {}], ['444', {}]]),
    },
  };
  const parsed = parseTicketPanelSettings([
    'Help', 'Choose a topic', 'General', '<@&111>', '<@&222>', 'Billing', '<@&333>',
  ], guild);

  assert.deepEqual(parsed.settings.buttonLabels, ['General', 'Billing']);
  assert.deepEqual(parsed.settings.buttonRoleIds, [['111', '222'], ['333']]);
  assert.match(parseTicketPanelSettings([
    'Help', 'Choose a topic', 'General', '<@&111>', '<@&222>', '<@&333>', '<@&444>',
  ], guild).error, /one to three support-role mentions/);
});

test('creates a ticket with only the support roles configured for its button', async () => {
  let channelOptions;
  const ticketChannel = { send: async () => {} };
  const guild = {
    id: 'guild-id',
    client: { user: { id: 'bot-id' } },
    channels: {
      cache: { find: () => null },
      create: async (options) => {
        channelOptions = options;
        return ticketChannel;
      },
    },
  };

  await createTicketChannel(guild, { id: 'user-id', username: 'Casey' }, {
    categoryId: 'category-id',
    supportRoleId: 'legacy-role',
    buttonRoleIds: [['general-role'], ['billing-role', 'billing-lead-role']],
  }, 1);

  const overwriteIds = channelOptions.permissionOverwrites.map(({ id }) => id);
  assert.ok(overwriteIds.includes('billing-role'));
  assert.ok(overwriteIds.includes('billing-lead-role'));
  assert.ok(!overwriteIds.includes('general-role'));
  assert.ok(!overwriteIds.includes('legacy-role'));
});

test('builds the AFK confirmation as an embed containing the reason', () => {
  const embed = buildAfkEmbed({
    id: 'user-123',
    username: 'Casey',
    displayAvatarURL: ({ size }) => `https://cdn.example.com/avatar-${size}.png`,
  }, 'Away for lunch');
  assert.equal(embed.author.name, 'Casey is AFK');
  assert.equal(embed.author.icon_url, 'https://cdn.example.com/avatar-128.png');
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
  assert.match(text, /`,ticket setup #tickets @Default \[#panel\] "title" "description" "button" @Role/);
  assert.match(text, /`,ticket panel \[#channel\] "title" "description" "button" @Role/);
  assert.match(text, /1-3 support roles/);
  assert.match(text, /`,ticket panel \[#channel\] "title" "description" "button" @Role/);
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