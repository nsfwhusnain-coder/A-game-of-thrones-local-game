// Painted portraits. Each is built from how the books describe the person (data/looks.js) or, for the
// many lesser folk, from their blood, region, age and office. They're lit from the upper left like
// a small oil painting: shaped face, eyes, brows and lips, textured hair and beards, garb by region
// and office (northern furs, Kingsguard white, maester chains, Dornish silks), and regalia by title.
import { HOUSE_LOOKS, LOOK_OVERRIDES } from '../../data/families.js';
import { LOOKS, COLORS, REGION_GARB, REGION_SKIN } from '../../data/looks.js';
import { HOUSES } from '../../data/houses.js';
import { isFemale } from '../shared/people.js';
export { isFemale };
const HOUSE_BY_ID = Object.fromEntries(HOUSES.map((h) => [h.id, h]));

// ── colour helpers ──
const toRgb = (hex) => { let h = String(hex || '#777').replace('#', ''); if (h.length === 3) h = h.split('').map((c) => c + c).join(''); const n = parseInt(h, 16) || 0; return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
const toHex = (r, g, b) => '#' + [r, g, b].map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('');
const mix = (a, b, t) => { const x = toRgb(a), y = toRgb(b); return toHex(x[0] + (y[0] - x[0]) * t, x[1] + (y[1] - x[1]) * t, x[2] + (y[2] - x[2]) * t); };
const shade = (hex, f) => (f >= 0 ? mix(hex, '#ffffff', f) : mix(hex, '#000000', -f));
const rgba = (hex, a) => { const [r, g, b] = toRgb(hex); return `rgba(${r},${g},${b},${a})`; };
const lum = (hex) => { const [r, g, b] = toRgb(hex); return (0.299 * r + 0.587 * g + 0.114 * b) / 255; };
const sat = (hex) => { const c = toRgb(hex); const mx = Math.max(...c), mn = Math.min(...c); return mx ? (mx - mn) / mx : 0; };
const col = (name, fallback) => (!name ? fallback : COLORS[name] || (String(name).startsWith('#') ? name : fallback));

function hash(s) { let h = 2166136261; for (const ch of String(s)) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619); } return h >>> 0; }
function rngFrom(seed) { let s = seed || 1; return () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296); }
const pick = (r, arr) => arr[Math.floor(r() * arr.length) % arr.length];

// ── who looks like what ──
const CLOTH_OK = (hex) => sat(hex) > 0.22 && lum(hex) > 0.08 && lum(hex) < 0.82;
function houseColours(house) {
  const f = house?.sigil?.f || house?.color || '#5a4a3a', ch = house?.sigil?.cc || '#c9a44a';
  let main, trim;
  if (CLOTH_OK(f) || lum(f) < 0.16) { main = f; trim = ch; } else if (CLOTH_OK(ch) || lum(ch) < 0.16) { main = ch; trim = f; } else { main = lum(f) < lum(ch) ? f : ch; trim = main === f ? ch : f; if (lum(main) > 0.7) main = shade(main, -0.45); }
  if (lum(main) > 0.72) main = shade(main, -0.3);
  const metal = /#(c9a44a|d6ae2e|e6b634|e8b923|f0c238|c8a870|d8b44a)/i.test(trim) || sat(trim) > 0.35 && lum(trim) > 0.45 ? '#caa24a' : '#a9b0b8';
  return { main, trim, metal };
}

export function lookFor(c, house) {
  const r = rngFrom(hash(c.id + ':look'));
  const base = { ...(LOOKS[c.id] || {}), ...(c.look || {}) };
  const female = isFemale(c);
  const age = c.age ?? 30;
  const region = house?.region || '';
  const roles = c.roles || [];
  const title = c.title || '';
  const t = (c.traits || '').toLowerCase();
  const hl = { ...(HOUSE_LOOKS[c.house] || {}), ...(LOOK_OVERRIDES[c.id] || {}) };
  const skins = REGION_SKIN[region] || REGION_SKIN.default;
  const skin0 = hl.skin && !LOOKS[c.id] ? hl.skin : (c.house === 'dothraki' ? '#a8784e' : HOUSE_LOOKS[c.house]?.skin || pick(r, skins));
  // hair
  let hair = col(base.hair, null) || (hl.hair && hl.hair !== 'bald' ? hl.hair : null) || pick(r, region === 'dorne' ? ['#15120f', '#2b1d14'] : region === 'north' ? ['#2b1d14', '#4a3222', '#15120f', '#6a3c20'] : ['#2b1d14', '#4a3222', '#6a3c20', '#8a6a3a', '#15120f', '#b8904a']);
  const explicitGrey = /white|grey|silver/.test(base.hair || '');
  if (!explicitGrey) { if (age >= 70) hair = mix(hair, '#e4e2de', 0.8); else if (age >= 48) hair = mix(hair, '#a8a49e', Math.min(0.6, (age - 44) / 45)); }
  // style
  let style = base.style;
  if (!style) {
    if (hl.hair === 'bald') style = 'bald';
    else if (female) style = age < 12 ? pick(r, ['long', 'braid', 'lank']) : region === 'north' || region === 'beyond' ? pick(r, ['braid', 'long', 'braid']) : pick(r, ['waves', 'long', 'updo', 'curls', 'braid']);
    else if (region === 'beyond' || roles.includes('wildling')) style = pick(r, ['wild', 'lank', 'medium']);
    else if (c.house === 'dothraki') style = 'braid';
    else if (age > 60) style = pick(r, ['bald', 'fringe', 'receding', 'short']);
    else if (age > 40) style = pick(r, ['receding', 'short', 'medium', 'short']);
    else style = pick(r, region === 'north' || region === 'iron_islands' ? ['medium', 'short', 'lank', 'medium'] : ['short', 'medium', 'curls', 'short']);
  }
  // beard
  let beard = base.beard;
  if (!beard) {
    if (female || age < 17) beard = 'none';
    else if (roles.includes('maester')) beard = pick(r, ['none', 'short', 'none']);
    else if (roles.includes('kingsguard')) beard = pick(r, ['none', 'short']);
    else if (region === 'north' || region === 'beyond' || region === 'wall') beard = pick(r, ['full', 'short', 'stubble', 'full', 'great']);
    else if (region === 'iron_islands') beard = pick(r, ['short', 'full', 'stubble']);
    else if (region === 'dorne') beard = pick(r, ['none', 'short', 'pointed', 'stubble']);
    else if (region === 'essos') beard = pick(r, ['none', 'forked', 'short', 'drooping']);
    else if (region === 'reach') beard = pick(r, ['none', 'short', 'none', 'pointed']);
    else beard = pick(r, ['short', 'none', 'full', 'stubble', 'short']);
    if (age > 55 && beard === 'great') beard = 'long';
  }
  const eyes = col(base.eyes, null) || hl.eyes || pick(r, ['#4a3222', '#4a5a6a', '#3b6ea8', '#4a6a4a', '#6a5a2e']);
  // build
  let build = base.build;
  if (!build) {
    if (age < 13) build = 'child';
    else if (/\bfat\b|glutton|corpulent/.test(t)) build = 'fat';
    else if (/giant|huge|massive|enormous/.test(t)) build = 'huge';
    else if (roles.includes('maester')) build = pick(r, ['slight', 'average', 'lean']);
    else build = female ? pick(r, ['slight', 'slight', 'average']) : pick(r, ['lean', 'average', 'average', 'broad', 'heavy']);
  }
  if (age < 13) build = 'child';
  // garb
  const nw = c.house === 'nights_watch' || /night'?s watch|\bcrow\b|ranger|steward of the watch/i.test(title);
  let garb = base.garb;
  if (roles.includes('maester') || /^maester|grand maester/i.test(c.name || '')) garb = 'maester';
  else if (roles.includes('kingsguard') || /kingsguard/i.test(title)) garb = 'kingsguard';
  else if (nw && garb !== 'maester') garb = 'watch';
  if (!garb) {
    if (/septon|septa|high septon/i.test(title)) garb = 'septon';
    else if (/red priest/i.test(title)) garb = 'red_priest';
    else if (roles.includes('wildling') || region === 'beyond') garb = 'wildling';
    else if (c.house === 'dothraki' || /\bkhal\b|bloodrider/i.test(title)) garb = 'dothraki';
    else if (/city watch|gold cloak/i.test(title)) garb = 'goldcloak';
    else if (roles.includes('sellsword')) garb = pick(r, ['leather', 'mail']);
    else if (female) garb = region === 'dorne' || region === 'essos' ? 'silk' : region === 'beyond' ? 'wildling' : 'gown';
    else if (roles.some((x) => ['knight', 'master_at_arms', 'captain', 'commander'].includes(x))) garb = region === 'north' ? pick(r, ['mail', 'fur']) : pick(r, ['armor', 'mail', 'armor']);
    else garb = REGION_GARB[region] || 'noble';
  }
  // regalia and marks
  const feat = new Set(base.feat || []);
  // a reigning king or queen, not their guards, squires, justices or nicknames
  if (/^(king|queen)\b(?!'s)(?!-beyond)|^the (beggar |)king\b(?!'s)|^(king|queen) (of|in|on)\b/i.test(title) && !/queen of thorns/i.test(title)) feat.add(female ? 'tiara' : 'crown');
  if (/\bkhal\b/i.test(title) && !feat.has('bells')) feat.add('bells');
  if (/^(crown )?prince(ss)?\b/i.test(title) && !feat.has('crown') && !feat.has('tiara') && region !== 'dorne') feat.add('circlet');
  if (/hand of the king/i.test(title)) feat.add('pin_hand');
  if (garb === 'maester' && !feat.has('chain_light')) feat.add('chain_heavy');
  if (age >= 45) feat.add('lined');
  if (age >= 74) feat.add('liverspots');
  if (/scarred/.test(t)) feat.add('scar');
  const skin = feat.has('pale') ? mix(skin0, '#f4ece6', 0.45) : feat.has('weathered') ? mix(skin0, '#b07858', 0.18) : feat.has('sallow') ? mix(skin0, '#c8b890', 0.3) : skin0;
  const hc = houseColours(base.dress ? HOUSE_BY_ID[base.dress] || house : house);
  const expr = /jovial|charming|merry|boisterous|kind|warm|witty|cheerful/.test(t) ? 1 : /stern|cold|grim|cruel|harsh|rigid|dour|ruthless|bitter|brooding|angry/.test(t) ? -1 : 0;
  return { female, age, region, hair, style, beard, eyes, build, garb, feat, skin, expr, ...hc, seed: hash(c.id), bald: style === 'bald' || hair === 'bald' };
}

// ── painting ──
const cache = new Map();
let grain = null;
function grainPattern(ctx) {
  if (!grain) {
    const g = document.createElement('canvas'); g.width = g.height = 96; const x = g.getContext('2d');
    const img = x.createImageData(96, 96); const r = rngFrom(99);
    for (let i = 0; i < img.data.length; i += 4) { const v = 110 + r() * 60; img.data[i] = v; img.data[i + 1] = v * 0.97; img.data[i + 2] = v * 0.9; img.data[i + 3] = 255; }
    x.putImageData(img, 0, 0);
    // canvas weave
    x.globalAlpha = 0.18; x.strokeStyle = '#000';
    for (let i = 0; i < 96; i += 3) { x.beginPath(); x.moveTo(0, i); x.lineTo(96, i + 1); x.stroke(); x.beginPath(); x.moveTo(i, 0); x.lineTo(i + 1, 96); x.stroke(); }
    grain = g;
  }
  return ctx.createPattern(grain, 'repeat');
}

const keyOf = (c, house, size) => `${c.id}|${c.alive}|${c.age}|${house?.id}|${house?.sigil?.f}|${c.title}|${c.status}|${size}|${c.look ? JSON.stringify(c.look) : ''}`;

// Lazy portraits for long lists: a silhouette now, the painting a moment later (painted in idle time,
// a few at a time, so opening a window of 300 people never stalls the game).
const pending = new Map(); let pumping = false;
export function portraitLazy(c, house, size = 128) {
  if (!c) return '';
  const key = keyOf(c, house, size);
  if (cache.has(key)) return cache.get(key);
  const col = house?.sigil?.f && lum(house.sigil.f) < 0.8 ? house.sigil.f : house?.color || '#5a4a3a';
  const ph = `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 154"><!--${key}--><defs><radialGradient id="g" cx="0.45" cy="0.35" r="0.8"><stop offset="0" stop-color="${mix(col, '#1a1612', 0.45)}"/><stop offset="1" stop-color="#0c0a08"/></radialGradient></defs><rect width="128" height="154" fill="url(#g)"/><ellipse cx="64" cy="60" rx="21" ry="28" fill="#000" opacity="0.35"/><path d="M8 156 C14 118 40 104 64 104 C88 104 114 118 120 156Z" fill="#000" opacity="0.35"/></svg>`)}`;
  if (!pending.has(ph)) pending.set(ph, [c, house, size]);
  if (!pumping) { pumping = true; later(pump); }
  return ph;
}
// the map renders every frame, so true idle time is rare: paint ~10 ms' worth per slice, at least every 60 ms
const later = (f) => (window.requestIdleCallback ? requestIdleCallback(f, { timeout: 60 }) : setTimeout(f, 16));
function pump() {
  const done = []; const t0 = performance.now();
  for (const [ph, args] of pending) {
    if (done.length && performance.now() - t0 > 10) break;
    done.push([ph, portraitURL(...args)]); pending.delete(ph);
  }
  if (done.length) { const map = new Map(done); for (const img of document.images) { const u = map.get(img.getAttribute('src')); if (u) img.src = u; } }
  if (pending.size) later(pump); else pumping = false;
}

export function portraitURL(c, house, size = 128) {
  if (!c) return '';
  const key = keyOf(c, house, size);
  if (cache.has(key)) return cache.get(key);
  const k = Math.max(1, Math.min(3, (size * 2) / 128));
  const W = 128, H = 154;
  const cv = document.createElement('canvas'); cv.width = Math.round(W * k); cv.height = Math.round(H * k);
  const ctx = cv.getContext('2d'); ctx.scale(k, k);
  try { paint(ctx, c, house, k); } catch (e) { console.warn('portrait', c.id, e); }
  if (c.alive && /imprisoned|captive|hostage/.test(c.status || '')) { // behind iron bars
    for (let x = 14; x < W; x += 20) { const g = ctx.createLinearGradient(x - 2.5, 0, x + 2.5, 0); g.addColorStop(0, '#1a1a1c'); g.addColorStop(0.4, '#6a6e72'); g.addColorStop(1, '#141416'); ctx.fillStyle = g; ctx.fillRect(x - 2.5, 0, 5, H); }
    ctx.fillStyle = '#2a2a2e'; ctx.fillRect(0, 20, W, 5); ctx.fillRect(0, H - 30, W, 5);
  }
  if (!c.alive) {
    const tmp = document.createElement('canvas'); tmp.width = cv.width; tmp.height = cv.height;
    const t = tmp.getContext('2d'); t.filter = 'grayscale(1) sepia(0.25) brightness(0.72) contrast(1.05)'; t.drawImage(cv, 0, 0);
    ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, cv.width, cv.height); ctx.drawImage(tmp, 0, 0); ctx.scale(k, k);
    // a black mourning ribbon across the corner
    ctx.save(); ctx.translate(W - 26, 0); ctx.rotate(Math.PI / 4); ctx.fillStyle = '#0c0b0a'; ctx.fillRect(-8, 8, 60, 9); ctx.restore();
  }
  const url = cv.toDataURL('image/png');
  cache.set(key, url);
  return url;
}

function paint(ctx, c, house) {
  const L = lookFor(c, house);
  const r = rngFrom(L.seed);
  const W = 128, H = 154, cx = 64;
  const child = L.build === 'child';
  const dwarf = L.feat.has('dwarf');
  // proportions
  const G = {
    cx, top: child ? 36 : 30, eyeY: child ? 67 : 61, noseY: child ? 76 : 73, mouthY: child ? 84 : 81.5, chinY: child ? 93 : 93,
    cw: ({ slight: 19, lean: 19.5, average: 20.5, broad: 21.5, heavy: 22.5, fat: 24.5, huge: 22.5, child: 19.5 })[L.build] || 20.5,
    jw: ({ slight: 12.5, lean: 14, average: 15.5, broad: 17, heavy: 18.5, fat: 21, huge: 18.5, child: 12.5 })[L.build] || 15,
    eyeDx: child ? 9.6 : 10, eyeW: child ? 5.4 : 5, neck: ({ slight: 8, lean: 9, average: 10, broad: 12, heavy: 13, fat: 15, huge: 15, child: 7 })[L.build] || 10,
    shoulder: ({ slight: 44, lean: 50, average: 54, broad: 60, heavy: 60, fat: 62, huge: 66, child: 38 })[L.build] || 54,
  };
  if (L.female) { G.jw -= 1.5; G.cw -= 0.8; G.shoulder -= 5; G.neck -= 1.5; }
  if (L.feat.has('gaunt')) { G.jw -= 1.5; }
  if (dwarf) { G.cw += 2; G.jw += 2.5; G.top -= 2; G.chinY -= 1; G.shoulder -= 12; G.neck -= 1; }
  if (L.feat.has('frog')) { G.jw += 3; G.chinY -= 3; G.mouthY -= 1; }

  background(ctx, L, W, H, r);
  hairBack(ctx, L, G, r);
  body(ctx, L, G, r, W, H);
  neck(ctx, L, G);
  ears(ctx, L, G);
  face(ctx, L, G, r);
  if (L.feat.has('burned')) burn(ctx, L, G, r);
  if (L.feat.has('greyscale')) greyscale(ctx, G, r);
  eyes(ctx, L, G, r);
  brows(ctx, L, G);
  nose(ctx, L, G);
  mouth(ctx, L, G);
  beard(ctx, L, G, r);
  hairFront(ctx, L, G, r);
  regalia(ctx, L, G, r);
  finish(ctx, L, W, H);
}

function background(ctx, L, W, H, r) {
  const base = mix(L.main, '#1a1612', 0.55);
  const g = ctx.createRadialGradient(46, 48, 6, 64, 70, 120);
  g.addColorStop(0, shade(base, 0.18)); g.addColorStop(0.55, shade(base, -0.35)); g.addColorStop(1, shade(base, -0.78));
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  // loose brushwork
  ctx.save(); ctx.globalAlpha = 0.07; ctx.lineCap = 'round';
  for (let i = 0; i < 26; i++) {
    ctx.strokeStyle = r() < 0.5 ? '#000' : shade(base, 0.35); ctx.lineWidth = 6 + r() * 14;
    const x = r() * W, y = r() * H; ctx.beginPath(); ctx.moveTo(x, y); ctx.quadraticCurveTo(x + 20 * (r() - 0.5), y + 12, x + 30 * (r() - 0.5), y + 30 * (r() - 0.2)); ctx.stroke();
  }
  ctx.restore();
  // warm light behind the sitter's head
  const halo = ctx.createRadialGradient(56, 54, 4, 60, 58, 60);
  halo.addColorStop(0, 'rgba(255,226,180,0.16)'); halo.addColorStop(1, 'rgba(255,226,180,0)');
  ctx.fillStyle = halo; ctx.fillRect(0, 0, W, H);
}

function facePath(ctx, G, pad = 0) {
  const { cx, top, eyeY, chinY } = G; const cw = G.cw + pad, jw = G.jw + pad;
  ctx.beginPath();
  ctx.moveTo(cx, top - pad);
  ctx.bezierCurveTo(cx + cw * 0.78, top - pad, cx + cw, top + 12, cx + cw, eyeY - 4);
  ctx.bezierCurveTo(cx + cw + 0.4, eyeY + 7, cx + jw + 3.5, chinY - 15, cx + jw, chinY - 8);
  ctx.bezierCurveTo(cx + jw - 3, chinY - 2.5, cx + 6.5, chinY + pad, cx, chinY + pad);
  ctx.bezierCurveTo(cx - 6.5, chinY + pad, cx - jw + 3, chinY - 2.5, cx - jw, chinY - 8);
  ctx.bezierCurveTo(cx - jw - 3.5, chinY - 15, cx - cw - 0.4, eyeY + 7, cx - cw, eyeY - 4);
  ctx.bezierCurveTo(cx - cw, top + 12, cx - cw * 0.78, top - pad, cx, top - pad);
  ctx.closePath();
}
function soft(ctx, px, fn) { ctx.save(); ctx.filter = `blur(${px}px)`; fn(); ctx.restore(); }
function blob(ctx, x, y, rx, ry, fill, rot = 0) { ctx.fillStyle = fill; ctx.beginPath(); ctx.ellipse(x, y, rx, ry, rot, 0, Math.PI * 2); ctx.fill(); }

// ── hair ──
function strands(ctx, L, x0, y0, x1, y1, n, r, spread, curl = 0, width = 0.7) {
  const light = shade(L.hair, 0.28), dark = shade(L.hair, -0.4);
  ctx.lineCap = 'round';
  for (let i = 0; i < n; i++) {
    const t = i / n; const sx = x0 + (x1 - x0) * t + (r() - 0.5) * spread, sy = y0 + (y1 - y0) * t + (r() - 0.5) * spread;
    const len = 6 + r() * 14; const ang = Math.PI / 2 + (r() - 0.5) * 0.6;
    ctx.strokeStyle = r() < 0.5 ? rgba(light, 0.35) : rgba(dark, 0.45); ctx.lineWidth = width * (0.6 + r() * 0.8);
    ctx.beginPath(); ctx.moveTo(sx, sy);
    ctx.quadraticCurveTo(sx + Math.cos(ang) * len * 0.5 + curl * (r() - 0.5) * 6, sy + Math.sin(ang) * len * 0.5, sx + Math.cos(ang) * len, sy + Math.sin(ang) * len);
    ctx.stroke();
  }
}
function textureHair(ctx, L, r, box, dir = 'down', density = 1) {
  // fill a clipped hair region with directional strands and a sheen
  const [x0, y0, x1, y1] = box; const light = shade(L.hair, 0.3), dark = shade(L.hair, -0.45);
  const curly = L.style === 'curls' || L.style === 'wild';
  ctx.lineCap = 'round';
  const n = Math.round((x1 - x0) * (y1 - y0) / 14 * density);
  for (let i = 0; i < n; i++) {
    const x = x0 + r() * (x1 - x0), y = y0 + r() * (y1 - y0);
    ctx.strokeStyle = r() < 0.45 ? rgba(light, 0.28) : rgba(dark, 0.4); ctx.lineWidth = 0.35 + r() * 0.6;
    ctx.beginPath();
    if (curly) { ctx.arc(x, y, 1.2 + r() * 2.2, r() * 6, r() * 6 + 3.5); }
    else if (dir === 'down') { const l = 5 + r() * 12; ctx.moveTo(x, y); ctx.quadraticCurveTo(x + (r() - 0.5) * 3, y + l / 2, x + (x - 64) * 0.08, y + l); }
    else { const l = 4 + r() * 8; const a = Math.atan2(y - 40, x - 64); ctx.moveTo(x, y); ctx.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l); }
    ctx.stroke();
  }
  // sheen
  soft(ctx, 3, () => { ctx.globalAlpha = L.feat.has('wet_hair') ? 0.45 : 0.22; blob(ctx, 52, 36, 16, 5, light, -0.35); });
}
function hairBack(ctx, L, G, r) {
  if (L.bald) return;
  const { cx, top, eyeY } = G; const long = ['long', 'waves', 'wild', 'lank'].includes(L.style); const braid = L.style === 'braid';
  if (!long && !braid && L.style !== 'medium' && L.style !== 'curls' && L.style !== 'updo') return;
  ctx.save();
  const w = G.cw + (L.style === 'waves' || L.style === 'wild' ? 9 : 5);
  const bottom = L.style === 'medium' || L.style === 'curls' ? eyeY + 30 : L.style === 'updo' ? eyeY + 12 : braid ? eyeY + 34 : 136;
  ctx.fillStyle = shade(L.hair, -0.25);
  ctx.beginPath(); ctx.moveTo(cx - w, eyeY - 6);
  ctx.bezierCurveTo(cx - w - 2, top - 8, cx + w + 2, top - 8, cx + w, eyeY - 6);
  if (L.style === 'wild') { for (let y = eyeY; y < bottom; y += 7) ctx.lineTo(cx + w + 3 + r() * 6, y); }
  ctx.bezierCurveTo(cx + w + 4, eyeY + 30, cx + w + 6, bottom - 10, cx + w - 2, bottom);
  ctx.lineTo(cx - w + 2, bottom);
  ctx.bezierCurveTo(cx - w - 6, bottom - 10, cx - w - 4, eyeY + 30, cx - w, eyeY - 6);
  ctx.closePath(); ctx.fill();
  ctx.clip();
  textureHair(ctx, L, r, [cx - w - 8, top - 8, cx + w + 8, bottom], 'down', 0.8);
  // shadow where the head sits against the hair
  soft(ctx, 5, () => { blob(ctx, cx + 4, eyeY + 18, G.cw + 2, 26, 'rgba(0,0,0,0.35)'); });
  ctx.restore();
}
function hairFront(ctx, L, G, r) {
  const { cx, top, eyeY, cw } = G; const s = L.style;
  if (L.bald || s === 'bald') { scalp(ctx, L, G); return; }
  if (s === 'fringe') { // bald crown, hair round the sides and back
    scalp(ctx, L, G);
    ctx.save(); ctx.fillStyle = L.hair;
    for (const d of [-1, 1]) { ctx.beginPath(); ctx.moveTo(cx + d * (cw - 3), eyeY - 14); ctx.quadraticCurveTo(cx + d * (cw + 3), eyeY - 10, cx + d * (cw + 2), eyeY + 4); ctx.lineTo(cx + d * (cw - 1), eyeY + 3); ctx.quadraticCurveTo(cx + d * (cw - 2), eyeY - 6, cx + d * (cw - 3), eyeY - 14); ctx.fill(); }
    ctx.restore(); return;
  }
  const cropped = s === 'cropped' || s === 'shaved';
  const hairline = s === 'receding' ? top + 16 : cropped ? top + 11 : top + 12.5;
  const lift = cropped ? 1.5 : s === 'curls' || s === 'wild' ? 6 : s === 'updo' ? 5 : 3.5;
  const sideDrop = cropped ? eyeY - 5 : s === 'short' || s === 'receding' ? eyeY - 1 : s === 'curls' ? eyeY + 6 : s === 'updo' ? eyeY - 3 : eyeY + 22;
  const outW = cropped ? cw + 1 : cw + (s === 'curls' || s === 'wild' ? 5 : 3);
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(cx - outW, sideDrop);
  ctx.bezierCurveTo(cx - outW - 2, top - lift - 4, cx - cw * 0.4, top - lift - 1, cx, top - lift);
  ctx.bezierCurveTo(cx + cw * 0.4, top - lift - 1, cx + outW + 2, top - lift - 4, cx + outW, sideDrop);
  // inner edge: temple, hairline across the forehead
  ctx.lineTo(cx + cw - (s === 'long' || s === 'waves' || s === 'lank' || s === 'wild' ? 3 : 1), sideDrop);
  if (s === 'receding') { ctx.quadraticCurveTo(cx + cw - 1, top + 8, cx + cw - 6, top + 9); ctx.quadraticCurveTo(cx + 8, hairline + 2, cx, hairline - 2); ctx.quadraticCurveTo(cx - 8, hairline + 2, cx - cw + 6, top + 9); ctx.quadraticCurveTo(cx - cw + 1, top + 8, cx - cw + 1, sideDrop); }
  else if (L.feat.has('widows_peak')) { ctx.quadraticCurveTo(cx + cw - 2, top + 6, cx + 10, hairline - 2); ctx.lineTo(cx, hairline + 4); ctx.lineTo(cx - 10, hairline - 2); ctx.quadraticCurveTo(cx - cw + 2, top + 6, cx - cw + 1, sideDrop); }
  else if (s === 'long' || s === 'waves' || s === 'lank' || s === 'wild' || s === 'braid' || s === 'updo') {
    // parted, falling away from the face
    const part = cx - 5 + (L.seed % 7);
    ctx.quadraticCurveTo(cx + cw - 3, top + 16, cx + cw * 0.55, hairline); ctx.quadraticCurveTo(part + 6, top + 4, part, top + 3); ctx.quadraticCurveTo(part - 6, top + 4, cx - cw * 0.55, hairline); ctx.quadraticCurveTo(cx - cw + 3, top + 16, cx - cw + 1, sideDrop);
  } else { ctx.quadraticCurveTo(cx + cw - 1, top + 12, cx + cw * 0.5, hairline); ctx.quadraticCurveTo(cx, hairline - 3.5, cx - cw * 0.5, hairline); ctx.quadraticCurveTo(cx - cw + 1, top + 12, cx - cw + 1, sideDrop); }
  ctx.closePath();
  if (cropped) { ctx.fillStyle = rgba(L.hair, 0.78); ctx.fill(); ctx.clip(); ctx.fillStyle = rgba(shade(L.hair, -0.4), 0.5); for (let i = 0; i < 420; i++) ctx.fillRect(cx - cw - 2 + r() * (cw * 2 + 4), top - 3 + r() * 30, 0.5, 0.5); ctx.restore(); return; }
  const g = ctx.createLinearGradient(cx - cw, top, cx + cw, eyeY);
  g.addColorStop(0, shade(L.hair, 0.12)); g.addColorStop(1, shade(L.hair, -0.3));
  ctx.fillStyle = g; ctx.fill();
  ctx.save(); ctx.clip(); textureHair(ctx, L, r, [cx - outW - 4, top - lift - 6, cx + outW + 4, sideDrop + 4], s === 'curls' || s === 'wild' ? 'curl' : 'down', 1.1); ctx.restore();
  // bumpy crown for curls
  if (s === 'curls' || s === 'wild') {
    ctx.save(); ctx.globalAlpha = 0.85;
    for (let i = 0; i < 26; i++) { const a = Math.PI * (1.02 + r() * 0.96); const rr = 0.72 + r() * 0.3; const x = cx + Math.cos(a) * (outW - 2) * rr, y = top + 10 + Math.sin(a) * (14 + lift) * rr; const k = 2 + r() * 2.2; ctx.strokeStyle = rgba(shade(L.hair, r() < 0.5 ? 0.25 : -0.35), 0.55); ctx.lineWidth = 0.8; ctx.beginPath(); ctx.arc(x, y, k, r() * 3, r() * 3 + 4); ctx.stroke(); }
    ctx.restore();
  }
  // soft shadow the hair casts on the forehead
  ctx.restore();
  ctx.save(); facePath(ctx, G); ctx.clip();
  soft(ctx, 2.5, () => { ctx.fillStyle = 'rgba(40,20,10,0.22)'; ctx.fillRect(cx - cw, hairline - 1, cw * 2, 4); });
  ctx.restore();
  if (s === 'updo') { // a knot of hair high at the back
    ctx.save(); blob(ctx, cx + 2, top - 5, 13, 8, shade(L.hair, -0.1)); ctx.beginPath(); ctx.ellipse(cx + 2, top - 5, 13, 8, 0, 0, Math.PI * 2); ctx.clip(); textureHair(ctx, L, r, [cx - 12, top - 14, cx + 16, top + 4], 'curl', 1); ctx.restore();
  }
  if (s === 'braid') braidOver(ctx, L, G, r);
}
function braidOver(ctx, L, G, r) {
  const d = L.female ? 1 : -1; const x0 = G.cx + d * (G.cw - 1), y0 = G.eyeY + 14;
  for (let i = 0; i < 10; i++) {
    const x = x0 + d * (i * 1.2), y = y0 + i * 6.2; const k = i % 2 ? 1 : -1;
    ctx.fillStyle = shade(L.hair, i % 2 ? -0.05 : 0.08); ctx.beginPath(); ctx.ellipse(x + k * 1.3, y, 4 - i * 0.12, 4.2, k * 0.6, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = rgba(shade(L.hair, -0.5), 0.6); ctx.lineWidth = 0.5; ctx.stroke();
    if (L.feat.has('bells') && i % 3 === 2) { blob(ctx, x - k * 3.5, y, 1.6, 1.6, '#d8b44a'); }
  }
}
function scalp(ctx, L, G) {
  ctx.save(); facePath(ctx, G); ctx.clip();
  soft(ctx, 3, () => { blob(ctx, G.cx - 6, G.top + 7, 10, 5, 'rgba(255,245,230,0.35)', -0.3); });
  ctx.restore();
}

// ── body and garb ──
function shouldersPath(ctx, G, H, extra = 0) {
  const { cx } = G; const s = G.shoulder + extra; const y = G.chinY + 9;
  ctx.beginPath();
  ctx.moveTo(cx - s - 12, H + 2);
  ctx.bezierCurveTo(cx - s - 10, y + 26, cx - s + 2, y + 10, cx - G.neck - 6, y + 2);
  ctx.lineTo(cx + G.neck + 6, y + 2);
  ctx.bezierCurveTo(cx + s - 2, y + 10, cx + s + 10, y + 26, cx + s + 12, H + 2);
  ctx.closePath();
}
function body(ctx, L, G, r, W, H) {
  const { cx } = G; const y = G.chinY + 9; const g = L.garb;
  const cloth = {
    noble: L.main, fur: shade(L.main, -0.35), armor: '#8e959d', mail: '#6e747a', maester: '#6d6a64', kingsguard: '#ecebe6', watch: '#17171a',
    silk: L.main, dothraki: L.skin, iron: '#3a3c3e', gown: L.main, septon: '#d8d4ca', red_priest: '#8e1812', wildling: '#5a4a3a', leather: '#5a3e28',
    drowned: '#4a5a5a', smith: '#5a3e28', plain: '#6a5e50', goldcloak: '#2a2a2c', sworn: '#6e747a',
  }[g] || L.main;
  // base torso
  shouldersPath(ctx, G, H);
  const tg = ctx.createLinearGradient(cx - G.shoulder, y, cx + G.shoulder, H);
  tg.addColorStop(0, shade(cloth, 0.14)); tg.addColorStop(0.55, cloth); tg.addColorStop(1, shade(cloth, -0.45));
  ctx.fillStyle = tg; ctx.fill();
  ctx.save(); shouldersPath(ctx, G, H); ctx.clip();
  if (g === 'mail' || g === 'sworn' || g === 'goldcloak' || g === 'iron') mailTexture(ctx, G, H, g === 'iron' ? '#55585a' : '#8a9096');
  if (g === 'armor' || g === 'kingsguard') plate(ctx, L, G, H, g === 'kingsguard');
  if (g === 'noble' || g === 'silk') doublet(ctx, L, G, H, g === 'silk');
  if (g === 'gown') gown(ctx, L, G, H);
  if (g === 'maester') robe(ctx, G, H, '#6d6a64', true);
  if (g === 'septon') robe(ctx, G, H, '#d8d4ca', false);
  if (g === 'red_priest') robe(ctx, G, H, '#8e1812', false);
  if (g === 'drowned') robe(ctx, G, H, '#4a5a5a', false);
  if (g === 'dothraki') dothraki(ctx, L, G, H);
  if (g === 'leather' || g === 'smith' || g === 'plain') tunic(ctx, L, G, H, cloth, g === 'smith');
  // cloaks and mantles on top
  if (g === 'fur' || g === 'wildling' || g === 'watch') furMantle(ctx, L, G, H, r, g === 'watch' ? '#1e1d1f' : g === 'wildling' ? '#6a5a48' : '#5e5448');
  if (g === 'kingsguard') cloak(ctx, G, H, '#f2f1ec', '#d8d4ca');
  if (g === 'goldcloak') cloak(ctx, G, H, '#c9a23a', '#8a6a1a');
  if (g === 'armor' || g === 'mail' || g === 'sworn') cloak(ctx, G, H, shade(L.main, -0.1), shade(L.main, -0.45), true);
  if (g === 'iron') cloak(ctx, G, H, '#2a2d30', '#141618', true);
  // light falls off down the chest
  const fall = ctx.createLinearGradient(0, y, 0, H); fall.addColorStop(0, 'rgba(0,0,0,0)'); fall.addColorStop(1, 'rgba(0,0,0,0.35)');
  ctx.fillStyle = fall; ctx.fillRect(0, y, W, H - y);
  ctx.restore();
}
function mailTexture(ctx, G, H, tone) {
  ctx.strokeStyle = rgba(tone, 0.5); ctx.lineWidth = 0.55;
  for (let yy = G.chinY + 8; yy < H; yy += 2.4) for (let xx = (yy * 7) % 2.6; xx < 128; xx += 2.6) { ctx.beginPath(); ctx.arc(xx, yy, 1.2, 0, Math.PI); ctx.stroke(); }
}
function plate(ctx, L, G, H, white) {
  const { cx } = G; const y = G.chinY + 9; const steel = white ? '#f1f0ea' : '#9aa2aa';
  for (const d of [-1, 1]) { // pauldrons
    const g = ctx.createRadialGradient(cx + d * (G.shoulder - 10) - 4, y + 10, 2, cx + d * (G.shoulder - 8), y + 18, 22);
    g.addColorStop(0, shade(steel, 0.5)); g.addColorStop(0.5, steel); g.addColorStop(1, shade(steel, -0.55));
    ctx.fillStyle = g; ctx.beginPath(); ctx.ellipse(cx + d * (G.shoulder - 8), y + 18, 20, 13, d * 0.35, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = rgba(white ? '#c9a44a' : '#2a2c2e', 0.7); ctx.lineWidth = 0.9; ctx.beginPath(); ctx.ellipse(cx + d * (G.shoulder - 8), y + 18, 16, 10, d * 0.35, Math.PI * (d > 0 ? 1.1 : -0.1), Math.PI * (d > 0 ? 1.9 : 0.9)); ctx.stroke();
    for (let i = 0; i < 3; i++) blob(ctx, cx + d * (G.shoulder - 20 + i * 6), y + 10 + i * 2, 0.9, 0.9, shade(steel, 0.6));
  }
  // gorget and breastplate
  const bp = ctx.createLinearGradient(cx - 24, y, cx + 24, H);
  bp.addColorStop(0, shade(steel, 0.35)); bp.addColorStop(0.45, steel); bp.addColorStop(1, shade(steel, -0.5));
  ctx.fillStyle = bp; ctx.beginPath(); ctx.moveTo(cx - G.neck - 7, y + 1); ctx.quadraticCurveTo(cx, y + 12, cx + G.neck + 7, y + 1); ctx.lineTo(cx + 26, H); ctx.lineTo(cx - 26, H); ctx.closePath(); ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.35)'; ctx.lineWidth = 0.8; ctx.beginPath(); ctx.moveTo(cx - 4, y + 12); ctx.lineTo(cx - 6, H); ctx.stroke();
  if (!white) { // surcoat panel in house colours
    ctx.fillStyle = L.main; ctx.beginPath(); ctx.moveTo(cx - 13, y + 18); ctx.lineTo(cx + 13, y + 18); ctx.lineTo(cx + 16, H); ctx.lineTo(cx - 16, H); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = L.trim; ctx.lineWidth = 1.2; ctx.stroke();
  } else { ctx.strokeStyle = '#c9a44a'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(cx - G.neck - 7, y + 1); ctx.quadraticCurveTo(cx, y + 12, cx + G.neck + 7, y + 1); ctx.stroke(); }
}
function doublet(ctx, L, G, H, silk) {
  const { cx } = G; const y = G.chinY + 9;
  if (silk) { // open neck, draped folds, a sheen
    ctx.fillStyle = L.skin; ctx.beginPath(); ctx.moveTo(cx - G.neck - 2, y); ctx.lineTo(cx, y + 26); ctx.lineTo(cx + G.neck + 2, y); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = rgba(shade(L.main, 0.5), 0.35); ctx.lineWidth = 2;
    for (let i = 0; i < 6; i++) { ctx.beginPath(); ctx.moveTo(cx - 40 + i * 16, y + 14); ctx.quadraticCurveTo(cx - 36 + i * 16, y + 30, cx - 44 + i * 17, 154); ctx.stroke(); }
    ctx.strokeStyle = L.trim; ctx.lineWidth = 1.6; ctx.beginPath(); ctx.moveTo(cx - G.neck - 3, y); ctx.lineTo(cx, y + 27); ctx.lineTo(cx + G.neck + 3, y); ctx.stroke();
    return;
  }
  // high collar and trim down the front, buttons
  ctx.fillStyle = shade(L.main, -0.25); ctx.beginPath(); ctx.moveTo(cx - G.neck - 5, y - 4); ctx.lineTo(cx - G.neck - 2, y + 6); ctx.lineTo(cx + G.neck + 2, y + 6); ctx.lineTo(cx + G.neck + 5, y - 4); ctx.quadraticCurveTo(cx, y + 2, cx - G.neck - 5, y - 4); ctx.fill();
  ctx.strokeStyle = L.trim; ctx.lineWidth = 1.3; ctx.beginPath(); ctx.moveTo(cx, y + 5); ctx.lineTo(cx, 154); ctx.stroke();
  for (let yy = y + 11; yy < 150; yy += 8) blob(ctx, cx, yy, 1.4, 1.4, L.metal);
  ctx.strokeStyle = rgba(L.trim, 0.8); ctx.lineWidth = 1.1; ctx.beginPath(); ctx.moveTo(cx - G.neck - 5, y - 4); ctx.quadraticCurveTo(cx, y + 2, cx + G.neck + 5, y - 4); ctx.stroke();
  cloak(ctx, G, 154, shade(L.main, -0.3), shade(L.main, -0.6), true, L.metal);
}
function gown(ctx, L, G, H) {
  const { cx } = G; const y = G.chinY + 9;
  // square neckline showing the collarbones
  ctx.fillStyle = L.skin; ctx.beginPath(); ctx.moveTo(cx - G.neck - 12, y + 1); ctx.lineTo(cx - 16, y + 20); ctx.quadraticCurveTo(cx, y + 24, cx + 16, y + 20); ctx.lineTo(cx + G.neck + 12, y + 1); ctx.closePath(); ctx.fill();
  soft(ctx, 1.5, () => { ctx.strokeStyle = rgba(shade(L.skin, -0.35), 0.5); ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(cx - 14, y + 7); ctx.quadraticCurveTo(cx - 7, y + 9, cx - 3, y + 7); ctx.moveTo(cx + 14, y + 7); ctx.quadraticCurveTo(cx + 7, y + 9, cx + 3, y + 7); ctx.stroke(); });
  ctx.strokeStyle = L.metal; ctx.lineWidth = 1.6; ctx.beginPath(); ctx.moveTo(cx - G.neck - 12, y + 1); ctx.lineTo(cx - 16, y + 20); ctx.quadraticCurveTo(cx, y + 24, cx + 16, y + 20); ctx.lineTo(cx + G.neck + 12, y + 1); ctx.stroke();
  // embroidered band
  ctx.strokeStyle = rgba(L.trim, 0.8); ctx.lineWidth = 0.8; ctx.setLineDash([1.5, 1.5]); ctx.beginPath(); ctx.moveTo(cx - 17, y + 24); ctx.quadraticCurveTo(cx, y + 28, cx + 17, y + 24); ctx.stroke(); ctx.setLineDash([]);
  // a pendant
  ctx.strokeStyle = rgba(L.metal, 0.9); ctx.lineWidth = 0.6; ctx.beginPath(); ctx.moveTo(cx - 8, y + 2); ctx.quadraticCurveTo(cx, y + 13, cx + 8, y + 2); ctx.stroke();
  blob(ctx, cx, y + 13, 1.8, 2.2, L.female && L.trim && sat(L.trim) > 0.3 ? L.trim : '#7a1a2a');
}
function robe(ctx, G, H, tone, hood) {
  const { cx } = G; const y = G.chinY + 9;
  ctx.strokeStyle = rgba(shade(tone, -0.4), 0.55); ctx.lineWidth = 1.4;
  for (let i = -3; i <= 3; i++) { ctx.beginPath(); ctx.moveTo(cx + i * 9, y + 12); ctx.quadraticCurveTo(cx + i * 11, y + 30, cx + i * 13, H); ctx.stroke(); }
  if (hood) { ctx.fillStyle = shade(tone, -0.2); ctx.beginPath(); ctx.moveTo(cx - G.neck - 10, y - 2); ctx.quadraticCurveTo(cx, y + 16, cx + G.neck + 10, y - 2); ctx.quadraticCurveTo(cx, y + 8, cx - G.neck - 10, y - 2); ctx.fill(); }
}
function tunic(ctx, L, G, H, tone, apron) {
  const { cx } = G; const y = G.chinY + 9;
  ctx.fillStyle = shade(tone, -0.25); ctx.beginPath(); ctx.moveTo(cx - G.neck - 4, y); ctx.lineTo(cx, y + 12); ctx.lineTo(cx + G.neck + 4, y); ctx.closePath(); ctx.fill();
  ctx.strokeStyle = rgba(shade(tone, 0.3), 0.4); ctx.lineWidth = 0.8; ctx.beginPath(); ctx.moveTo(cx - 3, y + 12); ctx.lineTo(cx - 5, H); ctx.stroke();
  if (apron) { ctx.fillStyle = '#3e2a1a'; ctx.fillRect(cx - 18, y + 16, 36, H - y); ctx.strokeStyle = '#2a1a0e'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(cx - 18, y + 16); ctx.lineTo(cx - G.neck, y); ctx.moveTo(cx + 18, y + 16); ctx.lineTo(cx + G.neck, y); ctx.stroke(); }
}
function dothraki(ctx, L, G, H) {
  const { cx } = G; const y = G.chinY + 9;
  // bare chest under a painted vest
  soft(ctx, 2, () => { ctx.strokeStyle = rgba(shade(L.skin, -0.35), 0.6); ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(cx - 20, y + 22); ctx.quadraticCurveTo(cx - 8, y + 28, cx, y + 22); ctx.quadraticCurveTo(cx + 8, y + 28, cx + 20, y + 22); ctx.stroke(); });
  ctx.fillStyle = '#4a2e1a';
  for (const d of [-1, 1]) { ctx.beginPath(); ctx.moveTo(cx + d * (G.neck + 5), y); ctx.lineTo(cx + d * (G.shoulder + 10), y + 20); ctx.lineTo(cx + d * (G.shoulder + 14), H); ctx.lineTo(cx + d * 16, H); ctx.quadraticCurveTo(cx + d * 12, y + 20, cx + d * (G.neck + 5), y); ctx.fill(); }
  ctx.strokeStyle = '#c9a44a'; ctx.lineWidth = 0.9; ctx.setLineDash([2, 2]);
  for (const d of [-1, 1]) { ctx.beginPath(); ctx.moveTo(cx + d * (G.neck + 5), y); ctx.quadraticCurveTo(cx + d * 12, y + 20, cx + d * 16, H); ctx.stroke(); }
  ctx.setLineDash([]);
}
function furMantle(ctx, L, G, H, r, tone) {
  const { cx } = G; const y = G.chinY + 9;
  // cloak beneath, then a heavy ruff of fur over the shoulders
  cloak(ctx, G, H, L.garb === 'watch' ? '#141416' : shade(L.main, -0.35), '#0e0e10', false);
  const light = shade(tone, 0.35), dark = shade(tone, -0.5);
  ctx.save();
  ctx.beginPath(); ctx.moveTo(cx - G.shoulder - 12, y + 30); ctx.bezierCurveTo(cx - G.shoulder, y - 2, cx - G.neck - 12, y - 6, cx, y + 6); ctx.bezierCurveTo(cx + G.neck + 12, y - 6, cx + G.shoulder, y - 2, cx + G.shoulder + 12, y + 30);
  ctx.bezierCurveTo(cx + G.shoulder - 6, y + 22, cx + 18, y + 20, cx, y + 26); ctx.bezierCurveTo(cx - 18, y + 20, cx - G.shoulder + 6, y + 22, cx - G.shoulder - 12, y + 30); ctx.closePath();
  const fg = ctx.createLinearGradient(0, y - 6, 0, y + 30); fg.addColorStop(0, shade(tone, 0.12)); fg.addColorStop(1, shade(tone, -0.35));
  ctx.fillStyle = fg; ctx.fill(); ctx.clip();
  ctx.lineCap = 'round';
  for (let i = 0; i < 520; i++) {
    const x = cx - G.shoulder - 12 + r() * (G.shoulder * 2 + 24), yy = y - 6 + r() * 36; const a = Math.atan2(yy - (y - 20), x - cx) + (r() - 0.5) * 0.8; const l = 2 + r() * 4;
    ctx.strokeStyle = r() < 0.5 ? rgba(light, 0.45) : rgba(dark, 0.5); ctx.lineWidth = 0.35 + r() * 0.5;
    ctx.beginPath(); ctx.moveTo(x, yy); ctx.lineTo(x + Math.cos(a) * l, yy + Math.sin(a) * l); ctx.stroke();
  }
  ctx.restore();
}
function cloak(ctx, G, H, tone, dark, clasp = false, metal = '#caa24a') {
  const { cx } = G; const y = G.chinY + 9;
  for (const d of [-1, 1]) {
    const g = ctx.createLinearGradient(cx + d * 10, y, cx + d * (G.shoulder + 12), H);
    g.addColorStop(0, tone); g.addColorStop(1, dark);
    ctx.fillStyle = g; ctx.beginPath(); ctx.moveTo(cx + d * (G.neck + 4), y); ctx.bezierCurveTo(cx + d * (G.shoulder - 4), y + 4, cx + d * (G.shoulder + 10), y + 26, cx + d * (G.shoulder + 14), H + 2);
    ctx.lineTo(cx + d * (G.shoulder - 10), H + 2); ctx.bezierCurveTo(cx + d * (G.shoulder - 14), y + 34, cx + d * 22, y + 16, cx + d * (G.neck + 4), y); ctx.fill();
  }
  if (clasp) { const g = ctx.createRadialGradient(cx - G.neck - 7, y + 5, 0.5, cx - G.neck - 6, y + 6, 4); g.addColorStop(0, shade(metal, 0.6)); g.addColorStop(1, shade(metal, -0.4)); ctx.fillStyle = g; ctx.beginPath(); ctx.arc(cx - G.neck - 6, y + 6, 3.4, 0, Math.PI * 2); ctx.fill(); }
}
function neck(ctx, L, G) {
  const { cx, chinY } = G; const n = G.neck;
  ctx.fillStyle = shade(L.skin, -0.1);
  ctx.beginPath(); ctx.moveTo(cx - n, chinY - 14); ctx.lineTo(cx - n - 1, chinY + 12); ctx.quadraticCurveTo(cx, chinY + 16, cx + n + 1, chinY + 12); ctx.lineTo(cx + n, chinY - 14); ctx.closePath(); ctx.fill();
  soft(ctx, 3, () => { blob(ctx, cx + 2, chinY + 1, n + 2, 6, rgba(shade(L.skin, -0.6), 0.55)); blob(ctx, cx + n, chinY + 6, 3, 10, rgba(shade(L.skin, -0.5), 0.35)); });
  if (!L.female && !['child'].includes(L.build) && L.beard !== 'great' && L.beard !== 'long') { soft(ctx, 1, () => { blob(ctx, cx + 0.5, chinY + 6, 1.8, 2.4, rgba(shade(L.skin, -0.3), 0.4)); }); }
}
function ears(ctx, L, G) {
  const big = L.feat.has('big_ears') ? 1.3 : 1;
  for (const d of [-1, 1]) {
    const x = G.cx + d * (G.cw - 0.5), y = G.eyeY + 3;
    if (L.feat.has('burned') && d > 0) continue;
    ctx.fillStyle = shade(L.skin, d > 0 ? -0.18 : -0.05); ctx.beginPath(); ctx.ellipse(x + d * 1.5, y, 3.6 * big, 7.4 * big, d * 0.15, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = rgba(shade(L.skin, -0.45), 0.6); ctx.lineWidth = 0.7; ctx.beginPath(); ctx.ellipse(x + d * 2, y - 0.5, 2 * big, 5 * big, d * 0.15, -Math.PI / 2, Math.PI / 2 * (d > 0 ? 1 : -1), d < 0); ctx.stroke();
  }
}
function face(ctx, L, G, r) {
  const { cx, top, eyeY, noseY, mouthY, chinY, cw, jw } = G;
  facePath(ctx, G); ctx.fillStyle = L.skin; ctx.fill();
  ctx.save(); facePath(ctx, G); ctx.clip();
  // form shadow: light from the upper left
  const side = ctx.createLinearGradient(cx - cw, 0, cx + cw, 0);
  side.addColorStop(0, rgba('#fff4e6', 0.16)); side.addColorStop(0.45, 'rgba(0,0,0,0)'); side.addColorStop(1, rgba(shade(L.skin, -0.6), 0.5));
  ctx.fillStyle = side; ctx.fillRect(cx - cw - 2, top - 2, cw * 2 + 4, chinY - top + 4);
  soft(ctx, 4, () => {
    blob(ctx, cx + cw * 0.9, eyeY + 8, 7, 22, rgba(shade(L.skin, -0.6), 0.35));
    blob(ctx, cx - 6, top + 12, 12, 7, 'rgba(255,246,232,0.28)', -0.2); // forehead light
    blob(ctx, cx - cw * 0.55, eyeY + 9, 5, 3.5, 'rgba(255,240,225,0.22)'); // cheekbone
    blob(ctx, cx, chinY - 3, 6, 3, 'rgba(255,240,225,0.15)');
    // sockets
    for (const d of [-1, 1]) blob(ctx, cx + d * G.eyeDx, eyeY - 1, G.eyeW + 2.5, 4.2, rgba(shade(L.skin, -0.55), d > 0 ? 0.42 : 0.3));
    // under the jaw line
    blob(ctx, cx, chinY + 2, jw + 2, 4, rgba(shade(L.skin, -0.6), 0.45));
    // cheeks
    const blush = L.feat.has('rouge') ? 0.28 : L.female ? 0.16 : 0.1;
    for (const d of [-1, 1]) blob(ctx, cx + d * 11.5, mouthY - 6, 6, 4, rgba('#c0504a', blush));
    if (L.feat.has('rouge')) blob(ctx, cx, noseY - 1, 3, 3, 'rgba(190,70,60,0.25)');
    if (L.feat.has('gaunt') || L.build === 'lean' && L.age > 40) for (const d of [-1, 1]) blob(ctx, cx + d * (cw - 4.5), mouthY - 5, 2.5, 6, rgba(shade(L.skin, -0.55), 0.45));
  });
  // age
  if (L.feat.has('lined') || L.age >= 45) {
    const a = Math.min(1, (L.age - 35) / 40) * (L.feat.has('weathered') ? 1.3 : 1);
    ctx.strokeStyle = rgba(shade(L.skin, -0.5), 0.35 * a); ctx.lineWidth = 0.6;
    for (let i = 0; i < 3; i++) { ctx.beginPath(); ctx.moveTo(cx - 9 + i, top + 12 + i * 2.6); ctx.quadraticCurveTo(cx, top + 10.5 + i * 2.6, cx + 9 - i, top + 12 + i * 2.6); ctx.stroke(); }
    for (const d of [-1, 1]) {
      ctx.beginPath(); ctx.moveTo(cx + d * 4.5, noseY - 1); ctx.quadraticCurveTo(cx + d * 8.5, mouthY - 3, cx + d * 8, mouthY + 2.5); ctx.stroke(); // nasolabial
      for (let k = 0; k < 3; k++) { ctx.beginPath(); ctx.moveTo(cx + d * (G.eyeDx + G.eyeW + 1), eyeY + k * 1.4 - 0.5); ctx.lineTo(cx + d * (G.eyeDx + G.eyeW + 4), eyeY + k * 2 - 1.5); ctx.stroke(); }
      ctx.beginPath(); ctx.moveTo(cx + d * (G.eyeDx - 3), eyeY + 3.8); ctx.quadraticCurveTo(cx + d * G.eyeDx, eyeY + 5.2, cx + d * (G.eyeDx + 3.5), eyeY + 3.6); ctx.stroke(); // bags
    }
  }
  if (L.build === 'fat' || L.build === 'heavy' && L.age > 40) { // jowls and a second chin
    soft(ctx, 1.5, () => { ctx.strokeStyle = rgba(shade(L.skin, -0.45), 0.5); ctx.lineWidth = 0.9; ctx.beginPath(); ctx.moveTo(cx - jw + 2, chinY - 6); ctx.quadraticCurveTo(cx, chinY + 3, cx + jw - 2, chinY - 6); ctx.stroke(); });
  }
  if (L.feat.has('freckles')) { ctx.fillStyle = rgba('#8a4a24', 0.4); for (let i = 0; i < 46; i++) { const a = r() * Math.PI * 2, d = r(); ctx.beginPath(); ctx.arc(cx + Math.cos(a) * d * 16, noseY - 4 + Math.sin(a) * d * 6, 0.35 + r() * 0.35, 0, Math.PI * 2); ctx.fill(); } }
  if (L.feat.has('liverspots')) { for (let i = 0; i < 6; i++) blob(ctx, cx - cw + 4 + r() * (cw * 2 - 8), top + 4 + r() * 16, 1 + r() * 1.6, 0.8 + r() * 1.2, 'rgba(120,80,40,0.3)'); }
  if (L.feat.has('scar')) { ctx.strokeStyle = rgba(mix(L.skin, '#b06a6a', 0.5), 0.9); ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(cx - 16, eyeY - 8); ctx.lineTo(cx - 8, mouthY - 4); ctx.stroke(); ctx.strokeStyle = 'rgba(255,240,230,0.35)'; ctx.lineWidth = 0.4; ctx.stroke(); }
  // painterly skin: faint mottling
  ctx.globalAlpha = 0.05; for (let i = 0; i < 40; i++) blob(ctx, cx - cw + r() * cw * 2, top + r() * (chinY - top), 1 + r() * 3, 1 + r() * 3, r() < 0.5 ? '#6a2a1a' : '#fff0e0'); ctx.globalAlpha = 1;
  ctx.restore();
}
function burn(ctx, L, G, r) {
  // the left side of Sandor Clegane's face (viewer's right): ridged, cratered scar tissue, the ear gone
  const { cx, top, eyeY, chinY, cw } = G;
  ctx.save(); facePath(ctx, G); ctx.clip();
  ctx.beginPath(); ctx.moveTo(cx + 6, top + 8); ctx.lineTo(cx + cw + 4, top + 4); ctx.lineTo(cx + cw + 4, chinY);
  // the edge of the scar wanders: across the brow, round the eye, down beside the mouth
  const edge = [[cx + 9, chinY - 2], [cx + 7, G.mouthY + 4], [cx + 9.5, G.mouthY - 1], [cx + 6, G.noseY + 2], [cx + 3.5, eyeY + 4], [cx + 2.5, eyeY - 4], [cx + 5, eyeY - 10], [cx + 4, top + 14]];
  for (const [x, y] of edge) ctx.lineTo(x + (r() - 0.5) * 3, y + (r() - 0.5) * 2);
  ctx.closePath(); ctx.clip();
  const g = ctx.createLinearGradient(cx, 0, cx + cw, 0); g.addColorStop(0, 'rgba(150,60,50,0.35)'); g.addColorStop(0.5, 'rgba(120,40,34,0.75)'); g.addColorStop(1, 'rgba(80,26,22,0.85)');
  ctx.fillStyle = g; ctx.fillRect(cx, top, cw + 4, chinY - top);
  for (let i = 0; i < 70; i++) { const x = cx + 3 + r() * cw, y = top + 6 + r() * (chinY - top - 8); blob(ctx, x, y, 0.8 + r() * 2.4, 0.6 + r() * 1.6, r() < 0.5 ? 'rgba(60,16,14,0.45)' : 'rgba(210,130,120,0.35)', r() * 3); }
  ctx.strokeStyle = 'rgba(40,10,8,0.5)'; ctx.lineWidth = 0.6;
  for (let i = 0; i < 12; i++) { ctx.beginPath(); const x = cx + 4 + r() * cw, y = top + 8 + r() * 40; ctx.moveTo(x, y); ctx.quadraticCurveTo(x + 3, y + 4, x + (r() - 0.3) * 6, y + 8); ctx.stroke(); }
  ctx.restore();
  L.noBrowRight = true;
}
function greyscale(ctx, G, r) {
  const x = G.cx - 11, y = G.eyeY + 10;
  ctx.save(); facePath(ctx, G); ctx.clip();
  ctx.fillStyle = 'rgba(120,122,120,0.75)'; ctx.beginPath(); ctx.ellipse(x, y, 8, 11, -0.3, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = 'rgba(40,40,40,0.55)'; ctx.lineWidth = 0.5;
  for (let i = 0; i < 16; i++) { ctx.beginPath(); ctx.moveTo(x + (r() - 0.5) * 12, y + (r() - 0.5) * 16); ctx.lineTo(x + (r() - 0.5) * 12, y + (r() - 0.5) * 16); ctx.stroke(); }
  ctx.restore();
}
function eyes(ctx, L, G, r) {
  const { cx, eyeY } = G; const w = G.eyeW, h = L.female || L.build === 'child' ? 2.9 : 2.5;
  const narrow = L.expr < 0 ? 0.85 : 1;
  for (const d of [-1, 1]) {
    const x = cx + d * G.eyeDx, y = eyeY;
    if (L.feat.has('eyepatch') && d < 0) continue;
    const iris = L.feat.has('mismatched') ? (d < 0 ? COLORS.e_green : COLORS.e_black) : L.feat.has('blind') ? COLORS.e_milk : L.eyes;
    const almond = () => { ctx.beginPath(); ctx.moveTo(x - w, y + 0.3); ctx.bezierCurveTo(x - w * 0.5, y - h * 1.35 * narrow, x + w * 0.45, y - h * 1.4 * narrow, x + w, y - 0.1); ctx.bezierCurveTo(x + w * 0.5, y + h * 0.95, x - w * 0.5, y + h * 1.0, x - w, y + 0.3); ctx.closePath(); };
    almond(); ctx.fillStyle = '#e6ddd2'; ctx.fill();
    ctx.save(); almond(); ctx.clip();
    const ir = L.build === 'child' ? 2.6 : 2.3;
    const ig = ctx.createRadialGradient(x - 0.3, y - 0.2, 0.3, x, y, ir);
    ig.addColorStop(0, shade(iris, 0.35)); ig.addColorStop(0.7, iris); ig.addColorStop(1, shade(iris, -0.55));
    ctx.fillStyle = ig; ctx.beginPath(); ctx.arc(x, y, ir, 0, Math.PI * 2); ctx.fill();
    if (!L.feat.has('blind')) { blob(ctx, x, y, 1.05, 1.05, '#0a0806'); }
    // lid shadow across the top of the eyeball
    const lg = ctx.createLinearGradient(0, y - h * 1.4, 0, y + 0.5); lg.addColorStop(0, 'rgba(40,20,10,0.55)'); lg.addColorStop(1, 'rgba(40,20,10,0)');
    ctx.fillStyle = lg; ctx.fillRect(x - w, y - h * 1.5, w * 2, h * 2);
    ctx.restore();
    if (!L.feat.has('blind')) blob(ctx, x - 0.8, y - 0.9, 0.55, 0.55, 'rgba(255,255,255,0.9)');
    // upper lid line and crease
    ctx.strokeStyle = rgba(shade(L.skin, -0.72), 0.95); ctx.lineWidth = L.female ? 1.15 : 0.95; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(x - w - 0.2, y + 0.4); ctx.bezierCurveTo(x - w * 0.5, y - h * 1.35 * narrow, x + w * 0.45, y - h * 1.4 * narrow, x + w + 0.6, y - 0.4); ctx.stroke();
    ctx.strokeStyle = rgba(shade(L.skin, -0.45), 0.45); ctx.lineWidth = 0.6;
    ctx.beginPath(); ctx.moveTo(x - w * 0.8, y - h * 0.9 - 1.6); ctx.quadraticCurveTo(x, y - h * 1.7 - 1.8, x + w * 0.85, y - h * 0.9 - 1.6); ctx.stroke();
    ctx.strokeStyle = rgba(shade(L.skin, -0.35), 0.4); ctx.lineWidth = 0.5; ctx.beginPath(); ctx.moveTo(x - w * 0.8, y + 0.9); ctx.quadraticCurveTo(x, y + h + 0.6, x + w * 0.9, y + 0.3); ctx.stroke();
    if (L.female && L.build !== 'child') { ctx.strokeStyle = 'rgba(20,12,8,0.8)'; ctx.lineWidth = 0.5; for (let k = 0; k < 3; k++) { const px = x + d * (w * 0.4 + k * 1.3); ctx.beginPath(); ctx.moveTo(px, y - h * 1.1 + k * 0.4); ctx.lineTo(px + d * 1.1, y - h * 1.1 - 1.2 + k * 0.5); ctx.stroke(); } }
  }
  if (L.feat.has('eyepatch')) { // over his left eye (viewer's left)
    const x = cx - G.eyeDx;
    ctx.strokeStyle = '#0c0c0c'; ctx.lineWidth = 1.3; ctx.beginPath(); ctx.moveTo(cx - G.cw, eyeY - 10); ctx.lineTo(cx + G.cw, eyeY - 3); ctx.stroke();
    const g = ctx.createRadialGradient(x - 1.5, eyeY - 1.5, 0.5, x, eyeY, 7); g.addColorStop(0, '#3a3634'); g.addColorStop(1, '#0a0a0a');
    ctx.fillStyle = g; ctx.beginPath(); ctx.ellipse(x, eyeY + 0.5, 6.4, 5.4, -0.1, 0, Math.PI * 2); ctx.fill();
  }
}
function brows(ctx, L, G) {
  const { cx, eyeY } = G; const heavy = L.feat.has('dwarf') || L.build === 'huge' ? 1.35 : L.female ? 0.75 : 1;
  const tone = L.bald && !['bald'].includes(L.style) ? shade(L.hair, -0.1) : L.hair === 'bald' ? '#5a4a3a' : shade(L.hair, L.age > 60 ? 0.1 : -0.2);
  const stern = L.expr < 0; const warm = L.expr > 0;
  for (const d of [-1, 1]) {
    if (d > 0 && L.noBrowRight) continue;
    const x = cx + d * G.eyeDx; const y = eyeY - 6.2;
    const inner = [cx + d * 3.6, y + (stern ? 1.6 : warm ? -0.4 : 0.6)], mid = [x + d * 0.5, y - (warm ? 2.4 : 2)], outer = [x + d * (G.eyeW + 2.4), y + (L.female ? 0.4 : 1.2)];
    ctx.fillStyle = rgba(tone, L.age > 70 ? 0.55 : 0.9);
    ctx.beginPath(); ctx.moveTo(inner[0], inner[1] - 0.9 * heavy); ctx.quadraticCurveTo(mid[0], mid[1] - 1.2 * heavy, outer[0], outer[1]);
    ctx.quadraticCurveTo(mid[0], mid[1] + 0.6 * heavy, inner[0], inner[1] + 0.9 * heavy); ctx.closePath(); ctx.fill();
  }
}
function nose(ctx, L, G) {
  const { cx, eyeY, noseY } = G; const hawk = L.feat.has('hawk_nose'); const wide = L.feat.has('flat_face') || L.feat.has('dwarf') || L.feat.has('frog') ? 1.35 : L.female ? 0.85 : 1;
  const skew = L.feat.has('broken_nose') ? 1.2 : 0;
  soft(ctx, 1.2, () => {
    ctx.strokeStyle = rgba(shade(L.skin, -0.5), 0.55); ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(cx + 2.5, eyeY + 1); ctx.quadraticCurveTo(cx + (hawk ? 4.5 : 3.2) + skew, (eyeY + noseY) / 2, cx + 3.2 * wide + skew, noseY - 1); ctx.stroke();
    blob(ctx, cx - 1.2 + skew, (eyeY + noseY) / 2 + 1, 1.2, 5, 'rgba(255,245,235,0.35)');
    blob(ctx, cx + skew, noseY + 1.8, 4.5 * wide, 1.6, rgba(shade(L.skin, -0.55), 0.45));
  });
  // tip and nostrils
  blob(ctx, cx - 0.6 + skew, noseY - 0.8, 1.6 * wide, 1.3, 'rgba(255,240,228,0.35)');
  for (const d of [-1, 1]) blob(ctx, cx + d * 2.4 * wide + skew, noseY + 0.9, 1.25 * wide, 0.65, rgba(shade(L.skin, -0.7), 0.8), d * 0.4);
  ctx.strokeStyle = rgba(shade(L.skin, -0.45), 0.55); ctx.lineWidth = 0.6;
  for (const d of [-1, 1]) { ctx.beginPath(); ctx.moveTo(cx + d * 3.8 * wide + skew, noseY - 2.4); ctx.quadraticCurveTo(cx + d * 4.6 * wide + skew, noseY + 0.6, cx + d * 2.8 * wide + skew, noseY + 1.4); ctx.stroke(); }
}
function mouth(ctx, L, G) {
  const { cx, mouthY } = G; const w = (L.female ? 5.4 : 6) * (L.feat.has('frog') ? 1.5 : 1) * (L.build === 'child' ? 0.85 : 1);
  const lip = L.feat.has('lipstick') ? '#8e2a2e' : mix(L.skin, '#a8423e', L.female ? 0.48 : 0.3);
  const up = L.expr > 0 ? 1 : L.expr < 0 ? -0.8 : 0; const thin = L.feat.has('pale') || L.feat.has('gaunt') ? 0.7 : 1;
  // philtrum
  soft(ctx, 0.8, () => { blob(ctx, cx, mouthY - 3.6, 1.4, 1.8, rgba(shade(L.skin, -0.3), 0.3)); });
  // upper lip with a cupid's bow
  ctx.fillStyle = shade(lip, -0.18);
  ctx.beginPath(); ctx.moveTo(cx - w, mouthY - up * 0.8); ctx.quadraticCurveTo(cx - w * 0.5, mouthY - 2.1 * thin, cx - 1, mouthY - 1.6 * thin); ctx.lineTo(cx, mouthY - 1.2 * thin); ctx.lineTo(cx + 1, mouthY - 1.6 * thin); ctx.quadraticCurveTo(cx + w * 0.5, mouthY - 2.1 * thin, cx + w, mouthY - up * 0.8); ctx.quadraticCurveTo(cx, mouthY + 0.4, cx - w, mouthY - up * 0.8); ctx.fill();
  // lower lip, fuller and lit
  const lg = ctx.createLinearGradient(0, mouthY, 0, mouthY + 3); lg.addColorStop(0, lip); lg.addColorStop(1, shade(lip, -0.15));
  ctx.fillStyle = lg; ctx.beginPath(); ctx.moveTo(cx - w * 0.9, mouthY - up * 0.6); ctx.quadraticCurveTo(cx, mouthY + 0.3, cx + w * 0.9, mouthY - up * 0.6); ctx.quadraticCurveTo(cx + w * 0.4, mouthY + 3.1 * thin, cx, mouthY + 3.1 * thin); ctx.quadraticCurveTo(cx - w * 0.4, mouthY + 3.1 * thin, cx - w * 0.9, mouthY - up * 0.6); ctx.fill();
  blob(ctx, cx - 1, mouthY + 1.4, 1.8, 0.6, 'rgba(255,235,225,0.3)');
  ctx.strokeStyle = rgba(shade(lip, -0.6), 0.85); ctx.lineWidth = 0.7; ctx.beginPath(); ctx.moveTo(cx - w - 0.4, mouthY - up); ctx.quadraticCurveTo(cx, mouthY + 0.5 - up * 0.3, cx + w + 0.4, mouthY - up); ctx.stroke();
  soft(ctx, 1, () => { blob(ctx, cx, mouthY + 5, 3.5, 1.2, rgba(shade(L.skin, -0.45), 0.35)); });
}
function beard(ctx, L, G, r) {
  const b = L.beard; if (!b || b === 'none') return;
  const { cx, eyeY, noseY, mouthY, chinY, cw, jw } = G; const hair = L.hair;
  const light = shade(hair, 0.28), dark = shade(hair, -0.45);
  const mouthHole = () => { ctx.ellipse(cx, mouthY + 0.8, 6.6, 3, 0, 0, Math.PI * 2); };
  if (b === 'stubble') {
    ctx.save(); facePath(ctx, G); ctx.clip();
    ctx.beginPath(); ctx.rect(cx - cw - 2, noseY + 1, cw * 2 + 4, 40); ctx.moveTo(cx + 7, mouthY); mouthHole(); ctx.clip('evenodd');
    ctx.fillStyle = rgba(hair, 0.16); ctx.fillRect(cx - cw, noseY, cw * 2, 40);
    ctx.fillStyle = rgba(dark, 0.35); for (let i = 0; i < 520; i++) ctx.fillRect(cx - cw + r() * cw * 2, noseY + 1 + r() * (chinY - noseY), 0.4, 0.4);
    ctx.restore(); return;
  }
  const len = { short: 3, full: 9, long: 30, great: 32, forked: 26, braided: 26 }[b] ?? 0;
  const wide = b === 'great' ? 6 : b === 'full' || b === 'long' ? 2 : 0.5;
  const moustache = b !== 'whiskers';
  const chin = !['moustache', 'drooping', 'whiskers'].includes(b);
  ctx.save();
  if (chin) {
    ctx.beginPath();
    ctx.moveTo(cx - cw - 0.5, eyeY + 2);
    ctx.bezierCurveTo(cx - cw - wide, eyeY + 16, cx - jw - wide - 2, chinY - 4 + len * 0.3, cx - (b === 'pointed' ? 3 : 8 + wide), chinY + len);
    if (b === 'forked') { ctx.lineTo(cx - 4, chinY + len + 5); ctx.lineTo(cx, chinY + len - 4); ctx.lineTo(cx + 4, chinY + len + 5); }
    else if (b === 'pointed') { ctx.lineTo(cx, chinY + 8); }
    ctx.lineTo(cx + (b === 'pointed' ? 3 : 8 + wide), chinY + len);
    ctx.bezierCurveTo(cx + jw + wide + 2, chinY - 4 + len * 0.3, cx + cw + wide, eyeY + 16, cx + cw + 0.5, eyeY + 2);
    // inner edge following the cheek down around the mouth
    ctx.bezierCurveTo(cx + cw - 3, eyeY + 12, cx + 12, mouthY - 3, cx + 8, mouthY + 1);
    ctx.quadraticCurveTo(cx, mouthY + 5.5, cx - 8, mouthY + 1);
    ctx.bezierCurveTo(cx - 12, mouthY - 3, cx - cw + 3, eyeY + 12, cx - cw - 0.5, eyeY + 2);
    ctx.closePath();
    if (b === 'pointed') { ctx.beginPath(); ctx.moveTo(cx - 5, mouthY + 4); ctx.quadraticCurveTo(cx - 4, chinY + 2, cx, chinY + 8); ctx.quadraticCurveTo(cx + 4, chinY + 2, cx + 5, mouthY + 4); ctx.quadraticCurveTo(cx, mouthY + 6, cx - 5, mouthY + 4); }
    const g = ctx.createLinearGradient(cx - cw, 0, cx + cw, 0); g.addColorStop(0, shade(hair, 0.08)); g.addColorStop(1, shade(hair, -0.3));
    ctx.fillStyle = g; ctx.fill();
    ctx.save(); ctx.clip();
    const n = 90 + len * 12; ctx.lineCap = 'round';
    for (let i = 0; i < n; i++) {
      const x = cx - cw - wide + r() * (cw + wide) * 2, y = mouthY - 8 + r() * (chinY + len - mouthY + 8);
      ctx.strokeStyle = r() < 0.45 ? rgba(light, 0.35) : rgba(dark, 0.45); ctx.lineWidth = 0.4 + r() * 0.5;
      const l = 2 + r() * (len > 10 ? 7 : 3.5); ctx.beginPath(); ctx.moveTo(x, y); ctx.quadraticCurveTo(x + (x - cx) * 0.05 + (r() - 0.5) * 2, y + l * 0.5, x - (x - cx) * 0.04, y + l); ctx.stroke();
    }
    ctx.restore();
    if (b === 'braided') { for (let i = 0; i < 4; i++) blob(ctx, cx, chinY + len - 8 + i * 4, 2.4, 2.2, shade(hair, i % 2 ? -0.1 : 0.1)); }
  }
  if (b === 'whiskers') { // great side-whiskers down to the jaw, chin bare
    for (const d of [-1, 1]) {
      ctx.fillStyle = hair; ctx.beginPath(); ctx.moveTo(cx + d * (cw + 1.5), eyeY - 3); ctx.bezierCurveTo(cx + d * (cw + 7), eyeY + 10, cx + d * (jw + 9), chinY - 2, cx + d * (jw + 1), chinY - 3); ctx.bezierCurveTo(cx + d * (jw - 1), chinY - 10, cx + d * (cw - 1.5), eyeY + 10, cx + d * (cw - 1), eyeY - 3); ctx.closePath(); ctx.fill();
      ctx.save(); ctx.clip(); textureHair(ctx, { ...L, style: 'curls' }, r, [cx + d * (jw - 4) - 8, eyeY - 2, cx + d * (cw + 5) + 8, chinY], 'curl', 1.4); ctx.restore();
    }
  }
  if (moustache) {
    const droop = b === 'drooping' ? 26 : b === 'moustache' ? 3 : 1.5;
    ctx.fillStyle = shade(hair, -0.05);
    ctx.beginPath(); ctx.moveTo(cx, mouthY - 3.6);
    for (const d of [1, -1]) { ctx.moveTo(cx, mouthY - 3.8); ctx.quadraticCurveTo(cx + d * 5, mouthY - 5.2, cx + d * 8, mouthY - 1.2); ctx.quadraticCurveTo(cx + d * 8.8, mouthY + droop * 0.5, cx + d * (b === 'drooping' ? 8.5 : 8.2), mouthY + droop); ctx.quadraticCurveTo(cx + d * 6.2, mouthY - 0.5, cx, mouthY - 1.4); }
    ctx.fill();
    ctx.strokeStyle = rgba(dark, 0.5); ctx.lineWidth = 0.4;
    for (let i = 0; i < 26; i++) { const d = i % 2 ? 1 : -1; const x = cx + d * (0.5 + r() * 7); ctx.beginPath(); ctx.moveTo(x, mouthY - 3.6); ctx.lineTo(x + d * 1.4, mouthY - 1); ctx.stroke(); }
  }
  ctx.restore();
}
function regalia(ctx, L, G, r) {
  const { cx, top, eyeY, chinY } = G; const y = chinY + 9; const f = L.feat;
  const gold = (x0, y0, x1, y1) => { const g = ctx.createLinearGradient(x0, y0, x1, y1); g.addColorStop(0, '#fff0b8'); g.addColorStop(0.35, '#d8b04a'); g.addColorStop(1, '#6a4a14'); return g; };
  if (f.has('crown')) {
    const antlers = /baratheon/.test(String(L.main)) || L.seed && false;
    const cy = top + 6; const w = G.cw + 3;
    ctx.fillStyle = gold(cx - w, cy - 14, cx + w, cy + 4);
    ctx.beginPath(); ctx.moveTo(cx - w, cy + 3); ctx.lineTo(cx - w, cy - 3);
    const n = 7; for (let i = 0; i <= n; i++) { const x = cx - w + (2 * w * i) / n; ctx.lineTo(x - w / n / 2, cy - 3); ctx.lineTo(x, cy - (i % 2 ? 9 : 14)); ctx.lineTo(x + w / n / 2, cy - 3); }
    ctx.lineTo(cx + w, cy - 3); ctx.lineTo(cx + w, cy + 3); ctx.quadraticCurveTo(cx, cy + 6, cx - w, cy + 3); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = 'rgba(70,40,10,0.7)'; ctx.lineWidth = 0.6; ctx.stroke();
    for (let i = -2; i <= 2; i++) blob(ctx, cx + i * 7, cy + 0.5, 1.3, 1.3, i % 2 ? '#2a5aa8' : '#9a1a2a');
    void antlers;
  }
  if (f.has('tiara')) {
    const cy = top + 5; ctx.fillStyle = gold(cx - 16, cy - 8, cx + 16, cy + 2);
    ctx.beginPath(); ctx.moveTo(cx - 17, cy + 2); ctx.quadraticCurveTo(cx - 8, cy - 3, cx, cy - 9); ctx.quadraticCurveTo(cx + 8, cy - 3, cx + 17, cy + 2); ctx.quadraticCurveTo(cx, cy - 1, cx - 17, cy + 2); ctx.fill();
    blob(ctx, cx, cy - 4, 1.8, 2.2, '#2a8a4a');
  }
  if (f.has('circlet')) { ctx.strokeStyle = gold(cx - 20, top, cx + 20, top + 10); ctx.lineWidth = 1.6; ctx.beginPath(); ctx.ellipse(cx, top + 10, G.cw + 0.5, 3.5, 0, Math.PI * 1.02, Math.PI * 1.98, true); ctx.stroke(); blob(ctx, cx, top + 6.5, 1.3, 1.3, '#9a1a2a'); }
  if (f.has('chain_heavy') || f.has('chain_light')) {
    const n = f.has('chain_heavy') ? 14 : 9; const metals = ['#caa24a', '#9aa0a6', '#b86a34', '#d8d8d8', '#6a6a70', '#e8d8a0', '#8a5a2a'];
    for (let i = 0; i < n; i++) { const t = i / (n - 1); const x = cx - 24 + t * 48, yy = y + 4 + Math.sin(t * Math.PI) * 14; ctx.strokeStyle = metals[(i + L.seed) % metals.length]; ctx.lineWidth = f.has('chain_heavy') ? 1.6 : 1.1; ctx.beginPath(); ctx.ellipse(x, yy, 2.2, 1.6, t * 2, 0, Math.PI * 2); ctx.stroke(); }
  }
  if (f.has('pin_hand')) { ctx.fillStyle = gold(cx - 18, y + 16, cx - 10, y + 26); ctx.beginPath(); ctx.moveTo(cx - 20, y + 26); ctx.lineTo(cx - 20, y + 18); for (let i = 0; i < 4; i++) { ctx.lineTo(cx - 19.5 + i * 2.2, y + 13); ctx.lineTo(cx - 18.5 + i * 2.2, y + 18); } ctx.lineTo(cx - 11, y + 20); ctx.lineTo(cx - 12, y + 26); ctx.closePath(); ctx.fill(); }
  if (f.has('pin_mockingbird')) { ctx.fillStyle = '#c8ccd0'; ctx.beginPath(); ctx.moveTo(cx - 20, y + 12); ctx.quadraticCurveTo(cx - 14, y + 8, cx - 10, y + 12); ctx.lineTo(cx - 6, y + 11); ctx.lineTo(cx - 11, y + 14); ctx.quadraticCurveTo(cx - 15, y + 16, cx - 20, y + 12); ctx.fill(); }
  if (f.has('choker')) { ctx.strokeStyle = '#2a0a08'; ctx.lineWidth = 2.2; ctx.beginPath(); ctx.moveTo(cx - G.neck, chinY + 5); ctx.quadraticCurveTo(cx, chinY + 9, cx + G.neck, chinY + 5); ctx.stroke(); const g = ctx.createRadialGradient(cx - 0.8, chinY + 7.5, 0.3, cx, chinY + 8.5, 3.2); g.addColorStop(0, '#ff8a7a'); g.addColorStop(0.4, '#c0101a'); g.addColorStop(1, '#4a0206'); ctx.fillStyle = g; ctx.beginPath(); ctx.arc(cx, chinY + 8.5, 3, 0, Math.PI * 2); ctx.fill(); }
  if (f.has('pearls')) { for (let k = 0; k < 2; k++) for (let i = 0; i < 12; i++) { const t = i / 11; blob(ctx, cx - 18 + t * 36, y + 4 + k * 5 + Math.sin(t * Math.PI) * (8 + k * 3), 1.2, 1.2, '#f2eee4'); } }
  if (f.has('raven')) { // the Old Bear's raven on his shoulder
    const x = cx - G.shoulder + 4, yy = y + 2;
    ctx.fillStyle = '#0c0c10'; ctx.beginPath(); ctx.ellipse(x, yy, 9, 6, -0.5, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(x + 6, yy - 7, 4, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.moveTo(x + 9, yy - 8); ctx.lineTo(x + 15, yy - 6); ctx.lineTo(x + 9, yy - 5); ctx.fill();
    ctx.beginPath(); ctx.moveTo(x - 7, yy + 2); ctx.lineTo(x - 16, yy + 9); ctx.lineTo(x - 9, yy + 5); ctx.fill();
    blob(ctx, x + 7, yy - 8, 0.8, 0.8, '#d8b030');
    ctx.strokeStyle = 'rgba(120,130,160,0.4)'; ctx.lineWidth = 0.6; ctx.beginPath(); ctx.moveTo(x - 6, yy - 2); ctx.quadraticCurveTo(x, yy - 5, x + 4, yy - 3); ctx.stroke();
  }
  if (f.has('wet_hair')) { ctx.strokeStyle = 'rgba(200,220,230,0.35)'; ctx.lineWidth = 0.5; for (let i = 0; i < 10; i++) { const x = cx - G.cw + r() * G.cw * 2; ctx.beginPath(); ctx.moveTo(x, top); ctx.lineTo(x + (r() - 0.5) * 2, top + 10 + r() * 20); ctx.stroke(); } }
  void eyeY;
}
function finish(ctx, L, W, H) {
  // varnish, canvas grain, vignette, and a gilt frame line
  ctx.save();
  ctx.globalCompositeOperation = 'soft-light'; ctx.fillStyle = 'rgba(190,140,70,0.18)'; ctx.fillRect(0, 0, W, H);
  ctx.globalCompositeOperation = 'overlay'; ctx.globalAlpha = 0.16; ctx.fillStyle = grainPattern(ctx); ctx.fillRect(0, 0, W, H);
  ctx.restore();
  const v = ctx.createRadialGradient(W / 2, H * 0.44, H * 0.3, W / 2, H * 0.5, H * 0.78);
  v.addColorStop(0, 'rgba(0,0,0,0)'); v.addColorStop(1, 'rgba(0,0,0,0.6)');
  ctx.fillStyle = v; ctx.fillRect(0, 0, W, H);
  ctx.strokeStyle = 'rgba(0,0,0,0.7)'; ctx.lineWidth = 3; ctx.strokeRect(1.5, 1.5, W - 3, H - 3);
  ctx.strokeStyle = 'rgba(214,178,98,0.35)'; ctx.lineWidth = 0.6; ctx.strokeRect(3.3, 3.3, W - 6.6, H - 6.6);
  if (L.status === 'imprisoned') void 0;
}
