const userManager = require('../managers/userManager');
const shopManager = require('../managers/shopManager');
const embeds = require('../ui/embedBuilder');
const buttons = require('../ui/buttonBuilder');

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

module.exports = { handleGlobalCommands };
