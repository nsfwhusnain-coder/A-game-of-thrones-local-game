// Reproducible end-to-end gameplay evidence. This starts the real HTTP server with the offline model,
// drives the same API as the browser, and prints hard state beside the chronicle that describes it.
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const PORT = Number(process.env.EVIDENCE_PORT || 3422);
const saves = fs.mkdtempSync(path.join(os.tmpdir(), 'wc-evidence-'));
const srv = spawn(process.execPath, ['server/index.js'], { cwd: ROOT, env: { ...process.env, PORT: String(PORT), WC_PROVIDER: 'mock', WC_SAVES: saves }, stdio: ['ignore', 'pipe', 'pipe'] });
let serverErr = ''; srv.stderr.on('data', (b) => { serverErr += b; });
const api = async (p, body) => {
  const r = await fetch(`http://127.0.0.1:${PORT}/api${p}`, body === undefined ? {} : { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  const j = await r.json(); if (!r.ok) throw new Error(j.error || `${r.status}`); return j;
};
const wait = async () => { for (let i = 0; i < 80; i++) { try { return await api('/version'); } catch { await new Promise((r) => setTimeout(r, 75)); } } throw new Error('server did not start: ' + serverErr); };
const fmtDate = (d) => `${d.day}/${d.month}/${d.year}`;
const order = async (id, texts) => {
  const orders = texts.map((text, i) => ({ id: `e${Date.now()}_${i}`, text }));
  await api(`/games/${id}/orders`, { orders });
  const p = await api(`/games/${id}/orders/preview`, {});
  console.log('RECEIPTS'); for (const o of p.orders) console.log(`  ${o.text} => ${(o.preview || []).join(' | ')}`);
  return p.orders;
};
function print(label, r) {
  const s = r.state; console.log(`\n=== ${label} — turn ${s.meta.turn}, ${fmtDate(s.meta.date)} ===`);
  console.log('ARMIES');
  for (const a of Object.values(s.armies).filter((x) => x.owner === 'stark' || x.serving === 'stark' || s.houses[x.owner]?.liege === 'stark').sort((a, b) => a.id.localeCompare(b.id))) {
    const bag = a.baggage ? `${Math.round(a.baggage.provisions).toLocaleString()} rations/${a.baggage.wagons} wagons` : 'not yet inventoried';
    console.log(`  ${a.id} | ${a.name} | ${a.men.toLocaleString()} men | at=${a.at || 'road'} | march=${a.march ? `${a.march.pending ? 'pending:' : ''}${a.march.to}` : 'none'} | ${a.status} | ${bag} | motion=${JSON.stringify(a.motion || null)} | muster=${a.muster ? `${a.muster.remaining} remaining` : 'complete'}`);
  }
  const L = s.houses.stark.ledger?.at(-1); console.log('LEDGER');
  if (L) for (const l of L.lines.slice(-8)) console.log(`  ${l.kind} | ${l.label} | ${Math.round(l.amount).toLocaleString()}${l.note ? ` | ${l.note}` : ''}`); else console.log('  (no reckoning yet)');
  console.log('EVENTS');
  for (const e of r.turn.events.filter((x) => !x.bg).slice(0, 14)) console.log(`  day ${e.day} | ${e.title} | ${e.text}${e.details ? ` | DETAILS: ${e.details}` : ''}`);
  console.log('SUMMARY'); console.log(String(r.turn.summary || '').replace(/\n/g, ' / '));
}

try {
  const version = await wait(); console.log(`SERVER ${JSON.stringify(version)} provider=mock saves=${saves}`);
  const { id } = await api('/games', { scenario: 'agot_298', house: 'stark' });
  console.log(`GAME ${id} created through POST /api/games`);

  let orders = await order(id, [
    'Raise six thousand levies at Winterfell under Robb as the Northern Host.',
    'Call all my banners to muster at Winterfell.',
    'Borrow 5,000 gold dragons from the Iron Bank for grain and baggage wagons.',
  ]);
  let r = await api(`/games/${id}/advance`, { span: '1d', orders }); print('DAY ONE: PARTIAL CAMPS', r);
  r = await api(`/games/${id}/advance`, { span: '1w', orders: [] }); print('ONE WEEK: CAMPS HAVE GROWN', r);
  r = await api(`/games/${id}/advance`, { span: '1w', orders: [] }); print('TWO WEEKS: THE OWN HOST IS FULL', r);
  r = await api(`/games/${id}/advance`, { span: '1m', orders: [] }); print('BANNERMEN GATHER ON THEIR OWN DATES', r);

  orders = await order(id, ['Order all my bannermen to join the Northern Host wherever it is.']);
  r = await api(`/games/${id}/advance`, { span: '1d', orders }); print('EXPLICIT JOIN ORDER: REMOTE HOSTS PURSUE', r);
  for (let i = 1; i <= 4; i++) { r = await api(`/games/${id}/advance`, { span: '1m', orders: [] }); print(`PURSUIT MONTH ${i}`, r); const sworn = Object.values(r.state.armies).filter((a) => a.serving === 'stark'); if (!sworn.length) break; }

  orders = await order(id, ['March the Northern Host north of the Wall.']);
  r = await api(`/games/${id}/advance`, { span: '1w', orders }); print('RUNNING CLOCK: HOST ON THE ROAD NORTH', r);

  orders = await order(id, ['March the Northern Host to the Palace of Fallen Stars.']);
  r = await api(`/games/${id}/advance`, { span: '1d', orders }); print('UNKNOWN PLACE: EXPLICIT REFUSAL, OLD ROAD PRESERVED', r);

  console.log('\nEVIDENCE COMPLETE');
} finally {
  srv.kill(); fs.rmSync(saves, { recursive: true, force: true });
}
