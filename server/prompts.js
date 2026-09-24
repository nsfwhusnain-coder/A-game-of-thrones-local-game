// Prompt construction for the simulation. The model is the game engine: it narrates,
// decides what every other house does, and emits structured changes that the engine applies.
import { SCENARIOS } from '../public/data/scenarios.js';
import {
  dateStr, getRelation, realmOf, realmTotals, vassalsOf, placeName, fmt, FIGURE_FIELDS, SPANS,
} from '../public/js/shared/world.js';
import { estimateTokens } from './llm.js';

const CHANGE_SCHEMA = `CHANGE OPERATIONS (use exact ids from the tables; invent new snake_case ids only for new armies/characters):
- {"op":"figure","house":ID,"field":"treasury|income|debt|levies|menAtArms|guard|ships|food","value":N or "delta":±N,"source":"who reported it"}
    treasury/debt/income in gold dragons; levies = men that could still be called; food = months of stores.
- {"op":"army_create","id":NEW_ID,"owner":HOUSE,"name":"...","commander":CHAR_ID,"at":PLACE,"men":N,"type":"army|fleet","ships":N,"composition":"...","status":"mustering"}
    (raising troops should also reduce that house's levies figure)
- {"op":"army_move","army":ARMY_ID,"to":PLACE,"progress":0.0-1.0,"status":"marching"}   progress<1 means still en route
- {"op":"army_update","army":ARMY_ID,"men":N or "delta":±N,"morale":0-100,"supply":0-100,"status":"...","owner":HOUSE}
- {"op":"army_destroy","army":ARMY_ID,"reason":"..."}  /  {"op":"army_disband","army":ARMY_ID}
- {"op":"holding","id":PLACE,"owner":HOUSE,"unrest":0-100,"prosperity":0-100,"garrison":N,"status":"normal|besieged|sacked|burning|occupied","note":"..."}
- {"op":"character","id":CHAR_ID,"alive":false,"cause":"...","loc":PLACE,"title":"...","status":"free|imprisoned|hostage|missing|exiled|wounded","opinion":-100..100 (of the player),"loyalty":-100..100 (to their liege),"note":"what they now remember"}
- {"op":"character_new","id":NEW_ID,"name":"...","house":HOUSE,"title":"...","age":N,"loc":PLACE,"roles":["captain"],"traits":"...","bio":"..."}
- {"op":"relation","a":HOUSE,"b":HOUSE,"delta":±N,"reason":"..."}
- {"op":"liege","house":HOUSE,"liege":HOUSE or null}   (vassal changes allegiance / declares independence)
- {"op":"house_update","house":HOUSE,"lord":CHAR_ID,"title":"...","realmName":"...","note":"..."}
- {"op":"war","status":"start","name":"...","attackers":[HOUSE],"defenders":[HOUSE],"reason":"..."}  /  {"op":"war","status":"end","name":"...","outcome":"..."}
- {"op":"war_join","war":"war name or id","house":HOUSE,"side":"attacker|defender"}
- {"op":"pact","type":"alliance|trade|embargo|marriage|truce|non_aggression|loan|vassalage","a":HOUSE,"b":HOUSE,"terms":"...","status":"active|pending|ended|broken"}
- {"op":"battle","name":"...","at":PLACE,"attacker":HOUSE,"defender":HOUSE,"victor":HOUSE,"losses":{"HOUSE":N},"summary":"..."}
- {"op":"raven","from":CHAR_ID,"text":"a letter written in-character to the player"}
- {"op":"chronicle","text":"one line recording a truly significant, lasting fact (deaths of great lords, wars, crowns, betrayals)"}`;

const RULES = `SIMULATION RULES
1. You are the living world of A Song of Ice and Fire (books + show lore). Stay true to characters' personalities, motives, secrets and the political realities of Westeros and Essos. Other houses act on THEIR OWN interests, not the player's.
2. The player controls only their own house. Their orders are INTENTIONS, not guaranteed outcomes. Resolve them plausibly: travel takes time (a host marches ~15-25 miles/day; the realm is ~3,000 miles long; a raven flies Winterfell→King's Landing in days), gold must exist to be spent, lords may refuse, delay, bargain or betray. Failure and partial success are common. Consequences ripple.
3. Numbers are NOT fixed rules. Every figure (treasury, levies, men-at-arms, food, army sizes) is an estimate owned by you. Change them when the story demands: harvests, taxes, tolls, trade, bribes, desertion, disease, casualties, sellswords joining, lords sending or withholding men. Keep them internally consistent (raising 8,000 men lowers levies by ~8,000; feeding a host drains food and gold; a battle kills men on both sides).
4. The world moves even if the player does nothing: canon events may unfold (with variation as the story diverges), NPC houses scheme, marry, feud, trade and go to war. Show at least one development that does not involve the player.
5. Use exact ids from the tables for houses, characters, armies and places. You may create new characters (captains, envoys, bastards, maesters) and new armies.
6. Respect what the player learned through diplomacy chats: agreements made there should be honored or broken in character.
7. Write events in a grounded, literary chronicle voice. Be specific: names, places, numbers, weather, rumours.`;

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
  if (!c.alive) bits.push('DEAD');
  else if (c.status && c.status !== 'free') bits.push(c.status.toUpperCase());
  return bits.join(' | ');
}

function armyLine(state, a) {
  const cmd = a.commander ? (state.characters[a.commander]?.name || a.commander) : '—';
  const where = a.at ? `at ${placeName(state, a.at)}` : `en route to ${a.destName || '?'} (now near ${Math.round(a.pos[0])},${Math.round(a.pos[1])})`;
  return `${a.id} | ${a.name} | ${a.owner} | ${a.type}${a.ships ? ` ${a.ships} ships` : ''} | ${fmt(a.men)} men | cmd:${cmd} | ${where} | ${a.status || ''} | morale ${a.morale} supply ${a.supply}`;
}

export function playerSheet(state) {
  const p = state.meta.player; const h = state.houses[p];
  const lines = [];
  lines.push(`PLAYER HOUSE: ${p} — House ${h.name}${h.title ? ', ' + h.title : ''}. Words: "${h.words}". Seat: ${h.seat ? state.holdings[h.seat].name : 'none'}. Liege: ${h.liege || 'none'}.`);
  const lord = h.lord ? state.characters[h.lord] : null;
  lines.push(`Head of house (the player acts as them): ${lord ? `${lord.name} (${lord.id})` : 'unknown'}.`);
  lines.push(`Known figures (as last reported): ${figuresLine(h)}`);
  const vas = vassalsOf(state, p);
  if (vas.length) {
    lines.push('Sworn vassals:');
    for (const v of vas) lines.push(`  ${houseLine(state, state.houses[v], p)} | ${figuresLine(state.houses[v])}`);
    const t = realmTotals(state, p);
    lines.push(`Realm totals (house + vassals): levies ${fmt(t.levies)}, men-at-arms ${fmt(t.menAtArms)}, ships ${fmt(t.ships)}, treasury ${fmt(t.treasury)}`);
  }
  const holdings = Object.values(state.holdings).filter((x) => x.owner === p);
  lines.push('Holdings: ' + holdings.map((x) => `${x.id} (${x.status}, unrest ${x.unrest}, prosperity ${x.prosperity}${x.garrison != null ? ', garrison ' + x.garrison : ''})`).join('; '));
  const chars = Object.values(state.characters).filter((c) => c.house === p);
  lines.push('Members & retainers: ' + chars.map((c) => `${c.name} [${c.id}]${c.alive ? '' : ' (dead)'}${c.status !== 'free' && c.alive ? ' (' + c.status + ')' : ''} @${placeName(state, c.loc)}`).join('; '));
  return lines.join('\n');
}

export function worldDigest(state, budgetTokens) {
  const p = state.meta.player;
  const parts = [];
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

  const changedHoldings = Object.values(state.holdings).filter((x) => x.owner !== (x.seatOf || x.owner) || x.status !== 'normal' || x.unrest >= 40 || x.notes.length);
  if (changedHoldings.length) parts.push('NOTABLE HOLDINGS\n' + changedHoldings.map((x) => `${x.id} | ${x.name} | owner:${x.owner} | ${x.status} | unrest ${x.unrest} | ${x.notes.slice(-2).join(' / ')}`).join('\n'));
  if (state.battles?.length) parts.push('RECENT BATTLES\n' + state.battles.slice(-8).map((b) => `${b.date} | ${b.name} | victor:${b.victor || '?'} | ${b.summary || ''}`).join('\n'));

  // Houses & characters: include everything if budget allows, else the most relevant
  const allHouses = Object.values(state.houses);
  const allChars = Object.values(state.characters);
  let houseLines = allHouses.map((h) => houseLine(state, h, p));
  let charLines = allChars.map((c) => charLine(state, c));
  const sizeNow = estimateTokens(parts.join('\n') + houseLines.join('\n') + charLines.join('\n'));
  if (sizeNow > budgetTokens) {
    const relevant = new Set([p, ...vassalsOf(state, p, true), ...tops.map((h) => h.id)]);
    for (const w of wars) if (w.attackers.includes(p) || w.defenders.includes(p)) [...w.attackers, ...w.defenders].forEach((x) => relevant.add(x));
    houseLines = allHouses.filter((h) => relevant.has(h.id) || getRelation(state, p, h.id) !== 0).map((h) => houseLine(state, h, p));
    charLines = allChars.filter((c) => relevant.has(c.house) && (c.house === p || c.roles?.some((r) => ['lord', 'lady', 'ruler', 'heir', 'council', 'commander'].includes(r)))).map((c) => charLine(state, c));
  }
  parts.push('HOUSES (id | name | seat | liege | lord | relation to player)\n' + houseLines.join('\n'));
  parts.push('CHARACTERS (id | name | house | title | age | location | status)\n' + charLines.join('\n'));
  return parts.join('\n\n');
}

export function memoryBlock(state, chronicleMd, budgetTokens, keepRecent) {
  const out = [];
  if (chronicleMd && chronicleMd.trim()) out.push('THE CHRONICLE (long-term memory of the story so far)\n' + trimToTokens(chronicleMd, Math.floor(budgetTokens * 0.5), true));
  const recent = state.history.filter((t) => t.turn > state.consolidatedThrough).slice(-Math.max(keepRecent, 1) * 2);
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
    blocks.push(`Conversation with ${c?.name || cid} (${c?.house}):\n` + recent.map((m) => `${m.role === 'player' ? 'PLAYER' : c?.name}: ${m.text}`).join('\n'));
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
    RULES,
    CHANGE_SCHEMA,
    `OUTPUT FORMAT — reply with ONE JSON object and nothing else:
{
  "summary": "2-4 paragraph narrative of this period focused on what the player would know or notice",
  "events": [ {"title":"short headline","text":"2-5 sentences","where":PLACE_ID,"importance":1-5,"type":"war|diplomacy|economy|intrigue|court|disaster|rumor|religion|magic","houses":[HOUSE_IDS]} ],
  "changes": [ ...change operations... ]
}
Produce 4-10 events (more for longer periods). Include changes for every consequence that should appear on the map or in the numbers. Rumours may be inaccurate; changes must reflect the TRUE state.`,
  ].join('\n\n');

  const lore = 'SCENARIO BACKGROUND\n' + sc.lore.map((l) => '- ' + l).join('\n');
  const digestBudget = Math.floor(budget * 0.55);
  const memBudget = Math.floor(budget * 0.3);
  const user = [
    lore,
    playerSheet(state),
    worldDigest(state, digestBudget),
    memoryBlock(state, chronicleMd, memBudget, cfg.keepRecentTurns),
    diplomacySinceLastTurn(state),
    `CURRENT DATE: ${dateStr(state.meta.date)}. Simulate the next ${span.label} (${span.days} days).`,
    `PLAYER'S ORDERS FOR THIS PERIOD:\n${orders.length ? orders.map((o, i) => `${i + 1}. ${o.text}`).join('\n') : '(The player issues no orders and waits.)'}`,
    'Now simulate. Reply with the JSON object only.',
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
    c.secret ? `Your secret (protect it unless you have strong reason): ${c.secret}` : '',
    c.memories?.length ? `Things you remember:\n- ${c.memories.join('\n- ')}` : '',
    `You are speaking with ${playerLord ? playerLord.name : 'the head'} of House ${ph.name} (the player). ${rel}`,
    sameHouse ? 'If asked for numbers (men, gold, grain, ships), answer with concrete figures appropriate to your role — you may adjust the ledger figures if you have reason to (a fresh count, desertions, a bad harvest). Report them via a "figure" change with source set to your name.' : 'You do not know the player\'s exact strength; do not reveal your own house\'s exact numbers unless it serves you.',
    'Distance matters: if you are not in the same place as the player, this exchange is by raven or envoy — write accordingly.',
    `Reply ONLY with a JSON object: {"reply":"your in-character words (may include brief *actions*)","changes":[optional change operations caused by this conversation, e.g. figure reports, opinion shifts ("character" op on yourself), pacts you firmly agree to]}.
Allowed ops: figure, character, relation, pact, raven, army_update, army_move, army_create, liege, chronicle. Only commit to what your character would genuinely do.`,
    CHANGE_SCHEMA,
  ].filter(Boolean).join('\n\n');
  const context = [
    `CURRENT DATE: ${dateStr(state.meta.date)}`,
    characterKnowledge(state, c),
    memoryBlock(state, chronicleMd, Math.floor(budget * 0.35), 2),
    'Known houses and people (ids):\n' + worldDigest(state, Math.floor(budget * 0.35)),
  ].filter(Boolean).join('\n\n');
  const messages = [{ role: 'system', content: system + '\n\n' + context }];
  for (const m of log) messages.push({ role: m.role === 'player' ? 'user' : 'assistant', content: m.role === 'player' ? m.text : JSON.stringify({ reply: m.text }) });
  messages.push({ role: 'user', content: message });
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
