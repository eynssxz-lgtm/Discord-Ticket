const { PermissionFlagsBits, SlashCommandBuilder } = require('discord.js');

function getCommands() {
  return [
    new SlashCommandBuilder()
      .setName('help')
      .setDescription('Show the available commands'),
    new SlashCommandBuilder()
      .setName('set')
      .setDescription('Configure server command settings')
      .addSubcommand((subcommand) => subcommand
        .setName('prefix')
        .setDescription('Set the prefix for text commands')
        .addStringOption((option) => option
          .setName('prefix')
          .setDescription('A prefix from 1 to 5 characters')
          .setMaxLength(5)
          .setRequired(true)))
      .addSubcommand((subcommand) => subcommand
        .setName('jail-role')
        .setDescription('Choose the role assigned to jailed members')
        .addRoleOption((option) => option
          .setName('role')
          .setDescription('Role to assign to jailed members')
          .setRequired(true))),
    new SlashCommandBuilder()
      .setName('jail')
      .setDescription("Remove a member's roles and assign the jail role")
      .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles)
      .addUserOption((option) => option
        .setName('member')
        .setDescription('Member to jail')
        .setRequired(true)),
    new SlashCommandBuilder()
      .setName('unjail')
      .setDescription("Remove the jail role and restore a member's roles")
      .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles)
      .addUserOption((option) => option
        .setName('member')
        .setDescription('Member to unjail')
        .setRequired(true)),
  ].map((command) => command.toJSON());
}

function buildHelpEmbed(prefix) {
  return {
    color: 0x5865f2,
    title: 'SINCLAIR Commands',
    fields: [
      {
        name: 'Slash commands',
        value: [
          '`/help`',
          '`/set prefix`',
          '`/set jail-role`',
          '`/jail` and `/unjail`',
          '`/set-welcome-channel`, `/set-welcome-message`, `/edit-embed`',
        ].join('\n'),
      },
      {
        name: 'Server setup',
        value: [
          `\`${prefix}set prefix <prefix>\``,
          `\`${prefix}set logs <channel|off>\``,
          `\`${prefix}set temp voice <channel|off>\``,
          `Aliases: \`${prefix}setprefix\`, \`${prefix}setlogs\`, \`${prefix}settempvoice\``,
        ].join('\n'),
      },
      {
        name: 'Moderation',
        value: [
          `\`${prefix}kick @member\`, \`${prefix}ban @member\``,
          `\`${prefix}timeout @member <duration>\`, \`${prefix}mute @member\``,
          `\`${prefix}purge <amount>\`, \`${prefix}jail @member\`, \`${prefix}unjail @member\``,
          `\`${prefix}av @member\`, \`${prefix}avatar @member\`, \`${prefix}cover @member\``,
          `\`${prefix}mod kick|ban|timeout|mute|purge|jail|unjail|av|cover ...\``,
        ].join('\n'),
      },
      {
        name: 'Automation and welcome',
        value: [
          `\`${prefix}autoresponder add <trigger> | <response>\``,
          `\`${prefix}autoresponder remove <trigger>\`, \`${prefix}autoresponder list\``,
          `\`${prefix}antinuke enable|disable|status\`, \`${prefix}antinuke set punishment ...\``,
          `\`${prefix}antinuke whitelist role|category|channel add|remove|list ...\``,
          `\`${prefix}welcome channel|message|embed edit|embed clear|status|disable|preview ...\``,
        ].join('\n'),
      },
    ],
  };
}

module.exports = { getCommands, buildHelpEmbed };