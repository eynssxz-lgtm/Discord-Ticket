const MAX_TRIGGER_LENGTH = 100;
const MAX_RESPONSE_LENGTH = 2000;

function isValidTrigger(trigger) {
  return typeof trigger === 'string'
    && trigger.trim().length > 0
    && trigger.trim().length <= MAX_TRIGGER_LENGTH;
}

function parseAddPayload(payload) {
  const separatorIndex = payload.indexOf('|');
  if (separatorIndex < 0) {
    return null;
  }

  const trigger = payload.slice(0, separatorIndex).trim();
  const response = payload.slice(separatorIndex + 1).trim();
  if (!isValidTrigger(trigger) || !response || response.length > MAX_RESPONSE_LENGTH) {
    return null;
  }

  return { trigger, response };
}

module.exports = { isValidTrigger, parseAddPayload };