// Orders that actually happen (docs/gdd/04-ai-system.md §4). Each written order is read once, when it is written —
// by the pre-parser, and by the model only where the rules cannot read it (server/orders/interpret.js) — and the
// reading is tried at once on a copy of the world: that is the order's receipt, line by line, ✓ done, ⚠ done with a
// warning, ✗ refused with the reason the world gives. The turn then carries out exactly that reading through the verbs
// (engine/actions/registry.js), and the story is told what was done — it narrates, it never decides whether to obey.
import { applyChanges, resolvePlaceId, placeName } from '../public/js/shared/world.js';
import { settle } from '../public/js/engine/parties.js';
import { isFemale } from '../public/js/shared/people.js';
import { commandable } from '../public/js/shared/errands.js';
import { emit, fact } from '../public/js/engine/facts/log.js';
import { perform } from '../public/js/engine/actions/registry.js';
import { destination, raiseLevies, callBanners, mergeHosts } from '../public/js/engine/actions/military.js';
import { startWorks } from '../public/js/engine/actions/economy.js';
import { ravenDays } from '../public/js/engine/actions/diplomacy.js';
import { withDice } from './dice.js';
// the verbs' own helpers, where the rest of the server and the tests still reach for them here
export { commandable, destination, raiseLevies, callBanners, mergeHosts, startWorks, ravenDays };

// Is this person the one the order means? Their name, or what they are to the lord ("my wife", "the maester")
const KIN_WORDS = { wife: (s, c, l) => l?.spouse === c.id, husband: (s, c, l) => l?.spouse === c.id, lady: (s, c, l) => l?.spouse === c.id,
  heir: (s, c) => s.houses[c.house]?.heir === c.id, son: (s, c, l) => c.father === l?.id || c.mother === l?.id, daughter: (s, c, l) => c.father === l?.id || c.mother === l?.id,
  children: (s, c, l) => c.father === l?.id || c.mother === l?.id, maester: (s, c) => c.roles?.includes('maester'), steward: (s, c) => c.roles?.includes('steward'),
  captain: (s, c) => c.roles?.includes('captain'), spymaster: (s, c) => c.roles?.includes('spymaster') };
export function named(state, c, text) {
  const t = String(text || ''); const lord = state.characters[state.houses[state.meta.player]?.lord];
  const surname = state.houses[c.house]?.name;
  const words = c.name.replace(/^(Ser|Maester|Lord|Lady|Septa|Old) /, '').split(/\s+/).map((w) => w.replace(/[^\w]/g, '')).filter((w) => w.length > 2 && w !== surname);
  if (words.some((w) => new RegExp(`\\b${w}\\b`, 'i').test(t))) return true;
  return Object.entries(KIN_WORDS).some(([w, is]) => new RegExp(`\\b${w}\\b`, 'i').test(t) && is(state, c, lord));
}

// "sixty million gold dragons", "60,000,000 dragons", "two thousand gold": the sum an order means to spend
const UNITS = { a: 1, an: 1, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12, fifteen: 15, twenty: 20, thirty: 30, forty: 40, fifty: 50, sixty: 60, seventy: 70, eighty: 80, ninety: 90, dozen: 12, score: 20, hundred: 100 };
const MAG = { thousand: 1e3, million: 1e6, billion: 1e9 };
export function goldIn(text) {
  const t = String(text).toLowerCase().replace(/,/g, '');
  const m = t.match(/\b(\d+(?:\.\d+)?|[a-z]+(?:[\s-][a-z]+)?)\s*(thousand|million|billion)?\s+(?:gold(?:en)?\s+)?(?:dragons|gold|coins|stags)\b/);
  if (!m) return null;
  let n = Number(m[1]); if (!isFinite(n)) { n = m[1].split(/[\s-]+/).reduce((a, w) => a + (UNITS[w] ?? 0), 0); if (!n) return null; }
  return n * (MAG[m[2]] || 1);
}

// a levy called by a written order walks in from the fields over days (a card's muster is shown at once)
const paramsOf = (a) => (a.verb === 'raise_levies' ? { immediate: false, ...a.params } : a.params);
const current = (o) => o.parsed && o.parsedFor === o.text;
const pending = (o) => !o.auto && !o.executed && String(o.text || '').trim();
/** An order the house cannot pay for is refused before anything is read into it. */
function unpaid(state, o) {
  const purse = Math.round(Number(state.houses[state.meta.player].figures.treasury?.v) || 0); const g = goldIn(o.text);
  return g && g > purse * 1.02 ? `the treasury holds ${purse.toLocaleString('en-GB')} dragons, not ${Math.round(g).toLocaleString('en-GB')}` : null;
}

/**
 * Carry out one order's reading on `world` (the real one at the turn, a copy for the receipt). Returns the receipt:
 * [{ ok: true | 'warn' | false | 'ask' | 'story', text, eta? }], and the intents done (for what follows from them).
 */
export function carryOut(world, o, reading = o.parsed) {
  const lines = []; const intents = [];
  const why = unpaid(world, o);
  if (why) return { lines: [{ ok: false, text: why.charAt(0).toUpperCase() + why.slice(1) + '.' }], intents };
  if (reading?.clarify && !reading.actions?.length) return { lines: [{ ok: 'ask', text: reading.clarify.question }], intents };
  const source = { type: 'order', ref: o.id || null };
  for (const a of reading?.actions || []) {
    const r = perform(world, a.verb, { params: paramsOf(a), source });
    lines.push(...r.receipt);
    if (r.ok) intents.push(r.intent);
  }
  // a letter flies with the order's own words (answered, when it comes to it, in the lord's temper: resolveEnvoys)
  if (reading?.letter?.to && !o.post) {
    const r = perform(world, 'send_letter', { params: { to: reading.letter.to, text: o.text }, source });
    lines.push(...r.receipt); if (r.ok) { intents.push(r.intent); o.post = r.done.post; }
  }
  if (!lines.length) lines.push({ ok: 'story', text: 'Left to the story: no one moves and no gold is spent.' });
  return { lines, intents };
}

/**
 * Read every order not yet read for its present words — `interpret(text)` gives a reading — and give each unexecuted
 * order its receipt: the readings tried in order on one copy of the world (the second order sees the first done).
 * Returns whether anything was read.
 */
export async function readOrders(state, interpret) {
  const todo = state.orders.filter((o) => pending(o) && !current(o));
  for (const o of todo) { o.parsed = await interpret(o.text, o); o.parsedFor = o.text; delete o.chosen; }
  // the copy rolls its own dice: a receipt never spends the save's (a turn replays the same whether or not it was read)
  const dry = structuredClone(state);
  withDice(dry, () => {
    for (const o of state.orders) {
      if (!pending(o) || !current(o)) continue;
      o.receipt = carryOut(dry, { ...o, post: undefined }).lines.map(({ ok, text, eta }) => ({ ok, text, ...(eta ? { eta } : {}) }));
    }
  });
  return todo.length > 0;
}

/** Answer an order's question (a clarify chip): a patch for the action left open, or words added to the order. */
export function answerOrder(o, k) {
  const q = o.parsed?.clarify; const opt = q?.options?.[k]; if (!opt) return false;
  if (opt.patch && q.pending) {
    o.parsed = { ...o.parsed, actions: [...o.parsed.actions, { verb: q.pending.verb, params: { ...q.pending.params, ...opt.patch } }], clarify: null, story: false };
    o.chosen = opt.label; return true;
  }
  // an answer the rules cannot fold in is added to the order, which is then read again
  o.text = `${String(o.text).replace(/\s+$/, '')} — ${opt.label}`; delete o.parsed; delete o.parsedFor; return true;
}

/** Carry out the turn's written orders, each as its reading says, marking each with what was done. */
export async function carryOutOrders(state, interpret) {
  const fresh = state.orders.filter(pending);
  if (!fresh.length) return [];
  const results = []; const intents = [];
  for (const [k, o] of fresh.entries()) {
    if (!current(o)) { o.parsed = await interpret(o.text, o); o.parsedFor = o.text; }
    const r = carryOut(state, o);
    results[k] = r.lines.filter((l) => l.ok !== 'story').map((l) => (l.ok === false ? `could not be done: ${l.text.replace(/\.$/, '')}` : l.ok === 'ask' ? `could not be done: the order was not clear — ${l.text.replace(/\?$/, '')}` : l.text.replace(/\.$/, '')));
    intents[k] = r.intents;
  }
  // 'all my men', 'the whole host', 'the banners': every sworn host answering the call goes where the order sends the rest
  fresh.forEach((o, k) => {
    if (!/\b(all|every|everything|whole|entire|all my men|the army|my army|banners|bannermen|our strength)\b/i.test(o.text)) return;
    // where the order's own host went: a march, or a host raised to go somewhere
    const to = (intents[k] || []).map((x) => (x.verb === 'march_host' ? x.params.to : x.verb === 'raise_levies' && x.params.to ? destination(state, x.params.to) : null)).find(Boolean); if (!to) return;
    for (const a of Object.values(state.parties)) {
      if (!commandable(state, a) || a.owner === state.meta.player || a.march?.to === to) continue;
      a.march = { to, since: state.meta.turn }; settle(state, a);
      emit(state, 'set_out', { actors: [a.commander], houses: [a.owner, a.serving], pos: a.pos, data: { party: a.id, to }, cause: { type: 'order', ref: o.id } });
      results[k].push(`${a.name} marches for ${placeName(state, to)}`);
    }
  });
  const done = resolveEnvoys(state, fresh);
  fresh.forEach((o, k) => {
    const r = results[k];
    if (r?.length) {
      o.executed = true; o.result = r;
      o.note = [o.note, `[Already carried out by the engine this turn: ${r.join('; ')}. Do not repeat these changes; narrate how they unfold and what follows.]`].filter(Boolean).join(' ');
      done.push({ order: o.text, result: r });
    }
  });
  return done;
}

// ── Words sent to other lords ──
// "Send a raven to Walder Frey: open the crossing or I burn the Twins." An order that addresses a lord of
// another house is weighed by the same temperament as a face-to-face audience (shared/temperament.js): he
// agrees, names a price, stalls, refuses, gives in from fear, or answers in anger. The engine records the
// outcome (a pact agreed, fealty sworn) and tells the story model, which writes his reply by raven.

const SENDING = /\b(raven|letter|write|envoy|emissary|herald|word to|message|demand|threaten|warn|offer|propose|ask|tell|order|command|summon|insist|bid|urge|invite|request)\b/i;
function addressed(state, text) {
  const p = state.meta.player; const t = String(text);
  const people = Object.values(state.characters).filter((c) => c.alive && c.house !== p && !/imprisoned|missing/.test(c.status || ''));
  // full names first ("Walder Frey"), then "Lord Frey" / "Lady Arryn" meaning the head of that house
  let hit = people.find((c) => t.includes(c.name) || t.includes(c.name.replace(/^(Ser|Lord|Lady|Maester|King|Queen|Prince|Princess) /, '')));
  if (!hit) {
    const m = t.match(/\b(Lord|Lady|King|Queen|Prince|Princess)\s+([A-Z][a-z']+)/);
    if (m) {
      const h = Object.values(state.houses).find((x) => x.name === m[2] && x.id !== p); const lord = h && state.characters[h.lord];
      if (lord?.alive) hit = lord;
      else hit = people.filter((c) => (c.roles || []).some((r) => ['lord', 'lady', 'ruler'].includes(r)) || Object.values(state.houses).some((x) => x.lord === c.id)).find((c) => c.name.split(' ')[0] === m[2] || c.name.split(' ')[1] === m[2]) || null; // "Lord Tywin"
    }
  }
  if (!hit) {
    // "Lord Commander Mormont", "Maester Aemon", "Ser Barristan": a title and a name; the one whose title fits
    const m = t.match(/\b(?:Lord Commander|Lord|Lady|Ser|Maester|Septon|Prince|Princess|King|Queen|Commander|Grand Maester)\s+([A-Z][a-z']+)/g) || [];
    for (const x of m) {
      const name = x.split(/\s+/).at(-1); const title = x.slice(0, -name.length).trim().toLowerCase();
      const pool = people.filter((c) => c.name.split(' ').includes(name));
      hit = pool.find((c) => (c.title || '').toLowerCase().includes(title.replace(/^lord |^lady /, '')) && title.length > 4) || pool.find((c) => Object.values(state.houses).some((h) => h.lord === c.id)) || pool[0] || null;
      if (hit) break;
    }
  }
  return hit || null;
}
export function resolveEnvoys(state, orders) {
  const done = [];
  for (const o of orders) {
    // a letter already flying is answered when it lands (server/letters.js), in the mood and the world of that day
    if (o.auto || o.envoy || o.post || o.parsed?.actions?.length || !SENDING.test(o.text)) continue;
    // words for a lord of another house that were not read as a letter still go as one
    const c = addressed(state, o.text); if (!c || c.house === state.meta.player || !c.alive) continue;
    const r = perform(state, 'send_letter', { params: { to: c.id, text: o.text }, source: { type: 'order', ref: o.id || null } });
    if (!r.ok) continue;
    o.post = r.done.post; o.envoy = { who: c.id };
    done.push({ order: o.text, result: r.receipt.map((l) => l.text) });
  }
  return done;
}

// ── Every order is a story beat ──
// The player's words are the heart of the turn: each order gets an event of its own, told first — what the engine did
// (with its numbers: who leads, how many, where), or why it could not be done (told in the world, with the courtiers'
// faces), or, for words the engine cannot carry out itself (diplomacy, speeches, justice), how the world answered.
function outcomeOf(o) {
  const lines = (o.result || []).map(String);
  if (o.envoy) return { kind: 'answered', lines };
  if (!lines.length) return { kind: o.status === 'done' ? 'done' : 'story', lines };
  if (lines.every((l) => /^could not/i.test(l))) return { kind: 'refused', lines: lines.map((l) => l.replace(/^could not( be done)?:\s*/i, '')) };
  return { kind: 'done', lines: lines.filter((l) => !/^could not/i.test(l)).concat(lines.filter((l) => /^could not/i.test(l))) };
}
export function ordersBlock(state, orders) {
  const lord = state.characters[state.houses[state.meta.player].lord];
  if (!orders.length) return `THE LORD'S ORDERS: none this period — ${lord?.name || 'the lord'} waits and watches.`;
  const rows = orders.map((o, i) => {
    const r = outcomeOf(o); const n = i + 1; const said = `"${o.text.replace(/\s*\[[^\]]*\]\s*/g, ' ').trim()}"`;
    if (r.kind === 'done') return `${n}. ${said}\n   DONE BY THE ENGINE (true, do not repeat as changes): ${r.lines.join('; ')}.\n   → Write how it was done: who carried it out, how many men and who leads them, where they go and how long it takes, how people took it.`;
    if (r.kind === 'refused') return `${n}. ${said}\n   COULD NOT BE DONE: ${r.lines.join('; ')}.\n   → ONE event: the attempt failing in the world — the steward's answer, the empty coffers, the lord who would not come, the laughter if it was absurd. Nothing of it happens: no gold is sent, no one rides, no changes that pretend it did.`;
    if (r.kind === 'answered') return `${n}. ${said}\n   ${(o.note || '').match(/\[The engine has weighed[^\]]*\]/)?.[0] || ''}\n   → Write the message going out and the answer coming back as the engine decided.`;
    return `${n}. ${said}\n   YOURS TO RESOLVE: carry it out as Westeros would — by whom, by what means (a raven takes days, an envoy rides, a lord must be persuaded), with changes for every consequence; partial success and refusal are allowed when the world would refuse. Never move the lord's own people or hosts yourself.`;
  });
  return `THE LORD'S ORDERS — THE HEART OF THIS TURN. ${lord?.name || 'The lord'} gave these orders. Answer EACH with an event of its own, with "order": its number, before any other event. The event names who acted, where, and the numbers.\n${rows.join('\n')}`;
}

/** Make sure every order has its event: the story's own if it wrote one, else the engine's plain account. */
const STOP = new Set(['their', 'there', 'which', 'about', 'lord', 'lady', 'house', 'winterfell', 'north', 'stark', 'eddard', 'commanded', 'command', 'order', 'orders', 'would', 'shall', 'these', 'those', 'where', 'while', 'with', 'from', 'into', 'upon', 'dragons', 'gold']);
const keyWords = (t) => [...new Set(String(t).toLowerCase().match(/[a-z']{4,}/g) || [])].filter((w) => !STOP.has(w));
export function orderEvents(state, orders, modelEvents) {
  const p = state.meta.player; const lord = state.characters[state.houses[p].lord];
  const out = [];
  orders.forEach((o, i) => {
    let mine = modelEvents.filter((e) => Number(e.order) === i + 1);
    // the story told it without saying so: the untagged event that names the order's people and deeds is its event
    if (!mine.length) {
      const key = keyWords(`${(o.result || []).join(' ')} ${o.text}`);
      const best = modelEvents.filter((e) => !e.order && !e.orderId).map((e) => [e, keyWords(`${e.title} ${e.text}`).filter((w) => key.includes(w)).length]).sort((a, b) => b[1] - a[1])[0];
      if (best && best[1] >= 2) { best[0].order = i + 1; mine = [best[0]]; }
    }
    // a refused order is one event — the failure — and nothing of it happens elsewhere in the story
    if (mine.length > 1 && outcomeOf(o).kind === 'refused') { for (const extra of mine.slice(1)) { const k = modelEvents.indexOf(extra); if (k >= 0) modelEvents.splice(k, 1); } mine = mine.slice(0, 1); }
    for (const e of mine) { e.mine = true; e.orderId = o.id; e.importance = Math.max(3, e.importance || 3); e.houses = [...new Set([p, ...(e.houses || [])])]; }
    if (mine.length) return;
    const r = outcomeOf(o); const said = o.text.replace(/\s*\[[^\]]*\]\s*/g, ' ').trim();
    const place = r.lines.map((l) => l.match(/\b(?:for|to|at) ([A-Z][\w' ]+?)(?: \(|,|$| with| —|\.)/)?.[1]).map((x) => x && resolvePlaceId(x)).find(Boolean) || resolvePlaceId(lord?.loc) || state.houses[p].seat;
    const head = (r.kind === 'refused' ? `${lord?.name || 'The lord'}'s command comes to nothing` : r.lines[0] || `${lord?.name || 'The lord'} gives ${lord && isFemale(lord) ? 'her' : 'his'} command`).split(/(?<=[.!?])\s/)[0].replace(/\s*\([^)]*\)/g, '').replace(/[.!]+$/, '').slice(0, 90);
    out.push({ day: 1, title: head.charAt(0).toUpperCase() + head.slice(1), text: r.kind === 'story' ? `${lord?.name || 'The lord'} commands: “${said}”` : `${lord?.name || 'The lord'} commanded: “${said.replace(/[.!]+$/, '')}.” ${r.lines.join('; ').replace(/[.!]+$/, '')}.`, where: place, importance: 3, type: r.kind === 'refused' ? 'court' : /march|rides|host|men/i.test(r.lines.join(' ')) ? 'war' : /raven|letter/i.test(r.lines.join(' ')) ? 'diplomacy' : 'court', houses: [p], mine: true, orderId: o.id });
  });
  return out;
}

/** Bring the next day's levy contingent into its camp. Numbers are engine-owned and grow visibly. */
export function advanceMusters(state, days) {
  const events = [];
  for (const a of Object.values(state.parties)) {
    if (!a.muster?.remaining || a.kind === 'fleet') continue;
    const add = Math.min(a.muster.remaining, Math.max(0, Math.round(a.muster.daily * days)));
    if (!add) continue;
    a.men += add; a.muster.remaining -= add;
    if (a.muster.remaining <= 0) { delete a.muster; settle(state, a); }
    events.push(fact(state, 'muster_grew', { title: `${a.name} grows in the fields`, text: `${add.toLocaleString('en-GB')} more men have reached the camp. The host now numbers ${a.men.toLocaleString('en-GB')}.`, where: a.at || null, importance: 2, houses: [a.owner] }, { actors: [a.commander], data: { party: a.id, men: add, total: a.men }, cause: { type: 'rule', ref: 'muster' } }));
  }
  return events;
}

