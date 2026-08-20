// src/utils/helpers.js
// Miscellaneous helper utilities used across the bot

/**
 * Sleep for a given number of milliseconds
 */
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Pick a random element from an array
 */
function randomChoice(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

/**
 * Shuffle an array (Fisher-Yates)
 */
function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/**
 * Format milliseconds as Arabic countdown string, e.g. "42 ثانية"
 */
function formatSeconds(ms) {
  const s = Math.ceil(ms / 1000);
  return `${s} ثانية`;
}

/**
 * Get a Discord avatar URL for a GuildMember at a given size
 */
function getAvatarUrl(member, size = 128) {
  return (
    member.displayAvatarURL({ format: 'png', dynamic: false, size }) ||
    member.user.defaultAvatarURL
  );
}

/**
 * Split an array into chunks of maxSize
 */
function chunkArray(arr, maxSize) {
  const chunks = [];
  for (let i = 0; i < arr.length; i += maxSize) {
    chunks.push(arr.slice(i, i + maxSize));
  }
  return chunks;
}

/**
 * Safely disable all components on a message
 */
async function disableAllComponents(message) {
  try {
    const rows = message.components.map((row) => {
      const newRow = row.toJSON();
      newRow.components = newRow.components.map((c) => ({ ...c, disabled: true }));
      return newRow;
    });
    await message.edit({ components: rows });
  } catch (_) {
    // Message may have been deleted; ignore
  }
}

/**
 * Format numbers with k, m, b
 */
function formatPoints(num) {
  if (num >= 1000000000) return (num / 1000000000).toFixed(1).replace(/\.0$/, '') + 'b';
  if (num >= 1000000) return (num / 1000000).toFixed(1).replace(/\.0$/, '') + 'm';
  if (num >= 1000) return (num / 1000).toFixed(1).replace(/\.0$/, '') + 'k';
  return num.toString();
}

module.exports = { sleep, randomChoice, shuffle, formatSeconds, getAvatarUrl, chunkArray, disableAllComponents, formatPoints };
