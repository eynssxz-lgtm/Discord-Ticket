const MAX_NOTICE_LENGTH = 1800;
const MAX_MENTIONED_USERS = 5;
const MAX_REASON_LENGTH = 300;
const DURATION_UNITS = [
  ['day', 24 * 60 * 60],
  ['hour', 60 * 60],
  ['minute', 60],
  ['second', 1],
];

function formatAfkDuration(since, now = Date.now()) {
  let remainingSeconds = Math.max(0, Math.floor((now - since) / 1000));
  if (remainingSeconds === 0) return 'less than a second';

  const parts = [];
  for (const [unit, secondsPerUnit] of DURATION_UNITS) {
    const count = Math.floor(remainingSeconds / secondsPerUnit);
    if (count > 0) {
      parts.push(`${count} ${unit}${count === 1 ? '' : 's'}`);
      remainingSeconds %= secondsPerUnit;
    }
    if (parts.length === 2) break;
  }
  return parts.join(', ');
}

async function handleMessage(message, store) {
  const guild = message.guild;
  const author = message.author;
  if (!guild || !author || author.bot) return;

  const authorStatus = store.get(guild.id, author.id);
  if (authorStatus) store.clear(guild.id, author.id);

  const notices = [];
  if (authorStatus) {
    const duration = formatAfkDuration(authorStatus.since);
    notices.push(`${message.member?.displayName || author.username}, welcome back. You were AFK for ${duration}; your status was removed.`);
  }

  const mentionedUsers = [...(message.mentions?.users?.values() || [])]
    .filter((user) => user.id !== author.id)
    .slice(0, MAX_MENTIONED_USERS);
  for (const user of mentionedUsers) {
    const status = store.get(guild.id, user.id);
    if (status) {
      const duration = formatAfkDuration(status.since);
      notices.push(`<@${user.id}> is AFK for ${duration}: ${status.reason.slice(0, MAX_REASON_LENGTH)}`);
    }
  }

  if (notices.length === 0) return;
  await message.channel.send({
    content: notices.join('\n').slice(0, MAX_NOTICE_LENGTH),
    allowedMentions: { parse: [] },
  });
}

module.exports = { formatAfkDuration, handleMessage };