const {
  ActionRowBuilder,
  ChannelType,
  ModalBuilder,
  PermissionFlagsBits,
  SlashCommandBuilder,
  StringSelectMenuBuilder,
  TextInputBuilder,
  TextInputStyle,
} = require('discord.js');
const { parseEmbedUpdate } = require('./welcome');

const EMBED_MODAL_ID = 'sinclair-welcome-embed-edit';
const EMBED_EDITOR_MENU_ID = 'sinclair-welcome-embed-editor';
const MODAL_SECTIONS = {
  basic: {
    title: 'Edit Basic Information',
    fields: [
      { name: 'title', label: 'Title', style: TextInputStyle.Short, maxLength: 256 },
      { name: 'description', label: 'Description', style: TextInputStyle.Paragraph, maxLength: 4000 },
      { name: 'color', label: 'Color (hex)', style: TextInputStyle.Short, maxLength: 7 },
    ],
  },
  author: {
    title: 'Edit Author',
    fields: [{ name: 'author', label: 'Author name', style: TextInputStyle.Short, maxLength: 256 }],
  },
  footer: {
    title: 'Edit Footer',
    fields: [{ name: 'footer', label: 'Footer text', style: TextInputStyle.Short, maxLength: 2048 }],
  },
  images: {
    title: 'Edit Images',
    fields: [
      { name: 'image', label: 'Image URL', style: TextInputStyle.Short, maxLength: 400 },
      { name: 'thumbnail', label: 'Thumbnail URL', style: TextInputStyle.Short, maxLength: 400 },
    ],
  },
};

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
        .setDescription('Supports user, server, channel, avatar, and timestamp variables')
        .setMaxLength(2000)
        .setRequired(true)),
    new SlashCommandBuilder()
      .setName('welcome')
      .setDescription('Manage welcome messages and embeds')
      .addSubcommand((subcommand) => subcommand
        .setName('channel')
        .setDescription('Choose where welcome messages are sent')
        .addChannelOption((option) => option
          .setName('channel')
          .setDescription('Text channel for welcome messages')
          .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
          .setRequired(true)))
      .addSubcommand((subcommand) => subcommand
        .setName('message')
        .setDescription('Set the text shown when a member joins')
        .addStringOption((option) => option
          .setName('message')
          .setDescription('Supports user, server, channel, avatar, and timestamp variables')
          .setMaxLength(2000)
          .setRequired(true)))
      .addSubcommand((subcommand) => subcommand.setName('status').setDescription('Show welcome settings'))
      .addSubcommand((subcommand) => subcommand.setName('disable').setDescription('Disable welcome messages'))
      .addSubcommand((subcommand) => subcommand.setName('preview').setDescription('Preview the configured welcome message'))
      .addSubcommandGroup((group) => group
        .setName('embed')
        .setDescription('Manage the welcome embed')
        .addSubcommand((subcommand) => subcommand.setName('edit').setDescription('Open the welcome embed editor'))
        .addSubcommand((subcommand) => subcommand
          .setName('clear')
          .setDescription('Clear the welcome embed or one field')
          .addStringOption((option) => option
            .setName('field')
            .setDescription('Embed field to clear, or leave empty to clear all')
            .addChoices(
              { name: 'Title', value: 'title' },
              { name: 'Description', value: 'description' },
              { name: 'Color', value: 'color' },
              { name: 'Footer', value: 'footer' },
              { name: 'Author', value: 'author' },
              { name: 'Image', value: 'image' },
              { name: 'Thumbnail', value: 'thumbnail' },
            )
            .setRequired(false)))),
  ].map((command) => command.toJSON());
}

function buildEmbedEditorMenu() {
  const menu = new StringSelectMenuBuilder()
    .setCustomId(EMBED_EDITOR_MENU_ID)
    .setPlaceholder('Select an embed section')
    .addOptions(
      { label: 'Edit basic information', value: 'basic', description: 'Title, description, and color' },
      { label: 'Edit author', value: 'author', description: 'Author name' },
      { label: 'Edit footer', value: 'footer', description: 'Footer text' },
      { label: 'Edit images', value: 'images', description: 'Main image and thumbnail' },
    );
  return new ActionRowBuilder().addComponents(menu);
}

function getModalFields(section) {
  return MODAL_SECTIONS[section]?.fields || null;
}

function buildEmbedModal(section, embed = {}) {
  const modalSection = MODAL_SECTIONS[section];
  if (!modalSection) throw new RangeError(`Unknown embed section: ${section}`);
  const modal = new ModalBuilder()
    .setCustomId(`${EMBED_MODAL_ID}:${section}`)
    .setTitle(modalSection.title);

  modal.addComponents(...modalSection.fields.map(({ name, label, style, maxLength }) => {
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

function parseModalValues(section, values) {
  const fields = getModalFields(section);
  if (!fields) return null;
  const updates = {};
  for (const { name } of fields) {
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

module.exports = {
  EMBED_MODAL_ID,
  EMBED_EDITOR_MENU_ID,
  getCommands,
  buildEmbedEditorMenu,
  getModalFields,
  buildEmbedModal,
  parseModalValues,
};