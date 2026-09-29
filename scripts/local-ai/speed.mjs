// Speed micro-benchmark on the game's REAL requests (eval/corpus/*.jsonl, see extract-corpus.mjs). Run on a quiet machine.
// Talks straight to a llama-server (or llama-swap) — no proxy, so nothing but the server is timed.
//
//   node speed.mjs --base http://127.0.0.1:8090 --model x --label g26-64k [--reps 3] [--tests decode,schema,prefill,conc,cache]
//
// Tests (all streaming; times from the server's own `timings` + client wall clock):
//   decode : free-text 300-token continuation of a real narrator prompt (no schema) -> gen tok/s
//   schema : every corpus request per kind, with its schema, temperature and max_tokens -> latency, TTFT, out tokens, tok/s
//   prefill: real prompt with a unique leading token (cold cache) -> prefill tok/s and TTFT
//   cache  : same prompt twice + the same static prefix with a different dossier -> tokens actually re-read
//   conc   : two mind requests at once, slot pinned (both id_slot 1) vs unpinned -> wall time vs one alone
import fs from 'node:fs';
import path from 'node:path';
import { REPO, HOME, RESULTS, CORPUS, SPEED, LOGS } from './paths.mjs';

const a = Object.fromEntries(process.argv.slice(2).reduce((acc, x, i, all) => (x.startsWith('--') ? [...acc, [x.slice(2), all[i + 1] && !all[i + 1].startsWith('--') ? all[i + 1] : true]] : acc), []));
const base = String(a.base || 'http://127.0.0.1:8090').replace(/\/v1\/?$/, ''); const model = a.model || 'local-model'; const label = a.label || 'speed';
const reps = Number(a.reps || 3); const tests = String(a.tests || 'decode,schema,prefill,cache,conc').split(',');
const corpusDir = a.corpus || CORPUS;
const corpus = {}; for (const f of fs.readdirSync(corpusDir).filter((x) => x.endsWith('.jsonl'))) corpus[f.replace('.jsonl', '')] = fs.readFileSync(path.join(corpusDir, f), 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l));
const out = { label, model, base, when: new Date().toISOString(), results: {} };
const q = (arr, p) => { const s = [...arr].sort((x, y) => x - y); return s.length ? s[Math.min(s.length - 1, Math.floor(s.length * p))] : null; };
const mean = (arr) => (arr.length ? arr.reduce((x, y) => x + y, 0) / arr.length : null);
const r1 = (x) => (x == null ? null : Math.round(x * 10) / 10);

async function call({ messages, schema = null, temperature = 0.2, max_tokens = 300, slot = null, extra = {} }) {
  const body = { model, stream: true, stream_options: { include_usage: true }, messages, temperature, max_tokens, cache_prompt: true, chat_template_kwargs: { enable_thinking: false }, ...(slot != null ? { id_slot: slot } : {}), ...extra,
    ...(schema ? { response_format: { type: 'json_schema', json_schema: { name: 'x', strict: true, schema } } } : {}) };
  const t0 = performance.now(); let ttft = null; let text = ''; let last = null;
  const r = await fetch(`${base}/v1/chat/completions`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  if (!r.ok) throw new Error(`HTTP ${r.status} ${(await r.text()).slice(0, 200)}`);
  const dec = new TextDecoder(); let buf = '';
  for await (const chunk of r.body) {
    buf += dec.decode(chunk, { stream: true }); let nl;
    while ((nl = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, nl).trim(); buf = buf.slice(nl + 1);
      if (!line.startsWith('data:') || line.includes('[DONE]')) continue;
      const ev = JSON.parse(line.slice(5)); if (ev.timings) last = ev.timings; if (ev.usage) last = { ...(last || {}), usage: ev.usage };
      const d = ev.choices?.[0]?.delta; if (d?.content || d?.reasoning_content) { if (ttft == null) ttft = performance.now() - t0; text += d.content || ''; }
    }
  }
  const t = last || {};
  return { total: performance.now() - t0, ttft, text, prompt_n: t.prompt_n, cache_n: t.cache_n, pp_s: t.prompt_per_second, gen_n: t.predicted_n, gen_s: t.predicted_per_second, usage: t.usage };
}
const uniq = (msgs) => msgs.map((m, i) => (i === 0 && m.role === 'system' ? { ...m, content: `[run ${Math.random().toString(36).slice(2, 8)}]\n${m.content}` } : m));

// warm-up (GPU clocks, allocator)
const any = Object.values(corpus)[0][0];
await call({ messages: any.messages, schema: any.schema, temperature: 0.2, max_tokens: 60 }).catch(() => {}); await call({ messages: any.messages, schema: any.schema, temperature: 0.2, max_tokens: 60 }).catch(() => {});

if (tests.includes('decode') && corpus.narrate) {
  const nar = corpus.narrate[Math.floor(corpus.narrate.length / 2)]; const rs = [];
  for (let i = 0; i < reps; i++) rs.push(await call({ messages: [...nar.messages.slice(0, -1), { role: 'user', content: nar.messages.at(-1).content + '\n\nWrite the first story as one long scene of about 300 words, plain prose, no JSON.' }], temperature: 0.85, max_tokens: 300 }));
  out.results.decode = { gen_tps: r1(mean(rs.map((x) => x.gen_s))), gen_tps_min: r1(Math.min(...rs.map((x) => x.gen_s))), ttft_ms: Math.round(mean(rs.map((x) => x.ttft))), gen_n: Math.round(mean(rs.map((x) => x.gen_n))) };
  console.log('decode(free text)', out.results.decode);
}
if (tests.includes('schema')) {
  out.results.schema = {};
  for (const [kind, items] of Object.entries(corpus)) {
    const rs = [];
    for (let rep = 0; rep < (kind === 'narrate' ? Math.min(reps, 2) : reps); rep++) for (const it of items) rs.push({ it, ...(await call({ messages: it.messages, schema: it.schema, temperature: it.temperature, max_tokens: it.max_tokens, slot: null })) });
    out.results.schema[kind] = { n: rs.length, total_p50: Math.round(q(rs.map((x) => x.total), 0.5)), total_p95: Math.round(q(rs.map((x) => x.total), 0.95)), ttft_p50: Math.round(q(rs.map((x) => x.ttft), 0.5)), ttft_p95: Math.round(q(rs.map((x) => x.ttft), 0.95)),
      prompt_mean: Math.round(mean(rs.map((x) => (x.prompt_n || 0) + (x.cache_n || 0)))), new_prompt_mean: Math.round(mean(rs.map((x) => x.prompt_n || 0))), out_mean: Math.round(mean(rs.map((x) => x.gen_n || 0))), gen_tps: r1(mean(rs.map((x) => x.gen_s).filter(Boolean))), prefill_tps: r1(mean(rs.filter((x) => (x.prompt_n || 0) > 300).map((x) => x.pp_s))) };
    console.log('schema', kind, out.results.schema[kind]);
  }
}
if (tests.includes('prefill')) {
  out.results.prefill = {};
  for (const kind of ['interpret', 'narrate']) if (corpus[kind]) {
    const it = corpus[kind][corpus[kind].length - 1]; const rs = [];
    for (let i = 0; i < reps; i++) rs.push(await call({ messages: uniq(it.messages), schema: it.schema, temperature: 0.2, max_tokens: 8 }));
    out.results.prefill[kind] = { prompt_n: Math.round(mean(rs.map((x) => x.prompt_n))), prefill_tps: r1(mean(rs.map((x) => x.pp_s))), ttft_ms: Math.round(mean(rs.map((x) => x.ttft))) };
    console.log('prefill(cold)', kind, out.results.prefill[kind]);
  }
}
if (tests.includes('cache') && corpus.mind && corpus.mind.length > 1) {
  const A = corpus.mind[0]; const B = corpus.mind[corpus.mind.length - 1]; const pre = uniq(A.messages);
  const first = await call({ messages: pre, schema: A.schema, max_tokens: 8 }); const again = await call({ messages: pre, schema: A.schema, max_tokens: 8 });
  const sys = pre[0]; const other = await call({ messages: [sys, B.messages[1]], schema: B.schema, max_tokens: 8 });
  out.results.cache = { cold: { new: first.prompt_n, cached: first.cache_n, ttft: Math.round(first.ttft) }, same_again: { new: again.prompt_n, cached: again.cache_n, ttft: Math.round(again.ttft) }, same_static_prefix_new_dossier: { new: other.prompt_n, cached: other.cache_n, ttft: Math.round(other.ttft) } };
  console.log('cache', JSON.stringify(out.results.cache));
}
if (tests.includes('conc') && corpus.mind && corpus.mind.length > 1) {
  out.results.conc = {};
  const [m1, m2] = [corpus.mind[1], corpus.mind[corpus.mind.length - 2]];
  const one = []; for (let i = 0; i < reps; i++) { const t0 = performance.now(); await call({ messages: m1.messages, schema: m1.schema, temperature: 0.6, max_tokens: m1.max_tokens }); one.push(performance.now() - t0); }
  for (const [name, slots] of [['pinned_slot1_both', [1, 1]], ['unpinned', [null, null]], ['slots_0_and_1', [0, 1]]]) {
    const walls = [];
    for (let i = 0; i < reps; i++) { const t0 = performance.now(); await Promise.all([m1, m2].map((m, k) => call({ messages: m.messages, schema: m.schema, temperature: 0.6, max_tokens: m.max_tokens, slot: slots[k] }))); walls.push(performance.now() - t0); }
    out.results.conc[name] = { wall_ms: Math.round(mean(walls)) };
  }
  out.results.conc.single_ms = Math.round(mean(one)); console.log('concurrency (two minds)', JSON.stringify(out.results.conc));
}
fs.mkdirSync(SPEED, { recursive: true }); fs.writeFileSync(`${SPEED}/${label}.json`, JSON.stringify(out, null, 1)); console.log('written speed/' + label + '.json');
