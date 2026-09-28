// The narrator (docs/gdd/04-ai-system.md §6; the style bible is 10 §8). At the end of a turn the facts the player's
// house reads are gathered into stories (engine/facts/cluster.js), and the narrator tells each once, in the voice of
// the books, bound to its facts and adding nothing. Every event is held to the validator (validate/narration.js): the
// good ones are kept, a bad one is told again alone once with what was wrong, and one that fails again is left to the
// engine's own plain lines (server/narrator.js). The mock tells the facts as they are, so the whole path runs in CI.
import { obj, str, arr, oneOf } from '../schema.js';
import { system } from '../context/primer.js';
import { whereabouts } from '../../../public/js/shared/roads.js';
import { addDays } from '../../../public/js/shared/world.js';
import { dayNumber } from '../../../public/js/engine/time.js';
import { emit } from '../../../public/js/engine/facts/log.js';
import { clusterFacts } from '../../../public/js/engine/facts/cluster.js';
import { checkEvent, storyWorld, problemText, sentencesOf } from '../validate/narration.js';
import { VOICE, HEADLINE, MATURITY, exampleFor } from '../../../public/data/style.js';

/** The narrator's instructions (10 §8, data/style.js), with a few-shot example of a house other than the player's. */
export function instructionsFor(house, maturity = 'book') {
  const ex = exampleFor(house);
  return `YOUR TASK
You are the chronicler. The stories below have already happened; tell each of them once, as George R. R. Martin would, and add nothing that is not in them.
- One event per story, in the order given; "story" is its label (S1, S2…).
- headline: ${HEADLINE}.
- line: one plain sentence of what happened, for the folded card.
- scene: two to five sentences. ${VOICE.join(' ')}
- pov: whose eyes, by name ("Jon Umber", "a serving girl at the Twins").
- meanwhile: ONE sentence for all the small happenings listed under MEANWHILE, or "" if none are listed.
KEEP TO THE STORIES
- Name people as the stories name them. Someone who is not in a story may be thought of or written to, never seen doing anything in it.
- Every number you write is one the story gives (a few, three, a dozen are fine). No one arrives, reaches or joins anywhere unless the story says so.
- Name only the places the story names, or the roads between them.
- Only what has happened by today has happened: no later titles, no foreshadowing, no prophecy.
- The player's house is written like any other, by name, in the third person; never decide what its lord feels.
- Never a game word: morale, unrest, prosperity, turn, day 3, player, stat. No modern idiom, no "tapestry", no "winds of change", no moral.
- ${MATURITY[maturity] || MATURITY.book}

AN EXAMPLE (another house, another day)
headline: ${ex.headline}
line: ${ex.line}
scene: ${ex.scene}
pov: ${ex.pov}`;
}
export const INSTRUCTIONS = instructionsFor('stark');

const clip = (s, n) => { const t = String(s || '').replace(/\s+/g, ' ').trim(); if (t.length <= n) return t; const cut = t.slice(0, n - 1); return (cut.slice(0, Math.max(cut.lastIndexOf(' '), n * 0.6)) || cut).replace(/[,;:—–-]+$/, '') + '…'; };
const ord = (n) => `${n}${n % 100 >= 11 && n % 100 <= 13 ? 'th' : { 1: 'st', 2: 'nd', 3: 'rd' }[n % 10] || 'th'}`;
const lead = (s) => [...s.facts].sort((a, b) => b.importance - a.importance)[0];
const noDot = (s) => s.replace(/[.…]+$/, '');
// a headline from an engine line: the line itself if it is short, else its first clause ("House Stark calls its banners")
const herald = (t) => { const s = noDot(String(t).replace(/\s+/g, ' ').trim()); if (s.length <= 70) return s; const head = s.split(/:|;| — | – /)[0].trim(); return head.length >= 12 && head.length <= 70 ? head : clip(s, 70); };

export default {
  kind: 'narrate',
  // three stories of a Stark week and a feast in the Reach, with a poacher for the Meanwhile
  fixtureArgs(state) {
    const d0 = dayNumber(state.meta.date);
    state.meta.clock = { turn: state.meta.turn + 1, from: d0 + 1, to: d0 + 7 };
    const call = { type: 'order', ref: 'o_fixture' };
    const fs = [
      emit(state, 'levies_called', { actors: ['eddard_stark'], houses: ['stark'], place: 'stark', on: 1, importance: 4, cause: call, text: 'Lord Eddard Stark calls the banners of the North to Winterfell.' }),
      emit(state, 'call_answered', { actors: ['greatjon_umber'], houses: ['umber', 'stark'], place: 'umber', on: 2, cause: call, data: { men: 3800, days: 12 }, text: 'Jon Umber answers the call with 3,800 men and marches for Winterfell (~12 days).' }),
      emit(state, 'set_out', { actors: ['jon_snow'], houses: ['stark'], place: 'stark', on: 5, data: { to: 'nights_watch', days: 14 }, text: 'Jon Snow sets out for Castle Black with six men of the household (~14 days).' }),
      emit(state, 'feast', { actors: ['mace_tyrell'], houses: ['tyrell'], place: 'tyrell', on: 4, importance: 2, text: 'Mace Tyrell holds a feast at Highgarden for the lords of the Reach.' }),
      emit(state, 'happening', { houses: ['stark'], place: 'stark', on: 3, importance: 1, text: 'Poachers are hanged in the wolfswood.' }),
    ];
    const { stories, meanwhile } = clusterFacts(state, fs);
    return { stories, meanwhile: meanwhile.map((f) => f.text) };
  },
  context(state, { stories = [], meanwhile = [], only = null, reason = [] } = {}) {
    const clock = state.meta.clock || { from: dayNumber(state.meta.date), to: dayNumber(state.meta.date) };
    const told = only ? stories.filter((s) => s.id === only) : stories;
    if (!told.length) throw new Error('no story to tell');
    const at = (d) => addDays(state.meta.date, d - dayNumber(state.meta.date));
    const date = (d) => { const x = at(d); return `the ${ord(x.day)} day of the ${ord(x.month)} moon`; };
    const people = [...new Set(told.flatMap((s) => s.actors))].map((id) => state.characters[id]).filter(Boolean).slice(0, 14);
    const place = (s) => (s.place && state.holdings[s.place]?.name) || null;
    const line = (s) => {
      const facts = [...s.facts].sort((a, b) => a.day - b.day).slice(0, 6);
      return `${s.id} [importance ${s.importance}] facts ${s.facts.map((f) => f.id).join(', ')} — ${s.days[0] === s.days[1] ? `Day ${s.days[0]}` : `Days ${s.days[0]}–${s.days[1]}`}.${place(s) ? ` At ${place(s)}:` : ''} ${facts.map((f) => clip(f.text, 320)).join(' ')} POV: ${s.pov?.name || 'a witness of the place'}.`;
    };
    const small = only ? [] : meanwhile.slice(0, 8);
    return {
      state, stories: told, all: stories, only, meanwhile: small, reason,
      worlds: new Map(told.map((s) => [s.id, storyWorld(state, s)])),
      dossier: [
        `DATE: from ${date(clock.from)} to ${date(clock.to)}, ${at(clock.to).year} AC. ${String(state.world?.season || 'summer').replace(/^./, (x) => x.toUpperCase())}.`,
        people.length ? `WHO IS WHERE (people in these stories): ${people.map((c) => `${c.name}${c.alive ? ` — ${whereabouts(state, c).text}` : ' — dead'}`).join('; ')}` : null,
        `STORIES (tell each once; add nothing that is not here; do not contradict anything):\n${told.map(line).join('\n')}`,
        small.length ? `MEANWHILE (one sentence for all): ${small.map((t) => noDot(clip(sentencesOf(t)[0] || t, 140))).join('; ')}.` : 'MEANWHILE: nothing (write "").',
        reason.length ? `YOUR LAST TELLING OF ${only} COULD NOT BE USED: ${reason.slice(0, 4).join('; ')}. Tell it again, keeping to the story.` : null,
      ].filter(Boolean).join('\n'),
    };
  },
  schema(ctx) {
    return obj({
      events: arr(obj({ story: oneOf(ctx.stories.map((s) => s.id)), headline: str(70), line: str(200), scene: str(900), pov: str(50) }), { min: 1, max: ctx.stories.length }),
      meanwhile: str(300),
    });
  },
  prompt: (ctx) => [
    { role: 'system', content: system(null, instructionsFor(ctx.state.meta.player, ctx.state.meta.settings?.maturity)) },
    { role: 'user', content: `${ctx.dossier}\nTell the stories.` },
  ],
  // every event held to its story; the meanwhile to its happenings. Problems name their story ("S2: names — …") so the
  // good events can be kept and the bad one told again alone (salvage)
  check(v, ctx) {
    const out = []; const seen = new Set();
    for (const e of v.events) {
      const s = ctx.stories.find((x) => x.id === e.story);
      if (seen.has(e.story)) { out.push(`${e.story}: told twice`); continue; }
      seen.add(e.story);
      for (const p of checkEvent(ctx.state, e, s, ctx.worlds.get(s.id))) out.push(problemText(s, p));
    }
    if (v.meanwhile) {
      const mw = { id: 'meanwhile', facts: [], actors: [], place: null };
      const words = checkEvent(ctx.state, { line: v.meanwhile }, mw, { people: new Set(), places: new Set(), parties: new Set(), roads: [], houses: new Set(), numbers: [], arrivals: new Map() }).filter((p) => ['script', 'game words', 'anachronism', 'maturity'].includes(p.rule));
      out.push(...words.map((p) => problemText(mw, p)));
    }
    return out;
  },
  /** The events that passed, when some did: { value, problems (of the rest) } — or null (nothing worth keeping). */
  salvage(v, problems, ctx) {
    const bad = new Set(problems.map((p) => p.split(':')[0]));
    const events = v.events.filter((e) => !bad.has(e.story));
    if (!events.length && !(ctx.only == null && v.meanwhile && !bad.has('meanwhile'))) return null;
    return { value: { events, meanwhile: bad.has('meanwhile') ? '' : v.meanwhile }, problems };
  },
  // a story told again alone is told once more at most: then the engine's lines stand (04 §6.4)
  attempts: (ctx) => (ctx.only ? 1 : 2),
  mock: (ctx) => ({ events: ctx.stories.map((s) => plainEvent(ctx.state, s)), meanwhile: ctx.meanwhile.length ? clip(`Elsewhere: ${ctx.meanwhile.slice(0, 4).map((t) => noDot(sentencesOf(t)[0] || t)).join('; ')}.`, 300) : '' }),
  // the engine's own cards stand: plain, but true
  fallback: () => ({ events: [], meanwhile: '', plain: true }),
  fingerprint: (ctx) => `${ctx.only || '*'}|${ctx.stories.map((s) => s.facts.map((f) => f.kind).join('+')).join('|')}`,
};

/** A story told plainly from its facts (the mock's telling): the weightiest fact's title and text, the rest after it. */
export function plainEvent(state, s) {
  const top = lead(s);
  const rest = s.facts.filter((f) => f !== top).map((f) => f.text);
  return {
    story: s.id, headline: herald(top.title || sentencesOf(top.text)[0] || top.text), line: clip(top.text, 200),
    scene: clip([top.text, ...rest].join(' '), 900), pov: clip(s.pov?.name || '', 50),
  };
}
