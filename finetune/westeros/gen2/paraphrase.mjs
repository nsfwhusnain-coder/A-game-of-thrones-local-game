// Interpret data with human-like phrasing diversity: rephrase the game's human-written GOLD training orders (never the dev/holdout ones).
//   node paraphrase.mjs --base http://127.0.0.1:8090 --repo C:/wc-ai/game/latest --variants 8 --out C:/wc-ai/finetune/pool/interpret-para.jsonl
// A rephrasing is kept only if: it keeps every name and number of the original; it is not (nearly) a dev/holdout order; the game's own check() accepts the
// gold label for it; the label round-trips (readingOf) to the gold expectation; and the game's rule pre-parser does not read it differently.
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const a = Object.fromEntries(process.argv.slice(2).reduce((acc, x, i, all) => (x.startsWith('--') ? [...acc, [x.slice(2), all[i + 1] && !all[i + 1].startsWith('--') ? all[i + 1] : true]] : acc), []));
const REPO = a.repo || 'C:/wc-ai/game/latest'; const BASE = String(a.base || 'http://127.0.0.1:8090').replace(/\/+$/, ''); const NV = Number(a.variants || 8); const OUT = a.out || 'C:/wc-ai/finetune/pool/interpret-para.jsonl'; const LIMIT = Number(a.limit || 0);
const imp = (p) => import(pathToFileURL(path.join(REPO, p)).href);
const IC = await imp('server/ai/calls/interpret.js'); const { parseOrder } = await imp('server/orders/parse.js'); const { compare, loadSuite, worldFor } = await imp('bench/lib/interpret.js');
const call = IC.default;
const norm = (t) => String(t).toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim();
const words = (t) => new Set(norm(t).split(' ').filter(Boolean));
const NUMW = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12, twenty: 20, thirty: 30, forty: 40, fifty: 50, hundred: 100, thousand: 1000 };
const numbersOf = (t) => [...String(t).toLowerCase().matchAll(/\d[\d,]*|\b(?:one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|twenty|thirty|forty|fifty|hundred|thousand)\b/g)].map((m) => m[0].replace(/,/g, '')).map((x) => (/^\d/.test(x) ? x : String(NUMW[x])));
const namesOf = (t) => [...String(t).matchAll(/\b[A-Z][a-z']+(?:\s+(?:of|the)\s+[A-Z][a-z']+|\s+[A-Z][a-z']+)*/g)].map((m) => m[0]).filter((x, i) => !(i === 0 && /^(Send|Write|Raise|Call|Hire|Build|Take|Have|Let|Tell|Make|March|Halt|Free|Merge|Disband|Declare|Hold|Grant|Recall|Pay|Fill|Ask|Find|Put|Plant|Dig|Ride|Go|Keep|Train|Double|Remind|Offer|Order|Stand|Set|Lower|Repair|Give|Summon|Ransom|Execute|Release|Lay|Fund|Expand|Strengthen|Charter|Found|Open|Return|Restore|Crush|Tax|Learn|Name|Hang|Sail|Move|Throw|Squeeze|Sell)$/.test(x)));
const SCHEMA = { type: 'object', additionalProperties: false, required: ['variants'], properties: { variants: { type: 'array', minItems: 4, maxItems: NV, items: { type: 'string', maxLength: 160 } } } };

async function variantsOf(text) {
  const body = { messages: [{ role: 'system', content: 'You help write realistic orders for a medieval fantasy strategy game. A lord dictates orders to his household.' },
    { role: 'user', content: `Here is an order a lord gave:\n"${text}"\n\nWrite ${NV} different ways the same lord (or another lord) might say EXACTLY the same thing: same meaning, same request, nothing added, nothing dropped. Keep every person's name, place name and number exactly as written. Vary the sentence structure, the verbs and the tone (blunt, formal, weary, impatient, polite). Each is one or two short sentences, in plain English of a medieval court, no modern slang. Answer as JSON.` }],
    temperature: 0.95, max_tokens: 700, response_format: { type: 'json_schema', json_schema: { name: 'variants', strict: true, schema: SCHEMA } }, chat_template_kwargs: { enable_thinking: false } };
  const r = await fetch(`${BASE}/v1/chat/completions`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  const j = await r.json(); try { return JSON.parse(j.choices[0].message.content).variants || []; } catch { return []; }
}

// test orders to keep out of the training data, and the gold train orders with their worlds
const dev = []; const gold = [];
for (const suite of loadSuite(path.join(REPO, 'bench/suites/interpret'))) { const state = worldFor(suite); suite.items.forEach((it, i) => { if (i % 3 === 0) dev.push(it.text); else gold.push({ it, suite, state }); }); }
for (const suite of loadSuite(path.join(REPO, 'bench/suites/interpret-holdout'))) for (const it of suite.items) dev.push(it.text);
const devSet = dev.map((t) => ({ n: norm(t), w: words(t) }));
const nearDev = (t) => { const n = norm(t); const w = words(t); return devSet.some((x) => x.n === n || (w.size >= 4 && x.w.size >= 4 && [...w].filter((y) => x.w.has(y)).length / new Set([...w, ...x.w]).size >= 0.8)); };
const labelOf = (item) => (item.story ? { actions: [], letter: null, clarify: null } : item.clarify ? { actions: [], letter: null, clarify: { question: item.clarify.question, options: [] } } : { actions: item.actions || [], letter: item.letter ? { to: item.letter } : null, clarify: null });

fs.mkdirSync(path.dirname(OUT), { recursive: true }); fs.writeFileSync(OUT, '');
const S = { gold: 0, asked: 0, candidates: 0, kept: 0, drops: {} }; const drop = (w) => { S.drops[w] = (S.drops[w] || 0) + 1; };
const work = LIMIT ? gold.slice(0, LIMIT) : gold; const seen = new Set();
async function one({ it, suite, state }) {
  S.gold++; const e = it.expect;
  const item = (text) => (e.clarify ? { text, clarify: { question: 'What exactly is to be done, my lord?', options: [] } } : e.story ? { text, story: true } : e.letter ? { text, letter: e.letter, actions: [] } : { text, actions: e.actions });
  if (near0(it.text)) return; S.asked++;
  const cands = await variantsOf(it.text); const origNames = namesOf(it.text).map(norm); const origNums = numbersOf(it.text);
  for (const v of cands) {
    S.candidates++; const text = String(v).replace(/\s+/g, ' ').trim(); if (!text || text.length < 6) { drop('empty'); continue; }
    if (norm(text) === norm(it.text)) { drop('same as original'); continue; }
    const key = `${suite.house}|${norm(text)}`; if (seen.has(key)) { drop('duplicate'); continue; } seen.add(key);
    if (nearDev(text)) { drop('near a test order'); continue; }
    const tl = norm(text); if (!origNames.every((n) => tl.includes(n) || n.split(' ').every((p) => tl.includes(p)))) { drop('lost a name'); continue; }
    const nn = numbersOf(text); if (!origNums.every((n) => nn.includes(n))) { drop('lost a number'); continue; } if (nn.some((n) => !origNums.includes(n))) { drop('added a number'); continue; }
    let ctx; try { ctx = call.context(structuredClone(state), { text, house: suite.house }); } catch { drop('no context'); continue; }
    const target = IC.valueOf(labelOf(item(text)), ctx); const problems = call.check(target, ctx); if (problems.length) { drop('check: ' + problems[0].replace(/[a-z_]+\d*/i, '').slice(0, 30)); continue; }
    const reading = IC.readingOf(structuredClone(target), state, { house: suite.house }); if (!compare(e, reading).exact) { drop('roundtrip'); continue; }
    const ps = parseOrder(state, text, { house: suite.house }); if (ps.complete && !ps.clarify && !compare(e, ps).exact) { drop('rules disagree'); continue; }
    const messages = [...call.prompt(ctx), { role: 'assistant', content: JSON.stringify(target) }];
    fs.appendFileSync(OUT, JSON.stringify({ id: `para-${it.id}-${S.kept}`, source: 'gold-paraphrase', family: 'gold-para', house: suite.house, text, expect: e, oracle: 'gold', of: it.id, messages }) + '\n'); S.kept++;
  }
}
function near0() { return false; }
const conc = Number(a.conc || 6); let idx = 0;
await Promise.all(Array.from({ length: conc }, async () => { while (idx < work.length) { const g = work[idx++]; try { await one(g); } catch (err) { drop('error ' + err.message.slice(0, 30)); } if (idx % 20 === 0) console.log(`gold ${idx}/${work.length} kept ${S.kept}/${S.candidates}`); } }));
console.log(JSON.stringify(S)); fs.writeFileSync(OUT.replace(/\.jsonl$/, '.stats.json'), JSON.stringify(S, null, 1));
