// src/managers/sessionManager.js
// Manages active game sessions. One session per channel at a time.

/** @type {Map<string, import('../game/GameSession')>} channelId → session */
const sessions = new Map();

/** Check if a channel has an active session */
function hasSession(channelId) {
  return sessions.has(channelId);
}

/** Get the active session for a channel */
function getSession(channelId) {
  return sessions.get(channelId) || null;
}

/** Register a new session */
function setSession(channelId, session) {
  sessions.set(channelId, session);
}

/**
 * Remove a session from the map WITHOUT calling destroy().
 * GameSession.destroy() calls this itself after cleanup so we must not recurse.
 */
function removeSession(channelId) {
  sessions.delete(channelId);
}

module.exports = { hasSession, getSession, setSession, removeSession };
