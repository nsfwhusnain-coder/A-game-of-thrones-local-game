// The mind suite (docs/gdd/04-ai-system.md §13): situations from the books' world — a son seized, a castle besieged,
// an enemy at the gates, a host idle in war, peace and full coffers, winter coming, an empty treasury, a prisoner in
// the cells, the liege's call — each with the responses that are in character for the lord facing it. A reader is
// anything that turns (state, actor) into a choice { verb, params }: the house's ways, or the mind call on a model, a
// mock or recorded replies. Scores: in character (the verb is one of the acceptable), lawful (the verb's legal() allows
// it), and how the choices spread.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createInitialState, applyChanges } from '../../public/js/shared/world.js';
import { withRng } from '../../public/js/engine/rng.js';
import { intentFor, check } from '../../public/js/engine/actions/registry.js';
import { HOLD } from '../../public/js/engine/minds/options.js';

const DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'suites', 'mind');

/** The suite's files: [{ file, about, items: [{ id, actor, player, situation, setup, acceptable, note }] }]. */
export function loadMindSuite(dir = DIR) {
  return fs.readdirSync(dir).filter((f) => f.endsWith('.json')).sort().map((f) => ({ file: f.replace(/\.json$/, ''), ...JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')) }));
}

/** The world a situation is faced in: a game begun as `player`, with the situation's setup (fixed dice). */
export function worldForSituation(item) {
  const s = createInitialState('agot_298', item.player || 'stark', { seed: 298 });
  withRng(s, () => { const r = applyChanges(s, item.setup || [], { source: 'The bench' }); if (r.rejected?.length) throw new Error(`${item.id}: setup refused — ${r.rejected.map((x) => x.reason).join('; ')}`); });
  s.facts = [];
  return s;
}

/**
 * Face every situation with `read(state, actor, item) → { verb, params }` (sync or async) and score it.
 * Returns { total, inCharacter, lawful, byFile: { file: [ok, of] }, verbs: { verb: n }, misses: [...], ms }.
 */
export async function runMindSuite(read, { suites = loadMindSuite(), only = null } = {}) {
  const out = { total: 0, inCharacter: 0, lawful: 0, byFile: {}, verbs: {}, misses: [], ms: 0 };
  for (const suite of suites) {
    if (only && !only.includes(suite.file)) continue;
    const f = out.byFile[suite.file] = [0, 0];
    for (const item of suite.items) {
      const state = worldForSituation(item);
      const t0 = Date.now();
      const got = await withRng(state, () => read(state, item.actor, item));
      out.ms += Date.now() - t0;
      const ok = item.acceptable.includes(got.verb);
      const lawful = got.verb === HOLD || !check(state, intentFor(state, got.verb, { actor: item.actor, house: state.characters[item.actor].house, params: got.params || {} }));
      out.total++; f[1]++; if (ok) { out.inCharacter++; f[0]++; } if (lawful) out.lawful++;
      out.verbs[got.verb] = (out.verbs[got.verb] || 0) + 1;
      if (!ok || !lawful) out.misses.push({ id: item.id, situation: item.situation, acceptable: item.acceptable, got: got.verb, params: got.params, lawful, ...(got.via ? { via: got.via } : {}) });
    }
  }
  return out;
}

/** The report of 04 §13, in markdown. */
export function mindReport(r, { reader = '' } = {}) {
  const pct = (a, b) => (b ? `${Math.round((100 * a) / b)} %` : '—');
  const lines = [`# Mind suite${reader ? ` — ${reader}` : ''}`, '',
    '| measure | value | gate |', '|---|---|---|',
    `| in character | ${r.inCharacter} / ${r.total} (${pct(r.inCharacter, r.total)}) | ≥ 85 % (model) |`,
    `| lawful | ${r.lawful} / ${r.total} (${pct(r.lawful, r.total)}) | 100 % |`,
    `| time | ${(r.ms / 1000).toFixed(1)} s (${Math.round(r.ms / Math.max(1, r.total))} ms a mind) | — |`, '',
    '| situations | in character |', '|---|---|', ...Object.entries(r.byFile).map(([k, [a, b]]) => `| ${k} | ${a} / ${b} |`), '',
    `Choices: ${Object.entries(r.verbs).sort((a, b) => b[1] - a[1]).map(([v, n]) => `${v} ${n}`).join(' · ')}`, ''];
  if (r.misses.length) {
    lines.push(`## Out of character or unlawful (${r.misses.length})`, '');
    for (const m of r.misses) lines.push(`- \`${m.id}\` ${m.situation} — chose **${m.got}**${m.lawful ? '' : ' (unlawful)'}; in character: ${m.acceptable.join(', ')}`);
  }
  return lines.join('\n') + '\n';
}
