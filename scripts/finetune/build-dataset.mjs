// Step 1 of the recipe (scripts/finetune/README.md): the training data, from the calls the game logged while it was played.
//   node scripts/finetune/build-dataset.mjs --logs <file-or-folder>[,…] --out <dir> [--kinds interpret,mind,narrate] [--max-per-kind N] [--dev 0.1] [--max-tokens 3400] [--allow-mock] [--dry-run]
// Turn the log on first (config.json `"logCalls": true`), play, and point --logs at the saves folder (or a playtest's copy of one): every `llm-calls.jsonl` under it is read.
// Writes <out>/train.jsonl, dev.jsonl (chat examples), pairs.jsonl (preference pairs: the answer the game refused and the one it accepted) and manifest.json (counts only — no prompts, no replies). Reads nothing but the logs; calls no model.
import fs from 'node:fs';
import path from 'node:path';
import { readCalls, build, report, MAX_TOKENS } from './lib.mjs';

const args = Object.fromEntries(process.argv.slice(2).reduce((a, x, i, all) => (x.startsWith('--') ? [...a, [x.slice(2), all[i + 1] && !all[i + 1].startsWith('--') ? all[i + 1] : true]] : a), []));
if (typeof args.logs !== 'string') { console.log('node scripts/finetune/build-dataset.mjs --logs <file-or-folder>[,…] --out <dir> [--kinds interpret,mind] [--max-per-kind N] [--dev 0.1] [--max-tokens 3400] [--allow-mock] [--dry-run]'); process.exit(2); }

const { entries, files, bad } = readCalls(args.logs.split(',').map((p) => path.resolve(p.trim())).filter(Boolean));
if (!files.length) { console.error('No llm-calls.jsonl found there. Turn on "logCalls": true in config.json, play, and point --logs at the saves folder.'); process.exit(1); }
const r = build(entries, {
  kinds: typeof args.kinds === 'string' ? args.kinds.split(',') : null, maxPerKind: Number.isFinite(+args['max-per-kind']) ? +args['max-per-kind'] : Infinity,
  dev: Number.isFinite(+args.dev) ? +args.dev : 0.1, allowMock: !!args['allow-mock'], maxTokens: Number.isFinite(+args['max-tokens']) ? +args['max-tokens'] : MAX_TOKENS,
});
const text = report(r.stats, { files, bad });
console.log(text);
if (args['dry-run']) { console.log('(a dry run: nothing was written)'); process.exit(0); }
if (typeof args.out !== 'string') { console.error('--out <dir> is needed to write the dataset (or --dry-run to only count).'); process.exit(2); }
const out = path.resolve(args.out); fs.mkdirSync(out, { recursive: true });
const jsonl = (xs) => xs.map((x) => JSON.stringify(x)).join('\n') + (xs.length ? '\n' : '');
fs.writeFileSync(path.join(out, 'train.jsonl'), jsonl(r.train)); fs.writeFileSync(path.join(out, 'dev.jsonl'), jsonl(r.dev)); fs.writeFileSync(path.join(out, 'pairs.jsonl'), jsonl(r.pairs));
fs.writeFileSync(path.join(out, 'manifest.json'), JSON.stringify({ made: new Date().toISOString(), files: files.length, ...r.stats, train: r.train.length, dev: r.dev.length }, null, 2) + '\n');
fs.writeFileSync(path.join(out, 'REPORT.md'), text);
console.log(`Written to ${out}: train ${r.train.length}, dev ${r.dev.length}, pairs ${r.pairs.length}.`);
