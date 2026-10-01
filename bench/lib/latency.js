// The latency suite (docs/gdd/04-ai-system.md §13; gate Q3 in docs/gdd/01-vision.md): a scripted fortnight of play, timed by phase. A few 7-day jumps, one 30-day jump, an audience reply and an order's receipt, each against the Q3 pace:
//   7-day jump ≤ 45 s median and ≤ 75 s at the 95th; 30-day jump ≤ 90 s; audience reply ≤ 12 s; receipt ≤ 5 s.
// It plays in a scratch copy of the server (bench/lib/sandbox.js), on whatever the config names: the mock gives the engine's own time (CI proves the suite runs and reports); the owner's model gives the real one.
// The per-call table (how long each kind of call took, how many tokens it was sent, how often it had to be asked again) is read from the scratch game's call log, which the suite turns on.
import fs from 'node:fs';
import path from 'node:path';

/** The pace the game promises (01 §Q3), in milliseconds. */
export const Q3 = { jump7: { p50: 45000, p95: 75000 }, jump30: { p50: 90000 }, audience: 12000, receipt: 5000 };
export const PHASES = ['orders', 'minds', 'engine', 'narrate', 'total'];

const quantile = (xs, q) => { if (!xs.length) return 0; const s = [...xs].sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.floor(q * s.length))]; };

/**
 * `game` is the scratch server's game.js; `saves` its saves directory (for the call log). Returns `{ jumps7, jump30, audience, receipt, calls, house }`, every time in ms.
 * `jumps`: how many 7-day jumps. `talk`: [character, words] for the audience (an own man, so it is face to face and not a raven).
 */
export async function runLatencySuite({ game, saves, house = 'stark', seed = 7, jumps = 4, longSpan = '30d', talk = ['rodrik_cassel', 'Ser Rodrik, how fares the garrison, and what do the men say?'], order = 'Send Jory Cassel to Moat Cailin with fifty riders to hold the Neck.', onStep = null } = {}) {
  const { id } = game.newGame('agot_298', house, { seed });
  const jump = async (span) => {
    const t0 = Date.now(); const r = await game.advance(id, { span }); await game.settled(id);
    const row = { span, wall: Date.now() - t0, phases: { ...(r.turn?.ms || {}) }, events: (r.turn?.events || []).length };
    onStep?.(row); return row;
  };
  const jumps7 = []; for (let i = 0; i < jumps; i++) jumps7.push(await jump('7d'));
  const jump30 = await jump(longSpan);
  let t0 = Date.now(); let audience = null;
  try { await game.talk(id, talk[0], talk[1]); audience = { ms: Date.now() - t0 }; } catch (e) { audience = { ms: Date.now() - t0, error: e.message }; }
  game.setOrders(id, [...game.loadState(id).orders, { id: 'lat1', text: order }]);
  t0 = Date.now(); let receipt = null;
  try { await game.previewOrderPlans(id); receipt = { ms: Date.now() - t0 }; } catch (e) { receipt = { ms: Date.now() - t0, error: e.message }; }
  return { house, seed, id, jumps7, jump30, audience, receipt, calls: callsOf(saves, id) };
}

/** Per kind of call, from the scratch game's call log: how many attempts, how long (p50, p95), how many tokens sent, how many were refused by the game's own checks. */
export function callsOf(saves, id) {
  const f = saves && path.join(saves, id, 'llm-calls.jsonl'); if (!f || !fs.existsSync(f)) return [];
  const by = {};
  for (const line of fs.readFileSync(f, 'utf8').split('\n')) {
    if (!line) continue; let x; try { x = JSON.parse(line); } catch { continue; }
    const k = by[x.kind] = by[x.kind] || { kind: x.kind, ms: [], tokens: [], refused: 0, n: 0 };
    k.n++; if (Number.isFinite(x.ms)) k.ms.push(x.ms); if (Number.isFinite(x.promptTokens)) k.tokens.push(x.promptTokens); if (x.accepted === false) k.refused++;
  }
  return Object.values(by).map((k) => ({ kind: k.kind, n: k.n, p50: quantile(k.ms, 0.5), p95: quantile(k.ms, 0.95), tokens: Math.round(k.tokens.reduce((a, b) => a + b, 0) / Math.max(1, k.tokens.length)), refused: k.refused })).sort((a, b) => a.kind.localeCompare(b.kind));
}

/** The gates, each `{ name, ok, got, gate }`: the pace of Q3. */
export function verdicts(r) {
  const w = r.jumps7.map((x) => x.wall);
  return [
    { name: '7-day jump, median', ok: quantile(w, 0.5) <= Q3.jump7.p50, got: `${(quantile(w, 0.5) / 1000).toFixed(1)} s`, gate: `≤ ${Q3.jump7.p50 / 1000} s` },
    { name: '7-day jump, 95th percentile', ok: quantile(w, 0.95) <= Q3.jump7.p95, got: `${(quantile(w, 0.95) / 1000).toFixed(1)} s`, gate: `≤ ${Q3.jump7.p95 / 1000} s` },
    { name: '30-day jump', ok: r.jump30.wall <= Q3.jump30.p50, got: `${(r.jump30.wall / 1000).toFixed(1)} s`, gate: `≤ ${Q3.jump30.p50 / 1000} s` },
    { name: 'audience reply', ok: !r.audience?.error && r.audience.ms <= Q3.audience, got: r.audience?.error ? `error: ${r.audience.error}` : `${(r.audience.ms / 1000).toFixed(1)} s`, gate: `≤ ${Q3.audience / 1000} s` },
    { name: 'order receipt', ok: !r.receipt?.error && r.receipt.ms <= Q3.receipt, got: r.receipt?.error ? `error: ${r.receipt.error}` : `${(r.receipt.ms / 1000).toFixed(1)} s`, gate: `≤ ${Q3.receipt / 1000} s` },
  ];
}

export function latencyReport(r, { reader = '' } = {}) {
  const v = verdicts(r); const s = (ms) => (ms == null ? '—' : `${(ms / 1000).toFixed(1)}`);
  const row = (label, xs) => `| ${label} | ${PHASES.map((p) => { const a = xs.map((x) => x.phases?.[p]).filter(Number.isFinite); return a.length ? `${s(quantile(a, 0.5))} / ${s(quantile(a, 0.95))}` : '—'; }).join(' | ')} | ${s(quantile(xs.map((x) => x.wall), 0.5))} / ${s(quantile(xs.map((x) => x.wall), 0.95))} |`;
  return [
    `# Latency suite${reader ? ` — ${reader}` : ''}`, '',
    '| pace (Q3) | got | needs | |', '|---|---|---|---|', ...v.map((x) => `| ${x.name} | ${x.got} | ${x.gate} | ${x.ok ? 'ok' : 'OVER'} |`), '',
    `House ${r.house}, seed ${r.seed}: ${r.jumps7.length} jumps of seven days and one of ${r.jump30.span}, then an audience and a receipt. Seconds, median / 95th percentile, by phase of the jump (the server's own clock) and the wall time around it.`, '',
    `| jump | ${PHASES.join(' | ')} | wall |`, `|---|${PHASES.map(() => '---').join('|')}|---|`, row('7 days', r.jumps7), row(r.jump30.span, [r.jump30]), '',
    ...(r.calls.length ? ['| call | attempts | p50 ms | p95 ms | prompt tokens | refused by the game |', '|---|---|---|---|---|---|', ...r.calls.map((c) => `| ${c.kind} | ${c.n} | ${Math.round(c.p50)} | ${Math.round(c.p95)} | ${c.tokens} | ${c.refused} |`), ''] : ['_No call log: the run asked the model for nothing, or the log was off._', '']),
  ].join('\n');
}
