// Scenarios for the four "voice" calls — audience, council, director, consolidate — from mock-played games.
// The phrasing banks below are NEW (none of the lines in eval/wc-bench.mjs `voices()` appear here), so that test stays uncontaminated.
import { rng } from './lib.mjs';
import { walk } from './scen_walk.mjs';

const plain = (s) => String(s || '').replace(/"[^"]*"/g, '').replace(/\s+/g, ' ').trim();
const NUM = ['five hundred', 'a thousand', 'two thousand', 'three thousand', 'four thousand', 'six thousand', '1,500', '800', '2,500', '5,000'];
const GOLD = ['five hundred', 'a thousand', 'two thousand', 'ten thousand', '3,000', '20,000'];

// {n} = how the lord addresses them, {place}, {house}, {num}, {gold}, {captive}
const AUDIENCE_OTHER = [
  '{n}, I need {num} men at {place} before this moon is out. Will you send them?',
  'Ride to {place} with your household guard and wait for my word there.',
  'Bring your banners to {place} within ten days; I will not ask twice.',
  'Let us meet at {place} at the turn of the month and speak of what is owed.',
  'I ask for your sword. War is coming and I would have you at my side.',
  'Kneel, {n}, and swear yourself to my house.',
  'I would have your oath of fealty, and I will hold your lands as my own.',
  'Will you stand with me if {house} takes the field against us?',
  'Let our houses be friends. I offer you a truce until the harvest is in.',
  'Let there be peace between us this winter, whatever the ravens say.',
  'You owe me {gold} dragons in dues. I have come to collect.',
  'Lend me {gold} dragons; I will repay you at the next harvest.',
  'What tribute would buy your goodwill, {n}?',
  'Free {captive}. Whatever the quarrel, it is not worth this.',
  'I would speak of a marriage between our houses.',
  'You have made a fool of yourself and shamed your name, {n}.',
  'Your own bannermen whisper that you are afraid. Is it true?',
  'You will yield what I ask, or you will answer for it in the field.',
  'What do your maesters say of the coming season?',
  'How fares your country? I hear the roads are bad.',
  'What is said of {house} in your halls, {n}?',
  'Who among the lords near you is least to be trusted?',
  'Tell me what you have heard of {place}.',
  'I grieve for your loss, {n}. Tell me if there is anything I can do.',
  'A gift, {n}: {gold} dragons, and my good word at court.',
  'Give me safe passage through your lands to {place}.',
  'Are you for the crown, or for your own house, {n}?',
  'I mean to march soon. Will your men eat at my table on the road?',
];
const AUDIENCE_OWN = [
  '{n}, ready the household; we ride at first light.',
  'Tell me plainly how the men feel about the winter ahead.',
  'What does the steward report of the granaries, {n}?',
  'Go to {place} and see that the walls are sound.',
  'I am uneasy. Speak freely: what do you think of {house}?',
  'You have served my father and now me. What would you have me do differently?',
  'See that the gates are watched tonight, {n}, and say nothing of it.',
  'I want an honest count of the men we could muster, {n}.',
  'Send word to {place} that I am coming, and take twenty men as escort.',
  'Have you heard anything in the yard about our neighbours?',
];
const COUNCIL_Q = [
  'Should we call the banners now, or wait for the thaw?', 'Where are we weakest, and what would you do about it?',
  'Can the treasury bear a tourney this year?', 'What news of our neighbours, and what does it mean for us?',
  'How many men could we raise by the new moon?', 'Is the harvest safe, and are the granaries full enough for a hard winter?',
  'Who can be trusted to hold the road?', 'What would you counsel if {house} marched on us tomorrow?',
  'Tell me plainly how the ledger stands.', 'Speak, all of you: do we send a raven to our liege, or hold our tongues?',
  'Which of our sworn lords worries you most, and why?', 'What must be done before the first snow?',
  'Are our hosts in the right places?', 'What do the reports say of the roads and the fords?',
  'I would hear every voice: is war wise?', 'Where should the next coin be spent, on walls, on swords, or on bread?',
];

function callName(c) { const n = plain(c.name); const first = n.split(' ')[0]; return c.sex === 'f' ? `Lady ${first}` : ((c.roles || []).includes('knight') ? `Ser ${first}` : `Lord ${n.split(' ').slice(-1)[0]}`); }
const fill = (line, ctx) => line.replace('{n}', ctx.n).replace('{place}', ctx.place).replace('{house}', ctx.house).replace('{num}', ctx.num).replace('{gold}', ctx.gold).replace('{captive}', ctx.captive || 'the prisoner');

export async function* audiences(G, { seedBase = 50000, games = 24, turns = 6, perTurn = 2 } = {}) {
  const R = rng(seedBase + 1); const { weighAudience } = await G.imp('public/js/shared/temperament.js'); const { knownTo } = await G.imp('server/minds.js');
  const { relevantMemory } = await G.imp('server/ai/context/memory.js');
  for await (const w of walk(G, { seedBase, games, turns })) {
    const st = w.state; const p = st.meta.player; const lordId = st.houses[p].lord;
    const holds = Object.values(st.holdings); const houses = Object.values(st.houses).filter((h) => h.id !== p && h.rank !== 'company');
    const cands = Object.values(st.characters).filter((c) => c.alive && c.sex && c.id !== lordId && (c.house === p || R.chance(0.35) || st.houses[c.house]?.lord === c.id));
    const captives = Object.values(st.characters).filter((c) => c.alive && /imprisoned|captive|hostage/.test(c.status || ''));
    for (let i = 0; i < perTurn && cands.length; i++) {
      const c = R.pick(cands); const own = c.house === p;
      const ctx = { n: callName(c), place: plain(R.pick(holds).name), house: `House ${plain((R.pick(houses) || {}).name || 'Lannister')}`, num: R.pick(NUM), gold: R.pick(GOLD), captive: captives.length ? plain(R.pick(captives).name) : '' };
      const words = fill(R.pick(own ? AUDIENCE_OWN : AUDIENCE_OTHER), ctx);
      let stance; try { stance = G.withRng(st, () => weighAudience(st, c, words)); } catch { continue; }
      const recent = G.game.readFacts(w.gameId, { from: w.turn - 1 });
      const known = knownTo(st, recent, c.house, { limit: 6 });
      const memory = R.chance(0.5) ? relevantMemory(st, { facts: recent, notes: [], house: c.house, actors: [c.id], houses: [c.house], places: [], words }).text : '';
      yield { id: `aud-${w.id}-${c.id}-${i}`, kind: 'audience', state: st, args: { character: c.id, words, stance, face: R.chance(0.8), known, memory, receipt: [] }, meta: { source: 'mock-game', house: w.house, seed: w.seed, turn: w.turn, who: c.id, verdict: stance.verdict || null } };
    }
  }
}

const OFFICES = ['steward', 'maester', 'master_at_arms', 'spymaster', 'captain', 'commander', 'heir', 'council'];
export async function* councils(G, { seedBase = 60000, games = 24, turns = 6, perTurn = 2 } = {}) {
  const R = rng(seedBase + 1);
  for await (const w of walk(G, { seedBase, games, turns })) {
    const st = w.state; const p = st.meta.player; const lordId = st.houses[p].lord;
    const houses = Object.values(st.houses).filter((h) => h.id !== p && h.rank !== 'company');
    const own = Object.values(st.characters).filter((c) => c.alive && c.house === p && c.id !== lordId);
    const officers = own.filter((c) => (c.roles || []).some((r) => OFFICES.includes(r)));
    const pool = officers.length >= 2 ? officers : own; if (pool.length < 2) continue;
    for (let i = 0; i < perTurn; i++) {
      const mode = R.pick(['ask', 'ask', 'ask', 'advisor', 'listening']);
      const members = mode === 'advisor' ? [R.pick(pool).id] : R.shuffle(pool).slice(0, R.pick([2, 3])).map((c) => c.id);
      const words = mode === 'listening' ? '' : COUNCIL_Q[Math.floor(R.next() * COUNCIL_Q.length)].replace('{house}', `House ${plain((R.pick(houses) || {}).name || 'Lannister')}`);
      yield { id: `cou-${w.id}-${i}`, kind: 'council', state: st, args: { members, words, advisor: mode === 'advisor', listening: mode === 'listening' }, meta: { source: 'mock-game', house: w.house, seed: w.seed, turn: w.turn, mode } };
    }
  }
}

export async function* directors(G, { seedBase = 70000, games = 24, turns = 8 } = {}) {
  const R = rng(seedBase + 1); const { eligibleHooks } = await G.imp('public/js/engine/director.js');
  for await (const w of walk(G, { seedBase, games, turns, quiet: 0.5 })) {
    let hooks = []; try { hooks = eligibleHooks(w.state); } catch { continue; }
    if (!hooks.length) continue;
    yield { id: `dir-${w.id}`, kind: 'director', state: w.state, args: { max: R.pick([1, 1, 2]) }, meta: { source: 'mock-game', house: w.house, seed: w.seed, turn: w.turn, hooks: hooks.length } };
  }
}

export async function* consolidations(G, { seedBase = 80000, games = 24, turns = 8 } = {}) {
  for await (const w of walk(G, { seedBase, games, turns })) {
    if (![5, 7, 8].includes(w.turn)) continue;
    let facts = []; try { facts = G.game.readFacts(w.gameId, { from: Math.max(1, w.turn - 5), to: w.turn, view: 'player', limit: 6000 }); } catch { continue; }
    if (facts.filter((f) => (f.importance ?? 1) >= 2).length < 3) continue;
    yield { id: `con-${w.id}`, kind: 'consolidate', state: w.state, args: { facts }, meta: { source: 'mock-game', house: w.house, seed: w.seed, turn: w.turn, facts: facts.length } };
  }
}
