// Procedural painted portraits: face, hair and eye colour by bloodline, age, clothing in house colours,
// office regalia (crowns, maester chains, Kingsguard white, Night's Watch black).
import { HOUSE_LOOKS, LOOK_OVERRIDES } from '../../data/families.js';

const FEMALE = new Set(['catelyn_stark', 'sansa_stark', 'arya_stark', 'lyarra_stark', 'lyanna_stark', 'minisa_whent', 'maege_mormont', 'dacey_mormont', 'meera_reed', 'donella_hornwood', 'barbrey_dustin', 'ygritte', 'val', 'cersei_lannister', 'myrcella_baratheon', 'selyse_florent', 'shireen_baratheon', 'melisandre', 'brienne_tarth', 'jeyne_westerling', 'lysa_arryn', 'anya_waynwood', 'olenna_tyrell', 'margaery_tyrell', 'arianne_martell', 'ellaria_sand', 'obara_sand', 'asha_greyjoy', 'daenerys_targaryen', 'shella_whent', 'arwyn_oakheart', 'joanna_lannister', 'cassana_estermont', 'rhaella_targaryen', 'elia_martell', 'rhaenys_targaryen', 'alannys_harlaw', 'mellario']);
export function isFemale(c) {
  if (!c) return false;
  if (c.gender) return c.gender === 'f';
  return FEMALE.has(c.id) || /\b(lady|queen|princess|spearwife|septa|maid|daughter|wife|mother|widow)\b/i.test(c.title || '');
}

function hash(s) { let h = 2166136261; for (const ch of s) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619); } return h >>> 0; }
function rngFrom(seed) { let s = seed || 1; return () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296); }
function shade(hex, f) {
  let h = hex.replace('#', ''); if (h.length === 3) h = h.split('').map((c) => c + c).join('');
  const n = parseInt(h, 16); const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  const k = (v) => Math.max(0, Math.min(255, Math.round(f > 0 ? v + (255 - v) * f : v * (1 + f))));
  return `rgb(${k(r)},${k(g)},${k(b)})`;
}

const cache = new Map();
export function portraitURL(c, house, size = 128) {
  if (!c) return '';
  const key = `${c.id}|${c.alive}|${c.age}|${house?.color}|${c.title}|${c.status}|${size}`;
  if (cache.has(key)) return cache.get(key);
  const W = size, H = Math.round(size * 1.2);
  const cv = document.createElement('canvas'); cv.width = W * 2; cv.height = H * 2;
  const ctx = cv.getContext('2d'); ctx.scale(2 * size / 128, 2 * size / 128);
  draw(ctx, c, house);
  const url = cv.toDataURL('image/png');
  cache.set(key, url);
  return url;
}

function draw(ctx, c, house) {
  const r = rngFrom(hash(c.id));
  const look = { ...(HOUSE_LOOKS[c.house] || { hair: ['#2a2018', '#5a3a22', '#8a6a3a', '#1a1614'][Math.floor(r() * 4)], eyes: '#4a5a6a', skin: ['#efd2b8', '#e2bf9f', '#c89a72', '#f2dcc8'][Math.floor(r() * 4)] }), ...(LOOK_OVERRIDES[c.id] || {}) };
  const female = isFemale(c);
  const age = c.age ?? 30;
  const col = house?.color || '#6a5a4a';
  const W = 128, H = 154;
  // background
  const bg = ctx.createRadialGradient(64, 55, 10, 64, 70, 110);
  bg.addColorStop(0, shade(col, 0.25)); bg.addColorStop(1, shade(col, -0.65));
  ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H);
  // vignette pattern
  ctx.globalAlpha = 0.08; ctx.fillStyle = '#000';
  for (let i = 0; i < 12; i++) { ctx.beginPath(); ctx.arc(r() * W, r() * H, 10 + r() * 30, 0, 7); ctx.fill(); }
  ctx.globalAlpha = 1;
  const nw = /night'?s watch/i.test(c.title || '') || c.house === 'nights_watch';
  const kg = (c.roles || []).includes('kingsguard');
  const maester = (c.roles || []).includes('maester');
  const priest = (c.roles || []).includes('priest');
  let cloth = nw ? '#1a1a1c' : kg ? '#eceae4' : maester ? '#6a6660' : priest && c.id === 'melisandre' ? '#9a1a14' : shade(col, -0.15);
  const skin = look.skin, hair = age > 62 ? '#d8d6d0' : age > 48 ? mix(look.hair, '#a8a49c', 0.45) : look.hair;
  const bald = look.hair === 'bald' || (!female && age > 55 && r() < 0.25);
  // hair behind (long hair for women / some men)
  const longHair = female || c.house === 'targaryen' || c.house === 'dothraki' || /wildling/.test((c.roles || []).join()) || r() < 0.2;
  if (!bald && longHair) { ctx.fillStyle = hair; ctx.beginPath(); ctx.ellipse(64, 72, female ? 34 : 30, female ? 52 : 44, 0, 0, 7); ctx.fill(); }
  // shoulders
  ctx.fillStyle = cloth;
  ctx.beginPath(); ctx.moveTo(8, H); ctx.quadraticCurveTo(14, 104, 44, 98); ctx.lineTo(84, 98); ctx.quadraticCurveTo(114, 104, 120, H); ctx.closePath(); ctx.fill();
  ctx.fillStyle = shade(cloth.startsWith('#') ? cloth : '#555555', -0.25);
  ctx.beginPath(); ctx.moveTo(44, 98); ctx.lineTo(64, 128); ctx.lineTo(84, 98); ctx.closePath(); ctx.fill();
  // fur / armour hints
  if (/north|beyond|wall/.test(house?.region || '') || c.house === 'stark') { ctx.fillStyle = '#6a5a4a'; ctx.beginPath(); ctx.ellipse(34, 104, 26, 10, 0.35, 0, 7); ctx.ellipse(94, 104, 26, 10, -0.35, 0, 7); ctx.fill(); }
  if ((c.roles || []).some((x) => ['knight', 'master_at_arms', 'captain', 'commander'].includes(x)) && !maester) { ctx.fillStyle = '#8a8e94'; ctx.beginPath(); ctx.ellipse(30, 110, 18, 9, 0.4, 0, 7); ctx.ellipse(98, 110, 18, 9, -0.4, 0, 7); ctx.fill(); }
  if (maester) { ctx.strokeStyle = '#b8a060'; ctx.lineWidth = 3; for (let i = 0; i < 9; i++) { ctx.strokeStyle = ['#b8a060', '#8a8a8a', '#c07040', '#d0d0d0'][i % 4]; ctx.beginPath(); ctx.arc(34 + i * 7.5, 104 + Math.sin(i / 8 * Math.PI) * 8, 3, 0, 7); ctx.stroke(); } }
  // neck
  ctx.fillStyle = shade(skin, -0.12); ctx.fillRect(55, 80, 18, 20);
  // head
  ctx.fillStyle = skin;
  ctx.beginPath(); ctx.ellipse(64, 60, female ? 21 : 23, female ? 27 : 29, 0, 0, 7); ctx.fill();
  // ears
  ctx.beginPath(); ctx.ellipse(41, 62, 4, 7, 0, 0, 7); ctx.ellipse(87, 62, 4, 7, 0, 0, 7); ctx.fill();
  // cheeks shading
  ctx.fillStyle = 'rgba(120,60,40,0.08)'; ctx.beginPath(); ctx.ellipse(52, 70, 7, 5, 0, 0, 7); ctx.ellipse(76, 70, 7, 5, 0, 0, 7); ctx.fill();
  // eyes
  const ey = 58;
  for (const ex of [54, 74]) {
    ctx.fillStyle = '#f4efe8'; ctx.beginPath(); ctx.ellipse(ex, ey, 5, 2.8, 0, 0, 7); ctx.fill();
    ctx.fillStyle = look.eyes; ctx.beginPath(); ctx.arc(ex, ey, 2.3, 0, 7); ctx.fill();
    ctx.fillStyle = '#111'; ctx.beginPath(); ctx.arc(ex, ey, 1, 0, 7); ctx.fill();
  }
  // brows
  ctx.strokeStyle = shade(hair.startsWith('#') ? hair : '#777777', -0.2); ctx.lineWidth = 2.2;
  const stern = /stern|cold|ruthless|grim|cruel|harsh|rigid/.test(c.traits || '');
  ctx.beginPath(); ctx.moveTo(48, ey - 7 + (stern ? 1.5 : 0)); ctx.lineTo(59, ey - 7 - (stern ? 0 : 1)); ctx.moveTo(69, ey - 7 - (stern ? 0 : 1)); ctx.lineTo(80, ey - 7 + (stern ? 1.5 : 0)); ctx.stroke();
  // nose & mouth
  ctx.strokeStyle = shade(skin, -0.3); ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.moveTo(64, 60); ctx.lineTo(62, 70); ctx.lineTo(66, 71); ctx.stroke();
  ctx.strokeStyle = female ? '#a8544c' : shade(skin, -0.38); ctx.lineWidth = female ? 2.4 : 1.8;
  const smile = /jovial|charming|kind|witty|boisterous/.test(c.traits || '') ? 2 : stern ? -1.5 : 0;
  ctx.beginPath(); ctx.moveTo(57, 78); ctx.quadraticCurveTo(64, 78 + smile, 71, 78); ctx.stroke();
  // age lines
  if (age > 45) { ctx.strokeStyle = 'rgba(80,50,30,0.25)'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(50, 64); ctx.lineTo(47, 66); ctx.moveTo(78, 64); ctx.lineTo(81, 66); ctx.moveTo(56, 48); ctx.lineTo(72, 48); ctx.stroke(); }
  // beard
  if (!female && age >= 17 && !['joffrey_baratheon', 'loras_tyrell', 'renly_baratheon', 'tyrion_lannister', 'theon_greyjoy', 'viserys_targaryen', 'varys', 'petyr_baelish', 'jaime_lannister', 'robb_stark', 'jon_snow'].includes(c.id) && r() < 0.8) {
    ctx.fillStyle = hair; ctx.globalAlpha = 0.92;
    ctx.beginPath(); ctx.moveTo(42, 64); ctx.quadraticCurveTo(44, 92, 64, 96 + (age > 40 ? 6 : 0)); ctx.quadraticCurveTo(84, 92, 86, 64); ctx.quadraticCurveTo(80, 78, 72, 82); ctx.quadraticCurveTo(64, 76, 56, 82); ctx.quadraticCurveTo(48, 78, 42, 64); ctx.fill();
    ctx.globalAlpha = 1;
  } else if (!female && ['petyr_baelish'].includes(c.id)) { ctx.fillStyle = hair; ctx.beginPath(); ctx.ellipse(64, 86, 5, 5, 0, 0, 7); ctx.fill(); }
  // hair on top
  if (!bald) {
    ctx.fillStyle = hair;
    ctx.beginPath(); ctx.ellipse(64, 40, female ? 24 : 25, 15, 0, Math.PI, 0); ctx.fill();
    ctx.beginPath(); ctx.moveTo(40, 52); ctx.quadraticCurveTo(44, 26, 64, 28); ctx.quadraticCurveTo(84, 26, 88, 52); ctx.quadraticCurveTo(80, 38, 64, 38); ctx.quadraticCurveTo(48, 38, 40, 52); ctx.fill();
    if (female) { ctx.beginPath(); ctx.moveTo(40, 50); ctx.quadraticCurveTo(34, 90, 44, 104); ctx.lineTo(48, 60); ctx.fill(); ctx.beginPath(); ctx.moveTo(88, 50); ctx.quadraticCurveTo(94, 90, 84, 104); ctx.lineTo(80, 60); ctx.fill(); }
  }
  // headwear / regalia
  const crown = /\bking\b|\bqueen\b|khal|king-beyond|prince of dorne|sealord|archon/i.test(c.title || '') && !/hand of the king|bastard/i.test(c.title || '');
  if (crown) { ctx.fillStyle = c.house === 'baratheon' ? '#c9a44a' : '#d8b44a'; ctx.beginPath(); ctx.moveTo(42, 36); for (let i = 0; i <= 6; i++) { ctx.lineTo(42 + i * 7.3, i % 2 ? 22 : 30); } ctx.lineTo(86, 36); ctx.closePath(); ctx.fill(); ctx.strokeStyle = '#6a4a1a'; ctx.lineWidth = 1; ctx.stroke(); }
  if (/hand of the king/i.test(c.title || '')) { ctx.fillStyle = '#d8b44a'; ctx.fillRect(56, 104, 16, 10); }
  if (kg) { ctx.fillStyle = '#d8d8d8'; ctx.fillRect(36, 100, 56, 6); }
  // death / captivity markers
  if (!c.alive) { ctx.fillStyle = 'rgba(20,20,20,0.55)'; ctx.fillRect(0, 0, W, H); ctx.fillStyle = '#ddd'; ctx.font = 'bold 26px serif'; ctx.textAlign = 'center'; ctx.fillText('✝', 110, 28); }
  else if (c.status === 'imprisoned' || c.status === 'hostage') { ctx.strokeStyle = 'rgba(30,30,30,0.8)'; ctx.lineWidth = 4; for (let x = 16; x < W; x += 22) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke(); } }
  // frame
  ctx.strokeStyle = 'rgba(0,0,0,0.6)'; ctx.lineWidth = 3; ctx.strokeRect(1.5, 1.5, W - 3, H - 3);
}

function mix(a, b, t) {
  const pa = parseInt(a.replace('#', ''), 16), pb = parseInt(b.replace('#', ''), 16);
  const r = Math.round(((pa >> 16) & 255) * (1 - t) + ((pb >> 16) & 255) * t), g = Math.round(((pa >> 8) & 255) * (1 - t) + ((pb >> 8) & 255) * t), bl = Math.round((pa & 255) * (1 - t) + (pb & 255) * t);
  return '#' + [r, g, bl].map((v) => v.toString(16).padStart(2, '0')).join('');
}
