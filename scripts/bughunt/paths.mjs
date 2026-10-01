// Where the bug-hunt harnesses find the game and put what they write.
//   WC_REPO  the checkout to test (default: the repo this file is in)
//   BH_OUT   where reports and screenshots go (default: <repo>/.bughunt-out, which git ignores)
import fs from 'node:fs'; import path from 'node:path'; import { fileURLToPath } from 'node:url';
const slash = (p) => p.split(path.sep).join('/');
export const HERE = slash(path.dirname(fileURLToPath(import.meta.url)));
export const REPO = slash(path.resolve(process.env.WC_REPO || path.join(HERE, '..', '..')));
export const BH_OUT = slash(path.resolve(process.env.BH_OUT || path.join(REPO, '.bughunt-out')));
fs.mkdirSync(BH_OUT, { recursive: true });
/** A path under the output folder. */
export const out = (...parts) => { const p = slash(path.join(BH_OUT, ...parts)); fs.mkdirSync(path.dirname(p), { recursive: true }); return p; };
