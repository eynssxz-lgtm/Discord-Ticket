const {
  ChannelType,
  PermissionFlagsBits,
  SlashCommandBuilder,
} = require('discord.js');

const MODERATION_PERMISSIONS = {
  kick: PermissionFlagsBits.KickMembers,
  ban: PermissionFlagsBits.BanMembers,
  timeout: PermissionFlagsBits.ModerateMembers,
  mute: PermissionFlagsBits.ModerateMembers,
  purge: PermissionFlagsBits.ManageMessages,
  jail: PermissionFlagsBits.ManageRoles,
  unjail: PermissionFlagsBits.ManageRoles,
};

function addModerationOptions(subcommand, action) {
  if (['kick', 'ban', 'timeout', 'mute', 'jail', 'unjail'].includes(action)) {
    subcommand.addUserOption((option) => option
      .setName('member')
      .setDescription('Member to target')
      .setRequired(true));
  }

  if (action === 'timeout') {
    subcommand.addStringOption((option) => option
      .setName('duration')
      .setDescription('Duration such as 10m, 2h, or 1d')
      .setRequired(false));
  }

  if (['kick', 'ban', 'timeout', 'mute'].includes(action)) {
    subcommand.addStringOption((option) => option
      .setName('reason')
      .setDescription('Reason for the moderation action')
      .setMaxLength(512)
      .setRequired(false));
  }

  if (action === 'purge') {
    subcommand.addIntegerOption((option) => option
      .setName('amount')
      .setDescription('Number of recent messages to delete')
      .setMinValue(1)
      .setMaxValue(100)
      .setRequired(false));
  }

  if (['avatar', 'cover'].includes(action)) {
    subcommand.addUserOption((option) => option
      .setName('member')
      .setDescription('Member to show; defaults to you')
      .setRequired(false));
  }

  return subcommand;
}

function buildModerationCommand(action) {
  const command = new SlashCommandBuilder()
    .setName(action)
    .setDescription(`Run the ${action} command`);
  if (MODERATION_PERMISSIONS[action]) {
    command.setDefaultMemberPermissions(MODERATION_PERMISSIONS[action]);
  }
  return addModerationOptions(command, action);
}

function getCommands() {
  return [
    new SlashCommandBuilder()
      .setName('help')
      .setDescription('Show the available commands'),
    new SlashCommandBuilder()
      .setName('set')
      .setDescription('Configure server settings')
      .addSubcommand((subcommand) => subcommand
        .setName('logs')
        .setDescription('Set or clear the server log channel')
        .addChannelOption((option) => option
          .setName('channel')
          .setDescription('Text channel, or leave empty to clear')
          .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
          .setRequired(false)))
      .addSubcommand((subcommand) => subcommand
        .setName('temp-voice')
        .setDescription('Set or disable the join-to-create voice channel')
        .addChannelOption((option) => option
          .setName('channel')
          .setDescription('Voice channel, or leave empty to disable')
          .addChannelTypes(ChannelType.GuildVoice)
          .setRequired(false)))
      .addSubcommand((subcommand) => subcommand
        .setName('jail-role')
        .setDescription('Choose the role assigned to jailed members')
        .addRoleOption((option) => option
          .setName('role')
          .setDescription('Role to assign to jailed members')
          .setRequired(true))),
    ...['kick', 'ban', 'timeout', 'mute', 'purge', 'jail', 'unjail', 'avatar', 'cover']
      .map(buildModerationCommand),
    new SlashCommandBuilder()
      .setName('mod')
      .setDescription('Run a moderation action')
      .addSubcommand((subcommand) => addModerationOptions(subcommand
        .setName('kick').setDescription('Kick a member'), 'kick'))
      .addSubcommand((subcommand) => addModerationOptions(subcommand
        .setName('ban').setDescription('Ban a member'), 'ban'))
      .addSubcommand((subcommand) => addModerationOptions(subcommand
        .setName('timeout').setDescription('Timeout a member'), 'timeout'))
      .addSubcommand((subcommand) => addModerationOptions(subcommand
        .setName('mute').setDescription('Mute a member for 10 minutes'), 'mute'))
      .addSubcommand((subcommand) => addModerationOptions(subcommand
        .setName('purge').setDescription('Delete recent messages'), 'purge'))
      .addSubcommand((subcommand) => addModerationOptions(subcommand
        .setName('jail').setDescription('Jail a member'), 'jail'))
      .addSubcommand((subcommand) => addModerationOptions(subcommand
        .setName('unjail').setDescription('Unjail a member'), 'unjail'))
      .addSubcommand((subcommand) => addModerationOptions(subcommand
        .setName('av').setDescription('Show a member avatar'), 'avatar'))
      .addSubcommand((subcommand) => addModerationOptions(subcommand
        .setName('cover').setDescription('Show a member cover'), 'cover')),
    new SlashCommandBuilder()
      .setName('role')
      .setDescription('Manage member roles')
      .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles)
      .addSubcommand((subcommand) => subcommand
        .setName('add')
        .setDescription('Add a role to a server member')
        .addUserOption((option) => option
          .setName('member')
          .setDescription('Member to receive the role; select by mention or user')
          .setRequired(true))
        .addRoleOption((option) => option
          .setName('role')
          .setDescription('Role to add')
          .setRequired(true))),
    new SlashCommandBuilder()
      .setName('autoresponder')
      .setDescription('Manage exact-match autoresponders')
      .addSubcommand((subcommand) => subcommand
        .setName('add')
        .setDescription('Add an autoresponder')
        .addStringOption((option) => option
          .setName('trigger').setDescription('Message that triggers the response')
          .setMaxLength(100).setRequired(true))
        .addStringOption((option) => option
          .setName('response').setDescription('Message to send for this trigger')
          .setMaxLength(2000).setRequired(true)))
      .addSubcommand((subcommand) => subcommand
        .setName('remove')
        .setDescription('Remove an autoresponder')
        .addStringOption((option) => option
          .setName('trigger').setDescription('Trigger to remove')
          .setMaxLength(100).setRequired(true)))
      .addSubcommand((subcommand) => subcommand
        .setName('list').setDescription('List configured autoresponder triggers')),
    new SlashCommandBuilder()
      .setName('antinuke')
      .setDescription('Configure protection against destructive server actions')
      .addSubcommand((subcommand) => subcommand.setName('enable').setDescription('Enable antinuke'))
      .addSubcommand((subcommand) => subcommand.setName('disable').setDescription('Disable antinuke'))
      .addSubcommand((subcommand) => subcommand.setName('status').setDescription('Show antinuke status'))
      .addSubcommand((subcommand) => subcommand
        .setName('set-punishment')
        .setDescription('Choose the automatic response')
        .addStringOption((option) => option
          .setName('punishment').setDescription('Action to take after the threshold is reached')
          .addChoices(
            { name: 'Remove all roles', value: 'remove-roles' },
            { name: 'Timeout', value: 'timeout' },
            { name: 'Kick', value: 'kick' },
            { name: 'Ban', value: 'ban' },
            { name: 'None', value: 'none' },
          ).setRequired(true)))
      .addSubcommand((subcommand) => subcommand.setName('whitelist-list').setDescription('List all whitelist entries'))
      .addSubcommandGroup((group) => group
        .setName('whitelist-role')
        .setDescription('Manage exempt roles')
        .addSubcommand((subcommand) => subcommand.setName('add').setDescription('Whitelist a role')
          .addRoleOption((option) => option.setName('role').setDescription('Role to whitelist').setRequired(true)))
        .addSubcommand((subcommand) => subcommand.setName('remove').setDescription('Remove a whitelisted role')
          .addRoleOption((option) => option.setName('role').setDescription('Role to remove').setRequired(true)))
        .addSubcommand((subcommand) => subcommand.setName('list').setDescription('List whitelisted roles')))
      .addSubcommandGroup((group) => group
        .setName('whitelist-category')
        .setDescription('Manage exempt categories')
        .addSubcommand((subcommand) => subcommand.setName('add').setDescription('Whitelist a category')
          .addChannelOption((option) => option.setName('channel').setDescription('Category to whitelist')
            .addChannelTypes(ChannelType.GuildCategory).setRequired(true)))
        .addSubcommand((subcommand) => subcommand.setName('remove').setDescription('Remove a whitelisted category')
          .addChannelOption((option) => option.setName('channel').setDescription('Category to remove')
            .addChannelTypes(ChannelType.GuildCategory).setRequired(true)))
        .addSubcommand((subcommand) => subcommand.setName('list').setDescription('List whitelisted categories')))
      .addSubcommandGroup((group) => group
        .setName('whitelist-channel')
        .setDescription('Manage exempt channels')
        .addSubcommand((subcommand) => subcommand.setName('add').setDescription('Whitelist a channel')
          .addChannelOption((option) => option.setName('channel').setDescription('Channel to whitelist').setRequired(true)))
        .addSubcommand((subcommand) => subcommand.setName('remove').setDescription('Remove a whitelisted channel')
          .addChannelOption((option) => option.setName('channel').setDescription('Channel to remove').setRequired(true)))
        .addSubcommand((subcommand) => subcommand.setName('list').setDescription('List whitelisted channels'))),
  ].map((command) => command.toJSON());
}

function buildHelpEmbed() {
  return {
    color: 0x5865f2,
    title: 'SINCLAIR Commands',
    fields: [
      {
        name: 'Slash commands',
        value: [
          '`/help`',
          '`/set logs`, `/set temp-voice`, `/set jail-role`',
          '`/role add`',
          '`/kick`, `/ban`, `/timeout`, `/mute`, `/purge`, `/jail`, `/unjail`',
          '`/avatar`, `/cover`, and `/mod`',
          '`/autoresponder add|remove|list`',
          '`/antinuke`',
          '`/welcome`, `/set-welcome-channel`, `/set-welcome-message`, `/edit-embed`',
        ].join('\n'),
      },
    ],
  };
}

module.exports = { getCommands, buildHelpEmbed, MODERATION_PERMISSIONS };