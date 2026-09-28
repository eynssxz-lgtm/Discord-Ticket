const { AuditLogEvent } = require('discord.js');

const ACTION_GROUPS = new Map([
  [AuditLogEvent.ChannelDelete, 'channel-delete'],
  [AuditLogEvent.RoleDelete, 'role-delete'],
  [AuditLogEvent.MemberBanAdd, 'member-removal'],
  [AuditLogEvent.MemberKick, 'member-removal'],
  [AuditLogEvent.BotAdd, 'bot-add'],
  [AuditLogEvent.WebhookDelete, 'webhook-delete'],
]);
const THRESHOLD = 3;
const WINDOW_MS = 10_000;
const TIMEOUT_MS = 10 * 60 * 1000;
const PUNISHMENTS = ['timeout', 'kick', 'ban', 'none'];

function parseSnowflake(value) {
  const match = value.match(/^(?:<@&?(\d+)>|<#(\d+)>|(\d+))$/);
  return match?.[1] || match?.[2] || match?.[3] || null;
}

function getActionGroup(action) {
  return ACTION_GROUPS.get(action) || null;
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

function attach(client, store) {
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
    }, WINDOW_MS * 2);
    cleanupTimer.unref?.();
  });

  client.on('guildAuditLogEntryCreate', async (entry, guild) => {
    const actionGroup = getActionGroup(entry.action);
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
      const punished = await applyPunishment(member, config.punishment, reason);
      lastPunishments.set(punishmentKey, now);
      console.warn(`Antinuke ${punished ? `applied ${config.punishment} to` : 'detected'} ${entry.executorId} in guild ${guild.id} for ${actionGroup}.`);
    } catch (error) {
      console.error(`Antinuke could not process executor ${entry.executorId} in guild ${guild.id}:`, error.message);
    }
  });
}

module.exports = {
  parseSnowflake,
  getActionGroup,
  isWhitelistedTarget,
  hasWhitelistedRole,
  applyPunishment,
  attach,
  THRESHOLD,
  WINDOW_MS,
  TIMEOUT_MS,
  PUNISHMENTS,
};