// Game session management: saves, time jumps, conversations, memory consolidation.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url'; // a file URL's pathname is /C:/… on Windows; fileURLToPath gives a real path
import { chat, extractJson, loadConfig, estimateTokens } from './llm.js';
import { buildSuggestPrompt, buildConsolidatePrompt, engineFacts } from './prompts.js';
import { createInitialState, migrateState, applyChanges, placeName, addDays, dateStr, spanOf, resolvePlaceId, dayNumber } from '../public/js/shared/world.js';
import { partyOf, together } from '../public/js/engine/parties.js';
import { settleWorld } from '../public/js/engine/state/settle.js';
import { validate } from '../public/js/engine/state/validate.js';
import { settle, initEconomy } from '../public/js/shared/economy.js';
import { engineDay } from './turn/day.js';
import { dateOfDay } from '../public/js/engine/time.js';
import { forces } from '../public/js/engine/parties.js';
import { atWar } from '../public/js/shared/warfare.js';
import { random } from '../public/js/engine/rng.js';
import { nextId } from '../public/js/engine/ids.js';
import { withDice } from './dice.js';
import { stripForeignScript } from './ai/schema.js';
import { postTick } from '../public/js/shared/errands.js';
import { nextTurnLength } from '../public/js/shared/turns.js';
import { realmPetition, applyPetitionFx } from '../public/js/shared/petitions.js';
import { updateKnowledge, eyesOf, knows, holdNews, newsDue, seesParty } from '../public/js/engine/knowledge.js';
import { outcomeFor, standing } from '../public/js/shared/standing.js';
import { emit, fact, flush, factById } from '../public/js/engine/facts/log.js';
import { VERBS, perform, told, verbOfKind } from '../public/js/engine/actions/registry.js';
import { carryOutOrders, readOrders, answerOrder, orderEvents } from './orders.js';
import { interpretOrder } from './orders/interpret.js';
import { runMinds, knownTo } from './minds.js';
import { directWeek, thinWeek } from './director.js';
import { narrateTurn, narratorOn } from './narrator.js';
import { deliverLetters, reveal } from './letters.js';
import { replyText, promisesIn } from './ai/calls/audience.js';
import { makeCommitment, COMMITMENTS, commitmentsTick } from '../public/js/engine/politics/commitments.js';
import { runCall } from './ai/client.js';
import { parseOrder } from './orders/parse.js';
import { weighAudience, holdToVerdict, moodOf, moodWord } from '../public/js/shared/temperament.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
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
  settleWorld(state); // a save is always settled: every party's state and every person's activity true to the world
  fs.mkdirSync(dir(id), { recursive: true });
  // what was done goes into the fact log before the state that follows from it (docs/gdd/03-architecture.md §11)
  appendFacts(id, flush(state));
  delete state.meta.clock; // the clock runs only while a turn is being played
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

// ── The save's own history (docs/gdd/03-architecture.md §11) ──
//   facts.jsonl              every fact, one JSON object per line, appended as it is saved (never rewritten, only cut
//                            back by an undo)
//   turns/000123.json        each turn's record (state.history keeps only the recent ones the game still reads)
//   snapshots/000123.json.gz the world as it stood before turn 123 (state, chronicle, the logs' lengths): undo's
//                            ground. The last ten are kept; an ironman chronicle keeps none.
const pad = (n) => String(n).padStart(6, '0');
const KEEP_SNAPSHOTS = 10, KEEP_HISTORY = 30;
const sizeOf = (f) => { try { return fs.statSync(f).size; } catch { return 0; } };
function appendFacts(id, facts) {
  if (facts.length) fs.appendFileSync(path.join(dir(id), 'facts.jsonl'), facts.map((f) => JSON.stringify(f)).join('\n') + '\n');
}
/**
 * The fact log, filtered: turns `from`..`to` (inclusive), facts touching `house`, of `kind`, at most `limit` (the
 * newest). `view: 'player'` keeps only what the player's house may know: no one else's secrets, no other houses'
 * private business, nothing it has not yet heard of (engine/knowledge.js).
 */
export function readFacts(id, { from, to, house, kind, limit = 2000, view } = {}) {
  const f = path.join(dir(id), 'facts.jsonl'); if (!fs.existsSync(f)) return [];
  const lo = Number(from) || -Infinity, hi = to == null || to === '' ? Infinity : Number(to);
  const st = view === 'player' ? loadState(id) : null; const me = st?.meta.player;
  const E = st ? eyesOf(st, me) : null;
  const known = (x) => !me || knows(st, me, x, undefined, E);
  const out = [];
  for (const line of fs.readFileSync(f, 'utf8').split('\n')) {
    if (!line) continue;
    let x; try { x = JSON.parse(line); } catch { continue; }
    if (x.turn < lo || x.turn > hi || (house && !x.houses?.includes(house)) || (kind && x.kind !== kind) || !known(x)) continue;
    out.push(x);
  }
  return out.slice(-Math.max(1, Math.min(20000, Number(limit) || 2000)));
}
/** A turn's record: from its file, or (a save from before turn files) from the state's history. */
export function readTurn(id, n) {
  const f = path.join(dir(id), 'turns', `${pad(Number(n))}.json`);
  if (fs.existsSync(f)) return JSON.parse(fs.readFileSync(f, 'utf8'));
  const t = loadState(id).history.find((x) => x.turn === Number(n));
  if (!t) throw httpError(404, 'no such turn');
  return t;
}
function writeTurn(id, record) {
  const d = path.join(dir(id), 'turns'); fs.mkdirSync(d, { recursive: true });
  fs.writeFileSync(path.join(d, `${pad(record.turn)}.json`), JSON.stringify(record));
}
// A save from before turn files: its history is written out once, and its applied lines become a best-effort fact log
// (kind 'legacy'; docs/gdd/03-architecture.md §12.7), so the world log UI and the memory have something to read.
function archiveLegacy(id, state) {
  const d = path.join(dir(id), 'turns'); if (fs.existsSync(d)) return;
  fs.mkdirSync(d, { recursive: true });
  const legacy = [];
  for (const t of state.history || []) {
    writeTurn(id, t);
    (t.applied || []).forEach((a, k) => legacy.push({ id: `f${t.turn}.L${k + 1}`, turn: t.turn, day: null, kind: 'legacy', actors: [], houses: [], vis: { scope: 'public' }, importance: 1, text: String(a.text || a) }));
  }
  if (legacy.length && !fs.existsSync(path.join(dir(id), 'facts.jsonl'))) appendFacts(id, legacy);
}
/** Keep the world as it stands before turn `state.meta.turn + 1` is played (nothing, in an ironman chronicle). */
function snapshot(id, state) {
  if (state.meta.settings?.ironman) return;
  const d = path.join(dir(id), 'snapshots'); fs.mkdirSync(d, { recursive: true });
  const snap = { turn: state.meta.turn + 1, state, chronicle: readChronicle(id), factsBytes: sizeOf(path.join(dir(id), 'facts.jsonl')), worldLogBytes: sizeOf(path.join(dir(id), 'world-log.md')) };
  fs.writeFileSync(path.join(d, `${pad(snap.turn)}.json.gz`), zlib.gzipSync(JSON.stringify(snap)));
  const all = fs.readdirSync(d).filter((f) => /^\d{6}\.json\.gz$/.test(f)).sort();
  for (const f of all.slice(0, -KEEP_SNAPSHOTS)) fs.rmSync(path.join(d, f), { force: true });
}
/** How many turns can be unmade now: the unbroken run of snapshots back from the latest turn. */
export function undoDepth(id, state = loadState(id)) {
  if (state.meta.settings?.ironman) return 0;
  const d = path.join(dir(id), 'snapshots'); let n = 0;
  while (n < KEEP_SNAPSHOTS && state.meta.turn - n >= 1 && fs.existsSync(path.join(d, `${pad(state.meta.turn - n)}.json.gz`))) n++;
  if (!n && fs.existsSync(path.join(dir(id), 'prev-state.json'))) n = 1; // a save from before snapshots kept one undo point
  return n;
}

export function writeChronicle(id, text) { fs.writeFileSync(path.join(dir(id), 'chronicle.md'), text); }
function appendChronicle(id, text) { fs.appendFileSync(path.join(dir(id), 'chronicle.md'), text); }
function logLLM(id, kind, messages, response) {
  const entry = { t: new Date().toISOString(), kind, promptTokens: estimateTokens(messages.map((m) => m.content).join('\n')), response };
  fs.appendFileSync(path.join(dir(id), 'llm-log.jsonl'), JSON.stringify(entry) + '\n');
  fs.writeFileSync(path.join(dir(id), `last-prompt-${kind}.txt`), messages.map((m) => `### ${m.role.toUpperCase()}\n${m.content}`).join('\n\n'));
}

export function newGame(scenario, house, { ironman = false, seed } = {}) {
  const state = createInitialState(scenario, house, seed != null ? { seed: Number(seed) >>> 0 } : {});
  // an ironman chronicle is written once: no undo, no snapshots (docs/gdd/03-architecture.md §11)
  if (ironman) state.meta.settings = { ...(state.meta.settings || {}), ironman: true };
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
  state.orders = (orders || []).map((o) => ({ ...(prev.get(o.id) || {}), id: o.id || nextId(state, 'o'), text: String(o.text || '').slice(0, 2000) })).filter((o) => o.text.trim());
  saveState(id, state);
  return state.orders;
}

// What the model is doing right now, per save (polled by the browser while it waits)
const progress = new Map();
export function getProgress(id) {
  const p = progress.get(id); if (!p) return null;
  const { text, ...rest } = p;
  return { ...rest, ms: Date.now() - p.t0 };
}
const tracker = (id, kind, seed = {}) => { const t0 = Date.now(); progress.set(id, { kind, phase: 'waiting', ms: 0, t0, ...seed }); return (p) => progress.set(id, { kind, t0, ...progress.get(id), ...p, ms: Date.now() - t0 }); };
const done = (id) => progress.delete(id);

async function askJson(id, kind, messages, cfg, extra = {}) {
  // the one speaking is named, so the player is told 'the lords take counsel', not 'step 2 of 5'
  const onProgress = tracker(id, kind, extra.agentLabel ? { agentLabel: extra.agentLabel, agentStep: extra.agentStep, agentTotal: extra.agentTotal } : {});
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
/** Wait for a save's background work (the chronicle's consolidation, a receipt being read) to finish writing it. */
export async function settled(id) {
  await consolidating.get(id)?.catch(() => {});
  await previewing.get(id)?.catch(() => {});
}
/** How many lords get a mind each week (config `minds`: 3 | 6 | 10, or "off" for the old Hand; 04 §5.1). */
export const mindsBudget = (cfg) => (cfg.minds === 'off' || cfg.minds === false ? 0 : [3, 6, 10].includes(Number(cfg.minds)) ? Number(cfg.minds) : 6);

// The receipt for written orders: read and tried on a copy of the world as soon as they are written (orders.js).
// Each order is read by the rules, and by the model only when the rules cannot (orders/interpret.js); every model call
// is logged with the rest (llm-log.jsonl), so a misreading can be found and a fine-tuning set built from it.
const interpreter = (id, state, cfg) => (text) => interpretOrder(state, text, { cfg, log: (kind, messages, response) => logLLM(id, kind, messages, response) });
const previewing = new Map(); // save id -> promise
export async function previewOrderPlans(id) {
  if (previewing.has(id)) await previewing.get(id).catch(() => {});
  const job = (async () => {
    const cfg = loadConfig(); const state = loadState(id);
    await readOrders(state, interpreter(id, state, cfg)); // the model, if asked, is asked here
    // the player may have edited or removed orders meanwhile: a reading is kept only for the words it was read from;
    // what was edited is read now, and every receipt is tried again in the order the orders stand
    const fresh = loadState(id); const read = new Map(state.orders.map((o) => [o.id, o]));
    for (const o of fresh.orders) { const r = read.get(o.id); if (r?.parsed && r.parsedFor === o.text) Object.assign(o, { parsed: r.parsed, parsedFor: r.parsedFor }); }
    await readOrders(fresh, interpreter(id, fresh, cfg));
    saveState(id, fresh); return fresh.orders;
  })().finally(() => previewing.delete(id));
  previewing.set(id, job);
  return { orders: await job };
}
/** The lord answers an order's question (a chip under it): the reading is patched, or the words added and read again. */
export async function answerOrderQuestion(id, orderId, option) {
  if (previewing.has(id)) await previewing.get(id).catch(() => {});
  const cfg = loadConfig(); const state = loadState(id);
  const o = state.orders.find((x) => x.id === orderId); if (!o) throw httpError(404, 'no such order');
  if (!answerOrder(o, Number(option))) throw httpError(400, 'no such answer');
  // the answered order keeps its patched reading; its receipt (and every later order's) is tried again
  await readOrders(state, interpreter(id, state, cfg));
  saveState(id, state);
  return { orders: state.orders };
}

/**
 * Let the days pass (03 §6.2). opts: { span ('auto' = until something happens), orders, onSegment(segment) — each
 * week as soon as it is told (the SSE stream), stopWanted() → the day the lord asked to stop on, if he has }.
 */
export async function advance(id, { span = 'auto', orders, onSegment = null, stopWanted = null, stopAt = null, replayMinds = null, replayHooks = null } = {}) {
  if (consolidating.has(id)) await consolidating.get(id).catch(() => {});
  if (previewing.has(id)) await previewing.get(id).catch(() => {});
  const cfg = loadConfig();
  const state = loadState(id);
  // everything the engine rolls this turn comes from this save's dice (server/dice.js), awaits and all
  return withDice(state, () => advanceWith(id, state, cfg, { span, orders, onSegment, stopWanted, stopAt, replayMinds, replayHooks }));
}

/**
 * Stop here (05 §5): the lord watched the turn play and stops it on a day. The turn is played again from its snapshot
 * with the same orders and the same minds' choices, as far as that day and no further — the days he saw come out the
 * same (the dice are the save's, and the day loop runs a day at a time) — and the rest is unmade.
 */
export async function stopHere(id, day) {
  const state = loadState(id);
  if (state.meta.settings?.ironman) throw httpError(403, 'An ironman chronicle cannot be unwritten: stop the days while they pass.');
  const t = readTurn(id, state.meta.turn);
  const d = Math.round(Number(day) || 0);
  const days = spanOf(t.span).days;
  if (d < 1 || d >= days) throw httpError(400, `the turn ran ${days} day${days > 1 ? 's' : ''}: stop on one of days 1–${days - 1}`);
  await undo(id, { turns: 1 });
  return advance(id, { span: t.span, stopAt: d, replayMinds: t.minds || [], replayHooks: t.hooks || [] });
}
async function advanceWith(id, state, cfg, { span, orders, stopAt = null, replayMinds = null, replayHooks = null, onSegment = null, stopWanted = null }) {
  if (orders) { const prev = new Map(state.orders.map((o) => [o.id, o])); state.orders = orders.map((o) => ({ ...(prev.get(o.id) || {}), id: o.id || nextId(state, 'o'), text: String(o.text) })).filter((o) => o.text.trim()); }
  // the world as it stands before the turn is kept for undo, orders and all (they come back to be changed and given
  // again); the old single undo point of earlier versions is no longer needed
  archiveLegacy(id, state);
  snapshot(id, state);
  for (const f of ['prev-state.json', 'prev-chronicle.md']) fs.rmSync(path.join(dir(id), f), { force: true });
  // the turn's clock dates its facts (engine/facts/log.js): day 1 is the morrow
  const day0 = dayNumber(state.meta.date); const turn = state.meta.turn + 1; const p = state.meta.player;
  state.meta.clock = { turn, from: day0 + 1, to: day0 + 1 };
  for (const a of Object.values(state.parties)) { delete a.motion; delete a.arriveDay; }
  const dateFrom = dateStr(state.meta.date);
  const log = (kind, messages, response) => logLLM(id, kind, messages, response);
  // The lord's written orders are carried out first, on the morrow, through the verbs (their receipts were read when
  // they were written: server/orders.js)
  const carried = await carryOutOrders(state, interpreter(id, state, cfg)).catch((e) => { console.warn('orders:', e.message); return []; });
  // the promises lords have made are acted on from the morrow (engine/politics/commitments.js)
  commitmentsTick(state, { phase: 'start' });
  // How far: "until something happens" (the next thing that matters, at most a moon; 05 §3–4) or a fixed span that a
  // major interrupt may still cut short; `stopAt` is the day the lord stopped a jump he was watching (05 §5)
  let until = null; const auto = !span || span === 'auto' || span === 'turn';
  if (auto) { const n = nextTurnLength(state); span = `${n.days}d`; until = n.reason; }
  let horizon = spanOf(span).days; if (stopAt) horizon = Math.max(1, Math.min(horizon, Number(stopAt) || horizon));
  state.meta.turn = turn;
  const recent = readFacts(id, { from: turn - 2 });
  const known = (h) => knownTo(state, recent, h, { limit: 6 });
  const deliver = async (st) => [...deliverReplies(st), ...await deliverLetters(st, { provider: cfg.provider, cfg, log, known }).catch((e) => { console.warn('letters:', e.message); return []; })];
  const touched = new Set(); const applied = [], rejected = [], cards = [], mindsRecord = [], hooksRecord = [], segments = [], narrated = [], meanwhile = [];
  const eyes = { foes: sightedFoes(state) };
  let stopped = null, ran = 0;
  const ms = { orders: 0, minds: 0, engine: 0, narrate: 0 }; const t0 = Date.now(); const clock = (k, t) => { ms[k] += Date.now() - t; };
  const onProgress = tracker(id, 'jump', { agentLabel: 'The realm moves', segments: [] });
  try {
    // ── SEGMENTS of a week (03 §6.2): the minds decide on its first day, the days run one by one, the week is told
    for (let seg = 0; ran < horizon && !stopped; seg++) {
      const segFrom = day0 + ran + 1; const segDays = Math.min(7, horizon - ran);
      onProgress({ agentLabel: 'The lords of the realm take counsel', phase: 'thinking' });
      // ── THE REALM'S MINDS: the lords who matter this week decide one thing each (04 §5; server/minds.js)
      state.meta.clock = { turn, from: segFrom, to: segFrom };
      const tm = Date.now();
      const minds = mindsBudget(cfg) ? await runMinds(state, { budget: mindsBudget(cfg), provider: cfg.provider, cfg, log, known: (x) => known(x.house), replay: replayMinds?.filter((m) => m.segment === seg) || null })
        .catch((e) => { console.warn('minds:', e.message); return { cards: [], record: [] }; }) : { cards: [], record: [] };
      clock('minds', tm);
      mindsRecord.push(...minds.record.map((r) => ({ ...r, segment: seg })));
      // ── THE DIRECTOR (04 §7; server/director.js): a story hook on the week's first day, if one is due
      const hooked = await directWeek(state, { cfg, provider: cfg.provider, log, replay: replayHooks?.filter((h) => h.segment === seg) || null })
        .catch((e) => { console.warn('director:', e.message); return { cards: [], record: [] }; });
      hooksRecord.push(...hooked.record.map((r) => ({ ...r, segment: seg })));
      const segCards = [...minds.cards, ...hooked.cards].map((c) => ({ ...c, day: ran + 1 }));
      // ── THE DAYS (server/turn/day.js): the engine's rules, one day at a time
      state.meta.clock = { turn, from: day0 + 1, to: segFrom };
      onProgress({ agentLabel: 'The days pass', phase: 'working' });
      let d = 0; const te = Date.now();
      for (; d < segDays; d++) {
        const r = await engineDay(state, { touched, deliver });
        segCards.push(...r.cards); applied.push(...r.applied);
        const why = interruptOf(state, r.cards, eyes);
        if (why && (auto || why.major)) { stopped = why; d++; break; }
        // the lord, watching, stops the days here (05 §5)
        const want = stopWanted?.(); if (want && ran + d + 1 >= want) { stopped = { major: false, text: 'the lord stopped the days', lord: true }; d++; break; }
      }
      clock('engine', te);
      ran += d;
      const segTo = day0 + ran;
      state.meta.clock = { turn, from: day0 + 1, to: segTo };
      // no whole week passes with nothing of note in the realm (09 §9): a hook of the dice's on its last day
      const quiet = thinWeek(state, { from: segFrom, to: segTo, day: ran, whole: segDays === 7 && d === 7, had: hooked.record.length > 0 });
      hooksRecord.push(...quiet.record.map((r) => ({ ...r, segment: seg }))); segCards.push(...quiet.cards);
      // news travels (engine/knowledge.js): what the house hears of late is told on the day its word arrives, or waits
      let told = [...holdNews(state, foldAnswers(segCards)), ...newsDue(state)].sort((a, b) => a.day - b.day);
      // what the house has seen of other hosts; the post; the week's books (06), and the steward's notes
      updateKnowledge(state); postTick(state);
      const econNotes = settle(state, d);
      const mine = econNotes.filter((n) => n.house === p || state.houses[n.house]?.liege === p || (n.important && n.house === state.houses[p].liege));
      for (const n of mine.slice(0, 6)) told.push(fact(state, 'ledger', { title: n.important ? 'The ledger' : 'From the steward\'s accounts', text: n.text, where: n.holding || null, importance: n.important ? 3 : 1, houses: [n.house], day: ran, ...(n.important ? {} : { bg: true, mine: true }) }, { cause: { type: 'rule', ref: 'economy' } }));
      // ── THE TELLING (04 §6; server/narrator.js): the week's cards gathered into stories and told, held to their facts
      const tn = Date.now(); let segMeanwhile = '';
      if (narratorOn(cfg)) {
        onProgress({ agentLabel: 'The chronicle is written', phase: 'writing' });
        const own = (state.facts || []).filter((f) => f.cause?.type === 'order' && f.importance >= 2 && f.day >= segFrom && f.day <= segTo);
        const n = await narrateTurn(state, told, { provider: cfg.provider, cfg, log, own, onProgress: (x) => onProgress({ ...x, agentLabel: 'The chronicle is written' }) })
          .catch((e) => { console.warn('narrator:', e.message); return null; });
        if (n) { told = n.cards; narrated.push(n.record); if (n.meanwhile) meanwhile.push(segMeanwhile = n.meanwhile); }
      }
      clock('narrate', tn);
      for (const c of told) if (!c.day) c.day = ran;
      cards.push(...told);
      const segment = { index: seg, days: [ran - d + 1, ran], from: dateStr(dateOfDay(segFrom)), to: dateStr(state.meta.date), events: told.length };
      segments.push(segment);
      // the week, sent to the lord as soon as it is told (SSE: 03 §10) — the next is simulated while he watches it
      const shown = told.map((c) => ({ ...c, date: dateStr(dateOfDay(day0 + c.day)) }));
      onProgress({ segments: [...(progress.get(id)?.segments || []), { ...segment, headlines: shown.filter((c) => !c.bg).map((c) => ({ title: c.title, where: c.where, day: c.day })) }] });
      onSegment?.({ ...segment, events: shown, meanwhile: segMeanwhile, date: dateStr(state.meta.date), ...(stopped ? { stopped: stopped.text } : {}) });
    }
  } finally { done(id); }
  const days = ran;
  // every order the lord gave has its card, told first on its day (a story told of it is its card: orders.js)
  const events = [...orderEvents(state, state.orders, cards.filter((e) => e.narrated)), ...cards];
  events.sort((a, b) => a.day - b.day || (b.orderId ? 1 : 0) - (a.orderId ? 1 : 0));
  for (const a of applied.filter((x) => x.op === 'succession')) {
    const hh = state.houses[a.house]; const f = factById(state, a.fact);
    const card = { title: `A new head of House ${hh?.name}`, text: a.text.replace(/^SUCCESSION: /, ''), where: hh?.seat || null, importance: a.house === p ? 5 : 4, type: 'court', houses: [a.house] };
    events.unshift(f ? { ...card, fact: f.id, day: Math.max(1, f.day - day0) } : { ...card, day: 1 });
  }
  // one date for every view (HUD, feed, reel, pins): day d of the turn is the d-th day after it began
  events.forEach((e, k) => { e.day = Math.max(1, Math.min(days, e.day || 1)); e.id = `${turn}-${k}`; e.date = dateStr(dateOfDay(day0 + e.day)); });
  const narration = narrated.length ? narrated.reduce((a, r) => ({ stories: a.stories + r.stories, told: a.told + r.told, again: a.again + r.again, plain: a.plain + r.plain, problems: Object.fromEntries([...new Set([...Object.keys(a.problems), ...Object.keys(r.problems)])].map((k) => [k, (a.problems[k] || 0) + (r.problems[k] || 0)])), groups: [...a.groups, ...(r.groups || [])], small: [...a.small, ...(r.small || [])].slice(0, 16), via: r.via, ...(r.key ? { key: r.key } : {}) }), { stories: 0, told: 0, again: 0, plain: 0, problems: {}, groups: [], small: [] }) : null;
  const summary = [...cards.filter((c) => c.narrated).sort((a, b) => b.importance - a.importance).slice(0, 4).map((c) => c.text), ...meanwhile.slice(0, 1)].join(' ');
  const record = {
    carried, ...(mindsRecord.length ? { minds: mindsRecord } : {}), ...(hooksRecord.length ? { hooks: hooksRecord } : {}), turn, dateFrom, date: dateStr(state.meta.date), span: `${days}d`,
    ...(stopped ? { until: stopped.text, stopped: stopped.major ? 'major' : 'minor' } : until ? { until } : {}), ...(stopAt ? { stoppedAt: days } : {}),
    segments, orders: state.orders, summary: stripForeignScript(summary), ...(narration ? { narration } : {}), ...(meanwhile.length ? { meanwhile: meanwhile.join(' ') } : {}),
    events, applied, rejected, ledger: state.houses[p].ledger.at(-1), ms: { ...ms, total: Date.now() - t0 },
  };
  // the clock's timings are the machine's, not the world's: kept in the turn's file, never in the save (a replay is the
  // same world byte for byte)
  const { ms: _timings, ...kept } = record; state.history.push(kept);
  // the game reads back only the recent turns (and those the chronicle has not yet taken in); every turn is in turns/
  state.history = state.history.filter((t) => t.turn > state.meta.turn - KEEP_HISTORY || t.turn > (state.consolidatedThrough ?? 0));
  state.orders = [];
  closeTurn(state, record, days);
  // Flush chronicle ops + major events into the markdown chronicle
  const notes = [...state.chronicle.map((c) => c.text), ...events.filter((e) => e.importance >= 5).map((e) => `${e.title} — ${e.text}`)];
  if (notes.length) appendChronicle(id, `\n### ${record.date} (turn ${record.turn})\n` + notes.map((n) => `- ${n}`).join('\n') + '\n');
  state.chronicle = [];
  // the world holds together (03 §14), checked every turn: a broken invariant is an engine bug, reported, never hidden
  settleWorld(state);
  const broken = validate(state);
  if (broken.length) { record.invariants = broken.slice(0, 20); console.warn(`turn ${record.turn}: ${broken.length} invariant(s) broken — ${broken.slice(0, 3).join('; ')}`); }
  const made = state.facts || []; record.facts = { count: made.length, ...(made.length ? { first: made[0].id, last: made.at(-1).id } : {}) };
  writeTurn(id, record);
  saveState(id, state);
  try { appendWorldLog(id, state, record); } catch (e) { console.warn('world log:', e.message); }
  // Compress old turns into the chronicle without making the player wait
  const job = maybeConsolidate(id, state, cfg).catch((e) => { console.error('consolidation failed:', e.message); return null; }).finally(() => consolidating.delete(id));
  consolidating.set(id, job);
  return { state: loadState(id), turn: record, consolidated: 'background' };
}

// The end of a turn: matters raised and lapsed, where the house stands, and whether the story has reached its end
function closeTurn(state, record, days) {
  const p = state.meta.player;
  // If nothing was brought before the lord over a moon or more, the realm brings a matter itself
  const newDecision = record.applied.some((a) => a.op === 'decision');
  const pendingCount = (state.decisions || []).filter((d) => d.status === 'pending').length;
  if (!newDecision && pendingCount === 0 && random() < 0.75 * Math.min(1, days / 30)) {
    // the same kind of matter does not come before you twice in quick succession
    state.plots = state.plots || {}; const seen = state.plots.petitioned = state.plots.petitioned || {};
    const kindOf = (t) => t.replace(/House [A-Z][\w']*( of [A-Z][\w' ]*)?/g, '').replace(/[^a-z ]/gi, '').trim().slice(0, 40);
    let pet = null;
    for (let i = 0; i < 6 && !pet; i++) { const c = realmPetition(state); if (c && state.meta.turn - (seen[kindOf(c.title)] ?? -99) >= 6) pet = c; }
    if (pet) seen[kindOf(pet.title)] = state.meta.turn;
    if (pet) { const r = applyChanges(state, [{ op: 'decision', ...pet }]); record.applied.push(...r.applied); }
  }
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
  // Where the house stands after all of it, and whether the story has reached its end — ruin, the failing of the line,
  // a crown of your own, or the Iron Throne. The engine decides this, never a model.
  state.standing = standing(state, p);
  if (!state.outcome) {
    const oc = outcomeFor(state);
    if (oc) {
      state.outcome = { ...oc, turn: state.meta.turn, date: record.date };
      record.events.push({ ...fact(state, oc.victory ? 'crowned' : 'house_ended', { title: oc.title, text: oc.text, where: state.houses[p].seat || null, importance: 5, type: 'court', houses: [p], day: days }, { actors: [state.houses[p].lord], data: { outcome: oc.kind, victory: oc.victory }, cause: { type: 'rule', ref: 'standing' } }), day: days, id: `${state.meta.turn}-${record.events.length}`, date: record.date });
      state.chronicle.push({ date: record.date, text: `${oc.title} — ${oc.text}` });
    }
  }
}

// What stops a jump (05 §4) on the day it happens, in the world's words — never what is coming. Major: a battle, a
// siege or a death, capture or birth that touches the lord's house, a foe's host come into sight, a matter brought
// before the lord; minor (these end only an "until something happens" jump): a letter to the lord, one of the lord's
// parties arriving, works finished.
const MAJOR_KINDS = new Set(['battle', 'rout', 'siege_begun', 'storm_assault', 'holding_fell', 'siege_lifted', 'death', 'captured', 'captured_in_battle', 'slain_in_battle', 'birth', 'executed', 'fled', 'vanished', 'war_declared']);
const MINOR_KINDS = new Set(['letter_arrived', 'arrived', 'works_done', 'landed']);
function interruptOf(state, cards, eyes) {
  const p = state.meta.player; const lordId = state.houses[p].lord;
  const today = dayNumber(state.meta.date);
  const ours = (f) => f.houses.includes(p) || f.actors.some((a) => state.characters[a]?.house === p);
  const facts = (state.facts || []).filter((f) => f.day === today);
  const major = facts.find((f) => MAJOR_KINDS.has(f.kind) && ours(f) && (f.kind !== 'death' || f.importance >= 3));
  if (major) return { major: true, text: major.title || major.text };
  const matter = (state.decisions || []).find((d) => d.status === 'pending' && d.day === today);
  if (matter) return { major: true, text: matter.title };
  const now = sightedFoes(state); const seen = [...now].find((x) => !eyes.foes.has(x)); eyes.foes = now;
  if (seen) { const a = state.parties[seen]; return { major: true, text: `${state.houses[a.owner]?.name || 'Enemy'} ${a.men >= 2000 ? 'host' : 'outriders'} sighted near ${placeName(state, nearestHold(state, a.pos))}` }; }
  const minor = facts.find((f) => MINOR_KINDS.has(f.kind) && (f.kind === 'letter_arrived' ? f.actors.includes(lordId) : f.kind === 'works_done' ? f.houses.includes(p) : state.parties[f.data?.party]?.owner === p || f.actors.includes(lordId)));
  if (minor) return { major: false, text: minor.title || minor.text };
  return null;
}
// the hosts of the lord's enemies that his house can see now
function sightedFoes(state) {
  const p = state.meta.player; const E = eyesOf(state, p);
  return new Set(forces(state).filter((a) => a.men > 0 && a.owner !== p && atWar(state, p, a.owner) && seesParty(state, p, a, E)).map((a) => a.id));
}
function nearestHold(state, pos) {
  let best = null, d = Infinity;
  for (const h of Object.values(state.holdings)) { const x = Math.hypot(h.pos[0] - pos[0], h.pos[1] - pos[1]); if (x < d) { d = x; best = h.id; } }
  return best;
}

async function maybeConsolidate(id, state, cfg, force = false) {
  const pending = state.history.filter((t) => t.turn > state.consolidatedThrough);
  const pendingTokens = estimateTokens(JSON.stringify(pending.map((t) => [t.summary, t.events])));
  const tooBig = pendingTokens > cfg.contextTokens * 0.2;
  // turns may be a day or a moon: consolidate by the days they cover (about every moon), keeping the last fortnight verbatim
  const daysOf = (t) => spanOf(t.span).days;
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

/**
 * Unmake the last `turns` turns (1–10): the world goes back to how it stood before the earliest of them, orders and
 * all; the fact log and the world log are cut back to their lengths then, and the turns after it are forgotten. An
 * ironman chronicle cannot be unwritten.
 */
export async function undo(id, { turns = 1 } = {}) {
  if (consolidating.has(id)) await consolidating.get(id).catch(() => {}); // the chronicle is not written under our feet
  const state = loadState(id);
  if (state.meta.settings?.ironman) throw httpError(403, 'An ironman chronicle cannot be unwritten.');
  const n = Math.max(1, Math.round(Number(turns) || 1));
  const target = state.meta.turn - n + 1; // the earliest turn unmade: the world returns to the eve of it
  const snap = path.join(dir(id), 'snapshots', `${pad(target)}.json.gz`);
  if (target < 1) throw httpError(400, state.meta.turn ? `only ${state.meta.turn} turn${state.meta.turn > 1 ? 's have' : ' has'} been played` : 'nothing has happened yet');
  if (n > KEEP_SNAPSHOTS || !fs.existsSync(snap)) {
    // a save from before snapshots kept one undo point: the state and chronicle as they stood
    const legacy = path.join(dir(id), 'prev-state.json');
    if (n === 1 && fs.existsSync(legacy)) {
      fs.copyFileSync(legacy, path.join(dir(id), 'state.json'));
      const c = path.join(dir(id), 'prev-chronicle.md'); if (fs.existsSync(c)) fs.copyFileSync(c, path.join(dir(id), 'chronicle.md'));
      fs.rmSync(legacy); return loadState(id);
    }
    const depth = undoDepth(id, state);
    throw httpError(400, depth ? `only the last ${depth} turn${depth > 1 ? 's' : ''} can be undone` : 'nothing to undo');
  }
  const { state: before, chronicle, factsBytes, worldLogBytes } = JSON.parse(zlib.gunzipSync(fs.readFileSync(snap)).toString('utf8'));
  const cut = (f, bytes) => { const p = path.join(dir(id), f); if (fs.existsSync(p) && sizeOf(p) > bytes) fs.truncateSync(p, bytes); };
  cut('facts.jsonl', factsBytes); cut('world-log.md', worldLogBytes);
  writeChronicle(id, chronicle);
  const gone = (d) => { const p = path.join(dir(id), d); if (fs.existsSync(p)) for (const f of fs.readdirSync(p)) if (Number(f.slice(0, 6)) >= target) fs.rmSync(path.join(p, f), { force: true }); };
  gone('turns'); gone('snapshots');
  saveState(id, before);
  return loadState(id);
}

export async function talk(id, charId, message) {
  if (consolidating.has(id)) await consolidating.get(id).catch(() => {});
  const cfg = loadConfig();
  const state = loadState(id);
  return withDice(state, () => talkWith(id, state, cfg, charId, message));
}
async function talkWith(id, state, cfg, charId, message) {
  const c = state.characters[charId];
  if (!c) throw httpError(404, 'unknown character');
  if (!c.alive) throw httpError(400, `${c.name} is dead.`);
  if (moodOf(state, c).closed) throw httpError(409, `${c.name} will not hear you again this moon.`);
  const p = state.meta.player; const lordId = state.houses[p].lord; const lord = state.characters[lordId]; const ownMan = c.house === p;
  const turn = state.meta.turn; const today = dayNumber(state.meta.date);
  // far away, this is a letter (server/letters.js): it flies for days, it is read and weighed when it lands, and the
  // answer flies back — only then does it count
  if (lord && !together(state, lord, c)) {
    const r = perform(state, 'send_letter', { params: { to: c.id, text: message }, source: { type: 'order', ref: 'letter' } });
    if (!r.ok) throw httpError(409, r.refusal.text);
    const post = state.post.find((x) => x.id === r.done.post); post.from = lordId; post.via = 'audience';
    const days = r.done.days; const back = addDays(state.meta.date, days * 2);
    state.chats[charId] = [...(state.chats[charId] || []), { role: 'player', text: message, date: dateStr(state.meta.date), turn, via: 'raven' }, { role: 'npc', text: '', date: dateStr(back), turn, pending: true, letter: post.id, arrivesDay: today + days * 2 }];
    saveState(id, state);
    const m = moodOf(state, c);
    return { reply: null, raven: { days, back: dateStr(back) }, applied: [], rejected: [], state, stance: { verdict: null, mood: moodWord(m), patience: m.patience, full: m.full, closed: !!m.closed } };
  }
  // the engine weighs the words first: their nature, their mood, the odds — and settles the outcome
  const stance = weighAudience(state, c, message);
  const applied = [], rejected = [];
  // one's own people: the command is read as an order to them and done through the verbs, before they answer, so what
  // they say is what they are about to do (04 §8.1)
  if (ownMan && c.id !== lordId) {
    const read = parseOrder(state, message, { addressee: c.id });
    for (const a of read.clarify ? [] : read.actions) {
      const r = perform(state, a.verb, { params: a.params, source: { type: 'order', ref: 'audience' } });
      for (const l of r.receipt) (r.ok ? applied.push({ op: a.verb, text: l.text.replace(/\.$/, '') }) : rejected.push({ change: { verb: a.verb, ...a.params }, reason: `could not be done: ${l.text.replace(/\.$/, '')}` }));
    }
  }
  const known = knownTo(state, readFacts(id, { from: state.meta.turn - 1 }), c.house, { limit: 6 });
  const onProgress = tracker(id, 'chat');
  let r; try {
    r = await runCall('audience', state, { character: c.id, words: message, stance, face: true, known, receipt: applied.map((a) => a.text) }, { provider: cfg.provider, cfg, onProgress, log: (kind, messages, response) => logLLM(id, kind, messages, response) });
  } finally { done(id); }
  const v = r.value;
  const reply = replyText(v);
  // the audience is a fact (who spoke with whom, and where); what was said stays in the conversation
  emit(state, 'audience_held', { actors: [lordId, c.id], houses: [p, c.house], place: resolvePlaceId(c.loc) || partyOf(state, c)?.at || null, data: { verdict: stance.verdict || null }, vis: { scope: 'houses', houses: [p, c.house] }, cause: { type: 'order', ref: 'audience' }, text: `${lord?.name || `The lord of House ${state.houses[p].name}`} speaks with ${c.name}.` });
  // what the verdict settles of a proposal (a pact, fealty) and leaves in their memory — the engine's, not the model's
  const settled = applyChanges(state, holdToVerdict(state, c, stance, []), { source: c.name, protectPlayer: true, cause: { type: 'intent', ref: c.id } });
  applied.push(...settled.applied); rejected.push(...settled.rejected);
  // what they promise binds them (engine/politics/commitments.js): witnessed, rolled for sincerity in secret
  for (const x of ownMan ? [] : promisesIn(v, r.ctx || {})) {
    const cm = makeCommitment(state, { by: c.id, to: lordId, kind: x.kind, params: x.params, days: x.days, source: { type: 'audience', ref: c.id }, publicity: 'witnessed', duress: stance.verdict === 'yield' });
    applied.push({ op: 'commitment', text: `${c.name} promises to ${COMMITMENTS[cm.kind].says(state, cm)} within ${cm.dueDay - cm.madeDay} days` });
  }
  if (v.outcome?.reveals === 'their_secret' && c.secret && !c.secretKnown) reveal(state, c, p);
  const mood = v.outcome?.mood || stance.moodWord;
  state.chats[charId] = [...(state.chats[charId] || []), { role: 'player', text: message, date: dateStr(state.meta.date), turn }, { role: 'npc', text: reply, date: dateStr(state.meta.date), turn, applied: applied.map((a) => a.text), mood, ...(v.outcome?.asks_for ? { asks: v.outcome.asks_for } : {}), ...(stance.verdict ? { verdict: stance.verdict } : {}) }];
  if (state.chronicle.length) { appendChronicle(id, state.chronicle.map((x) => `- ${x.date}: ${x.text}`).join('\n') + '\n'); state.chronicle = []; }
  saveState(id, state);
  return { reply, applied, rejected, state, stance: { verdict: stance.verdict, mood: moodWord(stance.mood), patience: stance.mood.patience, full: stance.mood.full, closed: !!stance.mood.closed } };
}

// Sworn lords answering the call on the same day are one piece of news, not a flood of cards
function foldAnswers(evs) {
  const out = []; const byDay = new Map();
  // a week's answers are one piece of news (a 23-day turn once carried 31 cards, most of them "House X answers the call")
  for (const e of evs) { if (/^House .+ answers the call$/.test(e.title || '')) { const k = Math.floor(((e.day || 1) - 1) / 7); byDay.set(k, [...(byDay.get(k) || []), e]); } else out.push(e); }
  for (const [, g] of byDay) {
    const day = Math.min(...g.map((e) => e.day || 1));
    if (g.length < 2) { out.push(...g); continue; }
    const parts = g.map((e) => { const m = String(e.text).match(/^(.+?) answers the call with ([\d,]+) men(, .+? riding with (?:him|her))?.*?\(~(\d+) days\)/); const sea = String(e.text).match(/^(.+?) answers the call with ([\d,]+) men.*must cross the sea/); return m ? `${m[1]}${m[3] ? ` with ${m[3].replace(/^, | riding with (him|her)$/g, '')}` : ''} (${m[2]} men, ~${m[4]} days away)` : sea ? `${sea[1]} (${sea[2]} men, by sea)` : e.title.replace(/ answers the call$/, ''); });
    const men = g.reduce((a, e) => a + (Number(String(e.text).match(/with ([\d,]+) men/)?.[1]?.replace(/,/g, '')) || 0), 0);
    out.push({ ...g[0], day, title: `${g.length} lords answer the call — ${men.toLocaleString('en-GB')} men on the march`, text: `${parts.join('; ')}.`, houses: [...new Set(g.flatMap((e) => e.houses || []))], importance: 3, facts: g.map((e) => e.fact).filter(Boolean) });
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
    const res = applyChanges(state, r.changes || [], { source: c.name, protectPlayer: true, mayMove: r.mayMove || [], cause: { type: 'intent', ref: r.char }, on: 1 });
    const entry = (state.chats[r.char] || []).find((m) => m.pending && m.arrivesDay === r.arrivesDay);
    if (entry) { delete entry.pending; entry.date = dateStr(state.meta.date); entry.applied = res.applied.map((a) => a.text); }
    state.ravens.unshift({ id: nextId(state, 'r'), day: today, from: c.id, fromName: c.name, to: lordId, text: String(r.text).replace(/\*[^*]*\*/g, '').trim(), date: dateStr(state.meta.date), read: false });
    const first = String(r.text).replace(/\*[^*]*\*/g, ' ').replace(/\s+/g, ' ').trim().split(/(?<=[.!?])\s/)[0] || '';
    const pp = partyOf(state, c); const whence = pp ? (pp.kind === 'rider' ? 'the road' : `the camp of ${pp.name}`) : placeName(state, c.loc);
    events.push(fact(state, 'letter_arrived', { title: `${c.name} answers ${state.characters[lordId]?.name || 'the lord'}`, text: `A raven from ${whence}: “${first.slice(0, 220)}”${res.applied.length ? ` — ${res.applied.map((a) => a.text).join('; ')}` : ''}`, where: resolvePlaceId(c.loc) || null, importance: 3, houses: [p, c.house], mine: true, day: 1 }, { actors: [c.id, lordId], data: { from: c.id, reply: true }, vis: { scope: 'houses', houses: [p, c.house] } }));
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

// Direct actions from the cards: each is a verb of the registry (engine/actions/registry.js) — its checks, its cost, what
// it does and its receipt — settled here and now, and told to the story model as an order already carried out.
// The body is `{ verb, params }`; the cards of earlier versions sent `{ kind, … }`, which maps to the same verbs.
export function act(id, body) {
  const state = loadState(id);
  return withDice(state, () => actWith(id, state, body));
}
function actWith(id, state, body) {
  // an order may carry a note for the simulator only (what the ledger already settled), never shown to the player
  // status: 'done' — the engine settled it here and now (the story narrates it, never repeats it); 'underway' —
  // set in motion, to finish in time (a march); none — a written order the turn will carry out
  const addOrder = (text, note = '', status = null, result = null) => {
    const settled = status === 'done' ? '[Already carried out by the engine; do not apply it again, narrate what follows.]' : status === 'underway' ? '[Already set in motion by the engine; do not apply it again.]' : '';
    const n = [note, note.startsWith('[Already') ? '' : settled].filter(Boolean).join(' ');
    state.orders.push({ id: nextId(state, 'o'), text, auto: true, ...(n ? { note: n } : {}), ...(status ? { status, executed: true, result: result ? [result] : [text] } : {}) });
  };
  if (body.kind === 'order') { addOrder(String(body.text || '').slice(0, 2000)); saveState(id, state); return { state }; } // words, for the turn to read
  const verb = body.verb || verbOfKind(body);
  if (!VERBS[verb]) throw httpError(400, 'unknown action');
  const { kind, kind2, verb: _, params: given, ...rest } = body;
  const r = perform(state, verb, { params: given || rest, source: { type: 'order', ref: `act:${verb}` } });
  if (!r.ok) throw httpError(409, r.refusal.text);
  const said = VERBS[verb].said?.(state, r.intent, r.done);
  if (said) addOrder(said.text, said.note || '', said.status ?? null, said.status ? told(r) : null);
  saveState(id, state);
  return { state, receipt: r.receipt, summary: told(r), ...(r.done?.effects?.length ? { effects: r.done.effects } : {}) };
}

export async function council(id, members, message, { advisor = false } = {}) {
  if (consolidating.has(id)) await consolidating.get(id).catch(() => {});
  const cfg = loadConfig();
  const state = loadState(id);
  return withDice(state, () => councilWith(id, state, cfg, members, message, { advisor }));
}
async function councilWith(id, state, cfg, members, message, { advisor = false } = {}) {
  const ids = (members || []).filter((m) => state.characters[m]?.alive);
  if (!ids.length) throw httpError(400, 'no one to hold council with');
  const listening = !String(message || '').trim();
  // the advisor: the one whose office knows the matter best answers at length (04 §8.4)
  const who = advisor ? [advisorFor(state, ids, message)] : ids;
  const onProgress = tracker(id, 'council');
  let r; try {
    r = await runCall('council', state, { members: who, words: message, advisor, listening }, { provider: cfg.provider, cfg, onProgress, log: (kind, messages, response) => logLLM(id, kind, messages, response) });
  } finally { done(id); }
  const replies = (r.value?.speeches || []).map((x) => ({ speaker: x.speaker, text: stripForeignScript(x.text) }));
  if (!replies.length) throw httpError(502, 'The council could not agree on an answer. Put the question again.');
  // each counsellor seated has a place in the answer: one who did not speak is shown keeping silent, not lost
  if (!listening && !advisor) for (const i of ids) if (!replies.some((x) => x.speaker === i)) replies.push({ speaker: i, text: `*${state.characters[i].name} listened, and said nothing this time.*`, silent: true });
  const lordId = state.houses[state.meta.player].lord;
  emit(state, 'audience_held', { actors: [lordId, ...ids], houses: [state.meta.player], place: state.houses[state.meta.player].seat || null, data: { council: true }, vis: { scope: 'houses', houses: [state.meta.player] }, cause: { type: 'order', ref: 'council' }, text: `${state.characters[lordId]?.name || 'The lord'} holds council with ${ids.map((i) => state.characters[i].name).join(', ')}.` });
  // counsel changes nothing: what the lord decides from it becomes an order
  const key = 'council:' + ids.sort().join(',');
  const date = dateStr(state.meta.date), turn = state.meta.turn;
  state.chats[key] = [...(state.chats[key] || []), ...(listening ? [] : [{ role: 'player', text: message, date, turn }]), ...replies.map((x) => ({ role: 'npc', speaker: x.speaker, text: x.text, date, turn, ...(advisor ? { advisor: true } : {}) }))];
  saveState(id, state);
  return { replies, applied: [], rejected: [], state, key };
}
// money to the steward, war to the master-at-arms, the realm's story and its letters to the maester
function advisorFor(state, ids, q) {
  const has = (role) => ids.find((i) => (state.characters[i].roles || []).includes(role));
  const t = String(q || '').toLowerCase();
  return (/\b(afford|gold|coin|treasury|debt|grain|food|ledger)\b/.test(t) && has('steward'))
    || (/\b(war|host|army|neighbour|threat|fight|defend|banners|men)\b/.test(t) && (has('master_at_arms') || has('captain')))
    || (/\b(loyal|vassal|trust|spies|secret)\b/.test(t) && has('spymaster'))
    || has('maester') || ids[0];
}
