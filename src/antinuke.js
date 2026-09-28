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
const THRESHOLD = 3;
const WINDOW_MS = 1_000;
const DELETED_CHANNEL_TTL_MS = 20_000;
const TIMEOUT_MS = 10 * 60 * 1000;
const PUNISHMENTS = ['timeout', 'kick', 'ban', 'none'];

function parseSnowflake(value) {
  const match = value.match(/^(?:<@&?(\d+)>|<#(\d+)>|(\d+))$/);
  return match?.[1] || match?.[2] || match?.[3] || null;
}

function getActionGroup(action) {
  return ACTION_GROUPS.get(action) || null;
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

function attach(client, store, logIncident = async () => {}) {
  const recentActions = new Map();
  const deletedChannels = new Map();
  const lastPunishments = new Map();

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
      if (hasWhitelistedRole(config, member.roles.cache.keys())) {
        return;
      }

      const now = Date.now();
      const rateKey = `${guild.id}:${entry.executorId}:${actionGroup}`;
      const actions = (recentActions.get(rateKey) || []).filter((timestamp) => now - timestamp < WINDOW_MS);
      actions.push(now);
      recentActions.set(rateKey, actions);
      if (actions.length < THRESHOLD) {
        return;
      }

      const punishmentKey = `${guild.id}:${entry.executorId}`;
      if (now - (lastPunishments.get(punishmentKey) || 0) < WINDOW_MS) {
        return;
      }

      const reason = `SINCLAIR antinuke: ${actionGroup} threshold exceeded`;
      let punished;
      try {
        punished = await applyPunishment(member, config.punishment, reason);
      } catch (error) {
        await writeIncidentLog(logIncident, guild, formatIncident(entry, actionGroup, config.punishment, 'failed'));
        throw error;
      }
      lastPunishments.set(punishmentKey, now);
      const outcome = punished ? `applied ${config.punishment}` : 'detected (no punishment)';
      console.warn(`Antinuke ${outcome} for ${entry.executorId} in guild ${guild.id} for ${actionGroup}.`);
      await writeIncidentLog(logIncident, guild, formatIncident(
        entry,
        actionGroup,
        config.punishment,
        punished ? `applied ${config.punishment}` : 'detected; no punishment configured',
      ));
    } catch (error) {
      console.error(`Antinuke could not process executor ${entry.executorId} in guild ${guild.id}:`, error.message);
    }
  });
}

function formatIncident(entry, actionGroup, punishment, outcome) {
  return [
    '🛡️ **Antinuke incident**',
    `Action: **${actionGroup}** (${THRESHOLD} matching actions within ${WINDOW_MS / 1000} second)`,
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
  containsDangerousPermission,
  hasDangerousPermissionGrant,
  hasDangerousRoleAssignment,
  isMonitoredEntry,
  isWhitelistedTarget,
  hasWhitelistedRole,
  applyPunishment,
  attach,
  THRESHOLD,
  WINDOW_MS,
  TIMEOUT_MS,
  PUNISHMENTS,
};