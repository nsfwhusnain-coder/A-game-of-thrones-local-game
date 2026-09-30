// Score every candidate's narrations with ONE fixed judge model (the game's own JUDGE prompt and 1–5 rubric), so no model
// grades its own prose. Reads narrate replies from each run's wire.jsonl. Run against any server holding the judge model.
//   node judge.mjs --base http://127.0.0.1:8090 --model judge --runs qwen36-256k-baseline,gemma26-64k-owner [--max 60]
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { REPO, HOME, RESULTS, CORPUS, SPEED, LOGS } from './paths.mjs';

const a = Object.fromEntries(process.argv.slice(2).reduce((acc, x, i, all) => (x.startsWith('--') ? [...acc, [x.slice(2), all[i + 1] && !all[i + 1].startsWith('--') ? all[i + 1] : true]] : acc), []));
const base = String(a.base || 'http://127.0.0.1:8090').replace(/\/v1\/?$/, ''); const model = a.model || 'judge'; const max = Number(a.max || 60);
const REPO_ = a.repo || REPO;
const { JUDGE, judgeSchema } = await import(pathToFileURL(path.join(REPO_, 'bench/lib/narrate.js')).href);
const ask = async (ev) => {
  const body = { model, stream: false, temperature: 0.2, max_tokens: 160, chat_template_kwargs: { enable_thinking: false },
    response_format: { type: 'json_schema', json_schema: { name: 'judge', strict: true, schema: judgeSchema } },
    messages: [{ role: 'system', content: JUDGE }, { role: 'user', content: `HEADLINE: ${ev.headline}\nLINE: ${ev.line}\nSCENE: ${ev.scene}\nPOV: ${ev.pov}` }] };
  const r = await fetch(`${base}/v1/chat/completions`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  const j = await r.json(); return JSON.parse(j.choices[0].message.content);
};
for (const run of String(a.runs).split(',')) {
  const wf = `${RESULTS}/${run}/wire.jsonl`; if (!fs.existsSync(wf)) { console.log('no wire log for', run); continue; }
  const events = [];
  for (const l of fs.readFileSync(wf, 'utf8').split('\n').filter(Boolean)) {
    const r = JSON.parse(l); if (r.kind !== 'narrate' || r.status !== 200) continue;
    try { for (const e of JSON.parse(r.content).events || []) if (e.scene) events.push(e); } catch { /* unreadable reply */ }
  }
  const step = Math.max(1, Math.floor(events.length / max)); const pick = events.filter((_, i) => i % step === 0).slice(0, max);
  const scored = []; for (const e of pick) { try { scored.push({ ...e, ...(await ask(e)) }); } catch (err) { /* skip */ } }
  const scores = scored.map((s) => s.score); const mean = scores.reduce((x, y) => x + y, 0) / Math.max(1, scores.length);
  const dist = [1, 2, 3, 4, 5].map((k) => scores.filter((s) => s === k).length);
  fs.writeFileSync(`${RESULTS}/${run}/judge.json`, JSON.stringify({ judge: model, n: scored.length, mean: +mean.toFixed(2), dist, scored }, null, 1));
  console.log(`${run}: judge mean ${mean.toFixed(2)} over ${scored.length} events; distribution 1..5 = ${dist.join('/')}`);
}
