const test = require('node:test');
const assert = require('node:assert/strict');
const { buildDeletedMessageLog } = require('../src/messageLogs');

test('builds a deleted-message embed with author, channel, time, and content', () => {
  const message = {
    id: 'message-123',
    content: 'Please review this update.',
    createdAt: new Date('2026-09-28T12:00:00.000Z'),
    author: {
      id: 'user-456',
      tag: 'Casey#1234',
      displayAvatarURL: () => 'https://cdn.example.com/avatar.png',
    },
    channel: { id: 'channel-789' },
    attachments: new Map(),
  };

  const payload = buildDeletedMessageLog(message);
  const [embed] = payload.embeds;
  assert.equal(embed.title, 'Message deleted');
  assert.equal(embed.author.name, 'Casey#1234');
  assert.equal(embed.author.icon_url, 'https://cdn.example.com/avatar.png');
  assert.equal(embed.description, 'Please review this update.');
  assert.deepEqual(embed.fields.map(({ value }) => value), [
    '<@user-456> (user-456)', '<#channel-789>', 'message-123',
  ]);
  assert.equal(embed.timestamp, '2026-09-28T12:00:00.000Z');
  assert.deepEqual(payload.allowedMentions, { parse: [] });
});

test('includes an image attachment in the deleted-message embed', () => {
  const payload = buildDeletedMessageLog({
    id: 'message-123',
    content: '',
    author: { id: 'user-456', username: 'Casey' },
    channel: { id: 'channel-789' },
    attachments: new Map([['attachment-1', {
      url: 'https://cdn.example.com/deleted-image.png',
      contentType: 'image/png',
    }]]),
  });

  const [embed] = payload.embeds;
  assert.equal(embed.description, '[No text content]');
  assert.equal(embed.image.url, 'https://cdn.example.com/deleted-image.png');
});
