// A shareable leaf of the map chronicle: the live map, the date, and the events the player
// actually learned. It is made entirely in the browser and never sends a campaign anywhere.
const wrap = (ctx, text, x, y, width, lineHeight, maxLines = 4) => {
  const words = String(text || '').replace(/\s+/g, ' ').trim().split(' '); let line = '', n = 0;
  for (const word of words) {
    const next = line ? `${line} ${word}` : word;
    if (ctx.measureText(next).width > width && line) { ctx.fillText(line, x, y + n++ * lineHeight); line = word; if (n >= maxLines) return y + n * lineHeight; } else line = next;
  }
  if (line && n < maxLines) ctx.fillText(line, x, y + n++ * lineHeight);
  return y + n * lineHeight;
};
const slug = (s) => String(s || 'chronicle').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

export async function exportMapChronicle(map, state) {
  if (!map?.renderer?.domElement || !state) throw new Error('The painted map is not ready yet.');
  // Render once immediately before copying. WebGL canvases may discard yesterday's drawing buffer.
  map.renderer.render(map.scene, map.camera);
  const source = map.renderer.domElement, canvas = document.createElement('canvas');
  canvas.width = 1800; canvas.height = 1125; const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#17130e'; ctx.fillRect(0, 0, canvas.width, canvas.height);
  const scale = Math.max(canvas.width / source.width, canvas.height / source.height);
  const sw = canvas.width / scale, sh = canvas.height / scale;
  ctx.drawImage(source, (source.width - sw) / 2, (source.height - sh) / 2, sw, sh, 0, 0, canvas.width, canvas.height);
  const turn = state.history?.at(-1); const house = state.houses[state.meta.player];
  // Sooted vellum rather than a floating white card: the map remains visible beneath the report.
  const grad = ctx.createLinearGradient(0, 620, 0, 1125); grad.addColorStop(0, 'rgba(20,15,10,0)'); grad.addColorStop(0.18, 'rgba(20,15,10,.88)'); grad.addColorStop(1, 'rgba(9,7,5,.97)');
  ctx.fillStyle = grad; ctx.fillRect(0, 560, 1800, 565);
  ctx.strokeStyle = house?.color || '#c9a44a'; ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(80, 733); ctx.lineTo(1720, 733); ctx.stroke();
  ctx.fillStyle = '#ead9b8'; ctx.font = '700 48px Georgia, serif'; ctx.fillText(`THE CHRONICLE OF HOUSE ${(house?.name || '').toUpperCase()}`, 80, 690);
  ctx.fillStyle = '#c9a44a'; ctx.font = '600 25px Georgia, serif'; ctx.fillText(turn?.date || `Turn ${state.meta.turn}`, 82, 724);
  ctx.fillStyle = '#e9dfca'; ctx.font = 'italic 25px Georgia, serif';
  let y = wrap(ctx, turn?.summary || state.meta.scenarioName, 80, 782, 1640, 34, 3) + 18;
  const events = (turn?.events || []).filter((e) => !e.bg).sort((a, b) => (b.importance || 0) - (a.importance || 0)).slice(0, 4);
  ctx.font = '700 24px Georgia, serif';
  for (const e of events) {
    ctx.fillStyle = '#c9a44a'; ctx.fillText(`DAY ${e.day || 1}  ·  ${String(e.title || '').toUpperCase()}`, 82, y); y += 31;
    ctx.fillStyle = '#ddd1ba'; ctx.font = '22px Georgia, serif'; y = wrap(ctx, e.text, 82, y, 1640, 29, 2) + 14; ctx.font = '700 24px Georgia, serif';
    if (y > 1080) break;
  }
  ctx.fillStyle = 'rgba(235,221,194,.65)'; ctx.font = '17px Georgia, serif'; ctx.textAlign = 'right'; ctx.fillText('Westeros Chronicles · the engine keeps the reckoning; the chronicle keeps the memory', 1720, 1090); ctx.textAlign = 'left';
  const blob = await new Promise((resolve, reject) => canvas.toBlob((b) => b ? resolve(b) : reject(new Error('The map could not be painted.')), 'image/png'));
  const url = URL.createObjectURL(blob), a = document.createElement('a');
  a.href = url; a.download = `${slug(house?.name)}-chronicle-turn-${state.meta.turn}.png`; a.click(); setTimeout(() => URL.revokeObjectURL(url), 2000);
  return a.download;
}
