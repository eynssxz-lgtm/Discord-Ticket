const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  ModalBuilder,
  PermissionFlagsBits,
  TextInputBuilder,
  TextInputStyle,
} = require('discord.js');

const BUTTON_IDS = {
  lock: 'tempvoice:lock',
  unlock: 'tempvoice:unlock',
  hide: 'tempvoice:hide',
  show: 'tempvoice:show',
  rename: 'tempvoice:rename',
  claim: 'tempvoice:claim',
  limit: 'tempvoice:limit',
  info: 'tempvoice:info',
  delete: 'tempvoice:delete',
};
const MODAL_PREFIX = 'tempvoice:modal';

function buildControlPanel(channel, ownerId) {
  const overwrite = channel.permissionOverwrites.cache.get(channel.guild.id);
  const locked = overwrite?.deny.has(PermissionFlagsBits.Connect) || false;
  const hidden = overwrite?.deny.has(PermissionFlagsBits.ViewChannel) || false;
  const userLimit = channel.userLimit || 0;
  const embed = new EmbedBuilder()
    .setColor(0x202225)
    .setTitle('Temporary Voice Controls')
    .setDescription(`Manage <#${channel.id}> using the controls below.`)
    .addFields(
      { name: 'Owner', value: ownerId ? `<@${ownerId}>` : 'Unclaimed', inline: true },
      { name: 'Access', value: `${locked ? 'Locked' : 'Unlocked'} · ${hidden ? 'Hidden' : 'Visible'}`, inline: true },
      { name: 'User limit', value: userLimit ? String(userLimit) : 'Unlimited', inline: true },
    );
  const firstRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(BUTTON_IDS.lock).setLabel('Lock').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId(BUTTON_IDS.unlock).setLabel('Unlock').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId(BUTTON_IDS.hide).setLabel('Hide').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId(BUTTON_IDS.show).setLabel('Show').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId(BUTTON_IDS.claim).setLabel('Claim').setStyle(ButtonStyle.Primary),
  );
  const secondRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(BUTTON_IDS.rename).setLabel('Rename').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId(BUTTON_IDS.limit).setLabel('User limit').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId(BUTTON_IDS.info).setLabel('Info').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId(BUTTON_IDS.delete).setLabel('Delete').setStyle(ButtonStyle.Danger),
  );
  return { embeds: [embed], components: [firstRow, secondRow] };
}

async function postControlPanel(channel, ownerId, store) {
  if (typeof channel.send !== 'function') return null;
  const message = await channel.send(buildControlPanel(channel, ownerId));
  store.setControlMessageId(channel.guild.id, channel.id, message.id);
  return message;
}

function isControlInteraction(interaction) {
  return Boolean(
    (interaction.isButton?.() && Object.values(BUTTON_IDS).includes(interaction.customId))
    || (interaction.isModalSubmit?.() && interaction.customId.startsWith(`${MODAL_PREFIX}:`)),
  );
}

function isChannelOwnerOrManager(interaction, ownerId) {
  return ownerId === interaction.user.id
    || interaction.memberPermissions?.has(PermissionFlagsBits.ManageChannels);
}

async function replyEphemeral(interaction, content) {
  await interaction.reply({ content, ephemeral: true });
}

async function refreshControlPanel(channel, interaction, store) {
  const messageId = store.getControlMessageId(channel.guild.id, channel.id);
  const panelMessage = interaction.message || (messageId && channel.messages?.fetch
    ? await channel.messages.fetch(messageId).catch(() => null)
    : null);
  if (!panelMessage) return;
  await panelMessage.edit(buildControlPanel(channel, store.getTemporaryOwner(channel.guild.id, channel.id)));
}

function buildInfoEmbed(channel, ownerId) {
  const members = [...channel.members.values()].map((member) => `<@${member.id}>`);
  return new EmbedBuilder()
    .setColor(0x202225)
    .setTitle('Temporary Voice Information')
    .addFields(
      { name: 'Channel', value: `<#${channel.id}>`, inline: true },
      { name: 'Owner', value: ownerId ? `<@${ownerId}>` : 'Unclaimed', inline: true },
      { name: 'User limit', value: channel.userLimit ? String(channel.userLimit) : 'Unlimited', inline: true },
      { name: 'Connected', value: members.length ? members.join(', ') : 'Nobody', inline: false },
      { name: 'Created', value: `<t:${Math.floor(channel.createdTimestamp / 1000)}:F>`, inline: false },
    );
}

async function resolveVoiceChannel(interaction, channelId) {
  return interaction.guild.channels.cache.get(channelId)
    || interaction.guild.channels.fetch(channelId).catch(() => null);
}

async function handleControlInteraction(interaction, store) {
  if (!isControlInteraction(interaction)) return false;
  const isModal = interaction.isModalSubmit();
  const modalParts = isModal ? interaction.customId.split(':') : [];
  const modalAction = modalParts[2];
  const modalChannelId = modalParts[3];
  const channelId = isModal ? modalChannelId : interaction.channelId;
  if (!store.isTemporaryChannel(interaction.guildId, channelId)) {
    await replyEphemeral(interaction, 'This is not an active temporary voice channel.');
    return true;
  }

  const channel = await resolveVoiceChannel(interaction, channelId);
  if (!channel) {
    store.removeTemporaryChannel(interaction.guildId, channelId);
    await replyEphemeral(interaction, 'This temporary voice channel no longer exists.');
    return true;
  }

  const ownerId = store.getTemporaryOwner(interaction.guildId, channelId);
  const action = isModal ? modalAction : Object.keys(BUTTON_IDS).find((key) => BUTTON_IDS[key] === interaction.customId);
  if (action === 'info') {
    await interaction.reply({ embeds: [buildInfoEmbed(channel, ownerId)], ephemeral: true });
    return true;
  }

  if (action === 'claim') {
    if (!channel.members.has(interaction.user.id)) {
      await replyEphemeral(interaction, 'Join this voice channel before claiming it.');
      return true;
    }
    if (ownerId === interaction.user.id) {
      await replyEphemeral(interaction, 'You already own this voice channel.');
      return true;
    }
    if (ownerId && channel.members.has(ownerId)) {
      await replyEphemeral(interaction, 'The current owner is still in this voice channel.');
      return true;
    }
    store.setTemporaryOwner(interaction.guildId, channelId, interaction.user.id);
    if (ownerId) {
      await channel.permissionOverwrites.edit(ownerId, { ViewChannel: null });
    }
    if (channel.permissionOverwrites.cache.get(interaction.guildId)?.deny.has(PermissionFlagsBits.ViewChannel)) {
      await channel.permissionOverwrites.edit(interaction.user.id, { ViewChannel: true });
    }
    await refreshControlPanel(channel, interaction, store);
    await replyEphemeral(interaction, 'You are now the owner of this voice channel.');
    return true;
  }

  if (!isChannelOwnerOrManager(interaction, ownerId)) {
    await replyEphemeral(interaction, 'Only this channel’s owner or a member with Manage Channels can use these controls.');
    return true;
  }

  const reason = `Temporary voice control used by ${interaction.user.tag || interaction.user.id}`;
  if (action === 'rename' && !isModal) {
    const modal = new ModalBuilder()
      .setCustomId(`${MODAL_PREFIX}:rename:${channelId}:${interaction.message.id}`)
      .setTitle('Rename Voice Channel')
      .addComponents(new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('name')
          .setLabel('New channel name')
          .setStyle(TextInputStyle.Short)
          .setMaxLength(100)
          .setRequired(true)
          .setValue(channel.name.slice(0, 100)),
      ));
    await interaction.showModal(modal);
    return true;
  }
  if (action === 'limit' && !isModal) {
    const modal = new ModalBuilder()
      .setCustomId(`${MODAL_PREFIX}:limit:${channelId}:${interaction.message.id}`)
      .setTitle('Set Voice User Limit')
      .addComponents(new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('limit')
          .setLabel('Limit from 0 (unlimited) to 99')
          .setStyle(TextInputStyle.Short)
          .setMaxLength(2)
          .setRequired(true)
          .setValue(String(channel.userLimit || 0)),
      ));
    await interaction.showModal(modal);
    return true;
  }

  if (action === 'rename') {
    const name = interaction.fields.getTextInputValue('name').trim();
    if (!name || name.length > 100) {
      await replyEphemeral(interaction, 'Channel names must be between 1 and 100 characters.');
      return true;
    }
    await channel.setName(name, reason);
    await refreshControlPanel(channel, { ...interaction, message: null }, store);
    await replyEphemeral(interaction, `Voice channel renamed to **${name}**.`);
    return true;
  }
  if (action === 'limit') {
    const limitText = interaction.fields.getTextInputValue('limit').trim();
    if (!/^\d{1,2}$/.test(limitText) || Number(limitText) > 99) {
      await replyEphemeral(interaction, 'Enter a whole number from 0 to 99. Use 0 for unlimited.');
      return true;
    }
    const limit = Number(limitText);
    await channel.setUserLimit(limit, reason);
    await refreshControlPanel(channel, { ...interaction, message: null }, store);
    await replyEphemeral(interaction, limit ? `User limit set to ${limit}.` : 'User limit removed.');
    return true;
  }
  if (action === 'delete') {
    await interaction.deferReply({ ephemeral: true });
    await channel.delete(reason);
    store.removeTemporaryChannel(interaction.guildId, channelId);
    await interaction.editReply('Temporary voice channel deleted.');
    return true;
  }

  const everyoneOverwriteId = interaction.guildId;
  if (action === 'lock') {
    await channel.permissionOverwrites.edit(everyoneOverwriteId, { Connect: false }, { reason });
  } else if (action === 'unlock') {
    await channel.permissionOverwrites.edit(everyoneOverwriteId, { Connect: null }, { reason });
  } else if (action === 'hide') {
    await channel.permissionOverwrites.edit(everyoneOverwriteId, { ViewChannel: false }, { reason });
    if (ownerId) await channel.permissionOverwrites.edit(ownerId, { ViewChannel: true }, { reason });
  } else if (action === 'show') {
    await channel.permissionOverwrites.edit(everyoneOverwriteId, { ViewChannel: null }, { reason });
    if (ownerId) await channel.permissionOverwrites.edit(ownerId, { ViewChannel: null }, { reason });
  }
  await refreshControlPanel(channel, interaction, store);
  const messages = {
    lock: 'Voice channel locked.',
    unlock: 'Voice channel unlocked.',
    hide: 'Voice channel hidden from everyone except its owner and server managers.',
    show: 'Voice channel visible to everyone again.',
  };
  await replyEphemeral(interaction, messages[action] || 'Voice channel updated.');
  return true;
}

module.exports = {
  BUTTON_IDS,
  MODAL_PREFIX,
  buildControlPanel,
  postControlPanel,
  isControlInteraction,
  handleControlInteraction,
};