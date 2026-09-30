import path from 'node:path'; import { pathToFileURL } from 'node:url';
const REPO = 'C:/wc-ai/game/latest'; const imp = (p) => import(pathToFileURL(path.join(REPO, p)).href);
const { loadSuite, worldFor } = await imp('bench/lib/interpret.js');
const lordOf = (st, pid) => { const c = st.characters[pid]; if (!c) return '?'; const h = c.house; return `${pid} (house ${h}, lord of it: ${st.houses[h]?.lord})`; };
for (const dir of ['interpret', 'interpret-holdout']) for (const suite of loadSuite(path.join(REPO, 'bench/suites', dir))) {
  const st = worldFor(suite);
  for (const it of suite.items) if (it.expect?.letter) { const c = st.characters[it.expect.letter]; const lord = c && st.houses[c.house]?.lord; if (c && lord !== it.expect.letter) console.log(`${it.id}: "${it.text.slice(0, 70)}" -> ${it.expect.letter} but house ${c.house} lord = ${lord}`); }
}
