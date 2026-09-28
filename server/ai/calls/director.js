// The Director (docs/gdd/04-ai-system.md §7): when the realm's weeks run thin, one or two grounded story hooks from the
// catalogue (public/data/hooks.js), each at one of the places the world fits for it. The model chooses among what it is
// offered and says why in a line; the engine makes the hook happen (engine/director.js). It never kills anyone and never
// touches the canon's locked threads: no hook in the catalogue can.
import { obj, str, arr, oneOf, hasForeignScript, strings } from '../schema.js';
import { system } from '../context/primer.js';
import { dateStr } from '../../../public/js/shared/world.js';
import { eligibleHooks, pickHook } from '../../../public/js/engine/director.js';
import { makeRng, seedState } from '../../../public/js/engine/rng.js';
import { dayNumber } from '../../../public/js/engine/time.js';

export const INSTRUCTIONS = `YOUR TASK
You are the realm's chronicler of small beginnings. The weeks have been quiet; choose what stirs next, from the hooks offered — the one that best fits the realm as the dossier shows it, and would give its lords something to answer.
- hooks: one (at most the number asked), each a hook id from HOOKS YOU MAY CHOOSE and one of that hook's own places.
- why: one short line on why it fits now.
Prefer hooks that touch what is already happening (a war, a season, a quarrel); vary them — not the same kind as last time.`;

export default {
  kind: 'director',
  fixtureArgs: () => ({ max: 1 }),
  context(state, { max = 1, offer = null } = {}) {
    const hooks = offer || eligibleHooks(state);
    if (!hooks.length) throw new Error('no hook fits the realm now');
    const p = state.meta.player; const recent = (state.facts || []).slice(-12).filter((f) => (f.importance ?? 1) >= 2).slice(-6);
    const last = Object.entries(state.plots?.hooks || {}).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([id]) => id);
    return {
      state, hooks, max: Math.max(1, Math.min(2, max)),
      dossier: [
        `DATE: ${dateStr(state.meta.date)}. ${String(state.world?.season || 'summer').replace(/^./, (x) => x.toUpperCase())}.`,
        `THE LORD: House ${state.houses[p].name}${(state.wars || []).some((w) => w.status !== 'ended') ? '; the realm is at war' : '; the realm is at peace'}.`,
        recent.length ? `OF NOTE LATELY:\n${recent.map((f) => `- ${f.title || f.text}`).join('\n')}` : 'OF NOTE LATELY: little.',
        last.length ? `CHOSEN BEFORE: ${last.join(', ')}.` : null,
        `HOOKS YOU MAY CHOOSE (id: what it is — its places):\n${hooks.map((h) => `- ${h.id}: ${h.title.replace(/\{(\w+)[^}]*\}/g, '…')} — ${h.places.map((x) => `${x} (${state.holdings[x]?.name})`).join(', ')}`).join('\n')}`,
      ].filter(Boolean).join('\n'),
    };
  },
  schema(ctx) {
    const places = [...new Set(ctx.hooks.flatMap((h) => h.places))];
    return obj({ hooks: arr(obj({ hook: oneOf(ctx.hooks.map((h) => h.id)), place: oneOf(places), why: str(120) }), { min: 1, max: ctx.max }) });
  },
  prompt: (ctx) => [
    { role: 'system', content: system(ctx.state, INSTRUCTIONS) },
    { role: 'user', content: `${ctx.dossier}\n\nChoose ${ctx.max > 1 ? `up to ${ctx.max} hooks` : 'one hook'}.` },
  ],
  check(v, ctx) {
    const out = []; const by = Object.fromEntries(ctx.hooks.map((h) => [h.id, h]));
    for (const h of v.hooks) if (!by[h.hook]?.places.includes(h.place)) out.push(`${h.place} is not one of ${h.hook}'s places (${by[h.hook]?.places.join(', ')})`);
    if (new Set(v.hooks.map((h) => h.hook)).size < v.hooks.length) out.push('the same hook twice');
    if (strings(v).some(hasForeignScript)) out.push('a word in a script that is not the realm\'s');
    return out;
  },
  // what can be kept of a reply with one hook in the wrong place: the hooks that are right
  salvage(v, problems, ctx) {
    const by = Object.fromEntries(ctx.hooks.map((h) => [h.id, h]));
    const keep = v.hooks.filter((h, i) => by[h.hook]?.places.includes(h.place) && v.hooks.findIndex((x) => x.hook === h.hook) === i);
    return keep.length ? { hooks: keep } : null;
  },
  mock: (ctx) => valueOf(ctx),
  fallback: (ctx, problems) => ({ ...valueOf(ctx), problems }),
  fingerprint: (ctx) => ctx.hooks.map((h) => h.id).join(','),
};

// a choice by the day's own dice, not the save's: a call, like the model's answer, draws nothing from the world's dice,
// so a turn played again with the recorded choice (Stop here) rolls the same as the first time
function valueOf(ctx) {
  const own = makeRng(seedState((ctx.state.meta.seed ?? 0) * 7919 + dayNumber(ctx.state.meta.date)));
  const pick = pickHook(ctx.state, () => own.next(), ctx.hooks);
  return { hooks: [{ hook: pick.hook, place: pick.place, why: 'The realm stirs.' }] };
}
