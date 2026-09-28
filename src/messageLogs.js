const MAX_EMBED_DESCRIPTION_LENGTH = 4_096;

function getImageAttachment(message) {
  return [...(message.attachments?.values?.() || [])].find((attachment) => (
    attachment.contentType?.startsWith('image/')
    || /\.(png|jpe?g|gif|webp|bmp|svg)(\?.*)?$/i.test(attachment.url)
  )) || null;
}

function buildDeletedMessageLog(message) {
  const author = message.author;
  const authorName = author?.tag || author?.username || 'Unknown author';
  const authorId = author?.id || 'unknown';
  const description = message.content?.trim() || '[No text content]';
  const attachment = getImageAttachment(message);
  const embed = {
    color: 0xed4245,
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

  return {
    embeds: [embed],
    allowedMentions: { parse: [] },
  };
}

module.exports = { buildDeletedMessageLog };
