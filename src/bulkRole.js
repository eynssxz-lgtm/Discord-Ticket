const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  PermissionFlagsBits,
} = require('discord.js');

const TARGET_TYPES = ['users', 'bots', 'all'];
const COMPONENT_PREFIX = 'bulkrole';
const ASSIGNMENT_CONCURRENCY = 5;

function isBulkRoleComponent(interaction) {
  return Boolean(interaction.isButton?.() && interaction.customId?.startsWith(`${COMPONENT_PREFIX}:`));
}

function canAssignRole(guild, member, role) {
  return role.id !== guild.id
    && !role.managed
    && role.editable
    && member.manageable
    && !member.roles.cache.has(role.id);
}

function matchesAudience(member, audience) {
  if (audience === 'users') return !member.user.bot;
  if (audience === 'bots') return member.user.bot;
  return audience === 'all';
}

async function getAssignableMembers(guild, role, audience) {
  if (!TARGET_TYPES.includes(audience)) return [];
  const members = await guild.members.fetch();
  return [...members.values()].filter((member) => (
    matchesAudience(member, audience) && canAssignRole(guild, member, role)
  ));
}

function buildConfirmation(role, audience, requesterId, count) {
  const audienceName = audience === 'users' ? 'human members' : audience === 'bots' ? 'bots' : 'all manageable members';
  const embed = new EmbedBuilder()
    .setColor(0xe67e22)
    .setTitle('Confirm Bulk Role Assignment')
    .setDescription(`This will add <@&${role.id}> to **${count} ${audienceName}**. Members above my role and members who already have this role will be skipped.`);
  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`${COMPONENT_PREFIX}:confirm:${role.id}:${audience}:${requesterId}`)
      .setLabel('Confirm')
      .setStyle(ButtonStyle.Danger),
    new ButtonBuilder()
      .setCustomId(`${COMPONENT_PREFIX}:cancel:${requesterId}`)
      .setLabel('Cancel')
      .setStyle(ButtonStyle.Secondary),
  );
  return { embeds: [embed], components: [row] };
}

async function setupBulkRoleCommand(interaction) {
  if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageRoles)) {
    await interaction.reply({ content: 'You need Manage Roles to assign a role to multiple members.', ephemeral: true });
    return;
  }
  if (!interaction.guild.members.me?.permissions.has(PermissionFlagsBits.ManageRoles)) {
    await interaction.reply({ content: 'I need Manage Roles to assign roles to members.', ephemeral: true });
    return;
  }

  const role = interaction.options.getRole('role', true);
  const audience = interaction.options.getString('members', true);
  if (role.id === interaction.guildId || role.managed || !role.editable) {
    await interaction.reply({ content: 'I cannot assign that role. It must be unmanaged and below my highest role.', ephemeral: true });
    return;
  }

  await interaction.deferReply({ ephemeral: true });
  const members = await getAssignableMembers(interaction.guild, role, audience);
  if (members.length === 0) {
    await interaction.editReply({ content: 'No eligible members need this role.' });
    return;
  }
  await interaction.editReply({
    ...buildConfirmation(role, audience, interaction.user.id, members.length),
    ephemeral: true,
  });
}

async function handleBulkRoleComponent(interaction) {
  if (!isBulkRoleComponent(interaction)) return false;
  const [, action, roleId, audience, requesterId] = interaction.customId.split(':');
  if (action === 'cancel') {
    if (roleId !== interaction.user.id) {
      await interaction.reply({ content: 'Only the moderator who started this assignment can cancel it.', ephemeral: true });
      return true;
    }
    await interaction.update({ content: 'Bulk role assignment cancelled.', embeds: [], components: [] });
    return true;
  }
  if (action !== 'confirm') return false;
  if (requesterId !== interaction.user.id) {
    await interaction.reply({ content: 'Only the moderator who started this assignment can confirm it.', ephemeral: true });
    return true;
  }
  if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageRoles)
    || !interaction.guild.members.me?.permissions.has(PermissionFlagsBits.ManageRoles)) {
    await interaction.reply({ content: 'You and the bot need Manage Roles to perform this assignment.', ephemeral: true });
    return true;
  }

  const role = interaction.guild.roles.cache.get(roleId)
    || await interaction.guild.roles.fetch(roleId).catch(() => null);
  if (!role || role.id === interaction.guildId || role.managed || !role.editable) {
    await interaction.update({ content: 'That role is no longer assignable. Check the bot role hierarchy.', embeds: [], components: [] });
    return true;
  }

  await interaction.deferUpdate();
  const members = await getAssignableMembers(interaction.guild, role, audience);
  let assigned = 0;
  let failed = 0;
  for (let index = 0; index < members.length; index += ASSIGNMENT_CONCURRENCY) {
    const batch = members.slice(index, index + ASSIGNMENT_CONCURRENCY);
    const results = await Promise.allSettled(batch.map((member) => member.roles.add(
      role,
      `Bulk role assignment confirmed by ${interaction.user.tag || interaction.user.id}`,
    )));
    assigned += results.filter((result) => result.status === 'fulfilled').length;
    failed += results.filter((result) => result.status === 'rejected').length;
  }
  const skipped = Math.max(0, members.length - assigned - failed);
  await interaction.editReply({
    content: `Bulk role assignment finished: added <@&${role.id}> to ${assigned} members.${failed ? ` ${failed} failed during assignment.` : ''}${skipped ? ` ${skipped} were skipped.` : ''}`,
    embeds: [],
    components: [],
  });
  return true;
}

module.exports = {
  TARGET_TYPES,
  isBulkRoleComponent,
  matchesAudience,
  canAssignRole,
  getAssignableMembers,
  buildConfirmation,
  setupBulkRoleCommand,
  handleBulkRoleComponent,
};