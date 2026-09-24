// Minimal client for any OpenAI-compatible chat completions endpoint
// (LM Studio, Ollama /v1, llama.cpp server, vLLM, KoboldCpp, text-generation-webui, OpenRouter...).
import fs from 'node:fs';
import path from 'node:path';

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
  timeoutSec: 900,
  consolidateEvery: 5,                // consolidate turn history into the chronicle every N turns (Pax Historia style)
  keepRecentTurns: 4,                 // how many recent turns stay verbatim in the prompt
  extraBody: {},                      // merged into the request body (e.g. {"top_p":0.9,"min_p":0.05})
};

export function loadConfig() {
  try { return { ...DEFAULT_CONFIG, ...JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8')) }; } catch { return { ...DEFAULT_CONFIG }; }
}
export function saveConfig(cfg) {
  const merged = { ...loadConfig(), ...cfg };
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(merged, null, 2));
  return merged;
}

export const estimateTokens = (s) => Math.ceil(String(s || '').length / 3.6);

export async function chat(messages, opts = {}) {
  const cfg = { ...loadConfig(), ...opts };
  if (cfg.provider === 'mock') return mockResponse(messages, opts);
  const url = cfg.baseUrl.replace(/\/+$/, '') + '/chat/completions';
  const body = {
    messages,
    temperature: opts.temperature ?? cfg.temperature,
    max_tokens: opts.maxTokens ?? cfg.maxTokens,
    stream: false,
    ...(cfg.model ? { model: cfg.model } : { model: 'local-model' }),
    ...(cfg.jsonMode && opts.json ? { response_format: { type: 'json_object' } } : {}),
    ...(cfg.extraBody || {}),
  };
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), cfg.timeoutSec * 1000);
  const t0 = Date.now();
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(cfg.apiKey ? { Authorization: `Bearer ${cfg.apiKey}` } : {}) },
      body: JSON.stringify(body),
      signal: ctrl.signal,
    });
    const text = await res.text();
    if (!res.ok) throw new Error(`LLM server returned ${res.status}: ${text.slice(0, 500)}`);
    const data = JSON.parse(text);
    const msg = data.choices?.[0]?.message || {};
    let content = msg.content ?? data.choices?.[0]?.text ?? '';
    if (Array.isArray(content)) content = content.map((c) => c.text || '').join('');
    return { text: stripThinking(content), usage: data.usage || null, ms: Date.now() - t0, model: data.model };
  } finally {
    clearTimeout(timer);
  }
}

export async function listModels() {
  const cfg = loadConfig();
  if (cfg.provider === 'mock') return ['mock'];
  const res = await fetch(cfg.baseUrl.replace(/\/+$/, '') + '/models', { headers: cfg.apiKey ? { Authorization: `Bearer ${cfg.apiKey}` } : {} });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = await res.json();
  return (data.data || data.models || []).map((m) => m.id || m.name);
}

// Reasoning models often emit <think>...</think> before the answer
function stripThinking(s) {
  return String(s).replace(/<think>[\s\S]*?<\/think>/gi, '').replace(/^[\s\S]*?<\/think>/i, '').trim();
}

/** Extract and parse the first JSON object from model output, repairing common mistakes. */
export function extractJson(text) {
  let s = String(text || '').trim();
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
  let body = end > 0 ? s.slice(start, end + 1) : s.slice(start) + '}'.repeat(Math.max(1, depth));
  try { return JSON.parse(body); } catch { /* try repairs */ }
  body = body
    .replace(/,\s*([}\]])/g, '$1')                 // trailing commas
    .replace(/[“”]/g, '"')                // smart quotes
    .replace(/\/\/[^\n"]*$/gm, '')                  // line comments
    .replace(/([{,]\s*)([A-Za-z_][A-Za-z0-9_]*)\s*:/g, '$1"$2":'); // unquoted keys
  try { return JSON.parse(body); } catch (e) {
    // Truncated output: close open arrays/objects
    const fixed = closeTruncated(body);
    return JSON.parse(fixed);
  }
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
  } else if (kind === 'suggest') {
    obj = { suggestions: ['Call the banners and muster at the seat.', 'Send a raven to King\'s Landing professing loyalty.', 'Ask the steward for a full accounting of the granaries.', 'Double the watch on the coast.'] };
  } else if (kind === 'consolidate') {
    obj = { chronicle: 'Several turns passed in the mock simulation. Nothing of great note occurred.' };
  } else {
    const m = last.match(/PLAYER HOUSE: ([a-z_]+)/);
    const house = m ? m[1] : 'stark';
    obj = {
      summary: 'Mock simulation: the realm turns slowly. Ravens fly, lords feast, and rumours spread along the Kingsroad.',
      events: [
        { title: 'Ravens over the Kingsroad', text: 'Word spreads that the King rides north. Innkeepers along the Kingsroad lay in stores.', where: 'kings_landing', importance: 2, type: 'court', houses: ['baratheon'] },
        { title: 'A report from the steward', text: 'The steward counts the stores and finds them somewhat lower than expected after the harvest.', where: house, importance: 1, type: 'economy', houses: [house] },
      ],
      changes: [
        { op: 'figure', house, field: 'treasury', delta: 1200, source: 'Steward\'s ledger' },
        { op: 'figure', house, field: 'food', delta: -1, source: 'Steward\'s ledger' },
      ],
    };
  }
  return Promise.resolve({ text: JSON.stringify(obj), usage: null, ms: 5, model: 'mock' });
}
