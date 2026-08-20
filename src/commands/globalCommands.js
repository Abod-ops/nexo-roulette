const userManager = require('../managers/userManager');
const shopManager = require('../managers/shopManager');
const embeds = require('../ui/embedBuilder');
const buttons = require('../ui/buttonBuilder');

const { formatPoints } = require('../utils/helpers');

async function handleGlobalCommands(client, message) {
  const content = message.content.trim();
  const validCommands = ['-متجر', '-حقيبة', '-المتصدرون', '-نقاطي'];
  
  if (!validCommands.includes(content)) return false;

  const guild = message.guild;
  const user = message.author;
  let member = message.member;
  if (!member) {
    member = await guild.members.fetch(user.id).catch(() => null);
  }
  
  const fakeMember = member || {
    displayName: user.username,
    displayAvatarURL: (o) => user.displayAvatarURL(o),
  };

  const profile = userManager.getUser(user.id);
  const catalog = shopManager.getCatalog();

  if (content === '-متجر') {
    const items = shopManager.getOffensiveItems();
    const { embed, attachment } = await embeds.buildShopResponse(
      fakeMember,
      profile.points,
      'offensive',
      items,
      profile.inventory
    );
    const menu = buttons.buildShopSelectMenu(items.slice(0, 25), profile.inventory, 'shop_buy_off');
    const payload = { components: [menu, ...buttons.buildShopCategoryRows()] };
    if (attachment) payload.files = [attachment];
    if (embed) payload.embeds = [embed];
    await message.reply(payload).catch(() => {});
    return true;
  }

  if (content === '-حقيبة') {
    const { embed, attachment } = await embeds.buildBackpackResponse(fakeMember, profile.inventory, catalog);
    // Note: Proactive bag_use rows only show inside active GameSession _doBag
    // For global bag command, we just show the inventory.
    const payload = {};
    if (attachment) payload.files = [attachment];
    if (embed) payload.embeds = [embed];
    await message.reply(payload).catch(() => {});
    return true;
  }

  if (content === '-المتصدرون') {
    const raw = userManager.getLeaderboard(10);
    const { embed, attachment } = await embeds.buildLeaderboardResponse(raw, guild);
    const payload = {};
    if (attachment) payload.files = [attachment];
    if (embed) payload.embeds = [embed];
    await message.reply(payload).catch(() => {});
    return true;
  }

  if (content === '-نقاطي') {
    const { embed, attachment } = await embeds.buildProfileResponse(fakeMember, profile);
    const payload = {};
    if (attachment) payload.files = [attachment];
    if (embed) payload.embeds = [embed];
    await message.reply(payload).catch(() => {});
    return true;
  }

  return false;
}

async function handleGlobalInteractions(client, interaction) {
  const customId = interaction.customId;
  const isShopNav = customId && customId.startsWith('shop_cat_');
  const isShopBuy = customId && customId.startsWith('shop_buy_');

  if (!isShopNav && !isShopBuy) return false;

  const user = interaction.user;
  const guild = interaction.guild;
  let member = interaction.member;
  if (!member && guild) {
    member = await guild.members.fetch(user.id).catch(() => null);
  }
  
  const fakeMember = member || {
    displayName: user.username,
    displayAvatarURL: (o) => user.displayAvatarURL(o),
  };

  const profile = userManager.getUser(user.id);

  if (isShopNav) {
    let cat = 'offensive';
    if (customId === 'shop_cat_def') cat = 'defensive';
    else if (customId === 'shop_cat_all') cat = 'all';

    let items;
    if (cat === 'offensive')      items = shopManager.getOffensiveItems();
    else if (cat === 'defensive') items = shopManager.getDefensiveItems();
    else                          items = shopManager.getPurchasableItems();

    const buyIdMap = { offensive: 'shop_buy_off', defensive: 'shop_buy_def', all: 'shop_buy_all' };
    const buyId = buyIdMap[cat] || 'shop_buy_all';

    const { embed, attachment } = await embeds.buildShopResponse(
      fakeMember,
      profile.points,
      cat,
      items,
      profile.inventory
    );

    const menu = buttons.buildShopSelectMenu(items.slice(0, 25), profile.inventory, buyId);
    const payload = { components: [menu, ...buttons.buildShopCategoryRows()] };
    if (attachment) {
      payload.files = [attachment];
      payload.attachments = [];
    }
    if (embed) payload.embeds = [embed];

    if (interaction.deferred || interaction.replied) {
      await interaction.editReply(payload).catch(() => {});
    } else {
      await interaction.update(payload).catch(() => interaction.reply({ ...payload, ephemeral: true }));
    }
    return true;
  }

  if (isShopBuy) {
    if (!interaction.values || interaction.values.length === 0) return true;
    const itemId = interaction.values[0].replace('buy_', '');
    const result = shopManager.purchaseItem(user.id, itemId);
    if (result.success) {
      const item = shopManager.getItem(itemId);
      const pts = formatPoints(result.remainingPoints || 0);
      await interaction.reply({
        content:
          `✅ تم شراء **${item.emoji} ${item.name}** بـ **${item.cost} نقطة**!\n` +
          `💰 رصيدك المتبقي: **${pts} نقطة**\n` +
          `📦 الكمية لديك الآن: **×${result.quantity}**`,
        ephemeral: true,
      }).catch(() => {});
    } else {
      await interaction.reply({ content: `❌ ${result.reason}`, ephemeral: true }).catch(() => {});
    }
    return true;
  }

  return false;
}

async function handleGlobalSlashCommands(client, interaction) {
  const commandName = interaction.commandName;
  const validCommands = ['shop', 'bag', 'leaderboard', 'profile'];
  
  if (!validCommands.includes(commandName)) return false;

  const guild = interaction.guild;
  const user = interaction.user;
  let member = interaction.member;
  if (!member && guild) {
    member = await guild.members.fetch(user.id).catch(() => null);
  }
  
  const fakeMember = member || {
    displayName: user.username,
    displayAvatarURL: (o) => user.displayAvatarURL(o),
  };

  const profile = userManager.getUser(user.id);
  const catalog = shopManager.getCatalog();

  if (commandName === 'shop') {
    const items = shopManager.getOffensiveItems();
    const { embed, attachment } = await embeds.buildShopResponse(
      fakeMember,
      profile.points,
      'offensive',
      items,
      profile.inventory
    );
    const menu = buttons.buildShopSelectMenu(items.slice(0, 25), profile.inventory, 'shop_buy_off');
    const payload = { components: [menu, ...buttons.buildShopCategoryRows()] };
    if (attachment) payload.files = [attachment];
    if (embed) payload.embeds = [embed];
    await interaction.reply(payload).catch(() => {});
    return true;
  }

  if (commandName === 'bag') {
    const { embed, attachment } = await embeds.buildBackpackResponse(fakeMember, profile.inventory, catalog);
    const payload = {};
    if (attachment) payload.files = [attachment];
    if (embed) payload.embeds = [embed];
    await interaction.reply(payload).catch(() => {});
    return true;
  }

  if (commandName === 'leaderboard') {
    const raw = userManager.getLeaderboard(10);
    const { embed, attachment } = await embeds.buildLeaderboardResponse(raw, guild);
    const payload = {};
    if (attachment) payload.files = [attachment];
    if (embed) payload.embeds = [embed];
    await interaction.reply(payload).catch(() => {});
    return true;
  }

  if (commandName === 'profile') {
    const { embed, attachment } = await embeds.buildProfileResponse(fakeMember, profile);
    const payload = {};
    if (attachment) payload.files = [attachment];
    if (embed) payload.embeds = [embed];
    await interaction.reply(payload).catch(() => {});
    return true;
  }

  return false;
}

module.exports = { handleGlobalCommands, handleGlobalInteractions, handleGlobalSlashCommands };
