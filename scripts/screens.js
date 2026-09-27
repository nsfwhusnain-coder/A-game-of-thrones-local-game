// Screenshots of the game on the mock provider, for pull requests (CLAUDE.md: 1920×1080 and 1366×768, WebGL through
// SwiftShader, so it runs on a machine without a GPU). Each scenario sets a game up over the same API the browser uses,
// opens it (?game=<id>), points the camera and shoots at both sizes.
//
//   node scripts/screens.js [scenario …]        → visual-out/<scenario>-<w>x<h>.jpg   (default: all scenarios)
//   SCREENS_PROVIDER=replay node scripts/screens.js narrator   (recorded model replies instead of the mock)
//
// Playwright is a dev tool, never a runtime dependency: `npm i --no-save playwright`, or a global install.
import { spawn, execSync } from 'node:child_process';
import { createRequire } from 'node:module';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'visual-out');
const PORT = Number(process.env.SCREENS_PORT || 3497);
const SIZES = [[1920, 1080], [1366, 768]];

function playwright() {
  const require = createRequire(import.meta.url);
  try { return require('playwright'); } catch { /* not installed locally */ }
  return require(path.join(execSync('npm root -g').toString().trim(), 'playwright'));
}
const api = async (p, body) => {
  const r = await fetch(`http://127.0.0.1:${PORT}/api${p}`, body ? { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) } : {});
  const j = await r.json(); if (!r.ok) throw new Error(j.error || r.status); return j;
};

// Each scenario returns { id, focus: [x, y], dist } — the game to open and where to look — or { page: async (page) =>
// … } to drive the page itself before the shot.
const SCENARIOS = {
  // Settings → Test connection on the mock provider: the JSON-schema probe's report (WP B5)
  async settings() {
    return { page: async (page) => {
      await page.click('#title-screen [data-action="settings"]');
      await page.waitForSelector('#cfg-test');
      await page.click('#cfg-test');
      await page.waitForFunction(() => /Connected|✖/.test(document.querySelector('#cfg-result')?.textContent || ''), null, { timeout: 30000 });
      await page.evaluate(() => document.querySelector('#cfg-result').scrollIntoView({ block: 'center' }));
    } };
  },
  // the roads the engine walks (WP B2): the Stark host on the kingsroad to Moat Cailin, the banners converging on it,
  // and Jon riding for the Wall — every route drawn is the one the engine planned, not a straight line
  async routes() {
    const { id, state } = await api('/games', { scenario: 'agot_298', house: 'stark' });
    const vassals = Object.values(state.houses).filter((h) => h.liege === 'stark').map((h) => h.id);
    await api(`/games/${id}/act`, { kind: 'call_banners', vassals, at: 'stark', ownLevies: 4000 });
    const s1 = await api(`/games/${id}`);
    const host = Object.values(s1.parties).find((a) => a.owner === 'stark' && a.kind === 'host');
    await api(`/games/${id}/act`, { kind: 'march', army: host.id, to: 'moat_cailin' });
    const { state: s } = await api(`/games/${id}/advance`, { span: '9d', orders: [{ id: 'r1', text: 'Send Jon Snow to Castle Black.' }] });
    const at = s.parties[host.id]?.pos || s.holdings.stark.pos;
    return { id, focus: [at[0] + 20, at[1] - 60], dist: 520 };
  },
  // the glass turned back (WP B3): three turns played, and the undo button asks how far to go
  async undo() {
    const { id, state } = await api('/games', { scenario: 'agot_298', house: 'stark' });
    for (const span of ['4d', '5d', '6d']) await api(`/games/${id}/advance`, { span, orders: [] });
    return { id, focus: state.holdings.stark.pos, dist: 700, page: async (page) => { await page.click('[data-action="undo"]'); await page.waitForSelector('.undo-levels [data-undo="3"]'); } };
  },
  // a card's action is a verb, and the receipt is what the lord is told (WP B4): the Stark host marches for Moat Cailin
  async receipt() {
    const { id, state } = await api('/games', { scenario: 'agot_298', house: 'stark' });
    const r = await api(`/games/${id}/act`, { verb: 'raise_levies', params: { at: 'stark', men: 4000, name: 'The Host of Winterfell' } });
    const host = Object.values(r.state.parties).find((a) => a.owner === 'stark' && a.kind === 'host');
    return { id, focus: [state.holdings.stark.pos[0] + 10, state.holdings.stark.pos[1] + 90], dist: 700, page: async (page) => {
      await page.evaluate(async (army) => { const m = await import('/js/ui/common.js'); await m.doVerb('march_host', { army, to: 'moat_cailin' }); }, host.id);
      await page.waitForSelector('#toasts .toast');
    } };
  },
  // written orders read when they are written (WP B6): each with its receipt — ✓ done, ⚠ done with a warning, ✗ refused
  // and why — and the one question the steward must ask, with its answers as chips
  async orders() {
    const { id, state } = await api('/games', { scenario: 'agot_298', house: 'stark' });
    await api(`/games/${id}/act`, { verb: 'raise_levies', params: { at: 'stark', men: 4000, name: 'The Host of Winterfell', commander: 'robb_stark' } });
    await api(`/games/${id}/orders`, { orders: [
      { id: 'o1', text: 'Send Jory Cassel to Moat Cailin with fifty men.' },
      { id: 'o2', text: 'Robb, march the host to the Twins.' },
      { id: 'o3', text: 'Raise twenty thousand more levies at Winterfell.' },
      { id: 'o4', text: 'Hire sellswords at Winterfell.' },
      { id: 'o5', text: 'Send someone to the Wall.' },
      { id: 'o6', text: 'Spend sixty million gold dragons to buy the Iron Throne from King Robert.' },
      { id: 'o7', text: 'Write to Lord Tully at Riverrun.' },
    ] });
    await api(`/games/${id}/orders/preview`, {});
    return { id, focus: [state.holdings.stark.pos[0], state.holdings.stark.pos[1] + 120], dist: 900, page: async (page) => { await page.waitForSelector('.receipt .chip'); await page.evaluate(() => { const o = document.querySelector('#orders'); o.scrollTop = o.scrollHeight; }); } };
  },
  // …and the questions answered by a click: two hundred sellswords, and Ser Rodrik rides for the Wall
  async answered() {
    const g = await SCENARIOS.orders();
    return { ...g, page: async (page) => {
      // (the second size opens the same game, its questions already answered)
      await page.waitForSelector('.receipt .rl');
      for (const [o, k] of [['o4', 1], ['o5', 0]]) if (await page.$(`.chip[data-answer="${o}"]`)) { await page.click(`.chip[data-answer="${o}"][data-k="${k}"]`); await page.waitForSelector(`.chip[data-answer="${o}"]`, { state: 'detached' }); }
      await page.evaluate(() => { const o = document.querySelector('#orders'); o.scrollTop = o.scrollHeight; });
    } };
  },
  // the realm's minds (WP B7): a week passes, and the lords of the realm act by their own lights — the chronicle tells
  // what the North would hear of it
  async minds() {
    const { id, state } = await api('/games', { scenario: 'agot_298', house: 'stark', seed: 11 });
    await api(`/games/${id}/advance`, { span: '7d', orders: [] });
    const { turn } = await api(`/games/${id}/advance`, { span: '7d', orders: [] });
    const said = (turn.events || []).filter((e) => e.mind).map((e) => e.title);
    return { id, focus: state.holdings.baratheon.pos, dist: 1400, page: async (page) => {
      // the week's news from the realm's minds, brought into view in the chronicle
      await page.evaluate((titles) => { const el = [...document.querySelectorAll('#drawer-body *')].find((x) => x.children.length < 4 && titles.some((t) => (x.textContent || '').includes(t.slice(0, 24)))); el?.scrollIntoView({ block: 'start' }); }, said);
    } };
  },
  // the chronicle told (WP B8): the first Stark week, told by the recorded narrator (run with SCREENS_PROVIDER=replay) —
  // stories in the books' voice, one of them left in the plain words of the record because it invented an arrival
  async narrator() {
    const { id, state } = await api('/games', { scenario: 'agot_298', house: 'stark', seed: 298 });
    await api(`/games/${id}/advance`, { span: '7d', orders: [{ text: 'Call the banners to Winterfell.' }, { text: 'Send Jon Snow to Castle Black.' }] });
    return { id, focus: state.holdings.stark.pos, dist: 900, page: async (page) => {
      await page.evaluate(() => {
        const told = [...document.querySelectorAll('#drawer-body .story')].find((x) => x.querySelector('.story-rec') && /Karstark/.test(x.textContent));
        told?.querySelector('.story-rec')?.setAttribute('open', '');
        told?.scrollIntoView({ block: 'start' });
        const body = document.querySelector('#drawer-body'); if (body) body.scrollTop -= 44; // clear of the sticky date
      });
    } };
  },
  // the same week from its start: the lord's own command told under his words, and the week's Meanwhile line
  async commanded() {
    const { id, state } = await api('/games', { scenario: 'agot_298', house: 'stark', seed: 298 });
    await api(`/games/${id}/advance`, { span: '7d', orders: [{ text: 'Call the banners to Winterfell.' }, { text: 'Send Jon Snow to Castle Black.' }] });
    return { id, focus: state.holdings.stark.pos, dist: 900, page: async (page) => {
      await page.evaluate(() => {
        const el = document.querySelector('#drawer-body .news-meanwhile'); el?.scrollIntoView({ block: 'end' });
        const body = document.querySelector('#drawer-body'); if (body) body.scrollTop += 12;
      });
    } };
  },
  // news that came late (WP B9): a card told the day its word arrived, with the day it happened; the map shows the
  // realm's hosts only as the house knows them
  async news() {
    const { id, state } = await api('/games', { scenario: 'agot_298', house: 'stark', seed: 5 });
    for (let t = 0; t < 5; t++) await api(`/games/${id}/advance`, { span: '7d', orders: t === 0 ? [{ text: 'Call the banners to Winterfell.' }] : [] });
    return { id, focus: state.holdings.frey.pos, dist: 1500, page: async (page) => {
      await page.evaluate(() => {
        const late = document.querySelector('#drawer-body .story-heard')?.closest('.story');
        late?.scrollIntoView({ block: 'center' });
      });
    } };
  },
  // beginning a chronicle, ironman or not (WP B3)
  async begin() {
    return { page: async (page) => { await page.click('.house-tile[data-h="stark"]'); await page.waitForSelector('#ironman'); await page.check('#ironman'); } };
  },
  // an island lord's men at sea: House Crowl or House Mormont sailing for the mainland (WP A8)
  async sea() {
    const { id, state } = await api('/games', { scenario: 'agot_298', house: 'stark' });
    const vassals = Object.values(state.houses).filter((h) => h.liege === 'stark').map((h) => h.id);
    await api(`/games/${id}/act`, { kind: 'call_banners', vassals, at: 'stark', ownLevies: 4000 });
    for (let t = 0; t < 14; t++) {
      const { state: s } = await api(`/games/${id}/advance`, { span: '7d' });
      const ship = Object.values(s.parties).find((a) => ['crowl', 'mormont'].includes(a.owner) && a.sea?.phase === 'sailing');
      if (ship) return { id, focus: ship.pos, dist: 260 };
    }
    throw new Error('no island host set sail in 14 weeks');
  },
};

async function main() {
  const wanted = process.argv.slice(2).length ? process.argv.slice(2) : Object.keys(SCENARIOS);
  fs.mkdirSync(OUT, { recursive: true });
  const saves = fs.mkdtempSync(path.join(os.tmpdir(), 'wc-screens-'));
  const srv = spawn(process.execPath, ['server/index.js'], { cwd: ROOT, env: { ...process.env, PORT: String(PORT), WC_PROVIDER: process.env.SCREENS_PROVIDER || 'mock', WC_SAVES: saves }, stdio: 'ignore' });
  try {
    for (let i = 0; i < 100; i++) { try { await api('/version'); break; } catch { await new Promise((r) => setTimeout(r, 100)); } }
    const { chromium } = playwright();
    const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
    for (const name of wanted) {
      if (!SCENARIOS[name]) { console.error(`unknown scenario ${name}`); continue; }
      const { id, focus, dist, page: drive } = await SCENARIOS[name]();
      for (const [w, h] of SIZES) {
        const page = await browser.newPage({ viewport: { width: w, height: h } });
        const errors = []; page.on('pageerror', (e) => errors.push(e.message));
        await page.goto(`http://127.0.0.1:${PORT}/?dev${id ? `&game=${id}` : ''}`);
        if (id) {
          // the map is ready when the game has made it and the loading veil is down again
          await page.waitForFunction(() => window.__wc?.map && document.querySelector('#map-loading')?.classList.contains('hidden'), null, { timeout: 240000, polling: 500 });
          if (focus) await page.evaluate(([p, d]) => window.__wc.map.flyTo(p, d), [focus, dist]);
        }
        if (drive) await drive(page);
        await page.waitForTimeout(id ? 4000 : 1500);
        const file = path.join(OUT, `${name}-${w}x${h}.jpg`); // JPEG: small enough to commit beside a pull request
        await page.screenshot({ path: file, type: 'jpeg', quality: 82, timeout: 180000 }); // SwiftShader draws a forest slowly
        console.log(`${file}${errors.length ? `  (page errors: ${errors.join(' | ')})` : ''}`);
        await page.close();
      }
    }
    await browser.close();
  } finally { srv.kill(); fs.rmSync(saves, { recursive: true, force: true }); }
}
main().catch((e) => { console.error(e); process.exit(1); });
