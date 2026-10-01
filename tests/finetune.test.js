// The fine-tune recipe's dry run (docs/gdd/04-ai-system.md §11.4; scripts/finetune/README.md; WP H4): no training, no GPU, no model. A tiny fixture log (scripts/finetune/fixtures) goes through the dataset builder, the trainer's dry run (if there is a Python),
// the GGUF export's plan and the llama-swap profile. What is proved: the labeller is the game (only replies its own checks accepted, from a live model, clean of a foreign script, a game word, a phrase from after 298, and short enough);
// a refused answer and the accepted retry make a preference pair; the dev split is by prompt; nothing of a prompt or a reply leaves through the manifest; and the profile is 64k and unmerged.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFile, spawnSync } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIR = path.join(ROOT, 'scripts', 'finetune');
const FIX = path.join(DIR, 'fixtures', 'saves');
const run = promisify(execFile);
const L = await import('../scripts/finetune/lib.mjs');
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'wc-finetune-'));
const node = (script, args, o = {}) => run(process.execPath, [path.join(DIR, script), ...args], { cwd: ROOT, ...o }).catch((e) => e);
const python = ['python', 'python3'].find((p) => spawnSync(p, ['--version'], { stdio: 'ignore' }).status === 0) || null; // (the trainer's dry run needs one; if there is none the test says so and skips)

test('the fixture log is read: every line of a save, the broken one counted and skipped, in time order', () => {
  const r = L.readCalls([FIX]);
  assert.equal(r.entries.length, 21); assert.equal(r.bad, 1); assert.equal(r.files.length, 1);
  assert.ok(r.entries.every((e, i) => i === 0 || String(r.entries[i - 1].t) <= String(e.t)));
  assert.equal(L.readCalls([path.join(FIX, 'nowhere')]).files.length, 0, 'a path that is not there is nothing, not an error');
});

test('the labeller is the game: what is kept, and why each of the rest is dropped', () => {
  const { entries } = L.readCalls([FIX]);
  const r = L.build(entries, { dev: 0 });
  assert.deepEqual({ interpret: r.stats.kinds.interpret.kept, mind: r.stats.kinds.mind.kept, narrate: r.stats.kinds.narrate.kept }, { interpret: 7, mind: 4, narrate: 1 });
  assert.deepEqual(r.stats.dropped, { refused: 1, 'foreign-script': 1, 'game-word': 1, 'after-298': 1, 'not-live': 1, duplicate: 2, 'not-json': 1, 'too-long': 1 });
  assert.equal(r.stats.kept, 12); assert.equal(r.train.length, 12); assert.equal(r.dev.length, 0);
  for (const ex of r.train) { assert.equal(ex.messages.at(-1).role, 'assistant'); assert.ok(ex.messages.length >= 3); JSON.parse(ex.messages.at(-1).content); assert.ok(!/[\u4e00-\u9fff]|Red Wedding|importance \d|strong\b/.test(JSON.stringify(ex))); }
  // each reason on its own
  const base = entries.find((e) => e.kind === 'mind' && e.accepted);
  assert.deepEqual(L.dropReasons(base), []);
  assert.deepEqual(L.dropReasons({ ...base, provider: 'mock' }), ['not-live']); assert.deepEqual(L.dropReasons({ ...base, provider: 'mock' }, { allowMock: true }), []);
  assert.deepEqual(L.dropReasons({ ...base, reply: '' }), ['empty']); assert.ok(L.dropReasons({ ...base, reply: 'plain words' }).includes('not-json'));
  assert.ok(L.dropReasons({ ...base, messages: [{ role: 'user', content: 'x'.repeat(20000) }] }).includes('too-long')); assert.deepEqual(L.dropReasons({ ...base, messages: [{ role: 'user', content: 'x'.repeat(20000) }] }, { maxTokens: 10000 }), []);
  // a key of the JSON is not a word the model said: only the strings are looked at
  assert.deepEqual(L.dropReasons({ ...base, reply: JSON.stringify({ importance: 3, verb: 'wait' }) }), []);
});

test('the pairs: a refused answer and the one the game accepted when it asked again, matched by prompt, with what was wrong', () => {
  const { entries } = L.readCalls([FIX]);
  const pairs = L.pairsOf(entries);
  assert.equal(pairs.length, 1); const p = pairs[0];
  assert.equal(p.kind, 'interpret'); assert.equal(p.prompt.length, 2); assert.match(p.rejected[0].content, /nobody/); assert.match(p.chosen[0].content, /jon_snow/); assert.deepEqual(p.problems, ['"nobody" is no one the lord knows']);
  // calls run side by side: the retry is found by its prompt, not by the line before it
  const shuffled = [entries.find((e) => e.attempt === 1), ...entries.filter((e) => e.attempt !== 1).reverse()];
  assert.equal(L.pairsOf(shuffled).length, 1);
  // a retry that was refused too, or a reply the labeller drops, makes no pair
  assert.equal(L.pairsOf(entries.map((e) => (e.attempt === 1 ? { ...e, accepted: false, problems: ['still wrong'] } : e))).length, 0);
});

test('the dev split is by prompt: the same prompt is always on the same side, about the share asked, and the pairs keep clear of the dev prompts', () => {
  const { entries } = L.readCalls([FIX]);
  const ms = [{ role: 'user', content: 'one prompt' }];
  assert.equal(L.isDev(ms, 0.5), L.isDev([...ms], 0.5)); assert.equal(L.isDev(ms, 0), false); assert.equal(L.isDev(ms, 1), true);
  const n = Array.from({ length: 2000 }, (_, i) => L.isDev([{ role: 'user', content: `prompt ${i}` }], 0.1)).filter(Boolean).length;
  assert.ok(n > 120 && n < 280, `${n} of 2000 are dev`);
  const all = L.build(entries, { dev: 1 }); assert.equal(all.train.length, 0); assert.equal(all.dev.length, 12); assert.equal(all.pairs.length, 0, 'a pair whose prompt is dev is not trained on');
  const none = L.build(entries, { dev: 0 }); assert.equal(none.pairs.length, 1);
  const some = L.build(entries, { dev: 0.3 }); assert.equal(some.train.length + some.dev.length, 12);
  for (const x of some.train) assert.ok(!some.dev.some((d) => JSON.stringify(d.messages.slice(0, -1)) === JSON.stringify(x.messages.slice(0, -1))), 'no prompt on both sides');
  assert.equal(L.build(entries, { dev: 0, maxPerKind: 2 }).train.filter((x) => x.kind === 'interpret').length, 2);
  assert.equal(L.build(entries, { dev: 0, kinds: ['mind'] }).stats.kept, 4);
});

test('the report says what each kind lacks against its target, and why things were dropped', () => {
  const { entries, files, bad } = L.readCalls([FIX]); const text = L.report(L.build(entries).stats, { files, bad });
  assert.match(text, /21 logged calls read from 1 file \(1 unreadable lines skipped\); 12 kept/); assert.match(text, /\| interpret \| 9 \| 7 \|/); assert.match(text, /\d+ short/); assert.match(text, /Dropped: duplicate 2/);
});

test('build-dataset.mjs writes the four files, and the manifest holds counts and nothing a person said', async () => {
  const out = tmp();
  const r = await node('build-dataset.mjs', ['--logs', FIX, '--out', out, '--dev', '0.2']);
  assert.ok(!r.code, r.stderr); assert.match(r.stdout, /Written to .*: train \d+, dev \d+, pairs 1/);
  for (const f of ['train.jsonl', 'dev.jsonl', 'pairs.jsonl', 'manifest.json', 'REPORT.md']) assert.ok(fs.existsSync(path.join(out, f)), f);
  const lines = (f) => fs.readFileSync(path.join(out, f), 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l));
  assert.equal(lines('train.jsonl').length + lines('dev.jsonl').length, 12); assert.equal(lines('pairs.jsonl').length, 1);
  const manifest = fs.readFileSync(path.join(out, 'manifest.json'), 'utf8');
  for (const word of ['Moat Cailin', 'Roose', 'nobody', 'jon_snow', 'steward']) assert.ok(!manifest.includes(word), `the manifest says "${word}"`);
  assert.equal(JSON.parse(manifest).kept, 12);
  // a dry run writes nothing; a folder with no log is told how to make one; no --out is told so
  const d = tmp(); const dry = await node('build-dataset.mjs', ['--logs', FIX, '--dry-run']); assert.ok(!dry.code); assert.match(dry.stdout, /nothing was written/);
  const none = await node('build-dataset.mjs', ['--logs', d]); assert.equal(none.code, 1); assert.match(none.stderr, /logCalls/);
  const noOut = await node('build-dataset.mjs', ['--logs', FIX]); assert.equal(noOut.code, 2);
  assert.equal((await node('build-dataset.mjs', [])).code, 2);
  for (const x of [out, d]) fs.rmSync(x, { recursive: true, force: true });
});

test('train.py: the dry run checks the data and prints the plan, for both stages, and refuses data that is not in the shape (needs a Python; CI has one)', async (t) => {
  if (!python) { t.skip('no python on this machine'); return; }
  const out = tmp(); await node('build-dataset.mjs', ['--logs', FIX, '--out', out, '--dev', '0']);
  const py = (args) => run(python, [path.join(DIR, 'train.py'), ...args], { cwd: ROOT }).catch((e) => e);
  const sft = await py(['--stage', 'sft', '--base', 'example/base', '--data', out, '--out', path.join(out, 'run'), '--config', path.join(DIR, 'config.example.json'), '--dry-run']);
  assert.ok(!sft.code, sft.stderr); const plan = JSON.parse(sft.stdout.slice(0, sft.stdout.lastIndexOf('}') + 1));
  assert.equal(plan.stage, 'sft'); assert.equal(plan.rows, 12); assert.equal(plan.lora.rank, 32); assert.equal(plan.max_seq, 3400); assert.equal(plan.effective_batch, 8); assert.equal(plan.steps, Math.ceil(12 * 2 / 8)); assert.match(sft.stdout, /nothing was trained/);
  const dpo = await py(['--stage', 'dpo', '--base', 'example/base', '--data', out, '--out', path.join(out, 'run2'), '--init-adapter', path.join(out, 'run'), '--dry-run']);
  assert.ok(!dpo.code, dpo.stderr); const p2 = JSON.parse(dpo.stdout.slice(0, dpo.stdout.lastIndexOf('}') + 1)); assert.equal(p2.stage, 'dpo'); assert.equal(p2.rows, 1); assert.equal(p2.lr, 0.000005);
  fs.writeFileSync(path.join(out, 'train.jsonl'), JSON.stringify({ kind: 'mind', messages: [{ role: 'user', content: 'a prompt with no reply' }] }) + '\n');
  const bad = await py(['--stage', 'sft', '--base', 'x', '--data', out, '--out', 'x', '--dry-run']); assert.notEqual(bad.code, 0); assert.match(String(bad.stderr), /not in the shape/);
  fs.writeFileSync(path.join(out, 'train.jsonl'), '');
  const empty = await py(['--stage', 'sft', '--base', 'x', '--data', out, '--out', 'x', '--dry-run']); assert.notEqual(empty.code, 0); assert.match(String(empty.stderr), /build the dataset first/);
  fs.rmSync(out, { recursive: true, force: true });
});

test('the llama-swap profile: one process, two ids (the adapter on and off), 64k, the adapter loaded beside the base; any other context is refused', async () => {
  const a = ['--id', 'wc-tuned', '--server', 'C:\\llama\\llama-server.exe', '--model', 'C:\\models\\base.gguf', '--lora', 'C:\\models\\adapters\\wc-1.gguf'];
  const r = await node('llama-swap-profile.mjs', a); assert.ok(!r.code, r.stderr);
  assert.match(r.stdout, /"wc-tuned":/); assert.match(r.stdout, /--lora C:\/models\/adapters\/wc-1\.gguf/); assert.match(r.stdout, /-c 65536/); assert.match(r.stdout, /--parallel 2 --kv-unified/); assert.match(r.stdout, /"\$\{MODEL_ID\}:plain":\n\s+lora: \[\{id: 0, scale: 0\.0\}\]/);
  assert.match(r.stdout, /"model": "wc-tuned:plain"/); assert.ok(!/262144|256k|-c (?!65536)\d+/.test(r.stdout));
  const j = JSON.parse((await node('llama-swap-profile.mjs', [...a, '--json', '--drafter', 'C:\\models\\mtp.gguf'])).stdout); assert.equal(j.context, 65536); assert.match(j.cmd, /--spec-draft-model C:\/models\/mtp\.gguf/); assert.equal(j.routing.contextTokens, 65536);
  const big = await node('llama-swap-profile.mjs', [...a, '--context', '262144']); assert.equal(big.code, 2); assert.match(big.stderr, /64k/);
  assert.equal((await node('llama-swap-profile.mjs', ['--id', 'x'])).code, 2);
});

test('export-gguf.mjs: it prints what it would do and checks the folders; with --run it does it and gives the file\'s SHA-256', async () => {
  const d = tmp(); const adapter = path.join(d, 'adapter'); const cpp = path.join(d, 'llama.cpp'); const out = path.join(d, 'out', 'wc.gguf');
  fs.mkdirSync(adapter); fs.mkdirSync(cpp);
  const base = ['--adapter', adapter, '--base-hf', path.join(d, 'base'), '--llama-cpp', cpp, '--out', out];
  const none = await node('export-gguf.mjs', base); assert.equal(none.code, 1); assert.match(none.stdout, /convert_lora_to_gguf\.py/);
  fs.writeFileSync(path.join(adapter, 'adapter_config.json'), '{}');
  // the converter, played by a script that writes the file it is asked for (a real one needs llama.cpp and the model)
  fs.writeFileSync(path.join(cpp, 'convert_lora_to_gguf.py'), "const a = process.argv; const f = a[a.indexOf('--outfile') + 1]; require('node:fs').writeFileSync(f, 'GGUF-FAKE');\n");
  const plan = await node('export-gguf.mjs', [...base, '--python', process.execPath]); assert.ok(!plan.code, plan.stderr); assert.match(plan.stdout, /not run: add --run/); assert.ok(!fs.existsSync(out));
  const done = await node('export-gguf.mjs', [...base, '--python', process.execPath, '--run']); assert.ok(!done.code, done.stderr + done.stdout);
  assert.ok(fs.existsSync(out)); assert.match(done.stdout, /SHA-256 [0-9a-f]{64}/); assert.match(done.stdout, /Next: node scripts\/finetune\/llama-swap-profile\.mjs/);
  assert.equal((await node('export-gguf.mjs', [])).code, 2);
  fs.rmSync(d, { recursive: true, force: true });
});
