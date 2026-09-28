function parseDuration(value) {
  if (typeof value !== 'string' || value.trim() === '') {
    return null;
  }

  const match = value.trim().match(/^((?:\d+)(?:[smhd]))$/i);
  if (!match) {
    return null;
  }

  const amount = Number.parseInt(match[1].slice(0, -1), 10);
  const unit = match[1].slice(-1).toLowerCase();

  if (Number.isNaN(amount)) {
    return null;
  }

  if (unit === 's') return amount * 1000;
  if (unit === 'm') return amount * 60 * 1000;
  if (unit === 'h') return amount * 60 * 60 * 1000;
  if (unit === 'd') return amount * 24 * 60 * 60 * 1000;
  return null;
}

async function resolveTargetMember(message, rawTarget) {
  if (rawTarget) {
    const targetId = rawTarget.replace(/<@!?|>/g, '').trim();
    const member = message.mentions?.members?.first?.() || message.guild?.members.cache.get?.(targetId);
    if (member) {
      return member;
    }
    if (targetId && message.guild?.members.cache.get?.(targetId)) {
      return message.guild.members.cache.get(targetId);
    }
  }

  if (message.reference?.messageId) {
    const repliedMessage = await message.channel.messages.fetch(message.reference.messageId).catch(() => null);
    if (repliedMessage?.author) {
      const cachedMember = message.guild?.members.cache.get(repliedMessage.author.id);
      if (cachedMember) {
        return cachedMember;
      }

      return {
        id: repliedMessage.author.id,
        user: repliedMessage.author,
        displayAvatarURL: () => repliedMessage.author.displayAvatarURL?.() || null,
      };
    }
  }

  return null;
}

function buildUserCardEmbed(member, kind = 'avatar') {
  const user = member?.user || member;
  const username = user.globalName || user.username || 'Unknown User';
  const avatarUrl = user.avatarURL?.() || user.displayAvatarURL?.() || null;
  const bannerUrl = user.bannerURL?.() || user.coverURL?.() || null;
  const imageUrl = kind === 'cover' ? bannerUrl : avatarUrl;

  return {
    color: 0x5865f2,
    title: `${username}'s ${kind === 'cover' ? 'cover' : 'avatar'}`,
    thumbnail: avatarUrl ? { url: avatarUrl } : undefined,
    image: imageUrl ? { url: imageUrl } : undefined,
    footer: { text: user.id || 'Unknown ID' },
  };
}

function parsePurgeAmount(value) {
  if (typeof value !== 'string') {
    return null;
  }

  const match = value.trim().match(/^(\d+)$/);
  if (!match) {
    return null;
  }

  const amount = Number.parseInt(match[1], 10);
  if (!Number.isFinite(amount) || amount < 1 || amount > 500) {
    return null;
  }

  return amount;
}

module.exports = {
  parseDuration,
  parsePurgeAmount,
  resolveTargetMember,
  buildUserCardEmbed,
};
