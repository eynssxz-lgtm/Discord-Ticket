const test = require('node:test');
const assert = require('node:assert/strict');
const { resolveLogChannel, LOG_TYPES } = require('../src/logChannelStore');

test('supports separate log destinations and falls back to legacy default', () => {
  assert.deepEqual(LOG_TYPES, ['default', 'voice', 'message-delete', 'image-delete', 'video-delete', 'security']);
  assert.equal(resolveLogChannel({ default: 'general', 'image-delete': 'images' }, 'image-delete'), 'images');
  assert.equal(resolveLogChannel({ default: 'general', 'image-delete': 'images' }, 'video-delete'), 'general');
  assert.equal(resolveLogChannel({ default: 'general' }, 'default'), 'general');
  assert.equal(resolveLogChannel('legacy-channel', 'image-delete'), 'legacy-channel');
  assert.equal(resolveLogChannel(null, 'message-delete'), null);
});