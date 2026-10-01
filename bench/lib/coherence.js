// The coherence checker (docs/gdd/15-qa-tooling.md §3; WP H3): does the story the game tells agree with the world it keeps? Run over any game — the soak's, the playtest's, the owner's own save — from three things the server already keeps: the
// state as it stands, the fact log, and each turn's record (cards, minds, digest). Pure: it reads and reports, changes nothing.
//   Class A (must be zero): a broken invariant of the world (state/validate.js); a dead character acting; a captive acting freely; a character arriving in two places on one day; a party arriving that never set out; a letter delivered before it
//                           could be; a card with no fact behind it; the player's own men in the last turn's books differing from the state's.
//   Class B (at most one in ten turns): a game word, a ledger phrase or an anachronism in a card; a rumour told as fact; a place named that is not on the route; a title a character does not hold.
//   Class C (report only): the same headline twice in ten turns; a Meanwhile or a digest over its budget; the same lord's same decision three turns running.
// The matchers are the narration validator's own (style data, anachronisms), so a card its scorer would refuse is a card this reports.
import { BOILERPLATE, JARGON, FORBIDDEN } from '../../public/data/style.js';
import { anachronismsIn } from '../../public/data/anachronisms.js';
import { PLACE_NAMES } from '../../public/data/geography.js';
import { validate } from '../../public/js/engine/state/validate.js';
import { placePos, placeName } from '../../public/js/shared/world.js';
import { isRumour } from '../../public/js/ui/feed.js';
import { figuresOf } from '../../public/js/engine/realm/figures.js';

const BAD = [...BOILERPLATE, ...JARGON, ...FORBIDDEN].map((p) => ({ p, re: new RegExp(p, 'i') }));
/** A word that tells of hearsay: a rumour is not a rumour told as fact when it says whose word it is. */
const HEDGE = /\b(rumou?rs?|rumou?red|said|says|word|whisper\w*|report\w*|claim\w*|tell|tells|told|tale|tales|talk|hear\w*|heard|learn\w*|it is thought|they say|some say|is believed|reportedly|allegedly|unconfirmed)\b/i;
/** What a person does, as opposed to what is done to them: only a doer can be dead or held and be said to do it (a fact's first actor). */
const DOES = new Set(['set_out', 'arrived', 'embarked', 'landed', 'crossed', 'host_formed', 'call_answered', 'levies_called', 'gift', 'feast', 'tourney', 'judgement', 'tax_changed', 'grain_bought', 'embargo', 'bribe', 'bribe_refused', 'loan_taken', 'loan_repaid', 'works_begun', 'men_hired']);
const MOVES = new Set(['set_out', 'embarked', 'landed', 'returned', 'crossed', 'turned_back', 'delayed', 'host_formed', 'host_joined', 'call_answered', 'levies_called']);
const ROUTE = new Set(['set_out', 'arrived', 'crossed', 'returned', 'turned_back', 'delayed', 'embarked', 'landed']);
const DEATHS = new Set(['death', 'slain_in_battle', 'executed']);
const HELD = new Set(['captured', 'captured_in_battle']);
const FREED = new Set(['released', 'ransomed', 'fled', 'vanished']);
/** A place is on a route if it is the fact's own, the destination, or within this many map units of where it set out (about eighty miles). */
const NEAR = 45;
/** What a digest may run to (docs/gdd/18-headlines.md: ≤ 90 words in all) and its Meanwhile (one sentence). */
const DIGEST_WORDS = 90, MEANWHILE_WORDS = 45;
const TITLES = { King: /\bking\b/i, Queen: /\bqueen\b/i, Prince: /\bprince\b/i, Princess: /\bprincess\b/i };
const TITLED = /\b(King|Queen|Prince|Princess)\s+([A-Z][\w'’-]+)(?:\s+([A-Z][\w'’-]+))?/g;

const words = (t) => String(t || '').trim().split(/\s+/).filter(Boolean).length;
const cardText = (c) => `${c.headline || c.title || ''}\n${c.summary ?? c.text ?? ''}`; // (the parts apart: "…near Rain House" then "The…" is not the ledger's "house the")
const partsOf = (c) => [c.headline || c.title || '', c.summary ?? c.text ?? '', ...(Array.isArray(c.details) ? c.details : [])].filter(Boolean);
const cardName = (c, n = 80) => String(c.headline || c.title || '').slice(0, n);
const namesOfPlaces = Object.entries(PLACE_NAMES).map(([id, name]) => ({ id, name })).filter((p) => p.name && p.name.length >= 4).sort((a, b) => b.name.length - a.name.length);
const dist = (a, b) => (a && b ? Math.hypot(a[0] - b[0], a[1] - b[1]) : Infinity);

/**
 * `{ state, facts, turns }`: the world as it stands, every fact of the game, the turn records (each `{ turn, events, digest, minds, realm }`).
 * Returns `{ A, B, C, stats }`, each list of `{ rule, text, turn? }`.
 */
export function coherence({ state, facts = [], turns = [] }) {
  const A = [], B = [], C = [];
  const flag = (list, rule, text, turn) => list.push({ rule, text, ...(turn != null ? { turn } : {}) });
  const nameOf = (id) => state.characters?.[id]?.name || id;
  const player = state.meta?.player;
  // by the day, a man set free before what he does that day (a beat frees him and sends him riding in one stroke, the ride first in the log)
  const byDay = [...facts].sort((a, b) => (a.day ?? 0) - (b.day ?? 0) || (FREED.has(a.kind) ? 0 : 1) - (FREED.has(b.kind) ? 0 : 1) || String(a.id).localeCompare(String(b.id), 'en', { numeric: true }));
  const factById = new Map(facts.map((f) => [f.id, f]));

  // ── Class A ──
  // the world's own invariants (one place, one activity, letters that land, a ledger that adds up, …)
  for (const v of validate(state)) flag(A, 'a broken invariant of the world', v);
  // a dead character acts, a captive acts freely: the first actor of a doer's fact
  const died = new Map(), held = new Map();
  for (const f of byDay) {
    const who = f.actors?.[0]; if (!who) continue;
    if (DEATHS.has(f.kind)) { if (!died.has(who)) died.set(who, f.day ?? 0); continue; }
    if (HELD.has(f.kind)) { held.set(who, f.day ?? 0); continue; }
    if (FREED.has(f.kind)) { held.delete(who); continue; }
    if (!DOES.has(f.kind)) continue;
    if (died.has(who) && (f.day ?? 0) > died.get(who)) flag(A, 'a dead character acts', `${nameOf(who)} — ${f.kind} on day ${f.day}, after dying on day ${died.get(who)} (${f.id}: ${f.text || ''})`.slice(0, 220), f.turn);
    else if (f.kind !== 'arrived' && held.has(who) && (f.day ?? 0) > held.get(who)) flag(A, 'a captive acts freely', `${nameOf(who)} — ${f.kind} on day ${f.day}, held since day ${held.get(who)} (${f.id}: ${f.text || ''})`.slice(0, 220), f.turn);
  }
  // one person arrives in one place a day
  const arrived = new Map();
  for (const f of byDay) {
    if (f.kind !== 'arrived' || !f.place) continue;
    for (const who of f.actors || []) { const k = `${who}@${f.day}`; const was = arrived.get(k); if (was && was.place !== f.place) flag(A, 'in two places on one day', `${nameOf(who)} reaches ${was.place} and ${f.place} on day ${f.day} (${was.id}, ${f.id})`, f.turn); else if (!was) arrived.set(k, f); }
  }
  // a party arrives only after setting out
  const moved = new Set();
  for (const f of byDay) {
    const party = f.data?.party; if (!party) continue;
    if (MOVES.has(f.kind)) moved.add(party);
    else if (f.kind === 'arrived' && !moved.has(party)) flag(A, 'an arrival without a movement', `${party} reaches ${PLACE_NAMES[f.place] || f.place || 'a place'} (${f.id}), but no fact has it set out`, f.turn);
  }
  // a letter lands after it is sent, and is delivered no earlier than it lands
  for (const l of state.post || []) {
    if (l.arriveDay != null && l.sentDay != null && l.arriveDay <= l.sentDay) flag(A, 'a letter before it could arrive', `to ${l.toName || l.to}: due on day ${l.arriveDay}, sent on day ${l.sentDay}`);
    if (Number.isFinite(l.delivered) && l.arriveDay != null && l.delivered < l.arriveDay) flag(A, 'a letter before it could arrive', `to ${l.toName || l.to}: delivered on day ${l.delivered}, before day ${l.arriveDay}`);
  }
  // a card has a fact behind it
  for (const t of turns) for (const e of t.events || []) {
    const ids = [e.fact, ...(e.facts || [])].filter(Boolean);
    if (!ids.length) flag(A, 'a card with no fact', `"${cardName(e)}" is backed by no fact`, t.turn);
    else if (facts.length && !ids.some((id) => factById.has(id))) flag(A, 'a card with no fact', `"${cardName(e)}" names ${ids[0]}, which is not in the log`, t.turn);
  }
  // the player's own men: the last turn's books (the sample the realm ledger keeps) say what the state says
  const last = turns.at(-1)?.realm?.h?.[player];
  if (last && state.houses?.[player] && !(state.orders || []).length) { const now = figuresOf(state, player); const i = state.realmStats?.fields?.indexOf('swords'); if (i >= 0 && now && last[i] !== now.swords) flag(A, 'the player\'s own men differ from the state', `the books of turn ${turns.at(-1).turn} say ${last[i]} swords, the state ${now.swords}`, turns.at(-1).turn); }

  // ── Class B ──
  const cards = turns.flatMap((t) => (t.events || []).map((e) => ({ ...e, turn: t.turn })));
  for (const c of cards) {
    const bad = BAD.find((b) => partsOf(c).some((t) => b.re.test(t))); if (bad) flag(B, 'a game word or a ledger phrase', `"${cardName(c)}": /${bad.p}/`, c.turn);
    for (const a of partsOf(c).flatMap((t) => anachronismsIn(state, t))) flag(B, 'an anachronism', `"${a.phrase}" in "${cardName(c, 60)}" (${a.note})`, c.turn);
    // a rumour is told as a rumour: a card that is hearsay by its own marks says whose word it is, in its words or in the line the drawer adds
    const fs = [c.fact, ...(c.facts || [])].filter(Boolean).map((id) => factById.get(id)).filter(Boolean);
    if (fs.some((f) => f.kind === 'rumour' || f.vis?.scope === 'rumour') && !isRumour(c) && !HEDGE.test(cardText(c))) flag(B, 'a rumour told as fact', `"${cardName(c)}" is a rumour, and neither the card nor its words say so`, c.turn);
    // a place named is on the route: a journey's card names where it began, where it goes, and where it is, and no other place
    if (fs.length && fs.every((f) => ROUTE.has(f.kind)) && !c.bg) {
      const plain = (n) => String(n || '').replace(/^the\s+/i, '').toLowerCase();
      const ok = new Set(); for (const f of fs) for (const id of [f.place, f.data?.to, f.data?.from, f.data?.at, f.data?.via]) if (id) { ok.add(id); ok.add(plain(placeName(state, id))); ok.add(plain(PLACE_NAMES[id])); }
      const near = (p) => ok.has(p.id) || ok.has(plain(p.name)) || fs.some((f) => dist(f.pos, placePos(p.id, state.holdings)) <= NEAR);
      // a person's or a house's name is not a place (Lyonel Ashford crosses at Blackhaven): the actors' names and the houses' go from the text before the places are looked for
      const own = [...new Set(fs.flatMap((f) => (f.actors || []).flatMap((id) => { const n = state.characters?.[id]?.name; return n ? [n, n.replace(/^(?:Ser|Lord|Lady|Maester|King|Queen|Prince|Princess)\s+/, '')] : []; })))].sort((a, b) => b.length - a.length);
      const named = []; let rest = ` ${cardText(c)} `; for (const n of own) rest = rest.split(n).join(' ');
      for (const p of namesOfPlaces) { const re = new RegExp(`(?<![\\w'’])${p.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![\\w])`); if (re.test(rest)) { named.push(p); rest = rest.replace(re, ' '); } }
      for (const p of named) if (!near(p)) flag(B, 'a place named that is not on the route', `"${cardName(c)}" names ${p.name}; the facts are at ${[...new Set(fs.flatMap((f) => [f.place, f.data?.to, f.data?.from].filter(Boolean)))].map((id) => placeName(state, id)).join(', ') || 'no named place'}`, c.turn);
    }
    // a title is held: a "King Robert" is a king, a "Queen" a queen, a "Prince" a prince, by the people of that name the game keeps
    for (const m of cardText(c).matchAll(TITLED)) {
      const [, title, first, second] = m; const re = TITLES[title]; if (!re) continue;
      const people = Object.values(state.characters || {}).filter((p) => { const n = String(p.name || '').replace(/^(?:Ser|King|Queen|Prince|Princess|Lord|Lady|Maester)\s+/, '').split(/\s+/); return n[0] === first && (!second || n.slice(1).includes(second) || !/^[A-Z]/.test(second)); });
      if (people.length && !people.some((p) => re.test(p.title || '') || re.test(p.name || ''))) flag(B, 'a title a character does not hold', `"${title} ${first}${second ? ` ${second}` : ''}" in "${cardName(c, 60)}": ${people.slice(0, 2).map((p) => `${p.name} is ${p.title || 'untitled'}`).join('; ')}`, c.turn);
    }
  }

  // ── Class C ──
  const seen = new Map();
  for (const c of cards.filter((x) => !x.bg)) {
    const h = String(c.headline || c.title || '').toLowerCase().trim(); if (!h) continue;
    const was = seen.get(h); if (was != null && c.turn !== was && c.turn - was <= 10) flag(C, 'the same headline twice in ten turns', `"${c.headline || c.title}" (turns ${was} and ${c.turn})`, c.turn);
    seen.set(h, c.turn);
  }
  for (const t of turns) {
    const d = t.digest || {};
    if (d.words > DIGEST_WORDS) flag(C, 'a digest over its budget', `${d.words} words (the budget is ${DIGEST_WORDS})`, t.turn);
    if (words(d.meanwhile) > MEANWHILE_WORDS) flag(C, 'a Meanwhile over its budget', `${words(d.meanwhile)} words (the budget is ${MEANWHILE_WORDS})`, t.turn);
  }
  const run = new Map(), lastSeen = new Map();
  for (const t of turns) for (const m of t.minds || []) {
    if (!m.verb || m.verb === 'wait') continue; const k = `${m.actor}:${m.verb}`; if (lastSeen.get(k) === t.turn) continue;
    const n = lastSeen.get(k) === t.turn - 1 ? (run.get(k) || 1) + 1 : 1; run.set(k, n); lastSeen.set(k, t.turn);
    if (n === 3) flag(C, 'the same decision three turns running', `${nameOf(m.actor)} ${String(m.verb).replace(/_/g, ' ')} in turns ${t.turn - 2}–${t.turn}`, t.turn);
  }

  return { A, B, C, stats: { turns: turns.length, facts: facts.length, cards: cards.length } };
}

/** The verdicts: Class A zero, Class B at most one in ten turns; Class C is for reading. */
export function verdict(r) {
  const per10 = r.stats.turns ? (r.B.length * 10) / r.stats.turns : r.B.length;
  return { A: r.A.length === 0, B: per10 <= 1, perTen: Math.round(per10 * 100) / 100, pass: r.A.length === 0 && per10 <= 1 };
}

/** The report, in the form the owner pastes back: the counts and verdicts first, then every item of A and B, then what C found. */
export function coherenceReport(r, { title = 'Coherence', limit = 40 } = {}) {
  const v = verdict(r);
  const list = (xs) => (xs.length ? xs.slice(0, limit).map((x) => `- ${x.rule}: ${x.text}${x.turn != null ? ` (turn ${x.turn})` : ''}`).join('\n') + (xs.length > limit ? `\n- … and ${xs.length - limit} more` : '') : '- none');
  return [
    `## ${title}`, '',
    `${r.stats.turns} turns, ${r.stats.facts} facts, ${r.stats.cards} cards. **${v.pass ? 'Pass' : 'Fail'}.**`, '',
    '| class | found | gate | verdict |', '|---|---|---|---|',
    `| A — the story contradicts the world | ${r.A.length} | none | ${v.A ? 'ok' : 'FAIL'} |`,
    `| B — a game word, an anachronism, a rumour as fact, a wrong place or title | ${r.B.length} (${v.perTen} in ten turns) | at most one in ten turns | ${v.B ? 'ok' : 'FAIL'} |`,
    `| C — repetition and length | ${r.C.length} | report only | — |`, '',
    '### Class A', list(r.A), '', '### Class B', list(r.B), '', '### Class C', list(r.C), '',
  ].join('\n');
}

/** A game as the server keeps it: its state, its facts, its turn records. `game` is `server/game.js`, `id` a save. */
export function readGame(game, id) {
  const state = game.loadState(id); const facts = game.readFacts(id, { limit: 20000 }); const turns = [];
  for (let n = 1; n <= state.meta.turn; n++) { try { turns.push(game.readTurn(id, n)); } catch { /* a turn too old to keep */ } }
  return { state, facts, turns };
}
