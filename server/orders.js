// Orders that actually happen. Before each turn the player's written orders are turned into concrete engine
// actions — someone rides somewhere (with men), a host marches, men are recruited where the house has people,
// an officer is hired, a levy is raised — and the engine carries them out. The story model is then told what
// has already been done, so it narrates the consequences instead of deciding whether to obey.
import { applyChanges, resolvePlaceId, placeName, slug } from '../public/js/shared/world.js';

const OFFICES = ['spymaster', 'steward', 'maester', 'captain', 'master_at_arms', 'knight', 'envoy', 'commander'];

function context(state) {
  const p = state.meta.player; const me = state.houses[p]; const lord = state.characters[me.lord];
  const people = Object.values(state.characters).filter((c) => c.alive && c.house === p).sort((a, b) => (b.roles?.length || 0) - (a.roles?.length || 0)).slice(0, 45);
  const hosts = Object.values(state.armies).filter((a) => a.owner === p);
  const holds = Object.values(state.holdings).filter((h) => h.owner === p);
  const where = (c) => (c.loc?.startsWith('army:') ? `with ${state.armies[c.loc.slice(5)]?.name || 'a host'}` : placeName(state, c.loc)) + (c.travel ? ` (riding to ${placeName(state, c.travel.to)})` : '');
  return [
    `PLAYER HOUSE: ${p} (House ${me.name}). The lord giving orders: ${lord ? `${lord.id} (${lord.name}), at ${where(lord)}` : 'unknown'}.`,
    `TREASURY: ${Math.round(Number(me.figures?.treasury?.v) || 0)} gold dragons. Household men-at-arms: ${Math.round(Number(me.figures?.menAtArms?.v) || 0)}. Unraised levies: ${Math.round(Number(me.figures?.levies?.v) || 0)}.`,
    'YOUR PEOPLE (id | name | office | where):\n' + people.map((c) => `${c.id} | ${c.name} | ${c.title || (c.roles || []).join('/')} | ${where(c)}`).join('\n'),
    'YOUR HOSTS (id | name | men | where):\n' + (hosts.map((a) => `${a.id} | ${a.name} | ${a.men} | ${a.at ? placeName(state, a.at) : 'in the field'}${a.march ? ` (marching to ${placeName(state, a.march.to)})` : ''}`).join('\n') || '(none)'),
    'YOUR HOLDINGS: ' + (holds.map((h) => `${h.id} (${h.name})`).join(', ') || '(none)'),
  ].join('\n\n');
}

export function ordersPrompt(state, orders) {
  const system = `You turn a lord's written orders into game actions, exactly as he gives them. His household and bannermen obey him; do not refuse, soften or second-guess an order — if it can be carried out, emit the action.
Reply with ONE JSON object: {"actions":[...],"story":[...]}.
"actions" — only these kinds, one object per thing to do, each with "order": the number of the order it comes from:
- {"op":"travel","order":1,"character":"<person id>","to":"<place name>","men":<number of men to take, 0 if none>}   — someone rides somewhere (with a party of men if asked)
- {"op":"march","order":1,"army":"<host id>","to":"<place name>"}   — a host marches
- {"op":"recruit","order":1,"at":"<place name>","men":<number>,"kind":"men-at-arms|sellswords"}   — hire fighting men where the house has people (e.g. the lord's own city of residence)
- {"op":"raise","order":1,"at":"<holding id>","men":<number>}   — call up levies from the house's own lands
- {"op":"hire","order":1,"role":"${OFFICES.join('|')}","at":"<place name>"}   — take a new officer into service there
- {"op":"appoint","order":1,"character":"<person id>","role":"${OFFICES.join('|')}"}   — give one of your people an office
"story" — the numbers of orders that are not actions of these kinds (diplomacy, letters, intrigue, speeches, feasts…): the story will handle them.
Use only ids from the lists; places by their name as written. If an order names "here", it means where the lord is. JSON only.`;
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

/** Carry out interpreted actions; returns per-order results. */
export function executeActions(state, actions) {
  const p = state.meta.player; const me = state.houses[p]; const results = {};
  const note = (i, text) => { (results[i] = results[i] || []).push(text); };
  for (const a of actions || []) {
    const i = Number(a.order) || 0;
    try {
      if (a.op === 'march') {
        const army = state.armies[a.army] || Object.values(state.armies).find((x) => x.owner === p && slug(x.name) === slug(a.army || ''));
        const to = resolvePlaceId(a.to);
        if (!army || army.owner !== p) throw new Error('no such host of yours');
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
        r.applied.forEach((x) => note(i, x.text)); r.rejected.forEach((x) => note(i, `could not: ${x.reason}`)); continue;
      }
      if (a.op === 'appoint') {
        const c = state.characters[a.character]; if (!c || c.house !== p || !c.alive) throw new Error('no such person of yours');
        if (!OFFICES.includes(a.role)) throw new Error('unknown office');
        for (const o of Object.values(state.characters)) if (o.house === p && o.id !== c.id && o.roles?.includes(a.role) && a.role !== 'commander' && a.role !== 'knight') o.roles = o.roles.filter((r) => r !== a.role);
        c.roles = [...new Set([...(c.roles || []), a.role])]; note(i, `${c.name} takes up the office of ${a.role.replace('_', ' ')}`); continue;
      }
      const op = { travel: 'travel', recruit: 'recruit', hire: 'hire' }[a.op]; if (!op) continue;
      const r = applyChanges(state, [{ ...a, op, house: p }], { source: 'Your orders' });
      r.applied.forEach((x) => note(i, x.text)); r.rejected.forEach((x) => note(i, `could not be done: ${x.reason}`));
    } catch (e) { note(i, `could not be done: ${e.message}`); }
  }
  return results;
}

/** Interpret and execute the fresh written orders of the turn, marking each with what was done. */
export async function carryOutOrders(state, ask) {
  const fresh = state.orders.filter((o) => !o.auto && !o.executed && String(o.text || '').trim());
  if (!fresh.length) return [];
  let plan = null;
  if (ask) { try { plan = await ask(ordersPrompt(state, fresh)); } catch { plan = null; } }
  if (!plan || !Array.isArray(plan.actions)) plan = readOrdersByRule(state, fresh);
  else if (!plan.actions.length) { const byRule = readOrdersByRule(state, fresh); if (byRule.actions.length) plan = byRule; }
  const results = executeActions(state, plan.actions);
  const done = [];
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
