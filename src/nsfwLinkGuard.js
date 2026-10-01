const INVITE_PATTERN = /(?<![\w.-])(?:https?:\/\/)?(?:www\.)?(?:discord\.gg|discord(?:app)?\.com\/invite)\/([A-Za-z0-9-]+)/gi;
const CACHE_TTL_MS = 2 * 60 * 1000;
const MAX_CACHED_INVITES = 1000;
const inviteCache = new Map();

function getDiscordInviteCodes(content) {
  if (typeof content !== 'string') return [];
  const codes = new Set();
  for (const match of content.matchAll(INVITE_PATTERN)) codes.add(match[1]);
  return [...codes];
}

async function isNsfwInvite(code, fetchInvite, now = Date.now()) {
  const cached = inviteCache.get(code);
  if (cached && cached.expiresAt > now) return cached.isNsfw;
  inviteCache.delete(code);

  let invite;
  try {
    invite = await fetchInvite(code);
  } catch {
    return false;
  }
  const isNsfw = invite?.channel?.nsfw === true;
  if (inviteCache.size >= MAX_CACHED_INVITES) {
    inviteCache.delete(inviteCache.keys().next().value);
  }
  inviteCache.set(code, { isNsfw, expiresAt: now + CACHE_TTL_MS });
  return isNsfw;
}

async function handleMessage(message, store, fetchInvite) {
  if (!message.guild || !message.author || message.author.bot || !store.getEnabled(message.guild.id)) return false;
  const codes = getDiscordInviteCodes(message.content);
  if (codes.length === 0) return false;

  for (const code of codes) {
    if (!await isNsfwInvite(code, fetchInvite)) continue;
    await message.delete().catch(() => null);
    await message.channel.send({
      content: `NSFW server invite links are not allowed here, ${message.author}.`,
      allowedMentions: { parse: [] },
    }).catch(() => null);
    return true;
  }
  return false;
}

function clearInviteCache() {
  inviteCache.clear();
}

module.exports = { getDiscordInviteCodes, isNsfwInvite, handleMessage, clearInviteCache };