// The replay provider (docs/gdd/04-ai-system.md §14): recorded real-model replies, played back by a fingerprint of the
// call's salient context (a call's `fingerprint(ctx)`), so tests exercise the real models' quirks — the prefix pitfall,
// the CJK leak, over-long strings, a wrong but legal choice — without a model. Fixtures live in
// tests/fixtures/model/<kind>/*.json as { kind, fingerprint, model, note, reply } (reply: the raw text the model wrote).
// A call with no recording falls through to the mock.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { mockReply } from './mock.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
export const REPLAY_DIR = process.env.WC_REPLAY_DIR || path.join(ROOT, 'tests', 'fixtures', 'model');
const cache = new Map(); // kind → [fixture]
function fixtures(kind, dir) {
  const key = `${dir}|${kind}`; if (cache.has(key)) return cache.get(key);
  const d = path.join(dir, kind); const list = [];
  if (fs.existsSync(d)) for (const f of fs.readdirSync(d).sort()) if (f.endsWith('.json')) { try { list.push({ file: f, ...JSON.parse(fs.readFileSync(path.join(d, f), 'utf8')) }); } catch { /* a broken fixture is skipped */ } }
  cache.set(key, list); return list;
}
export async function replayReply({ kind, call, ctx, dir = REPLAY_DIR }) {
  const fp = call.fingerprint ? call.fingerprint(ctx) : null;
  const hit = fp != null && fixtures(kind, dir).find((f) => f.fingerprint === fp);
  if (hit) return { text: typeof hit.reply === 'string' ? hit.reply : JSON.stringify(hit.reply), ms: 0, usage: null, model: `replay:${hit.model || 'recorded'}`, finish: 'stop', fixture: hit.file };
  return mockReply({ call, ctx });
}
export const clearReplayCache = () => cache.clear();
