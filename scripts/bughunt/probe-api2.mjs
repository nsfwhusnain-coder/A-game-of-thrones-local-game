import { BH_OUT, REPO } from './paths.mjs';
import { spawn } from 'node:child_process';
import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path'; import http from 'node:http';
const ROOT = REPO; const PORT = 3423; const saves = fs.mkdtempSync(path.join(os.tmpdir(), 'wc-bh-api2-'));
const srv = spawn(process.execPath, ['server/index.js'], { cwd: ROOT, env: { ...process.env, PORT: String(PORT), WC_PROVIDER: 'mock', WC_SAVES: saves }, stdio: 'ignore' });
const out = []; const note = (rule, text) => { out.push({ rule, text }); console.log(`[${rule}] ${text}`); };
const raw = (method, p, { body, headers = {}, timeout = 60000 } = {}) => new Promise((resolve) => {
  const t0 = Date.now(); const req = http.request({ host: '127.0.0.1', port: PORT, method, path: p, headers: { ...headers, ...(body ? { 'content-length': Buffer.byteLength(body) } : {}) }, timeout }, (res) => { let d = ''; res.on('data', (c) => (d += c)); res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: d, ms: Date.now() - t0 })); });
  req.on('timeout', () => { req.destroy(); resolve({ status: 'timeout', body: '', headers: {}, ms: Date.now() - t0 }); }); req.on('error', (e) => resolve({ status: 'error', body: String(e.message), headers: {}, ms: Date.now() - t0 }));
  if (body) req.write(body); req.end();
});
const J = (method, p, json, o = {}) => raw(method, p, { ...o, body: json !== undefined ? JSON.stringify(json) : undefined, headers: { 'content-type': 'application/json' } });
try {
  for (let i = 0; i < 100; i++) { const r = await raw('GET', '/api/version'); if (r.status === 200) break; await new Promise((r) => setTimeout(r, 100)); }
  const ids = []; for (let i = 0; i < 3; i++) ids.push(JSON.parse((await J('POST', '/api/games', { scenario: 'agot_298', house: 'stark', seed: i })).body).id);
  // the list with corrupt / missing saves
  fs.writeFileSync(path.join(saves, ids[0], 'state.json'), '{"meta":'); const l = await raw('GET', '/api/saves'); note('corrupt-save', `/api/saves with one corrupt state.json: ${l.status} ${l.body.slice(0, 160)}`);
  fs.unlinkSync(path.join(saves, ids[1], 'state.json')); const l2 = await raw('GET', '/api/saves'); note('corrupt-save', `/api/saves with a save missing its state: ${l2.status} ${l2.body.slice(0, 160)}`);
  note('corrupt-save', `open corrupt: ${(await raw('GET', `/api/games/${ids[0]}`)).status}; open the one missing state: ${(await raw('GET', `/api/games/${ids[1]}`)).status}`);
  // what the browser is sent: the raw state, or the player's view?
  const g = (await raw('GET', `/api/games/${ids[2]}`)).body; const j = JSON.parse(g);
  note('view', `GET /api/games/:id is ${g.length} bytes; top-level keys: ${Object.keys(j).join(',')}`);
  const leaks = []; for (const k of ['secret', 'secretKnown', 'minds', 'goals', 'plotting', 'psyche', 'schedule', 'hiddenTruth', 'realmStats', 'rngState', 'beliefs']) { const n = g.split(`"${k}"`).length - 1; if (n) leaks.push(`${k}×${n}`); } note('view', `keys that look like secrets in what the browser is sent: ${leaks.join(', ') || 'none'}`);
  const secretChars = Object.values(j.characters || {}).filter((c) => c.secret).length; note('view', `characters sent with a "secret" field: ${secretChars}`);
  note('view', `other houses' exact treasury sent to the browser (Lannister): ${JSON.stringify(j.houses?.lannister?.figures?.treasury)}`);
  // edit endpoint
  const e1 = await J('POST', `/api/games/${ids[2]}/edit`, { op: 'x' }); note('edit', `POST /edit {op:x}: ${e1.status} ${e1.body.slice(0, 140)}`);
  const e2 = await J('POST', `/api/games/${ids[2]}/edit`, { houses: { stark: { figures: { treasury: { v: 99999999 } } } } }); note('edit', `POST /edit with a treasury: ${e2.status} ${e2.body.slice(0, 140)}`);
  // chronicle write
  const c1 = await J('POST', `/api/games/${ids[2]}/chronicle`, { text: 'x'.repeat(5 * 1024 * 1024) }); note('chronicle', `5 MB chronicle: ${c1.status} ${c1.body.slice(0, 100)}`);
  // facts
  for (const q of ['limit=999999999', 'limit=-5', 'from=abc', 'house=%00', 'kind=../../x']) { const r = await raw('GET', `/api/games/${ids[2]}/facts?${q}`); note('facts', `?${q}: ${r.status} ${r.body.length} bytes`); }
  for (const n of ['0', '-1', '999', 'abc', '1.5', '../x']) { const r = await raw('GET', `/api/games/${ids[2]}/turns/${n}`); note('turn', `/turns/${n}: ${r.status} ${r.body.slice(0, 80)}`); }
  // delete
  for (const d of ['..', '..%2f', '%2e%2e', 'x%00y']) { const r = await raw('DELETE', `/api/games/${d}`); note('delete', `DELETE ${d}: ${r.status} ${r.body.slice(0, 80)}`); }
  // unknown route / method
  for (const [m, p] of [['GET', '/api/nope'], ['PUT', '/api/saves'], ['PATCH', '/api/config'], ['POST', '/api/saves'], ['GET', '/api/games/' + ids[2] + '/advance']]) { const r = await raw(m, p); note('route', `${m} ${p}: ${r.status} ${r.body.slice(0, 60)}`); }
  // act endpoint with odd bodies
  for (const [name, b] of [['no kind', {}], ['unknown kind', { kind: 'zzz' }], ['decide nothing', { kind: 'decide' }], ['null', null]]) { const r = await J('POST', `/api/games/${ids[2]}/act`, b); note('act', `${name}: ${r.status} ${r.body.slice(0, 100)}`); }
  // the jump (async) route: stop with no job
  const sj = await J('POST', `/api/games/${ids[2]}/jump/zzz/stop`, {}); note('jump', `stop an unknown job: ${sj.status} ${sj.body.slice(0, 80)}`);
  // scenarios / models / llm test on a dead endpoint
  const lt = await J('POST', '/api/llm/test', {}); note('llm-test', `${lt.status} ${lt.body.slice(0, 140)} (${lt.ms} ms)`);
} finally { try { srv.kill(); } catch { /* */ } fs.writeFileSync(BH_OUT + '/api2.json', JSON.stringify(out, null, 1)); fs.rmSync(saves, { recursive: true, force: true }); }
