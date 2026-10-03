// Westeros Chronicles — local server. Zero dependencies: `node server/index.js`
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url'; // a file URL's pathname is /C:/… on Windows; fileURLToPath gives a real path
import { loadConfig, saveConfig, listModels } from './llm.js';
import * as game from './game.js';
import { SCENARIOS } from '../public/data/scenarios.js';
import { runCall } from './ai/client.js';
import { routingProblems } from './ai/models.js';
import { createInitialState } from '../public/js/shared/world.js';
import { viewOf, viewTurn } from './view.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PUBLIC = path.join(ROOT, 'public');
const PORT = Number(process.env.PORT || 3298);
const HOST = process.env.HOST || '127.0.0.1';

const MIME = { '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg', '.oga': 'audio/ogg', '.opus': 'audio/ogg', '.m4a': 'audio/mp4', '.wav': 'audio/wav', '.flac': 'audio/flac', '.webm': 'audio/webm', '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.wasm': 'application/wasm', '.onnx': 'application/octet-stream', '.bin': 'application/octet-stream', '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.avif': 'image/avif', '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.woff2': 'font/woff2', '.md': 'text/markdown; charset=utf-8' };

function send(res, status, body, type = 'application/json') {
  res.writeHead(status, { 'Content-Type': type, 'Cache-Control': 'no-store' });
  res.end(type === 'application/json' ? JSON.stringify(body) : body);
}
const MAX_BODY = 5e6;
/**
 * The JSON object a request carries ({} for no body). A body that is not JSON, or not an object, is a 400 in plain words (not
 * the parser's own message); one that is too large is a 413, and what is left of it is read and thrown away so that the
 * connection can serve the next request (SV3).
 */
function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = []; let size = 0; let over = false; let rest = 0;
    const tooLarge = () => { over = true; chunks.length = 0; reject(game.httpError(413, 'that request is too large')); };
    if (Number(req.headers['content-length']) > MAX_BODY) tooLarge();
    req.on('data', (c) => {
      if (over) { rest += c.length; if (rest > 64e6) req.destroy(); return; } // (a body without end is cut off at last)
      size += c.length; if (size > MAX_BODY) return tooLarge(); chunks.push(c);
    });
    req.on('end', () => {
      if (over) return;
      const text = Buffer.concat(chunks).toString('utf8');
      if (!text.trim()) return resolve({});
      let v; try { v = JSON.parse(text); } catch { return reject(game.httpError(400, 'the request is not valid JSON')); }
      if (!v || typeof v !== 'object' || Array.isArray(v)) return reject(game.httpError(400, 'the request must be a JSON object'));
      resolve(v);
    });
    req.on('error', reject);
  });
}

// ── Same origin only (bug hunt SV1) ──
// The game is a page talking to its own server and to nothing else. Any page on any site can make the browser send a form POST to
// 127.0.0.1:3298 (a plain-text body, which this server once read as JSON) and so could point the model server's URL, and the key sent
// to it, anywhere. So the server answers only the game's own page: a Host it is known by (an address, or localhost: a name that only
// points here is a page trying DNS rebinding), and, for a request that changes anything, an Origin that is that same Host (when the
// browser says where the request came from at all: a script or a test sends neither), and a body that says it is JSON, which a form
// cannot send. `WC_ALLOWED_HOSTS` (comma separated names) adds a name the owner reaches the game by on their own network.
const KNOWN_NAMES = new Set(['localhost', ...String(process.env.WC_ALLOWED_HOSTS || '').split(',').map((x) => x.trim().toLowerCase()).filter(Boolean)]);
const hostName = (h) => String(h || '').toLowerCase().match(/^(\[[0-9a-f:.]+\]|[^:\s]+)(?::\d+)?$/)?.[1] || null;
const isAddress = (n) => /^\d{1,3}(?:\.\d{1,3}){3}$/.test(n) || /^\[[0-9a-f:.]+\]$/.test(n);
const knownHost = (h) => { const n = hostName(h); return !!n && (isAddress(n) || n === 'localhost' || n.endsWith('.localhost') || KNOWN_NAMES.has(n)); };
const CHANGES = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);
/** Why a request is not the game's own, or null. */
function foreign(req) {
  const host = req.headers.host;
  if (!knownHost(host)) return 'This game answers only to its own page (unknown Host).';
  if (!CHANGES.has(req.method) && req.method !== 'OPTIONS') return null;
  const o = req.headers.origin;
  if (o !== undefined) { let u = null; try { u = new URL(o); } catch { /* "null" is no origin */ } if (!u || u.host.toLowerCase() !== host.toLowerCase()) return 'This game answers only to its own page (another origin).'; }
  const site = req.headers['sec-fetch-site'];
  if (site && site !== 'same-origin' && site !== 'none') return 'This game answers only to its own page (a request from another site).';
  return null;
}
// what every answer says to the browser: no sniffing, no frame (the page cannot be put in another's), no form that posts elsewhere, no referrer
const SECURITY_HEADERS = { 'X-Content-Type-Options': 'nosniff', 'X-Frame-Options': 'DENY', 'Referrer-Policy': 'same-origin', 'Cross-Origin-Resource-Policy': 'same-origin', 'Content-Security-Policy': "frame-ancestors 'none'; base-uri 'self'; form-action 'self'; object-src 'none'" };

const routes = [];
const route = (method, pattern, handler) => routes.push({ method, re: new RegExp('^' + pattern.replace(/:(\w+)/g, '(?<$1>[^/]+)') + '$'), handler });

// the newest change to the game's own code: a page loaded before it is out of date and should reload
function build() {
  let t = 0; const walk = (d) => { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const f = path.join(d, e.name); if (e.isDirectory()) walk(f); else if (/\.(js|css|html)$/.test(e.name)) t = Math.max(t, fs.statSync(f).mtimeMs); } };
  for (const d of ['server', 'public/js', 'public/css']) walk(path.join(ROOT, d));
  t = Math.max(t, fs.statSync(path.join(PUBLIC, 'index.html')).mtimeMs);
  return String(Math.round(t));
}
route('GET', '/api/version', () => ({ build: build() }));
route('GET', '/api/config', () => ({ ...loadConfig(), apiKey: loadConfig().apiKey ? '••••' : '' }));
route('POST', '/api/config', async (req) => { const b = await readBody(req); if (b.apiKey === '••••') delete b.apiKey; const c = saveConfig(b); return { ...c, apiKey: c.apiKey ? '••••' : '' }; });
route('GET', '/api/models', async () => { try { return { models: await listModels() }; } catch (e) { throw game.httpError(502, e.message); } });
// The model test (Settings → Test connection): a tiny grammar-constrained call (server/ai/calls/probe.js) that shows
// whether the server answers, whether it enforces a JSON schema, and whether "the Wall" lands on the Wall.
route('POST', '/api/llm/test', async () => {
  const cfg = loadConfig();
  const r = await runCall('probe', createInitialState('agot_298', 'stark', { seed: 298 }), {}, { cfg });
  const first = r.record.attempts[0] || {};
  if (first.error) throw game.httpError(502, first.error);
  return {
    ok: r.via !== 'fallback', ms: r.ms, model: r.model || first.model, via: r.via,
    schema: !first.problems?.some((p) => /unreadable|not one of|missing|not allowed|expected/.test(p)),
    prefixSafe: r.value?.place === 'nights_watch', words: r.value?.words || '', problems: r.problems, routing: routingProblems(cfg),
    text: JSON.stringify(r.value),
  };
});
route('GET', '/api/scenarios', () => Object.values(SCENARIOS).map(({ id, name, subtitle, description, date }) => ({ id, name, subtitle, description, date })));
route('GET', '/api/saves', () => game.listSaves());
route('POST', '/api/games', async (req) => { const b = await readBody(req); return game.newGame(b.scenario || 'agot_298', b.house, { ironman: !!b.ironman, canonGravity: b.canonGravity, maturity: b.maturity, ...(Number.isFinite(Number(b.seed)) && b.seed != null ? { seed: Number(b.seed) } : {}) }); });
route('GET', '/api/games/:id/progress', (req, p) => game.getProgress(p.id) || { phase: 'idle' });
route('GET', '/api/games/:id', (req, p) => game.loadState(p.id));
route('DELETE', '/api/games/:id', (req, p) => { game.deleteSave(p.id); return { ok: true }; });
route('POST', '/api/games/:id/orders', async (req, p) => ({ orders: game.setOrders(p.id, (await readBody(req)).orders) }));
route('POST', '/api/games/:id/orders/preview', async (req, p) => game.previewOrderPlans(p.id));
route('POST', '/api/games/:id/orders/:oid/answer', async (req, p) => game.answerOrderQuestion(p.id, p.oid, (await readBody(req)).option));
route('POST', '/api/games/:id/advance', async (req, p) => game.advance(p.id, await readBody(req)));
// The jump, streamed (03 §6.2, §10): the days are started as a job and each week is sent the moment it is told, so the
// lord watches the first while the next is simulated, and may stop the days on any of them (05 §5).
const jobs = new Map(); let jobSeq = 0;
function startJump(id, body) {
  for (const j of jobs.values()) if (j.game === id && !j.over) throw game.httpError(409, 'the days are already passing');
  if (game.writingNow(id)) throw game.httpError(409, `The chronicle is busy: ${game.writingNow(id)} is being written. Wait for it to finish.`);
  game.checkSpan(body?.span); // (a bad span is refused here, not found out in the stream)
  const job = { id: `j${++jobSeq}-${Date.now().toString(36)}`, game: id, sent: [], listeners: new Set(), over: false, stopDay: null };
  const emit = (event, data) => { const msg = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`; job.sent.push(msg); for (const res of job.listeners) res.write(msg); };
  jobs.set(job.id, job);
  game.advance(id, { span: body.span, orders: body.orders, onSegment: (s) => emit('segment', s), stopWanted: () => job.stopDay })
    .then((r) => emit('done', viewOf(r)), (e) => {
      // the same rule as the other routes: an error of the server's own is told in the console, not to the page
      const status = e.status || 500; const own = status < 500 || status === 502 || status === 503 || status === 504;
      if (!own) console.error(e);
      emit('error', { error: own ? e.message : 'The game could not do that. (The details are in the server\'s console.)', status });
    })
    .finally(() => { job.over = true; for (const res of job.listeners) res.end(); job.listeners.clear(); setTimeout(() => jobs.delete(job.id), 10 * 60e3).unref?.(); });
  return { job: job.id };
}
function streamJump(res, job) {
  res.writeHead(200, { 'Content-Type': 'text/event-stream; charset=utf-8', 'Cache-Control': 'no-store', Connection: 'keep-alive' });
  // a late listener (or a reconnect) hears the whole jump from its first week
  for (const msg of job.sent) res.write(msg);
  if (job.over) return res.end();
  job.listeners.add(res); res.on('close', () => job.listeners.delete(res));
}
route('POST', '/api/games/:id/jump', async (req, p) => startJump(p.id, await readBody(req)));
route('POST', '/api/games/:id/jump/:job/stop', async (req, p) => {
  const job = jobs.get(p.job); if (!job || job.game !== p.id) throw game.httpError(404, 'no such jump');
  const day = Math.max(1, Math.round(Number((await readBody(req)).day) || 1)); job.stopDay = job.stopDay ? Math.min(job.stopDay, day) : day;
  return { ok: true, day: job.stopDay, over: job.over };
});
// stop here, after the days have passed: the turn is played again from its snapshot as far as that day
route('POST', '/api/games/:id/stop', async (req, p) => game.stopHere(p.id, (await readBody(req)).day));
// undo (docs/gdd/03-architecture.md §11): how far back the glass can turn, and turning it
route('GET', '/api/games/:id/undo', (req, p) => { const st = game.loadState(p.id); return { depth: game.undoDepth(p.id, st), ironman: !!st.meta.settings?.ironman, turn: st.meta.turn }; });
route('POST', '/api/games/:id/undo', async (req, p) => game.undo(p.id, await readBody(req)));
// the history of the save: its facts (as the player's house may know them) and each turn's record
route('GET', '/api/games/:id/facts', (req, p) => { const q = new URL(req.url, 'http://x').searchParams; return game.readFacts(p.id, { from: q.get('from'), to: q.get('to'), house: q.get('house'), kind: q.get('kind'), limit: q.get('limit'), view: 'player' }); });
route('GET', '/api/games/:id/turns/:n', (req, p) => viewTurn(game.readTurn(p.id, p.n)));
// the State of the Realm (19 §7): the strengths and fortunes of the houses as the player's house knows them. The answer is
// built from that house's knowledge (engine/realm/view.js) and is not a state, so it does not go through playerView; there
// is no viewer parameter — whatever `?viewer=` says, it is the house of this save that looks.
route('GET', '/api/games/:id/realm', (req, p) => {
  const q = new URL(req.url, 'http://x').searchParams;
  return game.realmView(p.id, { lens: q.get('lens'), scope: q.get('scope'), realm: q.get('realm') === '1', window: q.get('window'), house: q.get('house') });
});
route('POST', '/api/games/:id/talk', async (req, p) => { const b = await readBody(req); return game.talk(p.id, b.character, String(b.message || '')); });
route('POST', '/api/games/:id/suggest', (req, p) => game.suggest(p.id));
// The scribe: the lord's words, spelt and stopped for the steward (rules always; the small CPU model when config names one)
route('POST', '/api/games/:id/scribe', async (req, p) => { const b = await readBody(req); return game.scribe(p.id, String(b.text || ''), { spoken: !!b.spoken }); });
route('GET', '/api/scribe', () => game.scribeStatus());
route('POST', '/api/games/:id/act', async (req, p) => game.act(p.id, await readBody(req)));
route('POST', '/api/games/:id/council', async (req, p) => { const b = await readBody(req); return game.council(p.id, b.members, String(b.message || '').slice(0, 4000), { advisor: !!b.advisor }); });
route('POST', '/api/games/:id/consolidate', (req, p) => game.consolidateNow(p.id));
route('POST', '/api/games/:id/ack', async (req, p) => game.acknowledge(p.id, (await readBody(req)).keys));
route('POST', '/api/games/:id/welcome', async (req, p) => game.markWelcomed(p.id));
route('POST', '/api/games/:id/ravens/read', (req, p) => ({ ravens: game.markRavensRead(p.id) }));
route('POST', '/api/games/:id/edit', async (req, p) => game.editState(p.id, await readBody(req)));
route('GET', '/api/games/:id/worldlog', (req, p) => ({ text: game.readWorldLog(p.id) }));
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
  for (const [k, v] of Object.entries(SECURITY_HEADERS)) res.setHeader(k, v);
  try {
    const why = foreign(req);
    if (why) return send(res, 403, { error: why });
    const url = new URL(req.url, `http://${req.headers.host}`);
    // a preflight is answered, and never with leave for another site (no Access-Control-Allow-*): the page is not for them
    if (req.method === 'OPTIONS') { res.writeHead(204, { Allow: 'GET, HEAD, POST, DELETE, OPTIONS', 'Cache-Control': 'no-store' }); return res.end(); }
    if (!['GET', 'HEAD'].includes(req.method) && !CHANGES.has(req.method)) return send(res, 405, { error: 'method not allowed' });
    // a body says it is JSON (a form cannot say so): not a "text/plain" the game's own reader would take for JSON
    if (CHANGES.has(req.method) && (Number(req.headers['content-length']) > 0 || req.headers['transfer-encoding']) && !/^application\/json\s*(;|$)/i.test(req.headers['content-type'] || '')) return send(res, 415, { error: 'send JSON (Content-Type: application/json)' });
    if (url.pathname === '/api/tts' && req.method === 'POST') return await ttsProxy(req, res);
    if (url.pathname === '/api/music' && req.method === 'GET') {
      // your own music: any audio files dropped into public/music/ play instead of the generated score
      // loose files play anywhere; a folder named for a house plays while you rule it (title/ and war/ for those scenes)
      const dirp = path.join(PUBLIC, 'music'); const tracks = []; const audio = (f) => /\.(mp3|ogg|oga|m4a|wav|flac|opus|webm|aac)$/i.test(f);
      try {
        for (const d of fs.readdirSync(dirp, { withFileTypes: true })) {
          if (d.isFile() && audio(d.name)) tracks.push({ url: '/music/' + encodeURIComponent(d.name), group: 'any' });
          else if (d.isDirectory()) for (const f of fs.readdirSync(path.join(dirp, d.name))) if (audio(f)) tracks.push({ url: `/music/${encodeURIComponent(d.name)}/${encodeURIComponent(f)}`, group: d.name.toLowerCase() });
        }
      } catch { /* none */ }
      return send(res, 200, { tracks, files: tracks.map((t) => t.url) });
    }
    if (url.pathname === '/api/portraits' && req.method === 'GET') {
      // your own art: public/portraits/<character_id>.png|jpg|webp replaces the painted portrait
      const dirp = path.join(PUBLIC, 'portraits'); let files = [];
      try { files = fs.readdirSync(dirp).filter((f) => /\.(png|jpe?g|webp|avif)$/i.test(f)); } catch { /* none */ }
      return send(res, 200, { portraits: Object.fromEntries(files.map((f) => [f.replace(/\.[^.]+$/, ''), '/portraits/' + encodeURIComponent(f)])) });
    }
    const sse = req.method === 'GET' && url.pathname.match(/^\/api\/games\/([^/]+)\/jump\/([^/]+)\/stream$/);
    if (sse) { const job = jobs.get(sse[2]); if (!job || job.game !== sse[1]) return send(res, 404, { error: 'no such jump' }); return streamJump(res, job); }
    if (url.pathname.startsWith('/api/')) {
      for (const r of routes) {
        if (r.method !== req.method) continue;
        const m = url.pathname.match(r.re);
        // every state that leaves is the player's view of it (server/view.js): the truth stays on the server
        if (m) return send(res, 200, viewOf(await r.handler(req, m.groups || {})));
      }
      return send(res, 404, { error: 'not found' });
    }
    if (req.method !== 'GET' && req.method !== 'HEAD') return send(res, 405, { error: 'method not allowed' });
    // Static files (three.js is served straight from node_modules)
    let base = PUBLIC, rel = decodeURIComponent(url.pathname);
    // three.js ships bundled in public/vendor; fall back to node_modules if someone deletes it
    if (rel.startsWith('/vendor/three/') && !fs.existsSync(path.join(PUBLIC, rel))) { base = path.join(ROOT, 'node_modules', 'three'); rel = rel.slice('/vendor/three'.length); }
    let file = path.normalize(path.join(base, rel));
    if (!file.startsWith(base)) return send(res, 403, 'forbidden', 'text/plain');
    
    if (fs.existsSync(file) && fs.statSync(file).isDirectory()) file = path.join(file, 'index.html');
    // the sigil artwork is optional (npm run fetch-sigils): with none installed its index is empty, not a 404 the browser logs on every page load (bug hunt UI6)
    if (rel === '/assets/sigils/index.json' && !fs.existsSync(file)) return send(res, 200, {});
    if (!fs.existsSync(file)) return send(res, 404, 'not found', 'text/plain');
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
    fs.createReadStream(file).pipe(res);
  } catch (e) {
    const status = e.status || (e.name === 'AbortError' ? 504 : e.cause?.code === 'ECONNREFUSED' ? 503 : 500);
    const msg = e.cause?.code === 'ECONNREFUSED' ? `Cannot reach the model server at ${loadConfig().baseUrl}. Is LM Studio / Ollama / llama.cpp running? (Or switch to mock mode in Settings.)` : e.message;
    if (status >= 500 && status !== 503) console.error(e);
    // an error of the server's own is never shown as it is: its words (a parser's, "Cannot read properties of null") are for the console
    const own = status < 500 || status === 502 || status === 503 || status === 504;
    send(res, status, { error: own ? msg : 'The game could not do that. (The details are in the server\'s console.)' });
  }
});

server.requestTimeout = 0; server.timeout = 0; server.keepAliveTimeout = 65000; // long local generations
server.listen(PORT, HOST, () => {
  const cfg = loadConfig();
  console.log(`\n  Westeros Chronicles is running → http://${HOST}:${PORT}\n  Model server: ${cfg.provider === 'mock' ? 'MOCK MODE (no model)' : cfg.baseUrl} ${cfg.model || ''}\n`);
});
