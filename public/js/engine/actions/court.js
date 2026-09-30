// Court verbs (docs/gdd/08-characters-politics.md §12): offices, grants of land, feasts and tourneys, the judgement of
// prisoners, and the answering of the matters brought before the lord. Each costs what it should, changes the numbers
// and the people at once, and is told to the story as an act already done, so it narrates how the realm takes it.
import { applyChanges, vassalsOf, realmOf, getRelation, dateStr } from '../../shared/world.js';
import { temperament } from '../../shared/temperament.js';
import { applyPetitionFx } from '../../shared/petitions.js';
import { random, shuffle } from '../rng.js';
import { partyOf } from '../parties.js';
import { emit } from '../facts/log.js';
import { dayNumber } from '../time.js';
import { keptByStory } from '../people/life.js';

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const pick = (a) => a[Math.floor(random() * a.length)];
const gold = (h) => Number(h?.figures?.treasury?.v) || 0;
const spend = (state, house, n, source) => applyChanges(state, [{ op: 'figure', house, field: 'treasury', delta: -n, source }]);
const lordOf = (state, house) => state.characters[state.houses[house]?.lord];
export const ROLES = { steward: 'Steward', maester: 'Maester', master_at_arms: 'Master-at-arms', captain: 'Captain of the guard', spymaster: 'Master of whisperers', commander: 'Commander', castellan: 'Castellan', knight: 'Sworn sword', envoy: 'Envoy' };
export const RANSOM = { crown: 30000, paramount: 20000, major: 8000, minor: 2500 };
const VERDICT = { release: 'release', ransom: 'ransom', wall: 'send to the Wall', execute: 'execute' };
const feastCost = (state, house) => 1200 + vassalsOf(state, house).map((v) => state.houses[v]).filter((v) => v.lord && state.characters[v.lord]?.alive).length * 150;
const TOURNEY_COST = 5000;

/** A feast at the seat: the lords come, drink the wine and remember it — mostly kindly. */
function feast(state, house, cause) {
  const me = state.houses[house];
  const vas = vassalsOf(state, house).map((v) => state.houses[v]).filter((v) => v.lord && state.characters[v.lord]?.alive);
  const cost = feastCost(state, house);
  spend(state, house, cost, 'A great feast');
  const ch = [];
  for (const v of vas) { if (state.plotting?.[v.id]) state.plotting[v.id].pressure = Math.max(0, state.plotting[v.id].pressure - 8); const l = state.characters[v.lord]; ch.push({ op: 'relation', a: house, b: v.id, delta: 4, reason: 'feasted at your table' }, { op: 'character', id: l.id, loyalty: clamp((l.loyalty ?? 60) + 4, -100, 100) }); }
  if (me.seat) ch.push({ op: 'holding', id: me.seat, unrest: clamp((state.holdings[me.seat].unrest || 0) - 4, 0, 100) });
  let incident = ''; let brawlers = null; let over = null;
  if (vas.length >= 2 && random() < 0.25) {
    const [a, b] = shuffle(vas);
    ch.push({ op: 'relation', a: a.id, b: b.id, delta: -10, reason: 'a brawl at your feast' });
    over = pick(['an old boundary', 'a toast to the wrong king', 'a daughter', 'a horse race', 'precedence at table']); brawlers = [a.lord, b.lord];
    incident = ` At the high table, ${state.characters[a.lord].name} and ${state.characters[b.lord].name} came to blows over ${over}.`;
  }
  applyChanges(state, ch, { source: 'Your feast', cause });
  emit(state, 'feast', { actors: [me.lord, ...vas.map((v) => v.lord)], houses: [house, ...vas.map((v) => v.id)], place: me.seat || null, data: { cost, brawl: !!incident, ...(brawlers ? { brawlers, over } : {}) }, cause, text: `${lordOf(state, house)?.name || `House ${me.name}`} ${vas.length ? `feasts ${vas.length} sworn lord${vas.length === 1 ? '' : 's'} at` : 'holds a feast for the household at'} ${state.holdings[me.seat]?.name || 'the seat'}.${incident}` });
  return { text: `Hold a great feast at ${state.holdings[me.seat]?.name || 'my seat'} for my bannermen.`, note: `[Already done: the feast cost ${cost} dragons; each sworn lord's loyalty +4.${incident} Narrate the feast — who came, who did not, what was said in drink.]`, summary: `The feast is held (${cost.toLocaleString('en-US')} dragons). Your lords are glad of it.${incident}` };
}

/** A tourney: the realm's knights come to break lances; glory, a little blood, and the lords' goodwill. */
function tourney(state, house, cause) {
  const me = state.houses[house];
  spend(state, house, TOURNEY_COST, 'A tourney');
  const guests = Object.values(state.houses).filter((h) => h.id !== house && (h.liege === house || getRelation(state, house, h.id) > 15 || realmOf(state, h.id) === realmOf(state, house)) && h.seat).slice(0, 30);
  const knights = Object.values(state.characters).filter((c) => c.alive && (c.roles || []).includes('knight') && !/imprisoned|wounded/.test(c.status || '') && (c.house === house || guests.some((g) => g.id === c.house)));
  const ch = guests.map((g) => ({ op: 'relation', a: house, b: g.id, delta: 3, reason: 'your tourney' }));
  const champ = knights.length ? pick(knights) : null;
  let blood = '';
  if (champ) ch.push({ op: 'character', id: champ.id, note: `Champion of the tourney at ${state.holdings[me.seat]?.name}.`, opinion: clamp((champ.opinion || 0) + 10, -100, 100) });
  const fallen = knights.filter((k) => k !== champ && !keptByStory(state, k)); // the story's people do not die in the lists by chance
  if (fallen.length && random() < 0.12) { const k = pick(fallen); ch.push({ op: 'character', id: k.id, alive: false, cause: 'a lance through the throat in the lists', how: 'wound' }, { op: 'relation', a: house, b: k.house, delta: -4, reason: 'a knight dead in your lists' }); blood = ` ${k.name} died in the lists, a splinter through the throat.`; }
  // the lords of the region ride to it for a moon (shared/retinues.js)
  if (me.seat) { state.plots = state.plots || {}; (state.plots.tourneys = state.plots.tourneys || {})[me.seat] = dayNumber(state.meta.date); }
  emit(state, 'tourney', { actors: [me.lord], houses: [house, ...guests.map((g) => g.id)], place: me.seat || null, data: { cost: TOURNEY_COST, guests: guests.length }, cause, text: `House ${me.name} holds a tourney at ${state.holdings[me.seat]?.name || 'its seat'}; ${guests.length} houses send knights.` });
  applyChanges(state, ch, { source: 'Your tourney', cause });
  if (champ) emit(state, 'tourney_result', { actors: [champ.id], houses: [house, champ.house], place: me.seat || null, cause, text: `${champ.name} is champion of the tourney at ${state.holdings[me.seat]?.name || 'the seat'}.` });
  me.prestige = (me.prestige || 0) + 5;
  return { text: `Hold a tourney at ${state.holdings[me.seat]?.name || 'my seat'}.`, note: `[Already done: 5,000 dragons in purses; ${guests.length} houses sent knights; ${champ ? champ.name + ' was champion' : 'no champion of note'}.${blood} Narrate the lists, the melee, the queen of love and beauty.]`, summary: `The tourney is held. ${champ ? `${champ.name} is champion.` : ''}${blood}` };
}

/** Who holds a prisoner: the party they are kept in, or the holding they are kept at. */
const keeperOf = (state, c) => partyOf(state, c)?.owner || state.holdings[c.loc]?.owner;
/** What a captive is worth to his house (06 §6.4): a great lord or an heir most, a knight little. */
export function ransomOf(state, c) {
  const h = state.houses[c.house]; const lordOfHouse = h?.lord === c.id || (c.roles || []).includes('heir');
  return Math.round((RANSOM[h?.rank] || 2000) * (lordOfHouse ? 1.5 : 1));
}

/** A prisoner's fate: mercy, a ransom, the Wall, or the axe — each remembered by the prisoner's house. */
function judge(state, house, { character, verdict }, cause) {
  const me = state.houses[house]; const c = state.characters[character];
  const h = state.houses[c.house]; const lordOfHouse = h?.lord === c.id || (c.roles || []).includes('heir');
  const ch = []; let summary;
  if (verdict === 'release') {
    ch.push({ op: 'character', id: c.id, status: 'free', loc: h?.seat || c.loc, opinion: clamp((c.opinion || 0) + 25, -100, 100), note: `Released by House ${me.name} without ransom.` }, { op: 'relation', a: house, b: c.house, delta: 12, reason: `${c.name} released` });
    summary = `${c.name} is set free and goes home, owing you a debt of honour.`;
  } else if (verdict === 'ransom') {
    const sum = Math.round((RANSOM[h?.rank] || 2000) * (lordOfHouse ? 1.5 : 1)); const paid = Math.min(sum, Math.max(0, gold(h)));
    ch.push({ op: 'figure', house: c.house, field: 'treasury', delta: -paid, source: `Ransom of ${c.name}` }, { op: 'figure', house, field: 'treasury', delta: paid, source: `Ransom of ${c.name}` }, { op: 'character', id: c.id, status: 'free', loc: h?.seat || c.loc, opinion: clamp((c.opinion || 0) - 10, -100, 100), note: `Ransomed for ${paid} dragons.` }, { op: 'relation', a: house, b: c.house, delta: -4, reason: 'a ransom' });
    summary = `House ${h?.name} pays ${paid.toLocaleString('en-US')} dragons for ${c.name}.`;
  } else if (verdict === 'wall') {
    ch.push({ op: 'character', id: c.id, status: 'free', house: 'nights_watch', loc: 'nights_watch', title: 'Brother of the Night\'s Watch', note: `Sent to take the black by House ${me.name}.` }, { op: 'relation', a: house, b: c.house, delta: -12, reason: `${c.name} sent to the Wall` }, { op: 'figure', house: 'nights_watch', field: 'menAtArms', delta: 1, source: 'A new brother' });
    summary = `${c.name} takes the black. The Watch gains a man; House ${h?.name} loses one, and will not thank you.`;
  } else {
    ch.push({ op: 'character', id: c.id, alive: false, cause: `executed by order of House ${me.name}`, ...(me.lord ? { by: me.lord } : {}) }, { op: 'relation', a: house, b: c.house, delta: -45, reason: `${c.name} executed` });
    // the realm watches: honourable lords are troubled, the hard ones approve
    for (const v of vassalsOf(state, house)) { const l = state.characters[state.houses[v].lord]; if (!l?.alive) continue; const T = temperament(l); const d = T.guile < 0.3 && T.warmth > 0.5 ? -6 : T.warmth < 0.3 ? 3 : -2; ch.push({ op: 'character', id: l.id, loyalty: clamp((l.loyalty ?? 60) + d, -100, 100) }); }
    summary = `${c.name} is executed. House ${h?.name} will not forget it; your own lords take it each after their nature.`;
  }
  emit(state, 'judgement', { actors: [me.lord, c.id], houses: [house, c.house], place: me.seat || null, data: { verdict }, cause, text: `${lordOf(state, house)?.name || `House ${me.name}`} passes judgement on ${c.name}: ${{ release: 'freedom', ransom: 'ransom', wall: 'the Wall', execute: 'death' }[verdict]}.` });
  applyChanges(state, ch, { source: 'Your judgement', protectPlayer: true, cause });
  return { text: `JUDGEMENT: I ${VERDICT[verdict]} ${c.name}.`, note: `[Already done: ${summary} Narrate how it is done and how the realm hears of it.]`, summary };
}

export const COURT = [
  {
    id: 'appoint_office', family: 'court', label: 'Give someone an office',
    params: { character: 'character', role: `enum:${Object.keys(ROLES).join('|')}` },
    legal: (state, i) => {
      const c = state.characters[i.params.character];
      if (!c || !c.alive) return { code: 'no_one', text: 'There is no such person.' };
      if (!ROLES[i.params.role]) return { code: 'office', text: 'There is no such office in your household.' };
      if (/imprisoned|captive/.test(c.status || '') && c.house !== i.house) return { code: 'captive', text: `${c.name} is a prisoner, not an officer.` };
      return null;
    },
    start: (state, i) => {
      const c = state.characters[i.params.character]; const role = i.params.role; const me = state.houses[i.house];
      // an office has one holder (a house may have many commanders and sworn swords)
      for (const o of Object.values(state.characters)) if (o.house === i.house && o.id !== c.id && o.roles?.includes(role) && !['commander', 'knight'].includes(role)) o.roles = o.roles.filter((r) => r !== role);
      c.roles = [...new Set([...(c.roles || []), role])];
      if (c.house !== i.house) c.memories = [...(c.memories || []), `Appointed ${ROLES[role]} of House ${me.name}.`];
      c.opinion = Math.min(100, (c.opinion || 0) + 10);
      emit(state, 'office_granted', { actors: [c.id, me.lord], houses: [i.house, c.house], data: { office: role }, cause: i.source, text: `${c.name} is named ${ROLES[role]} of House ${me.name}.` });
      return { name: c.name, office: ROLES[role] };
    },
    receipt: (state, i, d) => [{ ok: true, text: `${d.name} is named ${d.office} of House ${state.houses[i.house].name}.` }],
    said: (state, i, d) => ({ status: 'done', text: `Appoint ${d.name} as ${d.office} of House ${state.houses[i.house].name}.` }),
    facts: ['office_granted'], mind: { allowed: true },
  },
  {
    id: 'grant_holding', family: 'court', label: 'Grant a holding to a sworn lord',
    params: { holding: 'holding:own', house: 'house:vassal' },
    legal: (state, i) => {
      const h = state.holdings[i.params.holding]; const me = state.houses[i.house];
      if (!h || h.owner !== i.house) return { code: 'not_yours', text: 'You can only grant your own holdings.' };
      if (h.id === me.seat) return { code: 'seat', text: 'You cannot give away your own seat.' };
      const to = state.houses[i.params.house]; if (!to || to.liege !== i.house) return { code: 'not_sworn', text: 'You can only grant lands to your sworn vassals.' };
      return null;
    },
    start: (state, i) => {
      const h = state.holdings[i.params.holding]; const me = state.houses[i.house]; const to = state.houses[i.params.house];
      applyChanges(state, [{ op: 'holding', id: h.id, owner: to.id, note: `Granted by House ${me.name} to House ${to.name}` }, { op: 'relation', a: i.house, b: to.id, delta: 20, reason: `Granted ${h.name}` }], { cause: i.source });
      const lord = to.lord && state.characters[to.lord]; if (lord) { lord.opinion = Math.min(100, (lord.opinion || 0) + 20); lord.loyalty = Math.min(100, (lord.loyalty || 60) + 15); }
      return { holding: h.name, to: to.name };
    },
    receipt: (state, i, d) => [{ ok: true, text: `${d.holding} and its lands pass to House ${d.to}, who will remember it.` }],
    said: (state, i, d) => ({ status: 'done', text: `Grant ${d.holding} and its lands to House ${d.to} for their loyal service.` }),
    facts: ['holding_granted'], mind: { allowed: true },
  },
  {
    id: 'hold_feast', family: 'court', label: 'Hold a feast',
    params: {},
    legal: (state, i) => { const cost = feastCost(state, i.house); return gold(state.houses[i.house]) < cost ? { code: 'gold', text: `A feast worthy of your house would cost ~${cost.toLocaleString('en-US')} dragons.` } : null; },
    cost: (state, i) => ({ gold: feastCost(state, i.house) }),
    start: (state, i) => feast(state, i.house, i.source),
    receipt: (state, i, d) => [{ ok: true, text: d.summary }],
    said: (state, i, d) => ({ status: 'done', text: d.text, note: d.note }),
    facts: ['feast'], mind: { allowed: true },
  },
  {
    id: 'hold_tourney', family: 'court', label: 'Hold a tourney',
    params: {},
    legal: (state, i) => (gold(state.houses[i.house]) < TOURNEY_COST ? { code: 'gold', text: 'A tourney worth the name needs ~5,000 dragons for purses and pavilions.' } : null),
    cost: () => ({ gold: TOURNEY_COST }),
    start: (state, i) => tourney(state, i.house, i.source),
    receipt: (state, i, d) => [{ ok: true, text: d.summary.trim() }],
    said: (state, i, d) => ({ status: 'done', text: d.text, note: d.note }),
    facts: ['tourney', 'tourney_result'], mind: { allowed: true },
  },
  {
    id: 'judge_prisoner', family: 'court', label: 'Judge a prisoner',
    params: { character: 'character:captive', verdict: 'enum:release|ransom|wall|execute' },
    legal: (state, i) => {
      const c = state.characters[i.params.character];
      if (!c?.alive || !/imprisoned|captive|hostage/.test(c.status || '')) return { code: 'no_prisoner', text: 'There is no such prisoner.' };
      const heldBy = keeperOf(state, c);
      if (heldBy !== i.house && state.houses[heldBy]?.liege !== i.house) return { code: 'not_yours', text: `${c.name} is not your prisoner.` };
      if (!VERDICT[i.params.verdict]) return { code: 'verdict', text: 'Unknown judgement.' };
      if (i.params.verdict === 'ransom') {
        const h = state.houses[c.house]; const sum = Math.round((RANSOM[h?.rank] || 2000) * (h?.lord === c.id || (c.roles || []).includes('heir') ? 1.5 : 1));
        if (Math.min(sum, gold(h)) < sum * 0.3) return { code: 'cannot_pay', text: `House ${h?.name} cannot pay a ransom worth the name (they have ~${Math.round(gold(h))} dragons).` };
      }
      return null;
    },
    start: (state, i) => judge(state, i.house, i.params, i.source),
    receipt: (state, i, d) => [{ ok: true, text: d.summary }],
    said: (state, i, d) => ({ status: 'done', text: d.text, note: d.note }),
    facts: ['judgement', 'released', 'ransomed', 'sent_to_wall', 'executed'], mind: { allowed: true },
  },
  {
    // 06 §9: buy back one of your own held by another house, at the price of who they are
    id: 'pay_ransom', family: 'court', label: 'Pay a ransom',
    params: { character: 'character' },
    legal: (state, i) => {
      const c = state.characters[i.params.character];
      if (!c?.alive || c.house !== i.house || !/imprisoned|captive|hostage/.test(c.status || '')) return { code: 'not_held', text: 'None of your people by that name is held captive.' };
      const k = keeperOf(state, c); if (!k || k === i.house) return { code: 'not_held', text: `${c.name} is not held by another house.` };
      const sum = ransomOf(state, c); if (gold(state.houses[i.house]) < sum) return { code: 'gold', text: `House ${state.houses[k].name} asks ~${sum.toLocaleString('en-GB')} dragons for ${c.name}; your treasury holds ${Math.round(gold(state.houses[i.house])).toLocaleString('en-GB')}.` };
      return null;
    },
    cost: (state, i) => ({ gold: ransomOf(state, state.characters[i.params.character]) }),
    start: (state, i) => {
      const c = state.characters[i.params.character]; const k = keeperOf(state, c); const me = state.houses[i.house]; const sum = ransomOf(state, c);
      applyChanges(state, [
        { op: 'figure', house: i.house, field: 'treasury', delta: -sum, source: `Ransom of ${c.name}` }, { op: 'figure', house: k, field: 'treasury', delta: sum, source: `Ransom of ${c.name}` },
        { op: 'character', id: c.id, status: 'free', loc: me.seat || c.loc, note: `Ransomed for ${sum} dragons.` },
      ], { cause: i.source });
      emit(state, 'ransomed', { actors: [c.id, me.lord], houses: [i.house, k], place: me.seat || null, data: { gold: sum, by: k }, cause: i.source, text: `House ${me.name} pays ${sum.toLocaleString('en-GB')} dragons to House ${state.houses[k].name} for ${c.name}, who goes home.` });
      return { sum, keeper: k, name: c.name };
    },
    receipt: (state, i, d) => [{ ok: true, text: `${d.sum.toLocaleString('en-GB')} dragons paid to House ${state.houses[d.keeper].name}; ${d.name} rides home.` }],
    facts: ['ransomed'], mind: { allowed: true },
  },
  {
    // a matter brought before the lord (a petition, a liege's call, a rising): an option, or the lord's own words
    id: 'answer_matter', family: 'court', label: 'Answer a matter',
    params: { decision: 'matter', option: 'number?', custom: 'text?', note: 'text?' },
    who: (state, i) => i.house === state.meta.player, // the matters are the player's; the other lords' are their minds'
    legal: (state, i) => {
      const d = (state.decisions || []).find((x) => x.id === i.params.decision && x.status === 'pending');
      if (!d) return { code: 'no_matter', text: 'That matter is settled, or was never brought.' };
      if (!d.options[Number(i.params.option)] && !String(i.params.custom || '').trim()) return { code: 'option', text: 'Choose an answer, or give your own.' };
      return null;
    },
    start: (state, i) => {
      const d = state.decisions.find((x) => x.id === i.params.decision); const me = state.houses[i.house];
      const opt = String(i.params.custom || '').trim() ? null : d.options[Number(i.params.option)];
      d.status = 'decided'; d.choice = opt ? opt.label : String(i.params.custom).slice(0, 500); d.note = i.params.note ? String(i.params.note).slice(0, 500) : ''; d.decidedTurn = state.meta.turn;
      emit(state, 'judgement', { actors: [me.lord, d.from], houses: [i.house], place: d.where || me.seat || null, data: { matter: d.id, choice: d.choice }, cause: i.source, text: `${lordOf(state, i.house)?.name || `House ${me.name}`} decides: ${d.title} — ${d.choice}.` });
      let settled = [];
      if (opt?.fx) { settled = applyPetitionFx(state, opt.fx, dateStr(state.meta.date)); d.effects = settled; }
      return { title: d.title, choice: d.choice, note: d.note, effects: settled };
    },
    receipt: (state, i, d) => [{ ok: true, text: `${d.title}: ${d.choice}.` }, ...d.effects.map((t) => ({ ok: true, text: t.replace(/^./, (x) => x.toUpperCase()).replace(/([^.!?])$/, '$1.') }))],
    said: (state, i, d) => ({ status: d.effects.length ? 'done' : null, text: `DECISION — ${d.title}: I choose "${d.choice}".${d.note ? ' ' + d.note : ''}`, note: d.effects.length ? `[Already settled by the ledger, do not apply again: ${d.effects.join('; ')}. Narrate how people react.]` : '' }),
    facts: ['judgement'], mind: { allowed: false },
  },
];
