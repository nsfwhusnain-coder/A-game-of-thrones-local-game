// How a character is disposed toward the player, and how they would weigh common proposals.
// Grounds conversations (and the player's expectations) in the state of the world, CK3-style.
import { getRelation, realmTotals, realmOf, vassalsOf } from './world.js';
import { atWar } from './warfare.js';

const RANK = { crown: 5, paramount: 4, city_state: 3, major: 3, company: 2, minor: 1, tribe: 1, exile: 1 };
const power = (state, id) => { const t = realmTotals(state, id); return (t.levies || 0) + (t.menAtArms || 0) * 2.5 + (t.ships || 0) * 40; };
const has = (c, t) => new RegExp(`\\b${t}`, 'i').test(c?.traits || '');

/**
 * Returns { score, word, factors: [[label, value]], proposals: { alliance, marriage, trade, fealty } }
 * where each proposal is { score, word, factors }.
 */
export function disposition(state, charId) {
  const c = state.characters[charId]; const p = state.meta.player;
  if (!c || c.house === p) return null;
  const h = state.houses[c.house]; const me = state.houses[p];
  if (!h || !me) return null;
  const f = [];
  const rel = getRelation(state, p, c.house); if (rel) f.push(['Relations between your houses', Math.round(rel * 0.5)]);
  if (c.opinion) f.push(['Their opinion of you', Math.round(c.opinion * 0.4)]);
  if (atWar(state, p, c.house)) f.push(['At war with you', -45]);
  if (h.liege === p) f.push(['Sworn to you', Math.round(((c.loyalty ?? 60) - 50) * 0.4) + 5]);
  if (me.liege === c.house) f.push(['Your liege', 5]);
  if (me.liege && me.liege === h.liege) f.push(['Fellow vassals', 5]);
  if (realmOf(state, p) === realmOf(state, c.house) && h.liege !== p && me.liege !== c.house) f.push(['Same realm', 5]);
  if (has(c, 'honorable') || has(c, 'just')) f.push(['Honourable', 3]);
  if (has(c, 'paranoid') || has(c, 'suspicious') || has(c, 'scheming')) f.push(['Distrustful by nature', -6]);
  if (has(c, 'jovial') || has(c, 'generous')) f.push(['Warm by nature', 5]);
  if (c.status === 'imprisoned' || c.status === 'hostage') f.push([`Your ${c.status}`, -8]);
  const base = f.reduce((s, x) => s + x[1], 0);

  const pw = power(state, p), tw = power(state, c.house); const ratio = pw / Math.max(1, tw);
  const rankDiff = (RANK[me.rank] || 1) - (RANK[h.rank] || 1);
  const prop = (extra) => { const all = [...f, ...extra.filter((x) => x[1])]; const score = Math.round(all.reduce((s, x) => s + x[1], 0)); return { score, word: word(score), factors: all }; };

  const alliance = prop([
    ['Your strength', ratio > 2 ? 10 : ratio > 0.8 ? 5 : ratio < 0.3 ? -10 : 0],
    ['Common enemies', state.wars.filter((w) => w.status !== 'ended').some((w) => (w.attackers.includes(realmOf(state, c.house)) || w.defenders.includes(realmOf(state, c.house)) || w.attackers.includes(c.house) || w.defenders.includes(c.house)) && !atWar(state, p, c.house)) ? 8 : 0],
    ['Cautious', has(c, 'cautious') || has(c, 'craven') ? -8 : 0],
    ['Already allied', state.pacts.some((x) => x.type === 'alliance' && [x.a, x.b].includes(p) && [x.a, x.b].includes(c.house) && x.status === 'active') ? 15 : 0],
    ['Baseline reluctance', -10],
  ]);
  const marriage = prop([
    ['Standing of your house', Math.max(-20, Math.min(20, rankDiff * 8))],
    ['Ambitious', has(c, 'ambitious') ? (rankDiff > 0 ? 10 : -5) : 0],
    ['Proud', has(c, 'proud') && rankDiff < 0 ? -10 : 0],
    ['Baseline reluctance', -5],
  ]);
  const trade = prop([
    ['Greedy', has(c, 'greedy') ? 10 : 0],
    ['Coin is always welcome', 8],
    ['Embargo in force', state.pacts.some((x) => x.type === 'embargo' && [x.a, x.b].includes(p) && [x.a, x.b].includes(c.house) && x.status === 'active') ? -20 : 0],
  ]);
  const fealty = prop([
    ['Your strength against theirs', ratio > 5 ? 25 : ratio > 2 ? 10 : ratio > 1 ? 0 : -25],
    ['They already have a liege', h.liege && h.liege !== p ? -25 : 0],
    ['A great house bows to no one', h.rank === 'paramount' || h.rank === 'crown' ? -40 : 0],
    ['Ambitious or proud', has(c, 'ambitious') || has(c, 'proud') ? -15 : 0],
    ['Craven', has(c, 'craven') ? 15 : 0],
    ['Your host is near', Object.values(state.armies).some((a) => a.owner === p && a.type !== 'fleet' && holdingNear(state, a, c.house)) ? 20 : 0],
    ['Pride of an old house', -15],
    ['Already your sworn vassal', h.liege === p ? 60 : 0],
  ]);
  return { score: base, word: word(base), factors: f, proposals: { alliance, marriage, trade, fealty } };
}

function holdingNear(state, a, houseId) {
  const seat = state.holdings[state.houses[houseId]?.seat]; if (!seat) return false;
  return Math.hypot(a.pos[0] - seat.pos[0], a.pos[1] - seat.pos[1]) < 60;
}

export function word(score) {
  return score >= 40 ? 'eager' : score >= 15 ? 'favourable' : score >= 0 ? 'open' : score >= -20 ? 'reluctant' : score >= -45 ? 'unwilling' : 'hostile';
}

/** A compact line for prompts. */
export function dispositionText(state, charId) {
  const d = disposition(state, charId); if (!d) return '';
  const fx = (x) => x.factors.map(([l, v]) => `${l} ${v > 0 ? '+' : ''}${v}`).join(', ');
  const pr = Object.entries(d.proposals).map(([k, v]) => `${k}: ${v.word} (${v.score})`).join('; ');
  return `YOUR DISPOSITION toward the player (the engine's reckoning; let it guide you, though a good argument, a gift or a threat can move you): ${d.word} (${d.score}) — ${fx(d) || 'no strong feelings'}.\nHow you would weigh proposals: ${pr}. (The game settles the outcome of each request; this is what lies behind it.)`;
}
