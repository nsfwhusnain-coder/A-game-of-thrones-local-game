// Diplomacy and intrigue verbs (docs/gdd/08-characters-politics.md §12): war declared, ravens sent, and the
// spymaster's work — eyes in another house's hall, a secret dug up. Letters that are answered and envoys that are
// heard become entities of their own in WP B10; these are the acts the lord can already do.
import { applyChanges, realmOf, charPos, dateStr, dayNumber } from '../../shared/world.js';
import { exposePlot } from '../../shared/treachery.js';
import { MILES_PER_UNIT } from '../../../data/geography.js';
import { random } from '../rng.js';
import { emit } from '../facts/log.js';
import { knowledgeOf, learn } from '../knowledge.js';

const gold = (h) => Number(h?.figures?.treasury?.v) || 0;
const spend = (state, house, n, source) => applyChanges(state, [{ op: 'figure', house, field: 'treasury', delta: -n, source }]);
export const RAVEN_MILES_A_DAY = 300;
/** Days a raven takes from one person to another (it finds a rider where the rider is). */
export function ravenDays(state, a, b) {
  const x = a && charPos(state, a), y = b && charPos(state, b);
  return Math.max(1, Math.round((x && y ? Math.hypot(x[0] - y[0], x[1] - y[1]) * MILES_PER_UNIT : 600) / RAVEN_MILES_A_DAY));
}
const SCHEME_COST = { secrets: 1200, spies: 800 };
const spymaster = (state, house) => Object.values(state.characters).find((c) => c.alive && c.house === house && (c.roles || []).includes('spymaster')) || null;

/** Intrigue: spies in a house show its hosts wherever they march (fog of war); digging may bring a secret to light. */
function scheme(state, house, { house: target, kind }, cause) {
  const me = state.houses[house]; const h = state.houses[target];
  const cost = SCHEME_COST[kind] || SCHEME_COST.spies;
  spend(state, house, cost, 'Secret expenses');
  const sm = spymaster(state, house); const skill = sm?.skills?.[3] ?? 5;
  const chance = Math.max(0.2, Math.min(0.88, 0.3 + skill * 0.035));
  const roll = random();
  const who = sm ? sm.name : 'Your hired men';
  if (roll < chance) {
    if (kind === 'secrets') {
      const lord = state.characters[h.lord];
      const found = [lord, ...Object.values(state.characters).filter((c) => c.house === target && c.alive)].find((c) => c?.secret && !c.secretKnown);
      if (found) {
        const before = (state.facts || []).length;
        applyChanges(state, [{ op: 'character', id: found.id, revealSecret: true }], { cause });
        // the secret is known to this house now, by its spy (engine/knowledge.js; invariant 9)
        for (const f of (state.facts || []).slice(before)) if (f.kind === 'secret_revealed') learn(state, house, f, { via: 'spy' });
        return { found: true, text: `[SECRET] Uncover the secrets of House ${h.name}.`, note: `[Already done: ${who} learned ${found.name}'s secret: ${found.secret}. Only the player knows. Narrate nothing of it openly.]`, summary: `${who} brings you ${found.name}'s secret: ${found.secret}` }; }
      return { found: false, text: `[SECRET] Uncover the secrets of House ${h.name}.`, note: `[Already done: ${who} found nothing worth the gold.]`, summary: `${who} dug, and found nothing House ${h.name} hides that you did not know.` };
    }
    knowledgeOf(state, house).spies[target] = state.meta.turn;
    if (h.liege === house) { const found = exposePlot(state, target); return { found: true, text: `[SECRET] Plant spies in the household of House ${h.name}.`, note: `[Already done: ${who} has eyes in House ${h.name}. Finding: ${found}]`, summary: `${who} has eyes in House ${h.name}. ${found}` }; }
    return { found: true, text: `[SECRET] Plant spies in the household of House ${h.name}.`, note: `[Already done: ${who} has eyes in House ${h.name}; the player now sees their hosts.]`, summary: `${who} has placed eyes in House ${h.name}. Their hosts will be known to you wherever they march.` };
  }
  if (roll < chance + (1 - chance) * 0.45) {
    applyChanges(state, [{ op: 'relation', a: house, b: target, delta: -15, reason: 'your spies were caught' }]);
    emit(state, 'scheme_discovered', { actors: [sm?.id, h.lord], houses: [house, target], place: h.seat || null, vis: { scope: 'houses', houses: [house, target] }, data: { kind }, cause, text: `House ${h.name} catches agents of House ${me.name} in its household.` });
    return { caught: true, text: `[SECRET] A scheme against House ${h.name}.`, note: `[Already done: the player's agents were CAUGHT by House ${h.name}. Narrate the discovery and their anger.]`, summary: `Your agents were caught in House ${h.name}'s household. They know who sent them.` };
  }
  return { text: `[SECRET] A scheme against House ${h.name}.`, note: '[Already done: the scheme came to nothing; no one noticed.]', summary: `${who}'s agents came back with nothing. The gold is gone; no one noticed.` };
}

const intrigue = (kind, label) => ({
  id: kind === 'secrets' ? 'gather_secrets' : 'plant_spy', family: 'intrigue', label,
  params: { house: 'house:other' },
  legal: (state, i) => {
    const h = state.houses[i.params.house]; if (!h || i.params.house === i.house) return { code: 'no_target', text: 'Against whom?' };
    if (gold(state.houses[i.house]) < SCHEME_COST[kind]) return { code: 'gold', text: `Your spymaster needs ~${SCHEME_COST[kind]} dragons for bribes and silence.` };
    return null;
  },
  cost: () => ({ gold: SCHEME_COST[kind] }),
  start: (state, i) => scheme(state, i.house, { house: i.params.house, kind }, i.source),
  receipt: (state, i, d) => [{ ok: d.caught ? false : d.found ? true : 'warn', text: d.summary }],
  said: (state, i, d) => ({ status: 'done', text: d.text, note: d.note }),
  // a lord's spies bring what they learn to *his* house: until each house has its own knowledge (WP B9) a scheme can
  // only inform the player, so only the player schemes
  facts: kind === 'secrets' ? ['secret_revealed', 'scheme_discovered'] : ['scheme_discovered'], mind: { allowed: false, until: 'B9' },
});

export const DIPLOMACY = [
  {
    // war, declared: the realm takes sides; a vassal who declares on his liege is in rebellion
    id: 'declare_war', family: 'diplomacy', label: 'Declare war',
    params: { house: 'house:other', reason: 'text?' },
    legal: (state, i) => {
      const h = state.houses[i.params.house]; if (!h || i.params.house === i.house) return { code: 'no_target', text: 'Declare war on whom?' };
      if ((state.wars || []).some((w) => w.status !== 'ended' && ((w.attackers.includes(i.house) && w.defenders.includes(h.id)) || (w.defenders.includes(i.house) && w.attackers.includes(h.id))))) return { code: 'at_war', text: `You are already at war with House ${h.name}.` };
      return null;
    },
    start: (state, i) => {
      const me = state.houses[i.house]; const h = state.houses[i.params.house]; const target = h.id; const ch = [];
      const rebelling = me.liege === target || (realmOf(state, i.house) === realmOf(state, target) && me.liege && state.houses[me.liege]?.id === realmOf(state, target));
      if (me.liege === target) ch.push({ op: 'liege', house: i.house, liege: null });
      ch.push({ op: 'war', status: 'start', name: `The war of ${me.name} against ${h.name}`, attackers: [i.house], defenders: [target], reason: i.params.reason || 'declared by House ' + me.name });
      ch.push({ op: 'relation', a: i.house, b: target, delta: -40, reason: 'war declared' });
      applyChanges(state, ch, { source: 'Your declaration', protectPlayer: false, playerChoseAllegiance: true, cause: i.source });
      return { text: `Declare war on House ${h.name}.${i.params.reason ? ' Casus belli: ' + i.params.reason : ''}`, note: `[Already done: war is declared${rebelling ? ' — this is REBELLION against your liege' : ''}. Narrate how each house reacts: who joins whom, who waits.]`, summary: `War is declared on House ${h.name}.${rebelling ? ' You are in rebellion.' : ''}`, rebelling };
    },
    receipt: (state, i, d) => [{ ok: d.rebelling ? 'warn' : true, text: d.summary }],
    said: (state, i, d) => ({ status: 'done', text: d.text, note: d.note }),
    facts: ['war_declared', 'fealty_renounced'], mind: { allowed: true },
  },
  intrigue('spies', 'Plant spies in a household'),
  intrigue('secrets', 'Dig for a house\'s secrets'),
  {
    // a raven carries the lord's words; the answer comes as the recipient's temper and the roads allow (server/orders.js)
    id: 'send_letter', family: 'diplomacy', label: 'Send a raven',
    params: { to: 'character', text: 'text' },
    legal: (state, i) => {
      const c = state.characters[i.params.to]; if (!c?.alive) return { code: 'no_one', text: 'There is no one by that name to write to.' };
      if (!String(i.params.text || '').trim()) return { code: 'empty', text: 'A letter needs words.' };
      return null;
    },
    start: (state, i) => {
      const c = state.characters[i.params.to]; const lord = state.characters[i.actor]; const days = ravenDays(state, lord, c);
      state.post = state.post || [];
      const id = `post_${state.meta.turn}_${state.post.length}`;
      state.post.unshift({ id, to: c.id, toName: c.name, text: String(i.params.text), sent: dateStr(state.meta.date), sentDay: dayNumber(state.meta.date), arriveDay: dayNumber(state.meta.date) + days, days, status: 'in flight' });
      state.post = state.post.slice(0, 40);
      emit(state, 'letter_sent', { actors: [lord?.id, c.id], houses: [i.house, c.house], data: { to: c.id, days, post: id }, vis: { scope: 'houses', houses: [i.house, c.house] }, cause: i.source, text: `A raven flies from ${lord?.name || `House ${state.houses[i.house].name}`} to ${c.name} (~${days} ${days === 1 ? 'day' : 'days'}).` });
      return { post: id, to: c.name, days };
    },
    receipt: (state, i, d) => [{ ok: true, text: `A raven flies to ${d.to} (~${d.days} ${d.days === 1 ? 'day' : 'days'}).`, eta: d.days }],
    // the post is the player's letters; lords write to each other when letters are their own things (WP B10)
    facts: ['letter_sent'], mind: { allowed: false, until: 'B10' },
  },
];
