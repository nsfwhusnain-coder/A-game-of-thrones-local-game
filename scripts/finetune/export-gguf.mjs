// Step 3 of the recipe (scripts/finetune/README.md): the trained adapter as a GGUF file llama.cpp loads beside the base (`--lora`).
//   node scripts/finetune/export-gguf.mjs --adapter <peft dir> --base-hf <the base model's folder> --llama-cpp <llama.cpp checkout or build> --out <adapter.gguf> [--outtype f16] [--python python] [--run]
// Without --run it only prints the commands and where each reads and writes (so they can be read first); with --run it does them and prints the file's SHA-256 for the owner's records. The conversion is llama.cpp's own `convert_lora_to_gguf.py`
// (the same step the owner's existing adapter went through: docs/local-ai/deploy/ADAPTER.md). The adapter is not merged into a 4-bit base: the effect disappears; it is loaded beside it.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';

const args = Object.fromEntries(process.argv.slice(2).reduce((a, x, i, all) => (x.startsWith('--') ? [...a, [x.slice(2), all[i + 1] && !all[i + 1].startsWith('--') ? all[i + 1] : true]] : a), []));
const need = ['adapter', 'base-hf', 'llama-cpp', 'out'].filter((k) => typeof args[k] !== 'string');
if (need.length) { console.log('node scripts/finetune/export-gguf.mjs --adapter <peft dir> --base-hf <base model folder> --llama-cpp <llama.cpp dir> --out <adapter.gguf> [--outtype f16] [--python python] [--run]'); process.exit(2); }
const py = typeof args.python === 'string' ? args.python : 'python';
const script = path.join(path.resolve(args['llama-cpp']), 'convert_lora_to_gguf.py');
const steps = [
  { what: 'convert the adapter to GGUF', cmd: py, argv: [script, '--base', path.resolve(args['base-hf']), '--outtype', typeof args.outtype === 'string' ? args.outtype : 'f16', '--outfile', path.resolve(args.out), path.resolve(args.adapter)] },
];
const problems = [];
if (!fs.existsSync(path.join(path.resolve(args.adapter), 'adapter_config.json'))) problems.push(`${args.adapter} has no adapter_config.json: it is not a PEFT adapter folder (train.py writes one)`);
if (!fs.existsSync(script)) problems.push(`${script} is not there: --llama-cpp is the llama.cpp checkout (convert_lora_to_gguf.py sits at its top)`);
console.log(steps.map((s, i) => `${i + 1}. ${s.what}\n   ${s.cmd} ${s.argv.map((a) => (/\s/.test(a) ? `"${a}"` : a)).join(' ')}`).join('\n'));
if (!args.run) { console.log('\n(not run: add --run to do it)'); process.exit(problems.length ? 1 : 0); }
if (problems.length) { console.error(`\n${problems.join('\n')}`); process.exit(1); }
fs.mkdirSync(path.dirname(path.resolve(args.out)), { recursive: true });
for (const s of steps) { const r = spawnSync(s.cmd, s.argv, { stdio: 'inherit' }); if (r.status !== 0) { console.error(`\n"${s.what}" failed (${r.status ?? r.error?.message}).`); process.exit(1); } }
const sha = crypto.createHash('sha256').update(fs.readFileSync(path.resolve(args.out))).digest('hex');
console.log(`\n${path.resolve(args.out)}\n${(fs.statSync(path.resolve(args.out)).size / 1e6).toFixed(0)} MB, SHA-256 ${sha}\nNext: node scripts/finetune/llama-swap-profile.mjs --lora ${args.out} --model <base.gguf> --server <llama-server>`);
