// Turn a wire.jsonl into a replay corpus: N real requests per call kind, spread over the prompt-size range, so every model
// is speed-tested on the SAME real prompts (messages + schema + sampler fields as the game sent them).
//   node extract-corpus.mjs results/<label>/wire.jsonl [--per 8] [--out C:\wc-ai\eval\corpus]
import fs from 'node:fs';
import path from 'node:path';
import { REPO, HOME, RESULTS, CORPUS, SPEED, LOGS } from './paths.mjs';

const file = process.argv[2]; const a = Object.fromEntries(process.argv.slice(3).reduce((acc, x, i, all) => (x.startsWith('--') ? [...acc, [x.slice(2), all[i + 1]]] : acc), []));
const per = Number(a.per || 8); const out = a.out || CORPUS; fs.mkdirSync(out, { recursive: true });
const rows = fs.readFileSync(file, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l)).filter((r) => r.status === 200 && r.messages && r.schema && !/^That answer cannot be used/.test(String(r.messages.at(-1)?.content)));
const by = {}; for (const r of rows) (by[r.kind] = by[r.kind] || []).push(r);
for (const [kind, list] of Object.entries(by)) {
  list.sort((x, y) => (x.usage?.prompt_tokens || x.msg_chars) - (y.usage?.prompt_tokens || y.msg_chars));
  const pick = Array.from({ length: Math.min(per, list.length) }, (_, i) => list[Math.floor((i + 0.5) * list.length / Math.min(per, list.length))]);
  fs.writeFileSync(path.join(out, `${kind}.jsonl`), pick.map((r) => JSON.stringify({ kind, messages: r.messages, schema: r.schema, temperature: r.temp, max_tokens: r.max_tokens, slot: r.slot, prompt_tokens: r.usage?.prompt_tokens, completion_tokens: r.usage?.completion_tokens })).join('\n') + '\n');
  console.log(kind, pick.length, 'requests; prompt tokens', pick.map((r) => r.usage?.prompt_tokens).join(','));
}
