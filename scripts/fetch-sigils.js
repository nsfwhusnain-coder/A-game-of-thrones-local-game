// Downloads real house sigil artwork into public/assets/sigils/ for your LOCAL copy of the game.
//   npm run fetch-sigils
// Sources (tried in order): the Game of Thrones Fandom wiki, then A Wiki of Ice and Fire.
// Wikis rate-limit scripts, so this goes slowly (~1 request/second) and retries politely.
// Re-running skips sigils you already have. The images belong to their artists; they are not committed.
import fs from 'node:fs';
import path from 'node:path';
import { HOUSES } from '../public/data/houses.js';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const OUT = path.join(ROOT, 'public', 'assets', 'sigils');
fs.mkdirSync(OUT, { recursive: true });
const INDEX = path.join(OUT, 'index.json');
const index = fs.existsSync(INDEX) ? JSON.parse(fs.readFileSync(INDEX, 'utf8')) : {};

const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0 Safari/537.36',
  Accept: 'application/json,image/*,*/*;q=0.8',
};
const SOURCES = [
  { name: 'Fandom', api: 'https://gameofthrones.fandom.com/api.php' },
  { name: 'AWOIAF', api: 'https://awoiaf.westeros.org/api.php' },
];
const TITLE_OVERRIDES = {
  martell: ['House Martell', 'House Nymeros Martell'], baratheon: ['House Baratheon', "House Baratheon of King's Landing"],
  baratheon_ds: ['House Baratheon of Dragonstone'], baratheon_se: ["House Baratheon of Storm's End", 'House Baratheon'],
  royce_gates: ['House Royce of the Gates of the Moon'], lannisport: ['House Lannister of Lannisport', 'House Lannister'],
  nights_watch: ["Night's Watch"], golden_company: ['Golden Company'], free_folk: [], dothraki: [],
  braavos: [], pentos: [], myr: [], tyrosh: [], lys: [], lorath: [], norvos: [], qohor: [], volantis: [],
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function get(url, asJson = true, tries = 4) {
  for (let i = 0; i < tries; i++) {
    const r = await fetch(url, { headers: HEADERS }).catch((e) => ({ ok: false, status: 0, err: e }));
    if (r.ok) return asJson ? r.json() : Buffer.from(await r.arrayBuffer());
    if (r.status === 429 || r.status === 0 || r.status >= 500) {
      const wait = Number(r.headers?.get?.('retry-after')) * 1000 || 4000 * (i + 1);
      await sleep(wait); continue;
    }
    throw new Error('HTTP ' + r.status);
  }
  throw new Error('gave up after retries');
}
async function imageFor(api, title) {
  const qs = (p) => api + '?' + new URLSearchParams({ format: 'json', redirects: '1', origin: '*', ...p });
  const d = await get(qs({ action: 'query', prop: 'pageimages', piprop: 'thumbnail|original', pithumbsize: '300', titles: title }));
  const page = Object.values(d.query?.pages || {})[0];
  if (!page || page.missing !== undefined) return null;
  return page.thumbnail?.source || page.original?.source || null;
}

let ok = 0, miss = 0;
for (const h of HOUSES) {
  if (index[h.id] && fs.existsSync(path.join(OUT, index[h.id]))) { ok++; continue; }
  const titles = TITLE_OVERRIDES[h.id] ?? [`House ${h.name}`];
  if (!titles.length) continue;
  let saved = false;
  for (const src of SOURCES) {
    for (const t of titles) {
      try {
        const url = await imageFor(src.api, t);
        await sleep(900);
        if (!url) continue;
        const buf = await get(url, false);
        const ext = (url.match(/\.(png|jpe?g|svg|webp|gif)/i)?.[1] || 'png').toLowerCase().replace('jpeg', 'jpg');
        const file = `${h.id}.${ext}`;
        fs.writeFileSync(path.join(OUT, file), buf);
        index[h.id] = file; fs.writeFileSync(INDEX, JSON.stringify(index, null, 2));
        console.log(`  ✔ ${t}  (${src.name})`); saved = true; break;
      } catch (e) { console.log(`  · ${t} @ ${src.name}: ${e.message}`); await sleep(1500); }
    }
    if (saved) break;
  }
  if (saved) ok++; else { miss++; console.log(`  – ${h.name}: keeps drawn heraldry`); }
  await sleep(600);
}
fs.writeFileSync(INDEX, JSON.stringify(index, null, 2));
console.log(`\nDone: ${ok} sigils in public/assets/sigils, ${miss} without art (they keep the drawn heraldry). Re-run any time to fill gaps.`);
