const { REST, Routes, SlashCommandBuilder } = require('discord.js');

const commands = [
  new SlashCommandBuilder()
    .setName('shop')
    .setDescription('عرض متجر الخصائص لشراء الأغراض'),
  new SlashCommandBuilder()
    .setName('bag')
    .setDescription('عرض محتويات حقيبتك من الخصائص'),
  new SlashCommandBuilder()
    .setName('leaderboard')
    .setDescription('عرض قائمة المتصدرين في اللعبة'),
  new SlashCommandBuilder()
    .setName('profile')
    .setDescription('عرض ملفك الشخصي ونقاطك'),
  new SlashCommandBuilder()
    .setName('roulette')
    .setDescription('بدء لعبة روليت جديدة (مخصص للإدارة)')
].map(command => command.toJSON());

async function deployCommands(clientId, token) {
  const rest = new REST({ version: '10' }).setToken(token);
  try {
    console.log('[Slash Commands] Started refreshing application (/) commands.');
    await rest.put(
      Routes.applicationCommands(clientId),
      { body: commands },
    );
    console.log('[Slash Commands] Successfully reloaded application (/) commands.');
  } catch (error) {
    console.error('[Slash Commands Error]', error);
  }
}

module.exports = { deployCommands };
