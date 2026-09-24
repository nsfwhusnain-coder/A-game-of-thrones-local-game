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

const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.woff2': 'font/woff2', '.md': 'text/markdown; charset=utf-8' };

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

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  try {
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

server.listen(PORT, HOST, () => {
  const cfg = loadConfig();
  console.log(`\n  Westeros Chronicles is running → http://${HOST}:${PORT}\n  Model server: ${cfg.provider === 'mock' ? 'MOCK MODE (no model)' : cfg.baseUrl} ${cfg.model || ''}\n`);
});
