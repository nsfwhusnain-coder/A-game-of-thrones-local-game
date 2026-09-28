// The temper of the vassals: loyalty and friendship decide whether dues arrive and banners answer.
// The simulator can override any of this by changing obligations itself; the engine fills in when it doesn't.
import { unitsOf, addUnits } from './units.js';
import { applyChanges, placePos, getRelation, rideOf, sendHome } from './world.js';
import { ref, isRef, joinParty, moveMembers, membersOf, disband, settle, isForce, sworn } from '../engine/parties.js';
import { marchDays, atWar } from './warfare.js';
import { incapacity } from './regency.js';
import { pronouns, isFemale } from './people.js';
import { needsShips } from './sea.js';
import { random } from '../engine/rng.js';
import { fact, shown } from '../engine/facts/log.js';
import { answer, joined, gathering } from '../engine/military/muster.js';
import { foldTrain } from '../engine/military/supply.js';

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
  // men obey a lord, not a seal: a regent, a child or a captive liege is served slowly and grudgingly
  const why = incapacity(state, liege);
  if (why) t -= why.kind === 'minority' ? 7 : 11;
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
      const r = random(); let next = ob.tribute;
      if (ob.tribute === 'paying' && t < 32 && r < 0.3 * months) next = 'late';
      else if (ob.tribute === 'late' && t < 20 && r < 0.25 * months) next = 'withholding';
      else if (ob.tribute === 'late' && t >= 50 && r < 0.4 * months) next = 'paying';
      else if (ob.tribute === 'withholding' && t >= 42 && r < 0.25 * months) next = 'late';
      if (next !== ob.tribute) {
        ob.tribute = next;
        const text = next === 'paying' ? `House ${v.name} pays its dues to House ${liege.name} in full again.` : next === 'late' ? `House ${v.name}'s dues to House ${liege.name} are late. Excuses come by raven.` : `House ${v.name} withholds its dues from House ${liege.name} outright.`;
        applied.push({ op: 'obligation', text });
        events.push(...shown(mine, fact(state, 'tax_changed', { title: next === 'paying' ? `House ${v.name} pays again` : `House ${v.name} ${next === 'late' ? 'is late with its dues' : 'withholds its dues'}`, text, where: v.seat, importance: next === 'withholding' ? 3 : 2, type: 'economy', houses: [v.id] }, { actors: [v.lord], data: { dues: next } })));
      }
    }
    // --- the banners: each lord's answer runs a day at a time (engine/military/muster.js musterTick) ---
  }
  events.push(...unrestTick(state, days), ...rebellionTick(state, days));
  return { applied, events };
}

// Smallfolk rise when unrest runs too high for too long
function unrestTick(state, days) {
  const events = []; const months = days / 30; const p = state.meta.player;
  for (const h of Object.values(state.holdings)) {
    if (h.status === 'rising') { h.unrest = Math.max(h.unrest, 85); continue; }
    if ((h.unrest || 0) < 85 || (h.status && h.status !== 'normal') || random() >= 0.35 * months) continue;
    h.status = 'rising';
    if (h.owner !== p) { if (random() < 0.5) { h.status = 'normal'; h.unrest -= 20; } continue; } // the story handles other lords' troubles
    const cost = Math.round(h.population * 0.01 / 50) * 50 + 500;
    applyChanges(state, [{ op: 'decision', title: `The smallfolk rise at ${h.name}`, from: null, text: `Hunger, taxes and lawlessness have driven the smallfolk of ${h.name} to arms. They have burned a tithe barn and hanged a tax collector, and they will not disperse.`, options: [
      { label: 'Crush the rising', hint: 'Your men-at-arms ride out. It will be bloody, and it will be remembered.', fx: [{ rising: [h.id, 'crush'] }] },
      { label: 'Hear their grievances', hint: `~${cost.toLocaleString()} dragons in grain and remitted rents`, fx: [{ rising: [h.id, 'grant', cost] }] },
      { label: 'Hang the ringleaders, pardon the rest', hint: 'A middle course', fx: [{ rising: [h.id, 'hang'] }] },
      { label: 'Let it burn itself out', hint: 'It may spread', fx: [{ rising: [h.id, 'ignore'] }] }] }]);
    events.push(fact(state, 'rising', { title: `Rising at ${h.name}`, text: `The smallfolk of ${h.name} are up in arms.`, where: h.id, importance: 4, type: 'court', houses: [p] }, { data: { holding: h.id } }));
  }
  return events;
}

/** The player's answer to a rising. */
export function answerRising(state, [hid, how, cost]) {
  const h = state.holdings[hid]; if (!h) return []; const p = state.meta.player; const me = state.houses[p]; const out = [];
  const maa = Number(me.figures.menAtArms?.v) || 0;
  if (how === 'crush') {
    h.status = 'normal'; h.unrest = Math.max(0, h.unrest - 45); h.population = Math.round(h.population * 0.96); h.prosperity = Math.max(0, h.prosperity - 6);
    me.figures.menAtArms = { ...me.figures.menAtArms, v: Math.max(0, maa - Math.round(20 + random() * 60)) };
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
    if (random() < 0.4) { h.status = 'normal'; h.unrest -= 25; out.push(`${h.name}: the rising burns itself out`); }
  }
  return out;
}

// A vassal whose temper collapses stops paying, stops answering — and may rise
function rebellionTick(state, days) {
  const events = []; const months = days / 30; const p = state.meta.player;
  for (const v of Object.values(state.houses)) {
    if (v.liege !== p || !v.lord || !state.characters[v.lord]?.alive || v.rebel) continue;
    const t = vassalTemper(state, v.id);
    if (t >= 14 || v.obligations?.tribute !== 'withholding' || random() >= 0.2 * months) continue;
    v.rebel = true;
    const lord = state.characters[v.lord];
    applyChanges(state, [{ op: 'decision', title: `House ${v.name} defies you`, from: v.lord, text: `${lord.name} has closed the gates of ${state.holdings[v.seat]?.name || `${pronouns(lord).his} seat`}, turned away your envoy and declared that House ${v.name} owes you nothing. Other lords are watching to see what you do.`, options: [
      { label: 'Declare them traitors and march', hint: 'War. Every lord will see the price of defiance.', fx: [{ rebel: [v.id, 'war'] }] },
      { label: 'Offer terms', hint: 'Forgive their dues and hear their grievances. Some will call it weakness.', fx: [{ rebel: [v.id, 'terms'] }] },
      { label: 'Release them from their oaths', hint: 'Let them go. Your realm shrinks.', fx: [{ rebel: [v.id, 'release'] }] }] }]);
    events.push(fact(state, 'fealty_renounced', { title: `House ${v.name} defies House ${state.houses[v.liege]?.name}`, text: `${lord.name} refuses the authority of House ${state.houses[v.liege]?.name}.`, where: v.seat, importance: 5, type: 'war', houses: [v.id] }, { actors: [v.lord], data: { from: v.liege } }));
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

/** Hosts that have reached their muster point join their liege's host there: one army on the map, many banners in it.
 *  A call to the banners names the host the lords are to join (`obligations.join`). Late banners join THAT host wherever
 *  it has gone — marched on, or arrived somewhere else — so a muster never leaves an orphan host behind at the muster
 *  point (the "they all muster up and stay there" bug). */
export function gatherMusters(state) {
  const events = [];
  const dist = (x, y) => Math.hypot(x.pos[0] - y.pos[0], x.pos[1] - y.pos[1]);
  // in the order they arrived, so the host grows day by day as the news says
  for (const a of Object.values(state.parties).sort((x, y) => (x.arriveDay || 99) - (y.arriveDay || 99))) {
    if (!a.serving || a.kind === 'fleet' || !state.parties[a.id]) continue;
    const v = state.houses[a.owner]; const liegeId = a.serving; const liege = state.houses[liegeId];
    if (!v || !liege) continue;
    // a lord's levies still gathering at his seat stay there until they set out (engine/military/muster.js)
    if (gathering(state, v) && v.obligations.host === a.id) continue;
    const ob = v.obligations || {};
    const field = (x) => x.owner === liegeId && isForce(x) && !['fleet', 'garrison'].includes(x.kind) && x.id !== a.id;
    let host = null;
    // the host this lord was called to join, wherever it is now
    const grand = ob.join && state.parties[ob.join] && field(state.parties[ob.join]) ? state.parties[ob.join] : null;
    if (grand) {
      if (dist(grand, a) >= 4) {
        if (String(a.march?.to) !== ref(grand.id)) { a.march = { to: ref(grand.id), since: state.meta.turn }; a.at = null; settle(state, a); }
        continue;
      }
      host = grand;
    } else {
      // no host named yet (or it is gone): the old rule — the liege's great host if it is here, else the one at the muster
      const main = Object.values(state.parties).filter(field).sort((x, y) => y.men - x.men)[0];
      const near = main && dist(main, a) < 4;
      if (main && !near && a.at && !main.at && main.march && (!ob.muster || a.at === ob.muster)) { a.march = { to: ref(main.id), since: state.meta.turn }; a.at = null; settle(state, a); continue; }
      if (!near && (a.march || !a.at || (ob.muster && a.at !== ob.muster))) continue;
      host = near ? main : Object.values(state.parties).find((x) => field(x) && x.at === a.at);
    }
    if (!host) {
      const id = `${liegeId}_banners_${a.at}`.replace(/[^a-z0-9_]/g, '');
      host = state.parties[id] = { id, owner: liegeId, name: `The Banners of ${liege.name}`, commander: a.commander, at: a.at, pos: [...a.pos], men: 0, kind: 'host', members: [], composition: 'Levies and knights of the sworn houses', morale: a.morale ?? 70, supply: a.supply ?? 80, asOf: a.asOf };
    }
    // from now on every lord called to this muster joins this host, wherever it goes
    if (ob.muster) for (const o of Object.values(state.houses)) if (o.liege === liegeId && o.obligations?.muster === ob.muster && !(o.obligations.join && state.parties[o.obligations.join])) o.obligations.join = host.id;
    host.units = addUnits(unitsOf(state, host), unitsOf(state, a));
    const total = host.men + a.men;
    host.morale = Math.round(((host.morale ?? 70) * host.men + (a.morale ?? 70) * a.men) / Math.max(1, total));
    foldTrain(state, host, a); // the banners bring their own wagons and bread
    host.supply = Math.round(((host.supply ?? 80) * host.men + (a.supply ?? 80) * a.men) / Math.max(1, total));
    host.men = total;
    host.contingents = { ...(host.contingents || {}), [a.owner]: ((host.contingents || {})[a.owner] || 0) + a.men };
    if (!/sworn houses/.test(host.composition || '')) host.composition = `${host.composition || ''}; with the levies and knights of the sworn houses`.replace(/^; /, '');
    moveMembers(state, a, host);
    if (v.obligations) { v.obligations.host = host.id; joined(state, v); }
    delete state.parties[a.id]; settle(state, host);
    events.push(...shown(liegeId === state.meta.player, fact(state, 'host_joined', { ...(a.arriveDay ? { day: a.arriveDay } : {}), title: `House ${v.name} joins ${host.name}`, text: `${a.men.toLocaleString()} men under the ${v.name} banner join ${host.name}${host.at ? ` at ${state.holdings[host.at]?.name}` : ' on the march'}. The host now numbers ${host.men.toLocaleString()}.`, where: host.at || null, importance: 2, type: 'war', houses: [v.id, liegeId] }, { actors: [v.lord], data: { party: a.id, host: host.id, men: a.men } })));
  }
  return events;
}

/**
 * A sworn house answers its liege's summons now (the verb answer_call, a mind's choice, a matter answered): its levies
 * begin to gather at its seat as a host serving the liege, and set out when gathered (engine/military/muster.js).
 * Returns { applied, events, men, party, text }.
 */
export function raiseForLiege(state, v, { mine = v.liege === state.meta.player, cause = { type: 'rule', ref: 'the call' } } = {}) {
  return answer(state, v, { mine, cause });
}

/** Lords in the field grow restless; the disloyal take their men home. Call once per turn with the days elapsed. */
export function fieldService(state, days) {
  const events = []; const months = days / 30;
  const autumn = state.world?.season === 'autumn';
  for (const host of Object.values(state.parties)) {
    if (!host.contingents) continue;
    for (const [vid, men] of sworn(host)) {
      const v = state.houses[vid]; if (!v || v.liege !== host.owner) { continue; }
      const k = [vid, host.owner].sort().join('|');
      const drift = (autumn ? 2.5 : 1.2) * months * (['besieging', 'camped', 'mustering'].includes(host.state) || host.kind === 'garrison' ? 1.3 : 0.8);
      state.relations[k] = { ...(state.relations[k] || {}), v: clamp(Math.round((state.relations[k]?.v ?? 0) - drift), -100, 100) };
      const t = vassalTemper(state, vid);
      if (t < 22 && random() < 0.5 * months) {
        const leave = Math.min(men, host.men);
        host.men -= leave; delete host.contingents[vid];
        const lev = v.figures.levies = v.figures.levies || { v: 0 };
        lev.v = (Number(lev.v) || 0) + Math.round(leave * 0.9);
        v.obligations = { ...(v.obligations || {}), levies: 'refused' }; delete v.obligations.host;
        for (const c of membersOf(state, host)) if (c.house === vid) sendHome(state, c, v.seat);
        events.push(...shown(host.owner === state.meta.player, fact(state, 'desertion', { title: `House ${v.name} goes home`, text: `Tired of the war and of ${state.characters[state.houses[host.owner]?.lord]?.name || `${pronouns(state.characters[v.lord]).his} liege`}'s command, ${state.characters[v.lord]?.name || 'the lord'} strikes ${pronouns(state.characters[v.lord]).his} tents in the night and marches ${leave.toLocaleString()} men home.`, where: v.seat, importance: 4, type: 'war', houses: [vid, host.owner] }, { actors: [v.lord], data: { host: host.id, men: leave } })));
      }
    }
    if (host.men <= 0) disband(state, host);
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
  if (atWarNow && (!ob.levies || ob.levies === 'not_called') && random() < 0.45 * months) { ob.levies = 'called'; ob.muster = liege.seat; ob.calledDays = 0; }
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
    const a = Object.values(state.parties).filter((x) => x.owner === p && x.name === name).at(-1);
    if (a && ob.muster && ob.muster !== me.seat) { a.march = { to: ob.muster, since: state.meta.turn }; settle(state, a); }
    ob.levies = 'answered';
    out.push(`${men.toLocaleString()} men march for ${state.holdings[ob.muster]?.name || 'the muster'}`);
    rel(how === 'answer' ? 10 : -3);
  } else if (how === 'delay') { ob.levies = 'delayed'; rel(-5); }
  else if (how === 'refuse') { ob.levies = 'refused'; rel(-20); const l = state.characters[liege.lord]; if (l) out.push(`${l.name} will not forget`); }
  return out;
}
