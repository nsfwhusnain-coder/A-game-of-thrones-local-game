// seat -> lord in the game's own suite worlds (what the gold orders assume for "a raven to <place>")
import path from 'node:path'; import { pathToFileURL } from 'node:url';
const REPO = 'C:/wc-ai/game/latest'; const imp = (p) => import(pathToFileURL(path.join(REPO, p)).href);
const { loadSuite, worldFor } = await imp('bench/lib/interpret.js');
const seen = {};
for (const dir of ['interpret', 'interpret-holdout']) for (const suite of loadSuite(path.join(REPO, 'bench/suites', dir))) {
  const st = worldFor(suite);
  for (const [hid, h] of Object.entries(st.houses)) if (h.seat) { const k = `${h.seat}`; (seen[k] = seen[k] || {}); const l = h.lord; seen[k][l] = (seen[k][l] || 0) + 1; }
}
console.log(JSON.stringify(seen, null, 0));
