// src/utils/constants.js
// Central constants for NEXO Roulette. Edit here to tune gameplay.

module.exports = {
  // Lobby
  LOBBY_DURATION_MS: 60_000,
  MIN_PLAYERS: 3,
  MAX_PLAYERS: 20,

  // Turns
  TURN_DURATION_MS: 15_000,
  REACTION_WINDOW_MS: 5_000,
  REVIVE_WINDOW_MS: 10_000,

  // ── Points rewards (FINAL version) ─────────────────────────────────────────
  // Escalating per-match elimination turn counter: reward = count * 10
  // First successful turn = +10, second = +20, third = +30 …
  POINTS: {
    JOIN_GAME: 5,   // awarded when game starts with ≥3 players
    WIN_GAME: 15,   // awarded to the final winner
    // Elimination rewards are calculated in GameSession via successfulTurnCounts
  },

  // Colors (hex integers for Discord embeds)
  COLORS: {
    PRIMARY: 0xff4500,
    SUCCESS: 0xff6b00,
    DANGER:  0xb00000,
    DARK:    0x1a0000,
    GOLD:    0xffa500,
  },

  // Asset paths
  ASSETS: {
    LOBBY:  'assets/roulette-lobby.png',
    WINNER: 'assets/roulette-winner.png',
  },

  // Spin animation timing (ms)
  SPIN_FAST_INTERVAL: 250,
  SPIN_SLOW_INTERVAL: 600,
  SPIN_FAST_FRAMES:   8,
  SPIN_SLOW_FRAMES:   4,
};
