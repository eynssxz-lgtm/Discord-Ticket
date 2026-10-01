const test = require('node:test');
const assert = require('node:assert/strict');
const {
  parseChannelId,
  parseEmbedUpdate,
  parseEmbedEdit,
  formatMessage,
  buildPayload,
} = require('../src/welcome');
const {
  EMBED_MODAL_ID,
  EMBED_EDITOR_MENU_ID,
  getCommands,
  buildEmbedEditorMenu,
  buildEmbedModal,
  parseModalValues,
} = require('../src/welcomeInteractions');

test('validates channel IDs and embed fields', () => {
  assert.equal(parseChannelId('<#123>'), '123');
  assert.equal(parseChannelId('123'), '123');
  assert.equal(parseChannelId('nope'), null);
  assert.deepEqual(parseEmbedUpdate('color', '#36a2eb'), { color: '#36a2eb' });
  assert.equal(parseEmbedUpdate('color', 'blue'), null);
  assert.deepEqual(parseEmbedUpdate('image', 'https://example.com/welcome.png'), {
    image: 'https://example.com/welcome.png',
  });
  assert.equal(parseEmbedUpdate('image', 'javascript:alert(1)'), null);
  assert.deepEqual(parseEmbedUpdate('clear', 'title'), { title: null });
  assert.deepEqual(parseEmbedEdit('title: Welcome! | description: Hello {username}! | color: #36a2eb'), {
    title: 'Welcome!',
    description: 'Hello {username}!',
    color: '#36a2eb',
  });
  assert.deepEqual(parseEmbedEdit('thumbnail: clear'), { thumbnail: null });
  assert.equal(parseEmbedEdit('title: Welcome! | color: blue'), null);
  assert.equal(parseEmbedEdit('title: Welcome! | unknown: nope'), null);
});

test('formats member and server placeholders and builds mention-safe embed payloads', () => {
  const member = {
    id: '42',
    displayName: 'Casey Display',
    joinedTimestamp: 2_000,
    user: {
      id: '42',
      username: 'Casey',
      globalName: 'Casey Global',
      createdTimestamp: 1_000,
      displayAvatarURL: () => 'https://cdn.example/users/42.png',
    },
    guild: {
      id: 'guild-7',
      name: 'Example Server',
      memberCount: 12,
      iconURL: () => 'https://cdn.example/guilds/7.png',
    },
  };
  assert.equal(
    formatMessage('Welcome {user} ({username}) to {server}: {memberCount}', member),
    'Welcome <@42> (Casey) to Example Server: 12',
  );

  const payload = buildPayload({
    message: 'Welcome {user}!',
    embed: {
      title: 'Welcome {user.name} ({user.id})',
      description: 'Hello {user.mention} ({user.displayName}) in {channel.name} on {server.name} ({server.id}); {server.memberCount} members.',
      author: '{username}',
      footer: 'Joined {user.joinedAt}; account created {user.createdAt}.',
      color: '#36a2eb',
      image: 'https://cdn.example/welcome/{user.id}.png',
      thumbnail: '{user.avatar}',
    },
  }, member, { id: 'channel-8', name: 'welcome' });
  assert.equal(payload.content, 'Welcome <@42>!');
  assert.equal(payload.embeds.length, 1);
  assert.equal(payload.embeds[0].data.title, 'Welcome Casey Global (42)');
  assert.equal(payload.embeds[0].data.description, 'Hello <@42> (Casey Display) in welcome on Example Server (guild-7); 12 members.');
  assert.equal(payload.embeds[0].data.author.name, 'Casey');
  assert.equal(payload.embeds[0].data.footer.text, 'Joined <t:2:F>; account created <t:1:F>.');
  assert.equal(payload.embeds[0].data.image.url, 'https://cdn.example/welcome/42.png');
  assert.equal(payload.embeds[0].data.thumbnail.url, 'https://cdn.example/users/42.png');
  assert.deepEqual(payload.allowedMentions, { users: ['42'], roles: [], parse: [] });
});

test('preserves placeholders when validating dynamic image URLs', () => {
  assert.deepEqual(parseEmbedUpdate('image', '{user.avatar}'), { image: '{user.avatar}' });
  assert.deepEqual(parseEmbedUpdate('thumbnail', '{server.icon}'), { thumbnail: '{server.icon}' });
  assert.deepEqual(parseEmbedUpdate('image', 'https://example.com/{user.id}.png'), {
    image: 'https://example.com/{user.id}.png',
  });
  assert.equal(parseEmbedUpdate('image', 'javascript:{user.id}'), null);
});

test('omits image variables that resolve to no URL', () => {
  const member = {
    id: 'user-1',
    user: { id: 'user-1', username: 'Casey' },
    guild: { id: 'guild-1', name: 'No Icon', memberCount: 1, iconURL: () => null },
  };
  const payload = buildPayload({ embed: { title: 'Welcome', image: '{server.icon}' } }, member);
  assert.equal(payload.embeds[0].data.title, 'Welcome');
  assert.equal(payload.embeds[0].data.image, undefined);
});

test('registers welcome commands and provides grouped embed editing sections', () => {
  assert.deepEqual(getCommands().map(({ name }) => name), [
    'edit-embed',
    'set-welcome-channel',
    'set-welcome-message',
    'welcome',
  ]);
  const welcomeCommand = getCommands().find(({ name }) => name === 'welcome');
  assert.deepEqual(welcomeCommand.options.map(({ name }) => name), [
    'channel', 'message', 'status', 'disable', 'preview', 'embed',
  ]);
  const menu = buildEmbedEditorMenu().toJSON();
  assert.equal(menu.components[0].custom_id, EMBED_EDITOR_MENU_ID);
  assert.deepEqual(menu.components[0].options.map(({ label }) => label), [
    'Edit basic information', 'Edit author', 'Edit footer', 'Edit images',
  ]);
  const modal = buildEmbedModal('basic', { title: 'Welcome!', color: '#36a2eb' }).toJSON();
  assert.equal(modal.custom_id, `${EMBED_MODAL_ID}:basic`);
  assert.equal(modal.title, 'Edit Basic Information');
  assert.equal(modal.components.length, 3);
  assert.equal(modal.components[0].components[0].value, 'Welcome!');
  assert.equal(buildEmbedModal('author', { author: 'SINCLAIR' }).toJSON().components[0].components[0].value, 'SINCLAIR');
  assert.equal(buildEmbedModal('footer', { footer: 'Welcome' }).toJSON().components.length, 1);
  assert.equal(buildEmbedModal('images', { thumbnail: 'https://example.com/thumb.png' }).toJSON().components.length, 2);
});

test('validates modal values and clears blank optional embed fields', () => {
  assert.deepEqual(parseModalValues('basic', {
    title: 'Welcome',
    description: 'Hello {username}',
    color: '#36a2eb',
  }), {
    title: 'Welcome',
    description: 'Hello {username}',
    color: '#36a2eb',
  });
  assert.deepEqual(parseModalValues('images', {
    image: 'https://example.com/welcome.png',
    thumbnail: '',
  }), { image: 'https://example.com/welcome.png', thumbnail: null });
  assert.deepEqual(parseModalValues('author', { author: '' }), { author: null });
  assert.equal(parseModalValues('basic', { title: '', description: '', color: 'blue' }), null);
});