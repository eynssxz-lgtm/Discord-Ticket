const test = require('node:test');
const assert = require('node:assert/strict');
const { EmbedBuilder } = require('discord.js');
const {
  COMMAND_EMBED_COLOR,
  normalizeCommandReply,
  wrapCommandReplyMethods,
} = require('../src/commandReplies');

test('converts command text replies to black-accent embeds', () => {
  const payload = normalizeCommandReply({ content: 'Command succeeded.', ephemeral: true });

  assert.equal(payload.content, undefined);
  assert.equal(payload.embeds[0].description, 'Command succeeded.');
  assert.equal(payload.embeds[0].color, COMMAND_EMBED_COLOR);
  assert.equal(payload.ephemeral, true);
});

test('recolors existing embeds and preserves command reply components', () => {
  const components = [{ type: 1 }];
  const payload = normalizeCommandReply({
    content: 'Choose an option.',
    embeds: [new EmbedBuilder().setTitle('Settings').setColor(0x5865f2)],
    components,
  });

  assert.equal(payload.embeds.length, 2);
  assert.equal(payload.embeds[0].description, 'Choose an option.');
  assert.equal(payload.embeds[1].title, 'Settings');
  assert.ok(payload.embeds.every((embed) => embed.color === COMMAND_EMBED_COLOR));
  assert.equal(payload.components, components);
});

test('wraps command reply methods and normalizes their payloads', async () => {
  const sent = [];
  const target = {
    reply: async (payload) => sent.push(payload),
    followUp: async (payload) => sent.push(payload),
  };
  wrapCommandReplyMethods(target);

  await target.reply('First reply');
  await target.followUp({ content: 'Follow-up' });

  assert.equal(sent.length, 2);
  assert.deepEqual(sent.map(({ embeds }) => embeds[0].description), ['First reply', 'Follow-up']);
  assert.ok(sent.every(({ embeds }) => embeds[0].color === COMMAND_EMBED_COLOR));
});