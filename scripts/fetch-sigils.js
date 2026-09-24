// Downloads the real house sigil artwork from A Wiki of Ice and Fire into public/assets/sigils/
// for your LOCAL copy of the game. Run from your own machine:  npm run fetch-sigils
// The images belong to their artists / the wiki (CC BY-SA); they are not committed to the repo.
import fs from 'node:fs';
import path from 'node:path';
import { HOUSES } from '../public/data/houses.js';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const OUT = path.join(ROOT, 'public', 'assets', 'sigils');
const API = 'https://awoiaf.westeros.org/api.php';
const UA = { 'User-Agent': 'WesterosChronicles/0.2 (local fan game; sigil fetch)' };
fs.mkdirSync(OUT, { recursive: true });

const TITLE_OVERRIDES = {
  martell: 'House Nymeros Martell', baratheon: "House Baratheon of King's Landing", baratheon_ds: 'House Baratheon of Dragonstone',
  baratheon_se: "House Baratheon of Storm's End", royce_gates: 'House Royce of the Gates of the Moon', lannisport: 'House Lannister of Lannisport',
  nights_watch: "Night's Watch", golden_company: 'Golden Company', free_folk: null, dothraki: null,
  braavos: null, pentos: null, myr: null, tyrosh: null, lys: null, lorath: null, norvos: null, qohor: null, volantis: null,
};

async function q(params) {
  const url = API + '?' + new URLSearchParams({ format: 'json', redirects: '1', ...params });
  const r = await fetch(url, { headers: UA }); if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.json();
}
async function imageFor(title) {
  // 1) PageImages (infobox image)
  try {
    const d = await q({ action: 'query', prop: 'pageimages', piprop: 'thumbnail|original', pithumbsize: '300', titles: title });
    const page = Object.values(d.query?.pages || {})[0];
    if (page?.thumbnail?.source) return page.thumbnail.source;
    if (page?.original?.source) return page.original.source;
  } catch { /* fall through */ }
  // 2) First sensible image on the page
  const d = await q({ action: 'parse', page: title, prop: 'images' });
  const imgs = (d.parse?.images || []).filter((f) => /house|sigil|arms|coat/i.test(f) && !/icon|map|flag_of|portrait/i.test(f));
  if (!imgs.length) return null;
  const info = await q({ action: 'query', prop: 'imageinfo', iiprop: 'url', iiurlwidth: '300', titles: 'File:' + imgs[0] });
  const p = Object.values(info.query?.pages || {})[0];
  return p?.imageinfo?.[0]?.thumburl || p?.imageinfo?.[0]?.url || null;
}

const index = {};
let ok = 0, miss = 0;
for (const h of HOUSES) {
  const title = h.id in TITLE_OVERRIDES ? TITLE_OVERRIDES[h.id] : `House ${h.name}`;
  if (!title) continue;
  try {
    const src = await imageFor(title);
    if (!src) { miss++; console.log('  – no image for', title); continue; }
    const r = await fetch(src, { headers: UA }); if (!r.ok) throw new Error('HTTP ' + r.status);
    const ext = (src.match(/\.(png|jpe?g|svg|webp|gif)(?:$|\?)/i)?.[1] || 'png').toLowerCase();
    const file = `${h.id}.${ext}`;
    fs.writeFileSync(path.join(OUT, file), Buffer.from(await r.arrayBuffer()));
    index[h.id] = file; ok++;
    console.log('  ✔', title);
  } catch (e) { miss++; console.log('  ✖', title, e.message); }
  await new Promise((res) => setTimeout(res, 250)); // be polite to the wiki
}
fs.writeFileSync(path.join(OUT, 'index.json'), JSON.stringify(index, null, 2));
console.log(`\nDone: ${ok} sigils saved to public/assets/sigils (${miss} not found — those keep procedural heraldry).`);
