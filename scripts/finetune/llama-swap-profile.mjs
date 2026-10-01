// Step 4 of the recipe (scripts/finetune/README.md): the llama-swap entry that serves the base model with the new adapter, in the shape the owner's own entries already have (docs/local-ai/deploy/llama-swap-maester.yaml), and the game's routing for it.
//   node scripts/finetune/llama-swap-profile.mjs --id wc-tuned --server <llama-server> --model <base.gguf> --lora <adapter.gguf> [--context 65536] [--parallel 2] [--drafter <mtp.gguf>] [--json]
// Prints YAML for the `models:` block of llama-swap's config.yaml (nothing is applied). One server process, two ids: `<id>` with the adapter on, `<id>:plain` with it off (scale 0: the base as it was), so a call the tuning did not help can be routed to
// the plain one without a second copy in memory. The context is 64k — the only size the game recommends: a bigger one costs the VRAM the cache needs and the speed with it. The adapter is never merged into a 4-bit base (the effect disappears).
const args = Object.fromEntries(process.argv.slice(2).reduce((a, x, i, all) => (x.startsWith('--') ? [...a, [x.slice(2), all[i + 1] && !all[i + 1].startsWith('--') ? all[i + 1] : true]] : a), []));
const need = ['server', 'model', 'lora'].filter((k) => typeof args[k] !== 'string');
if (need.length) { console.log('node scripts/finetune/llama-swap-profile.mjs --id wc-tuned --server <llama-server> --model <base.gguf> --lora <adapter.gguf> [--context 65536] [--parallel 2] [--drafter <mtp.gguf>] [--json]'); process.exit(2); }
const context = Number(args.context) || 65536;
if (context !== 65536) { console.error(`The game's profiles are 64k (65536); ${context} is not one. A larger context takes the VRAM the cache needs, and the speed with it.`); process.exit(2); }
const id = typeof args.id === 'string' ? args.id : 'wc-tuned'; const parallel = Number(args.parallel) || 2;
const q = (p) => String(p).replace(/\\/g, '/');
const cmd = [
  `${q(args.server)} --host 0.0.0.0 --port \${PORT}`, `-m ${q(args.model)}`, `--lora ${q(args.lora)}`,
  `-c ${context} -ngl 99 -fa on -ctk q8_0 -ctv q8_0`, `-ub 1024 -b 2048 --parallel ${parallel} --kv-unified -cram 4096`,
  '--jinja --cont-batching --metrics',
  ...(typeof args.drafter === 'string' ? [`--spec-type draft-mtp --spec-draft-model ${q(args.drafter)} --spec-draft-n-max 3`] : []),
];
const routing = {
  _comment: 'Merge into the game\'s config.json: the tuned id for the calls the tuning helped, the plain one for the rest (decide by the bench, before and after).',
  allowModelSwaps: true, contextTokens: context,
  models: { default: { model: id, slot: null }, narrate: { model: `${id}:plain`, slot: null }, letter: { model: `${id}:plain`, slot: null }, advisor: { model: `${id}:plain`, slot: null }, counsel: { model: `${id}:plain`, slot: null } },
};
if (args.json) { console.log(JSON.stringify({ id, context, parallel, cmd: cmd.join(' '), routing })); process.exit(0); }
console.log(`# llama-swap entry — add under models: and add "${id}" to the members of your GPU group. Nothing here is applied for you.
  "${id}":
    name: "the game's model with the new adapter (64k, ${parallel} slots)"
    description: "Base model + the adapter, unmerged; '${id}:plain' is the same process with the adapter off."
    cmd: >
${cmd.map((l) => `      ${l}`).join('\n')}
    filters:
      setParamsByID:
        "\${MODEL_ID}":
          lora: [{id: 0, scale: 1.0}]
        "\${MODEL_ID}:plain":
          lora: [{id: 0, scale: 0.0}]
    ttl: 1800
    capabilities: { in: ["text"], out: ["text"], context: ${context} }

# The game's routing (config.json), then bench before and after: npm run bench -- --suite interpret,mind,narrate,audience,latency
${JSON.stringify(routing, null, 2)}`);
