const test = require('node:test');
const assert = require('node:assert/strict');
const {
  IDS,
  buildDashboard,
  buildActionGroupMenu,
  handleComponent,
} = require('../src/antinukeInteractions');

function createFixture() {
  const calls = [];
  const config = {
    enabled: false,
    punishment: 'remove-roles',
    actionPunishments: {},
    raid: { enabled: false, threshold: 5, windowSeconds: 10, punishment: 'kick' },
  };
  const store = {
    getConfig: () => config,
    setEnabled: (_guildId, enabled) => { config.enabled = enabled; },
    setActionPunishment: (_guildId, action, punishment) => {
      config.actionPunishments[action] = punishment;
      return true;
    },
    updateRaidConfig: (_guildId, update) => {
      Object.assign(config.raid, update);
      return true;
    },
  };
  const interaction = {
    guildId: 'guild-1',
    user: { id: 'admin-1' },
    memberPermissions: { has: () => true },
    isButton: () => true,
    isStringSelectMenu: () => false,
    update: async (payload) => calls.push(payload),
    reply: async (payload) => calls.push(payload),
    values: [],
  };
  return { calls, config, store, interaction };
}

test('builds an antinuke panel with protection, raid, and action controls', () => {
  const fixture = createFixture();
  const panel = buildDashboard(fixture.config);
  assert.equal(panel.embeds.length, 1);
  assert.deepEqual(panel.components[0].components.map(({ data }) => data.custom_id), [
    IDS.toggle, IDS.raid, IDS.actions,
  ]);
  assert.ok(buildActionGroupMenu().components[0].options.length >= 10);
});

test('enables antinuke and raid mode and sets a punishment for an action', async () => {
  const fixture = createFixture();
  const { interaction, store, config, calls } = fixture;

  interaction.customId = IDS.toggle;
  await handleComponent(interaction, store);
  assert.equal(config.enabled, true);

  interaction.customId = IDS.raid;
  await handleComponent(interaction, store);
  assert.equal(config.raid.enabled, true);

  interaction.customId = IDS.actions;
  await handleComponent(interaction, store);
  assert.equal(calls.at(-1).components[0].components[0].data.custom_id, IDS.actionGroup);

  interaction.isButton = () => false;
  interaction.isStringSelectMenu = () => true;
  interaction.customId = IDS.actionGroup;
  interaction.values = ['channel-delete'];
  await handleComponent(interaction, store);
  assert.match(calls.at(-1).content, /Channel Delete/);

  interaction.customId = `${IDS.actionGroup.replace(':action-group', ':punishment')}:channel-delete`;
  interaction.values = ['ban'];
  await handleComponent(interaction, store);
  assert.equal(config.actionPunishments['channel-delete'], 'ban');
});

test('rejects setup interactions from users without Manage Server', async () => {
  const fixture = createFixture();
  fixture.interaction.memberPermissions.has = () => false;
  fixture.interaction.customId = IDS.toggle;
  await handleComponent(fixture.interaction, fixture.store);
  assert.match(fixture.calls[0].content, /Manage Server/);
  assert.equal(fixture.config.enabled, false);
});