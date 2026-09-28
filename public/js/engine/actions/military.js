// Military verbs (docs/gdd/07-military.md §12): calling the banners, raising the levies, marching, joining and
// disbanding hosts, and how openly they go. Each is the one way the engine does the thing, for the player and — once
// the minds of WP B7 choose verbs — for every other lord; nothing here assumes the actor is the player.
import { applyChanges, resolvePlaceId, placeName, placePos, slug, dateStr, nearestHolding, sendHome, realmOf } from '../../shared/world.js';
import { ref, isRef, idOf, partyAt, joinParty, moveMembers, settle, forces, isForce, sworn, membersOf, disband } from '../parties.js';
import { planRoute } from '../movement.js';
import { marchDays, atWar } from '../../shared/warfare.js';
import { canEmbark, embark, land, aboardOf, sail, raidTargets, startRaid } from '../military/naval.js';
import { hireRefusal, hire, release, companyHost, priceOf } from '../military/companies.js';
import { COMPANIES } from '../../../data/companies.js';
import { needsShips } from '../../shared/sea.js';
import { unitsOf, unitsFor, addUnits, unitsText } from '../../shared/units.js';
import { emit } from '../facts/log.js';
import { raiseForLiege } from '../../shared/vassals.js';
import { summon, waitForBanners, musterOf } from '../military/muster.js';
import { dayNumber } from '../time.js';
import { STANDING } from '../military/battle.js';
import { TERMS, weighTerms, yieldOn, rulesOf, stormOdds } from '../military/siege.js';
import { random } from '../rng.js';

// the hosts of this house's realm that sit before this castle
const besiegersOf = (state, house, h) => Object.values(state.parties).filter((a) => a.besieging === h.id && a.men > 0 && realmOf(state, a.owner) === realmOf(state, house)).sort((a, b) => b.men - a.men);
import { seesParty } from '../knowledge.js';

const STANDING_SAID = {
  favourable: 'it will give battle when the odds are with it, hold its ground when they are even, and fall back when they are against it.',
  always: 'it will give battle to any enemy host that comes within reach, whatever the odds.',
  avoid: 'it will fall back before any enemy host, and fight only if it is caught.',
  hold: 'it will hold its ground and fight only if attacked.',
};
import { foldTrain } from '../military/supply.js';

const fmtN = (n) => Math.round(n).toLocaleString('en-GB');
const lordName = (state, house) => state.characters[state.houses[house]?.lord]?.name || `House ${state.houses[house]?.name}`;

/** A host the house commands: its own, one serving it, or a sworn lord's host answering its call. */
export function commands(state, house, a) {
  if (!a || !isForce(a) || a.exile) return false; // a rider is sent and recalled, not commanded; an exile answers to no one
  if (a.owner === house || a.serving === house) return true;
  const v = state.houses[a.owner]; return !!v && v.liege === house && v.obligations?.host === a.id;
}
const hostOf = (state, intent, key = 'army') => { const a = state.parties[idOf(intent.params[key]) ?? intent.params[key]]; return commands(state, intent.house, a) ? a : null; };

// Where an order means to go: a place by name; a house ('the Lannisters') means its seat; a direction, the obvious
// place on the road that way from the North and the Riverlands
export function destination(state, text) {
  const id = resolvePlaceId(text); if (id) return id;
  const t = String(text || '').toLowerCase();
  const h = Object.values(state.houses).find((x) => x.seat && (t.includes(x.name.toLowerCase()) || t.includes(x.id.replace(/_/g, ' '))));
  if (h) return h.seat;
  // Explicit regions must win over the tempting one-word aliases. In particular,
  // "north of the Wall" is not "the Wall" (and must never fall through to Winterfell).
  if (/\bnorth\s+of\s+(?:the\s+)?wall\b|\bbeyond\s+(?:the\s+)?wall\b|\bfrostfangs\b/.test(t)) return resolvePlaceId('hardhome');
  const dir = { south: 'moat_cailin', north: 'nights_watch', riverlands: 'tully', west: 'lannister', capital: 'kings_landing', crossing: 'frey', wall: 'nights_watch' };
  for (const [k, v] of Object.entries(dir)) if (t.includes(k)) return resolvePlaceId(v);
  return null;
}

// ── Hosts: one army where the men are, not a new one for every muster ──
export const fieldHostAt = (state, owner, at) => forces(state).find((x) => x.owner === owner && !['fleet', 'garrison'].includes(x.kind) && x.at === at && !x.march);
/** Fold one host into another: men, morale, supply, the banners in it, and the people riding with it. */
export function foldInto(state, host, other) {
  host.units = addUnits(unitsOf(state, host), unitsOf(state, other));
  const total = host.men + other.men;
  host.morale = Math.round(((host.morale ?? 70) * host.men + (other.morale ?? 70) * other.men) / Math.max(1, total));
  foldTrain(state, host, other); // the wagons and the bread come with the men
  host.supply = Math.round(((host.supply ?? 80) * host.men + (other.supply ?? 80) * other.men) / Math.max(1, total));
  host.men = total;
  for (const [v, n] of Object.entries(other.contingents || {})) host.contingents = { ...(host.contingents || {}), [v]: ((host.contingents || {})[v] || 0) + n };
  if (other.composition && !String(host.composition || '').includes(other.composition)) host.composition = [host.composition, other.composition].filter(Boolean).join('; ');
  moveMembers(state, other, host);
  for (const h of Object.values(state.houses)) { if (h.obligations?.host === other.id) h.obligations.host = host.id; if (h.obligations?.join === other.id) h.obligations.join = host.id; }
  delete state.parties[other.id]; settle(state, host);
}

/** Call up a house's own levies at one of its holdings (or a sworn lord's) — into the host already standing there. */
export function raiseLevies(state, { house = state.meta.player, at, men, commander, name, to, immediate, cause }) {
  const me = state.houses[house];
  const place = resolvePlaceId(at) || me.seat; const hold = state.holdings[place];
  if (!hold || (hold.owner !== house && state.houses[hold.owner]?.liege !== house)) throw new Error(`${hold?.name || at} is not your land`);
  const avail = Math.round(Number(me.figures.levies?.v) || 0); const n = Math.min(avail, Math.round(Number(men) || avail));
  if (n < 50) throw new Error(avail < 50 ? 'no levies are left to call' : 'too few men to be worth the muster');
  const cmd = commander && state.characters[commander]?.alive && state.characters[commander].house === house ? state.characters[commander] : null;
  const out = []; let host = fieldHostAt(state, house, place);
  // A levy is a population, not a button. Reserve the men immediately (so they cannot be called twice), but only the
  // first day's contingent reaches the camp now: the rest walk in from the fields over the following days.
  const first = immediate || immediate === undefined ? n : Math.min(n, Math.max(50, Math.ceil(n / 14)));
  applyChanges(state, [{ op: 'figure', house, field: 'levies', delta: -n, source: 'Muster rolls' }], { source: 'Muster rolls' });
  if (host) {
    host.units = addUnits(unitsOf(state, host), unitsFor(state, { owner: house, composition: 'Levies' }, first));
    host.men += first; host.composition = /levies/i.test(host.composition || '') ? host.composition : [host.composition, `Levies of House ${me.name}`].filter(Boolean).join('; ');
    if (name) host.name = String(name).slice(0, 80);
    if (n > first) host.muster = { remaining: n - first, daily: Math.max(50, Math.ceil(n / 14)), house };
    if (cmd) { host.commander = cmd.id; joinParty(state, cmd, host); }
    out.push(`${fmtN(n)} levies called up at ${hold.name} join ${host.name}, now ${fmtN(host.men)} men${host.commander ? ` under ${state.characters[host.commander]?.name}` : ''}`);
  } else {
    let id = slug(name || `${me.name}_host_${hold.name}`); while (state.parties[id]) id += '_2';
    host = state.parties[id] = { id, owner: house, name: String(name || `The Host of ${hold.name}`).slice(0, 80), commander: cmd?.id || null, at: place, pos: [...hold.pos], men: first, kind: 'host', members: [], composition: `Levies of House ${me.name}${n >= 3000 ? ', with household knights' : ''}`, morale: 65, supply: 80, asOf: dateStr(state.meta.date), ...(n > first ? { muster: { remaining: n - first, daily: Math.max(50, Math.ceil(n / 14)), house } } : {}) };
    if (cmd) joinParty(state, cmd, host);
    settle(state, host);
    out.push(`${fmtN(first)} levies muster at ${hold.name} as ${host.name}${n > first ? `; ${fmtN(n - first)} more are mustering from the fields` : ''}${cmd ? ` under ${cmd.name}` : ''} (${unitsText(state, host)})`);
  }
  for (const v of Object.values(state.houses)) if (v.liege === house && v.obligations?.muster === place && ['called', 'delayed', 'answered'].includes(v.obligations.levies) && !(v.obligations.join && state.parties[v.obligations.join])) v.obligations.join = host.id;
  if (n < Math.round(Number(men) || 0)) out.push(`only ${fmtN(n)} could be found of the ${fmtN(Math.round(Number(men)))} asked for`);
  emit(state, 'levies_called', { actors: [me.lord, host.commander], houses: [house], place, pos: hold.pos, data: { party: host.id, men: n, now: first }, cause, text: `House ${me.name} calls up ${fmtN(n)} levies at ${hold.name}${n > first ? `; ${fmtN(n - first)} of them are still coming in from the fields` : ''}.` });
  const dest = to && destination(state, to);
  if (dest && dest !== place) { host.march = { to: dest, since: state.meta.turn }; settle(state, host); out.push(`${host.name} marches for ${placeName(state, dest)}`); emit(state, 'set_out', { actors: [host.commander], houses: [house], pos: host.pos, data: { party: host.id, to: dest }, cause }); }
  return { lines: out, host: host.id, men: n, first };
}

/** Call the banners: sworn lords are summoned to muster (they answer, delay or refuse by their nature, over days). */
export function callBanners(state, { house = state.meta.player, vassals, at, scope = 'quick', cause }) {
  const me = state.houses[house];
  const all = Object.values(state.houses).filter((h) => h.liege === house);
  const list = vassals === 'all' || !Array.isArray(vassals) || !vassals.length ? all : all.filter((h) => vassals.some((v) => slug(v) === h.id || String(v).toLowerCase().includes(h.name.toLowerCase())));
  if (!list.length) throw new Error('no sworn lord to summon');
  const muster = resolvePlaceId(at) || destination(state, at) || me.seat;
  // the host already standing at the muster (the lord's own levies) is the one the banners join, wherever it later goes
  const join = fieldHostAt(state, house, muster)?.id || null;
  // a raven to each: the answer is theirs, a day at a time (engine/military/muster.js)
  const sc = scope === 'full' ? 'full' : 'quick';
  for (const v of list) summon(state, v, { host: join, muster, scope: sc });
  const last = Math.max(...list.map((v) => v.obligations.call.predicted)); const today = dayNumber(state.meta.date);
  emit(state, 'levies_called', { actors: [me.lord], houses: [house, ...list.map((v) => v.id)], place: resolvePlaceId(muster) || null, data: { vassals: list.map((v) => v.id), muster }, cause, text: `House ${me.name} calls its banners: ${list.length} sworn house${list.length > 1 ? 's are' : ' is'} summoned to ${placeName(state, muster)}.` });
  const men = list.reduce((n, v) => n + (v.obligations.call.men || 0), 0);
  return { lines: [`The banners are called${sc === 'full' ? ' in full' : ''}: ${list.length} sworn house${list.length > 1 ? 's' : ''} summoned to muster at ${placeName(state, muster)} (${list.slice(0, 8).map((v) => v.name).join(', ')}${list.length > 8 ? '…' : ''}); each answers in their own time and temper`, `if all answer, about ${fmtN(Math.round(men / 500) * 500)} men; the last expected in ~${last - today} days`], vassals: list.map((v) => v.id), muster };
}

/** Bring hosts at one place together under one banner. */
export function mergeHosts(state, { house = state.meta.player, armies, name, commander, cause }) {
  const mine = Object.values(state.parties).filter((a) => commands(state, house, a) && a.kind !== 'fleet');
  // the castle's own garrison stays on its walls unless it is named
  const picked = Array.isArray(armies) && armies.length ? mine.filter((a) => armies.includes(a.id) || armies.some((x) => slug(x) === slug(a.name))) : mine.filter((a) => a.kind !== 'garrison');
  const groups = new Map(); for (const a of picked) { const k = a.at || `${Math.round(a.pos[0] / 6)},${Math.round(a.pos[1] / 6)}`; groups.set(k, [...(groups.get(k) || []), a]); }
  const out = [];
  for (const g of groups.values()) {
    if (g.length < 2) continue;
    g.sort((a, b) => (b.owner === house) - (a.owner === house) || b.men - a.men);
    const host = g[0]; const folded = g.slice(1).map((o) => o.id); for (const o of g.slice(1)) foldInto(state, host, o);
    if (name) host.name = String(name).slice(0, 80);
    const cmd = commander && state.characters[commander]; if (cmd?.alive) { host.commander = cmd.id; joinParty(state, cmd, host); }
    out.push(`${g.length} hosts at ${placeName(state, host.at || host.pos)} are joined into ${host.name}: ${fmtN(host.men)} men${host.commander ? ` under ${state.characters[host.commander]?.name}` : ''}`);
    emit(state, 'host_joined', { actors: [host.commander], houses: [host.owner], place: host.at || null, pos: host.pos, data: { party: host.id, joined: folded, men: host.men }, cause, text: `${g.length} hosts are joined into ${host.name} (${fmtN(host.men)} men).` });
  }
  if (!out.length) throw new Error('there are no two hosts in the same place to join — they must first march to one place');
  return { lines: out };
}

const lines = (done, ok = true) => (done.lines || []).map((text, k) => ({ ok: k && /^only |could not/.test(text) ? 'warn' : ok, text: text.replace(/^./, (x) => x.toUpperCase()).replace(/([^.!?…])$/, '$1.') }));
const eta = (state, a, to) => { const pos = isRef(to) ? partyAt(state, to)?.pos : placePos(to, state.holdings); return pos ? marchDays(a, a.pos, pos, state) : null; };

export const MILITARY = [
  {
    id: 'call_banners', family: 'military', label: 'Call the banners',
    params: { vassals: 'vassals', at: 'place', ownLevies: 'number?', scope: 'text?', deadline: 'text?', note: 'text?' },
    who: (state, i) => Object.values(state.houses).some((h) => h.liege === i.house),
    legal: (state, i) => {
      const sworn = Object.values(state.houses).filter((h) => h.liege === i.house);
      const v = i.params.vassals; const some = v === 'all' || !Array.isArray(v) || !v.length ? sworn : sworn.filter((h) => v.some((x) => slug(x) === h.id || String(x).toLowerCase().includes(h.name.toLowerCase())));
      if (!some.length) return { code: 'no_vassals', text: 'No sworn lord of yours is among those named.' };
      if (i.params.at && !resolvePlaceId(i.params.at) && !destination(state, i.params.at)) return { code: 'no_place', text: `There is no place called ${i.params.at} to muster at.` };
      return null;
    },
    start: (state, i) => {
      const done = callBanners(state, { house: i.house, vassals: i.params.vassals, at: i.params.at, scope: i.params.scope, cause: i.source });
      // the lord's own levies are raised at the same muster, if asked
      if (Number(i.params.ownLevies) >= 50) {
        try { const r = raiseLevies(state, { house: i.house, at: done.muster, men: i.params.ownLevies, cause: i.source }); done.lines.push(...r.lines); } catch (e) { done.lines.push(`could not raise your own levies: ${e.message}`); }
      }
      return done;
    },
    receipt: (state, i, done) => lines(done),
    said: (state, i, done) => ({ status: 'underway', text: `CALL THE BANNERS: I summon ${done.vassals.map((v) => 'House ' + state.houses[v].name).join(', ')} to muster their levies at ${placeName(state, done.muster)}${i.params.deadline ? ' within ' + i.params.deadline : ''}.${i.params.note ? ' ' + i.params.note : ''}${Number(i.params.ownLevies) >= 50 ? ` Raise my own levies as well (${i.params.ownLevies} men).` : ''}` }),
    facts: ['levies_called'], mind: { allowed: true },
  },
  {
    // a sworn lord answers his liege's summons at once, rather than in his own time and temper (shared/vassals.js);
    // the player answers a summons as a matter of the court
    id: 'answer_call', family: 'military', label: 'Answer your liege\'s call',
    params: {},
    who: (state, i) => i.house !== state.meta.player,
    legal: (state, i) => {
      const v = state.houses[i.house]; const ob = v?.obligations;
      if (!v?.liege || !['called', 'delayed'].includes(ob?.levies)) return { code: 'not_called', text: 'No liege has called your banners.' };
      return null;
    },
    start: (state, i) => raiseForLiege(state, state.houses[i.house], { cause: i.source }),
    receipt: (state, i, d) => [{ ok: d.men > 0 ? true : 'warn', text: d.text }],
    facts: ['call_answered', 'host_formed', 'set_out'], mind: { allowed: true },
  },
  {
    id: 'raise_levies', family: 'military', label: 'Raise the levies',
    params: { at: 'holding:own', men: 'number?', commander: 'character:own?', name: 'text?', to: 'place?' },
    legal: (state, i) => {
      const me = state.houses[i.house]; const place = resolvePlaceId(i.params.at) || me?.seat; const hold = state.holdings[place];
      if (!hold || (hold.owner !== i.house && state.houses[hold.owner]?.liege !== i.house)) return { code: 'not_yours', text: `${hold?.name || i.params.at || 'That place'} is not your land.` };
      const avail = Math.round(Number(me.figures.levies?.v) || 0);
      if (avail < 50) return { code: 'no_levies', text: 'No levies are left to call: every able man is already under arms.' };
      if (Number(i.params.men) && Math.min(avail, Number(i.params.men)) < 50) return { code: 'too_few', text: 'Too few men to be worth the muster.' };
      return null;
    },
    cost: (state, i) => ({ men: Math.min(Math.round(Number(state.houses[i.house].figures.levies?.v) || 0), Math.round(Number(i.params.men) || Infinity)) }),
    start: (state, i) => raiseLevies(state, { house: i.house, ...i.params, cause: i.source }),
    receipt: (state, i, done) => lines(done),
    said: (state, i) => ({ status: 'done', text: `Raise ${Math.round(Number(i.params.men) || 0) || 'all'} of my own levies at ${placeName(state, i.params.at || state.houses[i.house].seat)}${i.params.name ? ` as "${i.params.name}"` : ''}.` }),
    facts: ['levies_called', 'set_out'], mind: { allowed: true },
  },
  {
    id: 'march_host', family: 'military', label: 'March a host',
    params: { army: 'party:own', to: 'place', commander: 'character:own?', intent: 'text?' },
    legal: (state, i) => {
      if (!i.params.army) return { code: 'no_host', text: 'You have no host in the field to march: raise your levies or call the banners first.' };
      const a = hostOf(state, i); if (!a) return { code: 'not_yours', text: 'That host is not yours to command.' };
      // a host aboard ship goes where its fleet sails; one coming ashore is not yet ready to march (engine/military/naval.js)
      if (a.aboard) return { code: 'aboard', text: `${a.name} is aboard ${state.parties[a.aboard]?.name || 'ship'}: sail the fleet, or land the host first.` };
      if (a.ashore && a.ashore > dayNumber(state.meta.date)) return { code: 'landing', text: `${a.name} is still coming ashore; it can march in ${a.ashore - dayNumber(state.meta.date)} day${a.ashore - dayNumber(state.meta.date) === 1 ? '' : 's'}.` };
      const cmd = i.params.commander && state.characters[i.params.commander];
      if (cmd && (!cmd.alive || cmd.house !== i.house || /imprisoned|captive/.test(cmd.status || ''))) return { code: 'commander', text: `${cmd.name} cannot lead ${a.name}.` };
      const to = resolvePlaceId(i.params.to) || destination(state, i.params.to);
      if (!to || !placePos(to, state.holdings)) return { code: 'no_place', text: `No one knows the way to ${i.params.to || 'nowhere'}.` };
      if (a.at === to && !a.march) return { code: 'there', text: `${a.name} is already at ${placeName(state, to)}.` };
      if (a.canonLock && i.house !== state.meta.player) return { code: 'canon', text: `${a.name} keeps to its road.` };
      return null;
    },
    cost: (state, i) => { const a = hostOf(state, i); const m = eta(state, a, resolvePlaceId(i.params.to) || destination(state, i.params.to)); return m ? { days: m.days } : null; },
    start: (state, i) => {
      const a = hostOf(state, i); const to = resolvePlaceId(i.params.to) || destination(state, i.params.to); const m = eta(state, a, to);
      // the host is where it is until the turn walks it; the road is planned now, so the map shows the way it will take
      // (engine/movement.js), over the sea by ship
      // marching now: whoever has not come will follow (the rendezvous), so the host no longer waits for them
      delete a.wait;
      a.march = { to, since: state.meta.turn }; planRoute(state, a, placePos(to, state.holdings), to, { toName: placeName(state, to) }); settle(state, a);
      // the one the order names leads it, and rides with it
      const cmd = i.params.commander && state.characters[i.params.commander]; if (cmd) { a.commander = cmd.id; joinParty(state, cmd, a); }
      emit(state, 'set_out', { actors: [a.commander], houses: [a.owner, a.serving], pos: a.pos, data: { party: a.id, to, days: m?.days }, cause: i.source });
      return { host: a.id, to, miles: m?.miles, days: m?.days };
    },
    receipt: (state, i, d) => { const a = state.parties[d.host]; return [{ ok: true, text: `${a.name} (${fmtN(a.men)} men${a.commander ? ` under ${state.characters[a.commander]?.name}` : ''}) marches for ${placeName(state, d.to)}${d.miles ? ` — ~${fmtN(d.miles)} miles, ~${d.days} days` : ''}.`, eta: d.days ?? null }]; },
    said: (state, i, d) => ({ status: 'underway', text: `${state.parties[d.host].name} marches on ${placeName(state, d.to)}${d.miles ? ` (~${d.miles} miles, ~${d.days} days)` : ''}${i.params.intent ? ' — ' + i.params.intent : ''}.` }),
    facts: ['set_out'], mind: { allowed: true },
  },
  {
    // hold a host where it stands until the banners are in (07 §3.4): the host card's "Wait for the banners"
    id: 'wait_banners', family: 'military', label: 'Wait for the banners',
    params: { army: 'party:own', share: 'number?' },
    legal: (state, i) => {
      const a = hostOf(state, i); if (!a) return { code: 'not_yours', text: 'That host is not yours to command.' };
      const m = musterOf(state, a.id);
      if (!m || !(m.road.length + m.expected.length)) return { code: 'none_coming', text: `No banners are coming to ${a.name}: there is no one to wait for.` };
      return null;
    },
    start: (state, i) => {
      const a = hostOf(state, i); const share = Math.max(0.3, Math.min(1, Number(i.params.share) > 1 ? Number(i.params.share) / 100 : Number(i.params.share) || 0.8));
      const w = waitForBanners(state, a, { share });
      const today = dayNumber(state.meta.date);
      return { lines: [`${a.name} waits${a.at ? ` at ${placeName(state, a.at)}` : ''} until ${Math.round(share * 100)}% of the men called are with it, or ${w.until - today} days have passed${w.to ? `; then it marches for ${isRef(w.to) ? state.parties[idOf(w.to)]?.name : placeName(state, w.to)}` : ''}`] };
    },
    receipt: (state, i, done) => lines(done),
    said: (state, i) => ({ status: 'underway', text: `${hostOf(state, i)?.name || 'The host'} waits for the banners.` }),
    facts: [], mind: { allowed: false },
  },
  {
    id: 'attack_host', family: 'military', label: 'March against a host',
    params: { army: 'party:own', to: 'party:foe', intent: 'text?', surprise: 'boolean?' },
    legal: (state, i) => {
      const a = hostOf(state, i); if (!a) return { code: 'not_yours', text: 'That host is not yours to command.' };
      const foe = partyAt(state, i.params.to); if (!foe || foe.id === a.id) return { code: 'no_foe', text: 'There is no such host to march against.' };
      if (commands(state, i.house, foe)) return { code: 'own', text: `${foe.name} marches under your own banners.` };
      return null;
    },
    start: (state, i) => {
      const a = hostOf(state, i); const foe = partyAt(state, i.params.to); const m = marchDays(a, a.pos, foe.pos, state);
      a.march = { to: ref(foe.id), since: state.meta.turn }; planRoute(state, a, foe.pos, ref(foe.id), { toName: foe.name }); settle(state, a);
      // a surprise only while the enemy has no eyes on the host (07 §7.4): seen, it is only an attack
      const unseen = !seesParty(state, foe.owner, a);
      if (i.params.surprise && unseen) a.surprise = true; else delete a.surprise;
      emit(state, 'set_out', { actors: [a.commander], houses: [a.owner, foe.owner], pos: a.pos, data: { party: a.id, against: foe.id, days: m.days }, cause: i.source });
      return { host: a.id, foe: foe.id, days: m.days, surprise: !!i.params.surprise, unseen };
    },
    receipt: (state, i, d) => { const a = state.parties[d.host], foe = state.parties[d.foe]; return [{ ok: true, text: `${a.name} marches to bring ${foe.name} (House ${state.houses[foe.owner]?.name}, ~${fmtN(foe.men)} men) to battle — ~${d.days} days away.`, eta: d.days }, ...(d.surprise ? [{ ok: d.unseen ? true : 'warn', text: d.unseen ? 'They have no eyes on you: if the host is not seen on the road, it falls on them unawares.' : `${foe.name} has eyes on the host: there will be no surprise.` }] : [])]; },
    said: (state, i, d) => { const a = state.parties[d.host], foe = state.parties[d.foe]; return { status: 'underway', note: '[The engine will fight this battle when the hosts meet; narrate the approach.]', text: `${a.name} marches to attack ${foe.name} (House ${state.houses[foe.owner]?.name}, ~${foe.men} men), ~${d.days} days away${i.params.intent ? ' — ' + i.params.intent : ''}.` }; },
    facts: ['set_out'], mind: { allowed: true },
  },
  {
    // the host card's standing orders (07 §7.1): what the host does when an enemy comes within reach, whoever begins it
    id: 'set_standing_orders', family: 'military', label: 'Standing orders',
    params: { army: 'party:own', engage: 'text' },
    legal: (state, i) => {
      const a = hostOf(state, i); if (!a) return { code: 'not_yours', text: 'That host is not yours to command.' };
      if (!STANDING[i.params.engage]) return { code: 'engage', text: `Standing orders are one of: ${Object.values(STANDING).join('; ')}.` };
      return null;
    },
    start: (state, i) => { const a = hostOf(state, i); a.standing = i.params.engage; return { host: a.id, engage: a.standing }; },
    receipt: (state, i, d) => [{ ok: true, text: `${state.parties[d.host].name}: ${STANDING_SAID[d.engage]}` }],
    said: (state, i, d) => ({ status: 'done', text: `${state.parties[d.host].name} has new standing orders: ${STANDING[d.engage].toLowerCase()}.` }),
    facts: [], mind: { allowed: false },
  },
  {
    // offer a besieged castle terms (07 §8.3): the castellan weighs them there and then — the commonest way castles fall
    id: 'offer_terms', family: 'military', label: 'Offer terms',
    params: { holding: 'holding:foe', terms: 'text' },
    legal: (state, i) => {
      const h = state.holdings[resolvePlaceId(i.params.holding) || i.params.holding];
      if (!h) return { code: 'no_place', text: 'There is no such castle.' };
      if (!besiegersOf(state, i.house, h).length) return { code: 'not_besieged', text: `No host of yours sits before ${h.name}: there is no one to offer terms.` };
      if (!TERMS[i.params.terms]) return { code: 'terms', text: `Terms are one of: ${Object.values(TERMS).join('; ')}.` };
      if (h.siege?.offered && dayNumber(state.meta.date) - h.siege.offered < 7) return { code: 'too_soon', text: `${h.name} answered your terms not a week ago: give them time to grow hungry.` };
      return null;
    },
    start: (state, i) => {
      const h = state.holdings[resolvePlaceId(i.params.holding) || i.params.holding]; const bes = besiegersOf(state, i.house, h);
      const w = weighTerms(state, h, bes, i.params.terms, random);
      if (h.siege) h.siege.offered = dayNumber(state.meta.date);
      emit(state, 'terms_offered', { actors: [state.houses[i.house].lord, w.castellan?.id], houses: [i.house, h.owner], place: h.id, data: { holding: h.id, terms: i.params.terms, accepted: w.accepted }, cause: i.source, text: `House ${state.houses[i.house].name} offers ${h.name} terms: to ${TERMS[i.params.terms]}.` });
      if (!w.accepted) { emit(state, 'terms_refused', { actors: [w.castellan?.id], houses: [i.house, h.owner], place: h.id, data: { holding: h.id, terms: i.params.terms }, cause: i.source, text: `${w.castellan?.name || 'The castellan'} refuses the terms: ${h.name} will hold.` }); return { holding: h.id, accepted: false, castellan: w.castellan?.name, why: w.why }; }
      const y = yieldOn(state, h, bes[0], i.params.terms, { how: 'terms' });
      applyChanges(state, y.changes, { source: 'Terms', cause: i.source });
      return { holding: h.id, accepted: true, castellan: w.castellan?.name, why: w.why, text: y.events[0]?.text };
    },
    receipt: (state, i, d) => [{ ok: d.accepted ? true : 'warn', text: d.accepted ? `${d.text}${d.why ? ` (${d.why})` : ''}` : `${d.castellan || 'The castellan'} refuses your terms: ${state.holdings[d.holding].name} will hold. Try again when they are hungrier.` }],
    said: (state, i, d) => ({ status: 'done', text: d.accepted ? d.text : `${state.holdings[d.holding].name} refused the terms offered.` }),
    facts: ['terms_offered', 'terms_refused', 'holding_fell'], mind: { allowed: false },
  },
  {
    // storm the walls now (07 §8.3): heavy losses, and it fails often — by design
    id: 'storm', family: 'military', label: 'Storm the walls',
    params: { holding: 'holding:foe' },
    legal: (state, i) => {
      const h = state.holdings[resolvePlaceId(i.params.holding) || i.params.holding];
      if (!h) return { code: 'no_place', text: 'There is no such castle.' };
      if (!besiegersOf(state, i.house, h).length) return { code: 'not_besieged', text: `No host of yours sits before ${h.name}.` };
      if (rulesOf(h).noStorm) return { code: 'no_storm', text: `${h.name} cannot be taken by storm: only hunger, terms or treachery will do it.` };
      return null;
    },
    start: (state, i) => {
      const h = state.holdings[resolvePlaceId(i.params.holding) || i.params.holding]; const bes = besiegersOf(state, i.house, h);
      for (const a of bes) a.storm = h.id; // the day's siege tick carries it out
      return { holding: h.id, odds: Math.round(stormOdds(state, h, bes) * 100) / 100 };
    },
    receipt: (state, i, d) => [{ ok: d.odds >= 1.2 ? true : 'warn', text: `The host will storm ${state.holdings[d.holding].name} at dawn — ${d.odds >= 1.5 ? 'the walls should fall' : d.odds >= 1 ? 'it may fail, and it will be bloody' : 'the odds are against it; many will die below the walls'}.` }],
    said: (state, i, d) => ({ status: 'underway', text: `The host prepares to storm ${state.holdings[d.holding].name}.` }),
    facts: ['storm_assault'], mind: { allowed: false },
  },
  {
    // a host goes aboard a fleet in port (07 §9.2): it sails wherever the fleet sails, until it is landed
    id: 'embark_host', family: 'military', label: 'Take a host aboard',
    params: { army: 'party:own', fleet: 'party:own' },
    legal: (state, i) => {
      const a = hostOf(state, i); if (!a || a.kind === 'fleet') return { code: 'not_yours', text: 'That host is not yours to command.' };
      const f = hostOf(state, i, 'fleet'); if (!f || f.kind !== 'fleet') return { code: 'no_fleet', text: 'You have no such fleet.' };
      const why = canEmbark(state, a, f); return why ? { code: 'cannot', text: `${a.name} cannot go aboard: ${why}.` } : null;
    },
    start: (state, i) => { const a = hostOf(state, i); const f = hostOf(state, i, 'fleet'); const e = embark(state, a, f); emit(state, 'embarked', { actors: [a.commander], houses: [a.owner], pos: f.pos, data: { party: a.id, fleet: f.id, men: a.men }, cause: i.source, text: `${a.name} (${fmtN(a.men)} men) goes aboard ${f.name}.` }); return { host: a.id, fleet: f.id, days: e.days }; },
    receipt: (state, i, d) => [{ ok: true, text: `${state.parties[d.host].name} goes aboard ${state.parties[d.fleet].name} (a day for every 2,000 men); send the fleet where you would land it.` }],
    said: (state, i, d) => ({ status: 'done', text: `${state.parties[d.host].name} is aboard ${state.parties[d.fleet].name}.` }),
    facts: ['embarked'], mind: { allowed: false },
  },
  {
    // a fleet puts its hosts ashore where it lies: a port in a day, a beach in two (07 §9.2)
    id: 'land_host', family: 'military', label: 'Put the host ashore',
    params: { fleet: 'party:own' },
    legal: (state, i) => {
      const f = hostOf(state, i, 'fleet'); if (!f || f.kind !== 'fleet') return { code: 'no_fleet', text: 'You have no such fleet.' };
      if (!aboardOf(state, f).length) return { code: 'empty', text: `${f.name} carries no host.` };
      if (f.march) return { code: 'at_sea', text: `${f.name} is under sail: land the host when it comes to its haven.` };
      return null;
    },
    start: (state, i) => {
      const f = hostOf(state, i, 'fleet'); const L = land(state, f);
      if (!L.hosts.length) return { lines: [`${f.name} can find no shore to put the men on`] };
      for (const h of L.hosts) emit(state, 'landed', { actors: [h.commander], houses: [h.owner], place: L.where, pos: L.pos, data: { party: h.id, fleet: f.id, men: h.men }, cause: i.source, text: `${h.name} (${fmtN(h.men)} men) comes ashore${L.where ? ` at ${placeName(state, L.where)}` : ''}.` });
      return { lines: L.hosts.map((h) => `${h.name} comes ashore${L.where ? ` at ${placeName(state, L.where)}` : ' on the beach'}; ready to march in ${L.days} day${L.days === 1 ? '' : 's'}`) };
    },
    receipt: (state, i, d) => lines(d),
    said: (state, i, d) => ({ status: 'done', text: (d.lines || []).join('; ') }),
    facts: ['landed'], mind: { allowed: false },
  },
  {
    // a fleet lies before an enemy port (07 §9.4): its trade halves, and if it is besieged it starves
    id: 'blockade', family: 'military', label: 'Blockade a port',
    params: { fleet: 'party:own', holding: 'holding:foe', lift: 'boolean?' },
    legal: (state, i) => {
      const f = hostOf(state, i, 'fleet'); if (!f || f.kind !== 'fleet') return { code: 'no_fleet', text: 'You have no such fleet.' };
      if (i.params.lift) return f.blockade ? null : { code: 'none', text: `${f.name} blockades no port.` };
      const h = state.holdings[resolvePlaceId(i.params.holding) || i.params.holding]; if (!h) return { code: 'no_place', text: 'There is no such port.' };
      if (!h.coastal) return { code: 'inland', text: `${h.name} is not on the sea.` };
      if (!atWar(state, i.house, h.owner)) return { code: 'not_at_war', text: `You are not at war with House ${state.houses[h.owner]?.name}.` };
      return null;
    },
    start: (state, i) => {
      const f = hostOf(state, i, 'fleet');
      if (i.params.lift) { const h = state.holdings[f.blockade]; if (h?.blockade?.fleet === f.id) delete h.blockade; delete f.blockade; return { lines: [`${f.name} lifts its blockade of ${h?.name || 'the port'}`] }; }
      const h = state.holdings[resolvePlaceId(i.params.holding) || i.params.holding];
      delete f.raid; f.blockade = h.id; const m = marchDays(f, f.pos, h.pos, state);
      if (Math.hypot(f.pos[0] - h.pos[0], f.pos[1] - h.pos[1]) > 20) sail(state, f, h.id);
      emit(state, 'blockade', { actors: [f.commander], houses: [f.owner, h.owner], place: h.id, data: { fleet: f.id, holding: h.id }, cause: i.source, text: `${f.name} sails to close the port of ${h.name}.` });
      applyChanges(state, [{ op: 'relation', a: i.house, b: h.owner, delta: -5, reason: `the blockade of ${h.name}` }], { cause: i.source });
      return { lines: [`${f.name} sails to blockade ${h.name}${m?.days ? ` (~${m.days} days)` : ''}: while it lies there the port's trade is halved, and if it is besieged no food comes in by sea`] };
    },
    receipt: (state, i, d) => lines(d),
    said: (state, i, d) => ({ status: 'underway', text: (d.lines || []).join('; ') }),
    facts: ['blockade'], mind: { allowed: true },
  },
  {
    // a fleet goes reaving along an enemy coast (07 §9.4): a village every other day for a fortnight, the loot home
    id: 'raid_coast', family: 'military', label: 'Raid a coast',
    params: { fleet: 'party:own', target: 'holding:foe', days: 'number?' },
    legal: (state, i) => {
      const f = hostOf(state, i, 'fleet'); if (!f || f.kind !== 'fleet') return { code: 'no_fleet', text: 'You have no such fleet.' };
      const h = state.holdings[resolvePlaceId(i.params.target) || i.params.target]; if (!h) return { code: 'no_place', text: 'Raid where?' };
      const probe = { ...f, raid: { target: h.id, pos: h.pos, reach: 120, done: [] } };
      if (!raidTargets(state, probe).length) return { code: 'no_targets', text: `There is no enemy coast to reave about ${h.name}.` };
      return null;
    },
    start: (state, i) => {
      const f = hostOf(state, i, 'fleet'); const h = state.holdings[resolvePlaceId(i.params.target) || i.params.target];
      const first = startRaid(state, f, h.id, { days: Math.max(3, Math.min(60, Number(i.params.days) || 14)) });
      emit(state, 'set_out', { actors: [f.commander], houses: [f.owner, h.owner], pos: f.pos, data: { party: f.id, to: first, raid: true }, cause: i.source, text: `${f.name} puts to sea to reave the coast about ${h.name}.` });
      return { lines: [`${f.name} sails to reave the coast about ${h.name}, beginning at ${placeName(state, first)}: a village every other day for ${f.raid.days} days from the first landing, then home with the plunder`] };
    },
    receipt: (state, i, d) => lines(d),
    said: (state, i, d) => ({ status: 'underway', text: (d.lines || []).join('; ') }),
    facts: ['set_out', 'raid'], mind: { allowed: true },
  },
  {
    // hire a free company by contract (07 §10): a moon paid on signing, each moon after from your coin — or it goes
    id: 'hire_company', family: 'military', label: 'Hire a free company',
    params: { company: 'house:company', offer: 'number?', to: 'place?' },
    legal: (state, i) => hireRefusal(state, i.house, i.params.company, i.params.offer ? Math.round(Number(i.params.offer)) : null),
    cost: (state, i) => ({ gold: i.params.offer ? Math.round(Number(i.params.offer)) : priceOf(state, i.params.company) }),
    start: (state, i) => {
      const to = i.params.to ? resolvePlaceId(i.params.to) : null;
      const h = hire(state, i.house, i.params.company, { offer: i.params.offer ? Math.round(Number(i.params.offer)) : null, to, cause: i.source });
      return { party: h.party.id, price: h.price, from: h.from, company: i.params.company };
    },
    receipt: (state, i, d) => { const p = state.parties[d.party]; const C = COMPANIES[d.company]; return [{ ok: true, text: `${C.name.replace(/^./, (x) => x.toUpperCase())} (${fmtN(p.men)} swords) is yours for ${fmtN(d.price)} dragons a moon — the first paid. It marches for ${placeName(state, p.march?.to || p.at)}${needsShips(p.pos, state.holdings[p.march?.to]?.pos) ? ', by hired ships' : ''}. Miss a moon's pay and it is gone.` }, ...(d.from ? [{ ok: 'warn', text: `It breaks its contract with House ${state.houses[d.from]?.name} to come to you.` }] : [])]; },
    said: (state, i, d) => ({ status: 'done', text: `${COMPANIES[d.company].name} is hired for ${fmtN(d.price)} dragons a moon.` }),
    facts: ['sellswords_hired', 'sellswords_turned'], mind: { allowed: true },
  },
  {
    id: 'dismiss_company', family: 'military', label: 'Pay off a free company',
    params: { company: 'house:company' },
    legal: (state, i) => { const p = companyHost(state, i.params.company); return p?.contract?.by === i.house ? null : { code: 'not_hired', text: 'That company is not in your pay.' }; },
    start: (state, i) => { const p = companyHost(state, i.params.company); release(state, p, 'dismissed', i.source); return { company: i.params.company }; },
    receipt: (state, i, d) => [{ ok: true, text: `${COMPANIES[d.company].name.replace(/^./, (x) => x.toUpperCase())} is paid off and marches away.` }],
    said: (state, i, d) => ({ status: 'done', text: `${COMPANIES[d.company].name} is dismissed.` }),
    facts: ['desertion'], mind: { allowed: false },
  },
  {
    id: 'halt_host', family: 'military', label: 'Halt a host',
    params: { army: 'party:own' },
    legal: (state, i) => { const a = hostOf(state, i); return !a ? { code: 'not_yours', text: 'That host is not yours to command.' } : !a.march ? { code: 'not_marching', text: `${a.name} is not marching.` } : null; },
    start: (state, i) => {
      const a = hostOf(state, i); delete a.march; a.route = null; settle(state, a);
      const near = placeName(state, nearestHolding(state, a.pos));
      emit(state, 'turned_back', { actors: [a.commander], houses: [a.owner], pos: a.pos, data: { party: a.id, halted: true }, cause: i.source, text: `${a.name} halts near ${near}.` });
      return { host: a.id, near };
    },
    receipt: (state, i, d) => [{ ok: true, text: `${state.parties[d.host].name} halts near ${d.near}.` }],
    said: (state, i, d) => ({ status: 'done', text: `${state.parties[d.host].name} halts and holds where it stands, near ${d.near}.` }),
    facts: ['turned_back'], mind: { allowed: true },
  },
  {
    id: 'merge_hosts', family: 'military', label: 'Join hosts together',
    params: { armies: 'party:own[]?', name: 'text?', commander: 'character:own?' },
    legal: (state, i) => {
      const mine = Object.values(state.parties).filter((a) => commands(state, i.house, a) && a.kind !== 'fleet' && (!i.params.armies?.length ? a.kind !== 'garrison' : i.params.armies.includes(a.id) || i.params.armies.some((x) => slug(x) === slug(a.name))));
      const at = new Map(); for (const a of mine) { const k = a.at || `${Math.round(a.pos[0] / 6)},${Math.round(a.pos[1] / 6)}`; at.set(k, (at.get(k) || 0) + 1); }
      return [...at.values()].some((n) => n >= 2) ? null : { code: 'apart', text: 'There are no two hosts in the same place to join — they must first march to one place.' };
    },
    start: (state, i) => mergeHosts(state, { house: i.house, ...i.params, cause: i.source }),
    receipt: (state, i, done) => lines(done),
    facts: ['host_joined'], mind: { allowed: true },
  },
  {
    id: 'disband_host', family: 'military', label: 'Disband a host',
    params: { army: 'party:own' },
    legal: (state, i) => { const a = state.parties[i.params.army]; return !a || (a.owner !== i.house && a.serving !== i.house) ? { code: 'not_yours', text: 'That host is not yours to send home.' } : null; },
    start: (state, i) => {
      const a = state.parties[i.params.army]; const owner = state.houses[a.owner]; const house = i.house;
      // the sworn houses take their own men home, each lord riding with his; losses fall on every banner alike
      let others = 0;
      const swornMen = sworn(a).reduce((x, [, y]) => x + y, 0);
      const scale = swornMen > a.men ? a.men / swornMen : 1;
      for (const [vid, men] of sworn(a)) {
        const v = state.houses[vid]; if (!v) continue; const back = Math.round(men * scale * 0.9); others += men * scale;
        v.figures.levies = { ...(v.figures.levies || {}), v: (Number(v.figures.levies?.v) || 0) + back };
        v.obligations = { ...(v.obligations || {}), levies: 'not_called' }; delete v.obligations.host;
        for (const c of membersOf(state, a)) if (c.house === vid) sendHome(state, c, v.seat);
      }
      const home = Math.round(a.kind === 'fleet' ? 0 : Math.max(0, a.men - others) * 0.9);
      // the rest get down where the host stands (one's own), or ride home (a sworn host released from service)
      if (a.owner !== house) for (const c of membersOf(state, a)) sendHome(state, c, owner.seat);
      emit(state, 'host_disbanded', { actors: [a.commander], houses: [a.owner, a.serving], place: a.at || null, pos: a.pos, data: { party: a.id, name: a.name, men: a.men, why: a.owner === house ? 'disbanded' : 'released from service' }, cause: i.source });
      const name = a.name, released = a.owner !== house;
      disband(state, a);
      if (home) applyChanges(state, [{ op: 'figure', house: a.owner, field: 'levies', delta: home, source: 'Men sent home' }]);
      if (released) { owner.obligations = { ...(owner.obligations || {}), levies: 'not_called' }; delete owner.obligations.host; }
      return { name, released, home };
    },
    receipt: (state, i, d) => [{ ok: true, text: `${d.name} ${d.released ? 'is released from service' : 'disbands'}; the men go home to their fields${d.home ? ` (${fmtN(d.home)} back on the muster rolls)` : ''}.` }],
    said: (state, i, d) => ({ status: 'done', text: `${d.released ? 'Released from service' : 'Disbanded'} ${d.name}; the men go home to their fields.` }),
    facts: ['host_disbanded'], mind: { allowed: true },
  },
  {
    // how a host marches: openly, in secret, or behind a feint (fog of war — engine/knowledge.js)
    id: 'set_secrecy', family: 'intrigue', label: 'March openly, in secret, or behind a feint',
    params: { army: 'party:own', mode: 'enum:open|hidden|feint', to: 'holding?' },
    legal: (state, i) => {
      const a = state.parties[i.params.army]; if (!a || a.owner !== i.house) return { code: 'not_yours', text: 'That host is not yours.' };
      if (!['open', 'hidden', 'feint'].includes(i.params.mode)) return { code: 'mode', text: 'A host marches openly, in secret, or behind a feint.' };
      if (i.params.mode === 'feint' && !state.holdings[i.params.to]) return { code: 'no_place', text: 'Where should the realm think it goes?' };
      return null;
    },
    start: (state, i) => {
      const a = state.parties[i.params.army]; const { mode, to } = i.params; const pn = (id) => state.holdings[id]?.name || id;
      if (mode === 'open') { delete a.secrecy; delete a.feint; return { text: `${a.name} marches openly, banners flying.`, note: '', summary: `${a.name} marches openly.` }; }
      if (mode === 'hidden') { a.secrecy = 'hidden'; delete a.feint; return { text: `${a.name} is to march in secret: by night, off the roads, no banners.`, note: '[Already done: the host marches in secret; other houses lose track of it unless it comes near them.]', summary: `${a.name} will march in secret — a little slower, and hard to follow.` }; }
      a.feint = to; delete a.secrecy;
      // the word is spread and believed; what is true stays with the engine (the rumour's own fact says it is false)
      emit(state, 'rumour', { houses: [i.house], place: to, data: { party: a.id, feint: to, false: true }, cause: i.source, text: `Word goes about that ${a.name} marches on ${pn(to)}.` });
      return { text: `Spread word that ${a.name} marches on ${pn(to)}.`, note: `[Already done: word is spread that ${a.name} marches on ${pn(to)}. Those who have not seen it believe it.]`, summary: `Word goes out that ${a.name} marches on ${pn(to)}.` };
    },
    receipt: (state, i, d) => [{ ok: true, text: d.summary }],
    said: (state, i, d) => ({ status: 'done', text: d.text, note: d.note }),
    facts: ['rumour'], mind: { allowed: false, until: 'B9' } /* secrecy is about what other houses know of a host (WP B9) */,
  },
];
export { lordName };
