// The temper of the vassals: loyalty and friendship decide whether dues arrive and banners answer.
// The simulator can override any of this by changing obligations itself; the engine fills in when it doesn't.
import { applyChanges, placePos, getRelation } from './world.js';
import { marchDays } from './warfare.js';

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

/** 0..100: how willing a vassal house is to serve its liege right now. */
export function vassalTemper(state, vid) {
  const v = state.houses[vid]; const liege = v?.liege; if (!liege) return null;
  const lord = state.characters[v.lord];
  const rel = getRelation(state, vid, liege);
  let t = (lord?.loyalty ?? 60) * 0.55 + (rel + 100) / 2 * 0.45;
  const tr = `${lord?.traits || ''}`;
  if (/\b(loyal|honorable|dutiful)\b/i.test(tr)) t += 8;
  if (/\b(ambitious|scheming|treacherous|greedy)\b/i.test(tr)) t -= 8;
  if (/\bcraven\b/i.test(tr)) t -= 4;
  const tax = state.houses[liege].policy?.tax;
  if (tax === 'heavy') t -= 6; else if (tax === 'crushing') t -= 14; else if (tax === 'light') t += 4;
  // a lord whose own lands are hungry or restless has less to give
  const hs = Object.values(state.holdings).filter((h) => h.owner === vid);
  const unrest = hs.length ? hs.reduce((s, h) => s + (h.unrest || 0), 0) / hs.length : 0;
  t -= Math.max(0, unrest - 30) * 0.3;
  if ((Number(v.figures?.food?.v) || 99) < 2) t -= 10;
  return Math.round(clamp(t, 0, 100));
}

/**
 * Advance the vassals by `days`. `touched` holds houses whose obligations the simulator already changed this turn.
 * Returns { applied, events }.
 */
export function vassalTick(state, days, touched = new Set()) {
  const applied = []; const events = [];
  const months = days / 30; const p = state.meta.player;
  for (const v of Object.values(state.houses)) {
    if (!v.liege || !state.houses[v.liege] || !v.lord || !state.characters[v.lord]?.alive) continue;
    if (['tribe', 'company', 'exile'].includes(v.rank)) continue;
    const ob = v.obligations = v.obligations || { tribute: 'paying', levies: 'not_called' };
    const t = vassalTemper(state, v.id);
    const liege = state.houses[v.liege];
    const mine = v.liege === p;
    // --- dues ---
    if (!touched.has(v.id) && ['paying', 'late', 'withholding'].includes(ob.tribute)) {
      const r = Math.random(); let next = ob.tribute;
      if (ob.tribute === 'paying' && t < 32 && r < 0.3 * months) next = 'late';
      else if (ob.tribute === 'late' && t < 20 && r < 0.25 * months) next = 'withholding';
      else if (ob.tribute === 'late' && t >= 50 && r < 0.4 * months) next = 'paying';
      else if (ob.tribute === 'withholding' && t >= 42 && r < 0.25 * months) next = 'late';
      if (next !== ob.tribute) {
        ob.tribute = next;
        const text = next === 'paying' ? `House ${v.name} pays its dues to House ${liege.name} in full again.` : next === 'late' ? `House ${v.name}'s dues to House ${liege.name} are late. Excuses come by raven.` : `House ${v.name} withholds its dues from House ${liege.name} outright.`;
        applied.push({ op: 'obligation', text });
        if (mine) events.push({ title: next === 'paying' ? `House ${v.name} pays again` : `House ${v.name} ${next === 'late' ? 'is late with its dues' : 'withholds its dues'}`, text, where: v.seat, importance: next === 'withholding' ? 3 : 2, type: 'economy', houses: [v.id] });
      }
    }
    // --- the banners ---
    if (ob.levies === 'called' || ob.levies === 'delayed') {
      if (touched.has(v.id) && ob.levies !== 'delayed') continue;
      ob.calledDays = (ob.calledDays || 0) + days;
      const seatPos = placePos(v.seat, state.holdings);
      const musterPos = placePos(ob.muster || liege.seat, state.holdings);
      // a raven must reach them and the levies must be gathered from the fields: a week or two
      const ready = ob.calledDays >= (ob.levies === 'delayed' ? 30 : 10 + Math.random() * 8);
      if (!ready) continue;
      const roll = Math.random() * 100;
      let answer;
      if (t >= 45) answer = roll < 88 ? 'answered' : 'delayed';
      else if (t >= 28) answer = roll < 50 ? 'answered' : roll < 90 ? 'delayed' : 'refused';
      else answer = roll < 20 ? 'answered' : roll < 50 ? 'delayed' : 'refused';
      if (ob.levies === 'delayed' && ob.calledDays > 75 && answer === 'delayed') answer = t >= 35 ? 'answered' : 'refused';
      if (answer === 'delayed' && ob.levies === 'delayed') continue;
      ob.levies = answer;
      const lordName = state.characters[v.lord].name;
      if (answer === 'answered') {
        const lev = Number(v.figures?.levies?.v) || 0; const maa = Number(v.figures?.menAtArms?.v) || 0;
        const zeal = t >= 70 ? 0.9 : t >= 45 ? 0.75 : 0.5;
        const men = Math.round((lev * zeal + maa * 0.6) / 50) * 50;
        if (men >= 50 && seatPos) {
          const name = `Host of House ${v.name}`;
          const r = applyChanges(state, [
            { op: 'army_create', owner: v.id, name, at: v.seat, men, commander: v.lord, composition: `Levies of House ${v.name}${maa > 200 ? ', with knights and men-at-arms' : ''}`, status: 'marching to muster' },
            { op: 'figure', house: v.id, field: 'levies', delta: -Math.round(lev * zeal), source: 'Muster rolls' },
            { op: 'figure', house: v.id, field: 'menAtArms', delta: -Math.round(maa * 0.6), source: 'Muster rolls' },
          ]);
          applied.push(...r.applied);
          const a = Object.values(state.armies).find((x) => x.owner === v.id && x.name === name && !x.serving);
          if (a) {
            a.serving = v.liege; ob.host = a.id;
            if (musterPos && ob.muster && ob.muster !== v.seat) { a.march = { to: ob.muster, since: state.meta.turn }; a.dest = musterPos; a.status = 'marching'; }
            // the lord rides with his men
            state.characters[v.lord].loc = 'army:' + a.id;
          }
          const eta = a && musterPos ? marchDays(a, seatPos, musterPos).days : 0;
          const text = `${lordName} answers the call with ${men.toLocaleString()} men${eta ? `, and marches for ${state.holdings[ob.muster]?.name || 'the muster'} (~${eta} days)` : ''}.`;
          if (mine) events.push({ title: `House ${v.name} answers the call`, text, where: v.seat, importance: 3, type: 'war', houses: [v.id] });
        } else {
          ob.levies = 'answered';
          if (mine) events.push({ title: `House ${v.name} answers — with little`, text: `${lordName} sends word that he has no men left to send.`, where: v.seat, importance: 2, type: 'war', houses: [v.id] });
        }
      } else if (answer === 'delayed') {
        const excuses = ['the harvest is not yet in', 'fever in the villages', 'the roads are flooded', 'his own borders are threatened', 'his knights are scattered at a tourney', 'he must first settle a quarrel with his neighbour'];
        const text = `${lordName} writes that ${excuses[Math.floor(Math.random() * excuses.length)]}. He will come — later.`;
        if (mine) events.push({ title: `House ${v.name} delays`, text, where: v.seat, importance: 2, type: 'war', houses: [v.id] });
      } else {
        const text = `${lordName} refuses the summons. His men will stay at home.`;
        const k = [v.id, v.liege].sort().join('|');
        state.relations[k] = { ...(state.relations[k] || {}), v: clamp((state.relations[k]?.v ?? 0) - 10, -100, 100) };
        if (mine) events.push({ title: `House ${v.name} refuses the call`, text, where: v.seat, importance: 4, type: 'war', houses: [v.id] });
      }
      applied.push({ op: 'obligation', text: `House ${v.name}: banners ${ob.levies}` });
    }
  }
  return { applied, events };
}

/** Hosts that have reached their muster point join their liege's host there: one army on the map, many banners in it. */
export function gatherMusters(state) {
  const events = [];
  for (const a of Object.values(state.armies)) {
    if (!a.serving || a.march || !a.at) continue;
    const v = state.houses[a.owner]; const liegeId = a.serving; const liege = state.houses[liegeId];
    if (!v || !liege || (v.obligations?.muster && a.at !== v.obligations.muster)) continue;
    let host = Object.values(state.armies).find((x) => x.owner === liegeId && x.at === a.at && x.type !== 'fleet' && x.id !== a.id);
    if (!host) {
      const id = `${liegeId}_banners_${a.at}`.replace(/[^a-z0-9_]/g, '');
      host = state.armies[id] = { id, owner: liegeId, name: `The Banners of ${liege.name}`, commander: a.commander, at: a.at, pos: [...a.pos], dest: null, men: 0, type: 'army', composition: 'Levies and knights of the sworn houses', status: 'mustered', morale: a.morale ?? 70, supply: a.supply ?? 80, asOf: a.asOf };
    }
    const total = host.men + a.men;
    host.morale = Math.round(((host.morale ?? 70) * host.men + (a.morale ?? 70) * a.men) / Math.max(1, total));
    host.supply = Math.round(((host.supply ?? 80) * host.men + (a.supply ?? 80) * a.men) / Math.max(1, total));
    host.men = total;
    host.contingents = { ...(host.contingents || {}), [a.owner]: ((host.contingents || {})[a.owner] || 0) + a.men };
    if (!/sworn houses/.test(host.composition || '')) host.composition = `${host.composition || ''}; with the levies and knights of the sworn houses`.replace(/^; /, '');
    for (const c of Object.values(state.characters)) if (c.loc === 'army:' + a.id) c.loc = 'army:' + host.id;
    if (v.obligations) v.obligations.host = host.id;
    delete state.armies[a.id];
    if (liegeId === state.meta.player) events.push({ title: `House ${v.name} joins your host`, text: `${a.men.toLocaleString()} men under the ${v.name} banner join ${host.name} at ${state.holdings[host.at]?.name || 'the muster'}. The host now numbers ${host.men.toLocaleString()}.`, where: host.at, importance: 2, type: 'war', houses: [v.id] });
  }
  return events;
}

/** Lords in the field grow restless; the disloyal take their men home. Call once per turn with the days elapsed. */
export function fieldService(state, days) {
  const events = []; const months = days / 30;
  const autumn = state.world?.season === 'autumn';
  for (const host of Object.values(state.armies)) {
    if (!host.contingents) continue;
    for (const [vid, men] of Object.entries(host.contingents)) {
      const v = state.houses[vid]; if (!v || v.liege !== host.owner) { continue; }
      const k = [vid, host.owner].sort().join('|');
      const drift = (autumn ? 2.5 : 1.2) * months * (/sieg|idle|mustered|garrison/.test(host.status || '') ? 1.3 : 0.8);
      state.relations[k] = { ...(state.relations[k] || {}), v: clamp(Math.round((state.relations[k]?.v ?? 0) - drift), -100, 100) };
      const t = vassalTemper(state, vid);
      if (t < 22 && Math.random() < 0.5 * months) {
        const leave = Math.min(men, host.men);
        host.men -= leave; delete host.contingents[vid];
        const lev = v.figures.levies = v.figures.levies || { v: 0 };
        lev.v = (Number(lev.v) || 0) + Math.round(leave * 0.9);
        v.obligations = { ...(v.obligations || {}), levies: 'refused' }; delete v.obligations.host;
        for (const c of Object.values(state.characters)) if (c.loc === 'army:' + host.id && c.house === vid) c.loc = v.seat;
        if (host.owner === state.meta.player) events.push({ title: `House ${v.name} goes home`, text: `Tired of the war and of your command, ${state.characters[v.lord]?.name || 'the lord'} strikes his tents in the night and marches ${leave.toLocaleString()} men home.`, where: v.seat, importance: 4, type: 'war', houses: [vid] });
      }
    }
    if (host.men <= 0) delete state.armies[host.id];
  }
  return events;
}
