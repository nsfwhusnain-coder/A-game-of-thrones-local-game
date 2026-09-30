// Promises that bind the engine (docs/gdd/08-characters-politics.md §9; 03-architecture.md §3.5). A lord who agrees
// to something in an audience, a letter or a matter makes a Commitment: what, to whom, by when — and, rolled in secret
// from their nature, their regard for the one they promised and the fear they promised under, how much they mean it.
// From the next day the engine acts on a sincere promise through the same verbs as any order (Roose Bolton's men turn
// for Moat Cailin); on the day it falls due it is kept or broken, with a fact, and the one wronged remembers.
// A liar says yes and does nothing. The promise is void if its maker dies or it can no longer be kept.
import { random } from '../rng.js';
import { dayNumber } from '../time.js';
import { emit } from '../facts/log.js';
import { perform } from '../actions/registry.js';
import { commands } from '../actions/military.js';
import { temperament } from '../../shared/temperament.js';
import { getRelation, applyChanges, placeName } from '../../shared/world.js';
import { SAYS } from './promise-words.js';
import { placeOf, forces } from '../parties.js';
import { MILES_PER_UNIT } from '../../../data/geography.js';

const NEAR = 40; // miles: "at Moat Cailin" includes the causeway and the camp before it

/** The kinds a promise can take, with what they need (08 §9.1; those the engine can act on and judge). */
export const COMMITMENTS = {
  march_to: { needs: ['place'], says: SAYS.march_to },
  send_men: { needs: ['place', 'men'], says: SAYS.send_men },
  attend: { needs: ['place'], says: SAYS.attend },
  pay: { needs: ['gold'], says: SAYS.pay },
  release: { needs: ['captive'], says: SAYS.release },
  swear_fealty: { needs: [], says: SAYS.swear_fealty },
  join_war: { needs: [], says: SAYS.join_war },
  stay_neutral: { needs: [], says: SAYS.stay_neutral },
};
export const COMMITMENT_KINDS = Object.keys(COMMITMENTS);
const nameOf = (s, id) => s.characters[id]?.name || `House ${s.houses[id]?.name || id}`;
const his = (s, c) => (s.characters[c.by]?.sex === 'f' ? 'her' : 'his');
const toHouse = (s, c) => s.characters[c.to]?.house || c.to;
const today = (s) => dayNumber(s.meta.date);
const miles = (a, b) => (a && b ? Math.hypot(a[0] - b[0], a[1] - b[1]) * MILES_PER_UNIT : Infinity);
const posOfPlace = (s, id) => s.holdings[id]?.pos || null;

/**
 * How much a promise is meant (0..1), rolled once when it is made and kept secret: their honesty, their regard for the
 * one they promise, and less when fear drew it out of them (08 §9.2).
 */
export function sincerityOf(state, by, to, { duress = false } = {}) {
  const c = state.characters[by]; const T = temperament(c || {});
  const rel = getRelation(state, c?.house, state.characters[to]?.house || to) || 0;
  const s = 0.25 + 0.55 * (T.honesty ?? 0.5) + rel / 400 - (duress ? 0.25 : 0) + (random() - 0.5) * 0.3;
  return Math.max(0, Math.min(1, Math.round(s * 100) / 100));
}

/** A promise made: stored, and a fact of the houses who know of it. Returns the commitment. */
export function makeCommitment(state, { by, to, kind, params = {}, days = 30, source = { type: 'audience' }, publicity = 'witnessed', duress = false, on = null }) {
  if (!COMMITMENTS[kind]) throw new Error(`no such commitment: ${kind}`); // a programming error, caught by the tests
  state.commitments = state.commitments || [];
  const made = today(state) + (on || 0);
  const c = {
    id: `cm${state.meta.turn}_${state.commitments.length + 1}`, by, to, kind, params, madeDay: made, dueDay: made + Math.max(1, Math.round(days)),
    source, sincerity: sincerityOf(state, by, to, { duress }), state: 'open', publicity,
  };
  state.commitments.push(c);
  const maker = state.characters[by]; const other = state.characters[to];
  emit(state, 'commitment_made', {
    actors: [by, other ? to : null], houses: [maker?.house, toHouse(state, c)], data: { commitment: c.id, kind, ...params, dueDay: c.dueDay },
    vis: publicity === 'public' ? { scope: 'public' } : { scope: 'houses', houses: [maker?.house, toHouse(state, c)] },
    cause: { type: source.type === 'letter' ? 'order' : 'intent', ref: source.ref || by },
    text: `${maker?.name || 'Someone'} promises to ${COMMITMENTS[kind].says(state, c)} within ${c.dueDay - c.madeDay} days.`,
  });
  return c;
}

/** The open promises a person has made (for their mind's dossier, their audiences, the player's sheets). */
export const promisesOf = (state, by) => (state.commitments || []).filter((c) => c.by === by && c.state === 'open');
/** A promise in words, for a dossier: "You promised Eddard Stark to bring your men to Moat Cailin by the 20th day." */
export const promiseText = (state, c) => `to ${COMMITMENTS[c.kind].says(state, c)} (promised to ${nameOf(state, c.to)}; due in ${Math.max(0, c.dueDay - today(state))} days)`;

// ── Whether a promise stands kept, and what keeping it takes ─────────────────────────────────────────────────────────

function hostsOf(state, c) {
  const h = state.characters[c.by]?.house;
  return forces(state).filter((a) => a.men > 0 && a.kind !== 'garrison' && a.kind !== 'fleet' && (a.owner === h) && commands(state, h, a));
}
function kept(state, c) {
  const maker = state.characters[c.by]; const h = maker?.house; const to = toHouse(state, c);
  switch (c.kind) {
    case 'march_to': case 'send_men': {
      const at = posOfPlace(state, c.params.place);
      const there = hostsOf(state, c).filter((a) => miles(a.pos, at) <= NEAR).reduce((n, a) => n + a.men, 0);
      return there > 0 && (c.kind !== 'send_men' || there >= Number(c.params.men) * 0.8);
    }
    case 'attend': return placeOf(state, maker) === c.params.place || miles(posOfPlace(state, placeOf(state, maker)), posOfPlace(state, c.params.place)) <= NEAR;
    case 'pay': return (c.paid || 0) >= Number(c.params.gold);
    case 'release': { const x = state.characters[c.params.captive]; return !!x && (!x.alive || !/imprisoned|captive|hostage/.test(x.status || '')); }
    case 'swear_fealty': return state.houses[h]?.liege === to;
    case 'join_war': return (state.wars || []).some((w) => w.status !== 'ended' && ((w.attackers.includes(h) && w.attackers.includes(to)) || (w.defenders.includes(h) && w.defenders.includes(to))));
    case 'stay_neutral': return null; // kept by not breaking it, judged only at the end
    default: return null;
  }
}
function broken(state, c) {
  const h = state.characters[c.by]?.house; const to = toHouse(state, c);
  if (c.kind === 'stay_neutral') return (state.wars || []).some((w) => w.status !== 'ended' && ((w.attackers.includes(h) && w.defenders.includes(to)) || (w.defenders.includes(h) && w.attackers.includes(to))));
  return false;
}
function impossible(state, c) {
  const maker = state.characters[c.by];
  if (!maker?.alive) return `${maker?.name || 'The one who promised'} is dead`;
  if (/imprisoned|captive/.test(maker.status || '')) return `${maker.name} is a captive`;
  if (c.kind === 'release' && !state.characters[c.params.captive]) return 'the captive is no more';
  return null;
}

/** Keep a sincere promise: its verb, done by the one who made it (once; the march itself takes its days). */
function act(state, c) {
  const maker = state.characters[c.by]; const h = maker.house;
  const source = { type: 'intent', ref: c.id, by: 'commitment' };
  const doIt = (verb, params) => perform(state, verb, { actor: c.by, house: h, params, source });
  switch (c.kind) {
    case 'march_to': case 'send_men': {
      const hosts = hostsOf(state, c);
      if (hosts.length) { for (const a of hosts) if (a.march?.to !== c.params.place && a.at !== c.params.place) doIt('march_host', { army: a.id, to: c.params.place }); return true; }
      const r = doIt('raise_levies', { at: state.houses[h]?.seat, to: c.params.place, ...(c.params.men ? { men: c.params.men } : {}) });
      return r.ok;
    }
    case 'attend': return doIt('send_person', { character: c.by, to: c.params.place }).ok;
    case 'pay': { const r = doIt('send_gift', { to: c.to, gold: c.params.gold }); if (r.ok) c.paid = (c.paid || 0) + Number(c.params.gold); return r.ok; }
    case 'release': return doIt('judge_prisoner', { character: c.params.captive, verdict: 'release' }).ok;
    case 'swear_fealty': applyChanges(state, [{ op: 'liege', house: h, liege: toHouse(state, c) }], { source: maker.name, cause: source }); return true;
    case 'join_war': {
      const foes = (state.wars || []).filter((w) => w.status !== 'ended').flatMap((w) => (w.attackers.includes(toHouse(state, c)) ? w.defenders : w.defenders.includes(toHouse(state, c)) ? w.attackers : []));
      return foes[0] ? doIt('declare_war', { house: foes[0], reason: `a promise to House ${state.houses[toHouse(state, c)]?.name}` }).ok : false;
    }
    default: return true;
  }
}

/**
 * A turn's promises: the sincere ones set in motion (once), those kept or fallen due judged, those that can no longer be
 * kept made void. Runs after the day's marches (a host that reached Moat Cailin has kept its word). Returns cards
 * ({ facts }) for the chronicle of the houses that know of each.
 */
export function commitmentsTick(state, { phase = 'end' } = {}) {
  const now = today(state); const clock = state.meta.clock; const on = (day) => (clock ? Math.max(1, Math.min(clock.to, day) - clock.from + 1) : null);
  const out = [];
  for (const c of state.commitments || []) {
    if (c.state !== 'open') continue;
    const maker = state.characters[c.by]; const to = toHouse(state, c); const hs = [maker?.house, to].filter(Boolean);
    const vis = c.publicity === 'private' ? { scope: 'houses', houses: hs } : { scope: 'public' };
    const why = impossible(state, c);
    if (why) {
      c.state = 'void'; c.why = why;
      out.push(emit(state, 'commitment_broken', { actors: [c.by], houses: hs, data: { commitment: c.id, void: true }, vis: { scope: 'houses', houses: hs }, text: `${maker?.name || 'A promise'}'s promise to ${COMMITMENTS[c.kind].says(state, c)} can no longer be kept: ${why}.`, importance: 2 }));
      continue;
    }
    if (phase === 'start') { if (!c.acted && c.sincerity >= 0.5) c.acted = act(state, c) || 'tried'; continue; }
    const done = kept(state, c);
    if (done === true || (c.dueDay <= now && done === null && !broken(state, c))) {
      c.state = 'kept';
      applyChanges(state, [{ op: 'relation', a: maker.house, b: to, delta: 5, reason: 'a promise kept' }], { cause: { type: 'rule', ref: 'commitments' } });
      out.push(emit(state, 'commitment_kept', { actors: [c.by], houses: hs, data: { commitment: c.id, kind: c.kind }, vis, on: on(Math.min(now, c.dueDay)), text: `${maker.name} has kept ${his(state, c)} word to ${nameOf(state, c.to)}: ${his(state, c) === 'her' ? 'she' : 'he'} promised to ${COMMITMENTS[c.kind].says(state, c)}, and it is done.` }));
    } else if (c.dueDay <= now || broken(state, c)) {
      c.state = 'broken';
      const severity = c.publicity === 'private' ? -15 : c.publicity === 'witnessed' ? -25 : -40;
      applyChanges(state, [{ op: 'relation', a: maker.house, b: to, delta: severity, reason: 'a broken promise' }], { cause: { type: 'rule', ref: 'commitments' } });
      if (c.publicity === 'public') (maker.reputation = maker.reputation || []).includes('oathbreaker') || maker.reputation.push('oathbreaker');
      out.push(emit(state, 'commitment_broken', { actors: [c.by], houses: hs, data: { commitment: c.id, kind: c.kind }, vis, on: on(c.dueDay), text: `${maker.name} has broken ${his(state, c)} word: ${his(state, c) === 'her' ? 'she' : 'he'} promised to ${COMMITMENTS[c.kind].says(state, c)}, and did not.` }));
    }
  }
  return out;
}
