// NEXO Roulette - Main entry point
// Loads environment, starts Discord client, Express health server, and message handler

require('dotenv').config();
const { Client, GatewayIntentBits, Partials, Events } = require('discord.js');
const { startHealthServer } = require('./src/services/healthServer');
const { handleMessage }     = require('./src/commands/roulette');
const { getSession }        = require('./src/managers/sessionManager');
const { handleGlobalCommands } = require('./src/commands/globalCommands');

// ── Discord Client Setup ──────────────────────────────────────────────────────
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers,
  ],
  partials: [Partials.Message, Partials.Channel],
});

// ── Ready Event ───────────────────────────────────────────────────────────────
client.once(Events.ClientReady, async () => {
  console.log(`✅ NEXO Roulette is online as ${client.user.tag}`);
  startHealthServer();
  
  // Deploy Slash Commands
  const { deployCommands } = require('./src/deployCommands');
  await deployCommands(client.user.id, process.env.TOKEN);
});

// ── Message Command Handler ───────────────────────────────────────────────────
client.on('messageCreate', async (message) => {
  if (message.author.bot) return;
  if (!message.guild)     return;
  try {
    const isGlobal = await handleGlobalCommands(client, message);
    if (!isGlobal) {
      await handleMessage(client, message);
    }
  } catch (err) {
    console.error('[messageCreate] Unhandled error:', err);
  }
});

// ── Message Delete Handler ───────────────────────────────────────────────────
// Stop game immediately if active lobby or game message is deleted
client.on(Events.MessageDelete, async (message) => {
  if (!message.guild) return;
  const session = getSession(message.channelId);
  if (!session || session.destroyed) return;

  await session.handleMessageDeleted(message.id);
});

client.on(Events.MessageBulkDelete, async (messages) => {
  const first = messages.first();
  if (!first || !first.guild) return;
  const session = getSession(first.channelId);
  if (!session || session.destroyed) return;

  for (const msg of messages.values()) {
    if (session.destroyed) break;
    await session.handleMessageDeleted(msg.id);
  }
});

// ── Interaction Router ────────────────────────────────────────────────────────
// Global interactions (e.g. from -متجر) are handled first.
// Session interactions (buttons/selects in game) are routed to GameSession.
client.on(Events.InteractionCreate, async (interaction) => {
  if (!interaction.guild) return;

  if (interaction.isChatInputCommand()) {
    try {
      const { handleGlobalSlashCommands } = require('./src/commands/globalCommands');
      const { handleSlashCommand: handleRouletteSlash } = require('./src/commands/roulette');
      
      const isGlobal = await handleGlobalSlashCommands(client, interaction);
      if (!isGlobal) {
        await handleRouletteSlash(client, interaction);
      }
    } catch (err) {
      console.error('[interactionCreate] Slash command error:', err);
    }
    return;
  }

  if (!interaction.isButton() && !interaction.isStringSelectMenu()) return;

  const { handleGlobalInteractions } = require('./src/commands/globalCommands');
  try {
    const isGlobal = await handleGlobalInteractions(client, interaction);
    if (isGlobal) return;
  } catch (err) {
    console.error('[interactionCreate] Global handler error:', err);
  }

  const session = getSession(interaction.channelId);
  if (!session) {
    // No active session — acknowledge silently
    if (!interaction.replied && !interaction.deferred) {
      await interaction.reply({ content: '❌ لا توجد لعبة نشطة في هذه القناة.', ephemeral: true })
        .catch(() => {});
    }
    return;
  }

  try {
    await session.handleInteraction(interaction);
  } catch (err) {
    console.error('[interactionCreate] Session handler error:', err);
    try {
      if (!interaction.replied && !interaction.deferred) {
        await interaction.reply({ content: '❌ حدث خطأ. حاول مجددًا.', ephemeral: true });
      }
    } catch (_) {}
  }
});

// ── Global Error Handlers ─────────────────────────────────────────────────────
process.on('unhandledRejection', (err) => {
  console.error('[unhandledRejection]', err);
});
process.on('uncaughtException', (err) => {
  console.error('[uncaughtException]', err);
});

// ── Login ─────────────────────────────────────────────────────────────────────
client.login(process.env.TOKEN).catch((err) => {
  console.error('❌ Failed to login:', err.message);
  process.exit(1);
});
