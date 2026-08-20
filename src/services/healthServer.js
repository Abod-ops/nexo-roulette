// src/services/healthServer.js
// Tiny Express server for uptime/health monitoring

const express = require('express');

/**
 * Start a minimal HTTP health server on the configured PORT.
 * Returns nothing. Should not block the Discord bot.
 */
function startHealthServer() {
  const port = parseInt(process.env.PORT || '3000', 10);
  const app = express();

  app.get('/', (_req, res) => {
    res.send('NEXO Roulette is running ✅');
  });

  app.get('/health', (_req, res) => {
    res.json({ status: 'ok', name: 'nexo-roulette', uptime: process.uptime() });
  });

  app.listen(port, () => {
    console.log(`🌐 Health server running on port ${port}`);
  });
}

module.exports = { startHealthServer };
