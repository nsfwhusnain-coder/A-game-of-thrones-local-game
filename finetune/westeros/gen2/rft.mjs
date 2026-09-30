// Filtered self-distillation ("rejection-sampling fine-tuning") data generator for the game's model calls.
//   node rft.mjs --kind mind --gen suite|natural --repo C:/wc-ai/game/latest --base http://127.0.0.1:8090 --teacher gemma4-12b
//                --n 400 --k 3 --conc 4 --seed 20000 --out C:/wc-ai/finetune/pool/mind-suite.jsonl [--provider mock] [--append]
//   kinds: mind (gen suite|natural) | narrate | audience | council | director | consolidate
// Per scenario the model is asked up to k times with the game's own prompt and sampler route; the first answer that (1) passes
// the game's own check on the first try, (2) is clean (no foreign script / anachronism / post-298 spoiler) and (3) satisfies the
// kind's oracle (mind: the situation's in-character verbs) becomes a training row; the rest are counted by reason and dropped.
import fs from 'node:fs';
import path from 'node:path';
import { loadGame, makeCfg, sampleOnce, judge, extraIssues, compact, pool } from './lib.mjs';

const a = Object.fromEntries(process.argv.slice(2).reduce((acc, x, i, all) => (x.startsWith('--') ? [...acc, [x.slice(2), all[i + 1] && !all[i + 1].startsWith('--') ? all[i + 1] : true]] : acc), []));
const kind = a.kind; const provider = a.provider || 'openai'; const k = Number(a.k || 3); const conc = Number(a.conc || 4);
const n = Number(a.n || 100); const seed = Number(a.seed || 1000); const teacher = a.teacher || 'gemma4-12b'; const repo = a.repo || 'C:/wc-ai/game/latest';
const out = a.out || `C:/wc-ai/finetune/pool/${kind}${a.gen ? '-' + a.gen : ''}.jsonl`; fs.mkdirSync(path.dirname(out), { recursive: true });
const done = new Set(); if (a.append && fs.existsSync(out)) for (const l of fs.readFileSync(out, 'utf8').split('\n').filter(Boolean)) done.add(JSON.parse(l).id); else fs.writeFileSync(out, '');

const G = await loadGame(repo);
const cfg = makeCfg(G, a.base || 'http://127.0.0.1:8090', teacher);
const S = { kind, gen: a.gen || null, repo, teacher, provider, k, scenarios: 0, unbuildable: 0, empty: 0, accepted: 0, firstTry: 0, attempts: 0, errors: 0, reasons: {}, rows: 0, promptChars: 0, answerChars: 0, started: new Date().toISOString() };
const norm = (s) => String(s).replace(/\d[\d,.]*/g, '#').replace(/"[^"]{1,40}"/g, '"…"').slice(0, 80);
const why = (r) => { S.reasons[norm(r)] = (S.reasons[norm(r)] || 0) + 1; };

async function generator() {
  const X = { games: Number(a.games || 24), turns: Number(a.turns || 8), seedBase: seed };
  if (kind === 'mind') { const m = await import('./scen_mind.mjs'); return a.gen === 'natural' ? m.natural(G, { ...X, perTurn: Number(a.perTurn || 3) }) : m.suiteLike(G, { seedBase: seed, n }); }
  if (kind === 'narrate') return (await import('./scen_narrate.mjs')).weeks(G, X);
  const v = await import('./scen_voices.mjs');
  const map = { audience: v.audiences, council: v.councils, director: v.directors, consolidate: v.consolidations };
  if (!map[kind]) throw new Error(`unknown kind ${kind}`);
  return map[kind](G, X);
}
async function* limited(it) { let c = 0; for await (const sc of it) { if (done.has(sc.id)) continue; if (c++ >= n) return; yield sc; } }

const save = (row) => { fs.appendFileSync(out, JSON.stringify(row) + '\n'); S.rows++; S.promptChars += row.messages.slice(0, -1).reduce((s, m) => s + m.content.length, 0); S.answerChars += row.messages.at(-1).content.length; };

async function one(sc) {
  S.scenarios++; const call = G.CALLS[sc.kind];
  if (sc.custom) { // narrate: the game's own narrateTurn builds the stories and the prompt
    for (let i = 0; i < k; i++) {
      S.attempts++; let r; try { r = await sc.custom(cfg, provider); } catch (e) { S.errors++; why(`error: ${e.message}`); continue; }
      if (r.empty) { S.empty++; S.attempts--; return; }
      if (!r.first) { why('no first telling captured'); continue; }
      if (!r.clean) { why(`not clean first time: ${Object.keys(r.problems).join(',') || 'retry/plain'}`); continue; }
      let raw; try { raw = JSON.parse(r.first.text); } catch { why('unreadable json'); continue; }
      const iss = extraIssues(G, sc.state, raw); if (iss.length) { why(iss[0]); continue; }
      if (i === 0) S.firstTry++; S.accepted++;
      save({ id: sc.id, kind, source: 'rft', teacher, meta: { ...sc.meta, attempt: i + 1, stories: r.stories }, messages: [...r.first.messages, { role: 'assistant', content: compact(raw) }] });
      return;
    }
    return;
  }
  let ctx, schema, messages;
  try { G.withRng(sc.state, () => { ctx = call.context(sc.state, sc.args); }); schema = call.schema(ctx); messages = call.prompt(ctx); } catch (e) { S.unbuildable++; why(`unbuildable: ${e.message}`); return; }
  for (let i = 0; i < k; i++) {
    S.attempts++; let r; try { r = await sampleOnce(G, kind, ctx, messages, schema, cfg, provider); } catch (e) { S.errors++; why(`error: ${e.message}`); continue; }
    const jd = judge(G, kind, ctx, schema, r.text);
    if (jd.problems.length) { why(`game check: ${jd.problems[0]}`); continue; }
    const iss = extraIssues(G, sc.state, jd.value); if (iss.length) { why(iss[0]); continue; }
    const no = sc.accept?.(jd.value, ctx); if (no) { why(`oracle: ${no}`); continue; }
    if (i === 0) S.firstTry++; S.accepted++;
    save({ id: sc.id, kind, source: 'rft', teacher, meta: { ...sc.meta, attempt: i + 1 }, messages: [...messages, { role: 'assistant', content: compact(jd.raw) }] });
    return;
  }
}

const t0 = Date.now(); let lastLog = 0;
const timer = setInterval(() => { if (Date.now() - lastLog > 20000) { lastLog = Date.now(); console.log(`[${kind}${a.gen ? ':' + a.gen : ''}] scenarios ${S.scenarios} accepted ${S.accepted} (first try ${S.firstTry}) attempts ${S.attempts} errors ${S.errors} | ${((Date.now() - t0) / 60000).toFixed(1)} min`); } }, 5000);
await pool(limited(await generator()), conc, one);
clearInterval(timer);
S.finished = new Date().toISOString(); S.minutes = +((Date.now() - t0) / 60000).toFixed(1); S.acceptRate = S.scenarios ? +(S.accepted / S.scenarios).toFixed(3) : 0; S.firstTryRate = S.scenarios ? +(S.firstTry / S.scenarios).toFixed(3) : 0;
S.avgTokens = S.rows ? Math.round((S.promptChars + S.answerChars) / S.rows / 3.6) : 0;
S.reasons = Object.fromEntries(Object.entries(S.reasons).sort((x, y) => y[1] - x[1]).slice(0, 25));
fs.writeFileSync(out.replace(/\.jsonl$/, '') + `.stats-${Date.now()}.json`, JSON.stringify(S, null, 1));
console.log(JSON.stringify({ ...S, reasons: undefined }, null, 0)); console.log('top reasons:', JSON.stringify(S.reasons, null, 0).slice(0, 1500));
process.exit(0);
