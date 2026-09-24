// The Known World drawn as an old parchment chart, behind the title screen (from the same atlas as the 3D map).
import { WORLD, LAND, LAKES, MOUNTAIN_RANGES, FORESTS, RIVERS, ROADS, WALL, LABELS } from '../../data/geography.js';
import { HOUSES } from '../../data/houses.js';

const inPoly = (x, y, pts) => { let c = false; for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) { const [xi, yi] = pts[i], [xj, yj] = pts[j]; if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) c = !c; } return c; };
function rng(seed) { let s = seed >>> 0; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); }

export function drawTitleMap(canvas) {
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const cw = canvas.clientWidth || window.innerWidth, ch = canvas.clientHeight || window.innerHeight;
  canvas.width = Math.round(cw * dpr); canvas.height = Math.round(ch * dpr);
  const g = canvas.getContext('2d'); g.scale(dpr, dpr);
  // frame Westeros and the Narrow Sea, slightly tilted like a map on a table
  const view = { x0: 60, y0: 380, x1: 1500, y1: 2379 };
  const k = Math.max(cw / (view.x1 - view.x0), ch / (view.y1 - view.y0)) * 1.02;
  const ox = cw / 2 - ((view.x0 + view.x1) / 2) * k, oy = ch / 2 - ((view.y0 + view.y1) / 2) * k;
  g.save(); g.translate(ox, oy); g.scale(k, k);
  const line = (pts) => { g.beginPath(); pts.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y))); };
  const poly = (pts) => { line(pts); g.closePath(); };

  // sea
  g.fillStyle = '#1e2a2c'; g.fillRect(-2000, -2000, 6000, 6000);
  // water-lining around the coasts (the classic engraved-chart look)
  g.lineJoin = 'round';
  for (let r = 5; r >= 1; r--) { g.strokeStyle = `rgba(160,150,120,${0.05 + (5 - r) * 0.015})`; g.lineWidth = r * 3.2; for (const l of LAND) { poly(l.pts); g.stroke(); } }
  // land: parchment
  const grad = g.createLinearGradient(0, 400, 0, 2300); grad.addColorStop(0, '#d8cdb2'); grad.addColorStop(0.5, '#cdb98e'); grad.addColorStop(1, '#c7a87a');
  g.fillStyle = grad; for (const l of LAND) { poly(l.pts); g.fill(); }
  g.fillStyle = '#3a4a4a'; for (const l of LAKES) { poly(l.pts); g.fill(); }
  g.strokeStyle = '#3a2a1a'; g.lineWidth = 1.2; for (const l of LAND) { poly(l.pts); g.stroke(); }
  // forests: little trees
  const R = rng(298);
  g.strokeStyle = 'rgba(60,70,40,0.55)'; g.fillStyle = 'rgba(90,100,60,0.35)'; g.lineWidth = 0.8;
  for (const f of FORESTS) {
    const xs = f.pts.map((p) => p[0]), ys = f.pts.map((p) => p[1]);
    for (let y = Math.min(...ys); y < Math.max(...ys); y += 9) for (let x = Math.min(...xs); x < Math.max(...xs); x += 9) {
      const px = x + (R() - 0.5) * 6, py = y + (R() - 0.5) * 6; if (!inPoly(px, py, f.pts)) continue;
      g.beginPath(); g.arc(px, py - 2.5, 2.4, 0, Math.PI * 2); g.fill(); g.stroke(); g.beginPath(); g.moveTo(px, py); g.lineTo(px, py + 2.5); g.stroke();
    }
  }
  // mountains: shaded peaks
  for (const m of MOUNTAIN_RANGES) {
    const xs = m.pts.map((p) => p[0]), ys = m.pts.map((p) => p[1]);
    const step = 13 - m.h * 3;
    for (let y = Math.min(...ys); y < Math.max(...ys); y += step) for (let x = Math.min(...xs); x < Math.max(...xs); x += step * 1.3) {
      const px = x + (R() - 0.5) * step, py = y + (R() - 0.5) * step; if (!inPoly(px, py, m.pts)) continue;
      const s = (5 + m.h * 7) * (0.7 + R() * 0.6);
      g.beginPath(); g.moveTo(px - s, py); g.lineTo(px - s * 0.1, py - s * 1.2); g.lineTo(px + s, py); g.closePath(); g.fillStyle = 'rgba(214,200,168,0.95)'; g.fill();
      g.beginPath(); g.moveTo(px - s * 0.1, py - s * 1.2); g.lineTo(px + s, py); g.lineTo(px + s * 0.15, py); g.closePath(); g.fillStyle = 'rgba(90,70,50,0.45)'; g.fill();
      g.beginPath(); g.moveTo(px - s, py); g.lineTo(px - s * 0.1, py - s * 1.2); g.lineTo(px + s, py); g.strokeStyle = 'rgba(58,42,26,0.8)'; g.lineWidth = 0.9; g.stroke();
    }
  }
  // rivers & roads
  g.strokeStyle = 'rgba(50,80,90,0.75)'; for (const r of RIVERS) { g.lineWidth = 0.6 + r.w * 0.45; line(r.pts); g.stroke(); }
  g.setLineDash([4, 3]); g.strokeStyle = 'rgba(110,60,30,0.6)'; g.lineWidth = 1; for (const r of ROADS) { line(r.pts); g.stroke(); } g.setLineDash([]);
  // the Wall
  g.strokeStyle = '#f2f6f8'; g.lineWidth = 4; line(WALL); g.stroke(); g.strokeStyle = 'rgba(40,60,70,0.7)'; g.lineWidth = 1; line(WALL); g.stroke();
  // seats of the great houses
  g.textAlign = 'center';
  for (const h of HOUSES) {
    if (!h.seat || h.landless || !['paramount', 'crown', 'city_state'].includes(h.rank)) continue;
    const [x, y] = h.pos;
    g.fillStyle = '#5a1a12'; g.beginPath(); g.arc(x, y, 3.2, 0, Math.PI * 2); g.fill(); g.strokeStyle = '#e8d8b0'; g.lineWidth = 1; g.stroke();
    g.font = 'italic 600 13px "EB Garamond", Georgia, serif'; g.fillStyle = 'rgba(40,24,14,0.9)'; g.fillText(h.seat.replace(/^The Red Keep, /, '').replace(/,.*$/, ''), x, y - 7);
  }
  // seas
  g.font = 'italic 22px "Cinzel", Georgia, serif'; g.fillStyle = 'rgba(200,190,160,0.45)';
  for (const l of LABELS) if (l.kind === 'sea' && l.s >= 18) { g.save(); g.translate(l.x, l.y); g.rotate(l.rot || 0); g.fillText(l.t, 0, 0); g.restore(); }
  g.restore();
  // compass rose
  const cx = cw * 0.9, cy = ch * 0.82, r = Math.min(cw, ch) * 0.06;
  g.strokeStyle = 'rgba(214,190,140,0.5)'; g.fillStyle = 'rgba(214,190,140,0.35)'; g.lineWidth = 1;
  g.beginPath(); g.arc(cx, cy, r, 0, Math.PI * 2); g.stroke(); g.beginPath(); g.arc(cx, cy, r * 0.8, 0, Math.PI * 2); g.stroke();
  for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2 - Math.PI / 2, l = i % 2 ? r * 0.6 : r * 1.15; g.beginPath(); g.moveTo(cx, cy); g.lineTo(cx + Math.cos(a - 0.12) * l * 0.25, cy + Math.sin(a - 0.12) * l * 0.25); g.lineTo(cx + Math.cos(a) * l, cy + Math.sin(a) * l); g.lineTo(cx + Math.cos(a + 0.12) * l * 0.25, cy + Math.sin(a + 0.12) * l * 0.25); g.closePath(); g.fill(); g.stroke(); }
  g.font = '600 14px "Cinzel", Georgia, serif'; g.textAlign = 'center'; g.fillText('N', cx, cy - r * 1.3);
}
