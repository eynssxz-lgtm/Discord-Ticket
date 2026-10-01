const { createWorker } = require('tesseract.js');

const MAX_IMAGE_SIZE = 8 * 1024 * 1024;
const MAX_IMAGES_PER_MESSAGE = 3;
const DISCORD_IMAGE_HOSTS = new Set(['cdn.discordapp.com', 'media.discordapp.net']);
const IMAGE_EXTENSION = /\.(?:png|jpe?g|webp|bmp|gif|tiff?)(?:\?.*)?$/i;
const CRYPTO_TERMS = /\b(?:crypto(?:currency)?|bitcoin|btc|ethereum|eth|usdt|usdc|solana|sol|wallet|blockchain|token)\b/i;
const SCAM_SIGNALS = /\b(?:seed phrase|recovery phrase|private key|connect your wallet|verify your wallet|double your|guaranteed profit|guaranteed return|send.{0,30}(?:receive|double|claim)|claim.{0,30}(?:free|bitcoin|btc|ethereum|eth|crypto|token)|(?:airdrop|giveaway).{0,40}(?:claim|wallet|verify))\b/i;

let workerPromise;

function isCryptoScamText(text) {
  if (typeof text !== 'string') return false;
  return CRYPTO_TERMS.test(text) && SCAM_SIGNALS.test(text);
}

function getImageAttachments(message) {
  return [...(message.attachments?.values?.() || [])]
    .filter((attachment) => (
      attachment.contentType?.startsWith('image/')
      || IMAGE_EXTENSION.test(attachment.name || attachment.url || '')
    ))
    .filter((attachment) => !Number.isFinite(attachment.size) || attachment.size <= MAX_IMAGE_SIZE)
    .slice(0, MAX_IMAGES_PER_MESSAGE);
}

async function downloadDiscordImage(url) {
  const parsedUrl = new URL(url);
  if (parsedUrl.protocol !== 'https:' || !DISCORD_IMAGE_HOSTS.has(parsedUrl.hostname)) {
    throw new Error('Antiscam only scans images hosted by Discord.');
  }

  const response = await fetch(parsedUrl);
  if (!response.ok) throw new Error(`Could not download image (${response.status}).`);
  const contentLength = Number.parseInt(response.headers.get('content-length') || '', 10);
  if (Number.isFinite(contentLength) && contentLength > MAX_IMAGE_SIZE) return null;
  const buffer = Buffer.from(await response.arrayBuffer());
  return buffer.length <= MAX_IMAGE_SIZE ? buffer : null;
}

async function recognizeImage(buffer) {
  workerPromise ||= createWorker('eng');
  const worker = await workerPromise;
  const result = await worker.recognize(buffer);
  return result.data.text;
}

async function scanMessageForCryptoScam(message, dependencies = {}) {
  const images = getImageAttachments(message);
  const downloadImage = dependencies.downloadImage || downloadDiscordImage;
  const recognize = dependencies.recognize || recognizeImage;

  for (const attachment of images) {
    const buffer = await downloadImage(attachment.url);
    if (!buffer) continue;
    const text = await recognize(buffer);
    if (isCryptoScamText(text)) return { attachment, text };
  }
  return null;
}

module.exports = {
  MAX_IMAGE_SIZE,
  getImageAttachments,
  isCryptoScamText,
  scanMessageForCryptoScam,
};
