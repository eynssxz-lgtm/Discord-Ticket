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

const MODERATION_DESCRIPTIONS = {
  kick: 'Kick a member',
  ban: 'Ban a member',
  timeout: 'Timeout a member',
  mute: 'Mute a member for 10 minutes',
  purge: 'Delete recent messages',
  jail: 'Jail a member',
  unjail: 'Unjail a member',
  avatar: 'Show a member avatar',
  cover: 'Show a member banner photo',
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
    .setDescription(MODERATION_DESCRIPTIONS[action] || `Run the ${action} command`);
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
      .setName('ticket')
      .setDescription('Manage support tickets')
      .addSubcommand((subcommand) => subcommand
        .setName('create')
        .setDescription('Create a new support ticket for a user')
        .addUserOption((option) => option
          .setName('member')
          .setDescription('Member to create a ticket for')
          .setRequired(true)))
      .addSubcommand((subcommand) => subcommand
        .setName('close')
        .setDescription('Close the current ticket channel')
        .addChannelOption((option) => option
          .setName('channel')
          .setDescription('Ticket channel to close')
          .setRequired(false))),
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
    description: 'Commands work as slash commands or with the `,` prefix. Examples: `,help`, `,afk reason`, `,set logs #mod-logs`.',
    fields: [
      {
        name: 'General & setup',
        value: [
          '`/help` / `,help`', '`/afk [reason]` / `,afk [reason]`',
          '`/set logs [channel]`', '`/set temp-voice [channel]`',
          '`/set jail-role role`', '`/set-welcome-channel channel`',
          '`/set-welcome-message message`', '`/edit-embed`',
          '`,set logs [#channel]`', '`,set temp-voice [#voice-channel]`',
          '`,set jail-role @role`', '`,set-welcome-channel #channel`',
          '`,set-welcome-message text`', '`,edit-embed`',
        ].join('\n'),
      },
      {
        name: 'Roles',
        value: [
          '`/role add member role` / `,role add @member @role`',
        ].join('\n'),
      },
      {
        name: 'Moderation',
        value: [
          '`/kick member [reason]`', '`/ban member [reason]`',
          '`/timeout member [duration] [reason]`', '`/mute member [reason]`',
          '`/purge [amount]`', '`/jail member`', '`/unjail member`',
          '`/avatar [member]`', '`/cover [member]`',
          '`,kick @member [reason]`', '`,ban @member [reason]`',
          '`,timeout @member 10m [reason]`', '`,mute @member [reason]`',
          '`,purge [amount]`', '`,jail @member`', '`,unjail @member`',
          '`,avatar [@member]`', '`,cover [@member]`',
        ].join('\n'),
      },
      {
        name: 'Tickets',
        value: [
          '`,ticket setup #tickets @Support [#panel]`',
          '`,ticket panel [#channel]`', '`,ticket logs #transcripts`',
          '`,ticket create @member`', '`,ticket transcript`', '`,ticket close [#channel]`',
          '`/ticket create member:@user`', '`/ticket close [channel]`',
        ].join('\n'),
      },
      {
        name: 'Autoresponders',
        value: [
          '`/autoresponder add trigger response`',
          '`/autoresponder remove trigger`',
          '`/autoresponder list`',
          '`,autoresponder add trigger response`',
          '`,autoresponder remove trigger`', '`,autoresponder list`',
        ].join('\n'),
      },
      {
        name: 'Antinuke',
        value: [
          '`/antinuke enable|disable|status`',
          '`/antinuke set-punishment punishment`',
          '`/antinuke whitelist-list`',
          '`/antinuke whitelist-role add|remove|list role`',
          '`/antinuke whitelist-category add|remove|list channel`',
          '`/antinuke whitelist-channel add|remove|list channel`',
          '`,antinuke enable|disable|status`',
          '`,antinuke set-punishment type`',
          '`,antinuke whitelist-role|category|channel add|remove|list target`',
        ].join('\n'),
      },
      {
        name: 'Welcome messages',
        value: [
          '`/welcome channel channel`', '`/welcome message message`',
          '`/welcome status`', '`/welcome disable`', '`/welcome preview`',
          '`/welcome embed edit`', '`/welcome embed clear [field]`',
          '`,welcome channel #channel`', '`,welcome message text`',
          '`,welcome status|disable|preview`', '`,welcome embed edit|clear [field]`',
        ].join('\n'),
      },
    ],
  };
}

module.exports = { getCommands, buildHelpEmbed, MODERATION_PERMISSIONS };