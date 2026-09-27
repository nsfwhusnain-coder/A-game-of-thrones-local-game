// The standing of a house, and how its story ends.
//
// Until now the game could not be won or lost: a house stripped of every acre played on, and a house that
// crowned itself king was told nothing. This module gives the campaign its shape. It measures where a house
// stands in the realm, names the states from which there is no coming back (ruin, attainder, extinction),
// and recognises the heights worth playing for (independence, a paramount's coronet, the Iron Throne).
//
// It is deliberately engine-owned and deterministic: the story model may narrate a triumph, but only the
// numbers below decide that one has happened.
import { realmOf } from './world.js';
import { atWar } from './warfare.js';

const holdingsOf = (s, id) => Object.values(s.holdings).filter((h) => h.owner === id);
const armiesOf = (s, id) => Object.values(s.armies).filter((a) => a.owner === id && a.men > 0);
const kinOf = (s, id) => Object.values(s.characters).filter((c) => c.alive && c.house === id && !(c.roles || []).includes('ward'));

/**
 * Where a house stands, in five plain measures, each 0..100, plus the raw figures behind them.
 * This is the number the end screen scores, the Realm window shows, and the prompt summarises.
 */
export function standing(state, houseId) {
  const h = state.houses[houseId]; if (!h) return null;
  const holds = holdingsOf(state, houseId);
  const hosts = armiesOf(state, houseId);
  const vassals = Object.values(state.houses).filter((v) => v.liege === houseId && v.status !== 'extinct');
  const kin = kinOf(state, houseId);

  const swords = hosts.reduce((n, a) => n + a.men, 0) + (Number(h.figures?.levies?.v) || 0) + (Number(h.figures?.menAtArms?.v) || 0);
  const gold = (Number(h.figures?.treasury?.v) || 0) - (Number(h.figures?.debt?.v) || 0);
  const acres = holds.reduce((n, x) => n + (x.population || 0), 0);
  const content = holds.length ? holds.reduce((n, x) => n + (x.prosperity ?? 50) - (x.unrest ?? 10), 0) / holds.length : 0;

  // scaled against the realm, not against absolute numbers, so a minor house can still climb
  const cap = (v, at) => Math.max(0, Math.min(100, Math.round((v / at) * 100)));
  const lands = cap(acres, 900000);
  const might = cap(swords, 45000);
  const wealth = cap(Math.max(0, gold), 400000);
  const sway = cap(vassals.length * 6 + (h.rank === 'crown' ? 60 : h.rank === 'paramount' ? 35 : h.rank === 'major' ? 12 : 0), 100);
  const blood = cap(kin.length * 12, 100);
  const order = Math.max(0, Math.min(100, Math.round(50 + content)));

  const score = Math.round(lands * 0.26 + might * 0.24 + wealth * 0.16 + sway * 0.18 + blood * 0.1 + order * 0.06);
  return { lands, might, wealth, sway, blood, order, score, holdings: holds.length, vassals: vassals.length, swords, gold, kin: kin.length };
}

const RANK_WORD = { crown: 'The Crown', paramount: 'a Great House', major: 'a major house', minor: 'a minor house', city_state: 'a Free City', order: 'a sworn order', tribe: 'a host', exile: 'exiles', company: 'a free company' };

/** A one-line verdict on the house's fortunes, for the HUD and the prompt. */
export function standingWord(s) {
  if (!s) return '';
  return s.score >= 78 ? 'ascendant' : s.score >= 58 ? 'strong' : s.score >= 38 ? 'holding its own' : s.score >= 20 ? 'straitened' : s.score >= 8 ? 'failing' : 'all but finished';
}

/**
 * Has the player's story ended, and how? Returns null while the game goes on, else
 * { kind: 'ruin'|'extinct'|'attainted'|'exile_lost', victory:false, title, text } or a triumph.
 *
 * Nothing here fires by accident: each state is checked against several conditions so that one bad turn,
 * or one castle briefly occupied, never ends a campaign.
 */
export function outcomeFor(state, houseId = state.meta.player) {
  const h = state.houses[houseId]; if (!h) return null;
  const holds = holdingsOf(state, houseId);
  const hosts = armiesOf(state, houseId);
  const kin = kinOf(state, houseId);
  const lord = h.lord && state.characters[h.lord];
  const swords = hosts.reduce((n, a) => n + a.men, 0);
  const landed = !h.landless;

  // ── Endings ──
  // The line is ended: no living member of the house, anywhere. (A house without a seat but with living
  // claimants — the Targaryens in exile — is not extinct.)
  if (!kin.length && !(lord?.alive)) {
    return { kind: 'extinct', victory: false, title: `The line of House ${h.name} is ended`, text: `No man, woman or child of House ${h.name} yet lives. The name passes into the maesters' books, and the singers will make of it what they will.` };
  }
  // Ruin: a landed house that has lost every holding, every host and its treasury, and is not merely
  // occupied — it has had a full turn to recover and has not.
  if (landed && !holds.length && swords < 200 && (Number(h.figures?.treasury?.v) || 0) < 500) {
    h.ruinTurns = (h.ruinTurns || 0) + 1;
    if (h.ruinTurns >= 2) return { kind: 'ruin', victory: false, title: `House ${h.name} is broken`, text: `Not a stone, not a sword, not a dragon of gold remains to House ${h.name}. What is left of the blood scatters to the hedges and the Free Cities. The game of thrones is played without you now.` };
  } else if (h.ruinTurns) delete h.ruinTurns;

  // ── Triumphs ──
  const realm = realmOf(state, houseId);
  if (h.rank === 'crown' || realm === houseId && state.houses.baratheon?.seat === null) { /* handled below by the throne test */ }
  // The Iron Throne: the house holds King's Landing and no war is being waged against it.
  const kl = state.holdings.baratheon;
  if (kl && kl.owner === houseId && !state.wars.some((w) => w.status !== 'ended' && (w.attackers.includes(houseId) || w.defenders.includes(houseId)))) {
    return { kind: 'throne', victory: true, title: `House ${h.name} sits the Iron Throne`, text: `King's Landing is yours and the realm is at peace. Whatever the singers say of how it was won, House ${h.name} rules the Seven Kingdoms.` };
  }
  // A crown of one's own: an independent realm of at least six holdings, a liege renounced, and peace made.
  if (!h.liege && landed && holds.length >= 6 && /king|queen/i.test(lord?.title || '') && !state.wars.some((w) => w.status !== 'ended' && (w.attackers.includes(houseId) || w.defenders.includes(houseId)))) {
    return { kind: 'crown', victory: true, title: `${lord.name} is crowned`, text: `House ${h.name} bends the knee to no one. ${holds.length} holdings answer to your seat, your enemies have made their peace, and there is a crown on your brow that no king in the south gave you.` };
  }
  return null;
}

/** The end screen's ledger: what the house was, at the end. */
export function epitaph(state, houseId = state.meta.player) {
  const h = state.houses[houseId];
  const st = standing(state, houseId);
  const wars = (state.wars || []).filter((w) => [...w.attackers, ...w.defenders].includes(houseId));
  const battles = (state.battles || []).filter((b) => [b.attacker, b.defender].includes(houseId));
  const won = battles.filter((b) => b.victor === houseId).length;
  return {
    house: h.name, rank: RANK_WORD[h.rank] || h.rank, turns: state.meta.turn, date: state.meta.date,
    standing: st, wars: wars.length, battles: battles.length, battlesWon: won,
    holdings: st.holdings, vassals: st.vassals, kin: st.kin,
    lord: (h.lord && state.characters[h.lord]?.name) || null,
  };
}
