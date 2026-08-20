// src/ui/buttonBuilder.js
// All Discord ActionRow / Button / SelectMenu component builders

const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  StringSelectMenuBuilder,
} = require('discord.js');
const { chunkArray } = require('../utils/helpers');

// ── Lobby Buttons ─────────────────────────────────────────────────────────────
// Row 1: Join | Leave | Bag | Shop
// Row 2: Leaderboard | Points | Rules
function buildLobbyRows() {
  const row1 = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('lobby_join')
      .setLabel('دخول')
      .setEmoji('🚪')
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId('lobby_leave')
      .setLabel('خروج')
      .setEmoji('🚶')
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId('lobby_bag')
      .setLabel('حقيبتي')
      .setEmoji('🎒')
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId('lobby_shop')
      .setLabel('المتجر')
      .setEmoji('🛒')
      .setStyle(ButtonStyle.Secondary),
  );
  const row2 = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('lobby_lb')
      .setLabel('المتصدرون')
      .setEmoji('🏆')
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId('lobby_pts')
      .setLabel('نقاطي')
      .setEmoji('💳')
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId('lobby_rules')
      .setLabel('القوانين')
      .setEmoji('📜')
      .setStyle(ButtonStyle.Secondary),
  );
  return [row1, row2];
}

function buildDisabledLobbyRows() {
  return buildLobbyRows().map((row) => {
    const json = row.toJSON();
    json.components = json.components.map((c) => ({ ...c, disabled: true }));
    return ActionRowBuilder.from(json);
  });
}

// ── Shop Category Buttons ─────────────────────────────────────────────────────
function buildShopCategoryRows() {
  return [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('shop_cat_off')
        .setLabel('هجومية')
        .setEmoji('⚔️')
        .setStyle(ButtonStyle.Danger),
      new ButtonBuilder()
        .setCustomId('shop_cat_def')
        .setLabel('دفاعية')
        .setEmoji('🛡️')
        .setStyle(ButtonStyle.Primary),
      new ButtonBuilder()
        .setCustomId('shop_cat_all')
        .setLabel('الكل')
        .setEmoji('📦')
        .setStyle(ButtonStyle.Secondary),
    ),
  ];
}

// ── Shop Select Menu ──────────────────────────────────────────────────────────
function buildShopSelectMenu(items, userInventory, customId) {
  const options = items.map((item) => ({
    label: `${item.name} — ${item.cost} نقطة`,
    description: `${item.description.slice(0, 80)} | لديك: ×${userInventory[item.id] || 0}`,
    value: `buy_${item.id}`,
    emoji: item.emoji,
  }));

  return new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId(customId)
      .setPlaceholder('اختر عنصرًا للشراء')
      .addOptions(options)
  );
}

// ── Turn Target Rows ──────────────────────────────────────────────────────────
function buildTurnRows(aliveMembers, selectedId, excludeId = null) {
  const validTargets = aliveMembers.filter((m) => m.id !== selectedId && m.id !== excludeId);
  const rows = [];
  
  // 1. Targets (Max 20 targets in 4 rows)
  const targetChunks = chunkArray(validTargets.slice(0, 20), 5);
  for (const chunk of targetChunks) {
    const row = new ActionRowBuilder().addComponents(
      chunk.map((m) => new ButtonBuilder()
        .setCustomId(`turn_tgt_${m.id}`)
        .setLabel(m.displayName.slice(0, 80))
        .setStyle(ButtonStyle.Secondary)
      )
    );
    rows.push(row);
  }

  // 2. Random, My Powers (dynamic), & Surrender
  if (rows.length < 5) {
    rows.push(new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('turn_rnd')
        .setLabel('طرد عشوائي')
        .setEmoji('🎲')
        .setStyle(ButtonStyle.Danger),
      new ButtonBuilder()
        .setCustomId('cmd_bag') // Routes to _handleCmdBag which handles offensive/defensive powers
        .setLabel('خصائصي')
        .setEmoji('🎒')
        .setStyle(ButtonStyle.Primary),
      new ButtonBuilder()
        .setCustomId('turn_surrender')
        .setLabel('انسحاب')
        .setEmoji('🚪')
        .setStyle(ButtonStyle.Secondary)
    ));
  }

  return rows;
}

// ── Power Select Menu ─────────────────────────────────────────────────────────
function buildPowerSelectMenu(itemIds, catalog, userInventory, customId) {
  const options = itemIds
    .filter((id) => (userInventory[id] || 0) > 0)
    .map((id) => {
      const item = catalog[id];
      return {
        label: `${item.name} × ${userInventory[id]}`,
        description: item.description.slice(0, 100),
        value: id,
        emoji: item.emoji,
      };
    });

  if (!options.length) return null;

  return new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId(customId)
      .setPlaceholder('اختر خاصية')
      .addOptions(options)
  );
}

// ── Player Select Menu ────────────────────────────────────────────────────────
function buildPlayerSelectMenu(members, customId, placeholder) {
  const options = members.map((m) => ({
    label: m.displayName.slice(0, 80),
    value: m.id,
  }));
  if (!options.length) return null;

  return new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId(customId)
      .setPlaceholder(placeholder)
      .addOptions(options)
  );
}

// ── Reaction Window ───────────────────────────────────────────────────────────
function buildReactionRows(showSwap = false) {
  const comps = [
    new ButtonBuilder()
      .setCustomId('react_btn')
      .setLabel('استخدم خاصية دفاعية')
      .setEmoji('🛡️')
      .setStyle(ButtonStyle.Primary),
  ];
  if (showSwap) {
    comps.push(
      new ButtonBuilder()
        .setCustomId('react_swap_btn')
        .setLabel('بدّل الهدف')
        .setEmoji('🔄')
        .setStyle(ButtonStyle.Danger)
    );
  }
  return [new ActionRowBuilder().addComponents(comps)];
}

// ── Revive Window ─────────────────────────────────────────────────────────────
function buildReviveRows() {
  return [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('revive_btn')
        .setLabel('استخدم الإنعاش')
        .setEmoji('❤️')
        .setStyle(ButtonStyle.Success)
    ),
  ];
}

// ── Bag Use Button ────────────────────────────────────────────────────────────
function buildBagWithUseRows() {
  return [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('bag_use')
        .setLabel('تفعيل خاصية استباقية')
        .setEmoji('🎒')
        .setStyle(ButtonStyle.Primary)
    ),
  ];
}

// ── Defensive Power Rows ──────────────────────────────────────────────────────
function buildDefensivePowerRows(userInventory, catalog) {
  const ownedDefensive = Object.entries(userInventory || {})
    .filter(([id, qty]) => qty > 0 && catalog[id]?.category === 'defensive')
    .map(([id]) => catalog[id]);

  const rows = [];
  if (ownedDefensive.length > 0) {
    const powerChunks = chunkArray(ownedDefensive.slice(0, 25), 5);
    for (const chunk of powerChunks) {
      if (rows.length >= 5) break;
      const row = new ActionRowBuilder().addComponents(
        chunk.map((item) => new ButtonBuilder()
          .setCustomId(`def_pow_${item.id}`)
          .setLabel(item.name)
          .setEmoji(item.emoji || '🛡️')
          .setStyle(ButtonStyle.Success)
        )
      );
      rows.push(row);
    }
  }
  return rows;
}

// ── Offensive Power Rows ──────────────────────────────────────────────────────
function buildOffensivePowerRows(userInventory, catalog) {
  const ownedOffensive = Object.entries(userInventory || {})
    .filter(([id, qty]) => qty > 0 && catalog[id]?.category === 'offensive' && !catalog[id].free)
    .map(([id]) => catalog[id]);

  const rows = [];
  if (ownedOffensive.length > 0) {
    const powerChunks = chunkArray(ownedOffensive.slice(0, 25), 5);
    for (const chunk of powerChunks) {
      if (rows.length >= 5) break;
      const row = new ActionRowBuilder().addComponents(
        chunk.map((item) => new ButtonBuilder()
          .setCustomId(`turn_pow_${item.id}`)
          .setLabel(item.name)
          .setEmoji(item.emoji || '⚡')
          .setStyle(ButtonStyle.Primary)
        )
      );
      rows.push(row);
    }
  }
  return rows;
}

// ── Final Spin Decorator ──────────────────────────────────────────────────────
function buildFinalSpinRow() {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('final_spin_dummy')
      .setLabel('جارٍ تحديد الفائز...')
      .setEmoji('🏆')
      .setStyle(ButtonStyle.Primary)
      .setDisabled(true)
  );
}

module.exports = {
  buildLobbyRows,
  buildDisabledLobbyRows,
  buildShopCategoryRows,
  buildShopSelectMenu,
  buildTurnRows,
  buildPowerSelectMenu,
  buildPlayerSelectMenu,
  buildReactionRows,
  buildReviveRows,
  buildBagWithUseRows,
  buildDefensivePowerRows,
  buildOffensivePowerRows,
  buildFinalSpinRow,
};
