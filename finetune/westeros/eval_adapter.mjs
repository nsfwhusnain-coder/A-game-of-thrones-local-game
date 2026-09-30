// Convert a downloaded LoRA adapter to GGUF, make a server spec with it ALWAYS ON, and queue the game's suites (protected chain runner).
//   node eval_adapter.mjs --name p1A --adapter C:/wc-ai/finetune/runs/p1A [--suites interpret,holdout,mind] [--repo C:/wc-ai/game/repo] [--more narrate,voices]
// The adapter dir needs adapter_model.safetensors + adapter_config.json. Results land in eval/results/gemma12-lora-<name>[-more].
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync, spawn } from 'node:child_process';

const a = Object.fromEntries(process.argv.slice(2).reduce((acc, x, i, all) => (x.startsWith('--') ? [...acc, [x.slice(2), all[i + 1] && !all[i + 1].startsWith('--') ? all[i + 1] : true]] : acc), []));
const name = a.name; const dir = a.adapter; const suites = a.suites || 'interpret,holdout,mind'; const repo = a.repo || 'C:/wc-ai/game/repo'; const more = a.more === true ? 'narrate,voices' : a.more;
if (!name || !dir) { console.error('need --name and --adapter'); process.exit(1); }
const gguf = `C:/wc-ai/finetune/runs/${name}/gguf/${name}-lora-f16.gguf`; fs.mkdirSync(path.dirname(gguf), { recursive: true });
if (!fs.existsSync(gguf)) {
  console.log('converting adapter to GGUF (CPU)...');
  const r = spawnSync('C:/wc-ai/finetune/.venv-conv/Scripts/python.exe', ['C:/wc-ai/src/llama.cpp-b11242/convert_lora_to_gguf.py', '--base-model-id', 'unsloth/gemma-4-12b-it', '--outtype', 'f16', '--outfile', gguf, dir],
    { encoding: 'utf8', env: { ...process.env, CUDA_VISIBLE_DEVICES: '-1', HF_HUB_DISABLE_TELEMETRY: '1' } });
  if (r.status !== 0) { console.error((r.stderr || '').slice(-1500)); process.exit(2); }
}
console.log('gguf:', gguf, (fs.statSync(gguf).size / 1e6).toFixed(0), 'MB');
const base = JSON.parse(fs.readFileSync('C:/wc-ai/eval/specs/gemma12-64k-new.json', 'utf8'));
const spec = { ...base, name: `gemma12-lora-${name}`, note: `Gemma 4 12B QAT + LoRA ${name} always on (no MTP)`, args: [...base.args, '--lora', gguf] };
fs.writeFileSync(`C:/wc-ai/eval/specs/${spec.name}.json`, JSON.stringify(spec, null, 2));
const steps = [{ name: `lora-${name}`, args: ['run-candidate.mjs', '--spec', `specs/${spec.name}.json`, '--repo', repo, '--suites', suites], timeoutMin: 90 }];
if (more) steps.push({ name: `lora-${name}-more`, args: ['run-candidate.mjs', '--spec', `specs/${spec.name}.json`, '--name', `${spec.name}-more`, '--repo', repo, '--suites', more], timeoutMin: 120 });
const chain = `C:/wc-ai/eval/chain-eval-${name}.json`; fs.writeFileSync(chain, JSON.stringify(steps, null, 1));
console.log('queued', chain, '(starts when the GPU is free)');
spawn('bash', ['./wait-then-chain.sh', path.basename(chain)], { cwd: 'C:/wc-ai/eval', detached: true, stdio: 'ignore' }).unref();
