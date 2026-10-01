const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  StringSelectMenuBuilder,
  PermissionFlagsBits,
} = require('discord.js');
const { ACTION_GROUP_NAMES } = require('./antinuke');
const { PUNISHMENTS } = require('./antinukeStore');

const PREFIX = 'antinuke-ui';
const IDS = {
  toggle: `${PREFIX}:toggle`,
  raid: `${PREFIX}:raid`,
  actions: `${PREFIX}:actions`,
  back: `${PREFIX}:back`,
  actionGroup: `${PREFIX}:action-group`,
};
const ACTION_GROUP_LABELS = {
  'dangerous-permission-grant': 'Dangerous permission grants',
  'dangerous-role-assignment': 'Dangerous role assignments',
  'member-removal': 'Member kicks and bans',
  'member-prune': 'Member pruning',
  'message-bulk-delete': 'Bulk message deletions',
  'raid-join-burst': 'Join raid response',
};
const PUNISHMENT_LABELS = {
  'remove-roles': 'Remove manageable roles',
  timeout: 'Timeout',
  kick: 'Kick',
  ban: 'Ban',
  none: 'Log only',
};

function groupLabel(group) {
  return ACTION_GROUP_LABELS[group]
    || group.split('-').map((part) => `${part[0].toUpperCase()}${part.slice(1)}`).join(' ');
}

function punishmentOptions() {
  return PUNISHMENTS.map((value) => ({ label: PUNISHMENT_LABELS[value], value }));
}

function buildDashboard(config) {
  const overrides = Object.entries(config.actionPunishments || {})
    .filter(([group, punishment]) => punishment !== config.punishment)
    .map(([group, punishment]) => `${groupLabel(group)}: ${PUNISHMENT_LABELS[punishment] || punishment}`);
  const embed = new EmbedBuilder()
    .setColor(config.enabled ? 0x2ecc71 : 0x7f8c8d)
    .setTitle('Antinuke Security Setup')
    .setDescription(config.enabled
      ? 'Protection is enabled. Matching actions are checked against the configured response.'
      : 'Protection is disabled. Enable it when the bot permissions and exemptions are ready.')
    .addFields(
      { name: 'Default response', value: PUNISHMENT_LABELS[config.punishment] || config.punishment, inline: true },
      {
        name: 'Join-raid protection',
        value: `${config.raid.enabled ? 'Enabled' : 'Disabled'} · ${config.raid.threshold} joins / ${config.raid.windowSeconds}s · ${PUNISHMENT_LABELS[config.raid.punishment] || config.raid.punishment}`,
        inline: true,
      },
      { name: 'Action overrides', value: overrides.length ? overrides.slice(0, 10).join('\n') : 'Using the default response for all actions.', inline: false },
    );
  const buttons = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(IDS.toggle)
      .setLabel(config.enabled ? 'Disable protection' : 'Enable protection')
      .setStyle(config.enabled ? ButtonStyle.Danger : ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId(IDS.raid)
      .setLabel(config.raid.enabled ? 'Disable join-raid guard' : 'Enable join-raid guard')
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId(IDS.actions)
      .setLabel('Set action responses')
      .setStyle(ButtonStyle.Primary),
  );
  return { embeds: [embed], components: [buttons] };
}

function buildActionGroupMenu() {
  return new ActionRowBuilder().addComponents(new StringSelectMenuBuilder()
    .setCustomId(IDS.actionGroup)
    .setPlaceholder('Choose a protected action')
    .addOptions([
      ...ACTION_GROUP_NAMES.map((value) => ({ label: groupLabel(value), value })),
      { label: groupLabel('raid-join-burst'), value: 'raid-join-burst' },
    ]));
}

function buildPunishmentMenu(group) {
  return new ActionRowBuilder().addComponents(new StringSelectMenuBuilder()
    .setCustomId(`${PREFIX}:punishment:${group}`)
    .setPlaceholder(`Choose response for ${groupLabel(group)}`)
    .addOptions(punishmentOptions()));
}

function isAntinukeComponent(interaction) {
  return Boolean(
    (interaction.isButton?.() || interaction.isStringSelectMenu?.())
    && interaction.customId?.startsWith(`${PREFIX}:`),
  );
}

async function handleComponent(interaction, store) {
  if (!isAntinukeComponent(interaction)) return false;
  if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) {
    await interaction.reply({ content: 'You need the Manage Server permission to configure antinuke.', ephemeral: true });
    return true;
  }

  const config = store.getConfig(interaction.guildId);
  if (interaction.customId === IDS.toggle) {
    store.setEnabled(interaction.guildId, !config.enabled);
  } else if (interaction.customId === IDS.raid) {
    store.updateRaidConfig(interaction.guildId, { enabled: !config.raid.enabled });
  } else if (interaction.customId === IDS.actions) {
    await interaction.update({
      content: 'Choose the action group to configure:',
      embeds: [],
      components: [buildActionGroupMenu(), new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(IDS.back).setLabel('Back').setStyle(ButtonStyle.Secondary),
      )],
    });
    return true;
  } else if (interaction.customId === IDS.back) {
    await interaction.update({ content: null, ...buildDashboard(config) });
    return true;
  } else if (interaction.customId === IDS.actionGroup) {
    const group = interaction.values[0];
    await interaction.update({
      content: `Choose a punishment for **${groupLabel(group)}**:`,
      embeds: [],
      components: [buildPunishmentMenu(group), new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(IDS.actions).setLabel('Choose another action').setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId(IDS.back).setLabel('Back to setup').setStyle(ButtonStyle.Secondary),
      )],
    });
    return true;
  } else if (interaction.customId.startsWith(`${PREFIX}:punishment:`)) {
    const group = interaction.customId.slice(`${PREFIX}:punishment:`.length);
    const punishment = interaction.values[0];
    if (group === 'raid-join-burst') {
      store.updateRaidConfig(interaction.guildId, { punishment });
    } else {
      store.setActionPunishment(interaction.guildId, group, punishment);
    }
    await interaction.update({
      content: `${groupLabel(group)} response set to **${PUNISHMENT_LABELS[punishment]}**.`,
      embeds: [],
      components: [new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(IDS.actions).setLabel('Configure another action').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId(IDS.back).setLabel('Back to setup').setStyle(ButtonStyle.Secondary),
      )],
    });
    return true;
  } else {
    return false;
  }

  await interaction.update({ content: null, ...buildDashboard(store.getConfig(interaction.guildId)) });
  return true;
}

module.exports = {
  PREFIX,
  IDS,
  groupLabel,
  buildDashboard,
  buildActionGroupMenu,
  buildPunishmentMenu,
  isAntinukeComponent,
  handleComponent,
};