// Prompt construction for the simulation. The model is the game engine: it narrates,
// decides what every other house does, and emits structured changes that the engine applies.
import { threadsDigest } from '../public/js/shared/plots.js';
import { VOICES, HOUSE_WAYS } from '../public/data/voices.js';
import { SCENARIOS } from '../public/data/scenarios.js';
import {
  dateStr, getRelation, resolvePlaceId, realmOf, realmTotals, vassalsOf, placeName, fmt, FIGURE_FIELDS, SPANS,
} from '../public/js/shared/world.js';
import { estimateTokens } from './llm.js';
import { project, SEASONS } from '../public/js/shared/economy.js';
import { warRoom } from '../public/js/shared/warfare.js';
import { briefFor } from '../public/data/briefs.js';
import { vassalTemper } from '../public/js/shared/vassals.js';
import { PLACE_NAMES } from '../public/data/geography.js';
import { dispositionText } from '../public/js/shared/diplomacy.js';

const CHANGE_SCHEMA = `CHANGE OPERATIONS (use exact ids from the tables; invent new snake_case ids only for new armies/characters):
- {"op":"figure","house":ID,"field":"treasury|income|debt|levies|menAtArms|guard|ships|food","value":N or "delta":±N,"source":"who reported it"}
    treasury/debt/income in gold dragons; levies = men that could still be called; food = months of stores.
- {"op":"army_create","id":NEW_ID,"owner":HOUSE,"name":"...","commander":CHAR_ID,"at":PLACE,"men":N,"type":"army|fleet","ships":N,"composition":"...","status":"mustering"}
    (raising troops should also reduce that house's levies figure)
- {"op":"army_move","army":ARMY_ID,"to":PLACE,"progress":0.0-1.0,"status":"marching"}   progress<1 means still en route
- {"op":"army_update","army":ARMY_ID,"men":N or "delta":±N,"morale":0-100,"supply":0-100,"status":"...","owner":HOUSE}
- {"op":"army_destroy","army":ARMY_ID,"reason":"..."}  /  {"op":"army_disband","army":ARMY_ID}
- {"op":"holding","id":PLACE,"owner":HOUSE,"unrest":0-100,"prosperity":0-100,"garrison":N,"status":"normal|besieged|sacked|burning|occupied","note":"..."}
- {"op":"character","id":CHAR_ID,"alive":false,"cause":"...","loc":PLACE (or "with":ARMY_ID to travel with a host),"title":"...","status":"free|imprisoned|hostage|missing|exiled|wounded","opinion":-100..100 (of the player),"loyalty":-100..100 (to their liege),"note":"what they now remember","revealSecret":true (the PLAYER learns this character's secret),"secret":"a new secret they now hide"}
- {"op":"character_new","id":NEW_ID,"name":"...","house":HOUSE,"title":"...","age":N,"loc":PLACE,"roles":["captain"],"traits":"...","bio":"..."}
- {"op":"relation","a":HOUSE,"b":HOUSE,"delta":±N,"reason":"..."}
- {"op":"liege","house":HOUSE,"liege":HOUSE or null}   (vassal changes allegiance / declares independence)
- {"op":"house_update","house":HOUSE,"lord":CHAR_ID,"title":"...","realmName":"...","note":"..."}
- {"op":"war","status":"start","name":"...","attackers":[HOUSE],"defenders":[HOUSE],"reason":"..."}  /  {"op":"war","status":"end","name":"...","outcome":"..."}
- {"op":"war_join","war":"war name or id","house":HOUSE,"side":"attacker|defender"}
- {"op":"pact","type":"alliance|trade|embargo|marriage|truce|non_aggression|loan|vassalage","a":HOUSE,"b":HOUSE,"terms":"...","status":"active|pending|ended|broken"}
- {"op":"battle","name":"...","at":PLACE,"attacker":HOUSE,"defender":HOUSE,"victor":HOUSE,"losses":{"HOUSE":N},"summary":"..."}
- {"op":"raven","from":CHAR_ID,"text":"a letter written in-character to the player"}
- {"op":"obligation","house":VASSAL_HOUSE,"tribute":"paying|late|withholding","levies":"not_called|called|answered|delayed|refused","reason":"..."}
    (how a vassal answers its liege: THIS is how a lord refuses the banners or stops paying — the ledger engine then excludes their gold/men)
- {"op":"tax","house":HOUSE,"level":"low|normal|high|crushing"}
- {"op":"project","house":HOUSE,"name":"...","cost":N,"months":N,"holding":PLACE,"effect":{"figures":{"ships":20},"prosperity":5,"fort":1,"building":"...","unrest":-10}}  / {"op":"project","house":HOUSE,"name":"...","status":"cancel"}
- {"op":"season","season":"summer|autumn|winter|spring","note":"white ravens from the Citadel..."}
- {"op":"wed","a":CHAR_ID,"b":CHAR_ID}  /  {"op":"betroth","a":CHAR_ID,"b":CHAR_ID}
- {"op":"holding",...also "population":N,"fort":0-6,"building":"...","resource":{"type":"grain|gold|trade|...","delta":±0.5},"name":"a new name (a place renamed by its new lord)","status":"ruined" (burned to the ground; the map shows a ruin)}
- {"op":"holding_new","name":"...","owner":HOUSE,"near":PLACE (or "at":PLACE),"type":"castle|town|camp|fortress","note":"why it was raised"}   (a new castle, town or war camp appears on the map)
- {"op":"landmark","name":"The Battle of the Whispering Wood","at":PLACE,"kind":"battle|camp|grave|site","note":"..."}   (marks a place on the map where something memorable happened; "remove":true clears it)
- {"op":"decision","title":"...","text":"the situation, 1-3 sentences","from":CHAR_ID,"options":[{"label":"Accept the King's offer","hint":"likely consequences"},{"label":"...","hint":"..."}]}
    (put a real choice before the PLAYER when a character or event demands their answer: an offer, a demand, a crisis, a judgement. 2-4 options, each plausible. The player's choice arrives as an order next turn.)
- {"op":"chronicle","text":"one line recording a truly significant, lasting fact (deaths of great lords, wars, crowns, betrayals)"}`;

// Compact schema for conversations (small models drown in the full list)
const TALK_SCHEMA = `OPTIONAL CHANGES your words cause (only when something concrete happens):
- {"op":"figure","house":ID,"field":"treasury|levies|menAtArms|ships|food","value":N,"source":"your name"}   (reporting a fresh count)
- {"op":"character","id":YOUR_ID,"opinion":-100..100,"note":"what you will remember"}
- {"op":"relation","a":HOUSE,"b":HOUSE,"delta":±N,"reason":"..."}
- {"op":"pact","type":"alliance|trade|marriage|truce|loan","a":HOUSE,"b":HOUSE,"terms":"...","status":"active"}   (only if you firmly agree)
- {"op":"obligation","house":YOUR_HOUSE,"tribute":"paying|late|withholding","levies":"answered|delayed|refused"}   (a vassal answering the call)
- {"op":"decision","title":"...","text":"...","from":YOUR_ID,"options":[{"label":"..."},{"label":"..."}]}   (when you demand an answer)`;

const RULES = `SIMULATION RULES
1. You are the living world of A Song of Ice and Fire (books + show lore). Stay true to characters' personalities, motives, secrets and the political realities of Westeros and Essos. Other houses act on THEIR OWN interests, not the player's.
2. The player controls only their own house. Their orders are INTENTIONS, not guaranteed outcomes. Resolve them plausibly: travel takes time (a host marches ~15-25 miles/day; the realm is ~3,000 miles long; a raven flies Winterfell→King's Landing in days), gold must exist to be spent, lords may refuse, delay, bargain or betray. Failure and partial success are common. Consequences ripple.
3. THE LEDGER ENGINE settles routine money and food AFTER your turn: rents and yields of each holding (driven by population, prosperity, unrest, season, sieges), vassal tribute (per each vassal's obligation status), tax policy, upkeep of armies/fleets/men-at-arms, court costs, interest and projects, with luck. So DO NOT add routine income or upkeep yourself. Instead change the CAUSES: set obligation statuses when lords refuse banners or dues, change holding prosperity/unrest/status for raids, sieges, good harvests, trade booms; start projects; change the season when the Citadel declares it. Use "figure" deltas only for extraordinary one-off sums (ransoms, plunder, bribes, loans, gifts, sellsword contracts) and for men (levies raised, men-at-arms lost). Keep numbers consistent: raising 8,000 men lowers levies ~8,000; a battle kills men on both sides.
4. The world moves even if the player does nothing: canon events may unfold (with variation as the story diverges), NPC houses scheme, marry, feud, trade and go to war. Show at least one development that does not involve the player.
5. Use exact ids from the tables for houses, characters, armies and places. You may create new characters (captains, envoys, bastards, maesters) and new armies.
6. Respect what the player learned through diplomacy chats: agreements made there should be honored or broken in character.
7. Write events in a grounded, literary chronicle voice. Be specific: names, places, numbers, weather, rumours.
8. The player RULES. Unless the period is shorter than two weeks, bring at least one matter of their OWN realm before them as a "decision": a petition from smallfolk, a border dispute between two of their vassals, a plea for grain, a request for justice against a knight, a marriage offer for one of their children, a vassal asking for a favour, a crime to judge. Use real vassal houses and characters. These small choices should have consequences for loyalty, unrest and prosperity.`;

// What every call needs to know about the world, stated once (and kept identical between calls so the server can cache it)
export const WORLD_PRIMER = `THE WORLD
- The Known World of A Song of Ice and Fire (George R. R. Martin's books; the HBO show where the books are silent). Westeros is a continent some 3,000 miles long: the Seven Kingdoms under the Iron Throne in King's Landing — the North (Starks of Winterfell, a third of the land, cold, thinly peopled), the Iron Islands (Greyjoys, reavers), the Riverlands (Tullys of Riverrun), the Vale (Arryns of the Eyrie, mountain-walled), the Westerlands (Lannisters of Casterly Rock, gold mines), the Reach (Tyrells of Highgarden, the richest farmland and largest host), the Stormlands (Baratheons of Storm's End), Dorne (Martells of Sunspear, desert and mountains, unbowed), and the Crownlands around King's Landing. North of the Wall (700 feet of ice, held by the Night's Watch) live the free folk, and things older. Across the Narrow Sea lie the Free Cities of Essos (Braavos, Pentos, Myr, Lys, Tyrosh, Volantis, Norvos, Qohor, Lorath) and the Dothraki sea.
- Time: years are counted AC (After Aegon's Conquest). A year has twelve moons (months); dates are written like "1 9th moon, 298 AC". Seasons last years and are declared by the Citadel's white ravens.
- Feudal order: the King → the great lords (Lords Paramount/Wardens) → their bannermen → knights and smallfolk. Lords owe their liege tribute (dues) and levies when the banners are called; loyalty is personal and can break. Gold dragons are the currency.
- Travel: hosts march 15-25 miles a day, horse faster, ships 50-100 miles a day; ravens carry letters in days. Nothing moves instantly.
- Tone: grounded, political, violent and human. Honour is costly, betrayal is common, winter is coming.`;

export const JSON_RULES = `JSON RULES (your reply is read by a program — one broken character loses the whole turn):
- Reply with exactly ONE JSON object. No text before or after it, no code fences, no comments.
- Every key in double quotes. Strings in double quotes. NEVER put a raw double quote inside a string: for speech inside text use single quotes ('Winter is coming,' he said) or escape it as \\".
- No trailing commas. No line breaks inside strings (write it as one line). Numbers are plain digits: 8000, not "8,000" and not "8k".
- Use only the ids given in the tables (snake_case). If unsure of an id, leave that change out rather than invent one.
- Keep it compact: finish the whole object. A shorter complete reply is always better than a long one cut off.`;

// How characters answer in audiences: a small scene, so the player sees them act and hears them speak
export const SCENE_STYLE = `HOW TO WRITE YOUR REPLY — a short scene of 2 to 5 beats:
- ACTIONS are written between asterisks, in the third person present, as the player sees them: *Lord Tywin sets down his quill and regards you without warmth.* Show gesture, expression, the room, a pause — what a watchful visitor would notice.
- SPEECH is your own words, in the first person, spoken straight to the player ("you"), with no quotation marks and no name labels.
- Alternate them naturally, e.g.: *He leans back.* You ask a great deal, my lord. *A thin smile.* But I am listening.
- Stay in your own voice: your vocabulary, your temper, your secrets. Never narrate the player's feelings or actions, and never speak for them.
- By raven: write the letter itself in the first person (it may begin with a greeting and end with your name), with at most one *note about the letter* (the seal, the hand, a stain).
- Inside the JSON string, never use double quotes; use single quotes if you must quote something.`;

// ---------------- World digest ----------------

function houseLine(state, h, player) {
  const lord = h.lord ? state.characters[h.lord] : null;
  const rel = h.id === player ? '' : ` | rel:${getRelation(state, player, h.id)}`;
  const seat = h.seat ? state.holdings[h.seat]?.name : 'landless';
  return `${h.id} | ${h.name} | seat:${seat} | liege:${h.liege || '—'} | lord:${lord ? lord.id + (lord.alive ? '' : '(dead)') : '—'}${rel}${h.status !== 'active' ? ' | ' + h.status : ''}`;
}

function figuresLine(h) {
  return FIGURE_FIELDS.map((f) => `${f}:${fmt(h.figures[f]?.v)}`).join(', ');
}

function charLine(state, c) {
  const loc = placeName(state, c.loc);
  const bits = [c.id, c.name, c.house, c.title || c.roles?.join('/'), `age ${c.age}`, `at ${loc}`];
  if (c.spouse) bits.push('spouse:' + c.spouse);
  if (!c.alive) bits.push('DEAD');
  if (c.secret) bits.push(`SECRET${c.secretKnown ? ' (known to player)' : ''}: ${c.secret}`);
  else if (c.status && c.status !== 'free') bits.push(c.status.toUpperCase());
  return bits.join(' | ');
}

function armyLine(state, a) {
  const cmd = a.commander ? (state.characters[a.commander]?.name || a.commander) : '—';
  const where = a.at ? `at ${placeName(state, a.at)}` : `en route to ${a.destName || '?'} (now near ${Math.round(a.pos[0])},${Math.round(a.pos[1])})`;
  return `${a.id} | ${a.name} | ${a.owner}${a.serving ? ` (serving ${a.serving})` : ''} | ${a.type}${a.ships ? ` ${a.ships} ships` : ''} | ${fmt(a.men)} men | cmd:${cmd} | ${where} | ${a.status || ''} | morale ${a.morale} supply ${a.supply}${a.march ? ` | ORDERED to march on ${placeName(state, a.march.to)} (the engine moves it at marching pace unless you army_move it yourself, e.g. if intercepted)` : ''}`;
}

export function playerSheet(state) {
  const p = state.meta.player; const h = state.houses[p];
  const lines = [];
  lines.push(`PLAYER HOUSE: ${p} — House ${h.name}${h.title ? ', ' + h.title : ''}. Words: "${h.words}". Seat: ${h.seat ? state.holdings[h.seat].name : 'none'}. Liege: ${h.liege || 'none'}.`);
  const lord = h.lord ? state.characters[h.lord] : null;
  lines.push(`Head of house (the player acts as them): ${lord ? `${lord.name} (${lord.id})` : 'unknown'}.`);
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
  const letters = (state.ravens || []).slice(0, 5);
  if (letters.length) lines.push('Letters the player has received recently:\n' + letters.map((r) => `  [${r.date}] from ${r.fromName}: ${r.text}`).join('\n'));
  const pending = (state.decisions || []).filter((d) => d.status === 'pending');
  if (pending.length) lines.push('Decisions the player has NOT answered (treat silence as delay or refusal, and let those who asked react): ' + pending.map((d) => `${d.title} (asked ${d.date})`).join('; '));
  const decided = (state.decisions || []).filter((d) => d.status === 'decided' && d.decidedTurn === state.meta.turn);
  if (decided.length) lines.push('DECISIONS THE PLAYER MADE THIS TURN (binding — resolve their consequences):\n' + decided.map((d) => `  ${d.title}: chose "${d.choice}"${d.note ? ' — ' + d.note : ''}`).join('\n'));
  return lines.join('\n');
}

export function worldDigest(state, budgetTokens, lean = false, part = 'all') {
  const p = state.meta.player;
  const parts = [];
  const season = SEASONS[state.world?.season || 'summer'];
  parts.push(`SEASON: ${season.label}. ${state.world?.seasonNote || season.note}`);
  // Realms
  const tops = Object.values(state.houses).filter((h) => !h.liege || h.rank === 'paramount' || h.rank === 'crown' || h.independent);
  const realmLines = tops.map((h) => {
    const t = realmTotals(state, h.id);
    const lord = h.lord ? state.characters[h.lord]?.name : '—';
    return `${h.id} | ${h.realmName || h.name} | ruler:${lord} | liege:${h.liege || 'none'} | levies~${fmt(t.levies)} maa~${fmt(t.menAtArms)} ships~${fmt(t.ships)} gold~${fmt(t.treasury)}${h.id !== p ? ' | rel:' + getRelation(state, p, h.id) : ''}`;
  });
  parts.push('REALMS & GREAT POWERS\n' + realmLines.join('\n'));

  const wars = state.wars.filter((w) => w.status !== 'ended');
  parts.push('WARS\n' + (wars.length ? wars.map((w) => `${w.id} | ${w.name} | attackers:${w.attackers.join(',')} | defenders:${w.defenders.join(',')} | since ${w.started}${w.note ? ' | ' + w.note : ''}`).join('\n') : 'none'));
  const pacts = state.pacts.filter((x) => x.status !== 'ended');
  parts.push('PACTS & AGREEMENTS\n' + (pacts.length ? pacts.map((x) => `${x.type} | ${x.a} & ${x.b} | ${x.status} | ${x.terms}`).join('\n') : 'none'));
  parts.push('ARMIES & FLEETS IN THE FIELD\n' + Object.values(state.armies).map((a) => armyLine(state, a)).join('\n'));
  const wr = warRoom(state);
  if (wr.length) parts.push('WAR ROOM (engine estimates — let battles, sieges and marches follow these odds and timings unless the story gives a strong reason; upsets happen but are rare)\n' + wr.join('\n'));

  const changedHoldings = Object.values(state.holdings).filter((x) => x.owner !== (x.seatOf || x.owner) || x.status !== 'normal' || x.unrest >= 40 || x.notes.length);
  if (changedHoldings.length) parts.push('NOTABLE HOLDINGS\n' + changedHoldings.map((x) => `${x.id} | ${x.name} | owner:${x.owner} | ${x.status} | unrest ${x.unrest} | ${x.notes.slice(-2).join(' / ')}`).join('\n'));
  const founded = Object.values(state.holdings).filter((x) => x.founded || x.formerNames?.length);
  if (founded.length) parts.push('PLACES CHANGED DURING PLAY\n' + founded.map((x) => `${x.id} | ${x.name}${x.formerNames?.length ? ' (formerly ' + x.formerNames.join(', ') + ')' : ''} | ${x.type} | owner:${x.owner}${x.founded ? ' | founded ' + x.founded : ''}`).join('\n'));
  if (state.landmarks?.length) parts.push('LANDMARKS ON THE MAP\n' + state.landmarks.map((l) => `${l.name} (${l.kind}, ${l.date})`).join('\n'));
  if (!lean) parts.push('OTHER PLACES armies and people can go (not holdings): ' + Object.keys(PLACE_NAMES).filter((k) => !/_\d/.test(k) && resolvePlaceId(k) === k && !state.holdings[k]).slice(0, 120).join(', '));
  if (state.battles?.length) parts.push('RECENT BATTLES\n' + state.battles.slice(-8).map((b) => `${b.date} | ${b.name} | victor:${b.victor || '?'} | ${b.summary || ''}`).join('\n'));

  // Houses & characters: include everything if budget allows, else the most relevant
  const allHouses = Object.values(state.houses);
  const allChars = Object.values(state.characters).filter((c) => c.alive || (c.died && c.died >= state.meta.date.year - 1) || !c.died);
  let houseLines = allHouses.map((h) => houseLine(state, h, p));
  let charLines = allChars.map((c) => charLine(state, c));
  const sizeNow = estimateTokens(parts.join('\n') + houseLines.join('\n') + charLines.join('\n'));
  if (lean || sizeNow > budgetTokens) {
    const relevant = new Set([p, ...vassalsOf(state, p, true), ...tops.map((h) => h.id)]);
    for (const w of wars) if (w.attackers.includes(p) || w.defenders.includes(p)) [...w.attackers, ...w.defenders].forEach((x) => relevant.add(x));
    if (state.houses[p]?.liege) relevant.add(state.houses[p].liege);
    // anyone the player has spoken with, and anyone at the player's side
    for (const k of Object.keys(state.chats || {})) if (state.characters[k]) relevant.add(state.characters[k].house);
    houseLines = allHouses.filter((h) => relevant.has(h.id) || getRelation(state, p, h.id) !== 0).map((h) => houseLine(state, h, p));
    charLines = allChars.filter((c) => relevant.has(c.house) && (c.house === p || c.roles?.some((r) => ['lord', 'lady', 'ruler', 'heir', 'council', 'commander'].includes(r)))).map((c) => charLine(state, c));
  }
  const people = ['HOUSES (id | name | seat | liege | lord | relation to player)\n' + houseLines.join('\n'), 'CHARACTERS (id | name | house | title | age | location | status)\n' + charLines.join('\n')];
  // houses & characters change little from turn to turn: callers put them first so the model server can reuse its cache
  const threads = threadsDigest(state);
  if (threads) parts.push('THREADS OF THE STORY (the engine brings these beats itself when their time comes; you may foreshadow them, and you must not contradict what has happened)\n' + threads);
  if (part === 'static') return people.join('\n\n');
  if (part === 'dynamic') return parts.join('\n\n');
  return [...parts, ...people].join('\n\n');
}

export function memoryBlock(state, chronicleMd, budgetTokens, keepRecent) {
  const out = [];
  if (chronicleMd && chronicleMd.trim()) out.push('THE CHRONICLE (long-term memory of the story so far)\n' + trimToTokens(chronicleMd, Math.floor(budgetTokens * 0.5), true));
  const recent = state.history.filter((t) => t.turn > state.consolidatedThrough).slice(-Math.max(keepRecent, 1));
  if (recent.length) {
    const lines = recent.map((t) => `== Turn ${t.turn} (${t.dateFrom} → ${t.date}) ==\nPlayer orders: ${t.orders.map((o) => o.text).join(' | ') || '(none)'}\n${t.summary}\n${t.events.map((e) => `- ${e.title}: ${e.text}`).join('\n')}`);
    out.push('RECENT TURNS\n' + trimToTokens(lines.join('\n\n'), Math.floor(budgetTokens * 0.5), true));
  }
  return out.join('\n\n');
}

function trimToTokens(s, tokens, keepEnd = false) {
  const maxChars = Math.max(200, Math.floor(tokens * 3.6));
  if (s.length <= maxChars) return s;
  return keepEnd ? '…' + s.slice(s.length - maxChars) : s.slice(0, maxChars) + '…';
}

function diplomacySinceLastTurn(state) {
  const blocks = [];
  for (const [cid, log] of Object.entries(state.chats)) {
    const recent = log.filter((m) => m.turn === state.meta.turn).slice(-12);
    if (!recent.length) continue;
    const c = state.characters[cid];
    const title = cid.startsWith('council:') ? 'Council meeting' : `Conversation with ${c?.name || cid} (${c?.house})`;
    blocks.push(`${title}:\n` + recent.map((m) => `${m.role === 'player' ? 'PLAYER' : (state.characters[m.speaker]?.name || c?.name || 'NPC')}: ${m.text}`).join('\n'));
  }
  return blocks.length ? 'DIPLOMACY & CONVERSATIONS SINCE THE LAST TURN (these happened; honour their consequences)\n' + blocks.join('\n\n') : '';
}

// ---------------- Prompt builders ----------------

export function buildJumpPrompt(state, orders, spanKey, chronicleMd, cfg) {
  const sc = SCENARIOS[state.meta.scenario];
  const span = SPANS[spanKey] || SPANS['1m'];
  const budget = Math.max(4000, cfg.contextTokens - cfg.maxTokens - 1500);
  const system = [
    `You are the MAESTER-SIMULATOR: the game engine of a grand strategy role-playing game set in the world of A Song of Ice and Fire. You simulate the whole Known World turn by turn.`,
    WORLD_PRIMER,
    'SCENARIO BACKGROUND\n' + sc.lore.map((l) => '- ' + l).join('\n'),
    'HOW THE GREAT HOUSES BEHAVE (move them by their nature; they act every turn whether or not the player does)\n' + Object.entries(HOUSE_WAYS).map(([k, v]) => `- ${k}: ${v}`).join('\n'),
    RULES,
    CHANGE_SCHEMA,
    JSON_RULES,
    `OUTPUT FORMAT — reply with ONE JSON object and nothing else:
{
  "summary": "2-4 paragraph narrative of this period focused on what the player would know or notice",
  "events": [ {"title":"short headline","text":"2-5 sentences","where":PLACE_ID,"importance":1-5,"type":"war|diplomacy|economy|intrigue|court|disaster|rumor|religion|magic","houses":[HOUSE_IDS]} ],
  "changes": [ ...change operations... ]
}
LENGTH: the summary is at most 3 short paragraphs. Each event text is 1-3 sentences. For a week or two: 2-5 events and up to 15 changes; for a moon: 4-8 events and up to 25 changes; for three moons or more (up to a year): 6-12 events and up to 40 changes — summarise, do not narrate every day. Include changes for every consequence that should appear on the map or in the numbers. Rumours may be inaccurate; changes must reflect the TRUE state.

A SHORT EXAMPLE of the shape (different world, do not copy its content):
{"summary":"Rain on the Mander. Lord Tarly's outriders caught raiders at the ford...","events":[{"title":"Raiders at the ford","text":"Three hundred Dornish raiders were caught crossing the Mander at dawn; Lord Tarly hanged their captain.","where":"tarly","importance":3,"type":"war","houses":["tarly","martell"]},{"title":"A petition from Honeyholt","text":"Lord Beesbury begs his liege to forgive his late tribute after the blight.","where":"beesbury","importance":2,"type":"court","houses":["beesbury"]}],"changes":[{"op":"army_update","army":"some_army_id","delta":-40,"morale":80},{"op":"relation","a":"tarly","b":"martell","delta":-10,"reason":"hanged raiders"},{"op":"obligation","house":"beesbury","tribute":"late","reason":"blight"},{"op":"decision","title":"Beesbury's plea","from":"some_char_id","text":"...","options":[{"label":"Forgive the debt","hint":"loyalty up, coin down"},{"label":"Demand payment","hint":"coin now, resentment later"}]}]}
Only use ids that exist in the tables below. Change only what the story justifies. Never change the player's own allegiance or taxes — those are the player's choices.`,
  ].join('\n\n');

  const digestBudget = Math.floor(budget * 0.55);
  const memBudget = Math.floor(budget * 0.3);
  const lean = cfg.promptDetail === 'lean';
  const user = [
    worldDigest(state, digestBudget, lean, 'static'),
    memoryBlock(state, chronicleMd, memBudget, cfg.keepRecentTurns),
    'THE STATE OF THE REALM NOW\n' + worldDigest(state, digestBudget, lean, 'dynamic'),
    playerSheet(state),
    diplomacySinceLastTurn(state),
    `CURRENT DATE: ${dateStr(state.meta.date)}. Simulate the next ${span.label} (${span.days} days).`,
    `PLAYER'S ORDERS FOR THIS PERIOD:\n${orders.length ? orders.map((o, i) => `${i + 1}. ${o.text}${o.note ? ' ' + o.note : ''}`).join('\n') : '(The player issues no orders and waits.)'}`,
    `Now simulate the ${span.label}. Reply with the JSON object only: {"summary":"...","events":[...],"changes":[...]} — complete and valid.`,
  ].filter(Boolean).join('\n\n');
  return [{ role: 'system', content: system }, { role: 'user', content: user }];
}

export function characterKnowledge(state, c) {
  const p = state.meta.player;
  const h = state.houses[c.house];
  const lines = [];
  const informedRoles = ['steward', 'maester', 'master_at_arms', 'captain', 'commander', 'council', 'lord', 'lady', 'heir', 'spymaster'];
  if (h && c.roles?.some((r) => informedRoles.includes(r))) {
    lines.push(`What ${c.name} knows of House ${h.name}'s strength (current best figures — as an officer you may refine these when you report, e.g. after counting): ${figuresLine(h)}`);
    const armies = Object.values(state.armies).filter((a) => a.owner === c.house);
    if (armies.length) lines.push('Forces of the house: ' + armies.map((a) => armyLine(state, a)).join(' ; '));
    const vas = vassalsOf(state, c.house);
    if (vas.length) lines.push('Sworn vassals: ' + vas.map((v) => `${state.houses[v].name} (${v}) levies~${fmt(state.houses[v].figures.levies.v)}`).join(', '));
  }
  return lines.join('\n');
}

export function buildChatPrompt(state, charId, message, chronicleMd, cfg) {
  const c = state.characters[charId];
  const p = state.meta.player;
  const ph = state.houses[p];
  const playerLord = ph.lord ? state.characters[ph.lord] : null;
  const h = state.houses[c.house];
  const sameHouse = c.house === p;
  const rel = sameHouse ? 'They serve the player\'s house.' : `Relation between their house and the player's house: ${getRelation(state, p, c.house)} (-100 hatred … 100 devotion). Their personal opinion of the player: ${c.opinion || 0}.`;
  const log = (state.chats[charId] || []).slice(-24);
  const budget = Math.max(3000, cfg.contextTokens - cfg.maxTokens - 1500);
  const system = [
    `You are ${c.name}${c.title ? ', ' + c.title : ''}, of House ${h?.name || c.house}, in the world of A Song of Ice and Fire. Stay fully in character: voice, knowledge, loyalties, fears, secrets and agenda. Never break character or mention being an AI or a game.`,
    `Your traits: ${c.traits || 'unknown'}. Age ${c.age}. Currently at ${placeName(state, c.loc)}${c.status !== 'free' ? ` (${c.status})` : ''}. ${c.bio || ''}`,
    VOICES[c.id] ? `How you speak: ${VOICES[c.id].voice}\nWhat you want: ${VOICES[c.id].wants}\nWhat you fear: ${VOICES[c.id].fears}` : '',
    HOUSE_WAYS[c.house] ? `The way of your house: ${HOUSE_WAYS[c.house]}` : '',
    c.secret ? `Your secret (protect it unless you have strong reason): ${c.secret}` : '',
    c.memories?.length ? `Things you remember:\n- ${c.memories.join('\n- ')}` : '',
    `You are speaking with ${playerLord ? playerLord.name : 'the head'} of House ${ph.name} (the player). ${rel}`,
    sameHouse ? '' : dispositionText(state, charId),
    sameHouse ? 'If asked for numbers (men, gold, grain, ships), answer with concrete figures appropriate to your role — you may adjust the ledger figures if you have reason to (a fresh count, desertions, a bad harvest). Report them via a "figure" change with source set to your name.' : 'You do not know the player\'s exact strength; do not reveal your own house\'s exact numbers unless it serves you.',
    'Distance matters: if you are not in the same place as the player, this exchange is by raven or envoy — write accordingly.',
    SCENE_STYLE,
    `Reply ONLY with a JSON object: {"reply":"the scene: *what the player sees you do* and what you say, in first person","changes":[optional change operations caused by this conversation, e.g. figure reports, opinion shifts ("character" op on yourself), pacts you firmly agree to]}.
Allowed ops: figure, character, relation, pact, raven, army_update, army_move, army_create, liege, obligation, decision, chronicle. Only commit to what your character would genuinely do.`,
    TALK_SCHEMA,
  ].filter(Boolean).join('\n\n');
  const sc = SCENARIOS[state.meta.scenario];
  const context = [
    `CURRENT DATE: ${dateStr(state.meta.date)}`,
    state.history.length < 3 ? 'BACKGROUND (what the realm knows or whispers; you know only what your character plausibly would):\n' + sc.lore.map((l) => '- ' + l).join('\n') : '',
    characterKnowledge(state, c),
    memoryBlock(state, chronicleMd, Math.floor(budget * 0.35), 2),
    'Known houses and people (ids):\n' + worldDigest(state, Math.floor(budget * 0.35), cfg.promptDetail !== 'full'),
  ].filter(Boolean).join('\n\n');
  const messages = [{ role: 'system', content: system + '\n\n' + context }];
  for (const m of log) messages.push({ role: m.role === 'player' ? 'user' : 'assistant', content: m.role === 'player' ? m.text : JSON.stringify({ reply: m.text, changes: [] }) });
  messages.push({ role: 'user', content: `${message}\n\n[Answer in character as ${c.name}: a short scene, *actions* between asterisks, your words in the first person to me. Reply with JSON only: {"reply":"...","changes":[]}]` });
  return messages;
}

export function buildSuggestPrompt(state, chronicleMd, cfg) {
  const system = 'You are the trusted advisor of the player\'s house in a grand strategy game set in A Song of Ice and Fire. Suggest bold but plausible orders. Reply ONLY with JSON: {"suggestions":["order 1","order 2",...]} — 5 to 7 concrete one-sentence orders written as the lord would dictate them.';
  const user = [playerSheet(state), memoryBlock(state, chronicleMd, 3000, 2), `DATE: ${dateStr(state.meta.date)}`, 'What should we do next?'].join('\n\n');
  return [{ role: 'system', content: system }, { role: 'user', content: user }];
}

export function buildConsolidatePrompt(state, turns, chronicleMd) {
  const system = 'You are the Archmaester keeping the chronicle of a long game. Compress the given turns into a dense, factual chronicle entry that preserves everything that matters for the future: who holds what, who is dead, alliances, betrayals, debts, grudges, promises, secrets revealed, army and fleet movements, and the player\'s strategy. Use names and places. Reply ONLY with JSON: {"chronicle":"markdown bullet list, ~150-400 words"}';
  const user = [
    chronicleMd ? 'EXISTING CHRONICLE (do not repeat it):\n' + chronicleMd.slice(-6000) : '',
    'TURNS TO CONSOLIDATE:\n' + turns.map((t) => `== Turn ${t.turn} (${t.dateFrom} → ${t.date}) ==\nOrders: ${t.orders.map((o) => o.text).join(' | ') || '(none)'}\n${t.summary}\n${t.events.map((e) => `- [${e.importance}] ${e.title}: ${e.text}`).join('\n')}\nChanges: ${(t.applied || []).map((a) => a.text).join('; ')}`).join('\n\n'),
  ].filter(Boolean).join('\n\n');
  return [{ role: 'system', content: system }, { role: 'user', content: user }];
}

export function buildCouncilPrompt(state, ids, message, chronicleMd, cfg) {
  const p = state.meta.player; const ph = state.houses[p];
  const lord = ph.lord ? state.characters[ph.lord] : null;
  const people = ids.map((i) => state.characters[i]);
  const budget = Math.max(3000, cfg.contextTokens - cfg.maxTokens - 1500);
  const key = 'council:' + [...ids].sort().join(',');
  const log = (state.chats[key] || []).slice(-30);
  const system = [
    `You voice a COUNCIL MEETING in the world of A Song of Ice and Fire. ${lord ? lord.name : 'The lord'} of House ${ph.name} (the player) presides. Present: ${people.map((c) => `${c.name} [${c.id}] — ${c.title || c.roles.join(', ')}; traits: ${c.traits}; skills D/M/S/I/L ${c.skills?.slice(0, 5).join('/')}${VOICES[c.id] ? '; speaks: ' + VOICES[c.id].voice : ''}${c.secret ? '; hidden agenda: ' + c.secret : ''}`).join(' | ')}.`,
    'Each counsellor speaks in their own voice, from their own expertise and interests; they may disagree with one another and with the lord. Officers give concrete numbers from the ledger. 1-4 of them speak per round, whoever is most relevant. Never break character.',
    SCENE_STYLE.replace('HOW TO WRITE YOUR REPLY — a short scene of 2 to 5 beats', 'HOW EACH COUNSELLOR SPEAKS — each reply is a short scene of 1 to 3 beats'),
    `Reply ONLY with JSON: {"replies":[{"speaker":CHAR_ID,"text":"*what the player sees them do* and what they say, in first person"}],"changes":[optional change operations the council's reports imply — e.g. a steward's corrected figures]}`,
    TALK_SCHEMA,
  ].join('\n\n');
  const context = [`DATE: ${dateStr(state.meta.date)}`, playerSheet(state), ...people.map((c) => characterKnowledge(state, c)).filter(Boolean).slice(0, 1), memoryBlock(state, chronicleMd, Math.floor(budget * 0.3), 2), worldDigest(state, Math.floor(budget * 0.35), cfg.promptDetail !== 'full')].join('\n\n');
  const messages = [{ role: 'system', content: system + '\n\n' + context }];
  for (const m of log) messages.push(m.role === 'player' ? { role: 'user', content: m.text } : { role: 'assistant', content: JSON.stringify({ replies: [{ speaker: m.speaker, text: m.text }] }) });
  messages.push({ role: 'user', content: `${message}\n\n[The counsellors answer in their own voices. Reply with JSON only: {"replies":[{"speaker":CHAR_ID,"text":"..."}],"changes":[]}]` });
  return messages;
}
