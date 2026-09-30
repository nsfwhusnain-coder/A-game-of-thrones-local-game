// Scan every model reply in a run for (1) non-Latin script and (2) knowledge from after 298 AC, in ALL text the model wrote —
// narration scenes and, importantly, the minds' free text (`with`, `public_face`, `secret_aim`, `line`), which the game's mind
// validator does not check for spoilers. Uses the game's own anachronism list on a fresh 298 AC world, plus extra patterns.
//   node leaks.mjs results/<label> 
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { REPO, HOME, RESULTS, CORPUS, SPEED, LOGS } from './paths.mjs';

const dir = process.argv[2];
const imp = (rel) => import(pathToFileURL(path.join(REPO, rel)).href);
const { anachronismsIn } = await imp('public/data/anachronisms.js');
const { createInitialState } = await imp('public/js/shared/world.js');
const { hasForeignScript, strings } = await imp('server/ai/schema.js');
const state = createInitialState('agot_298', 'stark', { seed: 298 });
// later-chapter names and events the game's list does not cover (checked as whole words, case-insensitive)
const EXTRA = [/\bred keep is\b/i, /\bfrey pie\b/i, /\bhodor\b.*\bhold the door\b/i, /\bbattle of the bastards\b/i, /\bwildfire\b.*\bblackwater\b/i, /\bsons of the harpy\b/i, /\bwinter is here\b/i, /\bnight king\b/i, /\bmountain that rides\b.*\bdead\b/i, /\bgreen fork\b/i, /\bwhispering wood\b/i, /\bstannis (?:is|was) king\b/i, /\bking stannis\b/i, /\bking renly\b/i, /\bqueen cersei\b/i, /\bking tommen\b/i, /\bking robb\b/i, /\bking joffrey\b/i, /\bhand of the queen\b/i, /\blord commander jon\b/i, /\bthe kingslayer'?s (?:hand|sword hand)\b/i, /\bwhite walkers?\b.*\bmarch/i, /\bblackfyre\b/i];
const res = { replies: 0, foreignScript: [], anachronisms: [], extra: [], byKind: {} };
const wf = path.join(dir, 'wire.jsonl');
for (const l of fs.readFileSync(wf, 'utf8').split('\n').filter(Boolean)) {
  const r = JSON.parse(l); if (r.status !== 200 || !r.content) continue;
  let v; try { v = JSON.parse(r.content); } catch { continue; }
  res.replies++; const texts = strings(v).join(' \n ');
  const k = res.byKind[r.kind] = res.byKind[r.kind] || { replies: 0, foreign: 0, anachronism: 0, extra: 0 }; k.replies++;
  if (hasForeignScript(texts)) { res.foreignScript.push({ kind: r.kind, text: texts.match(/.{0,30}[^\u0000-\u024F\u2000-\u206F].{0,30}/u)?.[0] }); k.foreign++; }
  const an = anachronismsIn(state, texts); if (an.length) { res.anachronisms.push({ kind: r.kind, hits: an.map((x) => x.phrase) }); k.anachronism++; }
  const ex = EXTRA.filter((re) => re.test(texts)); if (ex.length) { res.extra.push({ kind: r.kind, hits: ex.map(String) }); k.extra++; }
}
fs.writeFileSync(path.join(dir, 'leaks.json'), JSON.stringify(res, null, 1));
console.log(path.basename(dir), 'replies', res.replies, '| foreign-script replies', res.foreignScript.length, '| anachronism replies', res.anachronisms.length, '| extra-future replies', res.extra.length, '| by kind', JSON.stringify(res.byKind));
for (const x of [...res.foreignScript.slice(0, 3), ...res.anachronisms.slice(0, 5), ...res.extra.slice(0, 3)]) console.log('  ', JSON.stringify(x).slice(0, 200));
