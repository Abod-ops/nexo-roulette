// src/ui/canvasRenderer.js
// Dynamic image generation using @napi-rs/canvas
// Generates: roulette wheel frames, lobby card, winner overlay, backpack card, leaderboard card, profile card

const { createCanvas, loadImage, GlobalFonts } = require('@napi-rs/canvas');
const path  = require('path');
const https = require('https');
const http  = require('http');
const fs    = require('fs');
const { ASSETS } = require('../utils/constants');
const { GIFEncoder, quantize, applyPalette } = require('gifenc');

// ── Font Registration ─────────────────────────────────────────────────────────
const fontDir = path.join(process.cwd(), 'assets', 'fonts');
const tajawalBold = path.join(fontDir, 'Tajawal-Bold.ttf');
const tajawalReg  = path.join(fontDir, 'Tajawal-Regular.ttf');
if (fs.existsSync(tajawalBold)) {
  try { GlobalFonts.registerFromPath(tajawalBold, 'Tajawal'); } catch (_) {}
}
if (fs.existsSync(tajawalReg)) {
  try { GlobalFonts.registerFromPath(tajawalReg, 'Tajawal'); } catch (_) {}
}

const sysFonts = [
  'C:/Windows/Fonts/seguisym.ttf',
  'C:/Windows/Fonts/seguiemj.ttf',
  'C:/Windows/Fonts/segoeui.ttf',
  'C:/Windows/Fonts/segoeuib.ttf',
  'C:/Windows/Fonts/arial.ttf',
  'C:/Windows/Fonts/tahoma.ttf',
  'C:/Windows/Fonts/NotoSansJP-Regular.ttf',
  'C:/Windows/Fonts/NotoSansKR-Regular.ttf',
  'C:/Windows/Fonts/NotoSansSC-Regular.ttf',
];
sysFonts.forEach(p => {
  if (fs.existsSync(p)) {
    try { GlobalFonts.registerFromPath(p); } catch (_) {}
  }
});

const FONT_FAMILY = 'Tajawal, "Segoe UI Emoji", "Segoe UI Symbol", "Segoe UI", Arial, Tahoma, sans-serif';

// ── Theme palette ─────────────────────────────────────────────────────────────
const T = {
  bg:        '#0d0000',
  bgCard:    '#1a0000',
  bgRow:     '#260000',
  bgRowAlt:  '#1f0000',
  red:       '#cc0000',
  redLight:  '#ff3322',
  redGlow:   '#ff4400',
  crimson:   '#8b0000',
  gold:      '#ffaa00',
  goldLight: '#ffd060',
  white:     '#ffffff',
  cream:     '#f5e8d8',
  grey:      '#888888',
  dark:      '#0a0000',
};

// ── Asset check ───────────────────────────────────────────────────────────────
let winnerTemplateAvailable = false;

function checkAssets() {
  winnerTemplateAvailable = fs.existsSync(path.join(process.cwd(), ASSETS.WINNER));
  if (!winnerTemplateAvailable)
    console.warn('[canvas] ⚠️  assets/roulette-winner.png not found. Winner image disabled.');
  const lobbyOk = fs.existsSync(path.join(process.cwd(), ASSETS.LOBBY));
  if (!lobbyOk)
    console.warn('[canvas] ⚠️  assets/roulette-lobby.png not found. Lobby image disabled.');
  return { winnerOk: winnerTemplateAvailable, lobbyOk };
}

// ── HTTP image fetch ──────────────────────────────────────────────────────────
function fetchImageBuffer(url) {
  return new Promise((resolve, reject) => {
    const proto = url.startsWith('https') ? https : http;
    proto.get(url, (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end',  () => resolve(Buffer.concat(chunks)));
      res.on('error', reject);
    }).on('error', reject);
  });
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Clean display name: normalizes stylized/mathematical unicode, removes zero-width/control characters */
function cleanDisplayName(name, fallback = 'لاعب') {
  if (!name) return fallback;
  // 1. Normalize fancy math/script/bold/italic unicode to standard characters
  let text = name.normalize('NFKD');
  // 2. Strip invisible zero-width and unprintable control characters
  text = text.replace(/[\u200B-\u200D\uFEFF\u200E\u200F\u0000-\u001F\u007F-\u009F\uFFF0-\uFFFF]/g, '');
  text = text.trim();
  return text || fallback;
}

/** Draw a rounded rectangle path */
function roundRect(ctx, x, y, w, h, r) {
  r = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

/** Glowing stroke */
function glowStroke(ctx, color, blur, lineWidth) {
  ctx.shadowColor = color;
  ctx.shadowBlur  = blur;
  ctx.strokeStyle = color;
  ctx.lineWidth   = lineWidth;
  ctx.stroke();
  ctx.shadowBlur = 0;
}

/** Draw fox-ear triangles at top corners of a card */
function drawFoxEars(ctx, x, y, w) {
  const earW = 22, earH = 26;
  // Left ear
  ctx.fillStyle = T.red;
  ctx.beginPath();
  ctx.moveTo(x + 14, y - earH);
  ctx.lineTo(x + 14 + earW, y - earH);
  ctx.lineTo(x + 14 + earW / 2, y - earH - 14);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = T.cream;
  ctx.beginPath();
  ctx.moveTo(x + 18, y - earH + 5);
  ctx.lineTo(x + 14 + earW - 4, y - earH + 5);
  ctx.lineTo(x + 14 + earW / 2, y - earH - 8);
  ctx.closePath();
  ctx.fill();
  // Right ear
  ctx.fillStyle = T.red;
  ctx.beginPath();
  ctx.moveTo(x + w - 14 - earW, y - earH);
  ctx.lineTo(x + w - 14, y - earH);
  ctx.lineTo(x + w - 14 - earW / 2, y - earH - 14);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = T.cream;
  ctx.beginPath();
  ctx.moveTo(x + w - 14 - earW + 4, y - earH + 5);
  ctx.lineTo(x + w - 18, y - earH + 5);
  ctx.lineTo(x + w - 14 - earW / 2, y - earH - 8);
  ctx.closePath();
  ctx.fill();
}

/** Draw decorative fox tail curl at a position */
function drawTailCurl(ctx, cx, cy, scale = 1) {
  ctx.save();
  ctx.translate(cx, cy);
  ctx.scale(scale, scale);
  ctx.globalAlpha = 0.18;
  ctx.strokeStyle = T.red;
  ctx.lineWidth   = 14;
  ctx.lineCap     = 'round';
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.bezierCurveTo(40, -20, 60, 30, 20, 50);
  ctx.bezierCurveTo(-10, 65, -30, 30, 0, 0);
  ctx.stroke();
  ctx.globalAlpha = 1;
  ctx.restore();
}

/** Fit text to maxWidth — returns reduced fontSize */
function fitText(ctx, text, maxWidth, startSize, minSize = 10) {
  let sz = startSize;
  ctx.font = `bold ${sz}px ${FONT_FAMILY}`;
  while (ctx.measureText(text).width > maxWidth && sz > minSize) {
    sz -= 1;
    ctx.font = `bold ${sz}px ${FONT_FAMILY}`;
  }
  return sz;
}

/** Load avatar from GuildMember / User / URL, return null on failure */
async function loadAvatar(memberOrUrl, size = 256) {
  try {
    let url = null;
    if (typeof memberOrUrl === 'string') {
      url = memberOrUrl;
    } else if (memberOrUrl?.displayAvatarURL) {
      url = memberOrUrl.displayAvatarURL({ extension: 'png', forceStatic: true, size });
    } else if (memberOrUrl?.user?.displayAvatarURL) {
      url = memberOrUrl.user.displayAvatarURL({ extension: 'png', forceStatic: true, size });
    }
    if (!url) return null;
    const buf = await fetchImageBuffer(url);
    return await loadImage(buf);
  } catch (_) { return null; }
}

// ═════════════════════════════════════════════════════════════════════════════
// 1. ROULETTE WHEEL FRAME (Mid-game spinning wheel divided into slices)
// ═════════════════════════════════════════════════════════════════════════════

async function generateWheelFrame(players, angle = 0, centerMember = null) {
  const SIZE = 512;
  const canvas = createCanvas(SIZE, SIZE);
  const ctx = canvas.getContext('2d');
  
  let centerAvatar = null;
  if (centerMember) {
    centerAvatar = await loadAvatar(centerMember, 128);
  }
  const avatars = await Promise.all(players.map(p => loadAvatar(p, 64)));

  const cx = SIZE / 2;
  const cy = SIZE / 2;
  const radius = 235;
  const count = Math.max(1, players.length);
  const sliceAngle = (Math.PI * 2) / count;

  // Wheel background circle glow
  ctx.save();
  ctx.shadowColor = '#ff3322';
  ctx.shadowBlur = 16;
  ctx.beginPath();
  ctx.arc(cx, cy, radius + 2, 0, Math.PI * 2);
  ctx.fillStyle = '#1a0000';
  ctx.fill();
  ctx.restore();

  // Draw slices
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(angle);

  for (let i = 0; i < count; i++) {
    const startAngle = i * sliceAngle;
    const endAngle = startAngle + sliceAngle;

    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.arc(0, 0, radius, startAngle, endAngle);
    ctx.closePath();

    // Alternating white & dark red slices
    ctx.fillStyle = (i % 2 === 0) ? '#7b0000' : '#ffffff';
    ctx.fill();
    ctx.strokeStyle = '#222222';
    ctx.lineWidth = 1.5;
    ctx.stroke();

    // Draw Avatar Upright
    const midAngle = startAngle + sliceAngle / 2;
    const avatarR = radius * 0.45; 
    const ax = Math.cos(midAngle) * avatarR;
    const ay = Math.sin(midAngle) * avatarR;
    const av = avatars[i];
    if (av) {
      ctx.save();
      ctx.translate(ax, ay);
      ctx.rotate(-angle); // Counter-rotate so it stays upright
      ctx.beginPath();
      ctx.arc(0, 0, 20, 0, Math.PI*2);
      ctx.clip();
      ctx.drawImage(av, -20, -20, 40, 40);
      ctx.restore();
    }

    // Draw player name in slice
    ctx.save();
    ctx.rotate(midAngle);
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = (i % 2 === 0) ? '#ffffff' : '#111111';

    const fontSz = Math.min(18, Math.max(11, Math.floor(180 / count) + 6));
    ctx.font = `bold ${fontSz}px ${FONT_FAMILY}`;
    const rawName = players[i]?.displayName || players[i]?.name || `Player ${i + 1}`;
    const name = cleanDisplayName(rawName, `Player ${i + 1}`);
    ctx.fillText(name.slice(0, 15), radius - 18, 0);
    ctx.restore();
  }

  // Outer ring border
  ctx.beginPath();
  ctx.arc(0, 0, radius, 0, Math.PI * 2);
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 4;
  ctx.stroke();

  // Center circle
  const centerRadius = 55;
  ctx.beginPath();
  ctx.arc(0, 0, centerRadius, 0, Math.PI * 2);
  ctx.fillStyle = '#150000';
  ctx.fill();
  ctx.strokeStyle = '#ff3322';
  ctx.lineWidth = 4;
  ctx.stroke();

  if (centerAvatar) {
    ctx.save();
    ctx.beginPath();
    ctx.arc(0, 0, centerRadius - 2, 0, Math.PI * 2);
    ctx.clip();
    ctx.drawImage(centerAvatar, -centerRadius, -centerRadius, centerRadius * 2, centerRadius * 2);
    ctx.restore();
  }

  ctx.restore();

  // Top Pointer Arrow pointing DOWN at the winning slice
  ctx.save();
  ctx.fillStyle = '#ff2200';
  ctx.shadowColor = '#ff0000';
  ctx.shadowBlur = 12;
  ctx.beginPath();
  ctx.moveTo(cx, cy - radius + 18);
  ctx.lineTo(cx - 15, cy - radius - 16);
  ctx.lineTo(cx + 15, cy - radius - 16);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.restore();

  return canvas.toBuffer('image/png');
}

async function generateAnimatedWheelGIF(players, startAngle, targetAngle) {
  const SIZE = 512;
  
  const avatars = await Promise.all(players.map(p => loadAvatar(p, 128)));

  const cx = SIZE / 2;
  const cy = SIZE / 2;
  const radius = 235;
  const count = Math.max(1, players.length);
  const sliceAngle = (Math.PI * 2) / count;

  const gif = new GIFEncoder();
  const frames = 40; // 40 frames for spin animation
  const pauseFrames = 15; // 15 frames of static pause at the end
  const spinDuration = 3000; // 3 seconds spin
  const pauseDuration = 1500; // 1.5 seconds pause
  const delay = Math.floor(spinDuration / frames);
  const pauseDelay = Math.floor(pauseDuration / pauseFrames);
  
  const canvas = createCanvas(SIZE, SIZE);
  const ctx = canvas.getContext('2d');

  for (let frame = 0; frame < frames + pauseFrames; frame++) {
    let currentAngle;
    if (frame < frames) {
      const t = frame / (frames - 1);
      const easedT = 1 - Math.pow(1 - t, 3); // easeOutCubic (better deceleration)
      currentAngle = startAngle + (targetAngle - startAngle) * easedT;
    } else {
      currentAngle = targetAngle; // Fully stopped for the padding frames
    }

    // Calculate which slice is under the top pointer (-Math.PI / 2)
    let theta = (-Math.PI / 2) - currentAngle;
    theta = theta % (Math.PI * 2);
    if (theta < 0) theta += Math.PI * 2;
    const currentIndex = Math.floor(theta / sliceAngle) % count;
    const currentCenterAvatar = avatars[currentIndex];

    ctx.fillStyle = '#313338'; // Discord chat background matte
    ctx.fillRect(0, 0, SIZE, SIZE);

    ctx.save();
    ctx.shadowColor = '#ff3322';
    ctx.shadowBlur = 16;
    ctx.beginPath();
    ctx.arc(cx, cy, radius + 2, 0, Math.PI * 2);
    ctx.fillStyle = '#1a0000';
    ctx.fill();
    ctx.restore();

    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(currentAngle);

    for (let i = 0; i < count; i++) {
      const sAngle = i * sliceAngle;
      const eAngle = sAngle + sliceAngle;

      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.arc(0, 0, radius, sAngle, eAngle);
      ctx.closePath();

      ctx.fillStyle = (i % 2 === 0) ? '#7b0000' : '#ffffff';
      ctx.fill();
      ctx.strokeStyle = '#222222';
      ctx.lineWidth = 1.5;
      ctx.stroke();

      const midAngle = sAngle + sliceAngle / 2;

      // Draw Avatar Upright
      const avatarR = radius * 0.45; 
      const ax = Math.cos(midAngle) * avatarR;
      const ay = Math.sin(midAngle) * avatarR;
      const av = avatars[i];
      if (av) {
        ctx.save();
        ctx.translate(ax, ay);
        ctx.rotate(-currentAngle); // Counter-rotate so it stays upright
        ctx.beginPath();
        ctx.arc(0, 0, 20, 0, Math.PI*2);
        ctx.clip();
        ctx.drawImage(av, -20, -20, 40, 40);
        ctx.restore();
      }

      ctx.save();
      ctx.rotate(midAngle);
      ctx.textAlign = 'right';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = (i % 2 === 0) ? '#ffffff' : '#111111';
      const fontSz = Math.min(18, Math.max(11, Math.floor(180 / count) + 6));
      ctx.font = `bold ${fontSz}px ${FONT_FAMILY}`;
      const rawName = players[i]?.displayName || players[i]?.name || `Player ${i + 1}`;
      const name = cleanDisplayName(rawName, `Player ${i + 1}`);
      ctx.fillText(name.slice(0, 15), radius - 18, 0);
      ctx.restore();
    }
    
    ctx.beginPath();
    ctx.arc(0, 0, radius, 0, Math.PI * 2);
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 4;
    ctx.stroke();

    const centerRadius = 55;
    ctx.beginPath();
    ctx.arc(0, 0, centerRadius, 0, Math.PI * 2);
    ctx.fillStyle = '#150000';
    ctx.fill();
    ctx.strokeStyle = '#ff3322';
    ctx.lineWidth = 4;
    ctx.stroke();

    if (currentCenterAvatar) {
      ctx.save();
      ctx.rotate(-currentAngle); // Counter-rotate so the avatar stays upright and doesn't spin
      ctx.beginPath();
      ctx.arc(0, 0, centerRadius - 2, 0, Math.PI * 2);
      ctx.clip();
      ctx.drawImage(currentCenterAvatar, -centerRadius, -centerRadius, centerRadius * 2, centerRadius * 2);
      ctx.restore();
    }
    ctx.restore();

    ctx.save();
    ctx.fillStyle = '#ff2200';
    ctx.shadowColor = '#ff0000';
    ctx.shadowBlur = 12;
    ctx.beginPath();
    ctx.moveTo(cx, cy - radius + 18);
    ctx.lineTo(cx - 15, cy - radius - 16);
    ctx.lineTo(cx + 15, cy - radius - 16);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.restore();

    const { data } = ctx.getImageData(0, 0, SIZE, SIZE);
    const palette = quantize(data, 256);
    
    // Find closest palette color to the matte background to make it transparent
    const MATTE = [49, 51, 56]; // #313338
    let transparentIndex = 0;
    let minDist = Infinity;
    for (let i = 0; i < palette.length; i++) {
      const d = Math.pow(palette[i][0] - MATTE[0], 2) + Math.pow(palette[i][1] - MATTE[1], 2) + Math.pow(palette[i][2] - MATTE[2], 2);
      if (d < minDist) {
        minDist = d;
        transparentIndex = i;
      }
    }
    
    const index = applyPalette(data, palette);
    const frameDelay = frame < frames ? delay : pauseDelay;
    gif.writeFrame(index, SIZE, SIZE, { palette, delay: frameDelay, repeat: -1, transparent: true, transparentIndex });
  }

  gif.finish();
  return Buffer.from(gif.bytes());
}

// Single-avatar spin frame fallback
async function generateSpinFrame(member, label = '') {
  const SIZE = 256;
  const canvas = createCanvas(SIZE, SIZE);
  const ctx    = canvas.getContext('2d');

  // Dark radial bg
  const grad = ctx.createRadialGradient(SIZE/2, SIZE/2, 10, SIZE/2, SIZE/2, SIZE/2);
  grad.addColorStop(0, '#2a0000');
  grad.addColorStop(1, '#0d0000');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, SIZE, SIZE);

  // Glow ring
  ctx.strokeStyle = T.redGlow;
  ctx.lineWidth   = 6;
  ctx.shadowColor = T.redGlow;
  ctx.shadowBlur  = 22;
  ctx.beginPath();
  ctx.arc(SIZE/2, SIZE/2, 110, 0, Math.PI * 2);
  ctx.stroke();
  ctx.shadowBlur = 0;

  // Avatar circle
  const avatarImg = await loadAvatar(member, 256);
  ctx.save();
  ctx.beginPath();
  ctx.arc(SIZE/2, SIZE/2, 100, 0, Math.PI * 2);
  ctx.closePath();
  ctx.clip();
  if (avatarImg) {
    ctx.drawImage(avatarImg, SIZE/2 - 100, SIZE/2 - 100, 200, 200);
  } else {
    ctx.fillStyle = T.red;
    ctx.fill();
  }
  ctx.restore();

  // Label
  if (label) {
    ctx.fillStyle = 'rgba(0,0,0,0.75)';
    ctx.fillRect(0, SIZE - 42, SIZE, 42);
    ctx.fillStyle = T.white;
    ctx.font = `bold 17px ${FONT_FAMILY}`;
    ctx.textAlign    = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(cleanDisplayName(label).slice(0, 24), SIZE/2, SIZE - 21);
  }

  return canvas.toBuffer('image/png');
}

// ═════════════════════════════════════════════════════════════════════════════
// 2. LOBBY IMAGE (Top-Right compact badge)
// ═════════════════════════════════════════════════════════════════════════════

let cachedLobbyBg = null;

async function generateLobbyImage(playerCount = 0, maxPlayers = 20, remainingMs = 60000) {
  const lobbyImagePath = path.join(process.cwd(), ASSETS.LOBBY);
  if (!cachedLobbyBg) {
    if (fs.existsSync(lobbyImagePath)) {
      cachedLobbyBg = await loadImage(lobbyImagePath).catch((err) => {
        console.error('[canvas] Lobby background load failed:', err);
        return null;
      });
    }
  }

  const W = cachedLobbyBg ? cachedLobbyBg.width : 666;
  const H = cachedLobbyBg ? cachedLobbyBg.height : 375;

  const canvas = createCanvas(W, H);
  const ctx    = canvas.getContext('2d');

  if (cachedLobbyBg) {
    ctx.drawImage(cachedLobbyBg, 0, 0);
  } else {
    // Dark radial fallback
    const grad = ctx.createRadialGradient(W / 2, H / 2, 20, W / 2, H / 2, W / 2);
    grad.addColorStop(0, '#2a0000');
    grad.addColorStop(1, '#0d0000');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, W, H);
  }

  const seconds = Math.max(0, Math.ceil(remainingMs / 1000));

  // ── Top-Right Compact Badge ──
  const badgeW = 185;
  const badgeH = 46;
  const badgeX = W - badgeW - 14;
  const badgeY = 14;
  const r = 8;

  ctx.save();
  ctx.fillStyle = 'rgba(12, 0, 0, 0.82)';
  ctx.strokeStyle = '#ff3322';
  ctx.lineWidth = 1.5;
  ctx.shadowColor = '#ff2200';
  ctx.shadowBlur = 8;

  roundRect(ctx, badgeX, badgeY, badgeW, badgeH, r);
  ctx.fill();
  ctx.stroke();
  ctx.restore();

  // Badge content
  ctx.save();
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  // Line 1: Participants
  ctx.fillStyle = '#ffffff';
  ctx.font = `bold 14px ${FONT_FAMILY}`;
  ctx.fillText(`المشاركون: ${playerCount} / ${maxPlayers}`, badgeX + badgeW / 2, badgeY + (badgeH / 2));
  ctx.restore();

  return canvas.toBuffer('image/png');
}

// ═════════════════════════════════════════════════════════════════════════════
// 3. WINNER IMAGE
// ═════════════════════════════════════════════════════════════════════════════

async function generateWinnerImage(member) {
  if (!winnerTemplateAvailable) return null;
  try {
    const template = await loadImage(path.join(process.cwd(), ASSETS.WINNER));
    const canvas   = createCanvas(template.width, template.height);
    const ctx      = canvas.getContext('2d');
    ctx.drawImage(template, 0, 0);

    const AVATAR_X = template.width / 2;
    const AVATAR_Y = template.height * 0.42; // Moved up to fit the circle better
    const AVATAR_RADIUS = 230; 
    const NAME_X = template.width / 2;
    const NAME_Y = template.height * 0.705;   
    const NAME_MAX_W = 500;
    const NAME_FONT_SZ = 60;

    const avatarImg = await loadAvatar(member, 512);
    if (avatarImg) {
      ctx.save();
      ctx.beginPath();
      ctx.arc(AVATAR_X, AVATAR_Y, AVATAR_RADIUS, 0, Math.PI * 2);
      ctx.closePath();
      ctx.clip();
      ctx.drawImage(avatarImg,
        AVATAR_X - AVATAR_RADIUS, AVATAR_Y - AVATAR_RADIUS,
        AVATAR_RADIUS * 2, AVATAR_RADIUS * 2);
      ctx.restore();
    }

    ctx.fillStyle   = T.white;
    ctx.textAlign   = 'center';
    ctx.textBaseline = 'middle';
    ctx.shadowColor = 'rgba(0,0,0,0.9)';
    ctx.shadowBlur  = 5;
    const cleanName = cleanDisplayName(member.displayName || member.user?.username || 'الفائز');
    fitText(ctx, cleanName, NAME_MAX_W, NAME_FONT_SZ, 14);
    ctx.fillText(cleanName, NAME_X, NAME_Y);

    return canvas.toBuffer('image/png');
  } catch (err) {
    console.error('[canvas] generateWinnerImage error:', err);
    return null;
  }
}

// ═════════════════════════════════════════════════════════════════════════════
// 4. BACKPACK CARD
// ═════════════════════════════════════════════════════════════════════════════

async function generateBackpackCard(member, inventory, catalog) {
  const W = 700, H = 320;
  const canvas = createCanvas(W, H);
  const ctx    = canvas.getContext('2d');

  // Background
  ctx.fillStyle = T.bg;
  ctx.fillRect(0, 0, W, H);

  // Main Card Gradient
  roundRect(ctx, 10, 10, W - 20, H - 20, 22);
  const cardGrad = ctx.createLinearGradient(10, 10, W - 10, H - 10);
  cardGrad.addColorStop(0,   '#1a0000');
  cardGrad.addColorStop(0.45, '#2a0600');
  cardGrad.addColorStop(1,   '#0f0000');
  ctx.fillStyle = cardGrad;
  ctx.fill();

  // Glow Border
  roundRect(ctx, 10, 10, W - 20, H - 20, 22);
  glowStroke(ctx, T.red, 22, 2.5);
  drawFoxEars(ctx, 10, 10, W - 20);
  drawTailCurl(ctx, W - 60, H - 50, 1.8);

  // Top Left Brand
  ctx.fillStyle    = T.red;
  ctx.font         = `bold 16px ${FONT_FAMILY}`;
  ctx.textAlign    = 'left';
  ctx.textBaseline = 'top';
  ctx.fillText('NEXO ROULETTE', 34, 28);

  // Top Right Title
  ctx.fillStyle    = T.goldLight;
  ctx.font         = `bold 18px ${FONT_FAMILY}`;
  ctx.textAlign    = 'right';
  ctx.textBaseline = 'top';
  ctx.fillText('🎒  حقيبتي  —  INVENTORY', W - 34, 28);

  // ── Avatar & Name on Left ──
  const avX = 125, avY = H / 2 + 5, avR = 56;
  const avatarImg = await loadAvatar(member, 256);

  // Glow ring
  ctx.shadowColor = T.redGlow;
  ctx.shadowBlur  = 18;
  ctx.strokeStyle = T.redLight;
  ctx.lineWidth   = 3.5;
  ctx.beginPath();
  ctx.arc(avX, avY - 14, avR + 4, 0, Math.PI * 2);
  ctx.stroke();
  ctx.shadowBlur = 0;

  // Avatar image
  ctx.save();
  ctx.beginPath();
  ctx.arc(avX, avY - 14, avR, 0, Math.PI * 2);
  ctx.closePath();
  ctx.clip();
  if (avatarImg) {
    ctx.drawImage(avatarImg, avX - avR, avY - 14 - avR, avR * 2, avR * 2);
  } else {
    ctx.fillStyle = T.red;
    ctx.fill();
  }
  ctx.restore();

  // Name below avatar
  ctx.fillStyle    = T.white;
  ctx.textAlign    = 'center';
  ctx.textBaseline = 'middle';
  const rawName = member?.displayName || member?.user?.username || member?.username || 'لاعب';
  const displayName = cleanDisplayName(rawName, 'لاعب');
  fitText(ctx, displayName, 170, 16, 11);
  ctx.fillText(displayName, avX, avY + avR + 10);

  // ── Inventory Grid / Container on Right ──
  const items = Object.entries(inventory || {})
    .filter(([, qty]) => qty > 0)
    .map(([id, qty]) => ({ ...catalog[id], id, qty }))
    .filter(i => i.name);

  const startX = 230, startY = 65, gridW = 436, gridH = 225;

  if (items.length === 0) {
    roundRect(ctx, startX, startY, gridW, gridH, 14);
    ctx.fillStyle = 'rgba(40, 0, 0, 0.4)';
    ctx.fill();
    ctx.strokeStyle = 'rgba(255, 50, 50, 0.25)';
    ctx.lineWidth = 1.5;
    ctx.stroke();

    ctx.fillStyle    = T.white;
    ctx.font         = `bold 20px ${FONT_FAMILY}`;
    ctx.textAlign    = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('🪹 الحقيبة فارغة حالياً', startX + gridW / 2, startY + gridH / 2 - 16);

    ctx.fillStyle    = 'rgba(255, 200, 80, 0.8)';
    ctx.font         = `14px ${FONT_FAMILY}`;
    ctx.fillText('تفضل بزيارة المتجر لشراء الخصائص وتخزينها 🛒', startX + gridW / 2, startY + gridH / 2 + 18);
  } else {
    const cols = items.length <= 4 ? 2 : 3;
    const rows = 2;
    const slotW = (gridW - (cols - 1) * 10) / cols;
    const slotH = (gridH - (rows - 1) * 10) / rows;

    items.slice(0, cols * rows).forEach((item, idx) => {
      const c = idx % cols;
      const r = Math.floor(idx / cols);
      const sx = startX + c * (slotW + 10);
      const sy = startY + r * (slotH + 10);

      const isOff = item.category === 'offensive';
      const isDef = item.category === 'defensive';

      roundRect(ctx, sx, sy, slotW, slotH, 10);
      ctx.fillStyle = isOff ? 'rgba(120, 0, 0, 0.4)' : isDef ? 'rgba(0, 40, 100, 0.4)' : 'rgba(70, 0, 100, 0.4)';
      ctx.fill();
      roundRect(ctx, sx, sy, slotW, slotH, 10);
      ctx.strokeStyle = isOff ? 'rgba(255, 50, 50, 0.4)' : isDef ? 'rgba(50, 150, 255, 0.4)' : 'rgba(180, 80, 255, 0.4)';
      ctx.lineWidth = 1.5;
      ctx.stroke();

      // Category Tag
      ctx.fillStyle = isOff ? '#ff8888' : isDef ? '#88ccff' : '#d8a0ff';
      ctx.font = `bold 10px ${FONT_FAMILY}`;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'top';
      ctx.fillText(isOff ? 'هجومية' : isDef ? 'دفاعية' : 'استباقية', sx + 8, sy + 8);

      // Quantity Badge
      roundRect(ctx, sx + slotW - 32, sy + 6, 26, 16, 4);
      ctx.fillStyle = T.gold;
      ctx.fill();
      ctx.fillStyle    = '#000000';
      ctx.font         = `bold 10px ${FONT_FAMILY}`;
      ctx.textAlign    = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(`×${item.qty}`, sx + slotW - 19, sy + 14);

      // Item Name
      ctx.fillStyle    = T.white;
      ctx.font         = `bold 13px ${FONT_FAMILY}`;
      ctx.textAlign    = 'center';
      ctx.textBaseline = 'middle';
      const cleanItemName = cleanDisplayName(item.name, 'عنصر');
      fitText(ctx, cleanItemName, slotW - 12, 13, 9);
      ctx.fillText(cleanItemName, sx + slotW / 2, sy + slotH / 2 + 10);
    });
  }

  return canvas.toBuffer('image/png');
}

// ═════════════════════════════════════════════════════════════════════════════
// 5. LEADERBOARD CARD
// ═════════════════════════════════════════════════════════════════════════════

async function generateLeaderboardCard(entries) {
  const ROW_H = 56, HEADER_H = 70, FOOTER_H = 32;
  const W = 720;
  const H = HEADER_H + Math.max(1, entries.length) * ROW_H + FOOTER_H + 20;
  const canvas = createCanvas(W, H);
  const ctx    = canvas.getContext('2d');

  // Background
  const bgGrad = ctx.createLinearGradient(0, 0, 0, H);
  bgGrad.addColorStop(0, '#150000');
  bgGrad.addColorStop(1, '#0a0000');
  ctx.fillStyle = bgGrad;
  ctx.fillRect(0, 0, W, H);

  // Border
  roundRect(ctx, 6, 6, W - 12, H - 12, 16);
  glowStroke(ctx, T.red, 20, 2);
  drawFoxEars(ctx, 6, 6, W - 12);

  // Header
  roundRect(ctx, 6, 6, W - 12, HEADER_H - 4, 16);
  const hGrad = ctx.createLinearGradient(6, 6, W - 6, 6);
  hGrad.addColorStop(0,   '#6b0000');
  hGrad.addColorStop(0.5, '#cc0000');
  hGrad.addColorStop(1,   '#6b0000');
  ctx.fillStyle = hGrad;
  ctx.fill();

  ctx.fillStyle    = T.goldLight;
  ctx.font         = `bold 24px ${FONT_FAMILY}`;
  ctx.textAlign    = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('لوحة المتصدرين  —  NEXO Roulette', W / 2, HEADER_H / 2 + 3);

  // Column headers
  const colY = HEADER_H + 12;
  ctx.fillStyle    = 'rgba(255,200,80,0.7)';
  ctx.font         = `bold 13px ${FONT_FAMILY}`;
  ctx.textAlign    = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('#', 46, colY);
  ctx.textAlign = 'right';
  ctx.fillText('اللاعب', W - 60, colY);
  ctx.textAlign = 'center';
  ctx.fillText('انتصارات', W / 2 + 10, colY);
  ctx.fillText('نقاط', 180, colY);

  // Divider
  ctx.strokeStyle = 'rgba(200,0,0,0.35)';
  ctx.lineWidth   = 1;
  ctx.beginPath();
  ctx.moveTo(20, colY + 14);
  ctx.lineTo(W - 20, colY + 14);
  ctx.stroke();

  if (entries.length === 0) {
    ctx.fillStyle    = 'rgba(255,255,255,0.4)';
    ctx.font         = `bold 16px ${FONT_FAMILY}`;
    ctx.textAlign    = 'center';
    ctx.fillText('لا توجد بيانات مسجلة حتى الآن', W / 2, HEADER_H + 50);
  } else {
    for (let i = 0; i < entries.length; i++) {
      const e   = entries[i];
      const ry  = HEADER_H + 26 + i * ROW_H;
      const alt = i % 2 === 0;

      // Row bg
      roundRect(ctx, 14, ry, W - 28, ROW_H - 4, 8);
      ctx.fillStyle = alt ? 'rgba(100,0,0,0.28)' : 'rgba(60,0,0,0.18)';
      ctx.fill();

      const midY = ry + (ROW_H - 4) / 2;

      // Rank Pill
      const rankColor = i === 0 ? '#ffd700' : i === 1 ? '#c0c0c0' : i === 2 ? '#cd7f32' : '#888888';
      roundRect(ctx, 32, midY - 14, 28, 28, 6);
      ctx.fillStyle = i < 3 ? rankColor : 'rgba(255,255,255,0.08)';
      ctx.fill();
      ctx.fillStyle = i < 3 ? '#000000' : '#ffffff';
      ctx.font = `bold 14px ${FONT_FAMILY}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(String(i + 1), 46, midY);

      // Avatar Circle (Right side)
      const avX = W - 48, avR = 18;
      if (e.avatarImg) {
        ctx.save();
        ctx.beginPath();
        ctx.arc(avX, midY, avR, 0, Math.PI * 2);
        ctx.closePath();
        ctx.clip();
        ctx.drawImage(e.avatarImg, avX - avR, midY - avR, avR * 2, avR * 2);
        ctx.restore();
      } else {
        ctx.fillStyle = 'rgba(60, 0, 0, 0.8)';
        ctx.beginPath();
        ctx.arc(avX, midY, avR, 0, Math.PI * 2);
        ctx.fill();
      }
      // Avatar Ring
      ctx.strokeStyle = rankColor;
      ctx.lineWidth   = 2;
      ctx.beginPath();
      ctx.arc(avX, midY, avR + 1, 0, Math.PI * 2);
      ctx.stroke();

      // Player name (Right side next to avatar)
      const cleanName = cleanDisplayName(e.name, 'لاعب');
      ctx.fillStyle    = i === 0 ? T.goldLight : T.cream;
      ctx.textAlign    = 'right';
      ctx.textBaseline = 'middle';
      fitText(ctx, cleanName, 220, 15, 11);
      ctx.fillText(cleanName, avX - avR - 10, midY);

      // Wins
      ctx.fillStyle    = T.white;
      ctx.font         = `bold 14px ${FONT_FAMILY}`;
      ctx.textAlign    = 'center';
      ctx.fillText(String(e.wins || 0), W / 2 + 10, midY);

      // Points
      ctx.fillStyle = i === 0 ? T.gold : T.cream;
      ctx.font      = `bold 14px ${FONT_FAMILY}`;
      ctx.fillText(String(e.points || 0), 180, midY);
    }
  }

  // Footer
  ctx.fillStyle    = 'rgba(255,255,255,0.15)';
  ctx.font         = `11px ${FONT_FAMILY}`;
  ctx.textAlign    = 'center';
  ctx.textBaseline = 'bottom';
  ctx.fillText('NEXO Roulette  •  الترتيب حسب الانتصارات ثم النقاط', W / 2, H - 6);

  return canvas.toBuffer('image/png');
}

// ═════════════════════════════════════════════════════════════════════════════
// 6. PROFILE / POINTS BANK CARD
// ═════════════════════════════════════════════════════════════════════════════

async function generateProfileCard(member, profile) {
  const W = 700, H = 300;
  const canvas = createCanvas(W, H);
  const ctx    = canvas.getContext('2d');

  // Background
  ctx.fillStyle = T.bg;
  ctx.fillRect(0, 0, W, H);

  // Main card
  roundRect(ctx, 10, 10, W - 20, H - 20, 22);
  const cardGrad = ctx.createLinearGradient(10, 10, W - 10, H - 10);
  cardGrad.addColorStop(0,   '#1a0000');
  cardGrad.addColorStop(0.45, '#2a0600');
  cardGrad.addColorStop(1,   '#0f0000');
  ctx.fillStyle = cardGrad;
  ctx.fill();

  roundRect(ctx, 10, 10, W - 20, H - 20, 22);
  glowStroke(ctx, T.red, 22, 2.5);
  drawFoxEars(ctx, 10, 10, W - 20);

  // NEXO brand top-left
  ctx.fillStyle    = T.red;
  ctx.font         = `bold 16px ${FONT_FAMILY}`;
  ctx.textAlign    = 'left';
  ctx.textBaseline = 'top';
  ctx.fillText('NEXO ROULETTE', 34, 28);

  // Avatar
  const avX = 140, avY = H / 2, avR = 64;
  const avatarImg = await loadAvatar(member, 256);

  // Glow ring
  ctx.shadowColor = T.redGlow;
  ctx.shadowBlur  = 20;
  ctx.strokeStyle = T.redLight;
  ctx.lineWidth   = 3.5;
  ctx.beginPath();
  ctx.arc(avX, avY - 10, avR + 4, 0, Math.PI * 2);
  ctx.stroke();
  ctx.shadowBlur = 0;

  // Avatar image
  ctx.save();
  ctx.beginPath();
  ctx.arc(avX, avY - 10, avR, 0, Math.PI * 2);
  ctx.closePath();
  ctx.clip();
  if (avatarImg) {
    ctx.drawImage(avatarImg, avX - avR, avY - 10 - avR, avR * 2, avR * 2);
  } else {
    ctx.fillStyle = T.red;
    ctx.fill();
  }
  ctx.restore();

  // Name below avatar
  ctx.fillStyle    = T.white;
  ctx.textAlign    = 'center';
  ctx.textBaseline = 'middle';
  const rawName = member.displayName || member.user?.username || member.username || 'لاعب';
  const displayName = cleanDisplayName(rawName, 'لاعب');
  fitText(ctx, displayName, 190, 16, 11);
  ctx.fillText(displayName, avX, avY + avR + 15);

  // Points (right side)
  const ptX = 450, ptY = 90;

  ctx.fillStyle    = 'rgba(255,200,80,0.7)';
  ctx.font         = `bold 14px ${FONT_FAMILY}`;
  ctx.textAlign    = 'center';
  ctx.textBaseline = 'bottom';
  ctx.fillText('رصيد النقاط', ptX, ptY - 6);

  ctx.fillStyle    = T.goldLight;
  ctx.textAlign    = 'center';
  ctx.textBaseline = 'top';
  ctx.shadowColor  = T.gold;
  ctx.shadowBlur   = 12;
  const pts = (profile.points || 0).toLocaleString('en-US');
  ctx.font = `bold 36px ${FONT_FAMILY}`;
  ctx.fillText(`${pts} نقطة`, ptX, ptY);
  ctx.shadowBlur = 0;

  // Stats row (3 ordered stats: المشاركات, إقصاءات, انتصارات)
  const stats = [
    { label: 'المشاركات', value: String(profile.gamesPlayed || 0) },
    { label: 'إقصاءات',  value: String(profile.eliminations || 0) },
    { label: 'انتصارات',  value: String(profile.wins || 0) },
  ];

  const statW = 126, statH = 56, statY = 195, gap = 12;
  const totalW = stats.length * statW + (stats.length - 1) * gap;
  let startX = ptX - totalW / 2;

  for (const s of stats) {
    roundRect(ctx, startX, statY, statW, statH, 10);
    ctx.fillStyle = 'rgba(120,0,0,0.35)';
    ctx.fill();
    roundRect(ctx, startX, statY, statW, statH, 10);
    ctx.strokeStyle = 'rgba(255,50,50,0.3)';
    ctx.lineWidth = 1.2;
    ctx.stroke();

    // Value
    ctx.fillStyle    = T.white;
    ctx.font         = `bold 18px ${FONT_FAMILY}`;
    ctx.textAlign    = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(s.value, startX + statW / 2, statY + 19);

    // Label
    ctx.fillStyle    = 'rgba(255,255,255,0.7)';
    ctx.font         = `bold 12px ${FONT_FAMILY}`;
    ctx.fillText(s.label, startX + statW / 2, statY + 39);

    startX += statW + gap;
  }

  return canvas.toBuffer('image/png');
}

// ═════════════════════════════════════════════════════════════════════════════
// 7. SHOP CARD (In-game store showcase card — matches Profile & Bag layout)
// ═════════════════════════════════════════════════════════════════════════════

async function generateShopCard(member, userPoints, category = 'offensive', items = [], userInventory = {}) {
  const isAll = category === 'all' || items.length > 10;
  const W = 750, H = 420;
  const canvas = createCanvas(W, H);
  const ctx = canvas.getContext('2d');

  // Background
  ctx.fillStyle = T.bg;
  ctx.fillRect(0, 0, W, H);

  // Main Card Gradient
  roundRect(ctx, 10, 10, W - 20, H - 20, 22);
  const cardGrad = ctx.createLinearGradient(10, 10, W - 10, H - 10);
  cardGrad.addColorStop(0,   '#1a0000');
  cardGrad.addColorStop(0.45, '#2a0600');
  cardGrad.addColorStop(1,   '#0f0000');
  ctx.fillStyle = cardGrad;
  ctx.fill();

  // Glow border
  roundRect(ctx, 10, 10, W - 20, H - 20, 22);
  glowStroke(ctx, T.red, 20, 2.5);
  drawFoxEars(ctx, 10, 10, W - 20);
  drawTailCurl(ctx, W - 60, H - 50, 1.8);

  // Top Left Brand
  ctx.fillStyle    = T.red;
  ctx.font         = `bold 16px ${FONT_FAMILY}`;
  ctx.textAlign    = 'left';
  ctx.textBaseline = 'top';
  ctx.fillText('NEXO ROULETTE', 34, 28);

  // Top Right Title
  ctx.fillStyle    = T.goldLight;
  ctx.font         = `bold 18px ${FONT_FAMILY}`;
  ctx.textAlign    = 'right';
  ctx.textBaseline = 'top';
  ctx.fillText('🛒  متجر الخصائص  —  SHOP', W - 34, 28);

  // ── LEFT COLUMN: Persona, Name, and Points Box ──
  const avX = 120, avY = 132, avR = 54;
  const avatarImg = await loadAvatar(member, 256);

  // Glow ring
  ctx.shadowColor = T.redGlow;
  ctx.shadowBlur  = 18;
  ctx.strokeStyle = T.redLight;
  ctx.lineWidth   = 3.5;
  ctx.beginPath();
  ctx.arc(avX, avY - 10, avR + 4, 0, Math.PI * 2);
  ctx.stroke();
  ctx.shadowBlur = 0;

  // Avatar image
  ctx.save();
  ctx.beginPath();
  ctx.arc(avX, avY - 10, avR, 0, Math.PI * 2);
  ctx.closePath();
  ctx.clip();
  if (avatarImg) {
    ctx.drawImage(avatarImg, avX - avR, avY - 10 - avR, avR * 2, avR * 2);
  } else {
    ctx.fillStyle = T.red;
    ctx.fill();
  }
  ctx.restore();

  // Name below avatar
  ctx.fillStyle    = T.white;
  ctx.textAlign    = 'center';
  ctx.textBaseline = 'middle';
  const rawName = member?.displayName || member?.user?.username || member?.username || 'لاعب';
  const displayName = cleanDisplayName(rawName, 'لاعب');
  fitText(ctx, displayName, 170, 16, 11);
  ctx.fillText(displayName, avX, avY + avR + 12);

  // Points Box on Left
  const pBoxX = 26, pBoxY = avY + avR + 30, pBoxW = 188, pBoxH = 74;
  roundRect(ctx, pBoxX, pBoxY, pBoxW, pBoxH, 12);
  ctx.fillStyle = 'rgba(120, 0, 0, 0.4)';
  ctx.fill();
  roundRect(ctx, pBoxX, pBoxY, pBoxW, pBoxH, 12);
  ctx.strokeStyle = 'rgba(255, 200, 80, 0.4)';
  ctx.lineWidth = 1.2;
  ctx.stroke();

  ctx.fillStyle    = 'rgba(255, 200, 80, 0.75)';
  ctx.font         = `bold 13px ${FONT_FAMILY}`;
  ctx.textAlign    = 'center';
  ctx.textBaseline = 'top';
  ctx.fillText('رصيد النقاط', pBoxX + pBoxW / 2, pBoxY + 10);

  const pts = (userPoints || 0).toLocaleString('en-US');
  ctx.fillStyle    = T.goldLight;
  ctx.font         = `bold 22px ${FONT_FAMILY}`;
  ctx.textBaseline = 'bottom';
  ctx.fillText(`${pts} نقطة`, pBoxX + pBoxW / 2, pBoxY + pBoxH - 10);

  // ── RIGHT COLUMN: Power Items Showcase Grid ──
  const startX = 232, startY = 66, gridW = 484, gridH = 328;

  if (isAll) {
    // 3 columns x 7 rows
    const cols = 3, rows = 7;
    const slotW = (gridW - (cols - 1) * 8) / cols;
    const slotH = (gridH - (rows - 1) * 6) / rows;

    items.slice(0, 20).forEach((item, idx) => {
      const c = idx % cols;
      const r = Math.floor(idx / cols);
      const sx = startX + c * (slotW + 8);
      const sy = startY + r * (slotH + 6);

      const isOff = item.category === 'offensive';
      const isDef = item.category === 'defensive';
      const owned = userInventory[item.id] || 0;

      roundRect(ctx, sx, sy, slotW, slotH, 6);
      ctx.fillStyle = isOff ? 'rgba(110, 0, 0, 0.38)' : isDef ? 'rgba(0, 35, 90, 0.38)' : 'rgba(70, 0, 100, 0.38)';
      ctx.fill();
      roundRect(ctx, sx, sy, slotW, slotH, 6);
      ctx.strokeStyle = isOff ? 'rgba(255, 50, 50, 0.35)' : isDef ? 'rgba(50, 150, 255, 0.35)' : 'rgba(180, 80, 255, 0.35)';
      ctx.lineWidth = 1.2;
      ctx.stroke();

      // Top Right: Name
      ctx.fillStyle    = T.white;
      ctx.font         = `bold 12px ${FONT_FAMILY}`;
      ctx.textAlign    = 'right';
      ctx.textBaseline = 'middle';
      const cleanItemName = cleanDisplayName(item.name, 'عنصر');
      fitText(ctx, cleanItemName, slotW - 55, 12, 9);
      ctx.fillText(cleanItemName, sx + slotW - 6, sy + 14);

      // Top Left: Price
      ctx.fillStyle    = '#ffaa00';
      ctx.font         = `bold 11px ${FONT_FAMILY}`;
      ctx.textAlign    = 'left';
      ctx.textBaseline = 'middle';
      ctx.fillText(`${item.cost} ن`, sx + 6, sy + 14);

      // Bottom line: Category & Owned
      const catText = isOff ? 'هجومية' : isDef ? 'دفاعية' : 'استباقية';
      ctx.fillStyle    = isOff ? '#ff8888' : isDef ? '#88ccff' : '#d8a0ff';
      ctx.font         = `bold 9px ${FONT_FAMILY}`;
      ctx.textAlign    = 'right';
      ctx.fillText(catText, sx + slotW - 6, sy + 30);

      if (owned > 0) {
        ctx.fillStyle    = T.gold;
        ctx.font         = `bold 9px ${FONT_FAMILY}`;
        ctx.textAlign    = 'left';
        ctx.fillText(`×${owned}`, sx + 6, sy + 30);
      }
    });
  } else {
    // 2 columns x 5 rows
    const cols = 2, rows = 5;
    const slotW = (gridW - (cols - 1) * 12) / cols;
    const slotH = (gridH - (rows - 1) * 8) / rows;

    items.slice(0, 10).forEach((item, idx) => {
      const c = idx % cols;
      const r = Math.floor(idx / cols);
      const sx = startX + c * (slotW + 12);
      const sy = startY + r * (slotH + 8);

      const isOff = item.category === 'offensive';
      const isDef = item.category === 'defensive';
      const owned = userInventory[item.id] || 0;

      roundRect(ctx, sx, sy, slotW, slotH, 8);
      ctx.fillStyle = isOff ? 'rgba(120, 0, 0, 0.38)' : isDef ? 'rgba(0, 35, 90, 0.38)' : 'rgba(70, 0, 100, 0.38)';
      ctx.fill();
      roundRect(ctx, sx, sy, slotW, slotH, 8);
      ctx.strokeStyle = isOff ? 'rgba(255, 50, 50, 0.35)' : isDef ? 'rgba(50, 150, 255, 0.35)' : 'rgba(180, 80, 255, 0.35)';
      ctx.lineWidth = 1.2;
      ctx.stroke();

      // Top Right: Name
      ctx.fillStyle    = T.white;
      ctx.font         = `bold 13px ${FONT_FAMILY}`;
      ctx.textAlign    = 'right';
      ctx.textBaseline = 'middle';
      const cleanItemName = cleanDisplayName(item.name, 'عنصر');
      fitText(ctx, cleanItemName, slotW - 90, 13, 9);
      ctx.fillText(cleanItemName, sx + slotW - 8, sy + 16);

      // Owned badge
      if (owned > 0) {
        roundRect(ctx, sx + slotW - 88, sy + 7, 24, 16, 4);
        ctx.fillStyle = T.gold;
        ctx.fill();
        ctx.fillStyle    = '#000000';
        ctx.font         = `bold 10px ${FONT_FAMILY}`;
        ctx.textAlign    = 'center';
        ctx.fillText(`×${owned}`, sx + slotW - 76, sy + 15);
      }

      // Top Left: Price
      ctx.fillStyle    = '#ffaa00';
      ctx.font         = `bold 12px ${FONT_FAMILY}`;
      ctx.textAlign    = 'left';
      ctx.textBaseline = 'middle';
      ctx.fillText(`${item.cost} نقطة`, sx + 8, sy + 16);

      // Bottom line: Description
      ctx.fillStyle    = 'rgba(255, 255, 255, 0.72)';
      ctx.textAlign    = 'right';
      ctx.textBaseline = 'middle';
      const cleanDesc  = cleanDisplayName(item.description, '');
      fitText(ctx, cleanDesc, slotW - 16, 11, 8.5);
      ctx.fillText(cleanDesc, sx + slotW - 8, sy + 38);
    });
  }

  return canvas.toBuffer('image/png');
}

// ═════════════════════════════════════════════════════════════════════════════
// 8. RULES CARD (Canvas Game Rules)
// ═════════════════════════════════════════════════════════════════════════════

async function generateRulesCard() {
  const W = 750, H = 430;
  const canvas = createCanvas(W, H);
  const ctx = canvas.getContext('2d');

  // Background
  ctx.fillStyle = T.bg;
  ctx.fillRect(0, 0, W, H);

  // Card gradient
  roundRect(ctx, 10, 10, W - 20, H - 20, 22);
  const cardGrad = ctx.createLinearGradient(10, 10, W - 10, H - 10);
  cardGrad.addColorStop(0,   '#1a0000');
  cardGrad.addColorStop(0.45, '#2a0600');
  cardGrad.addColorStop(1,   '#0f0000');
  ctx.fillStyle = cardGrad;
  ctx.fill();

  // Glow border
  roundRect(ctx, 10, 10, W - 20, H - 20, 22);
  glowStroke(ctx, T.red, 20, 2.5);
  drawFoxEars(ctx, 10, 10, W - 20);
  drawTailCurl(ctx, W - 60, H - 50, 1.8);

  // Top Left Brand
  ctx.fillStyle    = T.red;
  ctx.font         = `bold 16px ${FONT_FAMILY}`;
  ctx.textAlign    = 'left';
  ctx.textBaseline = 'top';
  ctx.fillText('NEXO ROULETTE', 34, 28);

  // Top Right Title
  ctx.fillStyle    = T.goldLight;
  ctx.font         = `bold 18px ${FONT_FAMILY}`;
  ctx.textAlign    = 'right';
  ctx.textBaseline = 'top';
  ctx.fillText('📜  قوانين اللعبة  —  RULES', W - 34, 28);

  // Section 1: Left Column (طريقة اللعب)
  const s1X = 26, s1Y = 66, s1W = 345, s1H = 336;
  roundRect(ctx, s1X, s1Y, s1W, s1H, 12);
  ctx.fillStyle = 'rgba(120, 0, 0, 0.38)';
  ctx.fill();
  roundRect(ctx, s1X, s1Y, s1W, s1H, 12);
  ctx.strokeStyle = 'rgba(255, 50, 50, 0.35)';
  ctx.lineWidth = 1.2;
  ctx.stroke();

  ctx.fillStyle    = '#ffd700';
  ctx.font         = `bold 16px ${FONT_FAMILY}`;
  ctx.textAlign    = 'right';
  ctx.textBaseline = 'top';
  ctx.fillText('🎯  طريقة اللعب', s1X + s1W - 14, s1Y + 12);

  const s1Lines = [
    '• مدة اللوبي 60 ثانية (3 إلى 20 لاعباً)',
    '• تدور العجلة وتختار لاعباً عشوائياً كل جولة',
    '• اللاعب المختار لديه 15 ثانية لاختيار هدفه',
    '• نافذة 5 ثوانٍ لردود الفعل الدفاعية للهدف',
    '• آخر لاعبين يدخلان مواجهة نهائية 50/50',
    '• صاحب الحظ الأخير يفوز ببطولة الروليت!'
  ];

  ctx.fillStyle = T.white;
  ctx.font      = `bold 12px ${FONT_FAMILY}`;
  s1Lines.forEach((line, idx) => {
    ctx.fillText(line, s1X + s1W - 14, s1Y + 48 + idx * 46);
  });

  // Section 2: Top Right (نظام النقاط والجوائز)
  const s2X = 385, s2Y = 66, s2W = 338, s2H = 158;
  roundRect(ctx, s2X, s2Y, s2W, s2H, 12);
  ctx.fillStyle = 'rgba(120, 80, 0, 0.35)';
  ctx.fill();
  roundRect(ctx, s2X, s2Y, s2W, s2H, 12);
  ctx.strokeStyle = 'rgba(255, 200, 80, 0.4)';
  ctx.lineWidth = 1.2;
  ctx.stroke();

  ctx.fillStyle = '#ffd700';
  ctx.font      = `bold 16px ${FONT_FAMILY}`;
  ctx.fillText('💰  نظام النقاط والجوائز', s2X + s2W - 14, s2Y + 12);

  const s2Lines = [
    '• بدء اللعبة: +5 نقاط لجميع المشاركين',
    '• الإقصاءات: تصاعدي (+10 ثم +20 ثم +30...)',
    '• الفوز بالمركز الأول: +15 نقطة 🏆'
  ];
  ctx.fillStyle = T.white;
  ctx.font      = `bold 12px ${FONT_FAMILY}`;
  s2Lines.forEach((line, idx) => {
    ctx.fillText(line, s2X + s2W - 14, s2Y + 46 + idx * 36);
  });

  // Section 3: Bottom Right (الخصائص والمتجر)
  const s3X = 385, s3Y = 236, s3W = 338, s3H = 166;
  roundRect(ctx, s3X, s3Y, s3W, s3H, 12);
  ctx.fillStyle = 'rgba(0, 40, 100, 0.35)';
  ctx.fill();
  roundRect(ctx, s3X, s3Y, s3W, s3H, 12);
  ctx.strokeStyle = 'rgba(50, 150, 255, 0.4)';
  ctx.lineWidth = 1.2;
  ctx.stroke();

  ctx.fillStyle = '#88ccff';
  ctx.font      = `bold 16px ${FONT_FAMILY}`;
  ctx.fillText('🎒  الخصائص والمتجر', s3X + s3W - 14, s3Y + 12);

  const s3Lines = [
    '• اشترِ الخصائص من المتجر وخزنها في حقيبتك',
    '• الخصائص الهجومية تُفعّل في دورك فقط',
    '• الخصائص الدفاعية تُفعّل عند استهدافك',
    '• الخصائص الاستباقية تُفعّل أثناء اللعبة'
  ];
  ctx.fillStyle = T.white;
  ctx.font      = `bold 12px ${FONT_FAMILY}`;
  s3Lines.forEach((line, idx) => {
    ctx.fillText(line, s3X + s3W - 14, s3Y + 44 + idx * 29);
  });

  return canvas.toBuffer('image/png');
}

// ═════════════════════════════════════════════════════════════════════════════
// Exports
// ═════════════════════════════════════════════════════════════════════════════

module.exports = {
  checkAssets,
  loadAvatar,
  cleanDisplayName,
  generateWheelFrame,
  generateAnimatedWheelGIF,
  generateLobbyImage,
  generateWinnerImage,
  generateBackpackCard,
  generateLeaderboardCard,
  generateProfileCard,
  generateShopCard,
  generateRulesCard,
};
