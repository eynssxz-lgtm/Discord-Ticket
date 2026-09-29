const test = require('node:test');
const assert = require('node:assert/strict');
const { buildDeletedMessageLog, buildServerLogPayload } = require('../src/messageLogs');

test('formats server audit messages such as voice updates as black embeds', () => {
  const payload = buildServerLogPayload('Casey joined <#voice-123>.');

  assert.equal(payload.embeds.length, 1);
  assert.equal(payload.embeds[0].color, 0x000000);
  assert.equal(payload.embeds[0].title, 'Server log');
  assert.equal(payload.embeds[0].description, 'Casey joined <#voice-123>.');
  assert.deepEqual(payload.allowedMentions, { parse: [] });
});

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
  assert.equal(embed.color, 0x000000);
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

test('includes the deleted video itself as a file attachment in the log payload', () => {
  const payload = buildDeletedMessageLog({
    id: 'message-234',
    content: 'Watch this clip',
    author: { id: 'user-456', username: 'Casey' },
    channel: { id: 'channel-789' },
    attachments: new Map([['video-1', {
      url: 'https://cdn.example.com/clip.mp4',
      name: 'clip.mp4',
      contentType: 'video/mp4',
    }]]),
  });

  assert.equal(payload.embeds[0].description, 'Watch this clip');
  assert.deepEqual(payload.files, [{
    attachment: 'https://cdn.example.com/clip.mp4',
    name: 'clip.mp4',
  }]);
});
