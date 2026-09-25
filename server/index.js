// Westeros Chronicles — local server. Zero dependencies: `node server/index.js`
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { loadConfig, saveConfig, listModels, chat } from './llm.js';
import * as game from './game.js';
import { SCENARIOS } from '../public/data/scenarios.js';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const PUBLIC = path.join(ROOT, 'public');
const PORT = Number(process.env.PORT || 3298);
const HOST = process.env.HOST || '127.0.0.1';

const MIME = { '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg', '.oga': 'audio/ogg', '.opus': 'audio/ogg', '.m4a': 'audio/mp4', '.wav': 'audio/wav', '.flac': 'audio/flac', '.webm': 'audio/webm', '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.wasm': 'application/wasm', '.onnx': 'application/octet-stream', '.bin': 'application/octet-stream', '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.avif': 'image/avif', '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.woff2': 'font/woff2', '.md': 'text/markdown; charset=utf-8' };

function send(res, status, body, type = 'application/json') {
  res.writeHead(status, { 'Content-Type': type, 'Cache-Control': 'no-store' });
  res.end(type === 'application/json' ? JSON.stringify(body) : body);
}
async function readBody(req) {
  const chunks = []; let size = 0;
  for await (const c of req) { size += c.length; if (size > 5e6) throw game.httpError(413, 'body too large'); chunks.push(c); }
  const s = Buffer.concat(chunks).toString('utf8');
  return s ? JSON.parse(s) : {};
}

const routes = [];
const route = (method, pattern, handler) => routes.push({ method, re: new RegExp('^' + pattern.replace(/:(\w+)/g, '(?<$1>[^/]+)') + '$'), handler });

route('GET', '/api/config', () => ({ ...loadConfig(), apiKey: loadConfig().apiKey ? '••••' : '' }));
route('POST', '/api/config', async (req) => { const b = await readBody(req); if (b.apiKey === '••••') delete b.apiKey; const c = saveConfig(b); return { ...c, apiKey: c.apiKey ? '••••' : '' }; });
route('GET', '/api/models', async () => ({ models: await listModels() }));
route('POST', '/api/llm/test', async () => {
  const r = await chat([{ role: 'system', content: 'You are a maester. Reply with a JSON object {"ok":true,"words":"<house words of House Stark>"} and nothing else.' }, { role: 'user', content: 'Test.' }], { json: true, maxTokens: 200, kind: 'test' });
  return { ok: true, ms: r.ms, model: r.model, text: r.text.slice(0, 400) };
});
route('GET', '/api/scenarios', () => Object.values(SCENARIOS).map(({ id, name, subtitle, description, date }) => ({ id, name, subtitle, description, date })));
route('GET', '/api/saves', () => game.listSaves());
route('POST', '/api/games', async (req) => { const b = await readBody(req); return game.newGame(b.scenario || 'agot_298', b.house); });
route('GET', '/api/games/:id/progress', (req, p) => game.getProgress(p.id) || { phase: 'idle' });
route('GET', '/api/games/:id', (req, p) => game.loadState(p.id));
route('DELETE', '/api/games/:id', (req, p) => { game.deleteSave(p.id); return { ok: true }; });
route('POST', '/api/games/:id/orders', async (req, p) => ({ orders: game.setOrders(p.id, (await readBody(req)).orders) }));
route('POST', '/api/games/:id/advance', async (req, p) => game.advance(p.id, await readBody(req)));
route('POST', '/api/games/:id/undo', (req, p) => game.undo(p.id));
route('POST', '/api/games/:id/talk', async (req, p) => { const b = await readBody(req); return game.talk(p.id, b.character, String(b.message || '').slice(0, 4000)); });
route('POST', '/api/games/:id/suggest', (req, p) => game.suggest(p.id));
route('POST', '/api/games/:id/act', async (req, p) => game.act(p.id, await readBody(req)));
route('POST', '/api/games/:id/council', async (req, p) => { const b = await readBody(req); return game.council(p.id, b.members, String(b.message || '').slice(0, 4000)); });
route('POST', '/api/games/:id/consolidate', (req, p) => game.consolidateNow(p.id));
route('POST', '/api/games/:id/ravens/read', (req, p) => ({ ravens: game.markRavensRead(p.id) }));
route('POST', '/api/games/:id/edit', async (req, p) => game.editState(p.id, await readBody(req)));
route('GET', '/api/games/:id/chronicle', (req, p) => ({ text: game.readChronicle(p.id) }));
route('POST', '/api/games/:id/chronicle', async (req, p) => { game.writeChronicle(p.id, String((await readBody(req)).text || '')); return { ok: true }; });

// Text-to-speech: proxy to a local OpenAI-compatible speech server (Kokoro-FastAPI, openedai-speech, …) so the
// browser needs no CORS setup. Returns the audio as-is.
async function ttsProxy(req, res) {
  const b = await readBody(req); const cfg = loadConfig();
  const base = String(cfg.ttsUrl || '').replace(/\/+$/, '');
  if (!base) return send(res, 400, { error: 'No voice server set (Settings → Sound & voices)' });
  const body = JSON.stringify({ model: cfg.ttsModel || 'kokoro', input: String(b.text || '').slice(0, 3000), voice: b.voice || 'bm_george', speed: Math.max(0.6, Math.min(1.4, Number(b.speed) || 1)), response_format: 'mp3' });
  const u = new URL(base + '/audio/speech'); const lib = u.protocol === 'https:' ? (await import('node:https')).default : http;
  await new Promise((resolve) => {
    const r2 = lib.request(u, { method: 'POST', agent: false, headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body), ...(cfg.ttsKey ? { Authorization: `Bearer ${cfg.ttsKey}` } : {}) } }, (up) => {
      if (up.statusCode >= 300) { const c = []; up.on('data', (x) => c.push(x)); up.on('end', () => { send(res, 502, { error: `voice server ${up.statusCode}: ${Buffer.concat(c).toString().slice(0, 200)}` }); resolve(); }); return; }
      res.writeHead(200, { 'Content-Type': up.headers['content-type'] || 'audio/mpeg', 'Cache-Control': 'no-cache' }); up.pipe(res); up.on('end', resolve);
    });
    r2.setTimeout(60000, () => r2.destroy(new Error('voice server timed out')));
    r2.on('error', (e) => { send(res, 502, { error: 'voice server: ' + e.message }); resolve(); });
    r2.write(body); r2.end();
  });
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  try {
    if (url.pathname === '/api/tts' && req.method === 'POST') return await ttsProxy(req, res);
    if (url.pathname === '/api/music' && req.method === 'GET') {
      // your own music: any audio files dropped into public/music/ play instead of the generated score
      const dirp = path.join(PUBLIC, 'music'); let files = [];
      try { files = fs.readdirSync(dirp).filter((f) => /\.(mp3|ogg|oga|m4a|wav|flac|opus|webm)$/i.test(f)); } catch { /* none */ }
      return send(res, 200, { files: files.map((f) => '/music/' + encodeURIComponent(f)) });
    }
    if (url.pathname === '/api/portraits' && req.method === 'GET') {
      // your own art: public/portraits/<character_id>.png|jpg|webp replaces the painted portrait
      const dirp = path.join(PUBLIC, 'portraits'); let files = [];
      try { files = fs.readdirSync(dirp).filter((f) => /\.(png|jpe?g|webp|avif)$/i.test(f)); } catch { /* none */ }
      return send(res, 200, { portraits: Object.fromEntries(files.map((f) => [f.replace(/\.[^.]+$/, ''), '/portraits/' + encodeURIComponent(f)])) });
    }
    if (url.pathname.startsWith('/api/')) {
      for (const r of routes) {
        if (r.method !== req.method) continue;
        const m = url.pathname.match(r.re);
        if (m) return send(res, 200, await r.handler(req, m.groups || {}));
      }
      return send(res, 404, { error: 'not found' });
    }
    // Static files (three.js is served straight from node_modules)
    let base = PUBLIC, rel = decodeURIComponent(url.pathname);
    // three.js ships bundled in public/vendor; fall back to node_modules if someone deletes it
    if (rel.startsWith('/vendor/three/') && !fs.existsSync(path.join(PUBLIC, rel))) { base = path.join(ROOT, 'node_modules', 'three'); rel = rel.slice('/vendor/three'.length); }
    let file = path.normalize(path.join(base, rel));
    if (!file.startsWith(base)) return send(res, 403, 'forbidden', 'text/plain');
    
    if (fs.existsSync(file) && fs.statSync(file).isDirectory()) file = path.join(file, 'index.html');
    if (!fs.existsSync(file)) return send(res, 404, 'not found', 'text/plain');
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
    fs.createReadStream(file).pipe(res);
  } catch (e) {
    const status = e.status || (e.name === 'AbortError' ? 504 : e.cause?.code === 'ECONNREFUSED' ? 503 : 500);
    const msg = e.cause?.code === 'ECONNREFUSED' ? `Cannot reach the model server at ${loadConfig().baseUrl}. Is LM Studio / Ollama / llama.cpp running? (Or switch to mock mode in Settings.)` : e.message;
    if (status >= 500 && status !== 503) console.error(e);
    send(res, status, { error: msg });
  }
});

server.requestTimeout = 0; server.timeout = 0; server.keepAliveTimeout = 65000; // long local generations
server.listen(PORT, HOST, () => {
  const cfg = loadConfig();
  console.log(`\n  Westeros Chronicles is running → http://${HOST}:${PORT}\n  Model server: ${cfg.provider === 'mock' ? 'MOCK MODE (no model)' : cfg.baseUrl} ${cfg.model || ''}\n`);
});
