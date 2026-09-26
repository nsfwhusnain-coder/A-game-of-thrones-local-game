// Orders that actually happen. Before each turn the player's written orders are turned into concrete engine
// actions — someone rides somewhere (with men), a host marches, men are recruited where the house has people,
// an officer is hired, a levy is raised — and the engine carries them out. The story model is then told what
// has already been done, so it narrates the consequences instead of deciding whether to obey.
import { applyChanges, resolvePlaceId, placeName, slug, dateStr, dayNumber } from '../public/js/shared/world.js';
import { MILES_PER_UNIT } from '../public/data/geography.js';
import { whereabouts } from '../public/js/shared/roads.js';
import { commandable } from '../public/js/shared/errands.js';
import { PROJECT_TEMPLATES } from '../public/js/shared/economy.js';
export { commandable };

const OFFICES = ['spymaster', 'steward', 'maester', 'captain', 'master_at_arms', 'knight', 'envoy', 'commander'];

// Where an order means to go: a place by name; a house ('the Lannisters') means its seat; a direction, the
// obvious place on the road that way from the North and the Riverlands
function destination(state, text) {
  const id = resolvePlaceId(text); if (id) return id;
  const t = String(text || '').toLowerCase();
  const h = Object.values(state.houses).find((x) => x.seat && (t.includes(x.name.toLowerCase()) || t.includes(x.id.replace(/_/g, ' '))));
  if (h) return h.seat;
  const dir = { south: 'moat_cailin', north: 'stark', riverlands: 'tully', west: 'lannister', capital: 'kings_landing', crossing: 'frey', wall: 'nights_watch' };
  for (const [k, v] of Object.entries(dir)) if (t.includes(k)) return resolvePlaceId(v);
  return null;
}

function context(state) {
  const p = state.meta.player; const me = state.houses[p]; const lord = state.characters[me.lord];
  const people = Object.values(state.characters).filter((c) => c.alive && c.house === p).sort((a, b) => (b.roles?.length || 0) - (a.roles?.length || 0)).slice(0, 45);
  const hosts = Object.values(state.armies).filter((a) => commandable(state, a));
  const holds = Object.values(state.holdings).filter((h) => h.owner === p);
  const where = (c) => whereabouts(state, c).text;
  return [
    `PLAYER HOUSE: ${p} (House ${me.name}). The lord giving orders: ${lord ? `${lord.id} (${lord.name}), at ${where(lord)}` : 'unknown'}.`,
    `TREASURY: ${Math.round(Number(me.figures?.treasury?.v) || 0)} gold dragons. Household men-at-arms: ${Math.round(Number(me.figures?.menAtArms?.v) || 0)}. Unraised levies: ${Math.round(Number(me.figures?.levies?.v) || 0)}.`,
    'YOUR PEOPLE (id | name | office | where):\n' + people.map((c) => `${c.id} | ${c.name} | ${c.title || (c.roles || []).join('/')} | ${where(c)}`).join('\n'),
    'YOUR HOSTS — yours, and your sworn lords\' hosts answering your call (id | name | men | where):\n' + (hosts.map((a) => `${a.id} | ${a.name}${a.owner !== p ? ` (House ${state.houses[a.owner]?.name}, sworn to you)` : ''} | ${a.men} | ${a.at ? placeName(state, a.at) : 'in the field'}${a.march ? ` (marching to ${placeName(state, a.march.to)})` : ''}`).join('\n') || '(none — to fight, raise levies first with a "raise" action)'),
    'YOUR ENEMIES AND RIVALS\' SEATS (for orders like "attack the Lannisters"): ' + Object.values(state.houses).filter((h) => h.seat && h.id !== p && ['paramount', 'crown', 'major'].includes(h.rank)).map((h) => `${h.name}: ${state.holdings[h.seat]?.name}`).join('; '),
    'YOUR HOLDINGS: ' + (holds.map((h) => `${h.id} (${h.name})`).join(', ') || '(none)'),
  ].join('\n\n');
}

export function ordersPrompt(state, orders) {
  const system = `You turn a lord's written orders into game actions, exactly as he gives them. His household and bannermen obey him; do not refuse, soften or second-guess an order — if it can be carried out, emit the action.
Reply with ONE JSON object: {"actions":[...],"story":[...]}. Only concrete moves are actions — someone travels, a host marches, men are recruited (a number you are given or can infer), an officer is hired or appointed. Drilling, counting, inspecting, writing, feasting, judging, spying and the like are for the story: put their order numbers in "story" and emit no action for them.
"actions" — only these kinds, one object per thing to do, each with "order": the number of the order it comes from:
- {"op":"travel","order":1,"character":"<person id>","to":"<place name>","men":<number of men to take, 0 if none>}   — someone rides somewhere (with a party of men if asked)
- {"op":"march","order":1,"army":"<host id>","to":"<place name>"}   — a host marches
- {"op":"recruit","order":1,"at":"<place name>","men":<number>,"kind":"men-at-arms|sellswords"}   — hire fighting men where the house has people (e.g. the lord's own city of residence)
- {"op":"raise","order":1,"at":"<holding id>","men":<number>,"to":"<place name, optional>"}   — call up levies from the house's own lands (with "to", the new levies march there at once)
- {"op":"hire","order":1,"role":"${OFFICES.join('|')}","at":"<place name>"}   — take a new officer into service there
- {"op":"appoint","order":1,"character":"<person id>","role":"${OFFICES.join('|')}"}   — give one of your people an office
- {"op":"works","order":1,"template":"${PROJECT_TEMPLATES.map((t) => t.key).join('|')}","at":"<holding id>"}   — fund building works (granaries, walls, a rookery…) on the house's own land
"story" — the numbers of orders that are not actions of these kinds (diplomacy, letters, intrigue, speeches, feasts…): the story will handle them.
A raven, letter or "send word" is never a travel action: it goes in "story" — only a person told to ride, go or deliver by hand travels. Use only ids from the lists. "to" is always a real place by name (a castle or town): for "attack the Lannisters" use their seat; for "go south" pick the place on the road that way. To fight when you have no host at hand, first "raise" levies (with "to"). Your sworn lords' hosts answering your call are yours to command too.
Places by their name as written. If an order names "here", it means where the lord is. JSON only.`;
  const user = `${context(state)}\n\nTHE LORD'S ORDERS:\n${orders.map((o, i) => `${i + 1}. ${o.text}`).join('\n')}`;
  return [{ role: 'system', content: system }, { role: 'user', content: user }];
}

// Offline / fallback: the common orders, read by rule
// Dictated orders spell their numbers: "ten men", "a hundred riders", "two thousand spears", "a score of knights"
const UNITS = { a: 1, an: 1, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12, fifteen: 15, twenty: 20, thirty: 30, forty: 40, fifty: 50, sixty: 60, seventy: 70, eighty: 80, ninety: 90, dozen: 12, score: 20 };
export function wordNumber(t) {
  const m = String(t).toLowerCase().match(/\b((?:a|an|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|fifteen|twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety|a dozen|a score|dozen|score)(?:[\s-]+(?:one|two|three|four|five|six|seven|eight|nine))?)(?:\s+(hundred|thousand))?(?:\s+and\s+(\w+))?(?:\s+(hundred|thousand))?\s+(?:of\s+)?(?:men|riders|swords|spears|soldiers|guards|knights|archers|horse|sellswords|levies|men-at-arms|bowmen|lances)/);
  if (!m) return null;
  let n = m[1].split(/[\s-]+/).reduce((a, w) => a + (UNITS[w] ?? 0), 0) || 1;
  if (/^a (dozen|score)$/.test(m[1])) n = UNITS[m[1].slice(2)];
  if (m[2] === 'hundred') n *= 100; if (m[2] === 'thousand') n *= 1000;
  if (m[3] && UNITS[m[3]]) n += UNITS[m[3]] * (m[4] === 'hundred' ? 100 : 1);
  return n;
}

export function readOrdersByRule(state, orders, addressee = null) {
  const p = state.meta.player; const me = state.houses[p]; const lord = state.characters[me.lord];
  const people = Object.values(state.characters).filter((c) => c.alive && c.house === p);
  // the person meant: whoever's name is most fully in the order (first names count double)
  const findPerson = (t) => {
    let best = null, bs = 0;
    for (const c of people) {
      const words = c.name.replace(/^(Ser|Maester|Lord|Lady) /, '').split(' ').map((w) => w.replace(/[^\w]/g, '')).filter((w) => w.length > 2);
      const sc = words.reduce((n, w, k) => n + (new RegExp(`\\b${w}\\b`, 'i').test(t) ? (k === 0 ? 2 : 1) : 0), 0);
      if (sc > bs) { bs = sc; best = c; }
    }
    return best;
  };
  const placeIn = (t) => { const m = t.match(/\b(?:to|for|at|in|towards?)\s+(?:the\s+)?([A-Z][\w'’]+(?:\s+(?:of\s+the\s+|of\s+|['’]s\s+)?[A-Z][\w'’]+)*)/); return m && resolvePlaceId(m[1]) ? m[1] : null; };
  const num = (t) => { const m = t.replace(/,/g, '').match(/\b(\d{1,6})\b/); return m ? Number(m[1]) : wordNumber(t); };
  const actions = [];
  orders.forEach((o, i) => {
    const t = o.text; const n = i + 1;
    if (/\b(recruit|hire|enlist|sign on|raise)\b.*\b(men|swords|soldiers|sellswords|guards?|spears|company)\b/i.test(t) && !/\blevies\b/i.test(t)) {
      const at = placeIn(t) || (/\bhere\b|this city|the city/i.test(t) && lord ? lord.loc : null) || lord?.loc;
      actions.push({ op: 'recruit', order: n, at, men: num(t) || 200, kind: /sellsword|free company|merc/i.test(t) ? 'sellswords' : 'men-at-arms' });
      return;
    }
    const office = OFFICES.find((r) => new RegExp(r.replace('_', '[ -]?') + '|' + (r === 'spymaster' ? 'master of whisperers|spy' : r), 'i').test(t));
    if (office && /\b(hire|find|seek|take into (my )?service|get)\b/i.test(t)) { actions.push({ op: 'hire', order: n, role: office, at: placeIn(t) || lord?.loc }); return; }
    const who = findPerson(t) || (addressee && state.characters[addressee]); const to = placeIn(t);
    if (who && to && /\b(ride|go|travel|march|come|send|return|sail|head|make for)\b/i.test(t)) { actions.push({ op: 'travel', order: n, character: who.id, to, men: /\b(men|riders|swords|guards|escort|company)\b/i.test(t) ? num(t) || 50 : 0 }); return; }
    const host = Object.values(state.armies).find((a) => a.owner === p && new RegExp(a.name.replace(/[^\w ]/g, ''), 'i').test(t));
    if (host && to) actions.push({ op: 'march', order: n, army: host.id, to });
  });
  return { actions, story: [] };
}

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
const HIRING = /\b(recruit|hire|enlist|sign(?:s|ing)? on|take on|buy|sellswords?|free company|more men|new men|men-at-arms|raise (?:[\w,]+ ){0,3}(?:men|swords|spears|soldiers|guards))\b/i;
const LETTER = /\b(raven|letter|write|writes|written|send word|a message|missive|note to)\b/i;
const IN_PERSON = /\b(ride|rides|go|goes|travel|journey|in person|himself|herself|themselves|escort|carry it|deliver it by hand|by hand)\b/i;
const MEN_WORDS = /\b(men|riders|swords|guards?|escort|company|spears|knights|soldiers|retinue|household)\b/i;

/** Begin one of the works a house can fund (economy.js PROJECT_TEMPLATES) at one of its holdings — once. */
export function startWorks(state, key, holding) {
  const p = state.meta.player; const me = state.houses[p];
  const t = PROJECT_TEMPLATES.find((x) => x.key === key || slug(x.name) === slug(key || '')); if (!t) throw new Error('no such works');
  const at = resolvePlaceId(holding); const hold = state.holdings[at]?.owner === p ? at : me.seat;
  if ((Number(me.figures.treasury?.v) || 0) < t.cost * 0.25) throw new Error(`The treasury cannot even fund the first stage of ${t.name} (needs ~${Math.round(t.cost * 0.25)} gd up front).`);
  const name = `${t.name} at ${state.holdings[hold].name}`;
  const r = applyChanges(state, [{ op: 'project', house: p, name, template: t.key, cost: t.cost, months: t.months, holding: hold, effect: t.effect }]);
  if (r.rejected.length) throw new Error(r.rejected[0].reason.replace(/^./, (x) => x.toUpperCase()) + '.');
  return { name, cost: t.cost, months: t.months };
}

/** Carry out interpreted actions; returns per-order results. `orders` are the orders the actions came from. */
export function executeActions(state, actions, orders = []) {
  const p = state.meta.player; const me = state.houses[p]; const results = {};
  const note = (i, text) => { (results[i] = results[i] || []).push(text); };
  for (const a of actions || []) {
    const i = Number(a.order) || 0;
    // an action with nothing in it (recruit 0 men) is no action: the story tells that order
    if (['recruit', 'hire_men'].includes(a.op) && !(Number(a.men) >= 10)) continue;
    try {
      if (a.op === 'march') {
        const mine = Object.values(state.armies).filter((x) => commandable(state, x));
        // 'the army', 'my host': the largest host at hand if the model named none we know
        const army = (state.armies[a.army] && commandable(state, state.armies[a.army]) ? state.armies[a.army] : null) || mine.find((x) => slug(x.name) === slug(a.army || '')) || (mine.length ? [...mine].sort((x, y) => y.men - x.men)[0] : null);
        const to = destination(state, a.to);
        if (!army) throw new Error('you have no host to march — raise your levies or wait for your bannermen');
        if (!to) throw new Error('unknown place ' + a.to);
        army.march = { to, since: state.meta.turn }; army.status = 'marching';
        note(i, `${army.name} marches for ${placeName(state, to)}`); continue;
      }
      if (a.op === 'raise') {
        const at = resolvePlaceId(a.at); const hold = state.holdings[at];
        if (!hold || (hold.owner !== p && state.houses[hold.owner]?.liege !== p)) throw new Error('not your land');
        const avail = Number(me.figures.levies?.v) || 0; const men = Math.min(avail, Math.round(Number(a.men) || 1000));
        if (men < 50) throw new Error('no levies left to call');
        const r = applyChanges(state, [{ op: 'army_create', owner: p, name: `Levies of ${hold.name}`, at, men, composition: `Levies of House ${me.name}`, status: 'mustering' }, { op: 'figure', house: p, field: 'levies', delta: -men, source: 'Muster rolls' }], { source: 'Your orders' });
        r.applied.forEach((x) => note(i, x.text)); r.rejected.forEach((x) => note(i, `could not: ${x.reason}`));
        // raised to go somewhere: the new levies march at once
        const dest = a.to && destination(state, a.to); const made = Object.values(state.armies).filter((x) => x.owner === p && x.name === `Levies of ${hold.name}`).at(-1);
        if (dest && made) { made.march = { to: dest, since: state.meta.turn }; made.status = 'marching'; made.at = null; note(i, `${made.name} marches for ${placeName(state, dest)}`); }
        continue;
      }
      if (a.op === 'works') { const w = startWorks(state, a.template, a.at); note(i, `Work begins: ${w.name} (${w.cost} dragons over ${w.months} moons)`); continue; }
      if (a.op === 'appoint') {
        const c = state.characters[a.character]; if (!c || c.house !== p || !c.alive) throw new Error('no such person of yours');
        if (!OFFICES.includes(a.role)) throw new Error('unknown office');
        for (const o of Object.values(state.characters)) if (o.house === p && o.id !== c.id && o.roles?.includes(a.role) && a.role !== 'commander' && a.role !== 'knight') o.roles = o.roles.filter((r) => r !== a.role);
        c.roles = [...new Set([...(c.roles || []), a.role])]; note(i, `${c.name} takes up the office of ${a.role.replace('_', ' ')}`); continue;
      }
      const op = { travel: 'travel', recruit: 'recruit', hire: 'hire' }[a.op]; if (!op) continue;
      const change = { ...a, op, house: p };
      // gold is spent on men only when the order asks to hire them: "garrison", "drill", "count" hire no one
      if (op === 'recruit' && orders[i - 1]?.text && !HIRING.test(orders[i - 1].text)) throw new Error('the order does not ask for men to be hired');
      if (op === 'travel') {
        // only the one the order names goes, only with men if it asks for men, and a direction is a place
        const who = state.characters[a.character]; const text = orders[i - 1]?.text;
        if (who && text && !named(state, who, text)) throw new Error(`the order does not name ${who.name}`);
        if (text && !MEN_WORDS.test(text) && !/\d/.test(text)) change.men = 0;
        // "send a raven", "write to", "send word": a letter flies; no one rides unless the order says so
        if (text && LETTER.test(text) && !IN_PERSON.test(text)) throw new Error('that is a letter — it goes by raven, and no one rides');
        change.to = destination(state, a.to) || a.to;
      }
      const r = applyChanges(state, [change], { source: 'Your orders' });
      r.applied.forEach((x) => note(i, x.text)); r.rejected.forEach((x) => note(i, `could not be done: ${x.reason}`));
    } catch (e) { note(i, `could not be done: ${e.message}`); }
  }
  return results;
}

/** Turn written orders into engine actions: the model reads them, the rules catch what it misses. */
export async function planOrders(state, orders, ask) {
  let plan = null;
  if (ask) { try { plan = await ask(ordersPrompt(state, orders)); } catch { plan = null; } }
  if (!plan || !Array.isArray(plan.actions)) plan = readOrdersByRule(state, orders);
  else if (!plan.actions.length) { const byRule = readOrdersByRule(state, orders); if (byRule.actions.length) plan = byRule; }
  return plan.actions || [];
}
const hasPlan = (o) => Array.isArray(o.plan) && o.planFor === o.text;

/**
 * The receipt for orders not yet carried out: each is read now and tried on a copy of the world, so the player
 * sees exactly what will be done (who, where, how long, how many) before the turn — and the turn then does that.
 */
export async function previewOrders(state, ask) {
  const todo = state.orders.filter((o) => !o.auto && !o.executed && String(o.text || '').trim() && !hasPlan(o));
  if (!todo.length) return false;
  const actions = await planOrders(state, todo, ask);
  const dry = structuredClone(state);
  const res = executeActions(dry, actions, todo);
  const letters = todo.map((o) => ({ ...o })); postLetters(dry, letters);
  todo.forEach((o, k) => {
    o.plan = actions.filter((a) => Number(a.order) === k + 1).map((a) => ({ ...a, order: 1 })); o.planFor = o.text;
    const lines = [...(res[k + 1] || []), ...(letters[k].result || [])];
    o.preview = lines.length ? lines : ['The chronicle will tell how it goes — no one rides and no gold is spent by the engine'];
  });
  return true;
}

/** Interpret and execute the fresh written orders of the turn, marking each with what was done. */
export async function carryOutOrders(state, ask) {
  const fresh = state.orders.filter((o) => !o.auto && !o.executed && String(o.text || '').trim());
  if (!fresh.length) return [];
  // orders already read for their receipt do exactly what the receipt said; the rest are read now
  const need = fresh.filter((o) => !hasPlan(o));
  const planned = need.length ? await planOrders(state, need, ask) : [];
  const actions = [];
  fresh.forEach((o, k) => { if (hasPlan(o)) for (const a of o.plan) actions.push({ ...a, order: k + 1 }); });
  for (const a of planned) { const o = need[(Number(a.order) || 0) - 1]; if (o) actions.push({ ...a, order: fresh.indexOf(o) + 1 }); }
  const results = executeActions(state, actions, fresh);
  // 'all my men', 'the whole host', 'the banners': every sworn host answering the call goes where the order sends the rest
  fresh.forEach((o, k) => {
    if (!/\b(all|every|everything|whole|entire|all my men|the army|my army|banners|bannermen|our strength)\b/i.test(o.text)) return;
    const went = (results[k + 1] || []).map((t) => t.match(/marches for (.+)$/)?.[1]).find(Boolean); if (!went) return;
    const to = resolvePlaceId(went); if (!to) return;
    for (const a of Object.values(state.armies)) {
      if (!commandable(state, a) || a.owner === state.meta.player || a.march?.to === to) continue;
      a.march = { to, since: state.meta.turn }; a.status = 'marching'; a.at = null;
      (results[k + 1] = results[k + 1] || []).push(`${a.name} marches for ${placeName(state, to)}`);
    }
  });
  const done = resolveEnvoys(state, fresh);
  postLetters(state, fresh);
  fresh.forEach((o, k) => {
    const r = results[k + 1];
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
import { weighAudience, holdToVerdict } from '../public/js/shared/temperament.js';

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
  return hit || null;
}
const OUTCOME = { agree: 'AGREES', bargain: 'will not agree yet and NAMES HIS PRICE', stall: 'PUTS YOU OFF — commits to nothing', refuse: 'REFUSES', rage: 'REFUSES IN ANGER', yield: 'GIVES IN, afraid', dismiss: 'REFUSES and will hear no more this moon' };
export function resolveEnvoys(state, orders) {
  const done = [];
  for (const o of orders) {
    if (o.auto || o.envoy || !SENDING.test(o.text)) continue;
    const c = addressed(state, o.text); if (!c) continue;
    const stance = weighAudience(state, c, o.text);
    if (!stance.verdict) continue; // news, a greeting: the story model tells it
    const changes = holdToVerdict(state, c, stance, []);
    const r = applyChanges(state, changes, { source: `${c.name}'s answer`, protectPlayer: true });
    o.envoy = { who: c.id, verdict: stance.verdict };
    o.note = [o.note, `[The engine has weighed this message: ${c.name} ${OUTCOME[stance.verdict] || stance.verdict}${stance.proposal ? ` (${stance.proposal})` : ''}${r.applied.length ? ' — recorded: ' + r.applied.map((x) => x.text).join('; ') : ''}. ${stance.mood.fear > 40 ? 'He is afraid. ' : stance.mood.anger > 40 ? 'He is angry. ' : ''}Write his answer as a "raven" op from ${c.id} to ${state.houses[state.meta.player].lord}, in his own voice, and let the consequences follow.]`].filter(Boolean).join(' ');
    done.push({ order: o.text, result: [`${c.name} ${OUTCOME[stance.verdict] || stance.verdict}`] });
  }
  return done;
}

// ── Letters the lord sends ──
// A written order to someone far away is a raven: it is recorded as sent, flies for a few days, is delivered, and
// is answered when their raven comes back (shared/errands.js postTick). The Letters tab shows it all.
const RAVEN_MILES_A_DAY = 300;
function recipient(state, text) {
  const p = state.meta.player; const lord = state.characters[state.houses[p].lord];
  const hit = addressed(state, text); if (hit) return hit;
  // one of your own, away from you ("write to Jory in King's Landing")
  const mine = Object.values(state.characters).find((c) => c.alive && c.house === p && c.id !== lord?.id && (c.travel || c.loc !== lord?.loc) && named(state, c, text));
  if (mine) return mine;
  // a place: its lord ("a raven to the Eyrie")
  const m = String(text).match(/\bto\s+(?:the\s+)?([A-Z][\w'’]+(?:\s+[A-Z][\w'’]+)*)/g) || [];
  for (const x of m) { const id = resolvePlaceId(x.replace(/^to\s+(the\s+)?/i, '')); const h = id && state.holdings[id]; const who = h && state.characters[state.houses[h.owner]?.lord]; if (who?.alive && who.house !== p) return who; }
  return null;
}
export function postLetters(state, orders) {
  const p = state.meta.player; const lord = state.characters[state.houses[p].lord]; state.post = state.post || [];
  const here = lord && (whereabouts(state, lord).place || lord.loc);
  for (const o of orders) {
    if (o.auto || o.post || !LETTER.test(o.text)) continue;
    const c = recipient(state, o.text); if (!c) continue;
    const a = state.holdings[resolvePlaceId(here)]?.pos; const b = state.holdings[resolvePlaceId(c.loc)]?.pos || (c.travel && state.holdings[c.travel.to]?.pos);
    const miles = a && b ? Math.hypot(a[0] - b[0], a[1] - b[1]) * MILES_PER_UNIT : 600;
    const days = Math.max(1, Math.round(miles / RAVEN_MILES_A_DAY));
    const id = `post_${state.meta.turn}_${state.post.length}`;
    state.post.unshift({ id, to: c.id, toName: c.name, text: o.text, sent: dateStr(state.meta.date), sentDay: dayNumber(state.meta.date), arriveDay: dayNumber(state.meta.date) + days, days, status: 'in flight' });
    state.post = state.post.slice(0, 40);
    o.post = id; o.result = [...(o.result || []), `A raven flies to ${c.name} (~${days} ${days === 1 ? 'day' : 'days'})`];
  }
}
