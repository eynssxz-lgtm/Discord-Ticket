const { EmbedBuilder } = require('discord.js');

const EMBED_LIMITS = {
  title: 256,
  description: 4096,
  footer: 2048,
  author: 256,
};
const URL_FIELDS = new Set(['image', 'thumbnail']);
const TEXT_FIELDS = new Set(Object.keys(EMBED_LIMITS));
const HEX_COLOR = /^#?[0-9a-f]{6}$/i;
const TEMPLATE_VARIABLES = [
  '{user}', '{user.mention}', '{username}', '{user.name}', '{user.username}',
  '{user.displayName}', '{user.id}', '{user.avatar}', '{user.createdAt}', '{user.joinedAt}',
  '{server}', '{server.name}', '{server.id}', '{server.memberCount}', '{server.icon}',
  '{memberCount}', '{channel.name}', '{channel.id}',
];

function parseChannelId(value) {
  const match = value.match(/^(?:<#(\d+)>|(\d+))$/);
  return match?.[1] || match?.[2] || null;
}

function parseEmbedUpdate(field, value) {
  if (field === 'clear') {
    if (value && ![...TEXT_FIELDS, 'color', ...URL_FIELDS].includes(value.toLowerCase())) {
      return null;
    }
    return value ? { [value.toLowerCase()]: null } : {
      title: null,
      description: null,
      color: null,
      footer: null,
      author: null,
      image: null,
      thumbnail: null,
    };
  }

  if (field === 'color') {
    if (!HEX_COLOR.test(value)) return null;
    return { color: `#${value.replace(/^#/, '')}` };
  }

  if (TEXT_FIELDS.has(field)) {
    if (!value || value.length > EMBED_LIMITS[field]) return null;
    return { [field]: value };
  }

  if (URL_FIELDS.has(field)) {
    if (!value) return null;
    try {
      const validationValue = value.replace(/\{[A-Za-z][A-Za-z0-9.]*\}/g, 'variable');
      const url = new URL(validationValue);
      if (!['http:', 'https:'].includes(url.protocol)) return null;
      return { [field]: value };
    } catch {
      return null;
    }
  }

  return null;
}

function parseEmbedEdit(payload) {
  if (!payload) return null;

  const updates = {};
  for (const entry of payload.split('|')) {
    const match = entry.trim().match(/^(title|description|color|footer|author|image|thumbnail)\s*:\s*([\s\S]*)$/i);
    if (!match) return null;

    const field = match[1].toLowerCase();
    const value = match[2].trim();
    const update = /^clear$/i.test(value)
      ? { [field]: null }
      : parseEmbedUpdate(field, value);
    if (!update) return null;
    Object.assign(updates, update);
  }

  return updates;
}

function toDiscordTimestamp(value, style) {
  const timestamp = value instanceof Date ? value.getTime() : Number(value);
  if (!Number.isFinite(timestamp) || timestamp <= 0) return '';
  return `<t:${Math.floor(timestamp / 1000)}:${style}>`;
}

function formatTemplate(template, member, channel = null) {
  const user = member.user || member;
  const guild = member.guild || {};
  const userId = user.id || member.id || '';
  const variables = {
    user: userId ? `<@${userId}>` : '',
    'user.mention': userId ? `<@${userId}>` : '',
    username: user.username || user.globalName || member.displayName || '',
    'user.name': user.globalName || user.username || member.displayName || '',
    'user.username': user.username || '',
    'user.displayName': member.displayName || user.globalName || user.username || '',
    'user.id': userId,
    'user.avatar': user.displayAvatarURL?.({ size: 256 }) || user.avatarURL?.() || '',
    'user.createdAt': toDiscordTimestamp(user.createdTimestamp || user.createdAt, 'F'),
    'user.joinedAt': toDiscordTimestamp(member.joinedTimestamp || member.joinedAt, 'F'),
    server: guild.name || '',
    'server.name': guild.name || '',
    'server.id': guild.id || '',
    'server.memberCount': guild.memberCount == null ? '' : String(guild.memberCount),
    'server.icon': guild.iconURL?.({ size: 256 }) || '',
    memberCount: guild.memberCount == null ? '' : String(guild.memberCount),
    'channel.name': channel?.name || '',
    'channel.id': channel?.id || '',
  };

  return template.replace(/\{([A-Za-z][A-Za-z0-9.]*)\}/g, (placeholder, key) => (
    Object.hasOwn(variables, key) ? variables[key] : placeholder
  ));
}

function formatMessage(template, member, channel) {
  return formatTemplate(template, member, channel);
}

function buildPayload(config, member, channel = null) {
  const embedConfig = config.embed || {};
  const embed = new EmbedBuilder();
  let hasEmbedContent = false;

  for (const field of TEXT_FIELDS) {
    if (embedConfig[field]) {
      const value = formatTemplate(embedConfig[field], member, channel).slice(0, EMBED_LIMITS[field]);
      if (field === 'footer') embed.setFooter({ text: value });
      else if (field === 'author') embed.setAuthor({ name: value });
      else embed[`set${field[0].toUpperCase()}${field.slice(1)}`](value);
      hasEmbedContent = true;
    }
  }

  if (embedConfig.color) {
    embed.setColor(embedConfig.color);
    hasEmbedContent = true;
  }
  if (embedConfig.image) {
    embed.setImage(formatTemplate(embedConfig.image, member, channel));
    hasEmbedContent = true;
  }
  if (embedConfig.thumbnail) {
    embed.setThumbnail(formatTemplate(embedConfig.thumbnail, member, channel));
    hasEmbedContent = true;
  }

  const content = config.message ? formatMessage(config.message, member, channel) : null;
  return {
    content,
    embeds: hasEmbedContent ? [embed] : [],
    allowedMentions: { users: [member.id], roles: [], parse: [] },
  };
}

function help(prefix) {
  return [
    `\`${prefix}Set Welcome Channel #channel\``,
    `\`${prefix}Set Welcome Message Welcome {user} to {server}!\``,
    `\`${prefix}Edit Embed title: Welcome! | description: Say hello to {username}! | color: #36a2eb\``,
    `Edit fields: title, description, color, footer, author, image, thumbnail. Set a value to \`clear\` to remove that field.`,
    `\`${prefix}Edit Embed clear [field]\``,
    `\`${prefix}welcome preview\`, \`${prefix}welcome status\`, \`${prefix}welcome disable\``,
  ].join('\n');
}

module.exports = {
  parseChannelId,
  parseEmbedUpdate,
  parseEmbedEdit,
  formatTemplate,
  formatMessage,
  buildPayload,
  help,
  TEMPLATE_VARIABLES,
};