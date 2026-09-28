const {
  ActionRowBuilder,
  ChannelType,
  ModalBuilder,
  PermissionFlagsBits,
  SlashCommandBuilder,
  TextInputBuilder,
  TextInputStyle,
} = require('discord.js');
const { parseEmbedUpdate } = require('./welcome');

const EMBED_MODAL_ID = 'sinclair-welcome-embed-edit';
const MODAL_FIELDS = [
  { name: 'title', label: 'Title', style: TextInputStyle.Short, maxLength: 256 },
  { name: 'description', label: 'Description', style: TextInputStyle.Paragraph, maxLength: 4000 },
  { name: 'color', label: 'Color (hex)', style: TextInputStyle.Short, maxLength: 7 },
  { name: 'footer', label: 'Footer', style: TextInputStyle.Short, maxLength: 2048 },
  { name: 'image', label: 'Image URL', style: TextInputStyle.Short, maxLength: 400 },
];

function getCommands() {
  const manageGuild = PermissionFlagsBits.ManageGuild;
  return [
    new SlashCommandBuilder()
      .setName('edit-embed')
      .setDescription('Open the welcome embed editor')
      .setDefaultMemberPermissions(manageGuild),
    new SlashCommandBuilder()
      .setName('set-welcome-channel')
      .setDescription('Choose where welcome messages are sent')
      .setDefaultMemberPermissions(manageGuild)
      .addChannelOption((option) => option
        .setName('channel')
        .setDescription('Text channel for welcome messages')
        .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
        .setRequired(true)),
    new SlashCommandBuilder()
      .setName('set-welcome-message')
      .setDescription('Set the text shown when a member joins')
      .setDefaultMemberPermissions(manageGuild)
      .addStringOption((option) => option
        .setName('message')
        .setDescription('Use {user}, {username}, {server}, or {memberCount}')
        .setMaxLength(2000)
        .setRequired(true)),
  ].map((command) => command.toJSON());
}

function buildEmbedModal(embed = {}) {
  const modal = new ModalBuilder()
    .setCustomId(EMBED_MODAL_ID)
    .setTitle('Edit Embed');

  modal.addComponents(...MODAL_FIELDS.map(({ name, label, style, maxLength }) => {
    const input = new TextInputBuilder()
      .setCustomId(name)
      .setLabel(label)
      .setStyle(style)
      .setRequired(false)
      .setMaxLength(maxLength);

    if (embed[name]) input.setValue(embed[name].slice(0, maxLength));
    return new ActionRowBuilder().addComponents(input);
  }));

  return modal;
}

function parseModalValues(values) {
  const updates = {};
  for (const { name } of MODAL_FIELDS) {
    const value = (values[name] || '').trim();
    if (!value) {
      updates[name] = null;
      continue;
    }

    const update = parseEmbedUpdate(name, value);
    if (!update) return null;
    Object.assign(updates, update);
  }
  return updates;
}

module.exports = { EMBED_MODAL_ID, getCommands, buildEmbedModal, parseModalValues };