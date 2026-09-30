// The title, the settings, the help and the end, in the maester's look (docs/gdd/12-ui-ux.md §11, §12; WP F8). Read as text (the page is a browser's): what must hold —
//   • Settings is in five tabs (Game, Display, Graphics, Sound & voices, Model) and the Model tab keeps its many parameters under "Advanced"; every control the modal had before F8 is still in it, once,
//     in a tab (`tests/fixtures/ui/settings-ids-before-f8.json`), and Save/Test/Fetch reach every field from every tab;
//   • the title screen is on oak panels, the scenario is a line, not an essay, Begin is the theme's gold plate; the loading line says the percent;
//   • the help page lists every key the game answers; the end of the tale is on vellum with the choices it had (play on, undo unless ironman, a new house).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const rd = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8').replace(/\r\n/g, '\n');
const app = rd('public/js/app.js'); const html = rd('public/index.html'); const css = rd('public/css/hud.css');
const settings = (() => { const a = app.indexOf('async function showSettings()'); return app.slice(a, app.indexOf('startIconizer(); hydrateIcons(); drawMenu();', a)); })();
const { routeKey } = await import('../public/js/ui/hud.js');

test('Settings is five tabs, one panel at a time, the last remembered; the Model tab keeps its parameters under Advanced', () => {
  for (const id of ['game', 'display', 'graphics', 'sound', 'model']) { assert.match(settings, new RegExp(`data-set-tab="${id}"`), `tab ${id}`); assert.match(settings, new RegExp(`data-set-panel="${id}"`), `panel ${id}`); }
  assert.match(settings, /Sound &amp; voices/); assert.match(settings, /role="tablist"/); assert.match(settings, /role="tabpanel"/);
  assert.match(settings, /hidden>/, 'panels start hidden; the tab opens one'); assert.match(settings, /localStorage\.setItem\('wc\.settings\.tab'/);
  const model = settings.slice(settings.indexOf('data-set-panel="model"'), settings.indexOf('<div class="settings-actions">'));
  assert.match(model, /<details class="set-adv"><summary>Advanced<\/summary>/); assert.ok(model.indexOf('id="cfg-provider"') < model.indexOf('<details') && model.indexOf('id="cfg-url"') < model.indexOf('<details'), 'the endpoint is up front');
  assert.ok(model.indexOf('id="cfg-extra"') > model.indexOf('<details') && model.indexOf('id="cfg-think"') > model.indexOf('<details'), 'the many parameters are behind Advanced');
  assert.ok(settings.indexOf('<div class="settings-actions">') > settings.indexOf('data-set-panel="model"'));
  assert.match(css, /\.set-panel\[hidden\]/);
});

test('every control the Settings modal had before is still in it, once', () => {
  const before = JSON.parse(rd('tests/fixtures/ui/settings-ids-before-f8.json')).ids;
  for (const id of before) { const n = (settings.match(new RegExp('\\bid="' + id + '"', 'g')) || []).length; assert.equal(n, 1, `#${id} is in the modal ${n} times`); }
  assert.ok(before.length >= 40);
  // the tab a control is in
  const inPanel = (panel, id) => { const a = settings.indexOf(`data-set-panel="${panel}"`); const b = settings.indexOf('</section>', a); return settings.slice(a, b).includes(`id="${id}"`); };
  assert.ok(inPanel('graphics', 'gfx-q') && inPanel('graphics', 'gfx-life') && inPanel('display', 'ui-scale') && inPanel('display', 'house-theme') && inPanel('game', 'rep-on') && inPanel('game', 'cfg-director') && inPanel('game', 'cfg-minds') && inPanel('sound', 'snd-music') && inPanel('model', 'cfg-url'));
});

test('the title screen: oak panels, the scenario as a line, the theme\'s buttons, and the loading line says the percent', () => {
  assert.equal((html.match(/class="panel wc-oak" id="(scenario-panel|house-detail|saves-panel)"/g) || []).length, 3);
  assert.match(app, /class=\\?"scenario-line\\?"><b>/); assert.doesNotMatch(app, /scenario-card/); assert.match(css, /\.scenario-line/);
  assert.match(app, /class="wc-btn wc-btn--gold" id="begin"/); assert.match(html, /class="wc-btn" data-action="settings"/);
  assert.match(app, /\$\{msg\}… \$\{Math\.round\(p \* 100\)\} %/);
});

test('the help page lists every key the game answers, and is the maester\'s notes on vellum', () => {
  const help = app.slice(app.indexOf('const HELP_KEYS = ['), app.indexOf('function showHelp() {'));
  for (const k of ['Ctrl', 'Enter', 'R', 'P', 'H', 'M · E · D · C · I', 'F', 'G', '?', 'Esc']) assert.ok(help.includes(`['${k}`), `the key ${k}`);
  for (const k of ['r', 'p', 'h', 'm', 'e', 'd', 'c', 'i']) assert.ok(routeKey(k), `${k} is a door's key`);
  assert.match(app, /wc-vellum wc-help/); assert.match(app, /\{ vellum: true \}\);\n\}/); assert.match(app, /Click a castle or a host<\/b> and a card opens/);
  assert.doesNotMatch(app.slice(app.indexOf('function showHelp() {')), /Realm window|foot of the chronicle|edit it by hand/, 'no word of the old screen');
});

test('the end of the tale is a page of vellum with the choices it had', () => {
  const end = app.slice(app.indexOf('function maybeShowOutcome() {'), app.indexOf('$(\'#oc-menu\').onclick'));
  assert.match(end, /wc-vellum wc-outcome/); assert.match(end, /wc-btn wc-btn--gold" id="oc-menu"/); assert.match(end, /Play on/); assert.match(end, /settings\?\.ironman \? ''/); assert.match(end, /\{ vellum: true \}\)/);
  assert.match(css, /\.wc-outcome/);
});
