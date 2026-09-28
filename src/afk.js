const MAX_NOTICE_LENGTH = 1800;
const MAX_MENTIONED_USERS = 5;
const MAX_REASON_LENGTH = 300;

async function handleMessage(message, store) {
  const guild = message.guild;
  const author = message.author;
  if (!guild || !author || author.bot) return;

  const authorStatus = store.get(guild.id, author.id);
  if (authorStatus) store.clear(guild.id, author.id);

  const notices = [];
  if (authorStatus) {
    notices.push(`${message.member?.displayName || author.username}, welcome back. Your AFK status was removed.`);
  }

  const mentionedUsers = [...(message.mentions?.users?.values() || [])]
    .filter((user) => user.id !== author.id)
    .slice(0, MAX_MENTIONED_USERS);
  for (const user of mentionedUsers) {
    const status = store.get(guild.id, user.id);
    if (status) notices.push(`<@${user.id}> is AFK: ${status.reason.slice(0, MAX_REASON_LENGTH)}`);
  }

  if (notices.length === 0) return;
  await message.channel.send({
    content: notices.join('\n').slice(0, MAX_NOTICE_LENGTH),
    allowedMentions: { parse: [] },
  });
}

module.exports = { handleMessage };