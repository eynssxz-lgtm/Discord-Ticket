const MAX_MENTIONED_USERS = 5;
const MAX_REASON_LENGTH = 300;
const AFK_NICKNAME_TAG = '[AFK]';
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

function normalizeNickname(name) {
  return (typeof name === 'string' ? name.trim() : '').replace(new RegExp(`^${AFK_NICKNAME_TAG.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*`, 'i'), '');
}

function getDisplayName(member) {
  return member?.nickname || member?.user?.username || 'Unknown User';
}

async function applyAfkNickname(member) {
  if (!member || !member.setNickname || !member.user) return null;

  const current = member.nickname || member.user.username || '';
  const baseName = normalizeNickname(current);
  if (!baseName) return null;

  if (current.startsWith(AFK_NICKNAME_TAG) || current.startsWith(`${AFK_NICKNAME_TAG} `)) {
    return { originalNickname: baseName, changed: false };
  }

  const newNickname = `${AFK_NICKNAME_TAG} ${baseName}`;
  if (member.nickname === newNickname) return { originalNickname: baseName, changed: false };

  await member.setNickname(newNickname).catch(() => null);
  return { originalNickname: baseName, changed: true };
}

async function restoreAfkNickname(member, state = {}) {
  if (!member || !member.setNickname || !member.user) return null;

  const originalNickname = (state.originalNickname || normalizeNickname(member.nickname || member.user.username || '')).trim();
  if (!originalNickname) return null;

  const currentNickname = member.nickname || member.user.username || '';
  if (!currentNickname.startsWith(`${AFK_NICKNAME_TAG} `) && !currentNickname.startsWith(AFK_NICKNAME_TAG)) return null;

  if (currentNickname === originalNickname) return { restored: false };

  await member.setNickname(originalNickname).catch(() => null);
  return { restored: true };
}

async function handleMessage(message, store) {
  const guild = message.guild;
  const author = message.author;
  if (!guild || !author || author.bot) return;

  const authorStatus = store.get(guild.id, author.id);
  if (authorStatus && message.member && typeof message.member.setNickname === 'function') {
    await restoreAfkNickname(message.member, authorStatus).catch(() => null);
  }
  if (authorStatus) store.clear(guild.id, author.id);

  const embeds = [];
  if (authorStatus) {
    const duration = formatAfkDuration(authorStatus.since);
    embeds.push({
      color: 0x000000,
      author: {
        name: `${message.member?.displayName || author.username}, welcome back`,
        ...(author.displayAvatarURL ? { icon_url: author.displayAvatarURL({ size: 128 }) } : {}),
      },
      description: `You were AFK for ${duration}.`,
    });
  }

  const mentionedUsers = [...(message.mentions?.users?.values() || [])]
    .filter((user) => user.id !== author.id)
    .slice(0, MAX_MENTIONED_USERS);
  for (const user of mentionedUsers) {
    const status = store.get(guild.id, user.id);
    if (status) {
      const duration = formatAfkDuration(status.since);
      embeds.push({
        color: 0x000000,
        author: {
          name: `${user.globalName || user.username || 'Member'} is AFK`,
          ...(user.displayAvatarURL ? { icon_url: user.displayAvatarURL({ size: 128 }) } : {}),
        },
        description: `Away for ${duration}. Reason: ${status.reason.slice(0, MAX_REASON_LENGTH)}`,
      });
    }
  }

  if (embeds.length === 0) return;
  await message.channel.send({
    embeds,
    allowedMentions: { parse: [] },
  });
}

module.exports = {
  formatAfkDuration,
  handleMessage,
  applyAfkNickname,
  restoreAfkNickname,
  getDisplayName,
  normalizeNickname,
  AFK_NICKNAME_TAG,
};