// src/managers/userManager.js
// Manages persistent user profiles: points, stats, inventory

const { readJSON, writeJSON } = require('../utils/storage');

const USERS_FILE = 'users.json';

// ── Default profile factory ───────────────────────────────────────────────────
function defaultProfile(userId) {
  return {
    userId,
    points: 0,
    gamesPlayed: 0,
    wins: 0,
    eliminations: 0,
    inventory: {},           // { itemId: quantity }
    totalSuccessfulTurns: 0, // lifetime successful elimination turns
    itemsUsed: 0,            // lifetime items consumed
    itemsPurchased: 0,       // lifetime items bought
  };
}

// ── Internal helpers ──────────────────────────────────────────────────────────
function loadAll() {
  return readJSON(USERS_FILE, {});
}

function saveAll(data) {
  writeJSON(USERS_FILE, data);
}

// ── Public API ────────────────────────────────────────────────────────────────

/** Get or create a user profile (migrates missing fields safely) */
function getUser(userId) {
  const all = loadAll();
  if (!all[userId]) {
    all[userId] = defaultProfile(userId);
    saveAll(all);
  } else {
    // Migrate missing new fields without overwriting existing data
    const def = defaultProfile(userId);
    let changed = false;
    for (const key of Object.keys(def)) {
      if (all[userId][key] === undefined) {
        all[userId][key] = def[key];
        changed = true;
      }
    }
    if (changed) saveAll(all);
  }
  return all[userId];
}

/** Persist a modified user profile */
function saveUser(profile) {
  const all = loadAll();
  all[profile.userId] = profile;
  saveAll(all);
}

/** Add points to a user */
function addPoints(userId, amount) {
  const profile = getUser(userId);
  profile.points = Math.max(0, profile.points + amount);
  saveUser(profile);
  return profile.points;
}

/** Deduct points from a user. Returns false if insufficient funds. */
function spendPoints(userId, amount) {
  const profile = getUser(userId);
  if (profile.points < amount) return false;
  profile.points -= amount;
  saveUser(profile);
  return true;
}

/** Increment gamesPlayed */
function recordGamePlayed(userId) {
  const p = getUser(userId);
  p.gamesPlayed = (p.gamesPlayed || 0) + 1;
  saveUser(p);
}

/** Record a win */
function recordWin(userId) {
  const p = getUser(userId);
  p.wins = (p.wins || 0) + 1;
  saveUser(p);
}

/** Record an elimination performed by userId */
function recordElimination(userId) {
  const p = getUser(userId);
  p.eliminations = (p.eliminations || 0) + 1;
  saveUser(p);
}

/** Increment totalSuccessfulTurns lifetime stat */
function incrementSuccessfulTurns(userId) {
  const p = getUser(userId);
  p.totalSuccessfulTurns = (p.totalSuccessfulTurns || 0) + 1;
  saveUser(p);
}

/** Increment itemsUsed lifetime stat */
function incrementItemsUsed(userId) {
  const p = getUser(userId);
  p.itemsUsed = (p.itemsUsed || 0) + 1;
  saveUser(p);
}

/** Increment itemsPurchased lifetime stat */
function incrementPurchased(userId) {
  const p = getUser(userId);
  p.itemsPurchased = (p.itemsPurchased || 0) + 1;
  saveUser(p);
}

/** Add item to inventory */
function addItem(userId, itemId, quantity = 1) {
  const p = getUser(userId);
  if (!p.inventory) p.inventory = {};
  p.inventory[itemId] = (p.inventory[itemId] || 0) + quantity;
  saveUser(p);
}

/** Remove one unit of an item from inventory. Returns false if not owned. */
function consumeItem(userId, itemId) {
  const p = getUser(userId);
  if (!p.inventory) p.inventory = {};
  if (!p.inventory[itemId] || p.inventory[itemId] <= 0) return false;
  p.inventory[itemId] -= 1;
  if (p.inventory[itemId] === 0) delete p.inventory[itemId];
  saveUser(p);
  return true;
}

/** Check if user owns at least 1 of itemId */
function hasItem(userId, itemId) {
  const p = getUser(userId);
  return (p.inventory?.[itemId] || 0) > 0;
}

/** Get top N users sorted by wins then points */
function getLeaderboard(limit = 10) {
  const all = loadAll();
  return Object.values(all)
    .sort((a, b) => {
      if (b.wins !== a.wins) return b.wins - a.wins;
      return b.points - a.points;
    })
    .slice(0, limit);
}

module.exports = {
  getUser,
  saveUser,
  addPoints,
  spendPoints,
  recordGamePlayed,
  recordWin,
  recordElimination,
  incrementSuccessfulTurns,
  incrementItemsUsed,
  incrementPurchased,
  addItem,
  consumeItem,
  hasItem,
  getLeaderboard,
};
