// The Director's hands (docs/gdd/04-ai-system.md §7; 09-living-world.md §9 point 3). A story hook from the catalogue
// (public/data/hooks.js) is chosen — by the model, or by the dice when the Director is off or the week is thin — and
// the engine makes it so: a fact the chronicle tells, small effects on the place and its house, and in the lord's own
// lands a matter that waits on his word. The model only names a hook and a place from the lists it is given; nothing it
// writes becomes the world.
import { HOOKS } from '../../data/hooks.js';
import { fits, placesFor, slotsFor, fill, sentenceCase, variant, inPlayerRealm } from '../shared/happenings.js';
import { vassalsOf, applyChanges } from '../shared/world.js';
import { dayNumber } from './time.js';
import { random } from './rng.js';
import { fact } from './facts/log.js';

export const HOOK_BY_ID = Object.fromEntries(HOOKS.map((h) => [h.id, h]));
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lordOf = (s, h) => { const c = s.characters[s.houses[h.owner]?.lord]; return c?.alive ? c : null; };

// the hooks' own conditions, beyond the happenings'
function fitsMore(s, tpl, h) {
  const owner = s.houses[h.owner]; const lord = lordOf(s, h);
  for (const w of tpl.when || []) {
    if (w === 'seat' && owner?.seat !== h.id) return false;
    if (w === 'vassals' && !vassalsOf(s, owner.id).length) return false;
    if (w === 'heir' && !Object.values(s.characters).some((c) => c.alive && c.house === owner.id && c.id !== lord?.id && (c.roles || []).includes('heir'))) return false;
  }
  return true;
}
const VOCAB = new Set(['seat', 'vassals', 'heir']);

/** Days since a hook last came (the realm's calendar), and whether its cooldown has run. */
const lastOf = (s) => (s.plots?.hooks || {});
const ready = (s, tpl) => dayNumber(s.meta.date) - (lastOf(s)[tpl.id] ?? -1e9) >= (tpl.cd ?? 60);

/**
 * The hooks the world fits now, each with the places it could happen (at most `places` of them, the lord's own region
 * first — that is where he is listening). Returns [{ id, title, tags, places: [holding id] }].
 */
export function eligibleHooks(state, { limit = 14, places = 6 } = {}) {
  const s = state; const pr = s.holdings[s.houses[s.meta.player]?.seat]?.region; const out = []; const day = dayNumber(s.meta.date);
  for (const tpl of HOOKS) {
    if (!ready(s, tpl)) continue;
    const base = { ...tpl, when: (tpl.when || []).filter((w) => !VOCAB.has(w)) };
    const at = placesFor(s, base).filter((h) => fits(s, base, h, lordOf(s, h)) && fitsMore(s, tpl, h) && !(/\{rival\}/.test(tpl.t + tpl.x) && !slotsHaveRival(s, h)));
    if (!at.length) continue;
    // half the places in the lord's own region (where he is listening), half elsewhere in the realm; no dice drawn
    const turn = (xs) => { const k = xs.length ? day % xs.length : 0; return [...xs.slice(k), ...xs.slice(0, k)]; };
    const near = turn(at.filter((h) => h.region === pr).sort((a, b) => a.id.localeCompare(b.id)));
    const far = turn(at.filter((h) => h.region !== pr).sort((a, b) => a.id.localeCompare(b.id)));
    const pick = [...near.slice(0, Math.ceil(places / 2)), ...far.slice(0, places)].slice(0, places);
    out.push({ id: tpl.id, title: tpl.t.split(' || ')[0], tags: tpl.tags || [], w: tpl.w ?? 1, places: (pick.length < places ? [...pick, ...near.slice(Math.ceil(places / 2))].slice(0, places) : pick).map((h) => h.id) });
  }
  // the offer: a few of the catalogue, turned by the day so the same ones do not always come first (deterministic)
  const k = out.length ? (day * 7) % out.length : 0;
  return [...out.slice(k), ...out.slice(0, k)].slice(0, limit);
}
// a house with a rival to quarrel with (no dice drawn)
function slotsHaveRival(s, h) {
  const house = h.owner;
  return Object.keys(s.houses).some((k) => k !== house && s.houses[k].seat && s.houses[k].region === s.houses[house]?.region);
}

/** The dice's choice among the eligible hooks (the Director off, or the week thin): weighted, one place. */
export function pickHook(state, r = random, offer = eligibleHooks(state)) {
  if (!offer.length) return null;
  const total = offer.reduce((a, h) => a + h.w, 0); let x = r() * total; let k = 0;
  for (; k < offer.length - 1; k++) { x -= offer[k].w; if (x <= 0) break; }
  const h = offer[k];
  return { hook: h.id, place: h.places[Math.floor(r() * h.places.length)] };
}

// '$owner', '$place', '$lord', '$rival' in a matter's effects: the place's house, the place, its lord, its rival
function bind(fx, ids) {
  const sub = (v) => (typeof v === 'string' && v.startsWith('$') ? ids[v.slice(1)] ?? null : Array.isArray(v) ? v.map(sub) : v && typeof v === 'object' ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, sub(x)])) : v);
  // an effect naming something that is not there (a house with no rival) is left out
  const whole = (v) => (v === null ? false : Array.isArray(v) ? v.every(whole) : v && typeof v === 'object' ? Object.values(v).every(whole) : true);
  return (fx || []).map(sub).filter(whole);
}

/**
 * Make a hook happen at a place. `day` is the day of the turn its fact falls on (the clock's). Returns { cards,
 * applied, matter } — the chronicle's card (the fact's), what changed, and the matter raised, if the place is the lord's.
 */
export function applyHook(state, id, place, { day = 1, r = random, why = '' } = {}) {
  const s = state; const tpl = HOOK_BY_ID[id]; const h = s.holdings[place];
  if (!tpl || !h || !s.houses[h.owner]) return null;
  const { ctx: slots, owner, lord, rival, friend } = slotsFor(s, h, r);
  // a hook names houses as the realm does: House Flint, not Flint
  const ctx = { ...slots, house: `House ${owner.name}`, ...(rival ? { rival: `House ${s.houses[rival].name}` } : {}), ...(friend ? { friend: `House ${s.houses[friend].name}` } : {}) };
  // a knight or a smallfolk named in the title is the same one named in the text and the matter
  const fixed = Object.fromEntries(Object.entries(ctx).map(([k, v]) => { let once; return [k, typeof v === 'function' ? () => (once ??= v()) : v]; }));
  const say = (t) => sentenceCase(fill(variant(t, r), fixed, r));
  const title = say(tpl.t), text = say(tpl.x);
  const mine = inPlayerRealm(s, h);
  const card = fact(s, 'hook', { title, text, where: h.id, importance: tpl.imp || 2, type: tpl.type || 'court', houses: [owner.id], day, ...(mine ? { mine: true } : {}) }, { data: { hook: id, ...(why ? { why } : {}) }, actors: lord ? [lord.id] : [], cause: { type: 'rule', ref: 'director' } });
  const applied = [];
  const fx = tpl.fx || {}; const hold = { op: 'holding', id: h.id };
  if (fx.pro) hold.prosperity = clamp((h.prosperity ?? 50) + fx.pro, 0, 100);
  if (fx.unr) hold.unrest = clamp((h.unrest ?? 10) + fx.unr, 0, 100);
  const ops = [];
  if (hold.prosperity != null || hold.unrest != null) ops.push(hold);
  if (fx.rel && rival) ops.push({ op: 'relation', a: owner.id, b: rival, delta: fx.rel, reason: title });
  if (fx.relf && friend) ops.push({ op: 'relation', a: owner.id, b: friend, delta: fx.relf, reason: title });
  if (ops.length) applied.push(...applyChanges(s, ops, { source: 'The realm', spanDays: 1 }).applied);
  if (fx.threat && s.plots?.threats) { const [k, d] = fx.threat; s.plots.threats[k] = clamp((s.plots.threats[k] || 0) + d, 0, 100); }
  // in the lord's own lands, the matter comes before him (and waits its days: 10 §6)
  let matter = null;
  if (mine && tpl.matter) {
    const ids = { owner: owner.id, place: h.id, lord: lord?.id || null, rival: rival || null };
    const m = tpl.matter;
    const options = m.options.map((o) => ({ label: say(o.label), hint: say(o.hint || ''), fx: bind(o.fx, ids) }));
    const r2 = applyChanges(s, [{ op: 'decision', matter: `hook:${id}`, title: say(m.title), text: say(m.text), from: bearer(s, owner, lord), where: h.id, options, days: 14 }], { source: 'The realm' });
    applied.push(...r2.applied);
    matter = s.decisions?.at(-1) || null;
    if (matter && m.lapse) matter.lapse = bind(m.lapse, ids);
    if (matter) matter.hook = id;
  }
  s.plots = s.plots || {}; s.plots.hooks = { ...(s.plots.hooks || {}), [id]: dayNumber(s.meta.date) };
  s.plots.lastHookDay = dayNumber(s.meta.date);
  return { cards: [card], applied, matter };
}

// who brings the matter before the lord: the sworn lord of the place, or, in the lord's own holdings, his steward or maester
function bearer(s, owner, lord) {
  const me = s.meta.player;
  if (owner.id !== me && lord) return lord.id;
  const officer = Object.values(s.characters).find((c) => c.alive && c.house === me && (c.roles || []).some((r) => ['steward', 'maester'].includes(r)));
  return officer?.id || s.houses[me].lord;
}

/** Whether a stretch of days was thin: fewer than three facts of note anywhere in the realm (09 §9 point 3). */
export function thinDays(state, from, to) {
  return (state.facts || []).filter((f) => f.day >= from && f.day <= to && (f.importance ?? 1) >= 2).length < 3;
}
