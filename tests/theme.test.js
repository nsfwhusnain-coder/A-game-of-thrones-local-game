// The maester's desk (WP U0, GDD 21): theme.css is only added to the game, its text is readable on every material, its
// textures are small and exist, and the icons the new screens need are in the set. No browser: this reads files.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
const THEME = read('public/css/theme.css');
const STYLE = read('public/css/style.css');
const noComments = (css) => css.replace(/\/\*[\s\S]*?\*\//g, '');

// every custom property declared in a :root block
function rootTokens(css) {
  const out = {};
  for (const m of noComments(css).matchAll(/:root\s*\{([^}]*)\}/g)) for (const d of m[1].matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)) out[d[1]] = d[2].trim();
  return out;
}
const TOKENS = rootTokens(THEME);

// a value as one sRGB colour, or null when it is a gradient / a mix that has no single value; var(--x, fallback) resolves
function colorOf(v, seen = new Set()) {
  v = v.trim();
  let m = v.match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i);
  if (m) { let h = m[1]; if (h.length === 3) h = [...h].map((c) => c + c).join(''); return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16)); }
  m = v.match(/^var\(\s*(--[\w-]+)\s*(?:,\s*([\s\S]+))?\)$/);
  if (m) { if (!seen.has(m[1]) && TOKENS[m[1]]) return colorOf(TOKENS[m[1]], new Set([...seen, m[1]])) || (m[2] ? colorOf(m[2], seen) : null); return m[2] ? colorOf(m[2], seen) : null; }
  return null;
}
const hexOf = (name) => (TOKENS[name] ? colorOf(TOKENS[name], new Set([name])) : null);
const lum = ([r, g, b]) => { const f = (c) => { c /= 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; }; return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b); };
const ratio = (a, b) => { const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x); return (hi + 0.05) / (lo + 0.05); };

test('the tokens of GDD 21 §3 are declared on :root', () => {
  for (const t of ['--vellum', '--vellum-shade', '--ink-iron', '--rubric', '--oak', '--oak-edge', '--bone', '--bone-dim', '--iron', '--iron-hi', '--bronze', '--gold-leaf', '--wax', '--wax-hi', '--madder', '--verdigris', '--ochre', '--radius-card', '--radius-btn', '--radius-seal']) assert.ok(TOKENS[t], `${t} is missing`);
  assert.match(TOKENS['--wax'], /^#7b1e17$/i, 'wax defaults to oxblood; applyHouseTheme sets a richer pigment when the arms have one');
});

test('the text/surface pairs theme.css declares hold 4.5:1 (WCAG)', () => {
  const pairs = [...THEME.matchAll(/contrast:\s*(--[\w-]+)\s+on\s+(--[\w-]+)/g)].map((m) => [m[1], m[2]]);
  assert.ok(pairs.length >= 12, `only ${pairs.length} pairs are declared`);
  const bad = [];
  for (const [fg, bg] of pairs) {
    const a = hexOf(fg), b = hexOf(bg);
    if (!a || !b) { bad.push(`${fg} on ${bg}: not a single colour`); continue; }
    const r = ratio(a, b); if (r < 4.5) bad.push(`${fg} on ${bg}: ${r.toFixed(2)}`);
  }
  assert.deepEqual(bad, [], `low contrast: ${bad.join('; ')}`);
});

test('theme.css only adds: every selector is a wc- class, every animation a wc- one, and no token of style.css is redefined', () => {
  // a small walker over nested blocks (@media, @supports) collecting selector preludes and at-rule names
  const css = noComments(THEME); const selectors = []; const atrules = [];
  const walk = (s) => {
    let i = 0;
    while (i < s.length) {
      const open = s.indexOf('{', i); if (open < 0) break;
      const prelude = s.slice(i, open).trim(); let depth = 1, j = open + 1;
      while (j < s.length && depth) { if (s[j] === '{') depth++; else if (s[j] === '}') depth--; j++; }
      const body = s.slice(open + 1, j - 1);
      if (prelude.startsWith('@')) { atrules.push(prelude); if (/^@(media|supports)/.test(prelude)) walk(body); } else selectors.push(prelude);
      i = j;
    }
  };
  walk(css);
  assert.ok(selectors.length > 60, 'the walker found the rules');
  // a selector list splits on commas that are not inside :is( … ) and the like
  const topLevel = (s) => { const out = []; let depth = 0, cur = ''; for (const ch of s) { if (ch === '(') depth++; if (ch === ')') depth--; if (ch === ',' && !depth) { out.push(cur); cur = ''; } else cur += ch; } out.push(cur); return out; };
  const foreign = selectors.flatMap((s) => topLevel(s).map((x) => x.trim())).filter((x) => x && x !== ':root' && !/\.wc-[a-z0-9_-]+/.test(x));
  assert.deepEqual(foreign, [], `selectors that are not wc- classes: ${foreign.join(' | ')}`);
  for (const a of atrules) if (/^@keyframes/.test(a)) assert.match(a, /^@keyframes wc-/, a);
  const old = rootTokens(STYLE);
  const clash = Object.keys(TOKENS).filter((k) => k in old);
  assert.deepEqual(clash, [], `theme.css redefines tokens style.css owns: ${clash.join(', ')}`);
});

test('the textures are small, exist, and every file theme.css names is there', () => {
  const dir = path.join(ROOT, 'public/img/ui');
  const files = fs.readdirSync(dir);
  const total = files.reduce((n, f) => n + fs.statSync(path.join(dir, f)).size, 0);
  assert.ok(total <= 600 * 1024, `public/img/ui is ${(total / 1024).toFixed(0)} KB, over the 600 KB budget`);
  for (const f of ['vellum.jpg', 'vellum-edge.png', 'oak.jpg', 'leather.jpg', 'iron.jpg', 'ornaments.svg']) assert.ok(files.includes(f), `${f} is missing`);
  const svg = read('public/img/ui/ornaments.svg');
  const urls = [...noComments(THEME).matchAll(/url\(\s*['"]?([^'")]+)['"]?\s*\)/g)].map((m) => m[1]);
  assert.ok(urls.length >= 10);
  for (const u of urls) {
    if (/^(data:|https?:)/.test(u)) continue;
    const [file, frag] = u.split('#');
    assert.ok(fs.existsSync(path.resolve(ROOT, 'public/css', file)), `theme.css names ${file}, which does not exist`);
    if (frag) assert.match(svg, new RegExp(`<view id="${frag}"`), `ornaments.svg has no <view id="${frag}">`);
  }
  for (const id of ['corner-knot', 'corner-leaf', 'fleuron-rule', 'tier-diamond', 'rubric-bullet', 'initial-frame']) assert.match(svg, new RegExp(`<view id="${id}"`), `ornaments.svg lacks ${id}`);
});

test('no emoji in theme.css or the style tile (the icons are the game\'s own)', () => {
  for (const f of ['public/css/theme.css', 'public/dev/style.html']) {
    const hit = [...read(f).matchAll(/\p{Extended_Pictographic}/gu)].map((m) => `U+${m[0].codePointAt(0).toString(16)}`);
    assert.deepEqual(hit, [], `${f} holds emoji ${hit.join(' ')}`);
  }
});

test('the new icons of GDD 21 §5 are in the set and draw', async () => {
  const src = read('public/js/ui/icons.js');
  const { icon } = await import(path.join(ROOT, 'public/js/ui/icons.js'));
  for (const n of ['chain', 'weirwood', 'book', 'seal', 'tier3', 'tier2', 'tier1', 'pip', 'dots', 'inkpot']) {
    assert.match(src, new RegExp(`^\\s+${n}: '`, 'm'), `icons.js has no ${n}`);
    assert.match(icon(n), /^<svg class="ico [^"]*" viewBox="0 0 24 24"/, `${n} does not draw`);
  }
});

test('index.html loads theme.css after style.css, and applyHouseTheme gives the wax its two colours', () => {
  const html = read('public/index.html');
  const a = html.indexOf('css/style.css'), b = html.indexOf('css/theme.css');
  assert.ok(a > 0 && b > a, 'theme.css must follow style.css in index.html');
  const fn = read('public/js/ui/common.js').split('export function applyHouseTheme')[1];
  assert.match(fn, /--house-1/); assert.match(fn, /--house-2/); assert.match(fn, /'--wax'/);
});

// The wax rule of applyHouseTheme on the real arms: wax is pigment (a rich colour, not pale, not near black, not a grey), never
// the metal. The game's own `pigment` and `hexToHsl` are lifted from the source so this cannot drift from what the page does.
test('the wax is the richest of the arms\' colours, and oxblood when the arms are only white, grey and black', async () => {
  const { HOUSES } = await import(path.join(ROOT, 'public/data/houses.js'));
  const src = read('public/js/ui/common.js');
  const hexToHsl = new Function(`${src.match(/function hexToHsl[\s\S]*?\n}\n/)[0]}\nreturn hexToHsl;`)();
  const pigment = new Function('hexToHsl', `return ${src.match(/const pigment = (\(hex\) => \{.*\});/)[1]};`)(hexToHsl);
  const wax = (id) => { const { f, cc } = HOUSES.find((h) => h.id === id).sigil; const best = pigment(cc) > pigment(f) ? cc : f; return pigment(best) > 0 ? best : '#7b1e17'; };
  assert.equal(wax('stark'), '#7b1e17', 'Stark arms are white and grey: oxblood');
  assert.equal(wax('lannister'), '#9c1616', 'the crimson field, not the gold lion');
  assert.equal(wax('tyrell'), '#3d7a2b', 'the green field, not the gold rose');
  assert.equal(wax('greyjoy'), '#d6ae2e', 'a black field has no pigment; the gold kraken does');
  assert.match(src, /root\.setProperty\('--wax', pigment\(best\) > 0 \? best : '#7b1e17'\)/, 'applyHouseTheme uses the same rule');
});
