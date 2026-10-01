const {
  ChannelType,
  PermissionFlagsBits,
  SlashCommandBuilder,
} = require('discord.js');
const { ACTION_GROUP_NAMES } = require('./antinuke');
const { TARGET_TYPES } = require('./bulkRole');

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
        .setDescription('Set or clear a server log channel by event type')
        .addChannelOption((option) => option
          .setName('channel')
          .setDescription('Text channel, or leave empty to clear')
          .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
          .setRequired(false))
        .addStringOption((option) => option
          .setName('type')
          .setDescription('Which event type uses this channel')
          .addChoices(
            { name: 'Default (all unassigned logs)', value: 'default' },
            { name: 'Voice activity', value: 'voice' },
            { name: 'Message deletions', value: 'message-delete' },
            { name: 'Deleted images', value: 'image-delete' },
            { name: 'Deleted videos', value: 'video-delete' },
            { name: 'Antinuke and security', value: 'security' },
          )
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
      .setName('add')
      .setDescription('Bulk assign a role to server members')
      .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles)
      .addSubcommandGroup((group) => group
        .setName('role')
        .setDescription('Manage member roles')
        .addSubcommand((subcommand) => subcommand
          .setName('all')
          .setDescription('Assign a role to users, bots, or everyone')
          .addRoleOption((option) => option
            .setName('role')
            .setDescription('Role to assign')
            .setRequired(true))
          .addStringOption((option) => option
            .setName('members')
            .setDescription('Which members should receive the role')
            .addChoices(
              { name: 'Human users only', value: 'users' },
              { name: 'Bots only', value: 'bots' },
              { name: 'Everyone', value: 'all' },
            )
            .setRequired(true)))),
    new SlashCommandBuilder()
      .setName('ticket')
      .setDescription('Configure and manage private support tickets')
      .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
      .addSubcommand((subcommand) => subcommand
        .setName('setup')
        .setDescription('Create or update the ticket panel')
        .addChannelOption((option) => option
          .setName('channel')
          .setDescription('Where the ticket panel is posted; defaults to this channel')
          .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
          .setRequired(false))
        .addChannelOption((option) => option
          .setName('category')
          .setDescription('Category where private tickets are created')
          .addChannelTypes(ChannelType.GuildCategory)
          .setRequired(false))
        .addRoleOption((option) => option
          .setName('support-role')
          .setDescription('Role that can view and close tickets')
          .setRequired(false))),
    new SlashCommandBuilder()
      .setName('afk')
      .setDescription('Set your AFK status and optional reason')
      .addStringOption((option) => option
        .setName('reason')
        .setDescription('Why you are away; leave empty to use AFK')
        .setMaxLength(500)
        .setRequired(false)),
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
      .addSubcommand((subcommand) => subcommand.setName('setup').setDescription('Open interactive security settings'))
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
      .addSubcommand((subcommand) => subcommand
        .setName('set-action-punishment')
        .setDescription('Set an automatic response for one action group')
        .addStringOption((option) => option
          .setName('action')
          .setDescription('Action group to configure')
          .addChoices(...[...ACTION_GROUP_NAMES, 'raid-join-burst'].map((value) => ({
            name: value.replaceAll('-', ' ').replace(/\b\w/g, (letter) => letter.toUpperCase()),
            value,
          })))
          .setRequired(true))
        .addStringOption((option) => option
          .setName('punishment')
          .setDescription('Action to take')
          .addChoices(
            { name: 'Remove all manageable roles', value: 'remove-roles' },
            { name: 'Timeout', value: 'timeout' },
            { name: 'Kick', value: 'kick' },
            { name: 'Ban', value: 'ban' },
            { name: 'Log only', value: 'none' },
          )
          .setRequired(true)))
      .addSubcommand((subcommand) => subcommand
        .setName('raid-config')
        .setDescription('Configure the join-raid guard')
        .addBooleanOption((option) => option
          .setName('enabled').setDescription('Enable or disable join-raid detection').setRequired(false))
        .addIntegerOption((option) => option
          .setName('threshold').setDescription('Joins needed to detect a raid (2-50)')
          .setMinValue(2).setMaxValue(50).setRequired(false))
        .addIntegerOption((option) => option
          .setName('window-seconds').setDescription('Time window (5-60 seconds)')
          .setMinValue(5).setMaxValue(60).setRequired(false))
        .addStringOption((option) => option
          .setName('punishment').setDescription('Action to take against joining members')
          .addChoices(
            { name: 'Remove all manageable roles', value: 'remove-roles' },
            { name: 'Timeout', value: 'timeout' },
            { name: 'Kick', value: 'kick' },
            { name: 'Ban', value: 'ban' },
            { name: 'Log only', value: 'none' },
          ).setRequired(false)))
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
    new SlashCommandBuilder()
      .setName('antinsfw')
      .setDescription('Manage age-restricted server invite link protection')
      .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
      .addSubcommandGroup((group) => group
        .setName('server')
        .setDescription('Configure server-link protection')
        .addSubcommand((subcommand) => subcommand
          .setName('link')
          .setDescription('Block invites to age-restricted channels')
          .addBooleanOption((option) => option
            .setName('enabled')
            .setDescription('Enable or disable NSFW invite-link blocking')
            .setRequired(true)))),
  ].map((command) => command.toJSON());
}

function buildHelpEmbed() {
  return {
    color: 0x5865f2,
    title: 'SINCLAIR Commands',
    fields: [
      {
        name: 'General and setup',
        value: [
          '`/help`',
          '`/antinsfw server link enabled:true|false`',
          '`/afk [reason]`',
          '`/set logs [channel] [type]` (default, voice, message-delete, image-delete, video-delete, security)',
          '`/set temp-voice [channel]`',
          '`/set jail-role role`',
          '`/ticket setup [channel] [category] [support-role]`',
          '`/add role all role members` (confirm before bulk assignment)',
        ].join('\n'),
      },
      {
        name: 'Roles',
        value: '`/role add member role`\n`,role add <user ID or mention> <role name, ID, or mention>`',
      },
      {
        name: 'Moderation',
        value: [
          '`/kick member [reason]`, `/ban member [reason]`',
          '`/timeout member [duration] [reason]`, `/mute member [reason]`',
          '`/purge [amount]`, `/jail member`, `/unjail member`',
          '`/avatar [member]`, `/cover [member]`',
          '`/mod kick|ban|timeout|mute|purge|jail|unjail|av|cover`',
        ].join('\n'),
      },
      {
        name: 'Autoresponders',
        value: [
          '`/autoresponder add trigger response`',
          '`/autoresponder remove trigger`',
          '`/autoresponder list`',
        ].join('\n'),
      },
      {
        name: 'Antinuke',
        value: [
          '`/antinuke setup`, `/antinuke enable|disable|status`',
          '`/antinuke set-punishment punishment` (remove-roles, timeout, kick, ban, none)',
          '`/antinuke set-action-punishment action punishment`',
          '`/antinuke raid-config [enabled] [threshold] [window-seconds] [punishment]`',
          '`/antinuke whitelist-list`',
          '`/antinuke whitelist-role add|remove|list role`',
          '`/antinuke whitelist-category add|remove|list channel`',
          '`/antinuke whitelist-channel add|remove|list channel`',
        ].join('\n'),
      },
      {
        name: 'Welcome messages',
        value: [
          '`/welcome channel channel`, `/welcome message message`',
          '`/welcome status`, `/welcome disable`, `/welcome preview`',
          '`/welcome embed edit`, `/welcome embed clear [field]`',
          '`/set-welcome-channel channel`, `/set-welcome-message message`',
          '`/edit-embed`',
          'Embed variables: `{user}`, `{user.name}`, `{user.id}`, `{user.avatar}`, `{user.createdAt}`, `{user.joinedAt}`, `{server.name}`, `{server.id}`, `{server.memberCount}`, `{server.icon}`, `{channel.name}`, `{channel.id}`.',
        ].join('\n'),
      },
    ],
  };
}

function isCommaHelpCommand(content) {
  return typeof content === 'string' && content.trim().toLowerCase() === ',help';
}

module.exports = { getCommands, buildHelpEmbed, isCommaHelpCommand, MODERATION_PERMISSIONS };