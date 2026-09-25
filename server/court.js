// The lord's own acts that the engine settles on the spot: gifts, feasts, tourneys, the judgement of
// prisoners, and declarations of war. Each costs what it should, changes the numbers and the people at once,
// and is told to the story model as an order already carried out, so it narrates how the realm takes it.
import { applyChanges, vassalsOf, realmOf, getRelation } from '../public/js/shared/world.js';
import { temperament } from '../public/js/shared/temperament.js';

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const pick = (a) => a[Math.floor(Math.random() * a.length)];
const gold = (h) => Number(h.figures?.treasury?.v) || 0;
const spend = (state, house, n, source) => applyChanges(state, [{ op: 'figure', house, field: 'treasury', delta: -n, source }]);
export class CourtError extends Error { constructor(msg) { super(msg); this.status = 400; } }

// A gift: its weight is what it means to them — a thousand dragons is a fortune to a hedge lord and nothing to Tywin
export function gift(state, { to, gold: amount }) {
  const p = state.meta.player; const me = state.houses[p];
  const n = Math.round(Number(amount) || 0);
  if (n < 50) throw new CourtError('A gift of fewer than fifty dragons would be an insult.');
  if (n > gold(me)) throw new CourtError(`Your treasury holds only ${Math.round(gold(me)).toLocaleString('en-US')} dragons.`);
  const c = state.characters[to]; const house = c ? c.house : to; const h = state.houses[house];
  if (!h || house === p) throw new CourtError('No one to send it to.');
  const lord = c || state.characters[h.lord];
  const T = lord ? temperament(lord) : null;
  const weight = n / Math.max(800, gold(h) * 0.12);
  const warm = clamp(Math.round(10 * Math.sqrt(weight) * (T?.sway.gold ? 1.6 : 1) * (T && T.pride > 0.85 && weight < 0.3 ? 0.4 : 1)), 1, 30);
  spend(state, p, n, 'A gift');
  const ch = [{ op: 'figure', house, field: 'treasury', delta: n, source: `A gift from House ${me.name}` }, { op: 'relation', a: p, b: house, delta: warm, reason: `a gift of ${n} dragons` }];
  if (lord) ch.push({ op: 'character', id: lord.id, opinion: clamp((lord.opinion || 0) + warm, -100, 100), note: `Received a gift of ${n} dragons from House ${me.name}.` });
  applyChanges(state, ch, { source: 'Your gift' });
  if (lord && state.moods?.[lord.id]) state.moods[lord.id].trust = clamp(state.moods[lord.id].trust + warm, 0, 100);
  const read = warm >= 18 ? 'is much pleased' : warm >= 8 ? 'is pleased' : T?.pride > 0.85 ? 'accepts it coolly; it is small to them' : 'accepts it';
  return { text: `Send ${n.toLocaleString('en-US')} gold dragons as a gift to ${lord ? lord.name : 'House ' + h.name}.`, note: `[Already done: the gold is sent; relations +${warm}. ${lord?.name || 'They'} ${read}. Narrate the gift's arrival.]`, summary: `${lord ? lord.name : 'House ' + h.name} ${read} (relations +${warm}).` };
}

// A feast at the seat: the lords come, drink your wine and remember it — mostly kindly
export function feast(state) {
  const p = state.meta.player; const me = state.houses[p];
  const vas = vassalsOf(state, p).map((v) => state.houses[v]).filter((v) => v.lord && state.characters[v.lord]?.alive);
  const cost = 1200 + vas.length * 150;
  if (gold(me) < cost) throw new CourtError(`A feast worthy of your house would cost ~${cost.toLocaleString('en-US')} dragons.`);
  spend(state, p, cost, 'A great feast');
  const ch = [];
  for (const v of vas) { const l = state.characters[v.lord]; ch.push({ op: 'relation', a: p, b: v.id, delta: 4, reason: 'feasted at your table' }, { op: 'character', id: l.id, loyalty: clamp((l.loyalty ?? 60) + 4, -100, 100) }); }
  if (me.seat) ch.push({ op: 'holding', id: me.seat, unrest: clamp((state.holdings[me.seat].unrest || 0) - 4, 0, 100) });
  let incident = '';
  if (vas.length >= 2 && Math.random() < 0.25) {
    const [a, b] = [...vas].sort(() => Math.random() - 0.5);
    ch.push({ op: 'relation', a: a.id, b: b.id, delta: -10, reason: 'a brawl at your feast' });
    incident = ` At the high table, ${state.characters[a.lord].name} and ${state.characters[b.lord].name} came to blows over ${pick(['an old boundary', 'a toast to the wrong king', 'a daughter', 'a horse race', 'precedence at table'])}.`;
  }
  applyChanges(state, ch, { source: 'Your feast' });
  return { text: `Hold a great feast at ${state.holdings[me.seat]?.name || 'my seat'} for my bannermen.`, note: `[Already done: the feast cost ${cost} dragons; each sworn lord's loyalty +4.${incident} Narrate the feast — who came, who did not, what was said in drink.]`, summary: `The feast is held (${cost.toLocaleString('en-US')} dragons). Your lords are glad of it.${incident}` };
}

// A tourney: the realm's knights come to break lances; glory, a little blood, and the lords' goodwill
export function tourney(state) {
  const p = state.meta.player; const me = state.houses[p];
  const cost = 5000;
  if (gold(me) < cost) throw new CourtError('A tourney worth the name needs ~5,000 dragons for purses and pavilions.');
  spend(state, p, cost, 'A tourney');
  const guests = Object.values(state.houses).filter((h) => h.id !== p && (h.liege === p || getRelation(state, p, h.id) > 15 || realmOf(state, h.id) === realmOf(state, p)) && h.seat).slice(0, 30);
  const knights = Object.values(state.characters).filter((c) => c.alive && (c.roles || []).includes('knight') && !/imprisoned|wounded/.test(c.status || '') && (c.house === p || guests.some((g) => g.id === c.house)));
  const ch = guests.map((g) => ({ op: 'relation', a: p, b: g.id, delta: 3, reason: 'your tourney' }));
  const champ = knights.length ? pick(knights) : null;
  let blood = '';
  if (champ) ch.push({ op: 'character', id: champ.id, note: `Champion of the tourney at ${state.holdings[me.seat]?.name}.`, opinion: clamp((champ.opinion || 0) + 10, -100, 100) });
  const fallen = knights.filter((k) => k !== champ);
  if (fallen.length && Math.random() < 0.12) { const k = pick(fallen); ch.push({ op: 'character', id: k.id, alive: false, cause: 'a lance through the throat in the lists' }, { op: 'relation', a: p, b: k.house, delta: -4, reason: 'a knight dead in your lists' }); blood = ` ${k.name} died in the lists, a splinter through the throat.`; }
  applyChanges(state, ch, { source: 'Your tourney' });
  me.prestige = (me.prestige || 0) + 5;
  return { text: `Hold a tourney at ${state.holdings[me.seat]?.name || 'my seat'}.`, note: `[Already done: 5,000 dragons in purses; ${guests.length} houses sent knights; ${champ ? champ.name + ' was champion' : 'no champion of note'}.${blood} Narrate the lists, the melee, the queen of love and beauty.]`, summary: `The tourney is held. ${champ ? `${champ.name} is champion.` : ''}${blood}` };
}

// A prisoner's fate: mercy, a ransom, the Wall, or the axe — each remembered by the prisoner's house
const RANSOM = { crown: 30000, paramount: 20000, major: 8000, minor: 2500 };
export function judge(state, { character, verdict }) {
  const p = state.meta.player; const me = state.houses[p];
  const c = state.characters[character];
  if (!c?.alive || !/imprisoned|captive|hostage/.test(c.status || '')) throw new CourtError('There is no such prisoner.');
  const heldBy = String(c.loc || '').startsWith('army:') ? state.armies[String(c.loc).slice(5)]?.owner : state.holdings[c.loc]?.owner;
  if (heldBy !== p && state.houses[heldBy]?.liege !== p) throw new CourtError(`${c.name} is not your prisoner.`);
  const h = state.houses[c.house]; const lordOfHouse = h?.lord === c.id || (c.roles || []).includes('heir');
  const ch = []; let summary;
  if (verdict === 'release') {
    ch.push({ op: 'character', id: c.id, status: 'free', loc: h?.seat || c.loc, opinion: clamp((c.opinion || 0) + 25, -100, 100), note: `Released by House ${me.name} without ransom.` }, { op: 'relation', a: p, b: c.house, delta: 12, reason: `${c.name} released` });
    summary = `${c.name} is set free and goes home, owing you a debt of honour.`;
  } else if (verdict === 'ransom') {
    const sum = Math.round((RANSOM[h?.rank] || 2000) * (lordOfHouse ? 1.5 : 1));
    const paid = Math.min(sum, Math.max(0, gold(h || {})));
    if (paid < sum * 0.3) throw new CourtError(`House ${h?.name} cannot pay a ransom worth the name (they have ~${Math.round(gold(h || {}))} dragons).`);
    ch.push({ op: 'figure', house: c.house, field: 'treasury', delta: -paid, source: `Ransom of ${c.name}` }, { op: 'figure', house: p, field: 'treasury', delta: paid, source: `Ransom of ${c.name}` }, { op: 'character', id: c.id, status: 'free', loc: h?.seat || c.loc, opinion: clamp((c.opinion || 0) - 10, -100, 100), note: `Ransomed for ${paid} dragons.` }, { op: 'relation', a: p, b: c.house, delta: -4, reason: 'a ransom' });
    summary = `House ${h?.name} pays ${paid.toLocaleString('en-US')} dragons for ${c.name}.`;
  } else if (verdict === 'wall') {
    ch.push({ op: 'character', id: c.id, status: 'free', house: 'nights_watch', loc: 'nights_watch', title: 'Brother of the Night\'s Watch', note: `Sent to take the black by House ${me.name}.` }, { op: 'relation', a: p, b: c.house, delta: -12, reason: `${c.name} sent to the Wall` }, { op: 'figure', house: 'nights_watch', field: 'menAtArms', delta: 1, source: 'A new brother' });
    summary = `${c.name} takes the black. The Watch gains a man; House ${h?.name} loses one, and will not thank you.`;
  } else if (verdict === 'execute') {
    ch.push({ op: 'character', id: c.id, alive: false, cause: `executed by order of House ${me.name}` }, { op: 'relation', a: p, b: c.house, delta: -45, reason: `${c.name} executed` });
    // the realm watches: honourable lords are troubled, the hard ones approve
    for (const v of vassalsOf(state, p)) { const l = state.characters[state.houses[v].lord]; if (!l?.alive) continue; const T = temperament(l); const d = T.guile < 0.3 && T.warmth > 0.5 ? -6 : T.warmth < 0.3 ? 3 : -2; ch.push({ op: 'character', id: l.id, loyalty: clamp((l.loyalty ?? 60) + d, -100, 100) }); }
    summary = `${c.name} is executed. House ${h?.name} will not forget it; your own lords take it each after their nature.`;
  } else throw new CourtError('Unknown judgement.');
  applyChanges(state, ch, { source: 'Your judgement', protectPlayer: true });
  const word = { release: 'release', ransom: 'ransom', wall: 'send to the Wall', execute: 'execute' }[verdict];
  return { text: `JUDGEMENT: I ${word} ${c.name}.`, note: `[Already done: ${summary} Narrate how it is done and how the realm hears of it.]`, summary };
}

// War, declared: the realm takes sides; a vassal who declares on his liege is in rebellion
export function declareWar(state, { house, reason }) {
  const p = state.meta.player; const me = state.houses[p]; const h = state.houses[house];
  if (!h || house === p) throw new CourtError('Declare war on whom?');
  const ch = [];
  const rebelling = me.liege === house || realmOf(state, p) === realmOf(state, house) && me.liege && (state.houses[me.liege]?.id === realmOf(state, house));
  if (me.liege === house) ch.push({ op: 'liege', house: p, liege: null });
  ch.push({ op: 'war', status: 'start', name: `The war of ${me.name} against ${h.name}`, attackers: [p], defenders: [house], reason: reason || 'declared by House ' + me.name });
  ch.push({ op: 'relation', a: p, b: house, delta: -40, reason: 'war declared' });
  applyChanges(state, ch, { source: 'Your declaration', protectPlayer: false, playerChoseAllegiance: true });
  return { text: `Declare war on House ${h.name}.${reason ? ' Casus belli: ' + reason : ''}`, note: `[Already done: war is declared${rebelling ? ' — this is REBELLION against your liege' : ''}. Narrate how each house reacts: who joins whom, who waits.]`, summary: `War is declared on House ${h.name}.${rebelling ? ' You are in rebellion.' : ''}` };
}
