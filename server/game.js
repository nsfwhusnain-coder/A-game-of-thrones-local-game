// Game session management: saves, time jumps, conversations, memory consolidation.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { chat, extractJson, extractField, loadConfig, estimateTokens } from './llm.js';
import { buildJumpPrompt, buildChatPrompt, buildSuggestPrompt, buildConsolidatePrompt, buildCouncilPrompt } from './prompts.js';
import { createInitialState, migrateState, applyChanges, placePos, placeName, addDays, dateStr, SPANS, resolvePlaceId } from '../public/js/shared/world.js';
import { settle, initEconomy, seasonTick, PROJECT_TEMPLATES, TAX_LEVELS } from '../public/js/shared/economy.js';
import { marchDays, MILES_PER_UNIT } from '../public/js/shared/warfare.js';
import { realmPetition, applyPetitionFx } from '../public/js/shared/petitions.js';
import { vassalTick, gatherMusters, fieldService } from '../public/js/shared/vassals.js';

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

const consolidating = new Map(); // save id -> promise (memory is compressed in the background)

export async function advance(id, { span = '1m', orders } = {}) {
  if (consolidating.has(id)) await consolidating.get(id).catch(() => {});
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
  const { applied, rejected } = applyChanges(state, [...(obj.changes || []), ...naturalDeaths], { source: 'Reports & rumours', protectPlayer: true, playerChoseAllegiance });
  const deathEvents = naturalDeaths.map((d) => state.characters[d.id]).filter((c) => c && !c.alive).map((c) => ({ title: `${c.name} is dead`, text: `${c.name}${c.title ? ', ' + c.title + ',' : ''} has died of ${c.bio && /ailing|dying/i.test(c.bio) ? 'a long illness' : 'old age'}, aged ${c.age}.`, where: state.houses[c.house]?.seat || null, importance: state.houses[c.house]?.lord === c.id || ['paramount', 'crown'].includes(state.houses[c.house]?.rank) ? 4 : 2, type: 'court', houses: [c.house] }));
  // Vassals whose obligations the story did not settle act on their own temper: dues, and the banners
  const touched = new Set((obj.changes || []).filter((c) => c && ['obligation', 'vassal'].includes(c.op)).map((c) => String(c.house || '').toLowerCase()));
  const vt = vassalTick(state, spanInfo.days, touched);
  applied.push(...vt.applied);
  // Marching orders the story didn't resolve: the engine walks the host along at marching pace
  for (const a of Object.values(state.armies)) {
    if (!a.march || a.movedTurn === state.meta.turn) continue;
    const dest = placePos(a.march.to, state.holdings); if (!dest) { delete a.march; continue; }
    const m = marchDays(a, a.pos, dest);
    const f = Math.min(1, spanInfo.days / Math.max(1, m.days));
    const mv = applyChanges(state, [{ op: 'army_move', army: a.id, to: a.march.to, progress: f, status: f >= 1 ? 'arrived' : 'marching' }]);
    applied.push(...mv.applied);
    if (f >= 1) delete a.march;
  }
  vt.events.push(...fieldService(state, spanInfo.days), ...gatherMusters(state));
  // The seasons turn on their own if the story does not turn them
  if (!applied.some((a) => a.op === 'season')) {
    const turned = seasonTick(state, spanInfo.days);
    if (turned) { vt.events.unshift({ title: `A white raven: ${turned.season} has come`, text: turned.text, where: resolvePlaceId('oldtown'), importance: 5, type: 'court', houses: [] }); applied.push({ op: 'season', text: `The season turns: ${turned.season.toUpperCase()}` }); }
  } else { state.world.seasonDays = 0; }
  // Settle the books for the period (after the story has changed the causes)
  const econNotes = settle(state, spanInfo.days);
  const events = (Array.isArray(obj.events) ? obj.events : []).map((e) => ({
    title: String(e.title || 'Untitled'), text: String(e.text || e.description || ''), where: resolvePlaceId(e.where || e.location) || null,
    importance: Math.max(1, Math.min(5, Number(e.importance) || 2)), type: String(e.type || 'court'), houses: Array.isArray(e.houses) ? e.houses : [],
  }));
  events.push(...deathEvents, ...vt.events);
  for (const a of applied.filter((x) => x.op === 'succession')) {
    const hh = state.houses[a.house];
    events.unshift({ title: `A new head of House ${hh?.name}`, text: a.text.replace(/^SUCCESSION: /, ''), where: hh?.seat || null, importance: a.house === state.meta.player ? 5 : 4, type: 'court', houses: [a.house] });
  }
  const p = state.meta.player;
  const mine = econNotes.filter((n) => n.house === p || state.houses[n.house]?.liege === p || (n.important && n.house === state.houses[p].liege));
  for (const n of mine.slice(0, 6)) events.push({ title: n.important ? 'The ledger' : 'From the steward\'s accounts', text: n.text, where: n.holding || null, importance: n.important ? 3 : 1, type: 'economy', houses: [n.house] });
  const record = { turn: state.meta.turn, dateFrom, date: dateStr(state.meta.date), span, orders: state.orders, summary: String(obj.summary || ''), events, applied, rejected, ms: raw.ms, usage: raw.usage, ledger: state.houses[p].ledger.at(-1) };
  state.history.push(record);
  state.orders = [];
  // If the simulator raised no matter for the player over a moon or more, the realm brings one itself
  const newDecision = applied.some((a) => a.op === 'decision');
  const pendingCount = (state.decisions || []).filter((d) => d.status === 'pending').length;
  if (!newDecision && pendingCount === 0 && spanInfo.days >= 28 && Math.random() < 0.75) {
    const pet = realmPetition(state);
    if (pet) { const r = applyChanges(state, [{ op: 'decision', ...pet }]); record.applied.push(...r.applied); }
  }
  // Unanswered decisions lapse after a couple of turns — the world moved on without you
  for (const d of state.decisions || []) if (d.status === 'pending' && state.meta.turn - d.turn >= 3) {
    d.status = 'lapsed';
    if (d.kind === 'liege_call') applyPetitionFx(state, [{ call: 'refuse' }]); // silence is refusal
    const fx = (d.options || []).flatMap((o) => o.fx || []);
    const rising = fx.find((e) => e.rising), rebel = fx.find((e) => e.rebel);
    if (rising) applyPetitionFx(state, [{ rising: [rising.rising[0], 'ignore'] }]);
    if (rebel) applyPetitionFx(state, [{ rebel: [rebel.rebel[0], 'release'] }]); // silence: they take themselves out of your realm
  }

  // Flush chronicle ops + major events into the markdown chronicle
  const notes = [...state.chronicle.map((c) => c.text), ...events.filter((e) => e.importance >= 5).map((e) => `${e.title} — ${e.text}`)];
  if (notes.length) appendChronicle(id, `\n### ${record.date} (turn ${record.turn})\n` + notes.map((n) => `- ${n}`).join('\n') + '\n');
  state.chronicle = [];

  saveState(id, state);
  // Compress old turns into the chronicle without making the player wait
  const job = maybeConsolidate(id, state, cfg).catch((e) => { console.error('consolidation failed:', e.message); return null; }).finally(() => consolidating.delete(id));
  consolidating.set(id, job);
  return { state: loadState(id), turn: record, consolidated: 'background' };
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
  if (consolidating.has(id)) await consolidating.get(id).catch(() => {});
  const cfg = loadConfig();
  const state = loadState(id);
  const c = state.characters[charId];
  if (!c) throw httpError(404, 'unknown character');
  if (!c.alive) throw httpError(400, `${c.name} is dead.`);
  const messages = buildChatPrompt(state, charId, message, readChronicle(id), cfg);
  const r = await chat(messages, { json: true, kind: 'chat' });
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
  // Sanity guard: a conversation can refine the ledger, not rewrite it (protects against model hallucinations)
  changes = changes.filter((ch) => {
    if (!ch || String(ch.op) !== 'figure') return true;
    if (!ch.source || /your name/i.test(ch.source)) ch.source = c.name;
    const h = state.houses[ch.house]; const f = h?.figures?.[ch.field]; const v = Number(String(ch.value ?? '').replace(/,/g, ''));
    if (!f || !isFinite(v) || ch.value === undefined) return true;
    const cur = Number(f.v) || 0;
    return cur === 0 ? v < 5000 : v / cur < 2.5 && v / cur > 0.4;
  });
  const { applied, rejected } = applyChanges(state, changes, { source: c.name, protectPlayer: true });
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
    case 'dues': {
      if (!me.liege) throw httpError(400, 'you owe dues to no one');
      if (!['paying', 'late', 'withholding'].includes(body.status)) throw httpError(400, 'bad status');
      me.obligations = { ...(me.obligations || {}), tribute: body.status };
      const lg = state.houses[me.liege];
      addOrder(body.status === 'paying' ? `Pay my dues to House ${lg.name} in full.` : body.status === 'late' ? `Delay my dues to House ${lg.name}; send excuses and small sums.` : `Withhold all dues from House ${lg.name}.`);
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
      for (const v of vassals) state.houses[v].obligations = { ...(state.houses[v].obligations || {}), levies: 'called', muster, calledDays: 0 };
      const at = state.holdings[muster] ? state.holdings[muster].name : state.holdings[me.seat]?.name;
      addOrder(`CALL THE BANNERS: I summon ${vassals.map((v) => 'House ' + state.houses[v].name).join(', ')} to muster their levies at ${at}${body.deadline ? ' within ' + body.deadline : ''}.${body.note ? ' ' + body.note : ''} Raise my own levies as well${body.ownLevies ? ` (${body.ownLevies} men)` : ''}.`);
      break;
    }
    case 'decide': {
      const d = (state.decisions || []).find((x) => x.id === body.decision && x.status === 'pending');
      if (!d) throw httpError(404, 'no such decision');
      const opt = d.options[Number(body.option)]; if (!opt && !body.custom) throw httpError(400, 'bad option');
      d.status = 'decided'; d.choice = opt ? opt.label : String(body.custom).slice(0, 500); d.note = body.note ? String(body.note).slice(0, 500) : ''; d.decidedTurn = state.meta.turn;
      let settled = [];
      if (opt?.fx) { settled = applyPetitionFx(state, opt.fx, dateStr(state.meta.date)); d.effects = settled; }
      addOrder(`DECISION — ${d.title}: I choose "${d.choice}".${d.note ? ' ' + d.note : ''}${settled.length ? ` [Already settled by the ledger, do not apply again: ${settled.join('; ')}. Narrate how people react.]` : ''}`);
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
      addOrder(`Appoint ${c.name} as ${ROLES[body.role]} of House ${me.name}.`);
      break;
    }
    case 'grant': {
      const h = state.holdings[body.holding]; if (!h || h.owner !== p) throw httpError(400, 'you can only grant your own holdings');
      if (h.id === me.seat) throw httpError(400, 'you cannot give away your own seat');
      const to = state.houses[body.house]; if (!to || to.liege !== p) throw httpError(400, 'you can only grant lands to your sworn vassals');
      applyChanges(state, [{ op: 'holding', id: h.id, owner: to.id, note: `Granted by House ${me.name} to House ${to.name}` }, { op: 'relation', a: p, b: to.id, delta: 20, reason: `Granted ${h.name}` }]);
      const lord = to.lord && state.characters[to.lord]; if (lord) { lord.opinion = Math.min(100, (lord.opinion || 0) + 20); lord.loyalty = Math.min(100, (lord.loyalty || 60) + 15); }
      addOrder(`Grant ${h.name} and its lands to House ${to.name} for their loyal service.`);
      break;
    }
    case 'raise': {
      const men = Math.round(Number(body.men) || 0);
      const avail = Number(me.figures.levies.v) || 0;
      if (men < 50) throw httpError(400, 'raise at least 50 men');
      if (men > avail) throw httpError(400, `Only ~${avail} levies remain to be called.`);
      const at = state.holdings[body.at] && (state.holdings[body.at].owner === p || state.houses[state.holdings[body.at].owner]?.liege === p) ? body.at : me.seat;
      const cmd = body.commander && state.characters[body.commander]?.alive ? body.commander : null;
      const name = String(body.name || `Levies of ${state.holdings[at].name}`).slice(0, 80);
      applyChanges(state, [{ op: 'army_create', owner: p, name, at, men, commander: cmd, composition: `Levies of House ${me.name}${men >= 3000 ? ', with household knights' : ''}`, status: 'mustering' }, { op: 'figure', house: p, field: 'levies', delta: -men, source: 'Muster rolls' }]);
      if (cmd) applyChanges(state, [{ op: 'character', id: cmd, with: Object.values(state.armies).find((a) => a.name === name && a.owner === p)?.id }]);
      addOrder(`(Done) Raised ${men} of my own levies at ${state.holdings[at].name} as "${name}"${cmd ? ' under ' + state.characters[cmd].name : ''}. They are mustering.`);
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
      addOrder(`(Done) ${a.owner === p ? 'Disbanded' : 'Released from service'} ${a.name}; the men go home to their fields.`);
      break;
    }
    case 'march': {
      const a = state.armies[body.army]; if (!a || (a.owner !== p && a.serving !== p)) throw httpError(400, 'not your host');
      const to = resolvePlaceId(body.to) || body.to; body.to = to;
      const dest = placePos(to, state.holdings); if (!dest) throw httpError(400, 'unknown destination');
      const m = marchDays(a, a.pos, dest);
      a.march = { to: body.to, since: state.meta.turn }; a.dest = dest; a.destName = placeName(state, body.to); a.at = null; a.status = 'marching';
      addOrder(`${a.name} marches on ${placeName(state, body.to)} (~${m.miles} miles, ~${m.days} days)${body.intent ? ' — ' + body.intent : ''}.`);
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
  if (consolidating.has(id)) await consolidating.get(id).catch(() => {});
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
  const { applied, rejected } = applyChanges(state, changes, { source: 'Council', protectPlayer: true });
  const key = 'council:' + ids.sort().join(',');
  const date = dateStr(state.meta.date), turn = state.meta.turn;
  state.chats[key] = [...(state.chats[key] || []), { role: 'player', text: message, date, turn }, ...replies.map((x) => ({ role: 'npc', speaker: x.speaker, text: x.text, date, turn }))];
  saveState(id, state);
  return { replies, applied, rejected, state, key };
}
