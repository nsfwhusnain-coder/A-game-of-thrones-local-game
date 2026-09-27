// Game session management: saves, time jumps, conversations, memory consolidation.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url'; // a file URL's pathname is /C:/… on Windows; fileURLToPath gives a real path
import { chat, extractJson, extractField, loadConfig, estimateTokens, readReplies } from './llm.js';
import { buildJumpPrompt, buildChatPrompt, buildSuggestPrompt, buildConsolidatePrompt, buildCouncilPrompt, engineFacts } from './prompts.js';
import { createInitialState, migrateState, applyChanges, placeName, addDays, dateStr, spanOf, resolvePlaceId, dayNumber, findChar } from '../public/js/shared/world.js';
import { partyOf, together } from '../public/js/engine/parties.js';
import { settleWorld } from '../public/js/engine/state/settle.js';
import { validate } from '../public/js/engine/state/validate.js';
import { marchTick } from '../public/js/shared/marches.js';
import { settle, initEconomy, seasonTick } from '../public/js/shared/economy.js';
import { agentsFor, AGENT_LABELS, filterOps, briefFromMaester, briefFromPlan, briefFromWhispers, briefFromApplied } from './agents.js';
import { random } from '../public/js/engine/rng.js';
import { nextId } from '../public/js/engine/ids.js';
import { withDice } from './dice.js';
import { stripForeignScript } from './ai/schema.js';
import { psycheTick } from '../public/js/shared/psyche.js';
import { postTick } from '../public/js/shared/errands.js';
import { retinueTick } from '../public/js/shared/retinues.js';
import { nextTurnLength } from '../public/js/shared/turns.js';
import { realmPetition, applyPetitionFx } from '../public/js/shared/petitions.js';
import { vassalTick, gatherMusters, fieldService } from '../public/js/shared/vassals.js';
import { worldTick, THREADS } from '../public/js/shared/plots.js';
import { resolveWarfare } from '../public/js/shared/battles.js';
import { roadEncounters } from '../public/js/shared/roads.js';
import { updateIntel } from '../public/js/shared/intel.js';
import { treacheryTick } from '../public/js/shared/treachery.js';
import { regencyTick } from '../public/js/shared/regency.js';
import { outcomeFor, standing } from '../public/js/shared/standing.js';
import { emit, fact, asEvent, flush, redate, factById } from '../public/js/engine/facts/log.js';
import { VERBS, perform, told, verbOfKind } from '../public/js/engine/actions/registry.js';
import { carryOutOrders, readOrders, answerOrder, named, orderEvents, advanceMusters, ravenDays } from './orders.js';
import { interpretOrder } from './orders/interpret.js';
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
 * private business (sight and news travel refine this in WP B9).
 */
export function readFacts(id, { from, to, house, kind, limit = 2000, view } = {}) {
  const f = path.join(dir(id), 'facts.jsonl'); if (!fs.existsSync(f)) return [];
  const lo = Number(from) || -Infinity, hi = to == null || to === '' ? Infinity : Number(to);
  const me = view === 'player' ? loadState(id).meta.player : null;
  const known = (x) => !me || !['secret', 'houses'].includes(x.vis?.scope) || (x.vis.houses || x.houses || []).includes(me);
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
const tracker = (id, kind, seed = {}) => { const t0 = Date.now(); progress.set(id, { kind, phase: 'waiting', ms: 0, t0, ...seed }); return (p) => progress.set(id, { kind, t0, ...progress.get(id), ...p, ms: Date.now() - t0 }); };
const done = (id) => progress.delete(id);

async function askJson(id, kind, messages, cfg, extra = {}) {
  // the swarm names whoever is speaking, so the player is told 'the Hand moves the realm', not 'step 2 of 5'
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

// ───────────────────────────── The swarm ─────────────────────────────
// The turn used to be one enormous question to one model. It is now a short council: each agent
// reads the same realm (the same prompt prefix, so the model server's cache is reused) and is
// given one charge at the end of it. What each settles is handed to the next in plain English —
// never as change operations, so the Bard, who writes last, never sees the machinery.
//
// If anything at all goes wrong the world still turns: an agent that cannot be read is skipped,
// and the Bard is the only one whose absence is felt (its summary is then salvaged as before).
async function runSwarm(id, state, cfg, ctx) {
  const { span, chronicle, turnReason, engineEvents, dateFrom, applyCtx, applied, rejected } = ctx;
  const spanDays = spanOf(span).days;
  const agents = agentsFor(cfg.swarm ?? 'full');
  const build = (agent, brief) => buildJumpPrompt(state, state.orders, span, chronicle, cfg, turnReason, { engineEvents, dateFrom, agent, brief });

  // No swarm: the old single question, unchanged.
  if (!agents.length) {
    return askJson(id, 'jump', build(null, ''), cfg, { spanDays, streamText: true });
  }

  const briefs = [];
  const say = (s) => { if (s) briefs.push(s); };
  // The Bard is told only what truly happened: the Maester's facts, the engine's receipts for what the Hand and the
  // Whisperer managed to do, and the whispers — never the Hand's intentions, some of which the engine refused.
  // (It used to be told the plan, and narrated lords arriving who never set out.)
  const bardBriefs = [];
  const tell = (s) => { if (s) bardBriefs.push(s); };
  let last = null; let bard = null; let bardErr = null;
  // what the Hand and the Whisperer actually managed to do, told to the Bard as plain fact
  const doneHere = [];

  for (let i = 0; i < agents.length; i++) {
    const agent = agents[i];
    const isBard = agent === 'bard';
    const brief = (isBard ? bardBriefs : briefs).join('\n\n');
    const r = await askJson(id, 'jump', build(agent, brief), cfg, {
      spanDays,
      streamText: isBard, // only the chronicle is worth streaming to the player
      maxTokens: isBard ? cfg.maxTokens : Math.min(cfg.maxTokens, agent === 'hand' ? 1800 : 900),
      temperature: isBard ? cfg.temperature : Math.min(cfg.temperature, 0.6), // the clerks are sober; the Bard is not
      agent, agentLabel: AGENT_LABELS[agent], agentStep: i + 1, agentTotal: agents.length,
    }).catch((e) => ({ obj: null, error: e.message }));
    last = r.raw || last;
    const obj = r.obj;
    if (!obj) { if (isBard) { bardErr = r.error || 'unreadable'; bard = r; } console.warn(`swarm: the ${agent} could not be read (${r.error || 'no object'})`); continue; }

    if (isBard) { bard = { ...r, obj }; break; }

    // what this agent is allowed to change, applied at once so the next agent sees a true world
    const ops = filterOps(agent, obj.changes);
    if (ops.length) {
      const told = applyChanges(state, ops, { ...applyCtx, source: AGENT_SOURCE[agent] || applyCtx.source, mayInvent: agent === 'weaver', cause: { type: 'intent', ref: agent } });
      applied.push(...told.applied); rejected.push(...told.rejected);
      doneHere.push(...told.applied);
      tell(briefFromApplied(told.applied, `WHAT ${agent === 'whisperer' ? 'MOVED IN SECRET' : 'THE GREAT HOUSES TRULY DID'} THESE DAYS (the engine's record: tell these — and no march, arrival, battle or meeting that is not here or in WHAT THE ENGINE HAS ALREADY SET DOWN)`));
    }
    if (agent === 'maester') { say(briefFromMaester(obj)); tell(briefFromMaester(obj)); }
    if (agent === 'hand') say(briefFromPlan(obj));
    if (agent === 'whisperer') { say(briefFromWhispers(obj)); tell(briefFromWhispers(obj)); }
  }

  // The Bard is told what happened, not what was decided: the engine's own receipts.
  if (!bard) return { obj: null, raw: last, error: 'the chronicler wrote nothing', text: '' };
  const out = bard.obj || null;
  return { obj: out ? { summary: out.summary, events: out.events, threads: out.threads, changes: [] } : null, raw: bard.raw || last, error: bardErr || bard.error, text: bard.text };
}
const AGENT_SOURCE = { hand: 'The doings of the realm', weaver: 'A custom of the realm', whisperer: 'Whispers and letters' };

const consolidating = new Map(); // save id -> promise (memory is compressed in the background)

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

export async function advance(id, { span = 'auto', orders } = {}) {
  if (consolidating.has(id)) await consolidating.get(id).catch(() => {});
  if (warming.has(id)) await warming.get(id); // the model is still reading the start of this very prompt
  if (previewing.has(id)) await previewing.get(id).catch(() => {});
  const cfg = loadConfig();
  const state = loadState(id);
  // everything the engine rolls this turn comes from this save's dice (server/dice.js), awaits and all
  return withDice(state, () => advanceWith(id, state, cfg, { span, orders }));
}
async function advanceWith(id, state, cfg, { span, orders }) {
  if (orders) { const prev = new Map(state.orders.map((o) => [o.id, o])); state.orders = orders.map((o) => ({ ...(prev.get(o.id) || {}), id: o.id || nextId(state, 'o'), text: String(o.text) })).filter((o) => o.text.trim()); }
  // the world as it stands before the turn is kept for undo, orders and all (they come back to be changed and given
  // again); the old single undo point of earlier versions is no longer needed
  archiveLegacy(id, state);
  snapshot(id, state);
  for (const f of ['prev-state.json', 'prev-chronicle.md']) fs.rmSync(path.join(dir(id), f), { force: true });
  // the turn's clock dates its facts (engine/facts/log.js): day 1 is the morrow, and the turn runs to its last day once
  // its length is known
  const day0 = dayNumber(state.meta.date);
  state.meta.clock = { turn: state.meta.turn + 1, from: day0 + 1, to: day0 + 1 };
  for (const a of Object.values(state.parties)) { delete a.motion; delete a.arriveDay; }
  const chronicle = readChronicle(id);
  // The player's written orders are carried out by the engine first (travel, marches, recruiting, hiring),
  // so they truly happen; the story model is told what was done and narrates what follows.
  const carried = await carryOutOrders(state, interpreter(id, state, cfg)).catch((e) => { console.warn('orders:', e.message); return []; });
  // a turn runs until the next thing that matters (a host arrives, a foe draws near, an answer lands…), at most a moon
  let turnReason = null;
  if (!span || span === 'auto' || span === 'turn') { const n = nextTurnLength(state); span = `${n.days}d`; turnReason = n.reason; }
  const spanInfo = spanOf(span);
  state.meta.clock.to = day0 + spanInfo.days;

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
      if (risk && random() < Math.min(0.85, risk)) naturalDeaths.push({ op: 'character', id: c.id, alive: false, cause: ailing ? 'illness' : 'old age' });
    }
  }
  state.meta.turn += 1;
  const orderText = state.orders.map((o) => o.text).join(' ');
  const playerChoseAllegiance = /fealty|swear|kneel|bend the knee|independen|king in the north|secede|declare (my|our)|crown (me|myself)|renounce/i.test(orderText);
  const playerDeclaredWar = /\b(declare war|make war|attack|march on|invade|assault|lay siege|besiege|ride against|strike at)\b/i.test(orderText);
  // ── THE ENGINE'S PART OF THE TURN: what the rules decide, day by day — marches and arrivals, musters, battles,
  // the great matters of the story, lords on the road, letters landing. The story is then told around these facts.
  const applied = [], rejected = [];
  // the years' dead are told in the years' own words: their facts are recorded here, before the heirs' (not by the op)
  const deathEvents = naturalDeaths.map((d) => state.characters[d.id]).map((c) => fact(state, 'death', { title: `${c.name} is dead`, text: `${c.name}${c.title ? ', ' + c.title + ',' : ''} has died of ${c.bio && /ailing|dying/i.test(c.bio) ? 'a long illness' : 'old age'}, aged ${c.age}.`, where: state.houses[c.house]?.seat || null, importance: state.houses[c.house]?.lord === c.id || ['paramount', 'crown'].includes(state.houses[c.house]?.rank) ? 4 : 2, houses: [c.house] }, { actors: [c.id], data: { cause: naturalDeaths.find((d) => d.id === c.id).cause, age: c.age }, cause: { type: 'rule', ref: 'the years' } }));
  { const r0 = applyChanges(state, naturalDeaths, { source: 'The years', spanDays: spanInfo.days, told: ['character'] }); applied.push(...r0.applied); }
  // Vassals whose obligations the story did not settle act on their own temper: dues, and the banners
  const touched = new Set();
  const vt = vassalTick(state, spanInfo.days, touched);
  applied.push(...vt.applied);
  vt.events.push(...advanceMusters(state, spanInfo.days));
  // Every party with somewhere to be walks its planned road, day by day: hosts, fleets, households, riders
  // (shared/marches.js over engine/movement.js). A host raised during the turn sets out on the day it was raised.
  const turnStart = dayNumber(state.meta.date) - spanInfo.days;
  const mt = marchTick(state, { span: spanInfo.days, turnStart });
  vt.events.push(...mt.events); applied.push(...mt.applied);
  // The road is not safe: outlaws, foragers, floods and snow — and now and then a friend
  const rd = roadEncounters(state, spanInfo.days);
  vt.events.push(...rd.events); applied.push(...rd.applied);
  // Oaths are weighed: tempted lords treat with the enemy in secret, and the desperate turn their cloaks
  const tr = treacheryTick(state, spanInfo.days);
  vt.events.push(...tr.events); applied.push(...tr.applied);
  // Hosts in contact fight; hosts before enemy walls besiege them. The engine fights first and the story is
  // then told the results, so a battle is never fought twice or narrated away.
  const wf = resolveWarfare(state, spanInfo.days);
  vt.events.push(...wf.events); applied.push(...wf.applied);
  vt.events.push(...fieldService(state, spanInfo.days), ...gatherMusters(state));
  // The world goes on: the great threads of the story, rising threats, the other houses' lives
  const wt = worldTick(state, spanInfo.days);
  vt.events.push(...wt.events); applied.push(...wt.applied);
  // Who rules where the head of a house cannot: regencies begin, hold and end, and cost the house its vassals' patience
  const rg = regencyTick(state, spanInfo.days);
  vt.events.push(...rg.events); applied.push(...rg.applied);
  // What a war does to the men who fight it and the lords who order it: stress and mistrust, told
  // only as behaviour — a lord who cannot sleep, a hand that shakes, treason read into a courtesy
  const ps = psycheTick(state, spanInfo.days);
  vt.events.push(...ps.events); applied.push(...ps.applied);
  // lords on the road with their households: feasts, weddings, their liege's hall, the market towns
  vt.events.push(...retinueTick(state, spanInfo.days).events);
  vt.events.push(...deliverReplies(state));
  const engineEvents = dayEngineEvents(state, [...deathEvents, ...foldAnswers(vt.events)], spanInfo.days);
  for (const a of Object.values(state.parties)) { delete a.bornDay; delete a.landed; }
  // ── THE STORY'S PART: the model writes the days around the engine's facts, and the rest of the realm's doings
  const applyCtx = { source: 'Reports & rumours', protectPlayer: true, playerChoseAllegiance, playerDeclaredWar, spanDays: spanInfo.days };
  let { obj, raw, error, text } = await runSwarm(id, state, cfg, {
    span, chronicle, turnReason, engineEvents, dateFrom, applyCtx, applied, rejected,
  });
  let salvaged = false;
  if (!obj) {
    // Unreadable even after repair and a retry: the realm still moves on (the ledger, vassals, seasons and marches
    // run as always), keeping whatever narrative can be salvaged from the reply.
    salvaged = true;
    const sum = extractField(text, 'summary');
    obj = { summary: sum || 'The ravens bring confused and contradictory reports this season; the maesters could make little sense of them.', events: [], changes: [] };
    console.warn(`turn ${state.meta.turn + 1}: simulator reply unreadable (${error}); the engine advanced the world alone`);
  }

  const told = applyChanges(state, obj.changes || [], { ...applyCtx, cause: { type: 'intent', ref: 'story' } });
  applied.push(...told.applied); rejected.push(...told.rejected);
  // The seasons turn on their own if the story does not turn them (the white raven is news on the turn's last day)
  if (!applied.some((a) => a.op === 'season')) {
    const turned = seasonTick(state, spanInfo.days);
    if (turned) { engineEvents.push(fact(state, 'season_turned', { title: `A white raven: ${turned.season} has come`, text: turned.text, where: resolvePlaceId('oldtown'), importance: 5, houses: [], day: spanInfo.days }, { data: { season: turned.season }, cause: { type: 'rule', ref: 'seasons' } })); applied.push({ op: 'season', text: `The season turns: ${turned.season.toUpperCase()}` }); }
  } else { state.world.seasonDays = 0; }
  // What the player's house has seen of the other hosts this period (fog of war)
  updateIntel(state);
  postTick(state);
  // Settle the books for the period (after the story has changed the causes)
  const econNotes = settle(state, spanInfo.days);
  const events = (Array.isArray(obj.events) ? obj.events : []).map((e, k) => ({
    day: Math.max(1, Math.min(spanInfo.days, Math.round(Number(e.day) || Math.round(((k + 1) / ((obj.events?.length || 1) + 1)) * spanInfo.days)))),
    // a stray foreign glyph from the sampler ("Lord Um伯", B-27) is dropped before the chronicle keeps the words
    title: stripForeignScript(String(e.title || 'Untitled')), text: stripForeignScript(String(e.text || e.description || '')), details: e.details ? stripForeignScript(String(e.details)) : '', where: resolvePlaceId(e.where || e.location) || null,
    importance: Math.max(1, Math.min(5, Number(e.importance) || 2)), type: String(e.type || 'court'), houses: Array.isArray(e.houses) ? e.houses : [],
    ...(Number(e.order) >= 1 ? { order: Number(e.order) } : {}),
    story: true, // the story's telling, not the engine's record: no fact stands behind it (03 §1)
  }));
  // the story sometimes writes the same event twice: tell it once
  for (let k = events.length - 1; k > 0; k--) if (events.slice(0, k).some((x) => x.title === events[k].title && x.text === events[k].text)) events.splice(k, 1);
  // the chronicle may not tell what the engine did not do (a lord arriving who is still on the road), nor tell again
  // what the engine has already told (every banner that answered)
  { const kept = trueToTheRecord(state, events, engineEvents); rejected.push(...kept.dropped); events.length = 0; events.push(...kept.events); }
  // every order the lord gave has its event, told first on its day
  events.push(...orderEvents(state, state.orders, events));
  events.push(...engineEvents);
  // every event has its day in the period, so the turn can be told in order
  for (const e of events) if (!e.day) e.day = 1 + Math.floor(random() * spanInfo.days);
  events.sort((a, b) => a.day - b.day || (b.orderId ? 1 : 0) - (a.orderId ? 1 : 0));
  for (const a of applied.filter((x) => x.op === 'succession')) {
    const hh = state.houses[a.house]; const f = factById(state, a.fact);
    const card = { title: `A new head of House ${hh?.name}`, text: a.text.replace(/^SUCCESSION: /, ''), where: hh?.seat || null, importance: a.house === state.meta.player ? 5 : 4, type: 'court', houses: [a.house] };
    events.unshift(f ? { ...card, fact: f.id, day: asEvent(state, f).day } : card);
  }
  const p = state.meta.player;
  const mine = econNotes.filter((n) => n.house === p || state.houses[n.house]?.liege === p || (n.important && n.house === state.houses[p].liege));
  // the steward's small notes are the life of your lands, not headlines; only the grave ones are news
  for (const n of mine.slice(0, 6)) events.push(fact(state, 'ledger', { title: n.important ? 'The ledger' : 'From the steward\'s accounts', text: n.text, where: n.holding || null, importance: n.important ? 3 : 1, houses: [n.house], ...(n.important ? {} : { bg: true, mine: true }) }, { cause: { type: 'rule', ref: 'economy' } }));
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
  // one date for every view (HUD, feed, reel, pins): day d of the period is the d-th day after it began — and the fact
  // behind each card falls on the same day as the card
  events.forEach((e, k) => { e.id = `${state.meta.turn}-${k}`; e.date = dateStr(addDays(state.meta.date, e.day - spanInfo.days)); redate(state, e); });
  const record = { carried, turn: state.meta.turn, dateFrom, date: dateStr(state.meta.date), span, ...(turnReason ? { until: turnReason } : {}), orders: state.orders, summary: stripForeignScript(String(obj.summary || '')), events, applied, rejected, ms: raw?.ms, usage: raw?.usage, ledger: state.houses[p].ledger.at(-1), ...(salvaged ? { salvaged: true } : {}) };
  state.history.push(record);
  // the game reads back only the recent turns (and those the chronicle has not yet taken in); every turn is in turns/
  state.history = state.history.filter((t) => t.turn > state.meta.turn - KEEP_HISTORY || t.turn > (state.consolidatedThrough ?? 0));
  state.orders = [];
  // If the simulator raised no matter for the player over a moon or more, the realm brings one itself
  const newDecision = applied.some((a) => a.op === 'decision');
  const pendingCount = (state.decisions || []).filter((d) => d.status === 'pending').length;
  if (!newDecision && pendingCount === 0 && random() < 0.75 * Math.min(1, spanInfo.days / 30)) {
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

  // Where the house stands after all of it, and whether the story has reached its end — ruin, the failing of
  // the line, a crown of your own, or the Iron Throne. The engine decides this, never the story model.
  state.standing = standing(state, p);
  if (!state.outcome) {
    const oc = outcomeFor(state);
    if (oc) {
      state.outcome = { ...oc, turn: state.meta.turn, date: record.date };
      events.push(fact(state, oc.victory ? 'crowned' : 'house_ended', { title: oc.title, text: oc.text, where: state.houses[p].seat || null, importance: 5, type: 'court', houses: [p], day: spanInfo.days }, { actors: [state.houses[p].lord], data: { outcome: oc.kind, victory: oc.victory }, cause: { type: 'rule', ref: 'standing' } }));
      state.chronicle.push({ date: record.date, text: `${oc.title} — ${oc.text}` });
    }
  }

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
  reply = stripForeignScript(reply.replace(/<br\s*\/?>/gi, '\n')); // HTML line breaks become the scene's own; stray foreign glyphs go (B-27)
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
  if (!together(state, lord, c)) {
    const days = ravenDays(state, lord, c); const today = dayNumber(state.meta.date);
    const back = addDays(state.meta.date, days * 2);
    state.post = state.post || [];
    state.post.unshift({ id: `post_${state.meta.turn}_${state.post.length}_${c.id}`, to: c.id, toName: c.name, text: message, sent: dateStr(state.meta.date), sentDay: today, arriveDay: today + days, days, status: 'in flight' });
    state.pendingReplies = [...(state.pendingReplies || []), { char: c.id, arrivesDay: today + days * 2, changes, mayMove: ownMan ? mayMove : [], text: reply }];
    emit(state, 'letter_sent', { actors: [lordId, c.id], houses: [p, c.house], data: { to: c.id, days }, vis: { scope: 'houses', houses: [p, c.house] }, cause: { type: 'order', ref: 'letter' }, text: `A raven flies from ${lord?.name || `House ${state.houses[p].name}`} to ${c.name} (~${days} days).` });
    const turn = state.meta.turn;
    state.chats[charId] = [...(state.chats[charId] || []), { role: 'player', text: message, date: dateStr(state.meta.date), turn, via: 'raven' }, { role: 'npc', text: reply, date: dateStr(back), turn, pending: true, arrivesDay: today + days * 2, mood: stance.moodWord, ...(stance.verdict ? { verdict: stance.verdict } : {}) }];
    saveState(id, state);
    return { reply: null, raven: { days, back: dateStr(back) }, applied: [], rejected: [], state, stance: { verdict: null, mood: moodWord(stance.mood), patience: stance.mood.patience, full: stance.mood.full, closed: !!stance.mood.closed } };
  }
  // the audience is a fact (who spoke with whom, and where); what was said stays in the conversation
  emit(state, 'audience_held', { actors: [lordId, c.id], houses: [p, c.house], place: resolvePlaceId(c.loc) || partyOf(state, c)?.at || null, data: { verdict: stance.verdict || null }, vis: { scope: 'houses', houses: [p, c.house] }, cause: { type: 'order', ref: 'audience' }, text: `${lord?.name || `The lord of House ${state.houses[p].name}`} speaks with ${c.name}.` });
  let { applied, rejected } = applyChanges(state, changes, { source: c.name, protectPlayer: true, mayMove: ownMan ? mayMove : [], cause: { type: 'intent', ref: c.id } });
  // a plain command to one of the house's own people, said to their face, is an order: read by the rules, with them
  // as the one addressed ("ride to the Twins" means them), and carried out through the verbs like a written one
  if (ownMan && c.id !== state.houses[p].lord && !applied.some((a) => ['travel', 'ride', 'recruit', 'hire'].includes(a.op))) {
    const read = parseOrder(state, message, { addressee: c.id });
    for (const a of read.clarify ? [] : read.actions) {
      const r = perform(state, a.verb, { params: a.params, source: { type: 'order', ref: 'audience' } });
      for (const l of r.receipt) (r.ok ? applied.push({ op: a.verb, text: l.text.replace(/\.$/, '') }) : rejected.push({ change: { verb: a.verb, ...a.params }, reason: `could not be done: ${l.text.replace(/\.$/, '')}` }));
    }
  }
  const turn = state.meta.turn;
  state.chats[charId] = [...(state.chats[charId] || []), { role: 'player', text: message, date: dateStr(state.meta.date), turn }, { role: 'npc', text: reply, date: dateStr(state.meta.date), turn, applied: applied.map((a) => a.text), mood: stance.moodWord, ...(stance.verdict ? { verdict: stance.verdict } : {}) }];
  if (state.chronicle.length) { appendChronicle(id, state.chronicle.map((x) => `- ${x.date}: ${x.text}`).join('\n') + '\n'); state.chronicle = []; }
  saveState(id, state);
  return { reply, applied, rejected, state, stance: { verdict: stance.verdict, mood: moodWord(stance.mood), patience: stance.mood.patience, full: stance.mood.full, closed: !!stance.mood.closed } };
}

// The engine's events keep the day they happened; those it cannot date fall where their place's news fell (a host's
// arrival), else spread through the days
function dayEngineEvents(state, evs, days) {
  const arrived = new Map(Object.values(state.parties).filter((a) => a.arriveDay && a.at).map((a) => [a.at, a.arriveDay]));
  for (const e of evs) {
    if (e.day) { e.day = Math.max(1, Math.min(days, Math.round(e.day))); continue; }
    e.day = (e.where && arrived.get(e.where)) || 1 + Math.floor(random() * days);
    redate(state, e); // its fact (and the heir's, if it tells a death) falls on the same day
  }
  return evs.sort((a, b) => a.day - b.day);
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
// The story model's events are checked against the engine's record before they reach the chronicle:
//  - a story event that tells again what an engine event already told (a banner answering, a host joining, a crossing)
//    is dropped: the engine's own card says it with the true numbers;
//  - a story event that has a lord or host of the player's realm ARRIVE, JOIN or MUSTER when the engine recorded no such
//    arrival this turn is dropped: the map would contradict it. (docs/gdd/04-ai-system.md §6.4 is the full validator.)
export function trueToTheRecord(state, events, engineEvents) {
  const p = state.meta.player; const dropped = [];
  const realm = Object.values(state.houses).filter((h) => h.id !== p && h.liege === p);
  const namesOf = (h) => [h.name, state.characters[h.lord]?.name].filter(Boolean).map((n) => n.toLowerCase()).filter((n) => n.length > 3);
  const engineText = engineEvents.map((e) => `${e.title} ${e.text}`.toLowerCase());
  const ARRIVE = /\b(arriv\w*|reach(es|ed)?|rides? into|rode into|join(s|ed)?|assembl\w*|mustered|gathered at|gathers at)\b/i;
  const REPEAT = /\b(answers? the call|raises? \d|delays?|joins?|crosse[sd]|passes the neck)\b/i;
  const told = (h, re) => engineText.some((x) => namesOf(h).some((n) => x.includes(n)) && re.test(x));
  const kept = events.filter((e) => {
    const tl = `${e.title} ${e.text} ${e.details || ''}`.toLowerCase();
    const named = realm.filter((h) => namesOf(h).some((n) => tl.includes(n)));
    if (REPEAT.test(e.title) && named.some((h) => told(h, REPEAT))) { dropped.push({ change: { op: 'event', title: e.title }, reason: 'the engine already told it' }); return false; }
    if (ARRIVE.test(e.title) || ARRIVE.test(e.text)) {
      const unrecorded = named.filter((h) => !told(h, /(join|reach|arriv|cross)/));
      if (unrecorded.length) { dropped.push({ change: { op: 'event', title: e.title }, reason: `no such arrival in the record (${unrecorded.map((h) => h.name).join(', ')})` }); return false; }
    }
    return true;
  });
  return { events: kept, dropped };
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

export async function council(id, members, message) {
  if (consolidating.has(id)) await consolidating.get(id).catch(() => {});
  const cfg = loadConfig();
  const state = loadState(id);
  return withDice(state, () => councilWith(id, state, cfg, members, message));
}
async function councilWith(id, state, cfg, members, message) {
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
  const replies = read.replies.map((x) => ({ ...x, text: stripForeignScript(x.text) })); const changes = read.changes;
  const lordId = state.houses[state.meta.player].lord;
  emit(state, 'audience_held', { actors: [lordId, ...ids], houses: [state.meta.player], place: state.houses[state.meta.player].seat || null, data: { council: true }, vis: { scope: 'houses', houses: [state.meta.player] }, cause: { type: 'order', ref: 'council' }, text: `${state.characters[lordId]?.name || 'The lord'} holds council with ${ids.map((i) => state.characters[i].name).join(', ')}.` });
  const { applied, rejected } = applyChanges(state, changes, { source: 'Council', protectPlayer: true, cause: { type: 'intent', ref: 'council' } });
  const key = 'council:' + ids.sort().join(',');
  const date = dateStr(state.meta.date), turn = state.meta.turn;
  state.chats[key] = [...(state.chats[key] || []), ...(listening ? [] : [{ role: 'player', text: message, date, turn }]), ...replies.map((x) => ({ role: 'npc', speaker: x.speaker, text: x.text, date, turn }))];
  saveState(id, state);
  return { replies, applied, rejected, state, key };
}
