// src/managers/shopManager.js
// Final item catalog: 1 free + 10 offensive + 10 defensive = 21 total

const userManager = require('./userManager');

// ── Item catalog ──────────────────────────────────────────────────────────────
// Fields:
//   id       — key used in inventory
//   name     — Arabic display name
//   emoji    — visual
//   description — short Arabic description
//   cost     — points price (0 = free, never stored in inventory)
//   category — null | 'offensive' | 'defensive'
//   type     — 'free' | 'offensive' | 'defensive' | 'proactive'
//   free     — true if cost=0 and never purchasable

const ITEM_CATALOG = {

  // ── FREE ─────────────────────────────────────────────────────────────────────
  'عشوائي': {
    id: 'عشوائي',
    name: 'عشوائي',
    emoji: '🎲',
    description: 'اختيار هدف عشوائي من اللاعبين الأحياء',
    cost: 0,
    category: null,
    type: 'free',
    free: true,
  },

  // ── OFFENSIVE (10) ───────────────────────────────────────────────────────────

  'طرد_مرتين': {
    id: 'طرد_مرتين',
    name: 'طرد مرتين',
    emoji: '⚔️',
    description: 'طرد لاعبين اثنين في دور واحد',
    cost: 50,
    category: 'offensive',
    type: 'offensive',
    free: false,
  },

  'ضربة_قاضية': {
    id: 'ضربة_قاضية',
    name: 'ضربة قاضية',
    emoji: '💀',
    description: 'طرد يتجاوز الدرع والتفادي',
    cost: 100,
    category: 'offensive',
    type: 'offensive',
    free: false,
  },

  'تقييد': {
    id: 'تقييد',
    name: 'تقييد',
    emoji: '🔗',
    description: 'منع لاعب من الهجوم في دوره القادم',
    cost: 40,
    category: 'offensive',
    type: 'offensive',
    free: false,
  },

  'إسكات': {
    id: 'إسكات',
    name: 'إسكات',
    emoji: '🔇',
    description: 'منع الهدف من استخدام دفاعه الشخصي',
    cost: 35,
    category: 'offensive',
    type: 'offensive',
    free: false,
  },

  'حصار': {
    id: 'حصار',
    name: 'حصار',
    emoji: '🚫',
    description: 'منع اللاعبين من حماية الهدف خارجيًا',
    cost: 70,
    category: 'offensive',
    type: 'offensive',
    free: false,
  },

  'أمر_إجباري': {
    id: 'أمر_إجباري',
    name: 'أمر إجباري',
    emoji: '🎯',
    description: 'تثبيت الطرد على الهدف المختار مباشرة',
    cost: 65,
    category: 'offensive',
    type: 'offensive',
    free: false,
  },



  'انفجار_مزدوج': {
    id: 'انفجار_مزدوج',
    name: 'انفجار مزدوج',
    emoji: '🧨',
    description: 'طرد هدفك وهدف عشوائي إضافي',
    cost: 140,
    category: 'offensive',
    type: 'offensive',
    free: false,
  },

  'حكم_نهائي': {
    id: 'حكم_نهائي',
    name: 'حكم نهائي',
    emoji: '☠️',
    description: 'طرد قاطع يتجاوز أغلب الدفاعات والحماية',
    cost: 200,
    category: 'offensive',
    type: 'offensive',
    free: false,
  },

  // ── DEFENSIVE (10) ───────────────────────────────────────────────────────────

  'درع': {
    id: 'درع',
    name: 'درع',
    emoji: '🛡️',
    description: 'صد وحجب الطرد العادي عنك',
    cost: 20,
    category: 'defensive',
    type: 'defensive',
    free: false,
  },

  'إنعاش': {
    id: 'إنعاش',
    name: 'إنعاش',
    emoji: '❤️',
    description: 'إعادة لاعب مطرود آخر إلى اللعبة',
    cost: 20,
    category: 'defensive',
    type: 'defensive',
    free: false,
  },

  'حماية': {
    id: 'حماية',
    name: 'حماية',
    emoji: '🤝',
    description: 'حماية لاعب آخر مستهدف من الطرد',
    cost: 50,
    category: 'defensive',
    type: 'defensive',
    free: false,
  },

  'تفادي': {
    id: 'تفادي',
    name: 'تفادي',
    emoji: '💨',
    description: 'تجنب وتفادي الطرد الموجه إليك بنجاح',
    cost: 35,
    category: 'defensive',
    type: 'defensive',
    free: false,
  },

  'انعكاس': {
    id: 'انعكاس',
    name: 'انعكاس',
    emoji: '🔁',
    description: 'عكس الهجوم ليرتد مباشرة على المهاجم',
    cost: 90,
    category: 'defensive',
    type: 'defensive',
    free: false,
  },

  'تبديل': {
    id: 'تبديل',
    name: 'تبديل',
    emoji: '🧲',
    description: 'تحويل الطرد من نفسك إلى لاعب آخر',
    cost: 70,
    category: 'defensive',
    type: 'defensive',
    free: false,
  },

  'إنقاذ': {
    id: 'إنقاذ',
    name: 'إنقاذ',
    emoji: '🕊️',
    description: 'إنقاذ لاعب مستهدف من الإقصاء',
    cost: 60,
    category: 'defensive',
    type: 'defensive',
    free: false,
  },

  'حصانة_مؤقتة': {
    id: 'حصانة_مؤقتة',
    name: 'حصانة مؤقتة',
    emoji: '👻',
    description: 'حصانة كاملة من الاستهداف لدور كامل',
    cost: 100,
    category: 'defensive',
    type: 'proactive',
    free: false,
  },

  'تحصين': {
    id: 'تحصين',
    name: 'تحصين',
    emoji: '🔐',
    description: 'تحصين لاعب آخر ضد الطرد القادم',
    cost: 120,
    category: 'defensive',
    type: 'proactive',
    free: false,
  },

  'نجاة_أخيرة': {
    id: 'نجاة_أخيرة',
    name: 'نجاة أخيرة',
    emoji: '👑',
    description: 'نجاة تلقائية لمرة واحدة عند تعرضك للطرد',
    cost: 180,
    category: 'defensive',
    type: 'proactive',
    free: false,
  },
};

// ── Public API ────────────────────────────────────────────────────────────────

function getCatalog() { return ITEM_CATALOG; }

function getItem(itemId) { return ITEM_CATALOG[itemId] || null; }

function getPurchasableItems() {
  return Object.values(ITEM_CATALOG).filter(i => !i.free);
}

function getOffensiveItems() {
  return Object.values(ITEM_CATALOG).filter(i => i.category === 'offensive');
}

function getDefensiveItems() {
  return Object.values(ITEM_CATALOG).filter(i => i.category === 'defensive');
}

/**
 * Attempt to purchase an item.
 * Returns { success, reason?, remainingPoints?, quantity? }
 */
function purchaseItem(userId, itemId) {
  const item = getItem(itemId);
  if (!item)      return { success: false, reason: 'العنصر غير موجود.' };
  if (item.free)  return { success: false, reason: 'هذا العنصر مجاني ولا يمكن شراؤه.' };

  const spent = userManager.spendPoints(userId, item.cost);
  if (!spent)     return { success: false, reason: 'ليس لديك نقاط كافية لشراء هذه الخاصية.' };

  userManager.addItem(userId, itemId, 1);
  userManager.incrementPurchased(userId);

  const profile = userManager.getUser(userId);
  return {
    success: true,
    remainingPoints: profile.points,
    quantity: profile.inventory[itemId] || 1,
  };
}

module.exports = {
  getCatalog,
  getItem,
  getPurchasableItems,
  getOffensiveItems,
  getDefensiveItems,
  purchaseItem,
};
