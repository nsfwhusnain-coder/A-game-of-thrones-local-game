// Bug hunt, probe: the server's edges. Starts the worktree's server on its own port with the mock model and a scratch saves folder; reads, never fixes.
import { BH_OUT, REPO } from './paths.mjs';
import { spawn } from 'node:child_process';
import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path'; import http from 'node:http';
const ROOT = REPO; const PORT = 3422; const saves = fs.mkdtempSync(path.join(os.tmpdir(), 'wc-bh-api-'));
const srv = spawn(process.execPath, ['server/index.js'], { cwd: ROOT, env: { ...process.env, PORT: String(PORT), WC_PROVIDER: 'mock', WC_SAVES: saves }, stdio: 'ignore' });
const out = []; const note = (rule, text) => { out.push({ rule, text }); console.log(`[${rule}] ${text}`); };
const raw = (method, p, { body, headers = {}, timeout = 60000 } = {}) => new Promise((resolve) => {
  const t0 = Date.now(); const req = http.request({ host: '127.0.0.1', port: PORT, method, path: p, headers: { ...headers, ...(body ? { 'content-length': Buffer.byteLength(body) } : {}) }, timeout }, (res) => { let d = ''; res.on('data', (c) => (d += c)); res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: d, ms: Date.now() - t0 })); });
  req.on('timeout', () => { req.destroy(); resolve({ status: 'timeout', body: '', headers: {}, ms: Date.now() - t0 }); }); req.on('error', (e) => resolve({ status: 'error', body: String(e.message), headers: {}, ms: Date.now() - t0 }));
  if (body) req.write(body); req.end();
});
const J = (method, p, o) => raw(method, p, { ...o, body: o?.json !== undefined ? JSON.stringify(o.json) : o?.body, headers: { 'content-type': 'application/json', ...(o?.headers || {}) } });
try {
  for (let i = 0; i < 100; i++) { const r = await raw('GET', '/api/version'); if (r.status === 200) break; await new Promise((r) => setTimeout(r, 100)); }
  const g = JSON.parse((await J('POST', '/api/games', { json: { scenario: 'agot_298', house: 'stark', seed: 5 } })).body); const id = g.id; note('info', `game ${id}`);
  // 1. two End turns at once
  const [a, b] = await Promise.all([J('POST', `/api/games/${id}/advance`, { json: { span: '7d', orders: [] } }), J('POST', `/api/games/${id}/advance`, { json: { span: '7d', orders: [] } })]);
  note('concurrent-advance', `two at once: ${a.status} and ${b.status}; ${String(b.body).slice(0, 120)}`);
  const st = JSON.parse((await raw('GET', `/api/games/${id}`)).body); note('concurrent-advance', `turn after two simultaneous End turns: ${st.meta?.turn} (1 expected if the second was refused, 2 if both ran)`);
  // 2. odd spans
  for (const span of ['abc', '-5d', '0d', '9999d', '1', '', '7d; DROP', '7D', 'auto', '1y', '999999999d']) { const r = await J('POST', `/api/games/${id}/advance`, { json: { span, orders: [] }, timeout: 120000 }); note('span', `"${span}": ${r.status} in ${r.ms} ms ${String(r.body).slice(0, 100).replace(/\n/g, ' ')}`); }
  // 3. orders text
  for (const [name, text] of [['empty', ''], ['spaces', '   '], ['huge', 'x'.repeat(200000)], ['html', '<img src=x onerror=window.__xss=1><script>window.__xss=1</script>'], ['nul', 'raise\u0000men'], ['emoji', '🐉🔥 raise men at Winterfell 🔥'], ['rtl', 'raise \u202Emen\u202C at Winterfell'], ['number', 'raise 99999999999999999999 men at Winterfell'], ['neg', 'raise -500 men at Winterfell'], ['float', 'raise 1e308 men at Winterfell']]) {
    const r = await J('POST', `/api/games/${id}/orders`, { json: { orders: [{ id: 'x1', text }] } }); note('orders', `${name}: ${r.status} ${String(r.body).slice(0, 120).replace(/\n/g, ' ')} (${r.ms} ms)`);
  }
  // 4. static traversal and the saves folder
  for (const p of ['/..%2f..%2fpackage.json', '/%2e%2e/package.json', '/..\\..\\package.json', `/saves/${id}/state.json`, '/server/index.js', '/config.json', '/%00', '/js/../../package.json', '/api/../package.json']) { const r = await raw('GET', p); note('static', `${p}: ${r.status} ${r.status === 200 ? '(' + r.body.length + ' bytes: ' + r.body.slice(0, 40).replace(/\n/g, ' ') + ')' : ''}`); }
  // 5. game id traversal
  for (const gid of ['..', '..%2f..%2fpackage.json', '%2e%2e%2f', 'x/../../y', 'nonesuch', '']) { const r = await raw('GET', `/api/games/${gid}`); note('game-id', `"${gid}": ${r.status} ${String(r.body).slice(0, 100).replace(/\n/g, ' ')}`); }
  // 6. bodies
  for (const [name, body] of [['bad json', '{"a":'], ['array', '[1,2]'], ['null', 'null'], ['huge', JSON.stringify({ x: 'y'.repeat(12 * 1024 * 1024) })]]) { const r = await raw('POST', `/api/games/${id}/orders`, { body, headers: { 'content-type': 'application/json' } }); note('body', `${name}: ${r.status} ${String(r.body).slice(0, 100).replace(/\n/g, ' ')}`); }
  // 7. CORS and headers
  const o = await raw('OPTIONS', '/api/config', { headers: { origin: 'http://evil.example', 'access-control-request-method': 'POST' } }); note('cors', `OPTIONS /api/config from evil.example: ${o.status}; allow-origin=${o.headers['access-control-allow-origin']}; ${JSON.stringify(Object.fromEntries(Object.entries(o.headers).filter(([k]) => /access-control|x-frame|content-security|x-content/.test(k))))}`);
  const c = await raw('POST', '/api/config', { body: JSON.stringify({ baseUrl: 'http://evil.example/v1' }), headers: { 'content-type': 'text/plain', origin: 'http://evil.example' } }); note('cors', `a cross-site form POST to /api/config (text/plain): ${c.status}: ${String(c.body).slice(0, 100)}`);
  const h = await raw('GET', '/', { headers: { host: 'evil.example' } }); note('host-header', `GET / with Host: evil.example: ${h.status}`);
  const pg = await raw('GET', '/'); note('headers', `security headers on /: ${JSON.stringify(Object.fromEntries(Object.entries(pg.headers).filter(([k]) => /x-frame|content-security|x-content|referrer|cache/.test(k))))}`);
  // 8. undo and talk
  for (let i = 0; i < 3; i++) { const r = await J('POST', `/api/games/${id}/undo`, { json: {} }); note('undo', `undo #${i + 1}: ${r.status} ${String(r.body).slice(0, 100).replace(/\n/g, ' ')}`); }
  const dead = await J('POST', `/api/games/${id}/talk`, { json: { character: 'jon_arryn', message: 'hello' } }); note('talk', `to the dead Jon Arryn: ${dead.status} ${String(dead.body).slice(0, 100)}`);
  for (const [name, json] of [['unknown', { character: 'nobody_here', message: 'hi' }], ['empty message', { character: 'robb_stark', message: '' }], ['no body', {}], ['huge', { character: 'robb_stark', message: 'z'.repeat(100000) }]]) { const r = await J('POST', `/api/games/${id}/talk`, { json, timeout: 120000 }); note('talk', `${name}: ${r.status} ${String(r.body).slice(0, 100).replace(/\n/g, ' ')} (${r.ms} ms)`); }
  const cz = await J('POST', `/api/games/${id}/council`, { json: { members: [], message: 'x' } }); note('council', `no members: ${cz.status} ${String(cz.body).slice(0, 100)}`);
  // 9. many games
  const t0 = Date.now(); const ids = []; for (let i = 0; i < 30; i++) { const r = await J('POST', '/api/games', { json: { scenario: 'agot_298', house: ['stark', 'lannister', 'tully'][i % 3], seed: i } }); if (r.status !== 200) note('many-games', `create #${i}: ${r.status} ${String(r.body).slice(0, 100)}`); else ids.push(JSON.parse(r.body).id); }
  note('many-games', `30 games made in ${Date.now() - t0} ms, ${new Set(ids).size} distinct ids; list: ${(await raw('GET', '/api/games')).body.length} bytes`);
  // 10. a corrupted save
  const bad = ids[0]; fs.writeFileSync(path.join(saves, bad, 'state.json'), '{"meta":'); const l = await raw('GET', '/api/games'); note('corrupt-save', `list with one corrupt save: ${l.status} (${l.body.length} bytes)`); const gg = await raw('GET', `/api/games/${bad}`); note('corrupt-save', `open the corrupt save: ${gg.status} ${String(gg.body).slice(0, 140).replace(/\n/g, ' ')}`);
  fs.unlinkSync(path.join(saves, ids[1], 'state.json')); const l2 = await raw('GET', '/api/games'); note('corrupt-save', `list with a save missing its state: ${l2.status}`);
} finally { try { srv.kill(); } catch { /* */ } fs.writeFileSync(BH_OUT + '/api.json', JSON.stringify(out, null, 1)); fs.rmSync(saves, { recursive: true, force: true }); }
