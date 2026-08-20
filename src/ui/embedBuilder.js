// src/ui/embedBuilder.js
// All Discord embed factory functions for NEXO Roulette
// Unified luxury crimson/gold theme matching profile & leaderboard cards.

const { EmbedBuilder, AttachmentBuilder } = require('discord.js');
const { COLORS } = require('../utils/constants');
const {
  generateBackpackCard,
  generateLeaderboardCard,
  generateProfileCard,
} = require('./canvasRenderer');

const C = COLORS;

// ─────────────────────────────────────────────────────────────────────────────
// LOBBY (Fallback embed if needed)
// ─────────────────────────────────────────────────────────────────────────────
function buildLobbyEmbed(playerCount, maxPlayers, remainingMs) {
  const seconds = Math.max(0, Math.ceil(remainingMs / 1000));
  return new EmbedBuilder()
    .setColor(C.DANGER)
    .setTitle('🎡  روليت NEXO')
    .setDescription(
      `👥  **المشاركون:**  \`${playerCount} / ${maxPlayers}\`\n` +
      `⏳  **الوقت المتبقي:**  \`${seconds} ثانية\``
    )
    .setFooter({ text: 'NEXO Roulette  •  اضغط دخول للانضمام  🦊' });
}

// ─────────────────────────────────────────────────────────────────────────────
// GAME START
// ─────────────────────────────────────────────────────────────────────────────
function buildGameStartEmbed(members) {
  const names = members.map((m, i) => `${i + 1}. **${m.displayName}**`).join('\n');
  return new EmbedBuilder()
    .setColor(C.DANGER)
    .setTitle('🚀  بدأت اللعبة!')
    .setDescription(`**المشاركون في الميدان (${members.length}):**\n\n${names}`)
    .setFooter({ text: 'NEXO Roulette  •  الإقصاء يبدأ الآن!' })
    .setTimestamp();
}

// ─────────────────────────────────────────────────────────────────────────────
// SPIN
// ─────────────────────────────────────────────────────────────────────────────

// ─────────────────────────────────────────────────────────────────────────────
// TURN  🎯
// ─────────────────────────────────────────────────────────────────────────────

// ─────────────────────────────────────────────────────────────────────────────
// ELIMINATION  💀
// ─────────────────────────────────────────────────────────────────────────────

// ─────────────────────────────────────────────────────────────────────────────
// FINAL 2
// ─────────────────────────────────────────────────────────────────────────────

// ─────────────────────────────────────────────────────────────────────────────
// WINNER
// ─────────────────────────────────────────────────────────────────────────────

// ─────────────────────────────────────────────────────────────────────────────
// CANCELED
// ─────────────────────────────────────────────────────────────────────────────
function buildCanceledEmbed(reason) {
  return new EmbedBuilder()
    .setColor(C.DARK)
    .setTitle('🛑  تم إلغاء اللعبة')
    .setDescription(`> ${reason}`)
    .setFooter({ text: 'NEXO Roulette  •  اكتب -روليت لبدء لعبة جديدة' })
    .setTimestamp();
}

// ─────────────────────────────────────────────────────────────────────────────
// SHOP — Category picker (Organized, concise, luxury theme)
// ─────────────────────────────────────────────────────────────────────────────
// SHOP  🛒  — returns { embed, attachment }
// ─────────────────────────────────────────────────────────────────────────────
async function buildShopResponse(member, userPoints, category, items, userInventory) {
  const { generateShopCard } = require('./canvasRenderer');
  const buf = await generateShopCard(member, userPoints, category, items, userInventory).catch(() => null);

  if (buf) {
    const attachment = new AttachmentBuilder(buf, { name: 'shop.png' });
    return { embed: null, attachment };
  }

  const embed = buildShopItemsEmbed(items, userInventory, userPoints, category);
  return { embed, attachment: null };
}

// ─────────────────────────────────────────────────────────────────────────────
// BACKPACK  🎒  — returns { embed, attachment }
// ─────────────────────────────────────────────────────────────────────────────
async function buildBackpackResponse(member, inventory, catalog) {
  const buf = await generateBackpackCard(member, inventory, catalog).catch(() => null);

  if (buf) {
    const attachment = new AttachmentBuilder(buf, { name: 'backpack.png' });
    return { embed: null, attachment };
  }

  const keys = Object.keys(inventory || {}).filter((id) => (inventory[id] || 0) > 0);
  const embed = new EmbedBuilder()
    .setColor(C.DANGER)
    .setTitle('🎒  حقيبتك')
    .setFooter({ text: 'NEXO Roulette  •  بطاقة الحقيبة  🦊' });

  if (!keys.length) {
    embed.setDescription(
      '> 🪹 **حقيبتك فارغة حالياً!**\n\n' +
      'يمكنك شراء الخصائص من **المتجر** وتخزينها لاستخدامها أثناء اللعب.'
    );
  }

  return { embed, attachment: null };
}

// ─────────────────────────────────────────────────────────────────────────────
// LEADERBOARD  🏆  — returns { embed, attachment }
// ─────────────────────────────────────────────────────────────────────────────
async function buildLeaderboardResponse(rawEntries, guild) {
  const { loadAvatar } = require('./canvasRenderer');
  const entries = await Promise.all(
    rawEntries.map(async (p, i) => {
      let name = 'مجهول';
      let avatarImg = null;
      try {
        const member = await guild.members.fetch(p.userId).catch(() => null);
        if (member) {
          name = member.displayName || member.user?.username || 'مجهول';
          avatarImg = await loadAvatar(member, 64).catch(() => null);
        }
      } catch (_) {}
      return { rank: i + 1, name, wins: p.wins || 0, points: p.points || 0, avatarImg };
    })
  );

  const buf = await generateLeaderboardCard(entries).catch(() => null);

  if (buf) {
    const attachment = new AttachmentBuilder(buf, { name: 'leaderboard.png' });
    return { embed: null, attachment };
  }

  const embed = new EmbedBuilder()
    .setColor(C.DANGER)
    .setTitle('🏆  لوحة المتصدرين')
    .setFooter({ text: 'NEXO Roulette  •  الترتيب حسب الانتصارات ثم النقاط  🦊' });

  const lines = entries.map((e, i) => {
    const medal = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i + 1}.`;
    return `${medal}  **${e.name}**  —  🏆 ${e.wins}  |  💰 ${e.points}`;
  });
  embed.setDescription(lines.join('\n') || 'لا توجد بيانات مسجلة بعد.');
  return { embed, attachment: null };
}

// ─────────────────────────────────────────────────────────────────────────────
// PROFILE / POINTS CARD  💳  — returns { embed, attachment }
// ─────────────────────────────────────────────────────────────────────────────
async function buildProfileResponse(member, profile) {
  const buf = await generateProfileCard(member, profile).catch(() => null);

  if (buf) {
    const attachment = new AttachmentBuilder(buf, { name: 'profile.png' });
    return { embed: null, attachment };
  }

  const embed = new EmbedBuilder()
    .setColor(C.DANGER)
    .setTitle(`💳  بطاقة اللاعب  ${member.displayName}`)
    .setFooter({ text: 'NEXO Roulette  •  بطاقة الحساب  🦊' });

  const pts = (profile.points || 0).toLocaleString('en-US');
  embed.addFields(
    { name: '💰 النقاط',       value: `\`${pts}\``,                      inline: true },
    { name: '🎮 المشاركات',    value: `\`${profile.gamesPlayed || 0}\``,  inline: true },
    { name: '💀 إقصاءات',     value: `\`${profile.eliminations || 0}\``, inline: true },
    { name: '🏆 انتصارات',     value: `\`${profile.wins || 0}\``,         inline: true },
  );
  return { embed, attachment: null };
}

// ─────────────────────────────────────────────────────────────────────────────
// RULES  📜  — returns { embed, attachment }
// ─────────────────────────────────────────────────────────────────────────────
async function buildRulesResponse() {
  const { generateRulesCard } = require('./canvasRenderer');
  const buf = await generateRulesCard().catch(() => null);

  if (buf) {
    const attachment = new AttachmentBuilder(buf, { name: 'rules.png' });
    return { embed: null, attachment };
  }

  const embed = buildRulesEmbed();
  return { embed, attachment: null };
}

function buildRulesEmbed() {
  return new EmbedBuilder()
    .setColor(C.DANGER)
    .setTitle('📜  قوانين روليت NEXO')
    .setDescription(
      `🎯 **طريقة اللعب:**\n` +
      `• مدة اللوبي **60 ثانية** (الحد الأدنى **3** والحد الأقصى **20** لاعباً).\n` +
      `• تدور العجلة وتختار لاعباً عشوائياً في كل جولة ليكون هو **المهاجم**.\n` +
      `• المهاجم لديه **15 ثانية** لاختيار هدفه وطرده باستخدام الخصائص الهجومية.\n` +
      `• **لا توجد نافذة دفاعية وقت الهجوم:** يجب على باقي اللاعبين تفعيل دفاعاتهم مسبقاً من الحقيبة أثناء انتظار دورهم.\n` +
      `• تستمر اللعبة حتى يتبقى **لاعبان فقط** (النهائي 50/50 بدون خصائص).\n\n` +
      `💰 **نظام النقاط والجوائز:**\n` +
      `• بدء اللعبة: \`+5 نقاط\` لجميع المشاركين.\n` +
      `• الطرد الناجح: يتصاعد (\`+10\` ثم \`+20\` ثم \`+30\`...).\n` +
      `• الفوز بالمركز الأول: \`+15 نقطة\` 🏆\n\n` +
      `🎒 **الخصائص والمتجر:**\n` +
      `• اشترِ الخصائص من المتجر \`/roulette shop\` وخزنها في حقيبتك \`/roulette bag\`.\n` +
      `• **الخصائص الهجومية:** تظهر للمهاجم فقط عندما يأتي دوره للهجوم.\n` +
      `• **الخصائص الدفاعية:** تظهر لباقي اللاعبين، ويمكنهم تجهيزها في أي وقت تحسباً للاستهداف.`
    )
    .setFooter({ text: 'NEXO Roulette  •  نتمنى لكم وقتاً ممتعاً  🦊' });
}

module.exports = {
  buildLobbyEmbed,
  buildGameStartEmbed,
  buildCanceledEmbed,
  buildShopResponse,
  buildBackpackResponse,
  buildLeaderboardResponse,
  buildProfileResponse,
  buildRulesResponse,
  buildRulesEmbed,
};
