// Summarise a wire.jsonl (from proxy.mjs): per call kind — n, errors, latency p50/p95, TTFT, real prompt tokens, cache hits,
// completion tokens, generation speed, truncations (finish=length), game-level retries, foreign-script replies.
//   node analyze.mjs C:\wc-ai\eval\results\<label>\wire.jsonl [--label-filter substring]
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const FOREIGN = /[Ͱ-ϿЀ-ӿ֐-ۿऀ-෿฀-๿ᄀ-ᇿ⺀-⿟　-鿿가-힯豈-﫿＀-￯]/u; // same set as the game's schema.js
const q = (a, p) => { if (!a.length) return null; const s = [...a].sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.floor(s.length * p))]; };
const mean = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : null);

export function analyzeWire(file, { labelFilter = null } = {}) {
  const rows = fs.existsSync(file) ? fs.readFileSync(file, 'utf8').split('\n').filter(Boolean).map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean) : [];
  const by = {}; const total = { n: 0, errors: 0, foreign: 0, retries: 0, truncated: 0 };
  for (const r of rows) {
    if (labelFilter && !String(r.label).includes(labelFilter)) continue;
    const k = r.kind || 'free'; const t = by[k] = by[k] || { n: 0, errors: 0, total: [], ttft: [], ptok: [], cached: [], ctok: [], tps: [], ppsp: [], foreign: 0, retries: 0, truncated: 0, slots: {} };
    t.n++; total.n++;
    if (r.status !== 200) { t.errors++; total.errors++; continue; }
    t.total.push(r.total_ms); if (r.ttft_ms != null) t.ttft.push(r.ttft_ms);
    const u = r.usage || {}; const tm = r.timings || {};
    const pt = u.prompt_tokens ?? ((tm.prompt_n ?? 0) + (tm.cache_n ?? 0)); if (pt) t.ptok.push(pt);
    if (tm.cache_n != null) t.cached.push(tm.cache_n); const ct = u.completion_tokens ?? tm.predicted_n; if (ct) t.ctok.push(ct);
    if (tm.predicted_per_second) t.tps.push(tm.predicted_per_second); if (tm.prompt_per_second && (tm.prompt_n || 0) > 200) t.ppsp.push(tm.prompt_per_second);
    if (r.finish === 'length') { t.truncated++; total.truncated++; }
    if (FOREIGN.test(r.content || '')) { t.foreign++; total.foreign++; }
    const last = (r.messages || []).at(-1); if (last?.role === 'user' && /^That answer cannot be used:/.test(String(last.content))) { t.retries++; total.retries++; }
    const s = String(r.slot ?? 'auto'); t.slots[s] = (t.slots[s] || 0) + 1;
  }
  const out = { total, kinds: {} };
  for (const [k, t] of Object.entries(by)) out.kinds[k] = { n: t.n, errors: t.errors, retries: t.retries, truncated: t.truncated, foreign: t.foreign, slots: t.slots,
    total_p50: q(t.total, 0.5), total_p95: q(t.total, 0.95), ttft_p50: q(t.ttft, 0.5), ttft_p95: q(t.ttft, 0.95),
    prompt_mean: mean(t.ptok) && Math.round(mean(t.ptok)), prompt_max: t.ptok.length ? Math.max(...t.ptok) : null, cached_mean: mean(t.cached) && Math.round(mean(t.cached)),
    completion_mean: mean(t.ctok) && Math.round(mean(t.ctok)), completion_max: t.ctok.length ? Math.max(...t.ctok) : null,
    gen_tps_mean: mean(t.tps) && +mean(t.tps).toFixed(1), prefill_tps_mean: mean(t.ppsp) && Math.round(mean(t.ppsp)) };
  return out;
}

export function fmtWire(w) {
  const f = (x) => (x == null ? '—' : x);
  const lines = ['| call | n | err | retry | trunc | foreign | p50 ms | p95 ms | ttft p50 | ttft p95 | prompt mean/max | cached mean | out mean/max | gen t/s | prefill t/s |', '|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|'];
  for (const [k, t] of Object.entries(w.kinds)) lines.push(`| ${k} | ${t.n} | ${t.errors} | ${t.retries} | ${t.truncated} | ${t.foreign} | ${f(t.total_p50)} | ${f(t.total_p95)} | ${f(t.ttft_p50)} | ${f(t.ttft_p95)} | ${f(t.prompt_mean)}/${f(t.prompt_max)} | ${f(t.cached_mean)} | ${f(t.completion_mean)}/${f(t.completion_max)} | ${f(t.gen_tps_mean)} | ${f(t.prefill_tps_mean)} |`);
  return lines.join('\n');
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url))) {
  const file = process.argv[2]; const i = process.argv.indexOf('--label-filter');
  console.log(fmtWire(analyzeWire(file, { labelFilter: i > 0 ? process.argv[i + 1] : null })));
}
