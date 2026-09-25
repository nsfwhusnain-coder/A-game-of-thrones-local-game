// Downloads a default soundtrack into public/music/ — medieval and orchestral pieces by Kevin MacLeod
// (incompetech.com), licensed Creative Commons: By Attribution 4.0 (credits in public/music/CREDITS.txt).
// Your own music in the same folders plays alongside it; delete these to hear only yours.
//   npm run fetch-music
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const MUSIC = path.join(ROOT, 'public', 'music');
const SET = {
  title: ['Teller of the Tales', 'Moonlight Hall'],
  war: ['Five Armies', 'Clash Defiant', 'Crusade', 'Heroic Age'],
  stark: ['Achilles', 'Celtic Impulse', 'Dark Walk'],
  '.': ['Master of the Feast', 'Minstrel Guild', 'Suonatore di Liuto', 'Village Consort', 'Folk Round', 'Thatched Villagers'],
};
for (const [group, titles] of Object.entries(SET)) {
  const dir = path.join(MUSIC, group); fs.mkdirSync(dir, { recursive: true });
  for (const t of titles) {
    const file = path.join(dir, `${t} (Kevin MacLeod).mp3`);
    if (fs.existsSync(file) && fs.statSync(file).size > 100000) { console.log('have', group, t); continue; }
    const url = `https://incompetech.com/music/royalty-free/mp3-royaltyfree/${encodeURIComponent(t)}.mp3`;
    // curl: Node's fetch cannot always verify certificates on older systems
    execFileSync('curl', ['-sSL', '--fail', '-o', file, url]);
    console.log('got', group, t, Math.round(fs.statSync(file).size / 1024) + ' KB');
  }
}
console.log('Music is in', MUSIC);
