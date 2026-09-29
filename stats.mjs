// Heuristic grader for the "before" cards. Reads the turn files of the three playtests (playtest/<id>/turns) and the
// 6-turn Stark dump (before-stark-6.cards.json). All checks are string heuristics; the report says which are manual.
import fs from 'node:fs';
import path from 'node:path';

const REPO = '/home/user/A-game-of-thrones-local-game/playtest';
const SCRATCH = path.dirname(new URL(import.meta.url).pathname);

const runs = [];
for (const d of fs.readdirSync(REPO)) {
  const p = path.join(REPO, d);
  if (!fs.statSync(p).isDirectory()) continue;
  const state = JSON.parse(fs.readFileSync(path.join(p, 'state.json'), 'utf8'));
  const turns = fs.readdirSync(path.join(p, 'turns')).sort().map((f) => JSON.parse(fs.readFileSync(path.join(p, 'turns', f), 'utf8')));
  runs.push({ name: d.split('-')[0] + ' (playtest)', state, turns });
}
// the no-orders stark dump: reuse the stark playtest's lexicon (same world data)
const dumpCards = JSON.parse(fs.readFileSync(path.join(SCRATCH, 'before-stark-6.cards.json'), 'utf8'));
const dumpTurns = {};
for (const c of dumpCards) (dumpTurns[c.turn] ||= []).push(c);
runs.push({ name: 'stark (no-orders dump)', state: runs.find((r) => r.name.startsWith('stark')).state, turns: Object.entries(dumpTurns).map(([t, events]) => ({ turn: Number(t), events })) });

const STOP = new Set(['House', 'The', 'King', 'Lord', 'Lady', 'Ser', 'Old', 'A', 'An', 'Host', 'Men', 'Ser', 'Maester', 'Queen', 'Prince', 'Princess']);
const words = (s) => String(s || '').trim().split(/\s+/).filter(Boolean);
const toks = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9' ]+/g, ' ').split(/\s+/).filter(Boolean);
const capTokens = (s) => (String(s || '').match(/\b[A-Z][A-Za-z'’-]*/g) || []).filter((w) => !STOP.has(w));

function lexicon(state) {
  const chars = Object.values(state.characters).map((c) => c.name);
  const houses = Object.values(state.houses).map((h) => h.name);
  const places = [...Object.values(state.holdings).map((h) => h.name), ...Object.values(state.holdings).map((h) => h.fullName)].filter(Boolean);
  const tokset = new Set();
  for (const n of [...chars, ...houses, ...places]) for (const t of n.match(/[A-Za-z'’-]+/g) || []) tokset.add(t.toLowerCase());
  const nick = ['greatjon', 'smalljon', 'blackfish', 'kingslayer'];
  nick.forEach((n) => tokset.add(n));
  return { chars, houses, places, tokset };
}

const BOIL = /(is raised|sets? out|rides? for|calls? up|begins? works|answers? the call|takes? ship|host now numbers|banners of|\bstrong\b|levies|charter|sworn lords|\bhost of house\b|house the |house [a-z']+ of [a-z]|nymeros|_)/i;
const PUNCT = /[();:—…~]|\.$/;
const PROCESS = /(is raised|sets? out|rides? for|calls? up|begins? works|take ship|grows in the fields|not himself|not itself)/i;
const VERBKEYS = ['rides for', 'sets out', 'holds a tourney', 'holds a feast', 'feasts', 'calls up', 'begins works', 'answers the call', 'take ship', 'is dead', 'is champion', 'comes to nothing', 'is raised', 'grows in the fields', 'passes', 'land on', 'not himself', 'holds a'];
const keyOf = (t) => { const l = t.toLowerCase(); const k = VERBKEYS.find((v) => l.includes(v)); return k || toks(t).filter((w) => /^[a-z]/.test(w)).slice(0, 2).join(' '); };

const rows = [];
for (const run of runs) {
  const lex = lexicon(run.state);
  for (const tr of run.turns) {
    const per = tr.events;
    // near-dup groups per turn
    const groups = {};
    for (const e of per) (groups[keyOf(e.title)] ||= []).push(e);
    for (const e of per) {
      const title = e.title || ''; const text = e.text || ''; const details = e.details;
      const w = words(title).length;
      const a = w <= 12;
      const personInTitle = lex.chars.some((n) => title.includes(n) || n.split(' ').some((p) => p.length > 3 && !STOP.has(p) && new RegExp(`\\b${p}\\b`).test(title) && lex.chars.filter((m) => m.split(' ').includes(p)).length <= 3));
      const personInText = lex.chars.some((n) => text.includes(n));
      const houseInTitle = lex.houses.some((n) => title.includes(n.split(' of ')[0])) ;
      const who = personInTitle || (houseInTitle && !personInText);
      const placeInText = lex.places.some((n) => n && text.includes(n.replace(/^The /, '')));
      const placeInTitle = lex.places.some((n) => n && title.includes(n.replace(/^The /, '')));
      const needsPlace = !!e.where || placeInText;
      const b = who && (!needsPlace || placeInTitle);
      const c = !PROCESS.test(title);
      const dReasons = [];
      if (/\d/.test(title)) dReasons.push('digits'); if (BOIL.test(title)) dReasons.push('boiler'); if (PUNCT.test(title)) dReasons.push('punct');
      const d = dReasons.length === 0;
      const COMMON = new Set(['isles','from','talk','late','blight','blood','sisters','little','guardians','northern','pirates','lord\'s','swan','smoking','sea','bells','birds','bell','bloody','gate','table','beacon','bell']);
      const unknown = capTokens(title).filter((t) => !lex.tokset.has(t.toLowerCase())).map((t) => t.replace(/['’]s$/, '')).filter((t) => !COMMON.has(t.toLowerCase()) && t.toLowerCase() !== 'littlefinger' && !lex.tokset.has(t.toLowerCase()) && !toks(text + ' ' + (details || '')).includes(t.toLowerCase()));
      const eOk = unknown.length === 0;
      const grp = groups[keyOf(title)];
      const f = grp.length < 2;
      const tt = toks(title); const xx = new Set(toks(text));
      const overlap = tt.length ? tt.filter((t) => xx.has(t)).length / tt.length : 1;
      const SW = new Set(['the','a','an','of','at','to','in','for','and','with','is','are','has','have','by','on','from','as','it','its','his','her','their','that','this','who','will','be','was','were']);
      const tset = new Set(toks(title)); const newWords = [...new Set(toks(text))].filter((t) => !tset.has(t) && !SW.has(t)).length;
      const g = !!text && text !== title && newWords >= 3;
      rows.push({ run: run.name, turn: tr.turn, id: e.id, title, text, details, bg: !!e.bg, imp: e.importance, words: w, a, b, who, needsPlace, placeInTitle, c, d, dReasons, e: eOk, unknown, f, key: keyOf(title), gsize: grp.length, g, overlap: +overlap.toFixed(2), newWords, textEqDetails: details !== undefined && text === details, detailsStartsWithText: typeof details === 'string' && details.startsWith(text) && details !== text, hasDetails: details !== undefined });
    }
  }
}
fs.writeFileSync(path.join(SCRATCH, 'rows.json'), JSON.stringify(rows, null, 1));

const pct = (n, d) => (d ? (100 * n / d).toFixed(0) + '%' : 'n/a');
const mean = (xs) => (xs.reduce((s, x) => s + x, 0) / (xs.length || 1)).toFixed(1);
function report(label, R) {
  const turns = new Set(R.map((r) => r.run + '|' + r.turn));
  const perTurn = [...turns].map((k) => R.filter((r) => r.run + '|' + r.turn === k));
  const nb = R.filter((r) => !r.bg);
  const perTurnNb = perTurn.map((t) => t.filter((r) => !r.bg).length);
  console.log(`\n=== ${label}: ${R.length} cards (${nb.length} non-bg) over ${turns.size} turns ===`);
  console.log(`cards/turn all: mean ${mean(perTurn.map((t) => t.length))} max ${Math.max(...perTurn.map((t) => t.length))}; non-bg: mean ${mean(perTurnNb)} max ${Math.max(...perTurnNb)}`);
  console.log(`words/title: mean ${mean(R.map((r) => r.words))} max ${Math.max(...R.map((r) => r.words))} (non-bg mean ${mean(nb.map((r) => r.words))}, max ${Math.max(...nb.map((r) => r.words))})`);
  for (const [k, n] of [['a <=12 words', 'a'], ['b who+where', 'b'], ['c finished event', 'c'], ['d no jargon/boilerplate/digits/punct', 'd'], ['e no invented name (auto)', 'e'], ['f one card per story (not in a same-verb group)', 'f'], ['g text adds to title', 'g']]) {
    console.log(`  ${k}: all ${pct(R.filter((r) => r[n]).length, R.length)}   non-bg ${pct(nb.filter((r) => r[n]).length, nb.length)}`);
  }
  const all = (r) => r.a && r.b && r.c && r.d && r.e && r.f && r.g;
  console.log(`  passes a-g together: all ${pct(R.filter(all).length, R.length)}   non-bg ${pct(nb.filter(all).length, nb.length)}`);
  const withDetails = R.filter((r) => r.hasDetails);
  console.log(`text===details: ${R.filter((r) => r.textEqDetails).length}/${R.length} cards (${pct(R.filter((r) => r.textEqDetails).length, R.length)}); of cards that have details: ${pct(withDetails.filter((r) => r.textEqDetails).length, withDetails.length)}; details = text + more: ${withDetails.filter((r) => r.detailsStartsWithText).length}; no details at all: ${R.filter((r) => !r.hasDetails).length}; non-bg with text===details: ${pct(nb.filter((r) => r.textEqDetails).length, nb.length)}`);
  const dup = perTurn.map((t) => { const g = {}; for (const r of t) (g[r.key] ||= []).push(r); const big = Object.entries(g).filter(([, v]) => v.length >= 2); return { inGroups: big.reduce((s, [, v]) => s + v.length, 0), biggest: big.sort((x, y) => y[1].length - x[1].length)[0] }; });
  console.log(`cards per turn in a same-verb group (>=2): mean ${mean(dup.map((x) => x.inGroups))} max ${Math.max(...dup.map((x) => x.inGroups))}; biggest group sizes: ${dup.map((x) => (x.biggest ? x.biggest[0] + '×' + x.biggest[1].length : '-')).join(' | ')}`);
  const dr = {}; for (const r of R) for (const x of r.dReasons) dr[x] = (dr[x] || 0) + 1; console.log('d reasons:', JSON.stringify(dr));
}
report('ALL RUNS', rows);
for (const run of runs) report(run.name, rows.filter((r) => r.run === run.name));
// distinct-verb ratio (H9), per turn: distinct keys / non-bg cards
const dv = []; for (const k of new Set(rows.map((r) => r.run + '|' + r.turn))) { const t = rows.filter((r) => r.run + '|' + r.turn === k && !r.bg); if (t.length >= 2) dv.push(new Set(t.map((r) => r.key)).size / t.length); }
console.log(`\ndistinct main-verb ratio per turn (non-bg): mean ${(100 * dv.reduce((s, x) => s + x, 0) / dv.length).toFixed(0)}%`);
console.log('\nunknown capitalised tokens in titles (rule e candidates):', JSON.stringify([...new Set(rows.flatMap((r) => r.unknown))]));
console.log('\nno-place-in-title although place in text/where (non-bg):', rows.filter((r) => !r.bg && r.needsPlace && !r.placeInTitle).length, '/', rows.filter((r) => !r.bg).length);
console.log('who fails (non-bg):', rows.filter((r) => !r.bg && !r.who).length, '/', rows.filter((r) => !r.bg).length);
