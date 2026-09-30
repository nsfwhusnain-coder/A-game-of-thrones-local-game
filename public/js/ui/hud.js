// The quiet screen's logic (docs/gdd/17-ui-declutter.md §2, WP U1–U3): what the top bar's three vitals say, what waits in the one Inbox,
// what the headline strip shows, what the End-turn plate promises, and which key opens which door. Pure functions of the state (or the
// turn records) — no DOM, no clock, no dice — so node can test them on real games and the browser draws them (app.js, ui/strip.js).
import { project, SEASONS } from '../shared/economy.js';
import { nextTurnLength } from '../shared/turns.js';
import { supplyOf } from '../engine/military/supply.js';

const n0 = (x) => Math.round(Number(x) || 0).toLocaleString('en-GB');
const signed = (x) => `${x >= 0 ? '+' : '−'}${n0(Math.abs(x))}`;
const sign = (x) => (x > 0 ? 'up' : x < 0 ? 'down' : 'steady');
const ROUND1 = (x) => Math.round((Number(x) || 0) * 10) / 10;

/**
 * The three numbers a lord can lose the game on: Coin, Men and Food — each with its plain value, an arrow, whether it is a warning, the
 * label a screen reader reads and the sentence the hover says. Coin's arrow is the sign of the moon's net (the steward's projection);
 * Men counts levies, men-at-arms and the men of the hosts the house has raised (not the guard, not the garrisons); Food's arrow follows the
 * last two ledger entries.
 */
export function vitalsOf(state, me = state.meta.player) {
  const h = state.houses[me]; const f = h.figures || {};
  const pr = project(state, me);
  // coin
  const treasury = Number(f.treasury?.v) || 0; const debt = Number(f.debt?.v) || 0;
  const coin = {
    key: 'coin', value: treasury, trend: sign(pr.net), warn: pr.net < 0 && treasury < 3 * pr.expenses,
    label: `Coin: ${n0(treasury)} dragons, ${pr.net > 0 ? 'rising' : pr.net < 0 ? 'falling' : 'steady'}`,
    hover: `Gold dragons in your coffers: ${n0(treasury)}.\nYour steward reckons the moon at ${signed(pr.low)} to ${signed(pr.high)} dragons a moon, about ${signed(pr.net)} — luck, the harvest and loyal vassals decide the real sum.${debt ? `\nDebts: ${n0(debt)}.` : ''}`,
  };
  // men
  const hosts = Object.values(state.parties || {}).filter((a) => a.owner === me && a.kind === 'host');
  const hostMen = hosts.reduce((s, a) => s + (Number(a.men) || 0), 0);
  const levies = Number(f.levies?.v) || 0; const arms = Number(f.menAtArms?.v) || 0;
  const mustering = hosts.some((a) => a.muster?.remaining > 0);
  const men = {
    key: 'men', value: levies + arms + hostMen, trend: mustering ? 'up' : 'steady', warn: false,
    label: `Men: ${n0(levies + arms + hostMen)}${mustering ? ', gathering' : ''}`,
    hover: `Every sword your house can put in the field: levies ${n0(levies)}, men-at-arms ${n0(arms)}, and ${n0(hostMen)} in the hosts you have raised. The household guard and the garrisons are not counted.${mustering ? '\nA levy camp is filling from the fields.' : ''}`,
  };
  // food
  const moons = ROUND1(f.food?.v);
  const led = (h.ledger || []).filter((x) => Number.isFinite(Number(x.food)));
  const dFood = led.length >= 2 ? Number(led.at(-1).food) - Number(led.at(-2).food) : 0;
  const rations = hosts.map((a) => ({ a, sp: supplyOf(state, a) })).filter((x) => x.sp.days != null);
  const food = {
    key: 'food', value: moons, trend: sign(dFood), warn: moons < 4,
    label: `Food: ${moons} moons of stores${moons < 4 ? ', running low' : ''}`,
    hover: `Moons of stores in your granaries: ${moons}. Winter will empty them.${rations.map(({ a, sp }) => `\n${a.name}: ${sp.word === 'starving' ? 'starving' : `${Math.floor(sp.days)} days of rations`}`).join('')}`,
  };
  return [coin, men, food];
}

/** The season, for the icon beside the date: { icon, label, note }. */
export function seasonOf(state) {
  const key = state.world?.season || 'summer'; const S = SEASONS[key] || SEASONS.summer;
  return { key, icon: { summer: 'sun', autumn: 'leaf', winter: 'snow', spring: 'sprout' }[key] || 'sun', label: S.label, note: state.world?.seasonNote || S.note };
}

/**
 * Everything that waits on the lord's word, in one list: unread letters, matters awaiting an answer, and audiences the other party has
 * spoken in this turn and not closed. `count` is the list's length — the one number on the wax seal.
 */
export function inboxOf(state, me = state.meta.player) {
  const items = [];
  for (const r of state.ravens || []) if (!r.read) items.push({ kind: 'letter', id: r.id, title: `A raven from ${r.fromName || 'afar'}`, text: r.text, day: r.day });
  for (const d of state.decisions || []) if (d.status === 'pending') items.push({ kind: 'matter', id: d.id, title: d.title, text: d.text, day: d.day, days: d.days });
  const T = state.meta.turn;
  for (const [cid, chat] of Object.entries(state.chats || {})) {
    if (cid.startsWith('council:') || !Array.isArray(chat) || !chat.length) continue;
    const last = chat.at(-1); const mood = state.moods?.[cid];
    if (last.role !== 'npc' || (last.turn ?? -1) < T || mood?.closed) continue;
    items.push({ kind: 'audience', id: cid, title: `${state.characters?.[cid]?.name || 'A lord'} awaits your answer`, text: String(last.text || '').slice(0, 140) });
  }
  return { count: items.length, items };
}

/** The three doors (GDD 17 §2.2): what each is called, what it is for, its key and its icon. Economy and Military are not doors any more. */
export const MENU = [
  { id: 'realm', key: 'r', label: 'Realm', hint: 'How your house stands', icon: 'crown' },
  { id: 'people', key: 'p', label: 'People', hint: 'Family, court and guests', icon: 'weirwood' },
  { id: 'chronicle', key: 'h', label: 'Chronicle', hint: 'All that has happened', icon: 'scroll' },
];
// the old hotkeys, which keep working: they land on the section of a door (until the ledger's tabs of R4 take them over)
const KEYS = { r: { open: 'realm' }, p: { open: 'people' }, h: { open: 'chronicle' }, m: { open: 'realm', section: 'wars' }, e: { open: 'realm', section: 'economy' }, d: { open: 'realm', section: 'houses' }, c: { open: 'people', section: 'council' }, i: { open: 'people', section: 'shadows' } };
/** Where a key goes: { open, section? }, or null for every key that is not a door's (the map's own w a s, the arrows, Enter, Escape…). */
export function routeKey(key) {
  const k = String(key || '');
  if (k.length !== 1) return null;
  const r = KEYS[k.toLowerCase()];
  return r ? { ...r } : null;
}

const NEWS_FROM = { news: 2, major: 3, great: 4 }; // (rank of the tiers of engine/facts/rank.js, from "news")
const isNews = (e) => !e.bg && (e.tier ? e.tier in NEWS_FROM : (e.importance || 0) >= 3);
/**
 * The headline strip: the latest `n` events worth a line — tier news and above, or importance three for a card of the old shape — newest first
 * (the latest turn first, and in a turn the latest day, the weightier first on a day). `seen`: ids the player has looked at. Each item:
 * { id: 'turn:index', text (the headline, or an old card's title), where, unread, tier?, day }.
 */
export function stripOf(history, n = 3, seen = new Set()) {
  const out = [];
  for (const t of [...(history || [])].sort((a, b) => b.turn - a.turn)) {
    const evs = (t.events || []).map((e, i) => ({ e, i })).filter(({ e }) => isNews(e));
    evs.sort((a, b) => (b.e.day || 0) - (a.e.day || 0) || (b.e.score ?? b.e.importance ?? 0) - (a.e.score ?? a.e.importance ?? 0) || a.i - b.i);
    for (const { e, i } of evs) {
      const id = `${t.turn}:${i}`;
      out.push({ id, text: String(e.headline || e.title || '').trim(), where: e.where || null, unread: !seen.has(id), tier: e.tier || null, day: e.day || 0 });
      if (out.length >= n) return out;
    }
  }
  return out;
}

/** The End-turn plate's reason, in one line: "next: 7 days — a quiet week". */
export function turnLabel(state) {
  const u = nextTurnLength(state);
  return `next: ${u.days} ${u.days === 1 ? 'day' : 'days'} — ${u.reason}`;
}
