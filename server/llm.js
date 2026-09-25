// Minimal client for any OpenAI-compatible chat completions endpoint
// (LM Studio, Ollama /v1, llama.cpp server, vLLM, KoboldCpp, text-generation-webui, OpenRouter...).
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import https from 'node:https';

// Plain http(s) request: Node's fetch() aborts responses whose headers take >5 minutes,
// which kills long generations on slow local models. This honours our own timeout instead.
function httpJson(method, url, body, headers, timeoutMs) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const lib = u.protocol === 'https:' ? https : http;
    const data = body ? Buffer.from(JSON.stringify(body)) : null;
    const req = lib.request(u, { method, agent: false, headers: { ...(data ? { 'Content-Type': 'application/json', 'Content-Length': data.length } : {}), ...headers } }, (res) => {
      const chunks = []; res.on('data', (c) => chunks.push(c));
      res.on('end', () => resolve({ status: res.statusCode, ok: res.statusCode >= 200 && res.statusCode < 300, text: Buffer.concat(chunks).toString('utf8') }));
      res.on('error', reject);
    });
    req.setTimeout(timeoutMs, () => req.destroy(Object.assign(new Error(`The model took longer than ${Math.round(timeoutMs / 1000)}s (raise the timeout in Settings)`), { name: 'AbortError' })));
    req.on('error', (e) => reject(e.code === 'ECONNREFUSED' ? Object.assign(new Error('connection refused'), { cause: e }) : e));
    if (data) req.write(data);
    req.end();
  });
}

// Streaming variant (Server-Sent Events): calls onEvent(json) for every data line, resolves when the stream ends.
function httpStream(url, body, headers, timeoutMs, onEvent) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const lib = u.protocol === 'https:' ? https : http;
    const data = Buffer.from(JSON.stringify(body));
    const req = lib.request(u, { method: 'POST', agent: false, headers: { 'Content-Type': 'application/json', 'Content-Length': data.length, Accept: 'text/event-stream', Connection: 'close', ...headers } }, (res) => {
      if (res.statusCode < 200 || res.statusCode >= 300) { const chunks = []; res.on('data', (c) => chunks.push(c)); res.on('end', () => resolve({ status: res.statusCode, ok: false, text: Buffer.concat(chunks).toString('utf8') })); return; }
      let buf = ''; let raw = '';
      res.setEncoding('utf8');
      res.on('data', (chunk) => {
        buf += chunk; raw += chunk.length < 4000 ? '' : '';
        let nl;
        while ((nl = buf.indexOf('\n')) >= 0) {
          const line = buf.slice(0, nl).trim(); buf = buf.slice(nl + 1);
          if (!line.startsWith('data:')) continue;
          const payload = line.slice(5).trim(); if (!payload || payload === '[DONE]') continue;
          try { onEvent(JSON.parse(payload)); } catch { /* keep-alive or partial */ }
        }
      });
      res.on('end', () => resolve({ status: res.statusCode, ok: true }));
      res.on('error', reject);
    });
    req.setTimeout(timeoutMs, () => req.destroy(Object.assign(new Error(`The model took longer than ${Math.round(timeoutMs / 1000)}s (raise the timeout in Settings)`), { name: 'AbortError' })));
    req.on('error', (e) => reject(e.code === 'ECONNREFUSED' ? Object.assign(new Error('connection refused'), { cause: e }) : e));
    req.write(data); req.end();
  });
}

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const CONFIG_PATH = path.join(ROOT, 'config.json');

export const DEFAULT_CONFIG = {
  provider: 'openai',                 // 'openai' (any OpenAI-compatible server) | 'mock' (offline test mode)
  baseUrl: 'http://localhost:1234/v1', // LM Studio default. Ollama: http://localhost:11434/v1  llama.cpp: http://localhost:8080/v1
  apiKey: '',
  model: '',                          // leave empty to use the server's loaded model
  temperature: 0.85,
  maxTokens: 6000,                    // max tokens for a single response
  contextTokens: 32768,               // your model's context window (e.g. 262144 for 256k)
  jsonMode: false,                    // send response_format: json_object (some servers require a schema; leave off if errors)
  timeoutSec: 1800,
  consolidateEvery: 5,                // consolidate turn history into the chronicle every N turns (Pax Historia style)
  keepRecentTurns: 4,                 // how many recent turns stay verbatim in the prompt
  promptDetail: 'full',               // 'full' = every house & character each turn; 'lean' = only what's relevant (much faster on laptops)
  extraBody: {},                      // merged into the request body (e.g. {"top_p":0.9,"min_p":0.05})
  stream: true,                       // stream tokens so the game can show progress (thinking / writing)
  thinking: 'auto',                   // 'auto' = the server's default; 'on' / 'off' toggle reasoning (Qwen3-style chat_template_kwargs)
  thinkingBudget: 6000,               // extra tokens allowed for reasoning on top of maxTokens
  thinkInAudiences: false,            // let the model think before speaking in audiences and councils (slower)
  ttsUrl: '',                         // optional local text-to-speech server (OpenAI-compatible /v1/audio/speech), e.g. Kokoro-FastAPI http://localhost:8880/v1
  ttsModel: 'kokoro',
  ttsKey: '',
};

export function loadConfig() {
  try { return { ...DEFAULT_CONFIG, ...JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8')) }; } catch { return { ...DEFAULT_CONFIG }; }
}
// Accept whatever the player pastes: "localhost:8080", "http://host:8080", ".../v1/chat/completions" all become ".../v1"
export function normalizeBaseUrl(u) {
  let s = String(u || '').trim(); if (!s) return s;
  if (!/^https?:\/\//i.test(s)) s = 'http://' + s;
  s = s.replace(/\/+$/, '').replace(/\/(chat\/completions|completions|models)$/i, '').replace(/\/+$/, '');
  try { const url = new URL(s); if (url.pathname === '' || url.pathname === '/') s = s + '/v1'; } catch { /* leave as typed */ }
  return s;
}

export function saveConfig(cfg) {
  if (cfg.baseUrl !== undefined) cfg = { ...cfg, baseUrl: normalizeBaseUrl(cfg.baseUrl) };
  const merged = { ...loadConfig(), ...cfg };
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(merged, null, 2));
  return merged;
}

export const estimateTokens = (s) => Math.ceil(String(s || '').length / 3.6);

/**
 * One chat completion. opts: { kind, json, temperature, maxTokens, spanDays, onProgress(p), thinking }
 * - streams when possible and reports progress: { phase: 'thinking'|'writing', thinkTokens, tokens, ms }
 * - if the reply is cut off mid-JSON, asks the model to continue and stitches the pieces
 * - if the model spends its whole budget thinking, retries once with thinking off
 */
export async function chat(messages, opts = {}) {
  const cfg = { ...loadConfig(), ...opts.cfgOverride };
  if (cfg.provider === 'mock') return mockResponse(messages, opts);
  if (cfg.provider === 'relay') return relayResponse(messages, opts, cfg);
  // audiences, councils, counsel and memory upkeep are quick exchanges: no deliberation unless asked for
  const quick = ['chat', 'council', 'suggest', 'consolidate', 'orders'].includes(opts.kind) && !cfg.thinkInAudiences && (cfg.thinking || 'auto') !== 'off';
  const thinking = opts.thinking || (quick ? 'off' : cfg.thinking || 'auto');
  // long periods produce long chronicles: give them room (plus room to think)
  const spanK = opts.spanDays ? Math.min(2, 1 + Math.max(0, opts.spanDays - 30) / 330) : 1;
  const answerTokens = Math.round((opts.maxTokens ?? cfg.maxTokens) * spanK);
  const maxTokens = answerTokens + (thinking === 'off' ? 0 : Number(cfg.thinkingBudget) || 0);
  const t0 = Date.now();
  let r = await rawChat(messages, cfg, { ...opts, thinking, maxTokens }, t0);
  // Out of room while still thinking: nothing usable came out. Try again without the thinking.
  if (r.finish === 'length' && !/[{"]/.test(r.content) && thinking !== 'off') {
    opts.onProgress?.({ phase: 'retrying', note: 'the model ran out of room while thinking; asking again without deliberation', ms: Date.now() - t0 });
    r = await rawChat(messages, cfg, { ...opts, thinking: 'off', maxTokens: answerTokens }, t0);
  }
  // Cut off mid-answer: ask it to continue where it stopped (up to twice) and stitch the pieces
  let text = r.content;
  for (let k = 0; k < 2 && r.finish === 'length' && opts.json && text.includes('{'); k++) {
    opts.onProgress?.({ phase: 'continuing', note: 'the reply was long; asking the model to finish it', ms: Date.now() - t0 });
    const cont = [...messages, { role: 'assistant', content: text }, { role: 'user', content: 'Your reply was cut off. Continue EXACTLY where it stopped: output only the remaining characters of the same JSON object (no repetition, no preamble, no code fences).' }];
    r = await rawChat(cont, cfg, { ...opts, thinking: 'off', maxTokens: answerTokens }, t0);
    text = joinContinuation(text, r.content);
  }
  return { text: stripThinking(text), reasoning: r.reasoning, usage: r.usage, ms: Date.now() - t0, model: r.model, finish: r.finish };
}

function joinContinuation(a, b) {
  b = stripThinking(b).replace(/^```(?:json)?\s*/i, '');
  // drop any overlap the model repeated
  for (let n = Math.min(200, a.length, b.length); n > 8; n--) if (a.endsWith(b.slice(0, n))) return a + b.slice(n);
  return a + b;
}

async function rawChat(messages, cfg, opts, t0) {
  try { return await rawChatOnce(messages, cfg, opts, t0); } catch (e) {
    // a dropped connection (server restarted, socket reset) is worth one more try
    if (e.code === 'ECONNRESET' || /socket hang up/i.test(e.message)) { await new Promise((r) => setTimeout(r, 800)); return rawChatOnce(messages, cfg, opts, t0); }
    throw e;
  }
}
async function rawChatOnce(messages, cfg, opts, t0) {
  const url = cfg.baseUrl.replace(/\/+$/, '') + '/chat/completions';
  const body = {
    messages,
    temperature: opts.temperature ?? cfg.temperature,
    max_tokens: opts.maxTokens,
    stream: cfg.stream !== false,
    ...(cfg.model ? { model: cfg.model } : { model: 'local-model' }),
    ...(cfg.jsonMode && opts.json ? { response_format: { type: 'json_object' } } : {}),
    ...(opts.thinking === 'on' || opts.thinking === 'off' ? { chat_template_kwargs: { enable_thinking: opts.thinking === 'on' } } : {}),
    ...(cfg.stream !== false ? { stream_options: { include_usage: true }, return_progress: true } : {}),
    ...(cfg.extraBody || {}),
  };
  const headers = cfg.apiKey ? { Authorization: `Bearer ${cfg.apiKey}` } : {};
  if (body.stream) {
    let content = '', reasoning = '', finish = null, usage = null, model = null, n = 0, lastReport = 0;
    const res = await httpStream(url, body, headers, cfg.timeoutSec * 1000, (ev) => {
      model = ev.model || model; if (ev.usage) usage = ev.usage;
      // llama.cpp reports how far it has read the prompt (return_progress)
      if (ev.prompt_progress && opts.onProgress) { const pp = ev.prompt_progress; opts.onProgress({ phase: 'reading', promptTotal: pp.total, promptDone: pp.processed, promptCached: pp.cache, ms: Date.now() - t0 }); }
      const ch = ev.choices?.[0]; if (!ch) return;
      const d = ch.delta || ch.message || {};
      if (d.reasoning_content) reasoning += d.reasoning_content;
      if (d.content) content += d.content;
      if (ch.text) content += ch.text;
      if (ch.finish_reason) finish = ch.finish_reason;
      // llama.cpp's prompt-progress chunks carry an empty delta: they are not tokens, and the model is still reading
      if (!d.reasoning_content && !d.content && !ch.text) return;
      n++;
      const now = Date.now();
      if (n === 1) opts.onProgress?.({ firstTokenMs: now - t0 });
      if (opts.onProgress && now - lastReport > 400) {
        lastReport = now;
        const inThink = (reasoning && !content) || (/<think>/i.test(content) && !/<\/think>/i.test(content));
        opts.onProgress({ phase: inThink ? 'thinking' : 'writing', thinkTokens: Math.round((reasoning.length + (content.match(/<think>[\s\S]*?(<\/think>|$)/i)?.[0].length || 0)) / 3.6), tokens: Math.round(content.replace(/<think>[\s\S]*?(<\/think>|$)/i, '').length / 3.6), ms: now - t0 });
      }
    });
    if (!res.ok) {
      // some servers reject streaming or the extra fields: fall back to a plain request once
      if (/stream|chat_template_kwargs|stream_options/i.test(res.text || '') || res.status === 400) return rawChatOnce(messages, { ...cfg, stream: false, extraBody: cfg.extraBody }, { ...opts, thinking: opts.thinking === 'auto' ? 'auto' : opts.thinking, noKwargs: true }, t0);
      throw new Error(`LLM server returned ${res.status}: ${String(res.text).slice(0, 500)}`);
    }
    if (!content.trim() && reasoning && finish !== 'length') content = reasoning; // some servers put the answer in reasoning
    return { content, reasoning, finish, usage, model };
  }
  if (opts.noKwargs) delete body.chat_template_kwargs;
  delete body.stream_options; delete body.return_progress;
  const res = await httpJson('POST', url, body, headers, cfg.timeoutSec * 1000);
  if (!res.ok) throw new Error(`LLM server returned ${res.status}: ${res.text.slice(0, 500)}`);
  const data = JSON.parse(res.text);
  const msg = data.choices?.[0]?.message || {};
  let content = msg.content ?? data.choices?.[0]?.text ?? '';
  if (Array.isArray(content)) content = content.map((c) => c.text || '').join('');
  if (!String(content).trim() && msg.reasoning_content && data.choices?.[0]?.finish_reason !== 'length') content = msg.reasoning_content;
  return { content: String(content), reasoning: msg.reasoning_content || '', finish: data.choices?.[0]?.finish_reason || null, usage: data.usage || null, model: data.model };
}

export async function listModels() {
  const cfg = loadConfig();
  if (cfg.provider === 'mock') return ['mock'];
  if (cfg.provider === 'relay') return ['relay (human / external game master)'];
  const res = await httpJson('GET', cfg.baseUrl.replace(/\/+$/, '') + '/models', null, cfg.apiKey ? { Authorization: `Bearer ${cfg.apiKey}` } : {}, 8000);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = JSON.parse(res.text);
  return (data.data || data.models || []).map((m) => m.id || m.name);
}

// Reasoning models often emit <think>...</think> before the answer
function stripThinking(s) {
  return String(s).replace(/<think>[\s\S]*?<\/think>/gi, '').replace(/^[\s\S]*?<\/think>/i, '').trim();
}

/** Extract and parse the first JSON object from model output, repairing common mistakes. */
/** Last resort: pull a quoted field out of broken JSON. */
export function extractField(text, field) {
  const m = String(text || '').match(new RegExp('"' + field + '"\\s*:\\s*"((?:[^"\\\\]|\\\\.)*)"', 's'));
  if (!m) return null;
  try { return JSON.parse('"' + m[1] + '"'); } catch { return m[1]; }
}

export function extractJson(text) {
  let s = stripThinking(String(text || '')).trim();
  const fence = s.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) s = fence[1].trim();
  const start = s.indexOf('{');
  if (start < 0) throw new Error('No JSON object in response');
  // Walk to the matching closing brace (string-aware)
  let depth = 0, inStr = false, esc = false, end = -1;
  for (let i = start; i < s.length; i++) {
    const c = s[i];
    if (inStr) { if (esc) esc = false; else if (c === '\\') esc = true; else if (c === '"') inStr = false; continue; }
    if (c === '"') inStr = true;
    else if (c === '{') depth++;
    else if (c === '}') { depth--; if (depth === 0) { end = i; break; } }
  }
  let body = end > 0 ? s.slice(start, end + 1) : s.slice(start);
  if (end < 0) { try { return JSON.parse(closeTruncated(escapeInnerQuotes(body))); } catch { /* fall through to the other repairs */ } }
  try { return JSON.parse(body); } catch { /* try repairs */ }
  body = escapeInnerQuotes(body.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, ' '));
  try { return JSON.parse(body); } catch { /* more repairs */ }
  body = body
    .replace(/,\s*([}\]])/g, '$1')                 // trailing commas
    .replace(/[“”]/g, '"')                // smart quotes
    .replace(/\/\/[^\n"]*$/gm, '')                  // line comments
    .replace(/([{,]\s*)([A-Za-z_][A-Za-z0-9_]*)\s*:/g, '$1"$2":') // unquoted keys
    .replace(/:\s*([A-Za-z_][A-Za-z0-9_'-]*)\s*(?=[,}\]])/g, (m, w) => (/^(true|false|null)$/.test(w) ? m : `: "${w}"`)) // unquoted string values
    .replace(/:\s*(-?\d{1,3}(?:,\d{3})+)(?=\s*[,}\]])/g, (m, n) => ': ' + n.replace(/,/g, '')); // 60,000 -> 60000
  try { return JSON.parse(body); } catch (e) {
    // Truncated output: close open arrays/objects
    const fixed = closeTruncated(body);
    return JSON.parse(fixed);
  }
}

// Models often write dialogue with raw double quotes inside a JSON string ("text":"He said "no" to the king").
// A quote inside a string that is not followed by , } ] or : is taken to be part of the text and escaped.
// Raw newlines inside strings are escaped too.
function escapeInnerQuotes(s) {
  let out = '', inStr = false, esc = false;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (!inStr) { if (c === '"') inStr = true; out += c; continue; }
    if (esc) { esc = false; out += c; continue; }
    if (c === '\\') { esc = true; out += c; continue; }
    if (c === '\n') { out += '\\n'; continue; }
    if (c === '\r') continue;
    if (c === '\t') { out += ' '; continue; }
    if (c === '"') {
      let j = i + 1; while (j < s.length && /\s/.test(s[j])) j++;
      const nx = s[j];
      if (nx === undefined || nx === ',' || nx === '}' || nx === ']' || nx === ':') { inStr = false; out += c; } else out += '\\"';
      continue;
    }
    out += c;
  }
  return out;
}

function closeTruncated(s) {
  const stack = []; let inStr = false, esc = false;
  for (const c of s) {
    if (inStr) { if (esc) esc = false; else if (c === '\\') esc = true; else if (c === '"') inStr = false; continue; }
    if (c === '"') inStr = true; else if (c === '{' || c === '[') stack.push(c); else if (c === '}' || c === ']') stack.pop();
  }
  let out = s; if (inStr) out += '"';
  out = out.replace(/,\s*$/, '');
  while (stack.length) out += stack.pop() === '{' ? '}' : ']';
  return out.replace(/,\s*([}\]])/g, '$1');
}

// ---------------- Offline mock (for testing the game without a model) ----------------
function mockResponse(messages, opts) {
  const last = messages[messages.length - 1]?.content || '';
  const kind = opts.kind || 'jump';
  let obj;
  if (kind === 'chat') {
    obj = {
      reply: '*(Mock mode — connect a local model in Settings for real replies.)* "My lord, I hear you. It shall be as you say, though the realm will not sit idle while we act."',
      changes: [],
    };
  } else if (kind === 'council') {
    const ids = [...String(messages[0]?.content || '').matchAll(/\[([a-z_]+)\]/g)].map((m) => m[1]);
    obj = { replies: ids.slice(0, 2).map((id, i) => ({ speaker: id, text: i ? '*(Mock)* I would counsel caution, my lord.' : '*(Mock)* The ledgers are in order, my lord, though the harvest could be better.' })), changes: [] };
  } else if (kind === 'suggest') {
    obj = { suggestions: ['Call the banners and muster at the seat.', 'Send a raven to King\'s Landing professing loyalty.', 'Ask the steward for a full accounting of the granaries.', 'Double the watch on the coast.'] };
  } else if (kind === 'consolidate') {
    obj = { chronicle: 'Several turns passed in the mock simulation. Nothing of great note occurred.' };
  } else {
    const m = last.match(/PLAYER HOUSE: ([a-z_]+)/);
    const house = m ? m[1] : 'stark';
    const bannerCall = /CALL THE BANNERS|banner/i.test(last.split("PLAYER'S ORDERS")[1] || '');
    obj = {
      summary: 'Mock simulation: the realm turns slowly. Ravens fly, lords feast, and rumours spread along the Kingsroad.',
      events: [
        { title: 'Ravens over the Kingsroad', text: 'Word spreads that the King rides north. Innkeepers along the Kingsroad lay in stores.', where: 'kings_landing', importance: 2, type: 'court', houses: ['baratheon'] },
        { title: 'A report from the steward', text: 'The steward counts the stores and finds them somewhat lower than expected after the harvest.', where: house, importance: 1, type: 'economy', houses: [house] },
      ],
      changes: [
        { op: 'figure', house, field: 'treasury', delta: 1200, source: 'Steward\'s ledger' },
        { op: 'figure', house, field: 'food', delta: -1, source: 'Steward\'s ledger' },
        ...(bannerCall ? [
          { op: 'army_create', id: `${house}_host_${Date.now() % 1000}`, owner: house, name: 'The Muster', at: house, men: 6500, type: 'army', composition: 'Levies, knights and men-at-arms (mock)', status: 'mustering' },
          { op: 'figure', house, field: 'levies', delta: -6500 },
        ] : []),
        { op: 'army_move', army: 'iron_fleet', to: 'seagard', progress: 0.5, status: 'sailing' },
        { op: 'army_move', army: 'drogo_khalasar', to: 'norvos', progress: 0.3, status: 'riding east' },
      ],
    };
  }
  return Promise.resolve({ text: JSON.stringify(obj), usage: null, ms: 5, model: 'mock' });
}

// ---------------- Relay: a human (or external agent) plays the simulator ----------------
// Each request is written to relay/<n>-<kind>.prompt.md; the reply is read from relay/<n>-<kind>.reply.txt.
// Useful for testing prompts with any model (paste into a chat UI) or for running a live game master.
const RELAY_DIR = path.join(ROOT, 'relay');
let relaySeq = 0;
async function relayResponse(messages, opts, cfg) {
  fs.mkdirSync(RELAY_DIR, { recursive: true });
  const n = String(Date.now()).slice(-7) + '-' + (++relaySeq);
  const base = path.join(RELAY_DIR, `${n}-${opts.kind || 'chat'}`);
  fs.writeFileSync(base + '.prompt.md', messages.map((m) => `### ${m.role.toUpperCase()}\n${m.content}`).join('\n\n'));
  const t0 = Date.now();
  const deadline = t0 + (cfg.timeoutSec || 900) * 1000;
  while (Date.now() < deadline) {
    if (fs.existsSync(base + '.reply.txt')) {
      await new Promise((r) => setTimeout(r, 150));
      const text = fs.readFileSync(base + '.reply.txt', 'utf8');
      return { text: stripThinking(text), usage: null, ms: Date.now() - t0, model: 'relay' };
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw Object.assign(new Error('Relay timed out waiting for ' + base + '.reply.txt'), { status: 504 });
}
