const {
  AuditLogEvent,
  EmbedBuilder,
  GatewayIntentBits,
  PermissionsBitField,
} = require('discord.js');

const ACTION_GROUPS = new Map([
  [AuditLogEvent.GuildUpdate, 'guild-update'],
  [AuditLogEvent.ChannelCreate, 'channel-create'],
  [AuditLogEvent.ChannelDelete, 'channel-delete'],
  [AuditLogEvent.ChannelOverwriteCreate, 'dangerous-permission-grant'],
  [AuditLogEvent.ChannelOverwriteUpdate, 'dangerous-permission-grant'],
  [AuditLogEvent.RoleDelete, 'role-delete'],
  [AuditLogEvent.RoleCreate, 'role-create'],
  [AuditLogEvent.RoleUpdate, 'dangerous-permission-grant'],
  [AuditLogEvent.MemberRoleUpdate, 'dangerous-role-assignment'],
  [AuditLogEvent.MemberBanAdd, 'member-removal'],
  [AuditLogEvent.MemberKick, 'member-removal'],
  [AuditLogEvent.MemberPrune, 'member-prune'],
  [AuditLogEvent.BotAdd, 'bot-add'],
  [AuditLogEvent.InviteCreate, 'invite-create'],
  [AuditLogEvent.InviteUpdate, 'invite-change'],
  [AuditLogEvent.InviteDelete, 'invite-change'],
  [AuditLogEvent.WebhookCreate, 'webhook-change'],
  [AuditLogEvent.WebhookUpdate, 'webhook-change'],
  [AuditLogEvent.WebhookDelete, 'webhook-change'],
  [AuditLogEvent.MessageBulkDelete, 'message-bulk-delete'],
  [AuditLogEvent.IntegrationCreate, 'integration-change'],
  [AuditLogEvent.IntegrationUpdate, 'integration-change'],
  [AuditLogEvent.IntegrationDelete, 'integration-change'],
  [AuditLogEvent.EmojiCreate, 'emoji-change'],
  [AuditLogEvent.EmojiUpdate, 'emoji-change'],
  [AuditLogEvent.EmojiDelete, 'emoji-change'],
  [AuditLogEvent.StickerCreate, 'sticker-change'],
  [AuditLogEvent.StickerUpdate, 'sticker-change'],
  [AuditLogEvent.StickerDelete, 'sticker-change'],
  [AuditLogEvent.ThreadDelete, 'thread-delete'],
  [AuditLogEvent.AutoModerationRuleCreate, 'automod-rule-change'],
  [AuditLogEvent.AutoModerationRuleUpdate, 'automod-rule-change'],
  [AuditLogEvent.AutoModerationRuleDelete, 'automod-rule-change'],
]);
const ACTION_GROUP_NAMES = [...new Set(ACTION_GROUPS.values())];
const DANGEROUS_PERMISSIONS = [
  'Administrator',
  'ManageGuild',
  'ManageRoles',
  'ManageChannels',
  'ManageWebhooks',
  'ManageMessages',
  'ManageThreads',
  'ManageEvents',
  'ManageGuildExpressions',
  'ManageEmojisAndStickers',
  'ViewAuditLog',
  'BanMembers',
  'KickMembers',
  'ModerateMembers',
  'MentionEveryone',
].map((name) => PermissionsBitField.Flags[name]).filter((flag) => flag !== undefined);
const THRESHOLD = 1;
const WINDOW_MS = 1_000;
const DELETED_CHANNEL_TTL_MS = 20_000;
const TIMEOUT_MS = 10 * 60 * 1000;
const PUNISHMENTS = ['remove-roles', 'timeout', 'kick', 'ban', 'none'];
const PUNISHMENT_PERMISSIONS = {
  'remove-roles': PermissionsBitField.Flags.ManageRoles,
  timeout: PermissionsBitField.Flags.ModerateMembers,
  kick: PermissionsBitField.Flags.KickMembers,
  ban: PermissionsBitField.Flags.BanMembers,
};
const PUNISHMENT_PERMISSION_NAMES = {
  'remove-roles': 'Manage Roles',
  timeout: 'Moderate Members',
  kick: 'Kick Members',
  ban: 'Ban Members',
};
const DISCORD_INVITE_URL = /(?<![\w.-])(?:https?:\/\/)?(?:www\.)?(?:discord\.gg|discord(?:app)?\.com\/invite)\/[A-Za-z0-9-]+(?:[?#][^\s]*)?/i;

function parseSnowflake(value) {
  const match = value.match(/^(?:<@&?(\d+)>|<#(\d+)>|(\d+))$/);
  return match?.[1] || match?.[2] || match?.[3] || null;
}

function getActionGroup(action) {
  return ACTION_GROUPS.get(action) || null;
}

function containsDiscordInvite(content) {
  return typeof content === 'string' && DISCORD_INVITE_URL.test(content);
}

function permissionBits(value) {
  if (value == null) return 0n;
  try {
    return BigInt(value.bitfield ?? value);
  } catch {
    return 0n;
  }
}

function containsDangerousPermission(value) {
  const bits = permissionBits(value);
  return DANGEROUS_PERMISSIONS.some((flag) => (bits & flag) === flag);
}

function hasDangerousPermissionGrant(entry) {
  const change = entry.changes?.find(({ key }) => (
    key === 'permissions' || key === 'allow'
  ));
  if (!change) return false;
  const oldBits = permissionBits(change.old);
  const newBits = permissionBits(change.new);
  const grantedBits = newBits & ~oldBits;
  return containsDangerousPermission(grantedBits);
}

function hasDangerousRoleAssignment(entry, guild) {
  const additions = entry.changes?.find(({ key }) => key === '$add')?.new;
  if (!Array.isArray(additions)) return false;
  return additions.some(({ id }) => (
    id && containsDangerousPermission(guild.roles.cache.get(id)?.permissions)
  ));
}

function isMonitoredEntry(entry, guild) {
  const actionGroup = getActionGroup(entry.action);
  if (!actionGroup) return null;
  if (actionGroup === 'dangerous-permission-grant' && !hasDangerousPermissionGrant(entry)) return null;
  if (actionGroup === 'dangerous-role-assignment' && !hasDangerousRoleAssignment(entry, guild)) return null;
  return actionGroup;
}

function isWhitelistedTarget(config, targetId, parentId, isCategory) {
  if (config.channelIds.includes(targetId)) {
    return true;
  }
  return isCategory
    ? config.categoryIds.includes(targetId)
    : Boolean(parentId && config.categoryIds.includes(parentId));
}

function hasWhitelistedRole(config, roleIds) {
  return roleIds.some((id) => config.roleIds.includes(id));
}

function getReadiness(guild, client, punishment, config = {}) {
  const permissions = guild.members.me?.permissions;
  const requiredPunishmentPermission = PUNISHMENT_PERMISSIONS[punishment] || null;
  const configuredPunishments = [
    punishment,
    ...Object.values(config.actionPunishments || {}),
    ...(config.raid?.enabled ? [config.raid.punishment] : []),
  ];
  const missingPunishmentPermissions = [...new Set(configuredPunishments)]
    .filter((configuredPunishment) => {
      const requiredPermission = PUNISHMENT_PERMISSIONS[configuredPunishment];
      return requiredPermission && !permissions?.has(requiredPermission);
    })
    .map((configuredPunishment) => PUNISHMENT_PERMISSION_NAMES[configuredPunishment]);
  return {
    moderationIntent: Boolean(client.options?.intents?.has?.(GatewayIntentBits.GuildModeration)),
    viewAuditLog: Boolean(permissions?.has(PermissionsBitField.Flags.ViewAuditLog)),
    punishmentPermission: requiredPunishmentPermission === null
      || Boolean(permissions?.has(requiredPunishmentPermission)),
    punishmentPermissionName: PUNISHMENT_PERMISSION_NAMES[punishment] || null,
    missingPunishmentPermissions,
  };
}

async function applyPunishment(member, punishment, reason) {
  if (punishment === 'remove-roles') {
    const removableRoles = [...member.roles.cache.values()].filter((role) => role.editable);
    if (removableRoles.length === 0) {
      throw new Error('The bot cannot manage any of this member\'s roles. Move the bot role above the member roles.');
    }
    await member.roles.remove(removableRoles, reason);
    return true;
  }
  if (punishment === 'timeout') {
    await member.timeout(TIMEOUT_MS, reason);
    return true;
  }
  if (punishment === 'kick') {
    await member.kick(reason);
    return true;
  }
  if (punishment === 'ban') {
    await member.ban({ reason });
    return true;
  }
  if (punishment === 'none') {
    return false;
  }
  throw new Error(`Unsupported antinuke punishment: ${punishment}`);
}

async function sendPunishmentNotice(member, guild, actionGroup, punishment) {
  if (punishment === 'none') return;
  const user = member.user || member;
  const seconds = WINDOW_MS / 1000;
  const secondWord = seconds === 1 ? 'second' : 'seconds';
  const embed = new EmbedBuilder()
    .setColor(0xed4245)
    .setTitle('User Punished')
    .setDescription(`Security responded in ${seconds} ${secondWord}! AYOKO SAYO WANNA BE NUKER KA BOBO\n\nAnti Nuke has punished a user, details:`)
    .addFields(
      { name: 'Server', value: guild.name || guild.id, inline: false },
      { name: 'User', value: `${user.tag || user.username || member.id} (<@${member.id}>)`, inline: false },
      { name: 'Action', value: actionGroup.replaceAll('-', ' '), inline: true },
      { name: 'Punishment Type', value: punishment, inline: true },
    );
  try {
    await member.send({ embeds: [embed], allowedMentions: { parse: [] } });
  } catch (error) {
    console.warn(`Could not DM antinuke notice to ${member.id}:`, error.message);
  }
}

function attach(client, store, logIncident = async () => {}) {
  const recentActions = new Map();
  const recentJoins = new Map();
  const deletedChannels = new Map();
  const lastPunishments = new Map();

  const processAction = async (guild, member, actorId, actionGroup, targetId, config, punishmentOverride = null) => {
    if (hasWhitelistedRole(config, member.roles.cache.keys())) {
      await writeIncidentLog(logIncident, guild, `🛡️ Antinuke skipped **${actionGroup}** by <@${actorId}>: actor has a whitelisted role.`);
      return;
    }

    const now = Date.now();
    const rateKey = `${guild.id}:${actorId}:${actionGroup}`;
    const actions = (recentActions.get(rateKey) || []).filter((timestamp) => now - timestamp < WINDOW_MS);
    actions.push(now);
    recentActions.set(rateKey, actions);
    if (actions.length < THRESHOLD) {
      await writeIncidentLog(logIncident, guild, `🛡️ Antinuke observed **${actionGroup}** by <@${actorId}> (${actions.length}/${THRESHOLD} actions).`);
      return;
    }

    const punishmentKey = `${guild.id}:${actorId}`;
    if (now - (lastPunishments.get(punishmentKey) || 0) < WINDOW_MS) {
      await writeIncidentLog(logIncident, guild, `🛡️ Antinuke observed **${actionGroup}** by <@${actorId}> but rate-limited a repeated punishment inside ${WINDOW_MS}ms.`);
      return;
    }

    const entry = { executorId: actorId, targetId };
    const reason = `SINCLAIR antinuke: ${actionGroup} threshold exceeded`;
    const punishment = punishmentOverride
      || store.getActionPunishment?.(config, actionGroup)
      || config.actionPunishments?.[actionGroup]
      || config.punishment;
    const notifyBeforePunishment = punishment === 'kick' || punishment === 'ban';
    const noticePromise = notifyBeforePunishment
      ? sendPunishmentNotice(member, guild, actionGroup, punishment)
      : null;
    let punished;
    try {
      punished = await applyPunishment(member, punishment, reason);
    } catch (error) {
      await writeIncidentLog(logIncident, guild, formatIncident(entry, actionGroup, punishment, 'failed'));
      throw error;
    }
    if (noticePromise) await noticePromise;
    if (punished && !notifyBeforePunishment) {
      await sendPunishmentNotice(member, guild, actionGroup, punishment);
    }
    lastPunishments.set(punishmentKey, now);
    const outcome = punished ? `applied ${punishment}` : 'detected (no punishment)';
    console.warn(`Antinuke ${outcome} for ${actorId} in guild ${guild.id} for ${actionGroup}.`);
    await writeIncidentLog(logIncident, guild, formatIncident(
      entry,
      actionGroup,
      punishment,
      punished ? `applied ${punishment}` : 'detected; no punishment configured',
    ));
  };

  client.on('channelDelete', (channel) => {
    deletedChannels.set(`${channel.guild.id}:${channel.id}`, {
      parentId: channel.parentId,
      isCategory: channel.type === 4,
    });
    const cleanupTimer = setTimeout(() => {
      deletedChannels.delete(`${channel.guild.id}:${channel.id}`);
    }, DELETED_CHANNEL_TTL_MS);
    cleanupTimer.unref?.();
  });

  client.on('guildAuditLogEntryCreate', async (entry, guild) => {
    const actionGroup = isMonitoredEntry(entry, guild);
    if (!actionGroup) return;

    const config = store.getConfig(guild.id);
    if (!config.enabled) return;
    if (!entry.executorId) {
      await writeIncidentLog(logIncident, guild, `🛡️ Antinuke received **${actionGroup}**, but Discord did not attribute an executor. No punishment was possible.`);
      return;
    }
    if (entry.executorId === client.user?.id) return;
    if (entry.executorId === guild.ownerId) {
      await writeIncidentLog(logIncident, guild, `🛡️ Antinuke skipped **${actionGroup}**: the executor is the server owner.`);
      return;
    }

    const targetChannel = actionGroup === 'channel-delete'
      ? guild.channels.cache.get(entry.targetId)
      : null;
    const deletionInfo = actionGroup === 'channel-delete'
      ? deletedChannels.get(`${guild.id}:${entry.targetId}`)
      : null;
    const parentId = targetChannel?.parentId ?? deletionInfo?.parentId ?? null;
    const isCategory = targetChannel?.type === 4 ?? deletionInfo?.isCategory ?? false;

    if (actionGroup === 'channel-delete'
      && isWhitelistedTarget(config, entry.targetId, parentId, isCategory)) {
      await writeIncidentLog(logIncident, guild, `🛡️ Antinuke skipped deletion of <#${entry.targetId}> because that channel or category is whitelisted.`);
      return;
    }

    try {
      const member = await guild.members.fetch(entry.executorId);
      await processAction(guild, member, entry.executorId, actionGroup, entry.targetId, config);
    } catch (error) {
      console.error(`Antinuke could not process executor ${entry.executorId} in guild ${guild.id}:`, error.message);
      await writeIncidentLog(logIncident, guild, `🛡️ Antinuke detected **${actionGroup}** by <@${entry.executorId}> but could not punish them: ${error.message}`);
    }
  });

  client.on('guildMemberAdd', async (member) => {
    const guild = member.guild;
    if (!guild || member.id === guild.ownerId) return;
    try {
      const config = store.getConfig(guild.id);
      if (!config.enabled || !config.raid?.enabled) return;
      if (hasWhitelistedRole(config, member.roles.cache.keys())) return;

      const now = Date.now();
      const cutoff = now - config.raid.windowSeconds * 1000;
      const joins = (recentJoins.get(guild.id) || []).filter((join) => join.timestamp >= cutoff);
      joins.push({ id: member.id, timestamp: now });
      recentJoins.set(guild.id, joins);
      if (joins.length < config.raid.threshold) return;

      await processAction(
        guild,
        member,
        member.id,
        'raid-join-burst',
        member.id,
        config,
        config.raid.punishment,
      );
    } catch (error) {
      console.error(`Antinuke could not process raid join ${member.id} in guild ${guild.id}:`, error.message);
    }
  });

  client.on('messageCreate', async (message) => {
    const guild = message.guild;
    const actorId = message.author?.id;
    if (!guild || !actorId || message.author.bot || !containsDiscordInvite(message.content)
      || actorId === client.user?.id || actorId === guild.ownerId) {
      return;
    }

    try {
      const config = store.getConfig(guild.id);
      if (!config.enabled) return;
      const member = message.member || await guild.members.fetch(actorId);
      await processAction(guild, member, actorId, 'invite-link', message.channelId, config);
    } catch (error) {
      console.error(`Antinuke could not process invite link from ${actorId} in guild ${guild.id}:`, error.message);
    }
  });
}

function formatIncident(entry, actionGroup, punishment, outcome) {
  const actionWord = THRESHOLD === 1 ? 'action' : 'actions';
  const secondWord = WINDOW_MS === 1_000 ? 'second' : 'seconds';
  return [
    '🛡️ **Antinuke incident**',
    `Action: **${actionGroup}** (${THRESHOLD} matching ${actionWord} within ${WINDOW_MS / 1000} ${secondWord})`,
    `Executor: <@${entry.executorId}> (\`${entry.executorId}\`)`,
    `Target ID: ${entry.targetId ? `\`${entry.targetId}\`` : 'unknown'}`,
    `Response: ${outcome}${outcome === 'failed' ? ` (${punishment})` : ''}.`,
  ].join('\n');
}

async function writeIncidentLog(logIncident, guild, message) {
  try {
    await logIncident(guild, message);
  } catch (error) {
    console.error(`Could not write antinuke log in guild ${guild.id}:`, error.message);
  }
}

module.exports = {
  ACTION_GROUPS,
  ACTION_GROUP_NAMES,
  parseSnowflake,
  getActionGroup,
  containsDiscordInvite,
  containsDangerousPermission,
  hasDangerousPermissionGrant,
  hasDangerousRoleAssignment,
  isMonitoredEntry,
  isWhitelistedTarget,
  hasWhitelistedRole,
  getReadiness,
  applyPunishment,
  sendPunishmentNotice,
  attach,
  THRESHOLD,
  WINDOW_MS,
  TIMEOUT_MS,
  PUNISHMENTS,
};