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
      const url = new URL(value);
      if (!['http:', 'https:'].includes(url.protocol)) return null;
      return { [field]: url.toString() };
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

function formatMessage(template, member) {
  return template
    .replaceAll('{user}', `<@${member.id}>`)
    .replaceAll('{username}', member.user.username)
    .replaceAll('{server}', member.guild.name)
    .replaceAll('{memberCount}', String(member.guild.memberCount));
}

function buildPayload(config, member) {
  const embedConfig = config.embed || {};
  const embed = new EmbedBuilder();
  let hasEmbedContent = false;

  for (const field of TEXT_FIELDS) {
    if (embedConfig[field]) {
      if (field === 'footer') embed.setFooter({ text: embedConfig.footer });
      else if (field === 'author') embed.setAuthor({ name: embedConfig.author });
      else embed[`set${field[0].toUpperCase()}${field.slice(1)}`](embedConfig[field]);
      hasEmbedContent = true;
    }
  }

  if (embedConfig.color) {
    embed.setColor(embedConfig.color);
    hasEmbedContent = true;
  }
  if (embedConfig.image) {
    embed.setImage(embedConfig.image);
    hasEmbedContent = true;
  }
  if (embedConfig.thumbnail) {
    embed.setThumbnail(embedConfig.thumbnail);
    hasEmbedContent = true;
  }

  const content = config.message ? formatMessage(config.message, member) : null;
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

module.exports = { parseChannelId, parseEmbedUpdate, parseEmbedEdit, formatMessage, buildPayload, help };