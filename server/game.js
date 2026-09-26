// Game session management: saves, time jumps, conversations, memory consolidation.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { chat, extractJson, extractField, loadConfig, estimateTokens, readReplies } from './llm.js';
import { buildJumpPrompt, buildChatPrompt, buildSuggestPrompt, buildConsolidatePrompt, buildCouncilPrompt, engineFacts } from './prompts.js';
import { createInitialState, migrateState, applyChanges, placePos, placeName, addDays, dateStr, SPANS, resolvePlaceId, dayNumber, findChar } from '../public/js/shared/world.js';
import { settle, initEconomy, seasonTick, PROJECT_TEMPLATES, TAX_LEVELS } from '../public/js/shared/economy.js';
import { postTick } from '../public/js/shared/errands.js';
import { retinueTick } from '../public/js/shared/retinues.js';
import { marchDays, MILES_PER_UNIT } from '../public/js/shared/warfare.js';
import { realmPetition, applyPetitionFx } from '../public/js/shared/petitions.js';
import { vassalTick, gatherMusters, fieldService } from '../public/js/shared/vassals.js';
import { worldTick, THREADS } from '../public/js/shared/plots.js';
import { resolveWarfare } from '../public/js/shared/battles.js';
import { roadEncounters } from '../public/js/shared/roads.js';
import { updateIntel } from '../public/js/shared/intel.js';
import { treacheryTick } from '../public/js/shared/treachery.js';
import * as court from './court.js';
import { carryOutOrders, readOrdersByRule, executeActions, named, startWorks, commandable, previewOrders, orderEvents, raiseLevies, callBanners, ravenDays } from './orders.js';
import { weighAudience, holdToVerdict, moodOf, moodWord } from '../public/js/shared/temperament.js';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
export const SAVES = process.env.WC_SAVES || path.join(ROOT, 'saves');
fs.mkdirSync(SAVES, { recursive: true });

const dir = (id) => {
  if (!/^[a-z0-9_-]+$/i.test(id)) throw httpError(400, 'bad save id');
  return path.join(SAVES, id);
};
export const httpError = (status, msg) => Object.assign(new Error(msg), { status });

export function listSaves() {
  return fs.readdirSync(SAVES, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => {
    try {
      const st = JSON.parse(fs.readFileSync(path.join(SAVES, d.name, 'state.json'), 'utf8'));
      return { id: d.name, player: st.meta.player, playerName: st.houses[st.meta.player]?.name, date: dateStr(st.meta.date), turn: st.meta.turn, scenario: st.meta.scenarioName, updated: fs.statSync(path.join(SAVES, d.name, 'state.json')).mtime };
    } catch { return null; }
  }).filter(Boolean).sort((a, b) => b.updated - a.updated);
}

export function loadState(id) {
  const f = path.join(dir(id), 'state.json');
  if (!fs.existsSync(f)) throw httpError(404, 'no such save');
  const st = JSON.parse(fs.readFileSync(f, 'utf8'));
  if (!st.world) initEconomy(st); // migrate v1 saves
  migrateState(st);
  return st;
}
function saveState(id, state) {
  fs.mkdirSync(dir(id), { recursive: true });
  const f = path.join(dir(id), 'state.json');
  fs.writeFileSync(f + '.tmp', JSON.stringify(state));
  fs.renameSync(f + '.tmp', f);
}
export function readChronicle(id) {
  const f = path.join(dir(id), 'chronicle.md');
  return fs.existsSync(f) ? fs.readFileSync(f, 'utf8') : '';
}
// The world log: everything that happened, turn by turn, in plain words — for the player to read (the model gets
// the compact version in its prompt, and the chronicle for older times)
export function readWorldLog(id) {
  const f = path.join(dir(id), 'world-log.md');
  return fs.existsSync(f) ? fs.readFileSync(f, 'utf8') : '';
}
function appendWorldLog(id, state, t) {
  const f = path.join(dir(id), 'world-log.md');
  const place = (w) => (w && (state.holdings[w]?.name || placeName(state, w))) || '';
  const lines = [];
  if (!fs.existsSync(f)) lines.push(`# World log — House ${state.houses[state.meta.player].name}\n\n_Everything that happened, turn by turn. The newest turn is at the bottom._\n`);
  lines.push(`\n## Turn ${t.turn} · ${t.dateFrom} → ${t.date}\n`);
  if (t.summary) lines.push(t.summary.trim() + '\n');
  const orders = (t.orders || []).map((o) => o.text);
  lines.push(`**Your orders:** ${orders.length ? '' : '(none)'}`);
  for (const o of orders) lines.push(`- ${o}`);
  for (const c of t.carried || []) if (c.result?.length) lines.push(`  - carried out: ${c.result.join('; ')}`);
  const main = (t.events || []).filter((e) => !e.bg), bg = (t.events || []).filter((e) => e.bg);
  if (main.length) { lines.push('\n**What happened:**'); for (const e of main) lines.push(`- _day ${e.day}_ · ${place(e.where) ? place(e.where) + ' · ' : ''}**${e.title}** — ${e.text}${e.details ? ' ' + e.details : ''}`); }
  if (bg.length) { lines.push('\n**Meanwhile, across the realm:**'); for (const e of bg) lines.push(`- _day ${e.day}_ · ${place(e.where)} · **${e.title}** — ${e.text}`); }
  const decided = (state.decisions || []).filter((d) => d.status !== 'pending' && d.decidedTurn === t.turn - 1);
  for (const d of decided) lines.push(`- Decision: ${d.title} → ${d.choice || d.status}`);
  if (t.salvaged) lines.push('\n_(The model\'s reply could not be read this turn; the engine moved the world on alone.)_');
  fs.appendFileSync(f, lines.join('\n') + '\n');
}

export function writeChronicle(id, text) { fs.writeFileSync(path.join(dir(id), 'chronicle.md'), text); }
function appendChronicle(id, text) { fs.appendFileSync(path.join(dir(id), 'chronicle.md'), text); }
function logLLM(id, kind, messages, response) {
  const entry = { t: new Date().toISOString(), kind, promptTokens: estimateTokens(messages.map((m) => m.content).join('\n')), response };
  fs.appendFileSync(path.join(dir(id), 'llm-log.jsonl'), JSON.stringify(entry) + '\n');
  fs.writeFileSync(path.join(dir(id), `last-prompt-${kind}.txt`), messages.map((m) => `### ${m.role.toUpperCase()}\n${m.content}`).join('\n\n'));
}

export function newGame(scenario, house) {
  const state = createInitialState(scenario, house);
  const id = `${house}-${Date.now().toString(36)}-${crypto.randomBytes(2).toString('hex')}`;
  saveState(id, state);
  const h = state.houses[house];
  writeChronicle(id, `# The Chronicle of House ${h.name}\n\n_${state.meta.scenarioName}. Begun on ${dateStr(state.meta.date)}._\n\nThis file is the long-term memory of your game. The simulator reads it every turn. You may edit it by hand to correct or steer the story.\n\n`);
  return { id, state };
}

export function deleteSave(id) { fs.rmSync(dir(id), { recursive: true, force: true }); }

export function setOrders(id, orders) {
  const state = loadState(id);
  const prev = new Map(state.orders.map((o) => [o.id, o])); // keep the simulator-only notes and flags of existing orders
  state.orders = (orders || []).map((o) => ({ ...(prev.get(o.id) || {}), id: o.id || crypto.randomBytes(4).toString('hex'), text: String(o.text || '').slice(0, 2000) })).filter((o) => o.text.trim());
  saveState(id, state);
  return state.orders;
}

// What the model is doing right now, per save (polled by the browser while it waits)
const progress = new Map();
export function getProgress(id) {
  const p = progress.get(id); if (!p) return null;
  const { text, ...rest } = p;
  return { ...rest, ms: Date.now() - p.t0, ...(text ? { events: streamedEvents(text) } : {}) };
}
// The turn's events as the model writes them: every event object already closed in the stream, so the player
// watches the news come in instead of a spinner (the full, checked turn follows when the reply is done)
function streamedEvents(text) {
  const i = text.search(/"events"\s*:\s*\[/); if (i < 0) return [];
  const out = []; let depth = 0, start = -1, inStr = false, esc = false;
  for (let k = text.indexOf('[', i) + 1; k < text.length; k++) {
    const c = text[k];
    if (inStr) { if (esc) esc = false; else if (c === '\\') esc = true; else if (c === '"') inStr = false; continue; }
    if (c === '"') inStr = true;
    else if (c === '{') { if (depth === 0) start = k; depth++; }
    else if (c === '}') { depth--; if (depth === 0 && start >= 0) { try { const e = JSON.parse(text.slice(start, k + 1)); if (e.title) out.push({ title: String(e.title), text: String(e.text || ''), where: resolvePlaceId(e.where) || null, day: e.day, type: e.type, importance: e.importance }); } catch { /* half-repaired */ } start = -1; } }
    else if (c === ']' && depth === 0) break;
  }
  return out.slice(0, 20);
}
const tracker = (id, kind) => { const t0 = Date.now(); progress.set(id, { kind, phase: 'waiting', ms: 0, t0 }); return (p) => progress.set(id, { kind, t0, ...progress.get(id), ...p, ms: Date.now() - t0 }); };
const done = (id) => progress.delete(id);

async function askJson(id, kind, messages, cfg, extra = {}) {
  const onProgress = tracker(id, kind);
  try { return await askJsonInner(id, kind, messages, { ...extra, onProgress }); } finally { done(id); }
}
async function askJsonInner(id, kind, messages, extra) {
  const r1 = await chat(messages, { json: true, kind, ...extra });
  logLLM(id, kind, messages, r1.text);
  try { return { obj: extractJson(r1.text), raw: r1 }; } catch (e1) {
    // Ask again without the broken reply: the prompt is unchanged up to the last message, so the server's cache
    // is reused, and the model writes the object at once instead of deliberating again.
    const lastMsg = messages.at(-1);
    const retry = [...messages.slice(0, -1), { ...lastMsg, content: lastMsg.content + '\n\nIMPORTANT: your previous attempt was not readable. Do not think aloud or plan in prose. Start your reply with { and write only the JSON object, shorter rather than longer.' }];
    extra.onProgress?.({ phase: 'retrying', note: 'the reply was not valid JSON; asking again' });
    const r2 = await chat(retry, { json: true, kind, temperature: 0.4, ...extra, thinking: 'off' });
    logLLM(id, kind + '-retry', retry, r2.text);
    try { return { obj: extractJson(r2.text), raw: r2 }; } catch (e2) {
      return { obj: null, raw: r2, error: e2.message, text: r2.text || r1.text };
    }
  }
}

const consolidating = new Map(); // save id -> promise (memory is compressed in the background)

// The receipt for written orders: read and tried on a copy of the world as soon as they are written (orders.js)
const previewing = new Map(); // save id -> promise
export async function previewOrderPlans(id) {
  if (previewing.has(id)) await previewing.get(id).catch(() => {});
  const job = (async () => {
    const cfg = loadConfig(); const state = loadState(id);
    const ask = cfg.provider === 'mock' ? null : async (msgs) => (await askJson(id, 'orders', msgs, cfg, { maxTokens: 900 })).obj;
    if (!(await previewOrders(state, ask))) return state.orders;
    // the player may have edited or removed orders meanwhile: a receipt is kept only for the text it was read from
    const fresh = loadState(id); const read = new Map(state.orders.map((o) => [o.id, o]));
    for (const o of fresh.orders) { const r = read.get(o.id); if (r?.plan && r.planFor === o.text) Object.assign(o, { plan: r.plan, planFor: r.planFor, preview: r.preview }); }
    saveState(id, fresh); return fresh.orders;
  })().finally(() => previewing.delete(id));
  previewing.set(id, job);
  return { orders: await job };
}

export async function advance(id, { span = '1d', orders } = {}) {
  if (consolidating.has(id)) await consolidating.get(id).catch(() => {});
  if (warming.has(id)) await warming.get(id); // the model is still reading the start of this very prompt
  if (previewing.has(id)) await previewing.get(id).catch(() => {});
  const cfg = loadConfig();
  const state = loadState(id);
  if (orders) { const prev = new Map(state.orders.map((o) => [o.id, o])); state.orders = orders.map((o) => ({ ...(prev.get(o.id) || {}), id: o.id || crypto.randomBytes(4).toString('hex'), text: String(o.text) })).filter((o) => o.text.trim()); }
  const chronicle = readChronicle(id);
  // The player's written orders are carried out by the engine first (travel, marches, recruiting, hiring),
  // so they truly happen; the story model is told what was done and narrates what follows.
  const carried = await carryOutOrders(state, cfg.provider === 'mock' ? null : async (msgs) => (await askJson(id, 'orders', msgs, cfg, { maxTokens: 900 })).obj).catch((e) => { console.warn('orders:', e.message); return []; });
  const messages = buildJumpPrompt(state, state.orders, span, chronicle, cfg);
  let { obj, raw, error, text } = await askJson(id, 'jump', messages, cfg, { spanDays: (SPANS[span] || SPANS['1m']).days, streamText: true });
  let salvaged = false;
  if (!obj) {
    // Unreadable even after repair and a retry: the realm still moves on (the ledger, vassals, seasons and marches
    // run as always), keeping whatever narrative can be salvaged from the reply.
    salvaged = true;
    const sum = extractField(text, 'summary');
    obj = { summary: sum || 'The ravens bring confused and contradictory reports this season; the maesters could make little sense of them.', events: [], changes: [] };
    console.warn(`turn ${state.meta.turn + 1}: simulator reply unreadable (${error}); the engine advanced the world alone`);
  }

  // Keep an undo point
  fs.writeFileSync(path.join(dir(id), 'prev-state.json'), JSON.stringify(state));
  fs.writeFileSync(path.join(dir(id), 'prev-chronicle.md'), chronicle);

  const spanInfo = SPANS[span] || SPANS['1m'];
  const dateFrom = dateStr(state.meta.date);
  const yearBefore = state.meta.date.year;
  state.meta.date = addDays(state.meta.date, spanInfo.days);
  // The years turn: everyone ages, and the very old may not see the next one
  const naturalDeaths = [];
  for (let y = yearBefore; y < state.meta.date.year; y++) {
    for (const c of Object.values(state.characters)) {
      if (!c.alive || c.age == null) continue;
      c.age += 1;
      const ailing = c.status === 'wounded' || /ailing|dying|sick|abed/i.test(`${c.traits} ${c.bio}`);
      const risk = c.age >= 60 ? ((c.age - 58) ** 2) / 2600 + (ailing ? 0.25 : 0) : ailing && c.age > 45 ? 0.08 : 0;
      if (risk && Math.random() < Math.min(0.85, risk)) naturalDeaths.push({ op: 'character', id: c.id, alive: false, cause: ailing ? 'illness' : 'old age' });
    }
  }
  state.meta.turn += 1;
  const orderText = state.orders.map((o) => o.text).join(' ');
  const playerChoseAllegiance = /fealty|swear|kneel|bend the knee|independen|king in the north|secede|declare (my|our)|crown (me|myself)|renounce/i.test(orderText);
  const playerDeclaredWar = /\b(declare war|make war|attack|march on|invade|assault|lay siege|besiege|ride against|strike at)\b/i.test(orderText);
  const { applied, rejected } = applyChanges(state, [...(obj.changes || []), ...naturalDeaths], { source: 'Reports & rumours', protectPlayer: true, playerChoseAllegiance, playerDeclaredWar, spanDays: spanInfo.days });
  const deathEvents = naturalDeaths.map((d) => state.characters[d.id]).filter((c) => c && !c.alive).map((c) => ({ title: `${c.name} is dead`, text: `${c.name}${c.title ? ', ' + c.title + ',' : ''} has died of ${c.bio && /ailing|dying/i.test(c.bio) ? 'a long illness' : 'old age'}, aged ${c.age}.`, where: state.houses[c.house]?.seat || null, importance: state.houses[c.house]?.lord === c.id || ['paramount', 'crown'].includes(state.houses[c.house]?.rank) ? 4 : 2, type: 'court', houses: [c.house] }));
  // Vassals whose obligations the story did not settle act on their own temper: dues, and the banners
  const touched = new Set((obj.changes || []).filter((c) => c && ['obligation', 'vassal'].includes(c.op)).map((c) => String(c.house || '').toLowerCase()));
  const vt = vassalTick(state, spanInfo.days, touched);
  applied.push(...vt.applied);
  // Marching orders the story didn't resolve: the engine walks the host along at marching pace
  for (const a of Object.values(state.armies)) {
    if (!a.march || a.movedTurn === state.meta.turn) continue;
    const to = a.march.to; // read before the move: arriving clears the march order
    // a host may be ordered against another host: it follows it wherever it goes, and the engine fights them when they meet
    if (String(to).startsWith('army:')) {
      const foe = state.armies[String(to).slice(5)];
      if (!foe) { delete a.march; a.status = 'holding'; continue; }
      const m = marchDays(a, a.pos, foe.pos); const f = Math.min(1, spanInfo.days / Math.max(1, m.days));
      a.pos = [a.pos[0] + (foe.pos[0] - a.pos[0]) * f, a.pos[1] + (foe.pos[1] - a.pos[1]) * f]; a.dest = foe.pos; a.destName = foe.name; a.at = null; a.status = f >= 1 ? 'engaging' : 'pursuing'; a.movedTurn = state.meta.turn;
      if (f >= 1) delete a.march;
      continue;
    }
    const dest = placePos(to, state.holdings); if (!dest) { delete a.march; continue; }
    const m = marchDays(a, a.pos, dest);
    const f = Math.min(1, spanInfo.days / Math.max(1, m.days));
    const mv = applyChanges(state, [{ op: 'army_move', army: a.id, to, progress: f, status: a.party ? (f >= 1 ? (a.party.returning ? 'home again' : `at ${placeName(state, to)}, ${a.party.why.replace(/^to |^for /, '')}`) : a.status) : f >= 1 ? 'arrived' : 'marching' }]);
    applied.push(...mv.applied);
    if (f >= 1) {
      // those riding with the host have arrived too
      for (const c of Object.values(state.characters)) if (c.loc === 'army:' + a.id && c.alive && c.id !== a.commander) c.loc = to;
      const cmd = state.characters[a.commander]; if (cmd && cmd.loc === 'army:' + a.id) cmd.loc = to;
      if (a.owner === state.meta.player) vt.events.push({ title: `${a.name} reaches ${placeName(state, to)}`, text: `${a.name} (${a.men.toLocaleString()} men) has arrived at ${placeName(state, to)}.`, where: to, importance: 2, type: 'war', houses: [a.owner] });
      delete a.march;
    }
  }
  // The road is not safe: outlaws, foragers, floods and snow — and now and then a friend
  const rd = roadEncounters(state, spanInfo.days);
  vt.events.push(...rd.events); applied.push(...rd.applied);
  // Riders on the road: characters travelling alone arrive when their days are spent
  for (const c of Object.values(state.characters)) {
    if (!c.travel || !c.alive) continue;
    c.travel.left -= spanInfo.days;
    if (c.travel.left <= 0) {
      const to = c.travel.to; const already = c.loc === to; delete c.travel; c.loc = to;
      if (already) continue; // a journey to where one already is ends quietly: an arrival is told once
      applied.push({ op: 'character', text: `${c.name} arrives at ${placeName(state, to)}` });
      if (c.house === state.meta.player) vt.events.push({ title: `${c.name} reaches ${placeName(state, to)}`, text: `${c.name} has arrived at ${placeName(state, to)} on the orders of ${state.characters[state.houses[state.meta.player].lord]?.name || 'the lord'}.`, where: to, importance: 2, type: 'court', houses: [c.house] });
    }
  }
  // Oaths are weighed: tempted lords treat with the enemy in secret, and the desperate turn their cloaks
  const tr = treacheryTick(state, spanInfo.days);
  vt.events.push(...tr.events); applied.push(...tr.applied);
  // Hosts in contact fight; hosts before enemy walls besiege them (unless the story told that battle itself)
  const toldBattles = new Set((obj.changes || []).filter((c) => c?.op === 'battle').flatMap((c) => [c.attacker, c.defender]).map((x) => String(x || '').toLowerCase()));
  const wf = resolveWarfare(state, spanInfo.days, { skip: toldBattles });
  vt.events.push(...wf.events); applied.push(...wf.applied);
  vt.events.push(...fieldService(state, spanInfo.days), ...gatherMusters(state));
  // The world goes on: the great threads of the story, rising threats, the other houses' lives
  const wt = worldTick(state, spanInfo.days);
  vt.events.push(...wt.events); applied.push(...wt.applied);
  // lords on the road with their households: feasts, weddings, their liege's hall, the market towns
  vt.events.push(...retinueTick(state, spanInfo.days).events);
  // The seasons turn on their own if the story does not turn them
  if (!applied.some((a) => a.op === 'season')) {
    const turned = seasonTick(state, spanInfo.days);
    if (turned) { vt.events.unshift({ title: `A white raven: ${turned.season} has come`, text: turned.text, where: resolvePlaceId('oldtown'), importance: 5, type: 'court', houses: [] }); applied.push({ op: 'season', text: `The season turns: ${turned.season.toUpperCase()}` }); }
  } else { state.world.seasonDays = 0; }
  // What the player's house has seen of the other hosts this period (fog of war)
  updateIntel(state);
  vt.events.push(...deliverReplies(state));
  postTick(state);
  // Settle the books for the period (after the story has changed the causes)
  const econNotes = settle(state, spanInfo.days);
  const events = (Array.isArray(obj.events) ? obj.events : []).map((e, k) => ({
    day: Math.max(1, Math.min(spanInfo.days, Math.round(Number(e.day) || Math.round(((k + 1) / ((obj.events?.length || 1) + 1)) * spanInfo.days)))),
    title: String(e.title || 'Untitled'), text: String(e.text || e.description || ''), details: e.details ? String(e.details) : '', where: resolvePlaceId(e.where || e.location) || null,
    importance: Math.max(1, Math.min(5, Number(e.importance) || 2)), type: String(e.type || 'court'), houses: Array.isArray(e.houses) ? e.houses : [],
    ...(Number(e.order) >= 1 ? { order: Number(e.order) } : {}),
  }));
  // every order the lord gave has its event, told first on its day
  events.push(...orderEvents(state, state.orders, events));
  events.push(...deathEvents, ...foldAnswers(vt.events));
  // every event has its day in the period, so the turn can be told in order
  for (const e of events) if (!e.day) e.day = 1 + Math.floor(Math.random() * spanInfo.days);
  events.sort((a, b) => a.day - b.day || (b.orderId ? 1 : 0) - (a.orderId ? 1 : 0));
  for (const a of applied.filter((x) => x.op === 'succession')) {
    const hh = state.houses[a.house];
    events.unshift({ title: `A new head of House ${hh?.name}`, text: a.text.replace(/^SUCCESSION: /, ''), where: hh?.seat || null, importance: a.house === state.meta.player ? 5 : 4, type: 'court', houses: [a.house] });
  }
  const p = state.meta.player;
  const mine = econNotes.filter((n) => n.house === p || state.houses[n.house]?.liege === p || (n.important && n.house === state.houses[p].liege));
  // the steward's small notes are the life of your lands, not headlines; only the grave ones are news
  for (const n of mine.slice(0, 6)) events.push({ title: n.important ? 'The ledger' : 'From the steward\'s accounts', text: n.text, where: n.holding || null, importance: n.important ? 3 : 1, type: 'economy', houses: [n.house], ...(n.important ? {} : { bg: true, mine: true }) });
  // every event has its day (successions at the start, the steward's accounts at the end) and an id for its pin
  for (const e of events) if (!e.day) e.day = /^A new head/.test(e.title) ? 1 : spanInfo.days;
  // the story threads the player follows, kept by the story from turn to turn (not the engine's great matters)
  if (Array.isArray(obj.threads)) {
    const now = new Map((state.storyThreads || []).map((t) => [t.title.toLowerCase(), t]));
    for (const t of obj.threads) {
      const title = String(t?.title || '').trim().slice(0, 60); if (!title) continue;
      if (GREAT_NAMES.some((g) => g === title.toLowerCase() || g.split(' ').filter((w) => w.length > 3 && title.toLowerCase().includes(w)).length >= 2)) continue; // the great matters are tracked apart
      if (/resolved|closed|ended/i.test(String(t.status || ''))) { now.delete(title.toLowerCase()); continue; }
      now.set(title.toLowerCase(), { title, last: String(t.last || '').slice(0, 200), date: dateStr(state.meta.date) });
    }
    state.storyThreads = [...now.values()].slice(-8);
  }
  // one date for every view (HUD, feed, reel, pins): day d of the period is the d-th day after it began
  events.forEach((e, k) => { e.id = `${state.meta.turn}-${k}`; e.date = dateStr(addDays(state.meta.date, e.day - spanInfo.days)); });
  const record = { carried, turn: state.meta.turn, dateFrom, date: dateStr(state.meta.date), span, orders: state.orders, summary: String(obj.summary || ''), events, applied, rejected, ms: raw?.ms, usage: raw?.usage, ledger: state.houses[p].ledger.at(-1), ...(salvaged ? { salvaged: true } : {}) };
  state.history.push(record);
  state.orders = [];
  // If the simulator raised no matter for the player over a moon or more, the realm brings one itself
  const newDecision = applied.some((a) => a.op === 'decision');
  const pendingCount = (state.decisions || []).filter((d) => d.status === 'pending').length;
  if (!newDecision && pendingCount === 0 && Math.random() < 0.75 * Math.min(1, spanInfo.days / 30)) {
    // the same kind of matter does not come before you twice in quick succession
    state.plots = state.plots || {}; const seen = state.plots.petitioned = state.plots.petitioned || {};
    const kindOf = (t) => t.replace(/House [A-Z][\w']*( of [A-Z][\w' ]*)?/g, '').replace(/[^a-z ]/gi, '').trim().slice(0, 40);
    let pet = null;
    for (let i = 0; i < 6 && !pet; i++) { const c = realmPetition(state); if (c && state.meta.turn - (seen[kindOf(c.title)] ?? -99) >= 6) pet = c; }
    if (pet) seen[kindOf(pet.title)] = state.meta.turn;
    if (pet) { const r = applyChanges(state, [{ op: 'decision', ...pet }]); record.applied.push(...r.applied); }
  }
  // Unanswered decisions lapse after a couple of turns — the world moved on without you
  // a matter waits its days (the King will not wait a moon for his answer), then the world decides without you
  const today = dayNumber(state.meta.date);
  for (const d of state.decisions || []) if (d.status === 'pending' && (d.day != null ? today - d.day >= (d.days || 14) : state.meta.turn - d.turn >= 3)) {
    d.status = 'lapsed';
    if (d.kind === 'liege_call') applyPetitionFx(state, [{ call: 'refuse' }]); // silence is refusal
    const fx = (d.options || []).flatMap((o) => o.fx || []);
    const rising = fx.find((e) => e.rising), rebel = fx.find((e) => e.rebel);
    if (rising) applyPetitionFx(state, [{ rising: [rising.rising[0], 'ignore'] }]);
    if (rebel) applyPetitionFx(state, [{ rebel: [rebel.rebel[0], 'release'] }]); // silence: they take themselves out of your realm
    if (d.lapse) applyPetitionFx(state, d.lapse); // the world decides for you
  }

  // Flush chronicle ops + major events into the markdown chronicle
  const notes = [...state.chronicle.map((c) => c.text), ...events.filter((e) => e.importance >= 5).map((e) => `${e.title} — ${e.text}`)];
  if (notes.length) appendChronicle(id, `\n### ${record.date} (turn ${record.turn})\n` + notes.map((n) => `- ${n}`).join('\n') + '\n');
  state.chronicle = [];

  saveState(id, state);
  try { appendWorldLog(id, state, record); } catch (e) { console.warn('world log:', e.message); }
  // Compress old turns into the chronicle without making the player wait
  const job = maybeConsolidate(id, state, cfg).catch((e) => { console.error('consolidation failed:', e.message); return null; }).finally(() => consolidating.delete(id));
  consolidating.set(id, job);
  // while the player watches the day unfold, the model reads the unchanging part of the next turn's prompt
  job.then(() => warmNext(id));
  return { state: loadState(id), turn: record, consolidated: 'background' };
}

// The model server can resume only from where an earlier request ended. So after each turn it is sent the next
// turn's prompt up to the point where it starts to change (rules, roster, chronicle, the log of past days): the
// next turn then reads only what is new — about a third of the prompt — and is two or three times faster.
const warming = new Map(); // save id -> promise
const GREAT_NAMES = THREADS.map((t) => t.name.toLowerCase());
export const STABLE_END = 'THE STATE OF THE REALM NOW';
function warmNext(id) {
  const cfg = loadConfig(); if (cfg.provider === 'mock' || warming.has(id)) return;
  let msgs; try { const st = loadState(id); msgs = buildJumpPrompt(st, [], '1d', readChronicle(id), cfg); } catch { return; }
  const cut = msgs[1].content.indexOf(STABLE_END); if (cut < 0) return;
  const job = chat([msgs[0], { role: 'user', content: msgs[1].content.slice(0, cut) }], { kind: 'warm', maxTokens: 1, thinking: 'off' }).catch(() => null).finally(() => warming.delete(id));
  warming.set(id, job);
}

async function maybeConsolidate(id, state, cfg, force = false) {
  const pending = state.history.filter((t) => t.turn > state.consolidatedThrough);
  const pendingTokens = estimateTokens(JSON.stringify(pending.map((t) => [t.summary, t.events])));
  const tooBig = pendingTokens > cfg.contextTokens * 0.2;
  // turns may be a day or a moon: consolidate by the days they cover (about every moon), keeping the last fortnight verbatim
  const daysOf = (t) => SPANS[t.span]?.days || 30;
  const pendingDays = pending.reduce((n, t) => n + daysOf(t), 0);
  let keep = 0, kept = 0; for (let i = pending.length - 1; i >= 0 && kept < 14; i--) { kept += daysOf(pending[i]); keep++; }
  if (!force && pendingDays < 44 && !tooBig) return null;
  const batch = pending.slice(0, Math.max(1, pending.length - keep));
  if (!batch.length) return null;
  const messages = buildConsolidatePrompt(state, batch, readChronicle(id));
  let obj = null; try { ({ obj } = await askJson(id, 'consolidate', messages, cfg)); } catch { obj = null; }
  // the engine's dated facts first — they cannot contradict the world; then what is open, then what is only said
  const bullets = (v) => String(Array.isArray(v) ? v.map((x) => `- ${x}`).join('\n') : v || '').trim();
  const threads = bullets(obj?.threads) || bullets(obj?.chronicle);
  const rumours = bullets(obj?.rumours);
  const from = batch[0].dateFrom || batch[0].date, to = batch.at(-1).date;
  const entry = [`### What happened\n${engineFacts(batch) || batch.map((t) => `- **${t.date}** — ${t.summary}`).join('\n')}`, threads && `### Still open, as of ${to}\n${threads}`, rumours && `### Said, not confirmed\n${rumours}`].filter(Boolean).join('\n\n');
  appendChronicle(id, `\n## ${from} — ${to}\n${entry}\n`);
  const fresh = loadState(id);
  fresh.consolidatedThrough = batch.at(-1).turn;
  // the open threads, for the feed's "threads to follow" (dated: true as of the end of this stretch)
  if (threads) fresh.openThreads = { asOf: to, items: threads.split('\n').map((l) => l.replace(/^[-*]\s*/, '').replace(/^As of [^:]+:\s*/i, '').trim()).filter(Boolean).slice(0, 8) };
  saveState(id, fresh);
  return { through: fresh.consolidatedThrough };
}

export async function consolidateNow(id) {
  const cfg = loadConfig();
  return maybeConsolidate(id, loadState(id), cfg, true);
}

export function undo(id) {
  const f = path.join(dir(id), 'prev-state.json');
  if (!fs.existsSync(f)) throw httpError(400, 'nothing to undo');
  fs.copyFileSync(f, path.join(dir(id), 'state.json'));
  const c = path.join(dir(id), 'prev-chronicle.md');
  if (fs.existsSync(c)) fs.copyFileSync(c, path.join(dir(id), 'chronicle.md'));
  fs.rmSync(f);
  return loadState(id);
}

export async function talk(id, charId, message) {
  if (consolidating.has(id)) await consolidating.get(id).catch(() => {});
  const cfg = loadConfig();
  const state = loadState(id);
  const c = state.characters[charId];
  if (!c) throw httpError(404, 'unknown character');
  if (!c.alive) throw httpError(400, `${c.name} is dead.`);
  if (moodOf(state, c).closed) throw httpError(409, `${c.name} will not hear you again this moon.`);
  // the engine weighs the words first: their nature, their mood, the odds — and settles the outcome
  const stance = weighAudience(state, c, message);
  const messages = buildChatPrompt(state, charId, message, readChronicle(id), cfg, stance);
  const onProgress = tracker(id, 'chat');
  let r; try { r = await chat(messages, { json: true, kind: 'chat', onProgress }); } finally { done(id); }
  logLLM(id, 'chat', messages, r.text);
  let reply = r.text, changes = [];
  try {
    const o = extractJson(r.text);
    reply = String(o.reply ?? o.response ?? o.text ?? o.message ?? '');
    changes = Array.isArray(o.changes) ? o.changes : [];
    if (!reply.trim()) throw new Error('empty');
  } catch {
    // broken JSON: rescue the "reply" field if we can, else keep the prose and drop the machinery
    const rescued = extractField(r.text, 'reply');
    if (rescued) { reply = rescued; changes = []; } else reply = String(r.text).replace(/```[\s\S]*?```/g, '').replace(/\{[\s\S]*\}/g, '').replace(/^\s*"?reply"?\s*:\s*/i, '').trim() || '*They say nothing you can make sense of.*';
    changes = [];
  }
  reply = reply.replace(/<br\s*\/?>/gi, '\n'); // the model writes HTML line breaks now and then; the scene shows its own
  // Sanity guard: a conversation can refine the ledger, not rewrite it (protects against model hallucinations)
  changes = changes.filter((ch) => {
    if (!ch || String(ch.op) !== 'figure') return true;
    if (!ch.source || /your name/i.test(ch.source)) ch.source = c.name;
    const h = state.houses[ch.house]; const f = h?.figures?.[ch.field]; const v = Number(String(ch.value ?? '').replace(/,/g, ''));
    if (!f || !isFinite(v) || ch.value === undefined) return true;
    const cur = Number(f.v) || 0;
    return cur === 0 ? v < 5000 : v / cur < 2.5 && v / cur > 0.4;
  });
  // Commands to one's own people are carried out: they may ride, recruit and hire in the house's name;
  // no one else may spend the player's gold or move the player's men.
  const p = state.meta.player; const ownMan = c.house === p;
  changes = changes.filter((ch) => {
    if (!ch || !['travel', 'ride', 'recruit', 'hire', 'hire_men'].includes(String(ch.op))) return true;
    if (!ownMan) return false;
    ch.house = p; if (['travel', 'ride'].includes(String(ch.op)) && !ch.character) ch.character = c.id;
    return true;
  });
  // "opinion" in an answer is theirs of you: the model sometimes files it under the lord it is talking to
  const lordId = state.houses[p].lord;
  for (const ch of changes) if (ch && String(ch.op) === 'character' && findChar(state, ch.id || ch.character) === lordId) { ch.id = c.id; delete ch.character; }
  // the one you speak to, and anyone you name to them, may be sent on the road by your word
  const mayMove = Object.values(state.characters).filter((x) => x.house === p && (x.id === c.id || named(state, x, message))).map((x) => x.id);
  changes = holdToVerdict(state, c, stance, changes);
  // far away, this is a letter: it flies for days, and the answer flies back — and only then does it count
  const lord = state.characters[lordId];
  const together = lord && !lord.travel && !c.travel && lord.loc === c.loc;
  if (!together) {
    const days = ravenDays(state, lord, c); const today = dayNumber(state.meta.date);
    const back = addDays(state.meta.date, days * 2);
    state.post = state.post || [];
    state.post.unshift({ id: `post_${state.meta.turn}_${state.post.length}_${c.id}`, to: c.id, toName: c.name, text: message, sent: dateStr(state.meta.date), sentDay: today, arriveDay: today + days, days, status: 'in flight' });
    state.pendingReplies = [...(state.pendingReplies || []), { char: c.id, arrivesDay: today + days * 2, changes, mayMove: ownMan ? mayMove : [], text: reply }];
    const turn = state.meta.turn;
    state.chats[charId] = [...(state.chats[charId] || []), { role: 'player', text: message, date: dateStr(state.meta.date), turn, via: 'raven' }, { role: 'npc', text: reply, date: dateStr(back), turn, pending: true, arrivesDay: today + days * 2, mood: stance.moodWord, ...(stance.verdict ? { verdict: stance.verdict } : {}) }];
    saveState(id, state);
    return { reply: null, raven: { days, back: dateStr(back) }, applied: [], rejected: [], state, stance: { verdict: null, mood: moodWord(stance.mood), patience: stance.mood.patience, full: stance.mood.full, closed: !!stance.mood.closed } };
  }
  let { applied, rejected } = applyChanges(state, changes, { source: c.name, protectPlayer: true, mayMove: ownMan ? mayMove : [] });
  // the model forgot to act on a plain command to a servant: read it by rule, with the servant as the one addressed
  if (ownMan && c.id !== state.houses[p].lord && !applied.some((a) => ['travel', 'ride', 'recruit', 'hire'].includes(a.op))) {
    const plan = readOrdersByRule(state, [{ text: message }], c.id);
    if (plan.actions.length) { const res = executeActions(state, plan.actions); for (const t of res[1] || []) (t.startsWith('could not') ? rejected : applied).push(t.startsWith('could not') ? { change: plan.actions[0], reason: t } : { op: plan.actions[0].op, text: t }); }
  }
  const turn = state.meta.turn;
  state.chats[charId] = [...(state.chats[charId] || []), { role: 'player', text: message, date: dateStr(state.meta.date), turn }, { role: 'npc', text: reply, date: dateStr(state.meta.date), turn, applied: applied.map((a) => a.text), mood: stance.moodWord, ...(stance.verdict ? { verdict: stance.verdict } : {}) }];
  if (state.chronicle.length) { appendChronicle(id, state.chronicle.map((x) => `- ${x.date}: ${x.text}`).join('\n') + '\n'); state.chronicle = []; }
  saveState(id, state);
  return { reply, applied, rejected, state, stance: { verdict: stance.verdict, mood: moodWord(stance.mood), patience: stance.mood.patience, full: stance.mood.full, closed: !!stance.mood.closed } };
}

// Sworn lords answering the call on the same day are one piece of news, not a flood of cards
function foldAnswers(evs) {
  const out = []; const byDay = new Map();
  for (const e of evs) { if (/^House .+ answers the call$/.test(e.title || '')) { const k = e.day || 0; byDay.set(k, [...(byDay.get(k) || []), e]); } else out.push(e); }
  for (const [day, g] of byDay) {
    if (g.length < 2) { out.push(...g); continue; }
    const parts = g.map((e) => { const m = String(e.text).match(/^(.+?) answers the call with ([\d,]+) men(, .+? riding with him)?.*?\(~(\d+) days\)/); return m ? `${m[1]}${m[3] ? ` with ${m[3].replace(/^, | riding with him$/g, '')}` : ''} (${m[2]} men, ~${m[4]} days away)` : e.title.replace(/ answers the call$/, ''); });
    const men = g.reduce((a, e) => a + (Number(String(e.text).match(/with ([\d,]+) men/)?.[1]?.replace(/,/g, '')) || 0), 0);
    out.push({ ...g[0], day, title: `${g.length} lords answer the call — ${men.toLocaleString('en-GB')} men on the march`, text: `${parts.join('; ')}.`, houses: [...new Set(g.flatMap((e) => e.houses || []))], importance: 3 });
  }
  return out;
}
// Answers to letters written from an audience land when their raven does: the letter reaches the inbox, the
// conversation, and the timeline, and what the writer promised takes effect then — not the day it was asked.
function deliverReplies(state) {
  const today = dayNumber(state.meta.date); const events = []; const p = state.meta.player; const lordId = state.houses[p].lord;
  const keep = [];
  for (const r of state.pendingReplies || []) {
    const c = state.characters[r.char];
    if (!c || r.arrivesDay > today) { if (c) keep.push(r); continue; }
    const res = applyChanges(state, r.changes || [], { source: c.name, protectPlayer: true, mayMove: r.mayMove || [] });
    const entry = (state.chats[r.char] || []).find((m) => m.pending && m.arrivesDay === r.arrivesDay);
    if (entry) { delete entry.pending; entry.date = dateStr(state.meta.date); entry.applied = res.applied.map((a) => a.text); }
    state.ravens.unshift({ id: Date.now() + Math.random(), day: today, from: c.id, fromName: c.name, to: lordId, text: String(r.text).replace(/\*[^*]*\*/g, '').trim(), date: dateStr(state.meta.date), read: false });
    const first = String(r.text).replace(/\*[^*]*\*/g, ' ').replace(/\s+/g, ' ').trim().split(/(?<=[.!?])\s/)[0] || '';
    const whence = String(c.loc || '').startsWith('army:') ? `the camp of ${state.armies[c.loc.slice(5)]?.name || 'a host'}` : placeName(state, c.loc);
    events.push({ title: `${c.name} answers ${state.characters[lordId]?.name || 'the lord'}`, text: `A raven from ${whence}: “${first.slice(0, 220)}”${res.applied.length ? ` — ${res.applied.map((a) => a.text).join('; ')}` : ''}`, where: resolvePlaceId(c.loc) || null, importance: 3, type: 'diplomacy', houses: [p, c.house], mine: true, day: 1 });
  }
  state.pendingReplies = keep;
  return events;
}

export async function suggest(id) {
  const cfg = loadConfig();
  const state = loadState(id);
  const { obj, text } = await askJson(id, 'suggest', buildSuggestPrompt(state, readChronicle(id), cfg), cfg);
  const list = obj?.suggestions || String(text || '').split('\n').filter((l) => l.trim()).slice(0, 7);
  return { suggestions: list.map(String) };
}

// News the player has read on the map: its pin goes away (keys are "turn-index"; old ones are forgotten)
export function acknowledge(id, keys) {
  const state = loadState(id);
  state.acks = Object.fromEntries(Object.entries(state.acks || {}).filter(([, t]) => state.meta.turn - t < 4));
  for (const k of (Array.isArray(keys) ? keys : []).slice(0, 200)) state.acks[String(k).slice(0, 80)] = state.meta.turn;
  saveState(id, state);
  return { ok: true };
}

export function markRavensRead(id) {
  const state = loadState(id);
  state.ravens.forEach((r) => { r.read = true; });
  saveState(id, state);
  return state.ravens;
}

export function editState(id, patch) {
  // Manual GM edits from the UI (e.g. correcting a figure). Uses the same change ops.
  const state = loadState(id);
  const res = applyChanges(state, patch.changes || [], { source: 'Game master' });
  saveState(id, state);
  return { ...res, state };
}

// Direct actions that take effect immediately in the ledger (and are told to the simulator as orders).
export function act(id, body) {
  const state = loadState(id);
  const p = state.meta.player; const me = state.houses[p];
  // an order may carry a note for the simulator only (what the ledger already settled), never shown to the player
  // status: 'done' — the engine settled it here and now (the story narrates it, never repeats it); 'underway' —
  // set in motion, to finish in time (a march); none — a written order the turn will carry out
  const addOrder = (text, note = '', status = null, result = null) => {
    const settled = status === 'done' ? '[Already carried out by the engine; do not apply it again, narrate what follows.]' : status === 'underway' ? '[Already set in motion by the engine; do not apply it again.]' : '';
    const n = [note, note.startsWith('[Already') ? '' : settled].filter(Boolean).join(' ');
    state.orders.push({ id: crypto.randomBytes(4).toString('hex'), text, auto: true, ...(n ? { note: n } : {}), ...(status ? { status, executed: true, result: result ? [result] : [text] } : {}) });
  };
  let result = {};
  switch (body.kind) {
    case 'tax': {
      if (!TAX_LEVELS[body.level]) throw httpError(400, 'bad tax level');
      applyChanges(state, [{ op: 'tax', house: p, level: body.level }]);
      addOrder(`Proclaim ${TAX_LEVELS[body.level].label.toLowerCase()} taxes across my lands and on my vassals' dues.`, '', 'done');
      break;
    }
    case 'project': {
      let w; try { w = startWorks(state, body.template, body.holding); } catch (e) { throw httpError(409, e.message); }
      addOrder(`Fund works: ${w.name} (${w.cost} gold dragons over ${w.months} moons).`, '', 'done', `Work begins: ${w.name}`);
      break;
    }
    case 'dues': {
      if (!me.liege) throw httpError(400, 'you owe dues to no one');
      if (!['paying', 'late', 'withholding'].includes(body.status)) throw httpError(400, 'bad status');
      me.obligations = { ...(me.obligations || {}), tribute: body.status };
      const lg = state.houses[me.liege];
      addOrder(body.status === 'paying' ? `Pay my dues to House ${lg.name} in full.` : body.status === 'late' ? `Delay my dues to House ${lg.name}; send excuses and small sums.` : `Withhold all dues from House ${lg.name}.`, '', 'done');
      break;
    }
    case 'cancel_project': {
      const pr = state.projects.find((x) => x.id === body.project && x.house === p); if (!pr) throw httpError(404, 'no project');
      pr.status = 'cancelled';
      break;
    }
    case 'call_banners': {
      const vassals = (body.vassals || []).filter((v) => state.houses[v]?.liege === p);
      if (!vassals.length) throw httpError(400, 'choose at least one vassal');
      const muster = resolvePlaceId(body.at) || me.seat;
      const called = callBanners(state, { vassals, at: muster });
      if (Number(body.ownLevies) >= 50) { try { called.push(...raiseLevies(state, { at: muster, men: body.ownLevies })); } catch (e) { called.push(`could not raise your own levies: ${e.message}`); } }
      const at = state.holdings[muster] ? state.holdings[muster].name : state.holdings[me.seat]?.name;
      addOrder(`CALL THE BANNERS: I summon ${vassals.map((v) => 'House ' + state.houses[v].name).join(', ')} to muster their levies at ${at}${body.deadline ? ' within ' + body.deadline : ''}.${body.note ? ' ' + body.note : ''} Raise my own levies as well${body.ownLevies ? ` (${body.ownLevies} men)` : ''}.`, '', 'underway', called.join('; '));
      break;
    }
    case 'decide': {
      const d = (state.decisions || []).find((x) => x.id === body.decision && x.status === 'pending');
      if (!d) throw httpError(404, 'no such decision');
      const opt = d.options[Number(body.option)]; if (!opt && !body.custom) throw httpError(400, 'bad option');
      d.status = 'decided'; d.choice = opt ? opt.label : String(body.custom).slice(0, 500); d.note = body.note ? String(body.note).slice(0, 500) : ''; d.decidedTurn = state.meta.turn;
      let settled = [];
      if (opt?.fx) { settled = applyPetitionFx(state, opt.fx, dateStr(state.meta.date)); d.effects = settled; }
      addOrder(`DECISION — ${d.title}: I choose "${d.choice}".${d.note ? ' ' + d.note : ''}`, settled.length ? `[Already settled by the ledger, do not apply again: ${settled.join('; ')}. Narrate how people react.]` : '', settled.length ? 'done' : null);
      if (settled.length) result.effects = settled;
      break;
    }
    case 'appoint': {
      const ROLES = { steward: 'Steward', maester: 'Maester', master_at_arms: 'Master-at-arms', captain: 'Captain of the guard', spymaster: 'Master of whisperers', commander: 'Commander', castellan: 'Castellan' };
      const c = state.characters[body.character]; if (!c || !c.alive) throw httpError(404, 'no such person');
      if (!ROLES[body.role]) throw httpError(400, 'bad office');
      for (const o of Object.values(state.characters)) if (o.house === p && o.id !== c.id && o.roles?.includes(body.role) && body.role !== 'commander') o.roles = o.roles.filter((r) => r !== body.role);
      c.roles = [...new Set([...(c.roles || []), body.role])];
      if (c.house !== p) { c.memories = [...(c.memories || []), `Appointed ${ROLES[body.role]} of House ${me.name}.`]; }
      c.opinion = Math.min(100, (c.opinion || 0) + 10);
      addOrder(`Appoint ${c.name} as ${ROLES[body.role]} of House ${me.name}.`, '', 'done');
      break;
    }
    case 'grant': {
      const h = state.holdings[body.holding]; if (!h || h.owner !== p) throw httpError(400, 'you can only grant your own holdings');
      if (h.id === me.seat) throw httpError(400, 'you cannot give away your own seat');
      const to = state.houses[body.house]; if (!to || to.liege !== p) throw httpError(400, 'you can only grant lands to your sworn vassals');
      applyChanges(state, [{ op: 'holding', id: h.id, owner: to.id, note: `Granted by House ${me.name} to House ${to.name}` }, { op: 'relation', a: p, b: to.id, delta: 20, reason: `Granted ${h.name}` }]);
      const lord = to.lord && state.characters[to.lord]; if (lord) { lord.opinion = Math.min(100, (lord.opinion || 0) + 20); lord.loyalty = Math.min(100, (lord.loyalty || 60) + 15); }
      addOrder(`Grant ${h.name} and its lands to House ${to.name} for their loyal service.`, '', 'done');
      break;
    }
    case 'raise': {
      let lines; try { lines = raiseLevies(state, { at: body.at, men: body.men, commander: body.commander, name: body.name }); } catch (e) { throw httpError(400, e.message); }
      addOrder(`Raise ${Math.round(Number(body.men) || 0)} of my own levies at ${placeName(state, body.at || me.seat)}${body.name ? ` as "${body.name}"` : ''}.`, '', 'done', lines.join('; '));
      result.summary = lines.join('; ');
      break;
    }
    case 'disband': {
      const a = state.armies[body.army]; if (!a || (a.owner !== p && a.serving !== p)) throw httpError(400, 'not your host');
      const owner = state.houses[a.owner];
      // the sworn houses take their own men home
      let others = 0;
      const sworn = Object.values(a.contingents || {}).reduce((x, y) => x + y, 0);
      const scale = sworn > a.men ? a.men / sworn : 1; // losses fall on every banner alike
      for (const [vid, men] of Object.entries(a.contingents || {})) {
        const v = state.houses[vid]; if (!v) continue; const back = Math.round(men * scale * 0.9); others += men * scale;
        v.figures.levies = { ...(v.figures.levies || {}), v: (Number(v.figures.levies?.v) || 0) + back };
        v.obligations = { ...(v.obligations || {}), levies: 'not_called' }; delete v.obligations.host;
        for (const c of Object.values(state.characters)) if (c.loc === 'army:' + a.id && c.house === vid) c.loc = v.seat;
      }
      const home = Math.round(a.type === 'fleet' ? 0 : Math.max(0, a.men - others) * 0.9);
      for (const c of Object.values(state.characters)) if (c.loc === 'army:' + a.id) c.loc = a.owner === p ? (a.at || me.seat) : owner.seat;
      delete state.armies[a.id];
      if (home) applyChanges(state, [{ op: 'figure', house: a.owner, field: 'levies', delta: home, source: 'Men sent home' }]);
      if (a.owner !== p) { owner.obligations = { ...(owner.obligations || {}), levies: 'not_called' }; delete owner.obligations.host; }
      addOrder(`${a.owner === p ? 'Disbanded' : 'Released from service'} ${a.name}; the men go home to their fields.`, '', 'done');
      break;
    }
    // take back what is under way: a rider turns for home, a host halts where it stands
    case 'recall': {
      if (body.character) {
        const c = state.characters[body.character]; if (!c || c.house !== p || !c.travel) throw httpError(400, 'no one of yours is on that road');
        const home = c.travel.fromPlace || me.seat;
        const r = applyChanges(state, [{ op: 'travel', character: c.id, to: home }], { source: 'Your orders' });
        if (!r.applied.length) throw httpError(409, r.rejected[0]?.reason || 'they cannot turn back');
        addOrder(`Recall ${c.name}: turn back for ${placeName(state, home)}.`, '', 'underway', r.applied[0].text);
        result.summary = r.applied[0].text; break;
      }
      const a = state.armies[body.army]; if (!a || !commandable(state, a) || !a.march) throw httpError(400, 'that host is not marching');
      delete a.march; a.dest = null; a.destName = null; a.status = 'holding';
      addOrder(`${a.name} halts and holds where it stands.`, '', 'done'); result.summary = `${a.name} halts.`; break;
    }
    case 'march': {
      const a = state.armies[body.army]; if (!a || (a.owner !== p && a.serving !== p)) throw httpError(400, 'not your host');
      if (String(body.to).startsWith('army:')) {
        const foe = state.armies[String(body.to).slice(5)]; if (!foe) throw httpError(400, 'no such host');
        const m = marchDays(a, a.pos, foe.pos);
        a.march = { to: 'army:' + foe.id, since: state.meta.turn }; a.dest = foe.pos; a.destName = foe.name; a.at = null; a.status = 'pursuing';
        addOrder(`${a.name} marches to attack ${foe.name} (House ${state.houses[foe.owner]?.name}, ~${foe.men} men), ~${m.days} days away${body.intent ? ' — ' + body.intent : ''}.`, '[The engine will fight this battle when the hosts meet; narrate the approach.]', 'underway');
        break;
      }
      const to = resolvePlaceId(body.to) || body.to; body.to = to;
      const dest = placePos(to, state.holdings); if (!dest) throw httpError(400, 'unknown destination');
      const m = marchDays(a, a.pos, dest);
      a.march = { to: body.to, since: state.meta.turn }; a.dest = dest; a.destName = placeName(state, body.to); a.at = null; a.status = 'marching';
      addOrder(`${a.name} marches on ${placeName(state, body.to)} (~${m.miles} miles, ~${m.days} days)${body.intent ? ' — ' + body.intent : ''}.`, '', 'underway');
      break;
    }
    case 'order': {
      addOrder(String(body.text || '').slice(0, 2000));
      break;
    }
    // the lord's own acts, settled at once (server/court.js)
    case 'gift': case 'feast': case 'tourney': case 'judge': case 'declare_war': case 'scheme': case 'secrecy': {
      let r;
      try { r = body.kind === 'gift' ? court.gift(state, body) : body.kind === 'feast' ? court.feast(state) : body.kind === 'tourney' ? court.tourney(state) : body.kind === 'judge' ? court.judge(state, body) : body.kind === 'scheme' ? court.scheme(state, { house: body.house, kind: body.kind2 }) : body.kind === 'secrecy' ? court.secrecy(state, body) : court.declareWar(state, body); } catch (e) { throw httpError(e.status || 400, e.message); }
      addOrder(r.text, r.note || '', 'done', r.summary); result.summary = r.summary;
      break;
    }
    default: throw httpError(400, 'unknown action');
  }
  saveState(id, state);
  return { state, ...result };
}

export async function council(id, members, message) {
  if (consolidating.has(id)) await consolidating.get(id).catch(() => {});
  const cfg = loadConfig();
  const state = loadState(id);
  const ids = (members || []).filter((m) => state.characters[m]?.alive);
  if (!ids.length) throw httpError(400, 'no one to hold council with');
  const messages = buildCouncilPrompt(state, ids, message, readChronicle(id), cfg);
  const onProgress = tracker(id, 'council');
  const people = Object.fromEntries(ids.map((i) => [i, state.characters[i].name]));
  let read;
  try {
    let r = await chat(messages, { json: true, kind: 'council', onProgress });
    logLLM(id, 'council', messages, r.text);
    read = readReplies(r.text, people, ids[0]);
    // nothing said, or only gestures: ask once more, plainly
    if (!read.replies.length || !read.spoken) {
      const again = [...messages.slice(0, -1), { role: 'user', content: messages.at(-1).content + '\n\nEach counsellor must SPEAK — their answer in words, first person; at most one short *gesture*. JSON only, no code fences.' }];
      r = await chat(again, { json: true, kind: 'council', onProgress });
      logLLM(id, 'council', again, r.text);
      const second = readReplies(r.text, people, ids[0]); if (second.replies.length) read = second;
    }
  } finally { done(id); }
  if (!read.replies.length) throw httpError(502, 'The council could not agree on an answer. Put the question again.');
  // each counsellor seated has a place in the answer: one who did not speak is shown keeping silent, not lost
  const listening = !String(message || '').trim();
  if (!listening) for (const i of ids) if (!read.replies.some((x) => x.speaker === i)) read.replies.push({ speaker: i, text: `*${state.characters[i].name} listened, and said nothing this time.*`, silent: true });
  const replies = read.replies; const changes = read.changes;
  const { applied, rejected } = applyChanges(state, changes, { source: 'Council', protectPlayer: true });
  const key = 'council:' + ids.sort().join(',');
  const date = dateStr(state.meta.date), turn = state.meta.turn;
  state.chats[key] = [...(state.chats[key] || []), ...(listening ? [] : [{ role: 'player', text: message, date, turn }]), ...replies.map((x) => ({ role: 'npc', speaker: x.speaker, text: x.text, date, turn }))];
  saveState(id, state);
  return { replies, applied, rejected, state, key };
}
