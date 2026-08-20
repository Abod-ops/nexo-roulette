// src/utils/storage.js
// Safe persistent JSON storage helpers for data/ directory

const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(process.cwd(), 'data');

// Ensure data directory exists
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

/**
 * Read a JSON file from data/.
 * Returns defaultValue if the file doesn't exist or is corrupted.
 */
function readJSON(filename, defaultValue = {}) {
  const filePath = path.join(DATA_DIR, filename);
  try {
    if (!fs.existsSync(filePath)) {
      writeJSON(filename, defaultValue);
      return defaultValue;
    }
    const raw = fs.readFileSync(filePath, 'utf-8');
    return JSON.parse(raw);
  } catch (err) {
    console.error(`[storage] Failed to read ${filename}:`, err.message);
    return defaultValue;
  }
}

/**
 * Write data as JSON to data/<filename>.
 * Uses atomic write pattern (write to .tmp then rename) to prevent corruption.
 */
function writeJSON(filename, data) {
  const filePath = path.join(DATA_DIR, filename);
  const tmpPath = filePath + '.tmp';
  try {
    fs.writeFileSync(tmpPath, JSON.stringify(data, null, 2), 'utf-8');
    fs.renameSync(tmpPath, filePath);
  } catch (err) {
    console.error(`[storage] Failed to write ${filename}:`, err.message);
  }
}

module.exports = { readJSON, writeJSON };
