const { ChannelType, PermissionFlagsBits } = require('discord.js');
const autoresponder = require('./autoresponder');
const autoresponderStore = require('./autoresponderStore');
const antinukeStore = require('./antinukeStore');
const antinukeInteractions = require('./antinukeInteractions');
const { THRESHOLD, WINDOW_MS } = require('./antinuke');
const jailStore = require('./jailStore');
const logChannelStore = require('./logChannelStore');
const tempVoiceStore = require('./tempVoiceStore');
const afkStore = require('./afkStore');
const tickets = require('./tickets');
const ticketStore = require('./ticketStore');
const { jailMember, unjailMember } = require('./jail');
const { parseDuration, buildUserCardEmbed } = require('./moderation');
const { buildHelpEmbed, MODERATION_PERMISSIONS } = require('./commandInteractions');
const roleAssignment = require('./roleAssignment');
const nsfwLinkStore = require('./nsfwLinkStore');

async function requirePermission(interaction, permission, message) {
  if (interaction.memberPermissions?.has(permission)) return true;
  await interaction.reply({ content: message, ephemeral: true });
  return false;
}

async function getMember(interaction, optionName = 'member') {
  const user = interaction.options.getUser(optionName, true);
  return interaction.guild.members.fetch(user.id).catch(() => null);
}

async function runJail(interaction, action, member) {
  if (!await requirePermission(
    interaction,
    PermissionFlagsBits.ManageRoles,
    'You need the Manage Roles permission to jail or unjail members.',
  )) return;
  if (!interaction.guild.members.me?.permissions.has(PermissionFlagsBits.ManageRoles)) {
    await interaction.reply({ content: 'I need the Manage Roles permission to jail or unjail members.', ephemeral: true });
    return;
  }

  const jailRoleId = jailStore.getJailRole(interaction.guildId);
  const jailRole = jailRoleId && interaction.guild.roles.cache.get(jailRoleId);
  if (!jailRole || !jailRole.editable) {
    await interaction.reply({ content: 'Set a manageable jail role first with `/set jail-role`.', ephemeral: true });
    return;
  }

  if (!member) {
    await interaction.reply({ content: 'That member could not be found in this server.', ephemeral: true });
    return;
  }

  try {
    if (action === 'jail') {
      const result = await jailMember(member, jailRole, jailStore);
      await interaction.reply({
        content: result.alreadyJailed
          ? `${member.user.tag} is already jailed.`
          : result.blockedRoleIds?.length
            ? `I cannot remove every role from ${member.user.tag}; move my role above their assigned roles first.`
            : `Jailed ${member.user.tag} and saved ${result.savedRoleCount} role(s).`,
        ephemeral: true,
      });
      return;
    }

    const result = await unjailMember(member, jailRole, jailStore);
    await interaction.reply({
      content: result.blockedRoleIds?.length
        ? `I cannot restore every role for ${member.user.tag}; move my role above their assigned roles first.`
        : result.wasJailed
          ? `Unjailed ${member.user.tag} and restored ${result.restoredRoleCount} role(s).`
          : `${member.user.tag} was not jailed.`,
      ephemeral: true,
    });
  } catch (error) {
    console.error(`Could not ${action} ${member.id} in guild ${interaction.guildId}:`, error.message);
    await interaction.reply({
      content: `I could not ${action} that member. Check my role hierarchy and permissions.`,
      ephemeral: true,
    });
  }
}

async function runModeration(interaction, action) {
  const permission = MODERATION_PERMISSIONS[action];
  if (permission && !await requirePermission(
    interaction,
    permission,
    `You need the ${action === 'purge' ? 'Manage Messages' : 'appropriate moderation'} permission to use this command.`,
  )) return;

  if (action === 'jail' || action === 'unjail') {
    await runJail(interaction, action, await getMember(interaction));
    return;
  }

  if (action === 'avatar' || action === 'cover') {
    const user = interaction.options.getUser('member') || interaction.user;
    await interaction.reply({
      embeds: [buildUserCardEmbed(user, action)],
      ephemeral: true,
    });
    return;
  }

  if (action === 'purge') {
    const amount = interaction.options.getInteger('amount') || 50;
    const deleted = await interaction.channel.bulkDelete(amount, true).catch(() => null);
    await interaction.reply({
      content: deleted ? `Purged ${deleted.size} messages.` : 'I could not purge messages in this channel.',
      ephemeral: true,
    });
    return;
  }

  const member = await getMember(interaction);
  if (!member) {
    await interaction.reply({ content: 'That member could not be found in this server.', ephemeral: true });
    return;
  }
  const reason = interaction.options.getString('reason') || 'No reason provided';

  try {
    if (action === 'kick') {
      await member.kick(reason);
      await interaction.reply({ content: `Kicked ${member.user.tag}.`, ephemeral: true });
      return;
    }
    if (action === 'ban') {
      await member.ban({ reason });
      await interaction.reply({ content: `Banned ${member.user.tag}.`, ephemeral: true });
      return;
    }
    if (action === 'timeout') {
      const durationValue = interaction.options.getString('duration') || '10m';
      const duration = parseDuration(durationValue);
      if (!duration || duration < 1000 || duration > 28 * 24 * 60 * 60 * 1000) {
        await interaction.reply({ content: 'Choose a duration from 1 second to 28 days, such as `10m` or `2h`.', ephemeral: true });
        return;
      }
      await member.timeout(duration, reason);
      await interaction.reply({ content: `Timed out ${member.user.tag} for ${durationValue}.`, ephemeral: true });
      return;
    }
    if (action === 'mute') {
      await member.timeout(10 * 60 * 1000, reason);
      await interaction.reply({ content: `Muted ${member.user.tag} for 10 minutes.`, ephemeral: true });
    }
  } catch (error) {
    console.error(`Could not ${action} ${member.id} in guild ${interaction.guildId}:`, error.message);
    await interaction.reply({ content: `I could not ${action} that member. Check my permissions and role hierarchy.`, ephemeral: true });
  }
}

async function runRole(interaction) {
  if (!await requirePermission(
    interaction,
    PermissionFlagsBits.ManageRoles,
    'You need the Manage Roles permission to assign roles.',
  )) return;
  const user = interaction.options.getUser('member', true);
  const role = interaction.options.getRole('role', true);
  const member = await interaction.guild.members.fetch(user.id).catch(() => null);
  if (!member) {
    await interaction.reply({ content: 'That user is not a member of this server.', ephemeral: true });
    return;
  }
  try {
    const result = await roleAssignment.assignRole(
      interaction.guild,
      member,
      role,
      `Role assigned by ${interaction.user.tag}`,
    );
    await interaction.reply({ content: result.message, ephemeral: true });
  } catch (error) {
    console.error(`Could not assign role ${role.id} to ${member.id} in guild ${interaction.guildId}:`, error.message);
    await interaction.reply({ content: 'I could not assign that role. Check my permissions and role hierarchy.', ephemeral: true });
  }
}

async function runSet(interaction) {
  const setting = interaction.options.getSubcommand();
  if (setting === 'jail-role') {
    if (!await requirePermission(interaction, PermissionFlagsBits.ManageRoles, 'You need the Manage Roles permission to set the jail role.')) return;
    const role = interaction.options.getRole('role', true);
    if (role.id === interaction.guildId || !role.editable) {
      await interaction.reply({ content: 'The bot must be able to manage the selected role.', ephemeral: true });
      return;
    }
    jailStore.setJailRole(interaction.guildId, role.id);
    await interaction.reply({ content: `Jail role set to <@&${role.id}>.`, ephemeral: true });
    return;
  }

  if (!await requirePermission(interaction, PermissionFlagsBits.ManageGuild, 'You need the Manage Server permission to change server settings.')) return;
  const channel = interaction.options.getChannel('channel');
  if (setting === 'logs') {
    const logType = interaction.options.getString('type') || 'default';
    if (!logChannelStore.setLogChannel(interaction.guildId, channel?.id || null, logType)) {
      await interaction.reply({ content: 'Choose a valid log type.', ephemeral: true });
      return;
    }
    const typeName = logType.replaceAll('-', ' ');
    await interaction.reply({
      content: channel
        ? `${typeName} log channel updated to <#${channel.id}>.`
        : `${typeName} log channel cleared.`,
      ephemeral: true,
    });
    return;
  }

  if (channel && channel.type !== ChannelType.GuildVoice) {
    await interaction.reply({ content: 'Choose a voice channel from this server.', ephemeral: true });
    return;
  }
  tempVoiceStore.setTriggerChannel(interaction.guildId, channel?.id || null);
  await interaction.reply({
    content: channel
      ? `Members joining <#${channel.id}> will get their own temporary voice channel.`
      : 'Temporary voice channels are disabled.',
    ephemeral: true,
  });
}

async function runAutoresponder(interaction) {
  if (!await requirePermission(interaction, PermissionFlagsBits.ManageGuild, 'You need the Manage Server permission to manage autoresponders.')) return;
  const action = interaction.options.getSubcommand();
  if (action === 'add') {
    const trigger = interaction.options.getString('trigger', true).trim();
    const response = interaction.options.getString('response', true).trim();
    if (!autoresponder.isValidTrigger(trigger) || !response || response.length > 2000) {
      await interaction.reply({ content: 'Provide a non-empty trigger (up to 100 characters) and response (up to 2,000 characters).', ephemeral: true });
      return;
    }
    if (!autoresponderStore.add(interaction.guildId, trigger, response)) {
      await interaction.reply({ content: 'An autoresponder already exists for that trigger.', ephemeral: true });
      return;
    }
    await interaction.reply({ content: `Autoresponder added for \`${trigger}\`.`, ephemeral: true });
    return;
  }

  if (action === 'remove') {
    const trigger = interaction.options.getString('trigger', true).trim();
    if (!autoresponder.isValidTrigger(trigger)) {
      await interaction.reply({ content: 'Provide the trigger to remove (up to 100 characters).', ephemeral: true });
      return;
    }
    await interaction.reply({
      content: autoresponderStore.remove(interaction.guildId, trigger)
        ? `Autoresponder removed for \`${trigger}\`.`
        : 'No autoresponder was found for that trigger.',
      ephemeral: true,
    });
    return;
  }

  const entries = autoresponderStore.list(interaction.guildId);
  if (!entries.length) {
    await interaction.reply({ content: 'There are no autoresponders configured for this server.', ephemeral: true });
    return;
  }
  const triggers = entries.slice(0, 20).map(({ trigger }) => `- ${trigger}`).join('\n');
  const remaining = entries.length - 20;
  await interaction.reply({
    content: `Configured triggers:\n${triggers}${remaining > 0 ? `\n...and ${remaining} more.` : ''}`,
    ephemeral: true,
  });
}

async function runAntinuke(interaction) {
  if (!await requirePermission(interaction, PermissionFlagsBits.ManageGuild, 'You need the Manage Server permission to configure antinuke.')) return;
  const group = interaction.options.getSubcommandGroup(false);
  const action = interaction.options.getSubcommand();
  if (action === 'setup') {
    await interaction.reply({ ...antinukeInteractions.buildDashboard(antinukeStore.getConfig(interaction.guildId)), ephemeral: true });
    return;
  }
  if (group) {
    const targetType = group.slice('whitelist-'.length);
    if (action === 'list') {
      const ids = antinukeStore.getConfig(interaction.guildId)[`${targetType}Ids`];
      await interaction.reply({
        content: ids.length
          ? `Whitelisted ${targetType}s: ${ids.map((id) => `\`${id}\``).join(', ')}`
          : `No ${targetType}s are whitelisted.`,
        ephemeral: true,
      });
      return;
    }

    const target = targetType === 'role'
      ? interaction.options.getRole('role', true)
      : interaction.options.getChannel('channel', true);
    if ((targetType === 'category' && target.type !== ChannelType.GuildCategory)
      || (targetType === 'channel' && target.type === ChannelType.GuildCategory)) {
      await interaction.reply({ content: `Choose a valid ${targetType} from this server.`, ephemeral: true });
      return;
    }
    const shouldAdd = action === 'add';
    const changed = antinukeStore.updateWhitelist(interaction.guildId, targetType, target.id, shouldAdd);
    await interaction.reply({
      content: changed
        ? `${shouldAdd ? 'Whitelisted' : 'Removed'} ${targetType} <${targetType === 'role' ? '@&' : '#'}${target.id}>.`
        : `${targetType} \`${target.id}\` was already in that state.`,
      ephemeral: true,
    });
    return;
  }

  if (action === 'enable' || action === 'disable') {
    antinukeStore.setEnabled(interaction.guildId, action === 'enable');
    await interaction.reply({ content: `Antinuke is now ${action === 'enable' ? 'enabled' : 'disabled'}.`, ephemeral: true });
    return;
  }
  if (action === 'set-punishment') {
    const punishment = interaction.options.getString('punishment', true);
    antinukeStore.setPunishment(interaction.guildId, punishment);
    await interaction.reply({ content: `Antinuke punishment set to \`${punishment}\`.`, ephemeral: true });
    return;
  }
  if (action === 'set-action-punishment') {
    const targetAction = interaction.options.getString('action', true);
    const punishment = interaction.options.getString('punishment', true);
    const changed = targetAction === 'raid-join-burst'
      ? antinukeStore.updateRaidConfig(interaction.guildId, { punishment })
      : antinukeStore.setActionPunishment(interaction.guildId, targetAction, punishment);
    await interaction.reply({
      content: changed
        ? `The ${targetAction.replaceAll('-', ' ')} response is now \`${punishment}\`.`
        : 'That action or punishment could not be configured.',
      ephemeral: true,
    });
    return;
  }
  if (action === 'raid-config') {
    const update = {};
    const enabled = interaction.options.getBoolean('enabled');
    const threshold = interaction.options.getInteger('threshold');
    const windowSeconds = interaction.options.getInteger('window-seconds');
    const punishment = interaction.options.getString('punishment');
    if (enabled !== null) update.enabled = enabled;
    if (threshold !== null) update.threshold = threshold;
    if (windowSeconds !== null) update.windowSeconds = windowSeconds;
    if (punishment !== null) update.punishment = punishment;
    if (Object.keys(update).length === 0) {
      await interaction.reply({ content: 'Choose at least one raid setting to update.', ephemeral: true });
      return;
    }
    const changed = antinukeStore.updateRaidConfig(interaction.guildId, update);
    const config = antinukeStore.getConfig(interaction.guildId).raid;
    await interaction.reply({
      content: changed
        ? `Join-raid protection is ${config.enabled ? 'enabled' : 'disabled'}: ${config.threshold} joins in ${config.windowSeconds} seconds; response: ${config.punishment}.`
        : 'Invalid raid settings. Threshold must be 2-50, window 5-60 seconds, and punishment must be supported.',
      ephemeral: true,
    });
    return;
  }

  const config = antinukeStore.getConfig(interaction.guildId);
  const punishment = {
    'remove-roles': 'remove all manageable roles',
    timeout: '10-minute timeout',
  }[config.punishment] || config.punishment;
  const actionWord = THRESHOLD === 1 ? 'action' : 'actions';
  const secondWord = WINDOW_MS === 1_000 ? 'second' : 'seconds';
  const status = `Antinuke is ${config.enabled ? 'enabled' : 'disabled'}. Threshold: ${THRESHOLD} matching ${actionWord} within ${WINDOW_MS / 1000} ${secondWord}; punishment: ${punishment}.`;
  const overrideCount = Object.keys(config.actionPunishments || {}).length;
  const raidStatus = `Join-raid protection: ${config.raid.enabled ? 'enabled' : 'disabled'} (${config.raid.threshold} joins in ${config.raid.windowSeconds}s; ${config.raid.punishment}).`;
  const readiness = antinuke.getReadiness(interaction.guild, interaction.client, config.punishment, config);
  const checks = [
    `GuildModeration intent: ${readiness.moderationIntent ? 'ready' : 'MISSING'}`,
    `View Audit Log: ${readiness.viewAuditLog ? 'ready' : 'MISSING'}`,
    `Punishment permission${readiness.punishmentPermissionName ? ` (${readiness.punishmentPermissionName})` : ''}: ${readiness.punishmentPermission ? 'ready' : 'MISSING'}`,
    `Missing permissions for configured responses: ${readiness.missingPunishmentPermissions.length ? readiness.missingPunishmentPermissions.join(', ') : 'none'}`,
    'The bot role must be above the actor and any roles it needs to remove.',
    'The server owner and whitelisted actors/targets are exempt.',
  ].join('\n');
  const allLists = action === 'whitelist-list'
    ? `\nRoles: ${config.roleIds.length ? config.roleIds.map((id) => `<@&${id}>`).join(', ') : 'none'}\nCategories: ${config.categoryIds.length ? config.categoryIds.map((id) => `<#${id}>`).join(', ') : 'none'}\nChannels: ${config.channelIds.length ? config.channelIds.map((id) => `<#${id}>`).join(', ') : 'none'}`
    : '';
  await interaction.reply({ content: `${status}\nAction-specific responses: ${overrideCount}.\n${raidStatus}\n${checks}${allLists}`, ephemeral: true });
}

async function handleCommand(interaction) {
  const name = interaction.commandName;
  if (name === 'help') {
    await interaction.reply({ embeds: [buildHelpEmbed()], ephemeral: true });
    return true;
  }
  if (name === 'set') {
    await runSet(interaction);
    return true;
  }
  if (name === 'role') {
    await runRole(interaction);
    return true;
  }
  if (name === 'afk') {
    const reason = interaction.options.getString('reason')?.trim() || 'AFK';
    afkStore.set(interaction.guildId, interaction.user.id, reason);
    await interaction.reply({ content: `You are now AFK: ${reason}`, ephemeral: true });
    return true;
  }
  if (name === 'ticket') {
    if (interaction.options.getSubcommand() === 'setup') {
      await tickets.handleSetupCommand(interaction, ticketStore);
    }
    return true;
  }
  if (name === 'antinsfw') {
    if (!await requirePermission(interaction, PermissionFlagsBits.ManageGuild, 'You need the Manage Server permission to configure NSFW link protection.')) return true;
    if (interaction.options.getSubcommandGroup() !== 'server'
      || interaction.options.getSubcommand() !== 'link') return true;
    const enabled = interaction.options.getBoolean('enabled', true);
    nsfwLinkStore.setEnabled(interaction.guildId, enabled);
    await interaction.reply({
      content: `NSFW server invite-link protection is now ${enabled ? 'enabled' : 'disabled'}.`,
      ephemeral: true,
    });
    return true;
  }
  if (name === 'autoresponder') {
    await runAutoresponder(interaction);
    return true;
  }
  if (name === 'antinuke') {
    await runAntinuke(interaction);
    return true;
  }
  if (name === 'mod') {
    const selected = interaction.options.getSubcommand();
    await runModeration(interaction, selected === 'av' ? 'avatar' : selected);
    return true;
  }
  if (MODERATION_PERMISSIONS[name] || ['avatar', 'cover'].includes(name)) {
    await runModeration(interaction, name);
    return true;
  }
  return false;
}

module.exports = handleCommand;