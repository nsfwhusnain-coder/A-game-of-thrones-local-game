// Kingdoms behind their eyes: sworn lords who weigh their oaths against their chances.
//
// Each turn every sworn lord's temptation moves with their nature (guile, pride, what sways them), their
// loyalty, how their liege is faring (defeats, a losing war, heavy taxes) and what the liege's enemies could
// offer. A lord who is tempted enough and schemer enough opens secret talks with the enemy. A plotting lord
// may hold back or turn his men in the next battle his liege fights, and when the liege's fortunes collapse
// he goes over openly. None of it is announced: the player hears whispers, or learns it from their spymaster.
// Gifts, feasts, victories and light taxes ease temptation; defeats and slights feed it.
import { applyChanges, getRelation, realmTotals } from './world.js';
import { temperament } from './temperament.js';
import { isFemale } from './people.js';
import { atWar } from './warfare.js';

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

function enemiesOf(state, house) {
  return (state.wars || []).filter((w) => w.status !== 'ended' && [...w.attackers, ...w.defenders].includes(house))
    .flatMap((w) => (w.attackers.includes(house) ? w.defenders : w.attackers)).filter((h) => state.houses[h]);
}
const powerOf = (state, h) => { const t = realmTotals(state, h); return (Number(t.levies) || 0) + (Number(t.menAtArms) || 0) * 2; };
function recentDefeats(state, house) {
  return (state.battles || []).filter((b) => state.meta.turn - b.turn <= 3 && (b.attacker === house || b.defender === house) && b.victor && b.victor !== house).length;
}

/** One turn of temptation for every sworn lord. Returns { events, applied, whispers } — whispers are the player's rumours. */
export function treacheryTick(state, days, r = Math.random) {
  state.plotting = state.plotting || {}; // house -> { with, since, pressure, known }
  const events = []; const changes = []; const p = state.meta.player;
  const k = Math.min(1.5, days / 30);
  for (const v of Object.values(state.houses)) {
    const liege = v.liege; if (!liege || !state.houses[liege] || v.status === 'extinct') continue;
    const lord = state.characters[v.lord]; if (!lord?.alive) continue;
    const T = temperament(lord);
    const foes = enemiesOf(state, liege).filter((f) => f !== v.id && state.houses[f]?.liege !== liege);
    const rec = state.plotting[v.id] || { pressure: 0 };
    // what tempts them, and what holds them
    let d = (T.guile - 0.45) * 8 + (T.pride - 0.5) * 4 - (T.courage < 0.3 ? 2 : 0);
    const loyalty = lord.loyalty ?? 60;
    d += loyalty < 40 ? (40 - loyalty) / 5 : -(loyalty - 40) / 12;
    d += getRelation(state, v.id, liege) < -10 ? 3 : getRelation(state, v.id, liege) > 30 ? -3 : 0;
    const defeats = recentDefeats(state, liege); d += defeats * 6;
    if (foes.length) { const strongest = foes.sort((a, b) => powerOf(state, b) - powerOf(state, a))[0]; if (powerOf(state, strongest) > powerOf(state, liege) * 1.3 && (T.sway.power || T.sway.fear)) d += 5; else d += 1; }
    else d -= 3; // no war: little to gain from treachery
    if (T.sway.gold && (Number(state.houses[liege].figures?.treasury?.v) || 0) < 2000) d += 2;
    const tax = state.houses[liege].policy?.tax; if (tax === 'crushing') d += 3; else if (tax === 'heavy') d += 1.5;
    if (T.sway.honour || T.sway.duty) d -= 3;
    rec.pressure = clamp((rec.pressure || 0) * 0.92 + d * k, 0, 100);
    // talks with the enemy: only a schemer, only in a war, only when tempted enough
    if (!rec.with && foes.length && rec.pressure >= 45 && T.guile >= 0.55 && r() < 0.35 * k) {
      rec.with = foes.sort((a, b) => powerOf(state, b) - powerOf(state, a))[0]; rec.since = state.meta.turn;
      if (liege === p && r() < 0.25) events.push(whisper(state, v, lord, rec, days, r));
    }
    // talks end if the temptation fades (a victory, a gift, a feast)
    if (rec.with && (rec.pressure < 25 || !atWar(state, liege, rec.with))) { delete rec.with; delete rec.since; }
    // the open break: the liege is losing and the plotter sees his chance
    if (rec.with && rec.pressure >= 70 && defeats >= 1 && r() < 0.5 * k) {
      const enemy = state.houses[rec.with];
      changes.push({ op: 'liege', house: v.id, liege: rec.with }, { op: 'war_join', war: (state.wars.find((w) => w.status !== 'ended' && [...w.attackers, ...w.defenders].includes(liege)) || {}).id, house: v.id, side: state.wars.find((w) => w.status !== 'ended' && w.attackers.includes(rec.with)) ? 'attacker' : 'defender' }, { op: 'relation', a: v.id, b: liege, delta: -40, reason: 'turned his cloak' });
      const her = isFemale(lord); events.push({ title: `${lord.name} turns ${her ? 'her' : 'his'} cloak`, text: `House ${v.name} has gone over to House ${enemy.name}. ${lord.name} ${T.guile > 0.85 ? 'had been in secret talks for moons' : 'saw which way the wind blew'}.`, details: `${state.houses[liege].name}'s ${defeats > 1 ? 'defeats' : 'defeat'} gave ${her ? 'her' : 'him'} the reason ${her ? 'she' : 'he'} wanted. ${her ? 'Her' : 'His'} men ride under new banners now.`, where: v.seat, importance: liege === p ? 5 : 4, type: 'intrigue', houses: [v.id, liege, rec.with], day: 1 + Math.floor(r() * days) });
      delete state.plotting[v.id]; continue;
    }
    state.plotting[v.id] = rec;
  }
  const { applied } = applyChanges(state, changes, { source: 'Treachery', protectPlayer: false });
  return { events, applied };
}

function whisper(state, v, lord, rec, days, r) {
  const enemy = state.houses[rec.with];
  const how = [`riders in ${enemy.name} colours were seen leaving ${state.holdings[v.seat]?.name || v.name} by night`, `a maester swears ravens from ${state.holdings[v.seat]?.name || v.name} fly toward ${state.holdings[enemy.seat]?.name || enemy.name}`, `${lord.name}'s steward was seen drinking with a ${enemy.name} man at an inn`, `a septon says ${lord.name} no longer prays for your victory`];
  return { title: `Whispers about House ${v.name}`, text: `Word reaches you that ${how[Math.floor(r() * how.length)]}. It may be nothing.`, where: v.seat, importance: 3, type: 'intrigue', houses: [v.id], mine: true, day: 1 + Math.floor(r() * days) };
}

/** In battle: do the plotting lords' men fight? Returns the men withdrawn and who withdrew them. */
export function contingentsHoldBack(state, army, r = Math.random) {
  const out = []; if (!army?.contingents) return out;
  for (const [vid, men] of Object.entries(army.contingents)) {
    const rec = state.plotting?.[vid]; if (!rec?.with) continue;
    const T = temperament(state.characters[state.houses[vid]?.lord] || {});
    if (r() < 0.35 + T.guile * 0.35) out.push({ vid, men: Math.round(men * (army.men / Math.max(army.men, Object.values(army.contingents).reduce((a, b) => a + b, 0)))), turn: r() < 0.3 });
  }
  return out;
}

/** The spymaster's report on a vassal: is he treating with the enemy? */
export function exposePlot(state, house) {
  const rec = state.plotting?.[house];
  if (rec?.with) { rec.known = true; return `${state.characters[state.houses[house].lord]?.name} of House ${state.houses[house].name} is in secret talks with House ${state.houses[rec.with].name}.`; }
  const pr = Math.round(rec?.pressure || 0);
  return pr > 35 ? `House ${state.houses[house].name} is restless and could be turned — but has not yet treated with your enemies.` : `House ${state.houses[house].name} is loyal, as far as anyone can tell.`;
}
