const DEFAULT_PREFIX = '!';
const MAX_PREFIX_LENGTH = 5;

function isValidPrefix(prefix) {
  return typeof prefix === 'string'
    && prefix.length > 0
    && prefix.length <= MAX_PREFIX_LENGTH
    && !/\s/.test(prefix);
}

function parseCommand(content, prefix) {
  if (!content.startsWith(prefix)) {
    return null;
  }

  const commandText = content.slice(prefix.length).trim();
  if (!commandText) {
    return null;
  }

  const directSetMatch = commandText.match(/^(setprefix|setlogs)(?:\s+([\s\S]+))?$/i);
  if (directSetMatch) {
    const name = directSetMatch[1].toLowerCase();
    const argsText = (directSetMatch[2] || '').trim();
    return {
      name,
      args: argsText ? argsText.split(/\s+/) : [],
    };
  }

  const aliasedSetMatch = commandText.match(/^set\s+(prefix|logs)(?:\s+([\s\S]+))?$/i);
  if (aliasedSetMatch) {
    const name = aliasedSetMatch[1].toLowerCase() === 'logs' ? 'setlogs' : 'setprefix';
    const argsText = (aliasedSetMatch[2] || '').trim();
    return {
      name,
      args: argsText ? argsText.split(/\s+/) : [],
    };
  }

  const [name, ...args] = commandText.split(/\s+/);
  if (!name) {
    return null;
  }

  return { name: name.toLowerCase(), args };
}

module.exports = { DEFAULT_PREFIX, isValidPrefix, parseCommand };