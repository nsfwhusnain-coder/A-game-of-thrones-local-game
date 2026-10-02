// Prompt construction for the simulation. The model is the game engine: it narrates,
// decides what every other house does, and emits structured changes that the engine applies.
import { regencyLine } from '../public/js/shared/regency.js';
import { standing, standingWord } from '../public/js/shared/standing.js';
import { dateStr, getRelation, realmTotals, vassalsOf, placeName, fmt, FIGURE_FIELDS, nearestHolding, rideOf } from '../public/js/shared/world.js';
import { partyOf } from '../public/js/engine/parties.js';
import { daysLeft } from '../public/js/engine/movement.js';
import { estimateTokens } from './llm.js';
import { describeRules } from '../public/js/shared/rules.js';
import { mindsDigest } from '../public/js/shared/psyche.js';
import { project } from '../public/js/shared/economy.js';
import { briefFor } from '../public/data/briefs.js';
import { vassalTemper } from '../public/js/shared/vassals.js';
import { temperament } from '../public/js/shared/temperament.js';

const RULES = `SIMULATION RULES
1. You are the living world of A Song of Ice and Fire (books + show lore). Stay true to characters' personalities, motives, secrets and the political realities of Westeros and Essos. Other houses act on THEIR OWN interests, not the player's.
2. The player controls only their own house, and THE PLAYER'S ORDERS ARE THE HEART OF EVERY TURN. The engine has already carried out what it can (journeys, marches, musters, banners, hiring, works, letters) with true numbers — you tell those as they happened, naming who led, how many, where, how long. What the engine refused (no gold, no men, no such place) you tell as a failure in the world: the steward's grave face, the lords' silence, open laughter if the order was absurd (a lord who tries to spend sixty million dragons he does not have is mocked in every hall). What the engine could not do (diplomacy, speeches, justice, intrigue, feasts in the story) you resolve as Westeros would: the right person does it by the right means — ravens take days, envoys ride, lords must be persuaded and answer by their nature; failure and partial success are common. Consequences ripple into later turns.
3. THE LEDGER ENGINE settles routine money and food AFTER your turn: rents and yields of each holding (driven by population, prosperity, unrest, season, sieges), vassal tribute (per each vassal's obligation status), tax policy, upkeep of armies/fleets/men-at-arms, court costs, interest and projects, with luck. So DO NOT add routine income or upkeep yourself. Instead change the CAUSES: set obligation statuses when lords refuse banners or dues, change holding prosperity/unrest/status for raids, sieges, good harvests, trade booms; start projects; change the season when the Citadel declares it. Use "figure" deltas only for extraordinary one-off sums (ransoms, plunder, bribes, loans, gifts, sellsword contracts) and for men (levies raised, men-at-arms lost). Keep numbers consistent: raising 8,000 men lowers levies ~8,000; a battle kills men on both sides.
4. The world moves even if the player does nothing: canon events may unfold (with variation as the story diverges), NPC houses scheme, marry, feud, trade and go to war. Show at least one development that does not involve the player.
5. Use exact ids from the tables for houses, characters, armies and places. You may create new characters (captains, envoys, bastards, maesters) and new armies.
6. Respect what the player learned through diplomacy chats: agreements made there should be honored or broken in character.
7. Write events in a grounded, literary chronicle voice, like a page of the books: specific names, places, numbers (how many men, who leads them, how many days), the weather, what people said. Every event answers: who did what, where, why, and what it changes.
8. The player RULES. Unless the period is shorter than two weeks, bring at least one matter of their OWN realm before them as a "decision": a petition from smallfolk, a border dispute between two of their vassals, a plea for grain, a request for justice against a knight, a marriage offer for one of their children, a vassal asking for a favour, a crime to judge. Use real vassal houses and characters. These small choices should have consequences for loyalty, unrest and prosperity.`;

// ---------------- World digest ----------------

function houseLine(state, h, player) {
  const lord = h.lord ? state.characters[h.lord] : null;
  const rel = h.id === player ? '' : ` | rel:${getRelation(state, player, h.id)}`;
  const seat = h.seat ? state.holdings[h.seat]?.name : 'landless';
  return `${h.id} | ${h.name} | seat:${seat} | liege:${h.liege || '—'} | lord:${lord ? lord.id + (lord.alive ? '' : '(dead)') : '—'}${rel}${h.status !== 'active' ? ' | ' + h.status : ''}`;
}

// Where people are and how they fare — only those away from their house's seat, or not free and well
function whereabouts(state, chars) {
  const by = new Map();
  for (const c of chars) {
    if (!c.alive) continue;
    const seat = state.houses[c.house]?.seat;
    const odd = c.status && c.status !== 'free';
    const ride = rideOf(state, c); const party = partyOf(state, c);
    if (String(c.loc) === String(seat) && !odd) continue;
    const where = ride ? `on the road to ${ride.route?.toName || placeName(state, ride.march?.to)} (now near ${placeName(state, nearestHolding(state, ride.pos))}, ~${Math.max(1, Math.round(daysLeft(ride) ?? 1))} days to go)` : party ? `with the host ${party.id}${party.at ? ` at ${placeName(state, party.at)}` : ''}` : placeName(state, c.loc);
    if (!by.has(where)) by.set(where, []);
    by.get(where).push(c.id + (odd ? ` (${c.status})` : ''));
  }
  return [...by].map(([w, ids]) => `${w}: ${ids.join(', ')}`).join('\n');
}

function figuresLine(h) {
  return FIGURE_FIELDS.map((f) => `${f}:${fmt(h.figures[f]?.v)}`).join(', ');
}

export function playerSheet(state) {
  const p = state.meta.player; const h = state.houses[p];
  const lines = [];
  lines.push(`PLAYER HOUSE: ${p} — House ${h.name}${h.title ? ', ' + h.title : ''}. Words: "${h.words}". Seat: ${h.seat ? state.holdings[h.seat].name : 'none'}. Liege: ${h.liege || 'none'}.`);
  const lord = h.lord ? state.characters[h.lord] : null;
  lines.push(`Head of house (the player acts as them): ${lord ? `${lord.name} (${lord.id})` : 'unknown'}.`);
  // who truly holds the seal, and how the house stands — both are the engine's word, not the story's
  const rg = regencyLine(state, p);
  if (rg) lines.push(`REGENCY: ${rg} The player acts as the regent. Bannermen obey a regent slowly and grudgingly; rivals within the house circle.`);
  const st = standing(state, p);
  if (st) lines.push(`Standing of the house: ${st.score}/100 — ${standingWord(st)} (lands ${st.lands}, swords ${st.might}, gold ${st.wealth}, sway ${st.sway}, blood ${st.blood}, good order ${st.order}).`);
  if (state.meta.turn < 3) { const b = briefFor(h, state); lines.push(`House situation: ${b.situation} Strengths: ${b.strengths.join('; ')}. Weaknesses: ${b.weaknesses.join('; ')}.`); }
  lines.push(`Known figures (as last reported): ${figuresLine(h)}`);
  const pr = project(state, p);
  if (pr) lines.push(`Steward's projection per moon: income ~${fmt(pr.income)} (own lands ${fmt(pr.own)}, tribute ${fmt(pr.tribute)}), expenses ~${fmt(pr.expenses)} (hosts ${fmt(pr.upkeep)}, household ${fmt(pr.household)}, court ${fmt(pr.court)}, interest ${fmt(pr.interest)}, projects ${fmt(pr.projects)}, owed to liege ${fmt(pr.owed)}) → net ${fmt(pr.low)} to ${fmt(pr.high)}. Tax policy: ${h.policy?.tax || 'normal'}.`);
  const projs = (state.projects || []).filter((x) => x.house === p && x.status === 'active');
  if (projs.length) lines.push('Works under way: ' + projs.map((x) => `${x.name} (${Math.round(x.monthsLeft * 10) / 10} moons left)`).join('; '));
  const vas = vassalsOf(state, p);
  if (vas.length) {
    lines.push('Sworn vassals:');
    for (const v of vas) { const vh = state.houses[v]; const lordC = vh.lord ? state.characters[vh.lord] : null; lines.push(`  ${houseLine(state, vh, p)} | tribute:${vh.obligations?.tribute} levies:${vh.obligations?.levies} | lord loyalty ${lordC?.loyalty ?? '?'} temper ${vassalTemper(state, v)} | ${figuresLine(vh)}`); }
    const t = realmTotals(state, p);
    lines.push(`Realm totals (house + vassals): levies ${fmt(t.levies)}, men-at-arms ${fmt(t.menAtArms)}, ships ${fmt(t.ships)}, treasury ${fmt(t.treasury)}`);
  }
  const holdings = Object.values(state.holdings).filter((x) => x.owner === p);
  lines.push('Holdings: ' + holdings.map((x) => `${x.id} (${x.status}, unrest ${x.unrest}, prosperity ${x.prosperity}${x.garrison != null ? ', garrison ' + x.garrison : ''})`).join('; '));
  const chars = Object.values(state.characters).filter((c) => c.house === p && c.alive);
  lines.push('Members & retainers: ' + chars.map((c) => `${c.name} [${c.id}]${c.status !== 'free' ? ' (' + c.status + ')' : ''} @${placeName(state, c.loc)}`).join('; '));
  const minds = mindsDigest(state, p);
  if (minds) lines.push(minds);
  const live = describeRules(state, p);
  if (live.length) lines.push('CUSTOMS OF THIS REALM that you yourself wrote into the world (they are settled every moon; honour them in the story, change or end them when the story says so):\n' + live.map((x) => '  ' + x).join('\n'));
  const letters = (state.ravens || []).slice(0, 5);
  if (letters.length) lines.push('Letters the player has received recently:\n' + letters.map((r) => `  [${r.date}] from ${r.fromName}: ${r.text}`).join('\n'));
  const pending = (state.decisions || []).filter((d) => d.status === 'pending');
  if (pending.length) lines.push('Decisions the player has NOT answered (treat silence as delay or refusal, and let those who asked react): ' + pending.map((d) => `${d.title} (asked ${d.date})`).join('; '));
  const decided = (state.decisions || []).filter((d) => d.status === 'decided' && d.decidedTurn === state.meta.turn);
  if (decided.length) lines.push('DECISIONS THE PLAYER MADE THIS TURN (binding — resolve their consequences):\n' + decided.map((d) => `  ${d.title}: chose "${d.choice}"${d.note ? ' — ' + d.note : ''}`).join('\n'));
  return lines.join('\n');
}

// The memory the model is given: the chronicle (long-term, consolidated) and a compact log of recent turns —
// one line per event, the orders given and decisions made — rather than whole summaries, which repeat the events.
export function memoryBlock(state, chronicleMd, budgetTokens, keepRecent) {
  const out = [];
  if (chronicleMd && chronicleMd.trim()) out.push('THE CHRONICLE (long-term memory: the past as it stood on the dates written. Where it differs from WHERE PEOPLE ARE and the present state, the present is true — a journey "under way" then may be over now. "Said, not confirmed" is rumour, not fact.)\n' + chronicleWithin(chronicleMd, Math.min(CHRONICLE_CAP, Math.floor(budgetTokens * 0.5))));
  const recent = state.history.filter((t) => t.turn > state.consolidatedThrough).slice(-Math.max(keepRecent, 14));
  // one line per event that mattered; append-only, so the model server's cache holds from turn to turn
  if (recent.length) out.push('RECENT TURNS (compact log: day of the period, place, what happened)\n' + trimToTokens(recent.map((t) => turnLog(state, t, { minImp: 2 })).join('\n\n'), Math.floor(budgetTokens * 0.5), true));
  return out.join('\n\n');
}

// One turn as a few dense lines (shared with the save's world-log.md)
// The chronicle is kept whole up to a cap; past that, its oldest sections go first (cut at section boundaries so
// that it changes rarely and the model server's cache survives). The engine's own state still holds every fact.
const CHRONICLE_CAP = 3000;
function chronicleWithin(md, tokens) {
  if (estimateTokens(md) <= tokens) return md;
  const secs = md.split(/\n(?=##+ )/); const head = secs.shift();
  const keep = []; let used = estimateTokens(head);
  for (let i = secs.length - 1; i >= 0; i--) { const n = estimateTokens(secs[i]); if (used + n > tokens) break; keep.unshift(secs[i]); used += n; }
  return head + (keep.length < secs.length ? '\n(… older entries omitted; the facts they record are in the tables above)\n' : '\n') + keep.join('\n');
}

export function turnLog(state, t, { all = false, minImp = 2 } = {}) {
  const lines = [`== Turn ${t.turn} (${t.dateFrom} → ${t.date}) ==`];
  const orders = (t.orders || []).map((o) => o.text).filter((x) => !/^DECISION — /.test(x));
  lines.push(`Orders: ${orders.join(' | ') || '(none)'}`);
  const decided = (t.orders || []).map((o) => o.text).filter((x) => /^DECISION — /.test(x)).map((x) => x.replace(/^DECISION — /, ''));
  if (decided.length) lines.push(`Decisions: ${decided.join(' | ')}`);
  const place = (w) => (w ? placeName(state, w) : '');
  const main = (t.events || []).filter((e) => !e.bg && (all || e.importance >= minImp));
  for (const e of main) lines.push(`- d${e.day || '?'} ${place(e.where) ? place(e.where) + ': ' : ''}${e.title} — ${e.text}`);
  const bg = (t.events || []).filter((e) => e.bg && (all || e.mine || e.importance >= 2));
  if (bg.length) lines.push(`Meanwhile: ${bg.map((e) => `${e.title} (${place(e.where)})`).join('; ')}`);
  return lines.join('\n');
}

function trimToTokens(s, tokens, keepEnd = false) {
  const maxChars = Math.max(200, Math.floor(tokens * 3.6));
  if (s.length <= maxChars) return s;
  return keepEnd ? '…' + s.slice(s.length - maxChars) : s.slice(0, maxChars) + '…';
}

// ---------------- Prompt builders ----------------

/** The suggestions a model gave, as lines of text: a model that answers with objects ({ "text": … }) gave "[object Object]" (bug hunt TX8). */
export function suggestionsOf(obj, text) {
  const line = (x) => (typeof x === 'string' ? x : x && typeof x === 'object' ? x.text ?? x.suggestion ?? x.order ?? x.action ?? x.title ?? '' : x == null ? '' : String(x));
  const list = Array.isArray(obj?.suggestions) ? obj.suggestions : String(text || '').split('\n').filter((l) => l.trim());
  return list.map((x) => String(line(x)).replace(/^\s*(?:[-*•]|\d+[.)])\s*/, '').trim()).filter(Boolean).slice(0, 7);
}

export function buildSuggestPrompt(state, chronicleMd, cfg) {
  const system = 'You are the trusted advisor of the player\'s house in a grand strategy game set in A Song of Ice and Fire. Suggest bold but plausible orders. Reply ONLY with JSON: {"suggestions":["order 1","order 2",...]} — 5 to 7 concrete one-sentence orders written as the lord would dictate them.';
  const user = [playerSheet(state), memoryBlock(state, chronicleMd, 3000, 2), `DATE: ${dateStr(state.meta.date)}`, 'What should we do next?'].join('\n\n');
  return [{ role: 'system', content: system }, { role: 'user', content: user }];
}
