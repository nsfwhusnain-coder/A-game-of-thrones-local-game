// What a house's own officers know, truly (docs/gdd/04-ai-system.md §8.1, §8.4; the audit's B-15): the steward the
// ledger, the master-at-arms and the captains the hosts and the muster — who has come, who is on the road and how
// far, who is late and who refused — the maester the letters and the season. A lord's own people are not guessing.
import { forces, idOf } from '../../../public/js/engine/parties.js';
import { daysLeft } from '../../../public/js/engine/movement.js';
import { placeName, dayNumber } from '../../../public/js/shared/world.js';
import { supplyOf, supplyText } from '../../../public/js/engine/military/supply.js';

const n = (x) => Math.round(Number(x) || 0).toLocaleString('en-GB');
const OFFICERS = ['steward', 'maester', 'master_at_arms', 'captain', 'commander', 'council', 'lord', 'lady', 'heir', 'spymaster', 'knight'];
export const isOfficer = (state, c) => c?.house === state.meta.player && (c.roles || []).some((r) => OFFICERS.includes(r));

/** The banners of a house as its officers know them: where each sworn lord's men are, and when they will come. */
export function musterState(state, house) {
  const sworn = Object.values(state.houses).filter((h) => h.liege === house);
  const called = sworn.filter((h) => h.obligations?.levies && h.obligations.levies !== 'none');
  if (!called.length) return 'The banners have not been called.';
  const hosts = forces(state).filter((a) => a.men > 0 && (a.owner === house || a.serving === house));
  const lines = [];
  const at = hosts.filter((a) => a.at && !a.march);
  if (at.length) lines.push(`Gathered: ${at.map((a) => `${a.name} at ${placeName(state, a.at)}, ${n(a.men)} men${a.contingents && Object.keys(a.contingents).length ? ` (${Object.entries(a.contingents).map(([h, m]) => `${state.houses[h]?.name || h} ${n(m)}`).join(', ')})` : ''}`).join('; ')}.`);
  const road = hosts.filter((a) => a.march);
  if (road.length) lines.push(`On the road: ${road.map((a) => { const to = idOf(a.march.to) != null ? state.parties[idOf(a.march.to)]?.name : placeName(state, a.march.to); const d = daysLeft(a); return `${state.houses[a.owner]?.name || a.name} ${n(a.men)}${to ? ` for ${to}` : ''}${d != null ? `, ~${Math.max(1, Math.round(d))} days out` : ''}`; }).join('; ')}.`);
  // the rest, by where each lord's answer stands (engine/military/muster.js): days are the engine's own
  const today = dayNumber(state.meta.date); const inDays = (d) => `~${Math.max(1, Math.round(d - today))} days`;
  const stage = (st) => called.filter((h) => (h.obligations.stage || (h.obligations.levies === 'called' ? 'letter' : h.obligations.levies)) === st);
  const gathering = stage('gathering');
  if (gathering.length) lines.push(`Gathering at their seats: ${gathering.map((h) => `${h.name} ${n(h.obligations.call?.men)} men, setting out in ${inDays(h.obligations.call?.depart)}`).join('; ')}.`);
  const late = called.filter((h) => h.obligations.levies === 'delayed');
  if (late.length) lines.push(`Late, with excuses: ${late.map((h) => `${h.name}${h.obligations.call?.retry ? ` (to answer again in ${inDays(h.obligations.call.retry)})` : ''}`).join(', ')}.`);
  const refused = called.filter((h) => h.obligations.levies === 'refused');
  if (refused.length) lines.push(`Refused: ${refused.map((h) => h.name).join(', ')}.`);
  const waiting = [...stage('letter'), ...stage('deliberating')].filter((h) => h.obligations.levies === 'called');
  if (waiting.length) lines.push(`No answer yet: ${waiting.map((h) => `${h.name}${h.obligations.call?.predicted ? ` (expected with the host in ${inDays(h.obligations.call.predicted)})` : ''}`).join(', ')}.`);
  return lines.join(' ');
}

/** The officer's own knowledge, for an audience or a council: the truth of the house they serve. */
export function officerKnowledge(state, c) {
  if (!isOfficer(state, c)) return '';
  const h = state.houses[c.house]; const f = h.figures || {};
  return [
    `THE HOUSE'S STRENGTH (true, as its officers keep it): coin ${n(f.treasury?.v)} dragons; levies not yet called ${n(f.levies?.v)}; men-at-arms ${n(f.menAtArms?.v)}; food ${Math.round(Number(f.food?.v) || 0)} moons.`,
    `THE BANNERS: ${musterState(state, c.house)}`,
    ...(() => { const fed = forces(state).filter((a) => a.owner === c.house && a.kind === 'host' && supplyOf(state, a).days != null); return fed.length ? [`THE HOSTS' BREAD: ${fed.map((a) => `${a.name}: ${supplyText(state, a)}`).join('; ')}.`] : []; })(),
  ].join('\n');
}
