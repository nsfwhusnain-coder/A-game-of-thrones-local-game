// The temper of the vassals: loyalty and friendship decide whether dues arrive and banners answer.
// The simulator can override any of this by changing obligations itself; the engine fills in when it doesn't.
import { unitsOf, addUnits } from './units.js';
const isWoman = (c) => c.gender === 'f' || /\b(Lady|Queen|Princess|Septa|Daughter|Wife|Mother|Sister|Maid)\b/.test(c.title || '') || (c.roles || []).includes('lady');
import { applyChanges, placePos, getRelation } from './world.js';
import { marchDays, atWar } from './warfare.js';

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
    if (v.id === p) { events.push(...playerAsVassal(state, v, months)); continue; } // the player answers for themself
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
          const a = Object.values(state.armies).find((x) => x.owner === v.id && x.name === name && !x.serving); let riding = [];
          if (a) {
            a.serving = v.liege; ob.host = a.id;
            if (musterPos && ob.muster && ob.muster !== v.seat) { a.march = { to: ob.muster, since: state.meta.turn }; a.dest = musterPos; a.status = 'marching'; }
            // the lord rides with his men — and his grown sons, brothers and sworn knights, as lords do
            state.characters[v.lord].loc = 'army:' + a.id;
            const kin = Object.values(state.characters).filter((c) => c.alive && c.house === v.id && c.id !== v.lord && (!isWoman(c) || /warrior|fighter|shield/i.test(c.traits || '')) && c.age >= 16 && c.age <= 50 && c.status === 'free' && !c.travel && [v.seat, 'army:'].some((l) => String(c.loc || '').startsWith(l) || c.loc === v.seat) && !(c.roles || []).includes('maester'));
            riding = kin.filter(() => Math.random() < 0.55).slice(0, 2);
            for (const c of riding) { c.loc = 'army:' + a.id; delete c.travel; }
          }
          const eta = a && musterPos ? marchDays(a, seatPos, musterPos).days : 0;
          const text = `${lordName} answers the call with ${men.toLocaleString()} men${riding.length ? `, ${riding.map((c) => c.name).join(' and ')} riding with him` : ''}${eta ? `, and marches for ${state.holdings[ob.muster]?.name || 'the muster'} (~${eta} days)` : ''}.`;
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
  events.push(...unrestTick(state, days), ...rebellionTick(state, days));
  return { applied, events };
}

// Smallfolk rise when unrest runs too high for too long
function unrestTick(state, days) {
  const events = []; const months = days / 30; const p = state.meta.player;
  for (const h of Object.values(state.holdings)) {
    if (h.status === 'rising') { h.unrest = Math.max(h.unrest, 85); continue; }
    if ((h.unrest || 0) < 85 || (h.status && h.status !== 'normal') || Math.random() >= 0.35 * months) continue;
    h.status = 'rising';
    if (h.owner !== p) { if (Math.random() < 0.5) { h.status = 'normal'; h.unrest -= 20; } continue; } // the story handles other lords' troubles
    const cost = Math.round(h.population * 0.01 / 50) * 50 + 500;
    applyChanges(state, [{ op: 'decision', title: `The smallfolk rise at ${h.name}`, from: null, text: `Hunger, taxes and lawlessness have driven the smallfolk of ${h.name} to arms. They have burned a tithe barn and hanged a tax collector, and they will not disperse.`, options: [
      { label: 'Crush the rising', hint: 'Your men-at-arms ride out. It will be bloody, and it will be remembered.', fx: [{ rising: [h.id, 'crush'] }] },
      { label: 'Hear their grievances', hint: `~${cost.toLocaleString()} dragons in grain and remitted rents`, fx: [{ rising: [h.id, 'grant', cost] }] },
      { label: 'Hang the ringleaders, pardon the rest', hint: 'A middle course', fx: [{ rising: [h.id, 'hang'] }] },
      { label: 'Let it burn itself out', hint: 'It may spread', fx: [{ rising: [h.id, 'ignore'] }] }] }]);
    events.push({ title: `Rising at ${h.name}`, text: `The smallfolk of ${h.name} are up in arms.`, where: h.id, importance: 4, type: 'court', houses: [p] });
  }
  return events;
}

/** The player's answer to a rising. */
export function answerRising(state, [hid, how, cost]) {
  const h = state.holdings[hid]; if (!h) return []; const p = state.meta.player; const me = state.houses[p]; const out = [];
  const maa = Number(me.figures.menAtArms?.v) || 0;
  if (how === 'crush') {
    h.status = 'normal'; h.unrest = Math.max(0, h.unrest - 45); h.population = Math.round(h.population * 0.96); h.prosperity = Math.max(0, h.prosperity - 6);
    me.figures.menAtArms = { ...me.figures.menAtArms, v: Math.max(0, maa - Math.round(20 + Math.random() * 60)) };
    out.push(`${h.name}: the rising is crushed; unrest ${h.unrest}, some hundreds dead`);
    for (const x of Object.values(state.holdings)) if (x.owner === p && x.id !== hid) x.unrest = Math.min(100, (x.unrest || 0) + 3);
  } else if (how === 'grant') {
    const f = me.figures.treasury; f.v = Math.max(0, (Number(f.v) || 0) - cost);
    h.status = 'normal'; h.unrest = Math.max(0, h.unrest - 40); h.prosperity = Math.min(100, h.prosperity + 2);
    out.push(`${h.name}: grievances heard; treasury −${cost.toLocaleString()}, unrest ${h.unrest}`);
  } else if (how === 'hang') {
    h.status = 'normal'; h.unrest = Math.max(0, h.unrest - 30); h.population = Math.round(h.population * 0.995);
    out.push(`${h.name}: ringleaders hanged; unrest ${h.unrest}`);
  } else {
    h.unrest = Math.min(100, h.unrest + 5);
    const near = Object.values(state.holdings).filter((x) => x.owner === p && x.id !== hid).sort((a, b) => Math.hypot(a.pos[0] - h.pos[0], a.pos[1] - h.pos[1]) - Math.hypot(b.pos[0] - h.pos[0], b.pos[1] - h.pos[1]))[0];
    if (near) { near.unrest = Math.min(100, (near.unrest || 0) + 15); out.push(`unrest spreads to ${near.name}`); }
    if (Math.random() < 0.4) { h.status = 'normal'; h.unrest -= 25; out.push(`${h.name}: the rising burns itself out`); }
  }
  return out;
}

// A vassal whose temper collapses stops paying, stops answering — and may rise
function rebellionTick(state, days) {
  const events = []; const months = days / 30; const p = state.meta.player;
  for (const v of Object.values(state.houses)) {
    if (v.liege !== p || !v.lord || !state.characters[v.lord]?.alive || v.rebel) continue;
    const t = vassalTemper(state, v.id);
    if (t >= 14 || v.obligations?.tribute !== 'withholding' || Math.random() >= 0.2 * months) continue;
    v.rebel = true;
    const lord = state.characters[v.lord];
    applyChanges(state, [{ op: 'decision', title: `House ${v.name} defies you`, from: v.lord, text: `${lord.name} has closed the gates of ${state.holdings[v.seat]?.name || 'his seat'}, turned away your envoy and declared that House ${v.name} owes you nothing. Other lords are watching to see what you do.`, options: [
      { label: 'Declare them traitors and march', hint: 'War. Every lord will see the price of defiance.', fx: [{ rebel: [v.id, 'war'] }] },
      { label: 'Offer terms', hint: 'Forgive their dues and hear their grievances. Some will call it weakness.', fx: [{ rebel: [v.id, 'terms'] }] },
      { label: 'Release them from their oaths', hint: 'Let them go. Your realm shrinks.', fx: [{ rebel: [v.id, 'release'] }] }] }]);
    events.push({ title: `House ${v.name} defies House ${state.houses[v.liege]?.name}`, text: `${lord.name} refuses the authority of House ${state.houses[v.liege]?.name}.`, where: v.seat, importance: 5, type: 'war', houses: [v.id] });
  }
  return events;
}

/** The player's answer to a defiant vassal. */
export function answerRebel(state, [vid, how]) {
  const v = state.houses[vid]; const p = state.meta.player; const me = state.houses[p]; if (!v) return [];
  const k = [vid, p].sort().join('|'); const out = [];
  const others = Object.values(state.houses).filter((x) => x.liege === p && x.id !== vid);
  const nudge = (d) => { for (const o of others) { const kk = [o.id, p].sort().join('|'); state.relations[kk] = { ...(state.relations[kk] || {}), v: clamp((state.relations[kk]?.v ?? 0) + d, -100, 100) }; } };
  if (how === 'war') {
    applyChanges(state, [{ op: 'war', name: `The Defiance of House ${v.name}`, attackers: [p], defenders: [vid], reason: 'a vassal defied his liege' }]);
    v.obligations = { ...(v.obligations || {}), tribute: 'withholding', levies: 'refused' };
    out.push(`War: House ${me.name} against House ${v.name}`);
    for (const o of others) { const lord = state.characters[o.lord]; if (lord && /\b(loyal|honorable|dutiful|just)\b/i.test(lord.traits || '')) { const kk = [o.id, p].sort().join('|'); state.relations[kk] = { ...(state.relations[kk] || {}), v: clamp((state.relations[kk]?.v ?? 0) + 5, -100, 100) }; } }
  } else if (how === 'terms') {
    delete v.rebel;
    v.obligations = { ...(v.obligations || {}), tribute: 'forgiven', tributeUntil: state.meta.date.year * 12 + state.meta.date.month + 12, levies: 'not_called' };
    state.relations[k] = { ...(state.relations[k] || {}), v: clamp((state.relations[k]?.v ?? 0) + 25, -100, 100) };
    const lord = state.characters[v.lord]; if (lord) lord.loyalty = Math.min(100, (lord.loyalty ?? 40) + 20);
    nudge(-3); out.push(`House ${v.name} is mollified; dues forgiven for a year; other lords think you soft`);
  } else {
    v.liege = null; v.independent = true; delete v.rebel; nudge(-6);
    out.push(`House ${v.name} is released from its oaths`);
  }
  return out;
}

/** Hosts that have reached their muster point join their liege's host there: one army on the map, many banners in it. */
export function gatherMusters(state) {
  const events = [];
  for (const a of Object.values(state.armies)) {
    if (!a.serving || a.type === 'fleet') continue;
    const v = state.houses[a.owner]; const liegeId = a.serving; const liege = state.houses[liegeId];
    if (!v || !liege) continue;
    const field = (x) => x.owner === liegeId && x.type !== 'fleet' && x.id !== a.id && !/garrison/i.test(x.status || '');
    // the liege's great host has marched on from the muster: late banners follow it, and join it where they meet
    const main = Object.values(state.armies).filter(field).sort((x, y) => y.men - x.men)[0];
    const near = main && Math.hypot(main.pos[0] - a.pos[0], main.pos[1] - a.pos[1]) < 4;
    if (main && !near && a.at && !main.at && main.march && (!v.obligations?.muster || a.at === v.obligations.muster)) { a.march = { to: 'army:' + main.id, since: state.meta.turn }; a.status = 'following the host'; a.at = null; continue; }
    if (!near && (a.march || !a.at || (v.obligations?.muster && a.at !== v.obligations.muster))) continue;
    let host = near ? main : Object.values(state.armies).find((x) => field(x) && x.at === a.at);
    if (!host) {
      const id = `${liegeId}_banners_${a.at}`.replace(/[^a-z0-9_]/g, '');
      host = state.armies[id] = { id, owner: liegeId, name: `The Banners of ${liege.name}`, commander: a.commander, at: a.at, pos: [...a.pos], dest: null, men: 0, type: 'army', composition: 'Levies and knights of the sworn houses', status: 'mustered', morale: a.morale ?? 70, supply: a.supply ?? 80, asOf: a.asOf };
    }
    host.units = addUnits(unitsOf(state, host), unitsOf(state, a));
    const total = host.men + a.men;
    host.morale = Math.round(((host.morale ?? 70) * host.men + (a.morale ?? 70) * a.men) / Math.max(1, total));
    host.supply = Math.round(((host.supply ?? 80) * host.men + (a.supply ?? 80) * a.men) / Math.max(1, total));
    host.men = total;
    host.contingents = { ...(host.contingents || {}), [a.owner]: ((host.contingents || {})[a.owner] || 0) + a.men };
    if (!/sworn houses/.test(host.composition || '')) host.composition = `${host.composition || ''}; with the levies and knights of the sworn houses`.replace(/^; /, '');
    for (const c of Object.values(state.characters)) if (c.loc === 'army:' + a.id) c.loc = 'army:' + host.id;
    if (v.obligations) v.obligations.host = host.id;
    delete state.armies[a.id];
    if (liegeId === state.meta.player) events.push({ title: `House ${v.name} joins ${host.name}`, text: `${a.men.toLocaleString()} men under the ${v.name} banner join ${host.name}${host.at ? ` at ${state.holdings[host.at]?.name}` : ' on the march'}. The host now numbers ${host.men.toLocaleString()}.`, where: host.at || null, importance: 2, type: 'war', houses: [v.id] });
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
        if (host.owner === state.meta.player) events.push({ title: `House ${v.name} goes home`, text: `Tired of the war and of ${state.characters[state.houses[host.owner]?.lord]?.name || 'his liege'}'s command, ${state.characters[v.lord]?.name || 'the lord'} strikes his tents in the night and marches ${leave.toLocaleString()} men home.`, where: v.seat, importance: 4, type: 'war', houses: [vid] });
      }
    }
    if (host.men <= 0) delete state.armies[host.id];
  }
  return events;
}

// When the player is someone's vassal: the liege's summons arrive as a decision, and withheld dues are noticed.
function playerAsVassal(state, me, months) {
  const events = []; const ob = me.obligations = me.obligations || { tribute: 'paying', levies: 'not_called' };
  const liege = state.houses[me.liege]; const lord = state.characters[liege.lord];
  const k = [me.id, liege.id].sort().join('|');
  if (ob.tribute === 'withholding' || ob.tribute === 'late') {
    const d = (ob.tribute === 'withholding' ? 3 : 1) * months;
    state.relations[k] = { ...(state.relations[k] || {}), v: clamp(Math.round((state.relations[k]?.v ?? 0) - d), -100, 100) };
  }
  // a liege at war calls on his sworn swords
  const atWarNow = state.wars.some((w) => w.status !== 'ended' && (w.attackers.includes(liege.id) || w.defenders.includes(liege.id)));
  // no liege summons a vassal who is at war with him: that is rebellion, not service
  const rebel = state.wars.some((w) => w.status !== 'ended' && ((w.attackers.includes(me.id) && w.defenders.includes(liege.id)) || (w.defenders.includes(me.id) && w.attackers.includes(liege.id))));
  if (rebel) return events;
  if (atWarNow && (!ob.levies || ob.levies === 'not_called') && Math.random() < 0.45 * months) { ob.levies = 'called'; ob.muster = liege.seat; ob.calledDays = 0; }
  if (ob.levies === 'delayed') { ob.calledDays = (ob.calledDays || 0) + months * 30; if (ob.calledDays > 40) { ob.levies = 'called'; ob.calledDays = 0; state.relations[k] = { ...(state.relations[k] || {}), v: clamp((state.relations[k]?.v ?? 0) - 5, -100, 100) }; } }
  if (ob.levies === 'called' && !(state.decisions || []).some((d) => d.kind === 'liege_call' && d.status === 'pending')) {
    const lev = Number(me.figures.levies?.v) || 0;
    const muster = state.holdings[ob.muster || liege.seat]?.name || 'his seat';
    const r = applyChanges(state, [{ op: 'decision', title: `House ${liege.name} calls your banners`, from: liege.lord, text: `A raven with ${lord ? lord.name + "'s" : 'your liege\'s'} seal: you are commanded to muster your levies and ride for ${muster} with all haste.`, options: [
      { label: 'Answer the call', hint: `~${Math.round(lev * 0.75).toLocaleString()} men march for ${muster}; your liege is pleased`, fx: [{ call: 'answer' }] },
      { label: 'Send a token force', hint: 'A few hundred men and many excuses', fx: [{ call: 'token' }] },
      { label: 'Delay — the harvest must come in', hint: 'Your liege will not wait forever', fx: [{ call: 'delay' }] },
      { label: 'Refuse the summons', hint: 'Keep your men. Your liege will remember.', fx: [{ call: 'refuse' }] }] }]);
    const d = state.decisions.at(-1); if (d && r.applied.length) d.kind = 'liege_call';
  }
  return events;
}

/** The player's answer to a liege's summons. Returns lines describing what was done. */
export function answerCall(state, how) {
  const p = state.meta.player; const me = state.houses[p]; const liege = state.houses[me.liege]; if (!liege) return [];
  const ob = me.obligations = me.obligations || {}; const out = [];
  const k = [p, liege.id].sort().join('|');
  const rel = (d) => { state.relations[k] = { ...(state.relations[k] || {}), v: clamp((state.relations[k]?.v ?? 0) + d, -100, 100) }; out.push(`${liege.name} ${d > 0 ? '+' : ''}${d}`); };
  if (how === 'answer' || how === 'token') {
    const lev = Number(me.figures.levies?.v) || 0; const maa = Number(me.figures.menAtArms?.v) || 0;
    const men = how === 'answer' ? Math.round((lev * 0.75 + maa * 0.5) / 50) * 50 : Math.min(300, Math.round(lev * 0.15 / 50) * 50 || 50);
    const name = `Host of House ${me.name}`;
    const heir = Object.values(state.characters).find((c) => c.alive && c.house === p && c.status === 'free' && c.age >= 16 && /heir|knight/.test((c.roles || []).join(' ')));
    applyChanges(state, [{ op: 'army_create', owner: p, name, at: me.seat, men, commander: heir?.id || me.lord, composition: `Levies of House ${me.name}${how === 'answer' && maa > 100 ? ', with knights and men-at-arms' : ''}`, status: 'marching to muster' },
      { op: 'figure', house: p, field: 'levies', delta: -Math.round(men * 0.85), source: 'Muster rolls' }]);
    const a = Object.values(state.armies).filter((x) => x.owner === p && x.name === name).at(-1);
    if (a && ob.muster && ob.muster !== me.seat) { a.march = { to: ob.muster, since: state.meta.turn }; a.dest = placePos(ob.muster, state.holdings); a.status = 'marching'; }
    ob.levies = 'answered';
    out.push(`${men.toLocaleString()} men march for ${state.holdings[ob.muster]?.name || 'the muster'}`);
    rel(how === 'answer' ? 10 : -3);
  } else if (how === 'delay') { ob.levies = 'delayed'; rel(-5); }
  else if (how === 'refuse') { ob.levies = 'refused'; rel(-20); const l = state.characters[liege.lord]; if (l) out.push(`${l.name} will not forget`); }
  return out;
}
