// Procedural heraldry: draws a house sigil (shield + division + charge) on a canvas.

function shieldPath(ctx, x, y, s) {
  const w = s * 0.86, h = s;
  ctx.beginPath();
  ctx.moveTo(x - w / 2, y - h / 2);
  ctx.lineTo(x + w / 2, y - h / 2);
  ctx.lineTo(x + w / 2, y + h * 0.05);
  ctx.quadraticCurveTo(x + w / 2, y + h * 0.36, x, y + h / 2);
  ctx.quadraticCurveTo(x - w / 2, y + h * 0.36, x - w / 2, y + h * 0.05);
  ctx.closePath();
}

// Charges are drawn in a unit box [-1,1]² (y down)
const CHARGES = {
  wolf(c) {
    c.beginPath();
    c.moveTo(-0.55, 0.75); c.lineTo(-0.45, 0.1); c.lineTo(-0.62, -0.25); c.lineTo(-0.5, -0.8); c.lineTo(-0.25, -0.42);
    c.lineTo(0.02, -0.5); c.lineTo(0.12, -0.85); c.lineTo(0.28, -0.4); c.lineTo(0.72, -0.1); c.lineTo(0.8, 0.08);
    c.lineTo(0.45, 0.12); c.lineTo(0.22, 0.3); c.lineTo(0.2, 0.75); c.closePath(); c.fill();
  },
  lion(c) {
    c.beginPath();
    for (let i = 0; i < 18; i++) { const a = (i / 18) * Math.PI * 2, r = i % 2 ? 0.62 : 0.85; c.lineTo(Math.cos(a) * r, Math.sin(a) * r - 0.05); }
    c.closePath(); c.fill();
    c.save(); c.globalCompositeOperation = 'destination-out';
    c.beginPath(); c.arc(-0.2, -0.15, 0.08, 0, 7); c.arc(0.2, -0.15, 0.08, 0, 7); c.fill();
    c.beginPath(); c.moveTo(-0.18, 0.25); c.quadraticCurveTo(0, 0.4, 0.18, 0.25); c.lineWidth = 0.08; c.stroke();
    c.restore();
  },
  stag(c) {
    c.beginPath(); c.ellipse(0, 0.25, 0.26, 0.42, 0, 0, 7); c.fill();
    c.lineWidth = 0.12; c.lineCap = 'round';
    for (const sx of [-1, 1]) {
      c.beginPath(); c.moveTo(sx * 0.15, -0.1); c.quadraticCurveTo(sx * 0.4, -0.5, sx * 0.3, -0.9); c.stroke();
      c.beginPath(); c.moveTo(sx * 0.3, -0.35); c.lineTo(sx * 0.7, -0.55); c.stroke();
      c.beginPath(); c.moveTo(sx * 0.36, -0.62); c.lineTo(sx * 0.62, -0.88); c.stroke();
      c.beginPath(); c.ellipse(sx * 0.35, 0.02, 0.14, 0.06, sx * 0.4, 0, 7); c.fill();
    }
  },
  dragon(c) {
    c.beginPath();
    c.moveTo(-0.1, 0.8); c.quadraticCurveTo(-0.5, 0.3, -0.1, 0); c.quadraticCurveTo(0.2, -0.3, 0, -0.6); c.lineTo(0.35, -0.75); c.lineTo(0.2, -0.5);
    c.quadraticCurveTo(0.45, -0.1, 0.1, 0.15); c.quadraticCurveTo(-0.1, 0.4, 0.2, 0.8); c.closePath(); c.fill();
    c.beginPath(); c.moveTo(-0.05, -0.05); c.lineTo(-0.9, -0.6); c.lineTo(-0.65, -0.2); c.lineTo(-0.85, 0.05); c.lineTo(-0.5, 0.05); c.closePath(); c.fill();
    c.beginPath(); c.moveTo(0.15, -0.05); c.lineTo(0.9, -0.6); c.lineTo(0.65, -0.2); c.lineTo(0.85, 0.05); c.lineTo(0.5, 0.05); c.closePath(); c.fill();
  },
  falcon(c) {
    c.beginPath(); c.moveTo(0, -0.7); c.quadraticCurveTo(0.14, -0.5, 0.1, -0.3);
    c.lineTo(0.9, -0.55); c.lineTo(0.6, -0.1); c.lineTo(0.14, 0.05); c.lineTo(0.3, 0.75); c.lineTo(0, 0.55); c.lineTo(-0.3, 0.75); c.lineTo(-0.14, 0.05);
    c.lineTo(-0.6, -0.1); c.lineTo(-0.9, -0.55); c.lineTo(-0.1, -0.3); c.quadraticCurveTo(-0.14, -0.5, 0, -0.7); c.fill();
    c.beginPath(); c.arc(0, -0.72, 0.5, Math.PI * 1.15, Math.PI * 1.85); c.lineWidth = 0.1; c.stroke();
  },
  bird(c) { CHARGES.falcon(c); },
  trout(c) {
    c.beginPath(); c.ellipse(-0.1, 0, 0.62, 0.3, 0, 0, 7); c.fill();
    c.beginPath(); c.moveTo(0.45, 0); c.lineTo(0.9, -0.35); c.lineTo(0.9, 0.35); c.closePath(); c.fill();
    c.save(); c.globalCompositeOperation = 'destination-out'; c.beginPath(); c.arc(-0.5, -0.06, 0.06, 0, 7); c.fill(); c.restore();
  },
  fish(c) { CHARGES.trout(c); },
  kraken(c) {
    c.beginPath(); c.ellipse(0, -0.45, 0.35, 0.38, 0, 0, 7); c.fill();
    c.lineWidth = 0.12; c.lineCap = 'round';
    for (let i = 0; i < 6; i++) {
      const x0 = -0.28 + i * 0.112; const dir = i < 3 ? -1 : 1;
      c.beginPath(); c.moveTo(x0, -0.15);
      c.bezierCurveTo(x0 + dir * 0.2, 0.2, x0 - dir * 0.25, 0.45, x0 + dir * (0.25 + i % 3 * 0.12), 0.85); c.stroke();
    }
  },
  sun(c) {
    c.beginPath(); c.arc(0, 0, 0.38, 0, 7); c.fill();
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      c.beginPath(); c.moveTo(Math.cos(a - 0.14) * 0.44, Math.sin(a - 0.14) * 0.44); c.lineTo(Math.cos(a) * 0.9, Math.sin(a) * 0.9); c.lineTo(Math.cos(a + 0.14) * 0.44, Math.sin(a + 0.14) * 0.44); c.fill();
    }
  },
  rose(c) {
    for (let i = 0; i < 5; i++) { const a = (i / 5) * Math.PI * 2 - Math.PI / 2; c.beginPath(); c.arc(Math.cos(a) * 0.38, Math.sin(a) * 0.38, 0.34, 0, 7); c.fill(); }
    c.beginPath(); c.moveTo(0, 0.5); c.lineTo(0, 0.95); c.lineWidth = 0.1; c.stroke();
  },
  flayed(c) {
    c.beginPath(); c.arc(0, 0.62, 0.16, 0, 7); c.fill();
    c.lineWidth = 0.16; c.lineCap = 'round';
    c.beginPath(); c.moveTo(0, 0.45); c.lineTo(0, -0.2); c.moveTo(0, 0.25); c.lineTo(-0.6, 0.55); c.moveTo(0, 0.25); c.lineTo(0.6, 0.55);
    c.moveTo(0, -0.2); c.lineTo(-0.45, -0.85); c.moveTo(0, -0.2); c.lineTo(0.45, -0.85); c.stroke();
    c.beginPath(); c.moveTo(-0.8, -0.9); c.lineTo(0.8, -0.9); c.lineWidth = 0.08; c.stroke();
  },
  giant(c) {
    c.beginPath(); c.arc(0, -0.62, 0.2, 0, 7); c.fill();
    c.lineWidth = 0.2; c.lineCap = 'round';
    c.beginPath(); c.moveTo(0, -0.4); c.lineTo(0, 0.25); c.moveTo(0, -0.25); c.lineTo(-0.65, -0.55); c.moveTo(0, -0.25); c.lineTo(0.65, -0.55);
    c.moveTo(0, 0.25); c.lineTo(-0.35, 0.85); c.moveTo(0, 0.25); c.lineTo(0.35, 0.85); c.stroke();
    c.lineWidth = 0.07; c.beginPath(); c.arc(-0.75, -0.55, 0.1, 0, 7); c.arc(0.75, -0.55, 0.1, 0, 7); c.stroke();
  },
  bear(c) {
    c.beginPath(); c.ellipse(0, 0.2, 0.62, 0.42, 0, 0, 7); c.fill();
    c.beginPath(); c.arc(-0.45, -0.3, 0.3, 0, 7); c.fill();
    c.beginPath(); c.arc(-0.6, -0.58, 0.1, 0, 7); c.arc(-0.3, -0.6, 0.1, 0, 7); c.fill();
    c.fillRect(-0.5, 0.4, 0.2, 0.45); c.fillRect(0.3, 0.4, 0.2, 0.45);
  },
  merman(c) {
    c.beginPath(); c.arc(-0.1, -0.62, 0.16, 0, 7); c.fill();
    c.beginPath(); c.moveTo(-0.3, -0.45); c.lineTo(0.1, -0.45); c.quadraticCurveTo(0.2, 0.2, 0.5, 0.5); c.lineTo(0.8, 0.35); c.lineTo(0.65, 0.8); c.lineTo(0.3, 0.65);
    c.quadraticCurveTo(-0.3, 0.3, -0.3, -0.45); c.fill();
    c.lineWidth = 0.08; c.beginPath(); c.moveTo(-0.6, 0.8); c.lineTo(-0.6, -0.85); c.moveTo(-0.78, -0.85); c.lineTo(-0.78, -0.6); c.lineTo(-0.42, -0.6); c.lineTo(-0.42, -0.85); c.moveTo(-0.6, -0.3); c.lineTo(-0.2, -0.3); c.stroke();
  },
  tower(c) {
    c.fillRect(-0.35, -0.5, 0.7, 1.3);
    for (let i = 0; i < 3; i++) c.fillRect(-0.45 + i * 0.35, -0.8, 0.2, 0.32);
    c.fillRect(-0.45, -0.55, 0.9, 0.12);
    c.save(); c.globalCompositeOperation = 'destination-out'; c.beginPath(); c.arc(0, 0.45, 0.14, Math.PI, 0); c.lineTo(0.14, 0.8); c.lineTo(-0.14, 0.8); c.fill(); c.restore();
  },
  moon(c) {
    c.beginPath(); c.arc(0, 0, 0.7, 0, 7); c.fill();
    c.save(); c.globalCompositeOperation = 'destination-out'; c.beginPath(); c.arc(0.28, -0.12, 0.58, 0, 7); c.fill(); c.restore();
  },
  star(c) {
    c.beginPath();
    for (let i = 0; i < 10; i++) { const a = (i / 10) * Math.PI * 2 - Math.PI / 2, r = i % 2 ? 0.34 : 0.85; c.lineTo(Math.cos(a) * r, Math.sin(a) * r); }
    c.closePath(); c.fill();
  },
  tree(c) {
    c.fillRect(-0.1, 0.1, 0.2, 0.75);
    for (const [x, y, r] of [[0, -0.35, 0.45], [-0.35, -0.05, 0.32], [0.35, -0.05, 0.32], [0, 0.05, 0.3]]) { c.beginPath(); c.arc(x, y, r, 0, 7); c.fill(); }
  },
  horse(c) {
    c.beginPath(); c.moveTo(-0.2, 0.85); c.lineTo(-0.3, 0.1); c.quadraticCurveTo(-0.35, -0.6, 0.1, -0.8); c.lineTo(0.15, -0.95); c.lineTo(0.25, -0.75);
    c.quadraticCurveTo(0.55, -0.55, 0.75, -0.05); c.lineTo(0.6, 0.1); c.lineTo(0.3, -0.1); c.quadraticCurveTo(0.2, 0.4, 0.35, 0.85); c.closePath(); c.fill();
  },
  skull(c) {
    c.beginPath(); c.arc(0, -0.15, 0.55, 0, 7); c.fill(); c.fillRect(-0.3, 0.25, 0.6, 0.4);
    c.save(); c.globalCompositeOperation = 'destination-out';
    c.beginPath(); c.arc(-0.22, -0.12, 0.14, 0, 7); c.arc(0.22, -0.12, 0.14, 0, 7); c.fill();
    c.fillRect(-0.2, 0.45, 0.08, 0.2); c.fillRect(0.12, 0.45, 0.08, 0.2); c.fillRect(-0.04, 0.45, 0.08, 0.2); c.restore();
  },
  spear(c) {
    c.lineWidth = 0.1; c.beginPath(); c.moveTo(-0.7, 0.8); c.lineTo(0.45, -0.35); c.stroke();
    c.beginPath(); c.moveTo(0.35, -0.25); c.lineTo(0.8, -0.8); c.lineTo(0.25, -0.45); c.closePath(); c.fill();
    c.lineWidth = 0.1; c.beginPath(); c.moveTo(0.7, 0.8); c.lineTo(-0.45, -0.35); c.stroke();
    c.beginPath(); c.moveTo(-0.35, -0.25); c.lineTo(-0.8, -0.8); c.lineTo(-0.25, -0.45); c.closePath(); c.fill();
  },
  hand(c) {
    c.beginPath(); c.roundRect ? c.roundRect(-0.4, -0.1, 0.8, 0.8, 0.2) : c.rect(-0.4, -0.1, 0.8, 0.8); c.fill();
    for (let i = 0; i < 4; i++) c.fillRect(-0.4 + i * 0.21, -0.75 + (i === 0 || i === 3 ? 0.15 : 0), 0.17, 0.7);
    c.save(); c.translate(-0.45, 0.15); c.rotate(-0.7); c.fillRect(-0.08, -0.35, 0.17, 0.4); c.restore();
  },
  key(c) {
    c.lineWidth = 0.14; c.beginPath(); c.arc(0, -0.5, 0.28, 0, 7); c.stroke();
    c.fillRect(-0.07, -0.25, 0.14, 1.05); c.fillRect(0, 0.45, 0.35, 0.12); c.fillRect(0, 0.65, 0.28, 0.12);
  },
  flame(c) {
    c.beginPath(); c.moveTo(0, 0.85); c.bezierCurveTo(-0.7, 0.7, -0.6, 0, -0.2, -0.3); c.bezierCurveTo(-0.2, 0, 0, 0.1, 0.05, -0.1);
    c.bezierCurveTo(0, -0.5, 0.1, -0.7, 0.2, -0.9); c.bezierCurveTo(0.4, -0.5, 0.8, 0.1, 0.5, 0.6); c.bezierCurveTo(0.4, 0.8, 0.2, 0.85, 0, 0.85); c.fill();
  },
  lizard(c) {
    c.beginPath(); c.ellipse(-0.05, 0, 0.5, 0.2, -0.2, 0, 7); c.fill();
    c.beginPath(); c.ellipse(-0.62, -0.18, 0.22, 0.14, -0.3, 0, 7); c.fill();
    c.lineWidth = 0.1; c.lineCap = 'round';
    c.beginPath(); c.moveTo(0.4, 0.05); c.quadraticCurveTo(0.8, 0.2, 0.7, 0.65); c.stroke();
    c.beginPath(); c.moveTo(-0.3, 0.1); c.lineTo(-0.45, 0.5); c.moveTo(0.2, 0.05); c.lineTo(0.3, 0.45); c.moveTo(-0.25, -0.1); c.lineTo(-0.35, -0.5); c.moveTo(0.2, -0.15); c.lineTo(0.35, -0.5); c.stroke();
  },
};

export function drawSigil(ctx, sigil, x, y, size, opts = {}) {
  if (!sigil) return;
  ctx.save();
  shieldPath(ctx, x, y, size);
  ctx.fillStyle = sigil.f || '#777'; ctx.fill();
  ctx.save(); ctx.clip();
  const w = size * 0.86, h = size;
  if (sigil.t && sigil.d && sigil.d !== 'plain') {
    ctx.fillStyle = sigil.t;
    const L = x - w / 2, T = y - h / 2;
    switch (sigil.d) {
      case 'pale': ctx.fillRect(x, T, w / 2, h); break;
      case 'fess': ctx.fillRect(L, y, w, h / 2); break;
      case 'chief': ctx.fillRect(L, T, w, h * 0.28); break;
      case 'quarterly': ctx.fillRect(x, T, w / 2, h / 2); ctx.fillRect(L, y, w / 2, h / 2); break;
      case 'bend': ctx.beginPath(); ctx.moveTo(L, T); ctx.lineTo(L + w * 0.3, T); ctx.lineTo(L + w, T + h * 0.7); ctx.lineTo(L + w, T + h); ctx.closePath(); ctx.fill(); break;
      case 'chevron': ctx.beginPath(); ctx.moveTo(L, y + h * 0.3); ctx.lineTo(x, y - h * 0.15); ctx.lineTo(L + w, y + h * 0.3); ctx.lineTo(L + w, y + h * 0.5); ctx.lineTo(x, y + h * 0.05); ctx.lineTo(L, y + h * 0.5); ctx.fill(); break;
      case 'bordure': ctx.lineWidth = size * 0.16; shieldPath(ctx, x, y, size); ctx.strokeStyle = sigil.t; ctx.stroke(); break;
      default: break;
    }
  }
  if (sigil.c && CHARGES[sigil.c]) {
    ctx.save();
    ctx.translate(x, y - size * 0.02);
    const k = size * 0.3;
    ctx.scale(k, k);
    ctx.fillStyle = sigil.cc || '#fff'; ctx.strokeStyle = sigil.cc || '#fff';
    CHARGES[sigil.c](ctx);
    ctx.restore();
  }
  ctx.restore();
  shieldPath(ctx, x, y, size);
  ctx.lineWidth = Math.max(1, size * 0.05);
  ctx.strokeStyle = opts.border || 'rgba(20,14,8,0.85)';
  ctx.stroke();
  ctx.restore();
}

const cache = new Map();
export function sigilURL(sigil, size = 48) {
  const key = JSON.stringify(sigil) + size;
  if (cache.has(key)) return cache.get(key);
  const c = document.createElement('canvas');
  const dpr = 2; c.width = size * dpr; c.height = size * dpr * 1.05;
  const ctx = c.getContext('2d'); ctx.scale(dpr, dpr);
  drawSigil(ctx, sigil, size / 2, size * 0.52, size * 0.95, { border: '#1a130b' });
  const url = c.toDataURL();
  cache.set(key, url);
  return url;
}

/** Draw a hanging swallow-tailed banner filling (w × h) with the house arms. */
export function drawBanner(ctx, sigil, w, h, opts = {}) {
  if (!sigil) return;
  ctx.save();
  const path = () => {
    ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(w, 0); ctx.lineTo(w, h); ctx.lineTo(w / 2, h * 0.84); ctx.lineTo(0, h); ctx.closePath();
  };
  path(); ctx.fillStyle = sigil.f || '#777'; ctx.fill();
  ctx.save(); path(); ctx.clip();
  if (sigil.t && sigil.d && sigil.d !== 'plain') {
    ctx.fillStyle = sigil.t;
    switch (sigil.d) {
      case 'pale': ctx.fillRect(w / 2, 0, w / 2, h); break;
      case 'fess': ctx.fillRect(0, h / 2, w, h / 2); break;
      case 'chief': ctx.fillRect(0, 0, w, h * 0.22); break;
      case 'quarterly': ctx.fillRect(w / 2, 0, w / 2, h / 2); ctx.fillRect(0, h / 2, w / 2, h / 2); break;
      case 'bend': ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(w * 0.35, 0); ctx.lineTo(w, h * 0.75); ctx.lineTo(w, h); ctx.closePath(); ctx.fill(); break;
      case 'chevron': ctx.beginPath(); ctx.moveTo(0, h * 0.75); ctx.lineTo(w / 2, h * 0.4); ctx.lineTo(w, h * 0.75); ctx.lineTo(w, h * 0.92); ctx.lineTo(w / 2, h * 0.57); ctx.lineTo(0, h * 0.92); ctx.fill(); break;
      case 'bordure': ctx.lineWidth = w * 0.14; path(); ctx.strokeStyle = sigil.t; ctx.stroke(); break;
      default: break;
    }
  }
  // subtle cloth shading
  const g = ctx.createLinearGradient(0, 0, w, 0);
  g.addColorStop(0, 'rgba(0,0,0,0.18)'); g.addColorStop(0.35, 'rgba(255,255,255,0.06)'); g.addColorStop(0.7, 'rgba(0,0,0,0.05)'); g.addColorStop(1, 'rgba(0,0,0,0.22)');
  ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
  if (sigil.c && CHARGES[sigil.c]) {
    ctx.save(); ctx.translate(w / 2, h * 0.42); const k = Math.min(w, h) * 0.36; ctx.scale(k, k);
    ctx.fillStyle = sigil.cc || '#fff'; ctx.strokeStyle = sigil.cc || '#fff'; CHARGES[sigil.c](ctx); ctx.restore();
  }
  ctx.restore();
  path(); ctx.lineWidth = Math.max(1, w * 0.04); ctx.strokeStyle = opts.border || 'rgba(30,20,10,0.9)'; ctx.stroke();
  ctx.restore();
}

const bannerCache = new Map();
export function bannerURL(sigil, w = 60, h = 90) {
  const key = JSON.stringify(sigil) + w + 'x' + h;
  if (bannerCache.has(key)) return bannerCache.get(key);
  const c = document.createElement('canvas'); c.width = w * 2; c.height = h * 2;
  const ctx = c.getContext('2d'); ctx.scale(2, 2); drawBanner(ctx, sigil, w, h);
  const url = c.toDataURL(); bannerCache.set(key, url); return url;
}

// Real sigil artwork (downloaded locally by `npm run fetch-sigils`) takes precedence when present.
export const SIGIL_ART = new Map();
export async function loadSigilArt() {
  try {
    const res = await fetch('/assets/sigils/index.json', { cache: 'no-cache' });
    if (!res.ok) return;
    const idx = await res.json();
    for (const [id, file] of Object.entries(idx)) SIGIL_ART.set(id, '/assets/sigils/' + file);
  } catch { /* no art installed */ }
}
export function sigilSrc(house, size = 48) {
  return (house && SIGIL_ART.get(house.id)) || sigilURL(house?.sigil, size);
}
