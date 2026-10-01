import { REPO as ROOT, HERE } from './paths.mjs';
import path from 'node:path';
// Runs sweep-soak.mjs for a list of houses, four at a time.
import { spawn } from 'node:child_process'; import os from 'node:os';
const REPO = ROOT + '/';
const big = ['stark', 'lannister', 'targaryen', 'baratheon', 'baratheon_se', 'baratheon_ds', 'tully', 'arryn', 'tyrell', 'martell', 'greyjoy', 'nights_watch', 'free_folk', 'dothraki'];
const major = ['velaryon', 'bolton', 'karstark', 'umber', 'manderly', 'frey', 'blackwood', 'mallister', 'hightower', 'redwyne', 'florent', 'dayne', 'marbrand', 'royce'];
const minor = ['mormont', 'glover', 'reed', 'flint', 'locke', 'forrester', 'cerwyn', 'brax', 'westerling', 'clegane', 'celtigar', 'hayford', 'stokeworth', 'lannisport', 'flint_finger', 'magnar', 'stane'];
const odd = ['braavos', 'pentos', 'volantis', 'golden_company', 'second_sons', 'stone_crows', 'thenns'];
const jobs = [...big.map((h) => [h, '30d', 30]), ...major.map((h) => [h, '30d', 24]), ...minor.map((h) => [h, '30d', 24]), ...odd.map((h) => [h, '30d', 18]),
  ...['stark', 'lannister', 'tully', 'greyjoy', 'bolton', 'targaryen'].map((h) => [h, '7d', 30])];
let next = 0, running = 0; const T0 = Date.now();
const go = () => {
  while (running < 3 && next < jobs.length) {
    const [h, span, turns] = jobs[next]; const seed = 100 + next; next++; running++;
    const p = spawn(process.execPath, [path.join(HERE, 'sweep-soak.mjs'), h, String(span === '7d' ? seed + 500 : seed), String(turns), span, REPO], { stdio: ['ignore', 'pipe', 'pipe'] });
    try { os.setPriority(p.pid, os.constants.priority.PRIORITY_BELOW_NORMAL); } catch { /* */ } let out = ''; p.stdout.on('data', (d) => (out += d)); p.stderr.on('data', (d) => (out += d));
    p.on('close', () => { running--; console.log(`[${Math.round((Date.now() - T0) / 60000)}m] ${h} ${span}: ${out.trim().split('\n').at(-1).slice(0, 220)}`); go(); });
  }
};
go();
