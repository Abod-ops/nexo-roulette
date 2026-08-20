// src/commands/roulette.js
// Message command handler for `-روليت`
// Delegates to GameSession for all game logic.

const { hasSession, setSession } = require('../managers/sessionManager');
const GameSession = require('../game/GameSession');
const { checkAssets } = require('../ui/canvasRenderer');

// Check asset availability at startup
checkAssets();

const COMMAND = '-روليت';

// Roles allowed to start a game (case-insensitive match)
const ALLOWED_ROLES = ['games', 'staff'];

/**
 * Check if a GuildMember has at least one of the allowed roles.
 * @param {import('discord.js').GuildMember} member
 * @returns {boolean}
 */
function hasAllowedRole(member) {
  return member.roles.cache.some((role) =>
    ALLOWED_ROLES.includes(role.name.toLowerCase())
  );
}

/**
 * Handle an incoming message and route to the roulette command if applicable.
 * @param {import('discord.js').Client} client
 * @param {import('discord.js').Message} message
 */
async function handleMessage(client, message) {
  const content = message.content.trim();

  if (content !== COMMAND) return;

  const channel = message.channel;
  const channelId = channel.id;
  const guild = message.guild;
  const member = message.member;

  // Reject if already an active session in this channel
  if (hasSession(channelId)) {
    await message.reply({
      content: '⚠️ هناك لعبة جارية بالفعل في هذه القناة! انتظر انتهاءها.',
    }).catch(() => {});
    return;
  }

  // Fetch full member if partial
  let fullMember = member;
  if (!fullMember) {
    fullMember = await guild.members.fetch(message.author.id).catch(() => null);
  }
  if (!fullMember) {
    await message.reply({ content: '❌ تعذر جلب بياناتك.' }).catch(() => {});
    return;
  }

  // Permission check — must have Games or Staff role
  if (!hasAllowedRole(fullMember)) {
    await message.reply({
      content: '❌ ما تقدر تبدأ الروليت! هذا الأمر متاح فقط لأصحاب رول **Games** أو **Staff**.',
    }).catch(() => {});
    return;
  }

  // Create and register the session
  const session = new GameSession(channel, fullMember);
  setSession(channelId, session);

  try {
    await session.startLobby();
  } catch (err) {
    console.error('[roulette command] Session error:', err);
    session.destroy();
    await message.channel.send({ content: '❌ حدث خطأ غير متوقع. تم إلغاء الجلسة.' }).catch(() => {});
  }
}

async function handleSlashCommand(client, interaction) {
  if (interaction.commandName !== 'roulette') return;

  const channel = interaction.channel;
  const channelId = channel.id;
  const guild = interaction.guild;
  const member = interaction.member;

  if (hasSession(channelId)) {
    await interaction.reply({
      content: '⚠️ هناك لعبة جارية بالفعل في هذه القناة! انتظر انتهاءها.',
      ephemeral: true
    }).catch(() => {});
    return;
  }

  let fullMember = member;
  if (!fullMember) {
    fullMember = await guild.members.fetch(interaction.user.id).catch(() => null);
  }
  if (!fullMember) {
    await interaction.reply({ content: '❌ تعذر جلب بياناتك.', ephemeral: true }).catch(() => {});
    return;
  }

  if (!hasAllowedRole(fullMember)) {
    await interaction.reply({
      content: '❌ ما تقدر تبدأ الروليت! هذا الأمر متاح فقط لأصحاب رول **Games** أو **Staff**.',
      ephemeral: true
    }).catch(() => {});
    return;
  }

  // Acknowledge the interaction so it doesn't timeout while GameSession starts
  await interaction.deferReply().catch(() => {});

  const session = new GameSession(channel, fullMember);
  setSession(channelId, session);

  try {
    // Delete the deferred reply so it doesn't clutter the chat
    await interaction.deleteReply().catch(() => {});
    await session.startLobby();
  } catch (err) {
    console.error('[roulette slash command] Session error:', err);
    session.destroy();
    await interaction.channel.send({ content: '❌ حدث خطأ غير متوقع. تم إلغاء الجلسة.' }).catch(() => {});
  }
}

module.exports = { handleMessage, handleSlashCommand };
