const MAX_EMBED_DESCRIPTION_LENGTH = 4_096;

function buildLogEmbed(title, description) {
  return {
    color: 0x000000,
    title,
    description: String(description).slice(0, MAX_EMBED_DESCRIPTION_LENGTH),
    timestamp: new Date().toISOString(),
  };
}

function buildServerLogPayload(description) {
  return {
    embeds: [buildLogEmbed('Server log', description)],
    allowedMentions: { parse: [] },
  };
}

function getImageAttachment(message) {
  return [...(message.attachments?.values?.() || [])].find((attachment) => (
    attachment.contentType?.startsWith('image/')
    || /\.(png|jpe?g|gif|webp|bmp|svg)(\?.*)?$/i.test(attachment.url)
  )) || null;
}

function getVideoAttachments(message) {
  return [...(message.attachments?.values?.() || [])].filter((attachment) => (
    attachment.contentType?.startsWith('video/')
    || /\.(mp4|m4v|mov|webm|avi|mkv|mpeg|mpg|3gp|ogv)(\?.*)?$/i.test(attachment.url)
  ));
}

function buildDeletedMessageLog(message) {
  const author = message.author;
  const authorName = author?.tag || author?.username || 'Unknown author';
  const authorId = author?.id || 'unknown';
  const description = message.content?.trim() || '[No text content]';
  const attachment = getImageAttachment(message);
  const videoAttachments = getVideoAttachments(message);
  const embed = {
    color: 0x000000,
    title: 'Message deleted',
    author: {
      name: authorName,
      ...(author?.displayAvatarURL ? { icon_url: author.displayAvatarURL() } : {}),
    },
    description: description.slice(0, MAX_EMBED_DESCRIPTION_LENGTH),
    fields: [
      { name: 'Author', value: `<@${authorId}> (${authorId})`, inline: true },
      { name: 'Channel', value: `<#${message.channel.id}>`, inline: true },
      { name: 'Message ID', value: message.id || 'Unavailable', inline: true },
    ],
  };
  if (message.createdAt instanceof Date) embed.timestamp = message.createdAt.toISOString();
  if (attachment) embed.image = { url: attachment.url };

  const payload = {
    embeds: [embed],
    allowedMentions: { parse: [] },
  };
  if (videoAttachments.length) {
    payload.files = videoAttachments.map(({ url, name }) => ({ attachment: url, name }));
  }
  return payload;
}

module.exports = { buildDeletedMessageLog, buildLogEmbed, buildServerLogPayload };
