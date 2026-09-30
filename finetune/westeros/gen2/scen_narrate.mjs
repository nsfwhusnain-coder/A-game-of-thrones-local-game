// Narrate scenarios: weeks of games played on the mock, told exactly as the live narrator (server/narrator.js narrateTurn) tells
// them. The FIRST telling of a week is the training sample; it is kept only if every story in it passed the game's validator
// (no retries, nothing plain) and it is clean of foreign script / anachronism / spoilers. Games use seeds and houses/scripts
// the narrate bench does not (its seeds are 5–298; these start at 40000).
import { walk } from './scen_walk.mjs';

export async function* weeks(G, { seedBase = 40000, games = 24, turns = 8 } = {}) {
  const { narrateTurn } = await G.imp('server/narrator.js');
  for await (const w of walk(G, { seedBase, games, turns })) {
    const n0 = w.t.narration || { groups: [], small: [] };
    const cards = [...n0.groups.map((facts) => ({ facts, text: '' })), ...(n0.small || []).map((text) => ({ bg: true, text }))];
    if (!n0.groups.length) continue;
    yield {
      id: `narrate-${w.id}`, kind: 'narrate', state: w.state, meta: { source: 'mock-game', house: w.house, seed: w.seed, turn: w.turn, groups: n0.groups.length },
      // the driver calls this instead of building a prompt itself: the game's own narrateTurn decides the stories and the prompt
      custom: async (cfg, provider) => {
        let first = null;
        const log = (kind, msgs, text) => { if (!first && kind === 'narrate') first = { messages: msgs, text }; };
        const r = await narrateTurn(w.state, cards, { provider, cfg, log });
        const rec = r.record || {};
        if (!rec.stories) return { empty: true };
        const clean = (provider === 'mock' || rec.via === 'model') && !rec.again && !rec.plain && !Object.keys(rec.problems || {}).length;
        return { first, clean, problems: rec.problems || {}, stories: rec.stories };
      },
    };
  }
}
