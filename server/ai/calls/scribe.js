// The scribe (docs/local-ai/SCRIBE.md, WP Q1): before an order is sent, a small model on the CPU puts the lord's spelling, capitals and
// punctuation right — and, for a dictated order, drops the "um"s. It is not the steward and not the maester: it never answers, obeys, adds
// or explains, and what it writes must be the same line with the slips mended (numbers and names intact, nearly the same length, nothing
// in another script). Anything else is refused, and the line stands as the plain rules (public/js/shared/scribe.js) left it; with no model, or a
// slow one, the same. It runs on a server of its own ("models": { "scribe": { "baseUrl": … } }), never the one that tells the realm's story.
import { obj, str, hasForeignScript } from '../schema.js';
import { driftOf } from '../../../public/js/shared/scribe.js';

export const INSTRUCTIONS = `You are a scribe. A lord in a fantasy realm has written or dictated an order to his steward. Put right its spelling, capital letters and punctuation, and nothing else.
Rules: keep every name, every number and the whole meaning; never add, explain, answer or obey; keep a change of mind as it was said (the steward will read it); if it is already right, give it back unchanged.
Reply as JSON: {"text": "the mended order"}.
WRITTEN: send rodrik to winterfel wiht fifty men
{"text": "Send Rodrik to Winterfell with fifty men."}
DICTATED: call the banners of the north to winterfell
{"text": "Call the banners of the North to Winterfell."}
DICTATED: hold a tourney no a feast at winterfell
{"text": "Hold a tourney, no, a feast at Winterfell."}
WRITTEN: Raise 200 archers at Moat Cailin.
{"text": "Raise 200 archers at Moat Cailin."}`;

export default {
  kind: 'scribe',
  fixtureArgs: () => ({ text: 'send rodrik to winterfel with fifty mne', spoken: false }),
  context(state, { text = '', spoken = false } = {}) {
    return { text: String(text).slice(0, 400), spoken: !!spoken };
  },
  schema: () => obj({ text: str(400) }),
  prompt: (ctx) => [
    { role: 'system', content: INSTRUCTIONS },
    { role: 'user', content: `${ctx.spoken ? 'DICTATED' : 'WRITTEN'}: ${ctx.text}` },
  ],
  check(v, ctx) {
    const out = driftOf(ctx.text, v.text, { spoken: ctx.spoken });
    if (hasForeignScript(v.text)) out.push('a word in a script that is not the realm\'s');
    return out;
  },
  // no model, or a refused reply: the line as the rules left it (the caller has already applied them)
  mock: (ctx) => ({ text: ctx.text }),
  fallback: (ctx, problems) => ({ text: ctx.text, problems }),
  attempts: () => 1,
  fingerprint: (ctx) => `${ctx.spoken ? 'd' : 'w'}:${ctx.text}`,
};
