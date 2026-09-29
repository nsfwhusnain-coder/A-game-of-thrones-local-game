import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path'; import zlib from 'node:zlib';
process.env.WC_PROVIDER = 'mock';
process.env.WC_SAVES = fs.mkdtempSync(path.join(os.tmpdir(), 'wc-audit-'));
const game = await import('/home/user/wc-s2/server/game.js');
const { realmViewFor } = await import('/home/user/wc-s2/public/js/engine/realm/view.js');
const V = await import('/home/user/wc-s2/public/js/engine/state/validate.js');
const old = JSON.parse(zlib.gunzipSync(fs.readFileSync('/home/user/wc-s2/tests/fixtures/saves/v2-stark-turn3.json.gz')));
fs.mkdirSync(path.join(process.env.WC_SAVES, 'old'), { recursive: true });
fs.writeFileSync(path.join(process.env.WC_SAVES, 'old', 'state.json'), JSON.stringify(old));
const s = game.loadState('old');
console.log('meta', s.meta.turn, s.meta.player, 'seed', s.meta.seed, 'realmStats samples', s.realmStats.samples.length, 'obs', Object.keys(s.knowledge[s.meta.player].realm || {}).length);
function walk(x, p, out) { if (typeof x === 'number') { if (!Number.isFinite(x)) out.push(p + '=' + x); } else if (Array.isArray(x)) x.forEach((y, i) => walk(y, p + '[' + i + ']', out)); else if (x && typeof x === 'object') for (const [k, v] of Object.entries(x)) walk(v, p + '.' + k, out); }
let bad = 0; for (const lens of ['strength','economy','land']) for (const scope of ['great','all','mine','war']) for (const realm of [false,true]) { const v = realmViewFor(s, s.meta.player, { lens, scope, realm }); const o = []; walk(v, 'v', o); bad += o.length; }
console.log('bad numbers', bad, 'inv12', V.validate(s).filter(x=>x.startsWith('12')).length);
// then play a turn on the old save and re-check
await game.advance('old', { span: '7d' }); await game.settled('old');
const t = game.loadState('old'); console.log('after a turn: samples', t.realmStats.samples.length, 'obs', Object.keys(t.knowledge[t.meta.player].realm||{}).length, 'inv12', V.validate(t).filter(x=>x.startsWith('12')).length);
const own = realmViewFor(t, t.meta.player, {scope:'all'}).rows.find(r=>r.house===t.meta.player); console.log('own power', own.cells.power.v, 'standing', t.standing.score);
fs.rmSync(process.env.WC_SAVES, { recursive: true, force: true });
