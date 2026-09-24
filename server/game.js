// Game session management: saves, time jumps, conversations, memory consolidation.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { chat, extractJson, loadConfig, estimateTokens } from './llm.js';
import { buildJumpPrompt, buildChatPrompt, buildSuggestPrompt, buildConsolidatePrompt, buildCouncilPrompt } from './prompts.js';
import { createInitialState, applyChanges, addDays, dateStr, SPANS, resolvePlaceId } from '../public/js/shared/world.js';
import { settle, initEconomy, PROJECT_TEMPLATES, TAX_LEVELS } from '../public/js/shared/economy.js';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
export const SAVES = path.join(ROOT, 'saves');
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
  state.orders = (orders || []).map((o) => ({ id: o.id || crypto.randomBytes(4).toString('hex'), text: String(o.text || '').slice(0, 2000) })).filter((o) => o.text.trim());
  saveState(id, state);
  return state.orders;
}

async function askJson(id, kind, messages, cfg) {
  const r1 = await chat(messages, { json: true, kind });
  logLLM(id, kind, messages, r1.text);
  try { return { obj: extractJson(r1.text), raw: r1 }; } catch (e1) {
    const retry = [...messages, { role: 'assistant', content: r1.text.slice(0, 8000) }, { role: 'user', content: 'That reply was not valid JSON. Reply again with ONLY the complete JSON object, no commentary, no code fences.' }];
    const r2 = await chat(retry, { json: true, kind, temperature: 0.4 });
    logLLM(id, kind + '-retry', retry, r2.text);
    try { return { obj: extractJson(r2.text), raw: r2 }; } catch (e2) {
      return { obj: null, raw: r2, error: e2.message, text: r2.text || r1.text };
    }
  }
}

export async function advance(id, { span = '1m', orders } = {}) {
  const cfg = loadConfig();
  const state = loadState(id);
  if (orders) state.orders = orders.map((o) => ({ id: o.id || crypto.randomBytes(4).toString('hex'), text: String(o.text) })).filter((o) => o.text.trim());
  const chronicle = readChronicle(id);
  const messages = buildJumpPrompt(state, state.orders, span, chronicle, cfg);
  const { obj, raw, error, text } = await askJson(id, 'jump', messages, cfg);
  if (!obj) throw httpError(502, `The simulator's reply could not be parsed (${error}). Raw start: ${String(text).slice(0, 300)}`);

  // Keep an undo point
  fs.writeFileSync(path.join(dir(id), 'prev-state.json'), JSON.stringify(state));
  fs.writeFileSync(path.join(dir(id), 'prev-chronicle.md'), chronicle);

  const spanInfo = SPANS[span] || SPANS['1m'];
  const dateFrom = dateStr(state.meta.date);
  state.meta.date = addDays(state.meta.date, spanInfo.days);
  state.meta.turn += 1;
  const { applied, rejected } = applyChanges(state, obj.changes || [], { source: 'Reports & rumours' });
  // Settle the books for the period (after the story has changed the causes)
  const econNotes = settle(state, spanInfo.days);
  const events = (Array.isArray(obj.events) ? obj.events : []).map((e) => ({
    title: String(e.title || 'Untitled'), text: String(e.text || e.description || ''), where: resolvePlaceId(e.where || e.location) || null,
    importance: Math.max(1, Math.min(5, Number(e.importance) || 2)), type: String(e.type || 'court'), houses: Array.isArray(e.houses) ? e.houses : [],
  }));
  const p = state.meta.player;
  const mine = econNotes.filter((n) => n.house === p || state.houses[n.house]?.liege === p || (n.important && n.house === state.houses[p].liege));
  for (const n of mine.slice(0, 6)) events.push({ title: n.important ? 'The ledger' : 'From the steward\'s accounts', text: n.text, where: n.holding || null, importance: n.important ? 3 : 1, type: 'economy', houses: [n.house] });
  const record = { turn: state.meta.turn, dateFrom, date: dateStr(state.meta.date), span, orders: state.orders, summary: String(obj.summary || ''), events, applied, rejected, ms: raw.ms, usage: raw.usage, ledger: state.houses[p].ledger.at(-1) };
  state.history.push(record);
  state.orders = [];

  // Flush chronicle ops + major events into the markdown chronicle
  const notes = [...state.chronicle.map((c) => c.text), ...events.filter((e) => e.importance >= 5).map((e) => `${e.title} — ${e.text}`)];
  if (notes.length) appendChronicle(id, `\n### ${record.date} (turn ${record.turn})\n` + notes.map((n) => `- ${n}`).join('\n') + '\n');
  state.chronicle = [];

  saveState(id, state);
  const consolidated = await maybeConsolidate(id, state, cfg).catch((e) => ({ error: e.message }));
  return { state: loadState(id), turn: record, consolidated };
}

async function maybeConsolidate(id, state, cfg, force = false) {
  const pending = state.history.filter((t) => t.turn > state.consolidatedThrough);
  const pendingTokens = estimateTokens(JSON.stringify(pending.map((t) => [t.summary, t.events])));
  const tooBig = pendingTokens > cfg.contextTokens * 0.2;
  if (!force && pending.length < cfg.consolidateEvery + cfg.keepRecentTurns && !tooBig) return null;
  const batch = pending.slice(0, Math.max(1, pending.length - cfg.keepRecentTurns));
  if (!batch.length) return null;
  const messages = buildConsolidatePrompt(state, batch, readChronicle(id));
  const { obj, text } = await askJson(id, 'consolidate', messages, cfg);
  const entry = obj?.chronicle || text || batch.map((t) => t.summary).join('\n');
  appendChronicle(id, `\n## ${batch[0].dateFrom} — ${batch.at(-1).date} (turns ${batch[0].turn}–${batch.at(-1).turn})\n${entry}\n`);
  const fresh = loadState(id);
  fresh.consolidatedThrough = batch.at(-1).turn;
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
  const cfg = loadConfig();
  const state = loadState(id);
  const c = state.characters[charId];
  if (!c) throw httpError(404, 'unknown character');
  if (!c.alive) throw httpError(400, `${c.name} is dead.`);
  const messages = buildChatPrompt(state, charId, message, readChronicle(id), cfg);
  const r = await chat(messages, { json: true, kind: 'chat' });
  logLLM(id, 'chat', messages, r.text);
  let reply = r.text, changes = [];
  try { const o = extractJson(r.text); reply = String(o.reply ?? o.response ?? r.text); changes = Array.isArray(o.changes) ? o.changes : []; } catch { /* plain-text reply */ }
  const { applied, rejected } = applyChanges(state, changes, { source: c.name });
  const turn = state.meta.turn;
  state.chats[charId] = [...(state.chats[charId] || []), { role: 'player', text: message, date: dateStr(state.meta.date), turn }, { role: 'npc', text: reply, date: dateStr(state.meta.date), turn, applied: applied.map((a) => a.text) }];
  if (state.chronicle.length) { appendChronicle(id, state.chronicle.map((x) => `- ${x.date}: ${x.text}`).join('\n') + '\n'); state.chronicle = []; }
  saveState(id, state);
  return { reply, applied, rejected, state };
}

export async function suggest(id) {
  const cfg = loadConfig();
  const state = loadState(id);
  const { obj, text } = await askJson(id, 'suggest', buildSuggestPrompt(state, readChronicle(id), cfg), cfg);
  const list = obj?.suggestions || String(text || '').split('\n').filter((l) => l.trim()).slice(0, 7);
  return { suggestions: list.map(String) };
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
  const addOrder = (text) => state.orders.push({ id: crypto.randomBytes(4).toString('hex'), text, auto: true });
  let result = {};
  switch (body.kind) {
    case 'tax': {
      if (!TAX_LEVELS[body.level]) throw httpError(400, 'bad tax level');
      applyChanges(state, [{ op: 'tax', house: p, level: body.level }]);
      addOrder(`Proclaim ${TAX_LEVELS[body.level].label.toLowerCase()} taxes across my lands and on my vassals' dues.`);
      break;
    }
    case 'project': {
      const t = PROJECT_TEMPLATES.find((x) => x.key === body.template); if (!t) throw httpError(400, 'unknown project');
      const hold = state.holdings[body.holding] && state.holdings[body.holding].owner === p ? body.holding : me.seat;
      if ((me.figures.treasury.v || 0) < t.cost * 0.25) throw httpError(400, `The treasury cannot even fund the first stage of ${t.name} (needs ~${Math.round(t.cost * 0.25)} gd up front).`);
      applyChanges(state, [{ op: 'project', house: p, name: `${t.name} at ${state.holdings[hold].name}`, cost: t.cost, months: t.months, holding: hold, effect: t.effect }]);
      addOrder(`Fund works: ${t.name} at ${state.holdings[hold].name} (${t.cost} gold dragons over ${t.months} moons).`);
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
      for (const v of vassals) state.houses[v].obligations = { ...(state.houses[v].obligations || {}), levies: 'called' };
      const at = state.holdings[body.at] ? state.holdings[body.at].name : state.holdings[me.seat]?.name;
      addOrder(`CALL THE BANNERS: I summon ${vassals.map((v) => 'House ' + state.houses[v].name).join(', ')} to muster their levies at ${at}${body.deadline ? ' within ' + body.deadline : ''}.${body.note ? ' ' + body.note : ''} Raise my own levies as well${body.ownLevies ? ` (${body.ownLevies} men)` : ''}.`);
      break;
    }
    case 'order': {
      addOrder(String(body.text || '').slice(0, 2000));
      break;
    }
    default: throw httpError(400, 'unknown action');
  }
  saveState(id, state);
  return { state, ...result };
}

export async function council(id, members, message) {
  const cfg = loadConfig();
  const state = loadState(id);
  const ids = (members || []).filter((m) => state.characters[m]?.alive);
  if (!ids.length) throw httpError(400, 'no one to hold council with');
  const messages = buildCouncilPrompt(state, ids, message, readChronicle(id), cfg);
  const r = await chat(messages, { json: true, kind: 'council' });
  logLLM(id, 'council', messages, r.text);
  let replies = [], changes = [];
  try { const o = extractJson(r.text); replies = Array.isArray(o.replies) ? o.replies : []; changes = Array.isArray(o.changes) ? o.changes : []; } catch { replies = [{ speaker: ids[0], text: r.text }]; }
  replies = replies.map((x) => ({ speaker: state.characters[x.speaker] ? x.speaker : ids.find((i) => state.characters[i].name === x.speaker) || ids[0], text: String(x.text || '') })).filter((x) => x.text);
  const { applied, rejected } = applyChanges(state, changes, { source: 'Council' });
  const key = 'council:' + ids.sort().join(',');
  const date = dateStr(state.meta.date), turn = state.meta.turn;
  state.chats[key] = [...(state.chats[key] || []), { role: 'player', text: message, date, turn }, ...replies.map((x) => ({ role: 'npc', speaker: x.speaker, text: x.text, date, turn }))];
  saveState(id, state);
  return { replies, applied, rejected, state, key };
}
