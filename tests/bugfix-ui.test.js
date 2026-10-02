// Bug hunt, the interface group (docs/BUG-HUNT-2026-10-02.md): UI1 keys held with Cmd stuck and the camera drifted; UI2 a house with no seat opened the map over the North;
// UI3 the crest said "House The Free Folk"; UI6 a 404 on every page load. The map itself needs a browser (Playwright, scripts/bughunt/probe-ui2.mjs); what it decides is
// in small modules that need none, and those are what is tested here. Mock only.
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { fileURLToPath } from 'node:url';

process.env.WC_PROVIDER = 'mock';
const { holdKeys } = await import('../public/js/map3d/keys.js');
const { homeOf, homePlace } = await import('../public/js/map3d/home.js');
const { createInitialState } = await import('../public/js/shared/world.js');
const { houseHeading } = await import('../public/js/engine/facts/label.js');
const { lodOf, ROUTES_FROM } = await import('../public/js/map3d/lod.js');
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const stage = (hidden = false) => {
  const win = new EventTarget(); const doc = Object.assign(new EventTarget(), { hidden });
  const keys = new Set(); let typing = false;
  holdKeys({ win, doc, keys, accept: () => !typing });
  const key = (type, k, mods = {}) => win.dispatchEvent(Object.assign(new Event(type), { key: k, metaKey: false, ctrlKey: false, altKey: false, ...mods }));
  return { win, doc, keys, key, typing: (v) => { typing = v; } };
};

test('UI1: a key held is held until it is released; Cmd, Ctrl and Alt are the browser\'s, not the map\'s', () => {
  const t = stage();
  t.key('keydown', 'd'); assert.ok(t.keys.has('d'), 'a held key pans');
  t.key('keyup', 'D'); assert.ok(!t.keys.has('d'), 'a released one (in either case) stops');
  t.key('keydown', 'w'); t.key('keydown', 's', { metaKey: true });
  assert.equal(t.keys.size, 0, 'Cmd+S is the browser\'s, and lets go of everything the map held');
  t.key('keydown', 'd', { metaKey: true }); assert.ok(!t.keys.has('d'), 'Cmd+D (the page sees no release of the D on a Mac) adds nothing');
  t.key('keydown', 'a', { ctrlKey: true }); assert.ok(!t.keys.has('a'), 'Ctrl+A');
  t.key('keydown', 'a', { altKey: true }); assert.ok(!t.keys.has('a'), 'Alt+A');
  t.key('keydown', 'arrowleft'); assert.ok(t.keys.has('arrowleft'), 'the arrows pan');
});

test('UI1: the keys are let go when the window loses the keyboard or the tab is hidden', () => {
  const t = stage();
  t.key('keydown', 'd'); t.key('keydown', 'w');
  t.win.dispatchEvent(new Event('blur')); assert.equal(t.keys.size, 0, 'a window that lost focus holds nothing (Cmd+Tab with a key down)');
  t.key('keydown', 'd');
  t.doc.dispatchEvent(new Event('visibilitychange')); assert.ok(t.keys.has('d'), 'a visible tab changing is nothing');
  t.doc.hidden = true; t.doc.dispatchEvent(new Event('visibilitychange')); assert.equal(t.keys.size, 0, 'a hidden tab holds nothing');
});

test('UI1: a key typed into a field is not the map\'s', () => {
  const t = stage(); t.typing(true);
  t.key('keydown', 'd'); assert.equal(t.keys.size, 0);
  t.typing(false); t.key('keydown', 'd'); assert.ok(t.keys.has('d'));
});

test('UI2: a house with no seat opens the map on its lord, not on the North', () => {
  const dany = createInitialState('agot_298', 'targaryen', { seed: 7 });
  assert.equal(dany.houses.targaryen.seat, null, 'the exile has no seat');
  assert.equal(homePlace(dany), 'pentos'); assert.deepEqual(homeOf(dany), dany.holdings.pentos.pos, 'it opens on Pentos');
  const gold = createInitialState('agot_298', 'golden_company', { seed: 7 });
  assert.deepEqual(homeOf(gold), gold.holdings[gold.characters[gold.houses.golden_company.lord].loc].pos, 'a company opens on its camp');
  const stark = createInitialState('agot_298', 'stark', { seed: 7 });
  assert.equal(homePlace(stark), 'stark'); assert.deepEqual(homeOf(stark), stark.holdings.stark.pos, 'a seated house on its seat');
  // a lord on the road: the party he rides in; one lost to the map: what the house holds; nothing known: null
  const road = createInitialState('agot_298', 'targaryen', { seed: 7 });
  const lord = road.characters[road.houses.targaryen.lord]; lord.loc = 'party:eddard_riders'; road.parties.eddard_riders = { id: 'eddard_riders', pos: [100, 200], kind: 'rider' };
  assert.equal(homePlace(road), null); assert.deepEqual(homeOf(road), [100, 200], 'on the road it opens where he rides');
  lord.loc = 'nowhere'; road.holdings.pentos.owner = 'targaryen';
  assert.deepEqual(homeOf(road), road.holdings.pentos.pos, 'it opens on what the house holds');
  road.holdings.pentos.owner = 'pentos'; assert.equal(homeOf(road), null);
  assert.equal(homeOf({ meta: {}, houses: {} }), null);
});

test('UI3: the crest names a faction as a faction, a house as a house', () => {
  const s = createInitialState('agot_298', 'stark', { seed: 7 });
  const said = (id) => houseHeading(s, id);
  assert.equal(said('stark'), 'House Stark');
  assert.equal(said('free_folk'), 'The Free Folk');
  assert.equal(said('golden_company'), 'The Golden Company');
  assert.equal(said('dothraki'), 'The Dothraki');
  assert.equal(said('nights_watch'), 'The Night\'s Watch');
  assert.equal(said('braavos'), 'Braavos');
  assert.equal(said('baratheon'), 'House Baratheon', 'the house on the throne, in its own crest');
  for (const h of Object.values(s.houses)) { const t = said(h.id); assert.ok(/^[A-Z]/.test(t) && !/House The |House of |undefined/.test(t), `${h.id}: "${t}"`); }
  assert.equal(said('no_such_house'), 'No Such House');
});

test('UI6: the sigil index is an empty list when no artwork is installed, not a 404 on every page load', async () => {
  const port = await new Promise((resolve) => { const s = net.createServer(); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => resolve(p)); }); });
  const saves = fs.mkdtempSync(path.join(os.tmpdir(), 'wc-ui-'));
  const srv = spawn(process.execPath, ['server/index.js'], { cwd: ROOT, env: { ...process.env, PORT: String(port), WC_PROVIDER: 'mock', WC_SAVES: saves }, stdio: 'ignore' });
  const get = (p) => new Promise((resolve, reject) => { http.get({ host: '127.0.0.1', port, path: p }, (res) => { let b = ''; res.on('data', (c) => { b += c; }); res.on('end', () => resolve({ status: res.statusCode, body: b, type: res.headers['content-type'] })); }).on('error', reject); });
  try {
    for (let i = 0; i < 100; i++) { try { if ((await get('/api/version')).status === 200) break; } catch { /* not yet */ } await new Promise((r) => setTimeout(r, 100)); }
    const r = await get('/assets/sigils/index.json');
    if (!fs.existsSync(path.join(ROOT, 'public', 'assets', 'sigils', 'index.json'))) { assert.equal(r.status, 200); assert.deepEqual(JSON.parse(r.body), {}); }
    assert.equal((await get('/assets/nothing-here.png')).status, 404, 'a file that is not there is still not found');
  } finally { srv.kill(); fs.rmSync(saves, { recursive: true, force: true }); }
});

test('UI5: at the default zoom every journey shows its road; from the middle zoom out only the party in hand does', () => {
  assert.ok(lodOf(520) >= ROUTES_FROM, 'the default camera (520) draws every road');
  assert.ok(lodOf(460) >= ROUTES_FROM && lodOf(160) >= ROUTES_FROM, 'and closer in');
  assert.ok(lodOf(700) < ROUTES_FROM && lodOf(1400) < ROUTES_FROM && lodOf(3500) < ROUTES_FROM, 'the middle and far levels of the report (700, 1400) draw only the road in hand');
});
