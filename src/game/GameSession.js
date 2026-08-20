// src/game/GameSession.js
// Core game session — full lifecycle with 21-power system and escalating points.
// One instance per active channel. Destroyed on game end.

const { AttachmentBuilder } = require('discord.js');
const path  = require('path');
const fs    = require('fs');

const { sleep, randomChoice, shuffle, disableAllComponents } = require('../utils/helpers');
const C       = require('../utils/constants');
const embeds  = require('../ui/embedBuilder');
const buttons = require('../ui/buttonBuilder');
const { generateSpinFrame, generateAnimatedWheelGIF, generateWinnerImage, generateLobbyImage, generateWheelFrame } = require('../ui/canvasRenderer');
const userManager = require('../managers/userManager');
const shopManager = require('../managers/shopManager');
const { removeSession } = require('../managers/sessionManager');

class GameSession {
  constructor(channel, starter) {
    this.channel   = channel;
    this.guild     = channel.guild;
    this.channelId = channel.id;
    this.starter   = starter;

    // Phase: IDLE | LOBBY | TURN | REACTION | REVIVE | GAME | ENDED
    this.phase     = 'IDLE';

    // Dedup interaction IDs to prevent double-processing
    this._handled  = new Set();

    // ── Lobby ─────────────────────────────────────────────────────────────────
    this.lobbyMessage   = null;
    this.participants   = new Map(); // userId → GuildMember
    this.lobbyStartTime = 0;
    this._lobbyTimer    = null;
    this._lobbyInterval = null;

    // ── Game ──────────────────────────────────────────────────────────────────
    this.alive       = []; // GuildMember[] currently alive
    this.eliminated  = []; // GuildMember[] eliminated
    this.gameRunning = false;
    this.destroyed   = false;

    // ── Per-match power state ─────────────────────────────────────────────────
    // Resets at match start. Counts per-match turn successes per player.
    this.successfulTurnCounts = new Map(); // userId → int
    this.restrictedPlayers    = new Set(); // userId: can't use offensive powers this turn
    this.immunePlayers        = new Set(); // userId: can't be chosen as elimination target
    this.lastSurvivalActive   = new Set(); // userId: نجاة_أخيرة passive auto-save
    this.revivedThisMatch     = new Set(); // userId: already revived once, can't be again
    this.shieldedPlayers      = new Set();
    this.dodgingPlayers       = new Set();
    this.reflectingPlayers    = new Set();
    this.swappingPlayers      = new Map(); // targetId -> newTargetId
    this.protectedPlayers     = new Map(); // targetId -> protectorId
    this.fortifiedPlayers     = new Map(); // targetId -> protectorId

    // ── Turn state ────────────────────────────────────────────────────────────
    this.turnState    = null;
    this._turnResolve = null;
    this._turnTimeout = null;
    this.turnMessage  = null;

    // ── Reaction/Revive state ─────────────────────────────────────────────────
    this.reactionState    = null;
    this._phaseResolve    = null; // shared resolver for REACTION and REVIVE phases
    this._phaseTimeout    = null;
    this.reactionMessage  = null;

    // ── Pending secondary input ───────────────────────────────────────────────
    // When a power needs a second selection from a player, we store a callback here.
    // Structure: userId → { awaitCustomId, resolve, timeout }
    this.pendingInput = new Map();

    // ── Tracked session messages ──────────────────────────────────────────────
    this.sessionMessageIds = new Set();
  }

  _trackMessage(msg) {
    if (msg?.id) {
      this.sessionMessageIds.add(msg.id);
    }
    return msg;
  }

  async handleMessageDeleted(messageId) {
    if (this.destroyed) return;

    if (this.sessionMessageIds.has(messageId)) {
      console.log(`[GameSession:${this.channelId}] Game stopped due to deleted message (${messageId})`);
      const wasLobby = this.phase === 'LOBBY';
      this.destroy();
      await this.channel.send({
        content: wasLobby
          ? '🛑 **تم إيقاف اللعبة بسبب حذف رسالة اللوبي.**'
          : '🛑 **تم إيقاف اللعبة بسبب حذف رسالة من رسائل اللعبة الأساسية.**',
      }).catch(() => {});
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // MAIN INTERACTION ROUTER
  // Called by the global interactionCreate handler in index.js
  // ═══════════════════════════════════════════════════════════════════════════

  async handleInteraction(interaction) {
    if (this.destroyed) return;

    // Dedup
    if (this._handled.has(interaction.id)) return;
    this._handled.add(interaction.id);
    if (this._handled.size > 500) {
      this._handled.delete(this._handled.values().next().value);
    }

    const { customId, user } = interaction;

    try {
      // ── 1. Pending secondary input (highest priority) ──
      if (this.pendingInput.has(user.id)) {
        const pending = this.pendingInput.get(user.id);
        if (pending.awaitCustomId === customId) {
          this.pendingInput.delete(user.id);
          clearTimeout(pending.timeout);
          return await pending.resolve(interaction);
        }
      }

      // ── 2. Always-available interactions ──
      const anytimeHandled = await this._tryAnytime(interaction);
      if (anytimeHandled) return;

      // ── 3. Phase routing ──
      if (this.phase === 'LOBBY')    return await this._handleLobby(interaction);
      if (this.phase === 'TURN')     return await this._handleTurn(interaction);
      if (this.phase === 'REVIVE')   return await this._handleRevive(interaction);

    } catch (err) {
      console.error(`[GameSession:${this.channelId}] handleInteraction error:`, err);
      try {
        if (!interaction.replied && !interaction.deferred) {
          await interaction.reply({ content: '❌ حدث خطأ. حاول مجددًا.', ephemeral: true });
        }
      } catch (_) {}
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // ALWAYS-AVAILABLE INTERACTIONS (shop, bag, lb, profile, rules)
  // ═══════════════════════════════════════════════════════════════════════════

  async _tryAnytime(interaction) {
    const { customId, user } = interaction;
    const ANYTIME = new Set([
      'lobby_lb', 'lobby_pts', 'lobby_rules', 'lobby_bag', 'lobby_shop',
      'shop_cat_off', 'shop_cat_def', 'shop_cat_all',
      'shop_buy_off', 'shop_buy_def', 'shop_buy_all',
      'bag_use', 'bag_sel_pow', 'bag_sel_tgt',
      'cmd_bag' // Turn button for defensive bag
    ]);
    if (!ANYTIME.has(customId) && !customId.startsWith('def_pow_')) return false;

    if (customId === 'lobby_lb')          await this._doLeaderboard(interaction);
    else if (customId === 'lobby_pts')    await this._doProfile(interaction);
    else if (customId === 'lobby_rules')  await this._doRules(interaction);
    else if (customId === 'lobby_bag')    await this._doBag(interaction);
    else if (customId === 'cmd_bag')      await this._handleCmdBag(interaction);
    else if (customId === 'lobby_shop')   await this._doShop(interaction);
    else if (customId === 'shop_cat_off') await this._doShopCategory(interaction, 'offensive', false);
    else if (customId === 'shop_cat_def') await this._doShopCategory(interaction, 'defensive', false);
    else if (customId === 'shop_cat_all') await this._doShopCategory(interaction, 'all', false);
    else if (['shop_buy_off','shop_buy_def','shop_buy_all'].includes(customId)) await this._doShopBuy(interaction);
    else if (customId === 'bag_use')      await this._doBagUse(interaction);
    else if (customId === 'bag_sel_pow')  await this._doBagPowerSelect(interaction);
    else if (customId === 'bag_sel_tgt')  await this._doBagTargetSelect(interaction);
    else if (customId.startsWith('def_pow_')) await this._doDefensiveBagPowerSelect(interaction, customId.replace('def_pow_', ''));



    return true;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // LOBBY PHASE
  // ═══════════════════════════════════════════════════════════════════════════

  async startLobby() {
    this.phase = 'LOBBY';

    const buffer = await generateLobbyImage(0, C.MAX_PLAYERS, C.LOBBY_DURATION_MS);
    const attachment = new AttachmentBuilder(buffer, { name: 'lobby.png' });
    const rows = buttons.buildLobbyRows();

    this.lobbyStartTime = Date.now();
    const unixEnd = Math.floor((this.lobbyStartTime + C.LOBBY_DURATION_MS) / 1000);

    this.lobbyMessage = await this.channel.send({ 
      content: `@here\n⏳ **اللوبي مفتوح! تبدأ اللعبة** <t:${unixEnd}:R>`,
      files: [attachment], components: rows 
    });
    this._trackMessage(this.lobbyMessage);
    this._lobbyTimer = setTimeout(() => this._onLobbyEnd(), C.LOBBY_DURATION_MS);
  }

  async _updateLobbyEmbed() {
    if (this.destroyed || !this.lobbyMessage || this.phase !== 'LOBBY') return;
    try {
      const remaining = Math.max(0, C.LOBBY_DURATION_MS - (Date.now() - this.lobbyStartTime));
      const buffer = await generateLobbyImage(this.participants.size, C.MAX_PLAYERS, remaining);
      if (this.destroyed || this.phase !== 'LOBBY') return;
      const unixEnd = Math.floor((this.lobbyStartTime + C.LOBBY_DURATION_MS) / 1000);
      const attachment = new AttachmentBuilder(buffer, { name: 'lobby.png' });
      await this.lobbyMessage.edit({
        content: `@here\n⏳ **اللوبي مفتوح! تبدأ اللعبة** <t:${unixEnd}:R>`,
        files: [attachment],
        attachments: [],
        components: buttons.buildLobbyRows(),
      });
    } catch (e) {
      if (e.code === 10008) {
        // Lobby message was deleted by a user/moderator
        this.destroy();
      } else {
        console.error('[lobby] Update error:', e.message);
      }
    }
  }

  async _handleLobby(interaction) {
    const { customId, user } = interaction;

    if (customId === 'lobby_join') {
      if (this.participants.has(user.id))
        return interaction.reply({ content: '⚠️ أنت منضم بالفعل!', ephemeral: true });
      if (this.participants.size >= C.MAX_PLAYERS)
        return interaction.reply({ content: `❌ اللعبة ممتلئة! (الحد الأقصى ${C.MAX_PLAYERS})`, ephemeral: true });
      const member = await this.guild.members.fetch(user.id).catch(() => null);
      if (!member) return interaction.reply({ content: '❌ تعذر جلب بياناتك.', ephemeral: true });
      this.participants.set(user.id, member);
      await interaction.reply({ content: '✅ تم الانضمام! انتظر بدء اللعبة.', ephemeral: true });
      await this._updateLobbyEmbed();

    } else if (customId === 'lobby_leave') {
      if (!this.participants.has(user.id))
        return interaction.reply({ content: '⚠️ أنت غير مشارك حاليًا.', ephemeral: true });
      this.participants.delete(user.id);
      await interaction.reply({ content: '🚪 تم الخروج من اللعبة.', ephemeral: true });
      await this._updateLobbyEmbed();

    } else {
      await interaction.deferUpdate().catch(() => {});
    }
  }

  async _onLobbyEnd() {
    if (this.destroyed) return;
    this._clearLobbyTimers();

    this._clearLobbyTimers();

    if (this.participants.size < C.MIN_PLAYERS) {
      await this._cancelGame(
        `انتهى الوقت. انضم ${this.participants.size} لاعب فقط (الحد الأدنى ${C.MIN_PLAYERS}).`
      );
      return;
    }
    await this._startGame();
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // GAME START
  // ═══════════════════════════════════════════════════════════════════════════

  async _startGame() {
    this.gameRunning = true;
    this.phase = 'GAME';
    this.alive = shuffle([...this.participants.values()]);
    this.successfulTurnCounts = new Map();

    try {
      await this.lobbyMessage?.edit({
        content: `✅ **انتهى وقت اللوبي! تبدأ اللعبة...**`,
        components: buttons.buildDisabledLobbyRows()
      });
      await this.channel.send({ content: `🚀 **بدأت اللعبة!** سيتم تشغيل العجلة الآن...` }).catch(() => {});
    } catch (_) {}

    // Award join points and record game
    for (const m of this.alive) {
      userManager.addPoints(m.id, C.POINTS.JOIN_GAME);
      userManager.recordGamePlayed(m.id);
    }

    await sleep(2000);
    await this._runGameLoop();
  }

  async _runGameLoop() {
    while (this.alive.length > 1 && !this.destroyed) {
      await this._doRound();
      if (this.destroyed) return;
      await sleep(2000);
    }
    if (this.destroyed) return;
    await this._resolveWinner(this.alive[0] || null);
  }

  async _doRound() {
    const spinResult = await this._runSpin();
    if (!spinResult || this.destroyed) return;
    const { selected, targetAngle, spinMsg } = spinResult;

    // Per-turn immunity clears after spin (new turn = immune from last turn expires)
    // Note: immunity granted by حصانة_مؤقتة lasts only until next spin
    // We clear at spin time so a player who activated it won't be targeted THIS turn
    // but immunity for them is already in this.immunePlayers

    // Check restriction
    const isRestricted = this.restrictedPlayers.has(selected.id);
    if (isRestricted) {
      this.restrictedPlayers.delete(selected.id);
      await this.channel.send({
        content: `🔗 **${selected.displayName}** مقيّد هذا الدور! لا يمكنه استخدام الخصائص الهجومية.`
      }).catch(() => {});
    }

    await this._doTurn(selected, targetAngle, isRestricted, spinMsg);

    // Clear immunity after this turn completes (it expires per-turn)
    this.immunePlayers.delete(selected.id); // selected player's own immunity if any
    // Other players' immunity persists until they are selected as target
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // SPIN
  // ═══════════════════════════════════════════════════════════════════════════

  async _runSpin() {
    if (this.destroyed || this.alive.length === 0) return null;

    const selected = randomChoice(this.alive);
    const selectedIdx = this.alive.findIndex(m => m.id === selected.id);

    const count = this.alive.length;
    const sliceAngle = (Math.PI * 2) / count;
    const targetAngle = -Math.PI / 2 - (selectedIdx * sliceAngle + sliceAngle / 2);

    let spinMsg = null;
    const totalSpins = 2; // 2 full counter-clockwise turns
    const startAngle = targetAngle + (Math.PI * 2 * totalSpins);

    try {
      const gifBuf = await generateAnimatedWheelGIF(this.alive, startAngle, targetAngle, selected);
      spinMsg = await this.channel.send({
        content: '',
        files: [new AttachmentBuilder(gifBuf, { name: `wheel-spin-${Date.now()}.gif` })],
      });
    } catch (err) {
      console.error('[spin] Send GIF failed:', err.message);
      return { selected, targetAngle, spinMsg: null };
    }

    // Wait for the GIF animation to complete and stay stopped for a bit (approx 4 seconds total)
    await sleep(4000);
    return { selected, targetAngle, spinMsg };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // TURN
  // ═══════════════════════════════════════════════════════════════════════════

  async _doTurn(selectedMember, targetAngle, isRestricted, spinMsg) {
    if (this.destroyed) return;

    // Valid targets = alive players that are not selected and not immune
    const validTargets = this.alive.filter(
      m => m.id !== selectedMember.id && !this.immunePlayers.has(m.id)
    );

    if (!validTargets.length) {
      await this.channel.send({
        content: `⚠️ لا توجد أهداف صالحة لـ **${selectedMember.displayName}**. يتم تخطي الدور.`
      }).catch(() => {});
      return;
    }

    // If 2 players left, automatically eliminate the other player without turn UI
    if (this.alive.length === 2 && validTargets.length === 1) {
      this.phase = 'GAME';
      
      // Directly end the game with the selected player as winner
      this.eliminated.push(validTargets[0]);
      this.alive = [selectedMember];
      await sleep(1500); // short pause before winner image
      return this._resolveWinner(selectedMember);
    }

    this.phase = 'TURN';
    this.turnState = {
      selectedMember,
      isRestricted,
      activePower: null,
      targets: [],
      page: 0,
      resolved: false,
    };

    const startTime = Date.now();
    this.turnState.startTime = startTime;
    const unixEnd = Math.floor((startTime + C.TURN_DURATION_MS) / 1000);
    const rows = buttons.buildTurnRows(this.alive, selectedMember.id, null);
    
    try {
      this.turnMessage = await this.channel.send({
        content: `⏳ <@${selectedMember.id}>، دورك! اختر لاعباً لطرده <t:${unixEnd}:R>`,
        components: rows,
      });
      this._trackMessage(this.turnMessage);
    } catch (err) {
      console.error('[turn] Send failed:', err.message);
      this.phase = 'GAME';
      await this._processElimination(selectedMember, [selectedMember], 'استسلام');
      return;
    }

    // Await turn decision
    const decision = await new Promise((resolve) => {
      this._turnResolve = resolve;
      this._turnTimeout = setTimeout(() => {
        if (this._turnResolve) {
          const r = this._turnResolve; this._turnResolve = null;
          r({ targets: [selectedMember], power: 'استسلام', auto: true, afk: true });
        }
      }, C.TURN_DURATION_MS);
    });

    clearTimeout(this._turnTimeout);
    this._turnTimeout = null;
    this._turnResolve = null;

    try { 
      await disableAllComponents(this.turnMessage); 
      if (this.turnMessage) {
        await this.turnMessage.edit({ content: `⏳ <@${selectedMember.id}>، انتهى الاختيار.` }).catch(() => {});
      }
    } catch (_) {}

    if (decision.auto) {
      if (decision.afk) {
        await this.channel.send({
          content: `⏰ انتهى الوقت! تم إقصاء **${selectedMember.displayName}** بسبب عدم التفاعل.`
        }).catch(() => {});
      }
    }

    this.phase = 'GAME';

    // Special: تقييد — restriction turn, no elimination
    if (decision.restrictTarget) {
      this.restrictedPlayers.add(decision.restrictTarget.id);
      await this.channel.send({
        content: `🔗 **${selectedMember.displayName}** قيّد **${decision.restrictTarget.displayName}**! لن يتمكن من استخدام الخصائص الهجومية في دوره القادم.`
      }).catch(() => {});
      return;
    }

    if (!decision.targets?.length) return;
    await this._processElimination(selectedMember, decision.targets, decision.power);
  }

  // ── Turn Interaction Handler ──────────────────────────────────────────────
  async _handleTurn(interaction) {
    const { customId, user } = interaction;
    const ts = this.turnState;
    if (!ts) return interaction.deferUpdate().catch(() => {});

    const isSelected = user.id === ts.selectedMember.id;
    const isAlive    = this.alive.some(m => m.id === user.id);

    // Surrender (can be used by ANY player)
    if (customId === 'turn_surrender') {
      const member = this.alive.find(m => m.id === user.id);
      if (!member) return interaction.reply({ content: '❌ أنت لست في اللعبة أو تم إقصاؤك.', ephemeral: true });

      if (isSelected) {
        // Shooter surrenders
        ts.resolved = true;
        await interaction.reply({ content: `🚪 **${member.displayName}** انسحب من اللعبة!`, ephemeral: false });
        return this._resolveTurnDecision({ targets: [member], power: 'استسلام' });
      } else {
        // Non-shooter surrenders
        this.alive = this.alive.filter(m => m.id !== member.id);
        this.eliminated.push(member);
        await interaction.reply({ content: '🚪 لقد قمت بالانسحاب من اللعبة!', ephemeral: true });
        await this.channel.send(`🚪 **${member.displayName}** اختار الانسحاب من اللعبة!`);
        
        // Update turn message rows to remove this player from target buttons
        if (this.turnMessage && this.turnState) {
          const buttons = require('../ui/buttonBuilder');
          const rows = buttons.buildTurnRows(this.alive, this.turnState.selectedMember.id, null);
          await this.turnMessage.edit({ components: rows }).catch(() => {});
        }
        
        // Check win condition
        if (this.alive.length <= 1) {
          this.phase = 'GAME';
          return this._resolveWinner(this.alive[0]);
        }
        return;
      }
    }

    // Only allow selected player to act for the rest of the buttons
    if (!isSelected) {
      if (!interaction.replied && !interaction.deferred)
        return interaction.reply({ content: '❌ هذا ليس دورك.', ephemeral: true });
      return;
    }

    if (ts.resolved) {
      return interaction.reply({ content: '⚠️ الدور انتهى بالفعل.', ephemeral: true });
    }

    // Target selection
    if (customId.startsWith('turn_tgt_')) {
      const targetId = customId.replace('turn_tgt_', '');
      return this._handleTurnTarget(interaction, targetId);
    }

    // Direct power button
    if (customId.startsWith('turn_pow_')) {
      const powerId = customId.replace('turn_pow_', '');
      return this._handleOffensivePowerSelect(interaction, powerId);
    }

    // Random / عشوائي
    if (customId === 'turn_rnd') {
      const vt = this.alive.filter(m => m.id !== ts.selectedMember.id && !this.immunePlayers.has(m.id));
      const auto = randomChoice(vt);
      ts.resolved = true;
      await interaction.reply({ content: `🎲 تم اختيار **${auto.displayName}** عشوائيًا!`, ephemeral: true });
      return this._resolveTurnDecision({ targets: [auto], power: null });
    }

    // Offensive power select menu
    if (customId === 'turn_sel_pow') {
      return this._handleOffensivePowerSelect(interaction);
    }

    // Restriction target select (after تقييد activation)
    if (customId === 'turn_sel_restrict') {
      return this._handleRestrictTargetSelect(interaction);
    }

    // Page navigation
    if (customId.startsWith('turn_pg_')) {
      const page = parseInt(customId.replace('turn_pg_', ''), 10);
      ts.page = page;
      const rows = buttons.buildTargetRows(this.alive, ts.selectedMember.id, page, ts.activePower, null);
      return interaction.update({ components: rows }).catch(() => {});
    }

    await interaction.deferUpdate().catch(() => {});
  }

  async _handleTurnTarget(interaction, targetId) {
    const ts = this.turnState;
    const target = this.alive.find(m => m.id === targetId);
    if (!target) return interaction.reply({ content: '❌ اللاعب غير موجود.', ephemeral: true });
    if (this.immunePlayers.has(targetId))
      return interaction.reply({ content: '❌ هذا اللاعب محصّن ولا يمكن استهدافه.', ephemeral: true });

    // Double elimination: need 2 picks
    if (ts.activePower === 'طرد_مرتين') {
      if (ts.targets.length === 0) {
        ts.targets.push(target);
        await interaction.reply({ content: `✅ الهدف الأول: **${target.displayName}**. اختر الهدف الثاني.`, ephemeral: true });
        const rows = buttons.buildTurnRows(this.alive, ts.selectedMember.id, target.id);
        await this.turnMessage.edit({ components: rows }).catch(() => {});
        return;
      }
      if (ts.targets.length === 1) {
        if (target.id === ts.targets[0].id)
          return interaction.reply({ content: '❌ لا يمكنك اختيار نفس الهدف مرتين.', ephemeral: true });
        ts.targets.push(target);
        ts.resolved = true;
        await interaction.deferUpdate().catch(() => {});
        return this._resolveTurnDecision({ targets: ts.targets, power: ts.activePower });
      }
      return;
    }

    // انفجار_مزدوج: pick 1, bot picks second
    if (ts.activePower === 'انفجار_مزدوج') {
      const others = this.alive.filter(m => m.id !== ts.selectedMember.id && m.id !== target.id);
      const botPick = randomChoice(others);
      ts.targets = [target, botPick];
      ts.resolved = true;
      await interaction.reply({ content: `🧨 اخترت **${target.displayName}** والبوت اختار **${botPick.displayName}**!`, ephemeral: true });
      return this._resolveTurnDecision({ targets: ts.targets, power: ts.activePower });
    }

    // All other single-target powers
    ts.targets  = [target];
    ts.resolved = true;
    await interaction.deferUpdate().catch(() => {});
    this._resolveTurnDecision({ targets: [target], power: ts.activePower });
  }

  async _handleOffensivePowerSelect(interaction, powerId) {
    const ts     = this.turnState;

    const item   = shopManager.getItem(powerId);
    if (!item) return interaction.reply({ content: '❌ خاصية غير موجودة.', ephemeral: true });
    if (ts.isRestricted) return interaction.reply({ content: '🔗 أنت مقيّد.', ephemeral: true });
    if (!userManager.hasItem(interaction.user.id, powerId))
      return interaction.reply({ content: '❌ لا تملك هذه الخاصية.', ephemeral: true });

    // Extra validation
    if (powerId === 'انفجار_مزدوج' && this.alive.length < 4)
      return interaction.reply({ content: '❌ الانفجار المزدوج يتطلب 4 لاعبين أو أكثر.', ephemeral: true });
    if (powerId === 'حكم_نهائي' && this.alive.length <= 3)
      return interaction.reply({ content: '❌ الحكم النهائي معطّل عند 3 لاعبين أو أقل.', ephemeral: true });

    // Consume immediately
    userManager.consumeItem(interaction.user.id, powerId);
    userManager.incrementItemsUsed(interaction.user.id);
    ts.activePower = powerId;

    // تقييد: special flow — no elimination, just pick restriction target
    if (powerId === 'تقييد') {
      const vt = this.alive.filter(m => m.id !== ts.selectedMember.id);
      const row = buttons.buildPlayerSelectMenu(vt, 'turn_sel_restrict', 'اختر لاعبًا لتقييده');
      return interaction.reply({ content: `🔗 **تقييد** مفعّل! اختر اللاعب الذي تريد تقييده:`, components: [row], ephemeral: true });
    }

    // طرد_مرتين: update turn message UI
    if (powerId === 'طرد_مرتين') {
      const rows = buttons.buildTurnRows(this.alive, ts.selectedMember.id, null);
      await this.turnMessage.edit({ components: rows }).catch(() => {});
      return interaction.reply({ content: `⚔️ **طرد مرتين** مفعّل! اختر الهدف الأول.`, ephemeral: true });
    }

    // Standard confirmation messages
    const msgs = {
      'ضربة_قاضية': '💀 **ضربة قاضية** مفعّلة! الدرع والتفادي لن يعملا. اختر هدفك.',
      'إسكات':       '🔇 **إسكات** مفعّل! الهدف لن يتمكن من استخدام خصائصه الشخصية. اختر هدفك.',
      'حصار':        '🚫 **حصار** مفعّل! لن يتمكن أحد من حماية الهدف خارجيًا. اختر هدفك.',
      'أمر_إجباري':  '🎯 **أمر إجباري** مفعّل! الهدف مقفل. اختر هدفك.',
      'انفجار_مزدوج':'🧨 **انفجار مزدوج** مفعّل! اختر هدفًا والبوت يختار الثاني.',
      'حكم_نهائي':   '☠️ **حكم نهائي** مفعّل! يتجاوز معظم الدفاعات. اختر هدفك.',
    };
    return interaction.reply({ content: msgs[powerId] || `✅ **${item.name}** مفعّل! اختر هدفك.`, ephemeral: true });
  }

  async _handleRestrictTargetSelect(interaction) {
    const ts = this.turnState;
    if (ts.resolved) return interaction.reply({ content: '⚠️ الدور انتهى.', ephemeral: true });
    const targetId = interaction.values[0];
    const target = this.alive.find(m => m.id === targetId);
    if (!target) return interaction.reply({ content: '❌ اللاعب غير موجود.', ephemeral: true });
    ts.resolved = true;
    await interaction.reply({ content: `🔗 تم تقييد **${target.displayName}** بنجاح!`, ephemeral: true });
    this._resolveTurnDecision({ targets: [], power: 'تقييد', restrictTarget: target });
  }

  _resolveTurnDecision(decision) {
    if (!this._turnResolve) return;
    const r = this._turnResolve;
    this._turnResolve = null;
    clearTimeout(this._turnTimeout);
    this._turnTimeout = null;
    r(decision);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // ELIMINATION PROCESSING
  // ═══════════════════════════════════════════════════════════════════════════

  async _processElimination(attacker, targets, power) {
    if (this.destroyed) return;

    // Special case: Surrender
    if (power === 'استسلام') {
      this.eliminated.push(attacker);
      this.alive = this.alive.filter(m => m.id !== attacker.id);
      return;
    }

    let successfulElims = 0;

    for (const target of targets) {
      if (this.destroyed) return;
      if (!this.alive.some(m => m.id === target.id)) continue;
      
      const eliminated = await this._resolveOneElimination(attacker, target, power);
      if (eliminated) {
        successfulElims++;
        userManager.recordElimination(attacker.id);
      }
      if (this.alive.length <= 1) break;
    }

    if (successfulElims > 0) {
      const current = this.successfulTurnCounts.get(attacker.id) || 0;
      const next    = current + 1;
      this.successfulTurnCounts.set(attacker.id, next);
      const reward  = next * 10;
      userManager.addPoints(attacker.id, reward);
      userManager.incrementSuccessfulTurns(attacker.id);
      // We no longer send an embed or text about points here to keep it clean.
    }

    // إنعاش opportunity
    if (!this.destroyed) await this._checkReviveOpportunity();

    // Reset reactive defense queue for the next turn
    if (this.queuedDefenses) this.queuedDefenses.clear();
  }

  async _resolveOneElimination(attacker, target, activePower) {
    if (this.destroyed) return false;

    const isUltimate    = activePower === 'حكم_نهائي';
    const isPowerStrike = activePower === 'ضربة_قاضية';
    const isSieged      = activePower === 'حصار';
    const isSilenced    = activePower === 'إسكات';
    const isMandatory   = activePower === 'أمر_إجباري';
    
    // Immunity check
    if (this.immunePlayers.has(target.id)) {
      await this.channel.send({ content: `👻 **${target.displayName}** لديه حصانة مؤقتة! نجى من الطرد.` }).catch(() => {});
      return false;
    }

    // Fortification / Protection
    const isFortified = !isUltimate && this.fortifiedPlayers.has(target.id);
    const isProtected = !isUltimate && !isSieged && this.protectedPlayers.has(target.id);
    if (isFortified) this.fortifiedPlayers.delete(target.id);
    if (isProtected) this.protectedPlayers.delete(target.id);

    // ── Activate Queued Defenses ──
    if (this.queuedDefenses && this.queuedDefenses.has(target.id)) {
      const defPowerId = this.queuedDefenses.get(target.id);
      if (userManager.hasItem(target.id, defPowerId)) {
        userManager.consumeItem(target.id, defPowerId);
        userManager.incrementItemsUsed(target.id);
        
        if (defPowerId === 'درع') {
          this.shieldedPlayers = this.shieldedPlayers || new Set();
          this.shieldedPlayers.add(target.id);
        } else if (defPowerId === 'تفادي') {
          this.dodgingPlayers = this.dodgingPlayers || new Set();
          this.dodgingPlayers.add(target.id);
        } else if (defPowerId === 'انعكاس') {
          this.reflectingPlayers = this.reflectingPlayers || new Set();
          this.reflectingPlayers.add(target.id);
        }
      }
      this.queuedDefenses.delete(target.id);
    }

    // 1. Swap (تبديل)
    if (!isUltimate && !isMandatory && !isSilenced && this.swappingPlayers.has(target.id)) {
      const newTargetId = this.swappingPlayers.get(target.id);
      this.swappingPlayers.delete(target.id);
      const newTarget = this.alive.find(m => m.id === newTargetId);
      if (newTarget) {
        await this.channel.send({ content: `🧲 **${target.displayName}** استخدم **تبديل**! الهجوم تحول إلى **${newTarget.displayName}**!` }).catch(() => {});
        return this._resolveOneElimination(attacker, newTarget, activePower);
      }
    }

    // 2. Reflect (انعكاس)
    if (!isUltimate && !isMandatory && !isSilenced && this.reflectingPlayers.has(target.id)) {
      this.reflectingPlayers.delete(target.id);
      await this.channel.send({ content: `🔁 **${target.displayName}** استخدم **انعكاس**! الهجوم ارتد على **${attacker.displayName}**!` }).catch(() => {});
      // Attacker takes the hit (unless they have shield)
      if (!isUltimate && !isPowerStrike && this.shieldedPlayers.has(attacker.id)) {
         this.shieldedPlayers.delete(attacker.id);
         await this.channel.send({ content: `🛡️ **${attacker.displayName}** تصدى للهجوم المرتد باستخدام الدرع!` }).catch(() => {});
         return false;
      }
      this.eliminated.push(attacker);
      this.alive = this.alive.filter(m => m.id !== attacker.id);
      await this.channel.send({ content: `💀 المهاجم **${attacker.displayName}** تم إقصاؤه بسبب الانعكاس!` }).catch(() => {});
      return false; // original target is safe
    }

    // 3. Shield / Dodge (درع / تفادي)
    if (!isUltimate && !isPowerStrike && !isSilenced && this.shieldedPlayers.has(target.id)) {
      this.shieldedPlayers.delete(target.id);
      await this.channel.send({ content: `🛡️ **${target.displayName}** تصدى للهجوم باستخدام الدرع!` }).catch(() => {});
      return false;
    }

    if (!isUltimate && !isPowerStrike && !isSilenced && this.dodgingPlayers.has(target.id)) {
      this.dodgingPlayers.delete(target.id);
      await this.channel.send({ content: `💨 **${target.displayName}** تفادى الهجوم!` }).catch(() => {});
      return false;
    }

    // 4. Protection (تحصين / حماية / إنقاذ)
    if (isFortified && !isSieged) {
      await this.channel.send({ content: `🏰 **${target.displayName}** تمت حمايته بالتحصين!` }).catch(() => {});
      return false;
    }
    if (isProtected && !isSieged) {
      await this.channel.send({ content: `🤝 **${target.displayName}** تمت حمايته من قبل لاعب آخر!` }).catch(() => {});
      return false;
    }

    // 5. Last Survival (نجاة أخيرة)
    if (!isUltimate && this.lastSurvivalActive.has(target.id)) {
      this.lastSurvivalActive.delete(target.id);
      await this.channel.send({ content: `👑 **${target.displayName}** استخدم النجاة الأخيرة ونجى من الطرد!` }).catch(() => {});
      return false;
    }

    // Elimination succeeds
    this.eliminated.push(target);
    this.alive = this.alive.filter(m => m.id !== target.id);
    await this.channel.send({ content: `💀 تم إقصاء **${target.displayName}**!` }).catch(() => {});
    return true;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // REACTION PHASE HANDLERS
  // ═══════════════════════════════════════════════════════════════════════════

  // ═══════════════════════════════════════════════════════════════════════════
  // REVIVE PHASE (إنعاش)
  // ═══════════════════════════════════════════════════════════════════════════

  async _checkReviveOpportunity() {
    if (this.destroyed || this.alive.length <= 2) return;
    if (!this.eliminated.length) return;

    const revivable = this.eliminated.filter(m => !this.revivedThisMatch.has(m.id));
    if (!revivable.length) return;

    const canRevive = this.alive.some(m => userManager.hasItem(m.id, 'إنعاش'));
    if (!canRevive) return;

    this.phase = 'REVIVE';

    const reviveMsg = await this.channel.send({
      content: `❤️ يمكن لمن يملك **إنعاش** إعادة لاعب مطرود! النافذة مفتوحة لـ **${Math.ceil(C.REVIVE_WINDOW_MS / 1000)} ثوانٍ**.`,
      components: buttons.buildReviveRows(),
    }).catch(() => null);
    this._trackMessage(reviveMsg);

    await new Promise((resolve) => {
      this._phaseResolve = resolve;
      this._phaseTimeout = setTimeout(() => {
        if (this._phaseResolve) { const r = this._phaseResolve; this._phaseResolve = null; r(); }
      }, C.REVIVE_WINDOW_MS);
    });

    clearTimeout(this._phaseTimeout);
    this._phaseTimeout = null;
    this._phaseResolve = null;
    this.phase = 'GAME';

    try { if (reviveMsg) await disableAllComponents(reviveMsg); } catch (_) {}
  }

  async _handleRevive(interaction) {
    const { customId, user } = interaction;
    const isAlive = this.alive.some(m => m.id === user.id);

    if (customId === 'revive_btn') {
      if (!isAlive) return interaction.reply({ content: '❌ أنت مطرود.', ephemeral: true });
      if (!userManager.hasItem(user.id, 'إنعاش'))
        return interaction.reply({ content: '❌ لا تملك الإنعاش.', ephemeral: true });
      const revivable = this.eliminated.filter(m => !this.revivedThisMatch.has(m.id));
      if (!revivable.length)
        return interaction.reply({ content: '❌ لا يوجد لاعبون يمكن إنعاشهم.', ephemeral: true });
      const row = buttons.buildPlayerSelectMenu(revivable, 'revive_sel', 'اختر لاعبًا لإنعاشه');
      return interaction.reply({ content: '❤️ اختر لاعبًا لإنعاشه:', components: [row], ephemeral: true });
    }

    if (customId === 'revive_sel') {
      if (!isAlive) return interaction.reply({ content: '❌ أنت مطرود.', ephemeral: true });
      if (!userManager.hasItem(user.id, 'إنعاش'))
        return interaction.reply({ content: '❌ لا تملك الإنعاش.', ephemeral: true });
      const targetId = interaction.values[0];
      if (targetId === user.id) return interaction.reply({ content: '❌ لا يمكنك إنعاش نفسك!', ephemeral: true });
      const target = this.eliminated.find(m => m.id === targetId);
      if (!target) return interaction.reply({ content: '❌ اللاعب غير موجود في المطرودين.', ephemeral: true });
      if (this.revivedThisMatch.has(targetId))
        return interaction.reply({ content: '❌ هذا اللاعب أُنعش بالفعل في هذه المباراة.', ephemeral: true });

      userManager.consumeItem(user.id, 'إنعاش');
      userManager.incrementItemsUsed(user.id);
      this.eliminated = this.eliminated.filter(m => m.id !== targetId);
      this.alive.push(target);
      this.revivedThisMatch.add(targetId);

      await interaction.reply({ content: `✅ تم إنعاش **${target.displayName}** بنجاح!`, ephemeral: true });
      await this.channel.send({
        content: `❤️ **${target.displayName}** عاد إلى اللعبة! (أُنعش بواسطة **${interaction.member?.displayName || user.username}**)`
      }).catch(() => {});
      
      if (this._phaseResolve) {
        this._phaseResolve();
        this._phaseResolve = null;
      }
      if (this._phaseTimeout) {
        clearTimeout(this._phaseTimeout);
        this._phaseTimeout = null;
      }
    } else {
      await interaction.deferUpdate().catch(() => {});
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // PROACTIVE POWERS (from bag button during game)
  // ═══════════════════════════════════════════════════════════════════════════

  async _handleCmdBag(interaction) {
    const { user } = interaction;
    if (this.phase === 'TURN' && this.turnState && this.turnState.selectedMember.id === user.id) {
      // Attacker wants to see their offensive powers
      return this._doOffensiveBag(interaction);
    } else {
      // Defender or outside of turn
      return this._doDefensiveBag(interaction);
    }
  }

  async _doOffensiveBag(interaction) {
    const { user } = interaction;
    const isAlive  = this.gameRunning && this.alive.some(m => m.id === user.id);
    if (!isAlive)
      return interaction.reply({ content: '❌ أنت لست في اللعبة.', ephemeral: true });

    const profile  = userManager.getUser(user.id);
    const catalog  = shopManager.getCatalog();
    const rows = buttons.buildOffensivePowerRows(profile.inventory, catalog);

    if (!rows || rows.length === 0)
      return interaction.reply({ content: '❌ لا تملك أي خصائص هجومية في حقيبتك.', ephemeral: true });

    return interaction.reply({ content: '⚡ **خصائصك الهجومية:** اختر خاصية لتفعيلها الآن:', components: rows, ephemeral: true });
  }

  async _doDefensiveBag(interaction) {
    const { user } = interaction;
    const isAlive  = this.gameRunning && this.alive.some(m => m.id === user.id);
    if (!isAlive)
      return interaction.reply({ content: '❌ الخصائص الاستباقية والدفاعية متاحة للاعبين الأحياء فقط أثناء اللعبة.', ephemeral: true });

    const profile  = userManager.getUser(user.id);
    const catalog  = shopManager.getCatalog();
    const rows = buttons.buildDefensivePowerRows(profile.inventory, catalog);

    if (!rows || rows.length === 0)
      return interaction.reply({ content: '❌ لا تملك أي خصائص دفاعية في حقيبتك.', ephemeral: true });

    return interaction.reply({ content: '🛡️ **خصائصك الدفاعية:** اختر خاصية لتفعيلها الآن:', components: rows, ephemeral: true });
  }

  async _doDefensiveBagPowerSelect(interaction, powerId) {
    // Adapter to use the existing bag power logic, just substituting the value
    interaction.values = [powerId];
    return this._doBagPowerSelect(interaction);
  }

  async _doBagUse(interaction) {
    const { user } = interaction;
    const isAlive  = this.gameRunning && this.alive.some(m => m.id === user.id);
    if (!isAlive)
      return interaction.reply({ content: '❌ الخصائص الاستباقية متاحة للاعبين الأحياء فقط أثناء اللعبة.', ephemeral: true });

    const profile  = userManager.getUser(user.id);
    const catalog  = shopManager.getCatalog();
    const proactiveIds = Object.keys(profile.inventory).filter(id => profile.inventory[id] > 0 && catalog[id]?.category === 'defensive');

    if (!proactiveIds.length)
      return interaction.reply({ content: '❌ لا تملك خصائص استباقية في حقيبتك.', ephemeral: true });

    const row = buttons.buildPowerSelectMenu(proactiveIds, catalog, profile.inventory, 'bag_sel_pow');
    if (!row) return interaction.reply({ content: '❌ لا توجد خصائص.', ephemeral: true });
    return interaction.reply({ content: '🎒 اختر خاصية استباقية لتفعيلها:', components: [row], ephemeral: true });
  }

  async _doBagPowerSelect(interaction) {
    const { user } = interaction;
    const powerId  = interaction.values[0];
    const item     = shopManager.getItem(powerId);
    if (!item) return interaction.reply({ content: '❌ خاصية غير موجودة.', ephemeral: true });
    if (!userManager.hasItem(user.id, powerId))
      return interaction.reply({ content: '❌ لا تملك هذه الخاصية.', ephemeral: true });

    const isAlive = this.alive.some(m => m.id === user.id);
    if (!isAlive) return interaction.reply({ content: '❌ أنت مطرود.', ephemeral: true });

    if (['درع', 'تفادي', 'انعكاس'].includes(powerId)) {
      this.queuedDefenses = this.queuedDefenses || new Map();
      this.queuedDefenses.set(user.id, powerId);
      return interaction.reply({ content: `✅ تم تجهيز **${item.name}**! سيُخصم من حقيبتك ويُفعّل فقط إذا تعرضت للهجوم في هذا الدور.`, ephemeral: true });
    }

    if (powerId === 'حصانة_مؤقتة') {
      if (this.alive.length <= 2)
        return interaction.reply({ content: '❌ الحصانة المؤقتة معطّلة في النهائي.', ephemeral: true });
      if (this.immunePlayers.has(user.id))
        return interaction.reply({ content: '⚠️ لديك حصانة مؤقتة مفعّلة بالفعل.', ephemeral: true });
      userManager.consumeItem(user.id, powerId);
      userManager.incrementItemsUsed(user.id);
      this.immunePlayers.add(user.id);
      return interaction.reply({ content: `✅ 👻 **الحصانة المؤقتة** مفعّلة! لن تُستهدف في الدور القادم.`, ephemeral: true });
    }

    if (powerId === 'نجاة_أخيرة') {
      if (this.alive.length <= 2)
        return interaction.reply({ content: '❌ نجاة أخيرة معطّلة في النهائي.', ephemeral: true });
      if (this.alive.length <= 3)
        return interaction.reply({ content: '❌ نجاة أخيرة تتطلب 4 لاعبين أو أكثر.', ephemeral: true });
      if (this.lastSurvivalActive.has(user.id))
        return interaction.reply({ content: '⚠️ نجاة أخيرة مفعّلة بالفعل.', ephemeral: true });
      userManager.consumeItem(user.id, powerId);
      userManager.incrementItemsUsed(user.id);
      this.lastSurvivalActive.add(user.id);
      return interaction.reply({ content: `✅ 👑 **نجاة أخيرة** مفعّلة! ستنقذك تلقائيًا مرة واحدة.`, ephemeral: true });
    }

    if (powerId === 'تحصين') {
      if (this.alive.length <= 3)
        return interaction.reply({ content: '❌ التحصين معطّل عند 3 لاعبين أو أقل.', ephemeral: true });
      const validTargets = this.alive.filter(m => m.id !== user.id);
      const row = buttons.buildPlayerSelectMenu(validTargets, 'bag_fortify_sel', 'اختر لاعبًا لتحصينه');
      if (!row) return interaction.reply({ content: '❌ لا توجد أهداف.', ephemeral: true });
      await interaction.reply({ content: '🔐 **التحصين** — اختر لاعبًا لحمايته في الحدث القادم:', components: [row], ephemeral: true });

      // Wait for target
      const targetInteraction = await new Promise((resolve) => {
        const t = setTimeout(() => { this.pendingInput.delete(user.id); resolve(null); }, 15_000);
        this.pendingInput.set(user.id, { awaitCustomId: 'bag_fortify_sel', resolve, timeout: t });
      });

      if (!targetInteraction) return;
      const targetId = targetInteraction.values?.[0];
      const target   = this.alive.find(m => m.id === targetId);
      if (!target) return targetInteraction.reply({ content: '❌ اللاعب غير موجود.', ephemeral: true });

      userManager.consumeItem(user.id, powerId);
      userManager.incrementItemsUsed(user.id);
      if (!this.fortifiedPlayers.has(targetId)) this.fortifiedPlayers.set(targetId, new Set());
      this.fortifiedPlayers.get(targetId).add(user.id);

      return targetInteraction.reply({
        content: `✅ 🔐 **${target.displayName}** محصّن ضد الطرد العادي في الحدث القادم!`,
        ephemeral: true,
      });
    }

    return interaction.reply({ content: '❌ خاصية غير معروفة.', ephemeral: true });
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // FINAL 2
  // ═══════════════════════════════════════════════════════════════════════════

    // WINNER
  // ═══════════════════════════════════════════════════════════════════════════

  async _resolveWinner(winner) {
    if (this.destroyed) return;
    if (!winner) {
      await this.channel.send({ content: '❓ لم يتم تحديد فائز!' }).catch(() => {});
      this.destroy();
      return;
    }

    userManager.addPoints(winner.id, C.POINTS.WIN_GAME);
    userManager.recordWin(winner.id);

    try {
      const buf = await generateWinnerImage(winner);
      if (buf) {
        await this.channel.send({
          content: `<@${winner.id}>`,
          files: [new AttachmentBuilder(buf, { name: 'winner.png' })],
        });
      }
    } catch (err) {
      console.error('[winner] Image error:', err.message);
    }

    this.destroy();
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // ANYTIME HANDLERS (shop, bag, leaderboard, profile)
  // ═══════════════════════════════════════════════════════════════════════════

  async _doShop(interaction) {
    await interaction.deferReply({ ephemeral: true }).catch(() => {});
    return this._doShopCategory(interaction, 'offensive', true);
  }

  async _doShopCategory(interaction, category = 'offensive', isNewReply = false) {
    const cat = category || 'offensive';
    const { user } = interaction;
    const member = await this.guild.members.fetch(user.id).catch(() => null);
    const profile = userManager.getUser(user.id);
    const fakeMember = member || {
      displayName: user.username,
      displayAvatarURL: (o) => user.displayAvatarURL(o),
    };

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

    const payload = {
      components: [menu, ...buttons.buildShopCategoryRows()],
    };
    if (attachment) {
      payload.files = [attachment];
      payload.attachments = [];
    }
    if (embed) payload.embeds = [embed];

    if (isNewReply || interaction.deferred || interaction.replied) {
      return interaction.editReply(payload).catch(() => {});
    }
    if (interaction.isButton()) {
      return interaction.update(payload).catch(() => interaction.reply({ ...payload, ephemeral: true }));
    }
    return interaction.reply({ ...payload, ephemeral: true }).catch(() => {});
  }

  async _doShopBuy(interaction) {
    const itemId = interaction.values[0].replace('buy_', '');
    const result = shopManager.purchaseItem(interaction.user.id, itemId);
    if (result.success) {
      const item = shopManager.getItem(itemId);
      const pts = require("../utils/helpers").formatPoints(result.remainingPoints || 0);
      return interaction.reply({
        content:
          `✅ تم شراء **${item.emoji} ${item.name}** بـ **${item.cost} نقطة**!\n` +
          `💰 رصيدك المتبقي: **${pts} نقطة**\n` +
          `📦 الكمية لديك الآن: **×${result.quantity}**`,
        ephemeral: true,
      });
    }
    return interaction.reply({ content: `❌ ${result.reason}`, ephemeral: true });
  }

  async _doBag(interaction) {
    await interaction.deferReply({ ephemeral: true }).catch(() => {});
    const { user } = interaction;
    const member   = await this.guild.members.fetch(user.id).catch(() => null);
    const profile  = userManager.getUser(user.id);
    const catalog  = shopManager.getCatalog();
    const fakeMember = member || {
      displayName: user.username,
      displayAvatarURL: (o) => user.displayAvatarURL(o),
    };
    const isInGame = this.gameRunning && this.alive.some(m => m.id === user.id);
    const hasProactive = isInGame && Object.keys(profile.inventory).some(id => profile.inventory[id] > 0 && catalog[id]?.category === 'defensive');
    const { embed, attachment } = await embeds.buildBackpackResponse(fakeMember, profile.inventory, catalog);
    const replyOpts = {
      components: hasProactive ? buttons.buildBagWithUseRows() : [],
    };
    if (attachment) replyOpts.files = [attachment];
    if (embed) replyOpts.embeds = [embed];
    return interaction.editReply(replyOpts).catch(() => {});
  }

  async _doLeaderboard(interaction) {
    await interaction.deferReply({ ephemeral: true }).catch(() => {});
    const raw = userManager.getLeaderboard(10);
    const { embed, attachment } = await embeds.buildLeaderboardResponse(raw, this.guild);
    const replyOpts = {};
    if (attachment) replyOpts.files = [attachment];
    if (embed) replyOpts.embeds = [embed];
    return interaction.editReply(replyOpts).catch(() => {});
  }

  async _doProfile(interaction) {
    await interaction.deferReply({ ephemeral: true }).catch(() => {});
    const { user } = interaction;
    const member   = await this.guild.members.fetch(user.id).catch(() => null);
    const profile  = userManager.getUser(user.id);
    const fakeMember = member || {
      displayName: user.username,
      displayAvatarURL: (o) => user.displayAvatarURL(o),
    };
    const { embed, attachment } = await embeds.buildProfileResponse(fakeMember, profile);
    const replyOpts = {};
    if (attachment) replyOpts.files = [attachment];
    if (embed) replyOpts.embeds = [embed];
    return interaction.editReply(replyOpts).catch(() => {});
  }

  async _doRules(interaction) {
    await interaction.deferReply({ ephemeral: true }).catch(() => {});
    const { embed, attachment } = await embeds.buildRulesResponse();
    const replyOpts = {};
    if (attachment) replyOpts.files = [attachment];
    if (embed) replyOpts.embeds = [embed];
    return interaction.editReply(replyOpts).catch(() => {});
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // CLEANUP
  // ═══════════════════════════════════════════════════════════════════════════

  async _cancelGame(reason) {
    try {
      await this.lobbyMessage?.edit({
        content: `🛑 **انتهى وقت اللوبي!**`,
        components: [],
      });
      await this.channel.send({
        content: `🛑 **تم إلغاء اللعبة:** ${reason}`
      });
    } catch (_) {}
    this.destroy();
  }

  _clearLobbyTimers() {
    if (this._lobbyTimer)    { clearTimeout(this._lobbyTimer);      this._lobbyTimer    = null; }
  }

  destroy() {
    if (this.destroyed) return;
    this.destroyed   = true;
    this.gameRunning = false;
    this.phase       = 'ENDED';

    this._clearLobbyTimers();

    if (this._turnTimeout) {
      clearTimeout(this._turnTimeout);
      this._turnTimeout = null;
    }
    if (this._phaseTimeout) {
      clearTimeout(this._phaseTimeout);
      this._phaseTimeout = null;
    }

    // Resolve any pending promises so async code can unblock cleanly
    if (this._turnResolve) {
      const r = this._turnResolve; this._turnResolve = null;
      r({ targets: [], power: null, cancelled: true });
    }
    if (this._phaseResolve) {
      const r = this._phaseResolve; this._phaseResolve = null;
      r();
    }
    // Clear pending inputs
    for (const [, pending] of this.pendingInput) {
      clearTimeout(pending.timeout);
      try { pending.resolve(null); } catch (_) {}
    }
    this.pendingInput.clear();

    removeSession(this.channelId);
    console.log(`[session] ✅ Session ended for channel ${this.channelId}`);
  }
}

module.exports = GameSession;
