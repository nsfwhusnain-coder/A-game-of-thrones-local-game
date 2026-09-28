// ═══════════════════════════════════════════════════════════════════════════════════════════════
// THE CITADEL'S SHELVES — a small retrieval index over everything this game knows
//
// The brief asked for a vector database of A Wiki of Ice and Fire behind the Maester agent. This
// game ships with zero npm dependencies and must run offline on a laptop, so there is no Chroma
// and no sqlite-vss here. What there is instead:
//
//   • a dependency-free BM25 index over the lore the game already carries — the personas and
//     their histories, the houses and their words, the scenario's background, the house briefs,
//     every character's biography and secret, and the chronicle of THIS game as it is written;
//   • a drop-in corpus: any .md or .txt file placed in  lore/  (git-ignored) is indexed too, so
//     a player who wants the whole wiki can export it there and the Maester will quote it.
//
// BM25 over a few thousand short passages is instant, needs no model, and — unlike an embedding
// index — never silently returns something plausible and wrong, which is the failure mode that
// matters when the whole point is to stop the model inventing lore.
// ═══════════════════════════════════════════════════════════════════════════════════════════════
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PERSONAS } from '../public/data/histories.js';
import { HOUSES } from '../public/data/houses.js';
import { CHARACTERS } from '../public/data/characters.js';
import { SCENARIOS } from '../public/data/scenarios.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const LORE_DIR = path.join(HERE, '..', 'lore');

const STOP = new Set(('a an and are as at be but by for from has have he her him his i in is it its of on or she that the their them they this to was were will with you your'
  + ' who whom which what when where how why not no nor so than then there these those'). split(' '));

const tokenize = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9' ]+/g, ' ').split(/\s+/)
  .filter((w) => w.length > 2 && !STOP.has(w));

let INDEX = null;

/** Every passage the Citadel holds, each one short enough to quote whole. */
function documents() {
  const docs = [];
  const add = (id, title, text, kind) => { if (text && String(text).trim().length > 24) docs.push({ id, title, text: String(text).trim(), kind }); };

  for (const [id, p] of Object.entries(PERSONAS)) {
    add(`persona:${id}`, id.replace(/_/g, ' '), `${p.history} Courage: ${p.courage}. Wits: ${p.wits}. Guile: ${p.guile}. Pride: ${p.pride}. Temper: ${p.temper}. Swayed by ${p.swayedBy}. Weakness: ${p.weakness}`, 'person');
  }
  for (const h of HOUSES) {
    add(`house:${h.id}`, h.name, `House ${h.name} of ${h.seatName || h.seat || 'its seat'}${h.region ? `, in the ${String(h.region).replace(/_/g, ' ')}` : ''}. Words: "${h.words}". ${h.bio || ''} ${h.history || ''}`, 'house');
  }
  for (const c of CHARACTERS) {
    add(`char:${c.id}`, c.name, `${c.name}${c.title ? `, ${c.title}` : ''} of House ${c.house}. ${c.bio || ''} ${c.traits ? `Traits: ${c.traits}.` : ''}${c.secret ? ` A thing kept secret: ${c.secret}` : ''}`, 'person');
  }
  for (const [id, sc] of Object.entries(SCENARIOS)) {
    for (const [i, l] of (sc.lore || []).entries()) add(`scenario:${id}:${i}`, sc.name, l, 'background');
  }
  // anything the player has dropped in lore/ — a wiki export, their own notes, a house history
  try {
    for (const f of fs.readdirSync(LORE_DIR)) {
      if (!/\.(md|txt)$/i.test(f)) continue;
      const raw = fs.readFileSync(path.join(LORE_DIR, f), 'utf8');
      // split on headings, then on blank lines, so each passage is one idea
      const parts = raw.split(/\n(?=#{1,6}\s)/).flatMap((sec) => {
        const head = (sec.match(/^#{1,6}\s*(.+)/) || [])[1] || f.replace(/\.(md|txt)$/i, '');
        return sec.split(/\n\s*\n/).map((p) => ({ head, p: p.replace(/^#{1,6}\s*.+\n?/, '').trim() }));
      });
      parts.forEach(({ head, p }, i) => add(`file:${f}:${i}`, head, p, 'wiki'));
    }
  } catch { /* no lore/ directory: the shelves hold only what the game ships with */ }
  return docs;
}

/** A BM25 index over any passages ({ id, title, text, … }): the lore's, or a save's facts and chronicle (context/memory.js). */
export function bm25Index(docs) {
  const df = new Map();
  for (const d of docs) {
    d.tf = new Map();
    const toks = tokenize(`${d.title || ''} ${d.text}`);
    d.len = toks.length || 1;
    for (const t of toks) d.tf.set(t, (d.tf.get(t) || 0) + 1);
    for (const t of new Set(toks)) df.set(t, (df.get(t) || 0) + 1);
  }
  const avg = docs.reduce((a, d) => a + d.len, 0) / Math.max(1, docs.length);
  return { docs, df, avg, N: docs.length };
}
/** Each passage's BM25 score for the query (k1 and b at their usual values), best first, only those that match. */
export function bm25Search(ix, query, { k = 6, keep = () => true } = {}) {
  const q = tokenize(query);
  if (!q.length) return [];
  const k1 = 1.4, b = 0.72;
  const scored = [];
  for (const d of ix.docs) {
    if (!keep(d)) continue;
    let s = 0;
    for (const t of q) {
      const f = d.tf.get(t); if (!f) continue;
      const idf = Math.log(1 + (ix.N - (ix.df.get(t) || 0) + 0.5) / ((ix.df.get(t) || 0) + 0.5));
      s += idf * (f * (k1 + 1)) / (f + k1 * (1 - b + b * (d.len / ix.avg)));
    }
    if (s > 0) scored.push({ d, s });
  }
  scored.sort((a, b2) => b2.s - a.s);
  return scored.slice(0, k);
}
const build = () => bm25Index(documents());

export function loreIndex() { if (!INDEX) INDEX = build(); return INDEX; }
/** Rebuild after the player drops new files into lore/ (the server does it on boot). */
export function reloadLore() { INDEX = null; return loreIndex().N; }

/** The lore's passages for a query, best first. */
export function searchLore(query, k = 6, { kinds = null } = {}) {
  return bm25Search(loreIndex(), query, { k, keep: (d) => !kinds || kinds.includes(d.kind) })
    .map(({ d, s }) => ({ id: d.id, title: d.title, kind: d.kind, text: d.text, score: Math.round(s * 100) / 100 }));
}

/**
 * What the Maester should have open on the table this turn: the player's house and neighbours,
 * whoever is at war, whoever the player has just dealt with, and the places in question.
 */
export function loreFor(state, { extra = '', k = 6 } = {}) {
  const p = state.meta?.player;
  const h = state.houses?.[p];
  const bits = [];
  if (h) bits.push(h.name, h.words || '', h.seat ? state.holdings?.[h.seat]?.name || '' : '');
  for (const w of (state.wars || []).filter((x) => x.status !== 'ended').slice(0, 3)) {
    bits.push(w.name, ...(w.attackers || []), ...(w.defenders || []));
  }
  for (const c of Object.values(state.characters || {}).filter((x) => x.alive && x.house === p).slice(0, 8)) bits.push(c.name);
  for (const t of (state.storyThreads || []).slice(0, 4)) bits.push(t.title, t.last);
  for (const o of (state.orders || []).slice(0, 4)) bits.push(o.text);
  bits.push(extra);
  const query = bits.filter(Boolean).join(' ').slice(0, 1200);
  return searchLore(query, k);
}

/** The block that goes into the prompt. Quoted, attributed, and capped so it cannot crowd out the world. */
export function loreBlock(state, opts = {}) {
  const hits = loreFor(state, opts);
  if (!hits.length) return '';
  return 'FROM THE CITADEL\'S SHELVES (true; quote it, build on it, and do not contradict it)\n'
    + hits.map((x) => `- ${x.title}: ${x.text.slice(0, 420)}`).join('\n');
}
