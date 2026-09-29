// Where things live. Installed at <repo>/scripts/local-ai/ the tools work on the repo they sit in and keep their output under
// <repo>/bench/local-ai/ (git-ignored: bench/* is). Anywhere else (the author's dev layout) they use the fixed paths below.
// Override with WC_REPO (the game checkout to measure), WC_LOCALAI_HOME (where results/corpus/speed go), WC_LOGS.
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const inRepo = path.basename(here) === 'local-ai' && path.basename(path.dirname(here)) === 'scripts';
export const REPO = process.env.WC_REPO || (inRepo ? path.resolve(here, '..', '..') : 'C:/wc-ai/game/repo');
export const HOME = process.env.WC_LOCALAI_HOME || (inRepo ? path.join(REPO, 'bench', 'local-ai') : 'C:/wc-ai/eval');
export const RESULTS = path.join(HOME, 'results');
export const CORPUS = path.join(HOME, 'corpus');
export const SPEED = path.join(HOME, 'speed');
export const LOGS = process.env.WC_LOGS || (inRepo ? path.join(HOME, 'logs') : 'C:/wc-ai/logs');
