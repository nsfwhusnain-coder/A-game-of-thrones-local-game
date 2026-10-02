// The local server's edges (docs/BUG-HUNT-2026-10-02.md, SV1 and the parts of SV3 that are the same door): it answers only
// the game's own page. A page on another site can make the browser send a form POST to 127.0.0.1; it must not be able to
// reconfigure the game (the model server URL and the key sent to it), and a bad request must be answered, cleanly, not hang.
// The real server, on the mock, with a config file and a saves folder of its own; no model, no network but loopback.
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wc-sv1-'));
const saves = path.join(dir, 'saves'); const cfgFile = path.join(dir, 'config.json');
let srv; let PORT;
const freePort = () => new Promise((res) => { const s = net.createServer().listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => res(p)); }); });
/** One request, by hand: the headers are exactly those given (a browser's Host, Origin and Content-Type, or none). */
const raw = (method, p, { body, headers = {}, agent = false } = {}) => new Promise((resolve, reject) => {
  const h = { host: `127.0.0.1:${PORT}`, ...headers }; if (body != null) h['content-length'] = Buffer.byteLength(body);
  const req = http.request({ host: '127.0.0.1', port: PORT, method, path: p, headers: h, agent, timeout: 20000 }, (res) => {
    let d = ''; res.on('data', (c) => (d += c)); res.on('end', () => { let json = null; try { json = JSON.parse(d); } catch { /* not JSON */ } resolve({ status: res.statusCode, headers: res.headers, text: d, json }); });
  });
  req.on('timeout', () => { req.destroy(); reject(new Error(`${method} ${p} timed out`)); });
  req.on('error', reject); if (body != null) req.write(body); req.end();
});
const own = () => ({ origin: `http://127.0.0.1:${PORT}` });
const json = (p, o, extra = {}) => raw('POST', p, { body: JSON.stringify(o), headers: { 'content-type': 'application/json', ...extra } });
const config = () => JSON.parse(fs.readFileSync(cfgFile, 'utf8'));

test.before(async () => {
  PORT = await freePort();
  fs.writeFileSync(cfgFile, JSON.stringify({ provider: 'mock', baseUrl: 'http://127.0.0.1:1/v1' }));
  srv = spawn(process.execPath, ['server/index.js'], { cwd: ROOT, env: { ...process.env, PORT: String(PORT), WC_PROVIDER: 'mock', WC_SAVES: saves, WC_CONFIG: cfgFile }, stdio: 'ignore' });
  for (let i = 0; i < 80; i++) { try { if ((await raw('GET', '/api/version')).status === 200) return; } catch { /* not yet */ } await new Promise((r) => setTimeout(r, 100)); }
  throw new Error('server did not start');
});
test.after(() => { srv?.kill(); fs.rmSync(dir, { recursive: true, force: true }); });

test('SV1: a page on another site cannot reconfigure the game (the model URL and the key go where the owner put them)', async () => {
  const before = config().baseUrl;
  const evil = 'http://evil.example/v1';
  // the cross-site form POST of the report: a plain-text body the old reader parsed as JSON
  const form = await raw('POST', '/api/config', { body: JSON.stringify({ baseUrl: evil }), headers: { 'content-type': 'text/plain', origin: 'http://evil.example' } });
  assert.equal(form.status, 403); assert.equal(config().baseUrl, before, 'the form post changed nothing');
  // a script on that page, in JSON (needs CORS, which the browser would refuse; but the server must not take it either)
  const xhr = await json('/api/config', { baseUrl: evil }, { origin: 'http://evil.example' });
  assert.equal(xhr.status, 403); assert.equal(config().baseUrl, before);
  // a privacy-stripped origin, and a browser that says the request is cross-site
  assert.equal((await json('/api/config', { baseUrl: evil }, { origin: 'null' })).status, 403);
  assert.equal((await json('/api/config', { baseUrl: evil }, { 'sec-fetch-site': 'cross-site' })).status, 403);
  assert.equal((await json('/api/config', { baseUrl: evil }, { 'sec-fetch-site': 'same-site' })).status, 403, 'another port of the same machine is another site too');
  // the same page on another port of this machine
  assert.equal((await json('/api/config', { baseUrl: evil }, { origin: `http://127.0.0.1:${PORT + 1}` })).status, 403);
  assert.equal(config().baseUrl, before);
  // DELETE is no safer than POST
  const g = await json('/api/games', { scenario: 'agot_298', house: 'stark', seed: 1 }, own());
  assert.equal(g.status, 200);
  assert.equal((await raw('DELETE', `/api/games/${g.json.id}`, { headers: { origin: 'http://evil.example' } })).status, 403);
  assert.equal((await raw('GET', `/api/games/${g.json.id}`)).status, 200, 'the save is still there');
});

test('SV1: the game\'s own page, from 127.0.0.1 or localhost, still works; so does a script with no Origin', async () => {
  const mine = await json('/api/config', { baseUrl: 'http://127.0.0.1:2/v1' }, own());
  assert.equal(mine.status, 200); assert.equal(config().baseUrl, 'http://127.0.0.1:2/v1');
  const viaName = await raw('POST', '/api/config', { body: JSON.stringify({ baseUrl: 'http://127.0.0.1:3/v1' }), headers: { host: `localhost:${PORT}`, origin: `http://localhost:${PORT}`, 'content-type': 'application/json; charset=utf-8', 'sec-fetch-site': 'same-origin' } });
  assert.equal(viaName.status, 200); assert.equal(config().baseUrl, 'http://127.0.0.1:3/v1');
  const script = await json('/api/config', { baseUrl: 'http://127.0.0.1:4/v1' }); // a test, curl, a harness: no Origin, no Sec-Fetch-Site
  assert.equal(script.status, 200);
  assert.equal((await raw('GET', '/api/config', { headers: { origin: `http://127.0.0.1:${PORT}` } })).status, 200);
  assert.equal((await raw('GET', '/', {})).status, 200);
});

test('SV1: a name that only points here (DNS rebinding) is refused; addresses and localhost are not', async () => {
  for (const host of ['evil.example', `evil.example:${PORT}`, `127.0.0.1.evil.example:${PORT}`]) {
    const r = await raw('GET', '/api/version', { headers: { host } });
    assert.equal(r.status, 403, `Host: ${host}`);
    assert.equal((await raw('GET', '/', { headers: { host } })).status, 403, `the page too, for Host: ${host}`);
  }
  for (const host of [`127.0.0.1:${PORT}`, `localhost:${PORT}`, `[::1]:${PORT}`, `192.168.1.20:${PORT}`]) assert.equal((await raw('GET', '/api/version', { headers: { host } })).status, 200, `Host: ${host}`);
});

test('SV1: a body must say it is JSON', async () => {
  const before = config().baseUrl;
  for (const type of ['text/plain', 'application/x-www-form-urlencoded', 'multipart/form-data; boundary=x', undefined]) {
    const r = await raw('POST', '/api/config', { body: JSON.stringify({ baseUrl: 'http://evil.example/v1' }), headers: { ...(type ? { 'content-type': type } : {}), ...own() } });
    assert.equal(r.status, 415, `${type}`); assert.match(r.json.error, /JSON/);
  }
  assert.equal(config().baseUrl, before);
  // no body, no type needed (the page's own bodyless posts)
  assert.equal((await raw('POST', '/api/games/nonesuch/consolidate', { headers: own() })).status, 404);
});

test('SV1: OPTIONS is answered, and never with leave to cross sites; the headers close the other doors', async () => {
  const pre = await raw('OPTIONS', '/api/config', { headers: { ...own(), 'access-control-request-method': 'POST' } });
  assert.equal(pre.status, 204); assert.match(pre.headers.allow, /POST/); assert.equal(pre.headers['access-control-allow-origin'], undefined);
  const evil = await raw('OPTIONS', '/api/config', { headers: { origin: 'http://evil.example', 'access-control-request-method': 'POST' } });
  assert.equal(evil.status, 403); assert.equal(evil.headers['access-control-allow-origin'], undefined);
  for (const p of ['/', '/api/version', '/js/app.js', '/api/nonesuch']) {
    const r = await raw('GET', p);
    assert.equal(r.headers['x-content-type-options'], 'nosniff', p);
    assert.equal(r.headers['x-frame-options'], 'DENY', p);
    assert.match(r.headers['content-security-policy'], /frame-ancestors 'none'/, p);
    assert.ok(r.headers['referrer-policy'], p);
    assert.equal(r.headers['access-control-allow-origin'], undefined, p);
  }
  assert.equal((await raw('POST', '/index.html', { headers: { ...own(), 'content-type': 'application/json' }, body: '{}' })).status, 405, 'a page is read, not posted to');
});

test('SV3 (the same door): bad JSON is a 400 in plain words; nothing of the server leaks; an oversized body is refused and the connection is not left stuck', async () => {
  const { id } = (await json('/api/games', { scenario: 'agot_298', house: 'stark', seed: 2 }, own())).json;
  for (const [what, body] of [['truncated', '{"orders":'], ['null', 'null'], ['an array', '[1,2]'], ['a number', '7'], ['a string', '"x"']]) {
    const r = await raw('POST', `/api/games/${id}/orders`, { body, headers: { 'content-type': 'application/json', ...own() } });
    assert.equal(r.status, 400, what); assert.ok(r.json?.error, what);
    assert.ok(!/Unexpected|undefined|null \(|at \w+ \(|node_modules|\.js:\d+/i.test(r.json.error), `${what}: "${r.json.error}" is for a player, not a stack trace`);
  }
  assert.equal((await raw('POST', `/api/games/${id}/orders`, { body: '', headers: { 'content-type': 'application/json', ...own() } })).status, 200, 'an empty body is an empty object');
  // too large: refused in words, and the connection is not left stuck for the next request (one socket serves both)
  const one = new http.Agent({ keepAlive: true, maxSockets: 1 });
  const big = await raw('POST', `/api/games/${id}/orders`, { agent: one, body: JSON.stringify({ x: 'y'.repeat(6 * 1024 * 1024) }), headers: { 'content-type': 'application/json', ...own() } });
  assert.equal(big.status, 413); assert.match(big.json.error, /too large/);
  assert.equal((await raw('GET', `/api/games/${id}`, { agent: one })).status, 200, 'the very next request, on the same connection, is answered');
  one.destroy();
});
