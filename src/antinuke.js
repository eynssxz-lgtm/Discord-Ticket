const { AuditLogEvent, PermissionsBitField } = require('discord.js');

const ACTION_GROUPS = new Map([
  [AuditLogEvent.ChannelDelete, 'channel-delete'],
  [AuditLogEvent.RoleDelete, 'role-delete'],
  [AuditLogEvent.RoleCreate, 'role-create'],
  [AuditLogEvent.RoleUpdate, 'dangerous-permission-grant'],
  [AuditLogEvent.ChannelOverwriteCreate, 'dangerous-permission-grant'],
  [AuditLogEvent.ChannelOverwriteUpdate, 'dangerous-permission-grant'],
  [AuditLogEvent.MemberRoleUpdate, 'dangerous-role-assignment'],
  [AuditLogEvent.MemberBanAdd, 'member-removal'],
  [AuditLogEvent.MemberKick, 'member-removal'],
  [AuditLogEvent.MemberPrune, 'member-prune'],
  [AuditLogEvent.BotAdd, 'bot-add'],
  [AuditLogEvent.InviteCreate, 'invite-create'],
  [AuditLogEvent.WebhookDelete, 'webhook-delete'],
]);
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

async function applyPunishment(member, punishment, reason) {
  if (punishment === 'remove-roles') {
    const removableRoles = [...member.roles.cache.values()].filter((role) => role.editable);
    const results = await Promise.allSettled(
      removableRoles.map((role) => member.roles.remove(role, reason)),
    );
    const failures = results.filter((result) => result.status === 'rejected');
    if (failures.length) {
      throw new AggregateError(failures.map(({ reason: error }) => error), 'Could not remove every manageable role.');
    }
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
  if (!['remove-roles', 'kick', 'ban'].includes(punishment)) return;
  const action = punishment === 'remove-roles'
    ? 'stripped of all manageable roles'
    : punishment === 'kick' ? 'kicked' : 'banned';
  const actionWord = THRESHOLD === 1 ? 'action' : 'actions';
  const secondWord = WINDOW_MS === 1_000 ? 'second' : 'seconds';
  const notice = [
    `You are being ${action} from **${guild.name}** by the server's antinuke protection.`,
    `Reason: ${THRESHOLD} matching **${actionGroup}** ${actionWord} were detected from your account within ${WINDOW_MS / 1000} ${secondWord}.`,
    `Action taken: **${punishment}**.`,
  ].join('\n');
  try {
    await member.send({ content: notice });
  } catch (error) {
    console.warn(`Could not DM antinuke notice to ${member.id}:`, error.message);
  }
}

function attach(client, store, logIncident = async () => {}) {
  const recentActions = new Map();
  const deletedChannels = new Map();
  const lastPunishments = new Map();

  const processAction = async (guild, member, actorId, actionGroup, targetId, config) => {
    if (hasWhitelistedRole(config, member.roles.cache.keys())) return;

    const now = Date.now();
    const rateKey = `${guild.id}:${actorId}:${actionGroup}`;
    const actions = (recentActions.get(rateKey) || []).filter((timestamp) => now - timestamp < WINDOW_MS);
    actions.push(now);
    recentActions.set(rateKey, actions);
    if (actions.length < THRESHOLD) return;

    const punishmentKey = `${guild.id}:${actorId}`;
    if (now - (lastPunishments.get(punishmentKey) || 0) < WINDOW_MS) return;

    const entry = { executorId: actorId, targetId };
    const reason = `SINCLAIR antinuke: ${actionGroup} threshold exceeded`;
    await sendPunishmentNotice(member, guild, actionGroup, config.punishment);
    let punished;
    try {
      punished = await applyPunishment(member, config.punishment, reason);
    } catch (error) {
      await writeIncidentLog(logIncident, guild, formatIncident(entry, actionGroup, config.punishment, 'failed'));
      throw error;
    }
    lastPunishments.set(punishmentKey, now);
    const outcome = punished ? `applied ${config.punishment}` : 'detected (no punishment)';
    console.warn(`Antinuke ${outcome} for ${actorId} in guild ${guild.id} for ${actionGroup}.`);
    await writeIncidentLog(logIncident, guild, formatIncident(
      entry,
      actionGroup,
      config.punishment,
      punished ? `applied ${config.punishment}` : 'detected; no punishment configured',
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
    if (!actionGroup || !entry.executorId || entry.executorId === client.user?.id) {
      return;
    }

    const config = store.getConfig(guild.id);
    if (!config.enabled || entry.executorId === guild.ownerId) {
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
      return;
    }

    try {
      const member = await guild.members.fetch(entry.executorId);
      await processAction(guild, member, entry.executorId, actionGroup, entry.targetId, config);
    } catch (error) {
      console.error(`Antinuke could not process executor ${entry.executorId} in guild ${guild.id}:`, error.message);
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
  parseSnowflake,
  getActionGroup,
  containsDiscordInvite,
  containsDangerousPermission,
  hasDangerousPermissionGrant,
  hasDangerousRoleAssignment,
  isMonitoredEntry,
  isWhitelistedTarget,
  hasWhitelistedRole,
  applyPunishment,
  sendPunishmentNotice,
  attach,
  THRESHOLD,
  WINDOW_MS,
  TIMEOUT_MS,
  PUNISHMENTS,
};