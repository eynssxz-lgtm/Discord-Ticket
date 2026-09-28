const COMMAND_EMBED_COLOR = 0x000000;
const MAX_EMBED_DESCRIPTION_LENGTH = 4096;

function normalizeEmbed(embed) {
  const data = typeof embed.toJSON === 'function' ? embed.toJSON() : { ...embed };
  return { ...data, color: COMMAND_EMBED_COLOR };
}

function normalizeCommandReply(payload) {
  const options = typeof payload === 'string' ? { content: payload } : { ...payload };
  const content = options.content;
  delete options.content;

  const embeds = (options.embeds || []).map(normalizeEmbed);
  if (content !== undefined && content !== null && String(content).length > 0) {
    embeds.unshift({
      color: COMMAND_EMBED_COLOR,
      description: String(content).slice(0, MAX_EMBED_DESCRIPTION_LENGTH),
    });
  }
  if (embeds.length === 0) {
    embeds.push({ color: COMMAND_EMBED_COLOR, description: 'Command completed.' });
  }

  options.embeds = embeds;
  return options;
}

function wrapCommandReplyMethods(target, methodNames = ['reply', 'editReply', 'followUp']) {
  for (const methodName of methodNames) {
    if (typeof target[methodName] !== 'function') continue;
    const original = target[methodName].bind(target);
    target[methodName] = (payload, ...args) => original(normalizeCommandReply(payload), ...args);
  }
  return target;
}

module.exports = {
  COMMAND_EMBED_COLOR,
  normalizeCommandReply,
  wrapCommandReplyMethods,
};
