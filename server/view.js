// The player's view (docs/gdd/03-architecture.md §10; invariant 10 of §14). The browser is never sent a truth the
// player's house does not know: other houses' hosts are where the house believes them to be (or absent), their
// marches and plans are theirs, others' secrets and hidden hearts stay hidden, letters not yet arrived are not read,
// and the realm's minds keep their counsel. The engine and the models work on the whole truth; only this leaves.
import { knowledgeOf, eyesOf, seesParty, knows } from '../public/js/engine/knowledge.js';
import { forces, idOf } from '../public/js/engine/parties.js';
import { moodWord } from '../public/js/shared/temperament.js';
import { shapeCard, digestOf } from '../public/js/engine/facts/digest.js';

// what a seen host shows of itself: its banners, its numbers, who leads it — not where it is going
const SEEN = ['id', 'kind', 'owner', 'serving', 'name', 'commander', 'at', 'men', 'pos', 'members', 'state', 'composition', 'ships', 'public', 'exile', 'contingents'];
// what a report says: whose, how many, where — no more
const REPORTED = ['id', 'kind', 'owner', 'name'];
const pick = (o, keys) => Object.fromEntries(keys.filter((k) => o[k] !== undefined).map((k) => [k, o[k]]));
// two significant figures: "about 2,800,000", as a maester's estimate is
const about = (v) => { const n = Number(v); if (!Number.isFinite(n) || !n) return n; const p = 10 ** Math.max(0, Math.floor(Math.log10(Math.abs(n))) - 1); return Math.round(n / p) * p; };

/** A promise a lord made in a letter of the player's whose answer has not landed: it was made the day the letter arrived, and is read by the player when the raven brings it back. */
export const onTheRoad = (state, c) => c.source?.type === 'letter' && (state.post || []).some((l) => l.reply && l.replyTo === c.source.ref && l.status === 'in flight');

/** The state as the player's house knows it. Never mutates `state`. */
export function playerView(state) {
  if (!state?.meta || !state.parties) return state;
  const me = state.meta.player; const E = eyesOf(state, me); const k = knowledgeOf(structuredClone({ knowledge: state.knowledge || {}, meta: state.meta }), me);
  const t = state.meta.turn;
  const friends = E.friends;
  // hosts: our own and our friends' as they are; others as seen, or as reported, or not at all
  const parties = {}; const hidden = new Set(); const isForce = new Set(forces(state));
  for (const a of Object.values(state.parties)) {
    if (friends.has(a.owner) || (a.serving && friends.has(a.serving))) { parties[a.id] = a; continue; }
    const force = isForce.has(a);
    if (seesParty(state, me, a, E)) { parties[a.id] = { ...pick(a, SEEN), known: 'seen', age: 0, source: 'seen' }; continue; }
    const rep = k.parties[a.id];
    if (force && rep && t - rep.turn <= 4) { parties[a.id] = { ...pick(a, REPORTED), pos: rep.pos, men: rep.men, known: 'reported', age: t - rep.turn, source: rep.source, ...(rep.false ? { false: true } : {}), members: [] }; hidden.add(a.id); continue; }
    hidden.add(a.id);
  }
  // people: others' secrets and hidden hearts stay theirs; whoever rides with a host we cannot see is somewhere unknown
  const characters = {};
  for (const c of Object.values(state.characters)) {
    const mine = c.house === me;
    let x = c;
    if (!mine) {
      const { secret, stress, paranoia, memories, ...rest } = c;
      x = { ...rest, ...(secret && !c.secretKnown ? { secretHidden: true } : secret ? { secret } : {}) };
    }
    if (!mine && hidden.has(idOf(c.loc))) x = { ...x, loc: 'unknown' };
    characters[c.id] = x;
  }
  // houses: others' coffers and levies as estimates, and no ledgers
  const houses = {};
  for (const h of Object.values(state.houses)) {
    if (friends.has(h.id)) { houses[h.id] = h; continue; }
    const { ledger, ...rest } = h;
    houses[h.id] = { ...rest, figures: Object.fromEntries(Object.entries(h.figures || {}).map(([key, f]) => [key, f && typeof f === 'object' && 'v' in f ? { ...f, v: about(f.v) } : f])) };
  }
  // what the house has noted of the other houses' strength is asked of the server (GET /realm), never read from the state:
  // the browser has no use for it (`k` is a clone of the house's own knowledge, so the save is not touched)
  delete k.realm;
  const view = {
    ...state, parties, characters, houses,
    // the position of the save's dice would let a page foretell what the next roll gives (bug hunt SV5); the browser has no use for it
    meta: { ...state.meta, rngState: undefined },
    // our own knowledge only; the other houses' are theirs
    knowledge: { [me]: k },
    // the realm's minds keep their counsel; replies still on the road are not yet read; tempers are read in faces
    minds: undefined, pendingReplies: undefined,
    moods: Object.fromEntries(Object.entries(state.moods || {}).map(([id, m]) => [id, { turn: m.turn, full: m.full, patience: m.patience, closed: m.closed, word: moodWord(m) }])),
    // promises: those made to or by our house, without how much they were meant (the engine's secret) — and not one made in a letter whose answer is still on the road: it is read when it lands
    commitments: (state.commitments || []).filter((c) => [state.characters[c.by]?.house, state.characters[c.to]?.house || c.to].includes(me) && !onTheRoad(state, c)).map(({ sincerity, acted, ...c }) => c),
    // letters: ours, and the answers that have landed
    post: (state.post || []).filter((l) => !l.reply || l.status !== 'in flight'),
    // pacts: ours, our friends', and the realm's open alliances and marriages
    pacts: (state.pacts || []).filter((p) => friends.has(p.a) || friends.has(p.b) || ['alliance', 'marriage'].includes(p.type)),
    // the facts of the days in hand that have reached us
    facts: (state.facts || []).filter((f) => knows(state, me, f)),
    // what the turn records keep for the engine (every mind's secret aim, the ops applied) is not the player's
    history: (state.history || []).map(viewTurn),
  };
  delete view.minds; delete view.pendingReplies;
  // the realm ledger's truth series holds every house's true coin, levies and income: the browser never has it — the State
  // of the Realm is asked of the server, which builds it from what the house knows (GET /realm, engine/realm/view.js)
  delete view.realmStats;
  // which firsts the chronicle has had is the ranking's memory (engine/facts/rank.js), not the player's to read
  delete view.firsts;
  return view;
}

/**
 * A turn record as the player may read it: the chronicle, not the engine's workings. A record made before the headlines (N6) is
 * read in the new shape: each card gets its headline, summary, details[] and tier from its old title, text and details, and the turn
 * a digest from them (the words stay the old ones; a save is never rewritten for it).
 */
export function viewTurn(t) {
  if (!t || typeof t !== 'object') return t;
  const { minds, hooks, applied, rejected, invariants, realm, ...rest } = t; // `realm` is the turn's row of every house's true figures
  if (Array.isArray(rest.events)) { rest.events = rest.events.map(shapeCard); if (!rest.digest) rest.digest = digestOf(rest.events, rest.meanwhile || ''); }
  return rest;
}

/** Any answer of the API, with every state in it seen through the player's eyes. */
export function viewOf(x) {
  if (!x || typeof x !== 'object' || Array.isArray(x)) return x;
  if (x.meta && x.parties) return playerView(x);
  const out = { ...x };
  if (out.state?.meta) out.state = playerView(out.state);
  if (out.turn && typeof out.turn === 'object' && 'events' in out.turn) out.turn = viewTurn(out.turn);
  return out;
}

/**
 * Invariant 10 (03 §14), for the tests and the soak: what in a view is a truth the player's house does not know — an
 * unseen host where it truly stands, another house's secret, the minds' counsel, a letter's answer not yet arrived.
 */
export function hiddenTruths(state, view) {
  const out = []; const me = state.meta.player; const E = eyesOf(state, me);
  for (const a of forces(state)) {
    if (E.friends.has(a.owner) || (a.serving && E.friends.has(a.serving)) || seesParty(state, me, a, E)) continue;
    const v = view.parties[a.id];
    if (v && v.known !== 'reported') out.push(`10: ${a.id} is unseen but sent as it is`);
    if (v?.march || v?.route || v?.commander) out.push(`10: ${a.id}'s march or leader is sent`);
  }
  for (const c of Object.values(view.characters)) if (c.house !== me && c.secret && !state.characters[c.id]?.secretKnown) out.push(`10: ${c.id}'s secret is sent`);
  if (view.minds || view.pendingReplies || Object.values(view.moods || {}).some((m) => 'anger' in m)) out.push('10: the minds, the tempers or the unread replies are sent');
  if ((view.commitments || []).some((c) => 'sincerity' in c)) out.push('10: how much a promise was meant is sent');
  if ((view.post || []).some((l) => l.reply && l.status === 'in flight')) out.push('10: an answer still on the road is sent');
  if ((view.commitments || []).some((c) => onTheRoad(state, c))) out.push('10: a promise from a letter still on the road is sent');
  for (const h of Object.keys(view.knowledge || {})) if (h !== me) out.push(`10: House ${h}'s knowledge is sent`);
  for (const t of view.history || []) if (t.minds || t.hooks) out.push(`10: turn ${t.turn}'s minds or hooks are sent`);
  if (view.realmStats) out.push('10: the realm ledger\'s true series is sent');
  if (view.firsts) out.push('10: the chronicle\'s firsts are sent');
  for (const t of view.history || []) if (t.realm) out.push(`10: turn ${t.turn}'s true realm figures are sent`);
  return out;
}
