// The narrator (docs/gdd/04-ai-system.md §6, docs/gdd/18-headlines.md §3.2; the style bible is 10 §8). At the end of a turn the
// facts the player's house reads are gathered into stories (engine/facts/cluster.js), the engine's writer has already told each
// as a card — a headline and a short plain summary (engine/facts/headline.js) — and the narrator is asked to say the top few
// better, in the voice of the books, bound to the same facts and adding nothing. Every telling is held to the story (validate/
// narration.js) and to the headline rules (validate/headline.js): the good ones are kept, a bad one is told again alone once
// with what was wrong, and one that fails again is left to the writer's own card (server/narrator.js). The writer is the floor,
// so a model that is off, slow or wrong leaves the player a card that reads well; and it is the mock, so the whole path runs in CI.
import { obj, str, arr, oneOf } from '../schema.js';
import { system } from '../context/primer.js';
import { whereabouts } from '../../../public/js/shared/roads.js';
import { addDays } from '../../../public/js/shared/world.js';
import { dayNumber } from '../../../public/js/engine/time.js';
import { emit } from '../../../public/js/engine/facts/log.js';
import { clusterFacts } from '../../../public/js/engine/facts/cluster.js';
import { cardOf, meanwhileOf } from '../../../public/js/engine/facts/headline.js';
import { rankStories } from '../../../public/js/engine/facts/rank.js';
import { checkEvent, storyWorld, problemText } from '../validate/narration.js';
import { scoreCard, checkMeanwhile } from '../validate/headline.js';
import { VOICE, HEADLINE, SUMMARY, ANTI_PATTERNS, PAIRS, MATURITY, exampleFor } from '../../../public/data/style.js';

/** The narrator's instructions (10 §8, data/style.js), with few-shot pairs and an example scene of a house other than the player's. */
export function instructionsFor(house, maturity = 'book') {
  const ex = exampleFor(house);
  return `YOUR TASK
You are the chronicler. The stories below have already happened. For each one you are given a DRAFT card; write the card the reader sees. Keep the draft if it is good; say it better if you can, keeping every fact and adding none.
- One event per story, in the order given; "story" is its label (S1, S2…).
- headline: ${HEADLINE}.
- summary: ${SUMMARY}. It does not repeat the headline.
- scene: for stories marked great or major only, two to five sentences. ${VOICE.join(' ')} For every other story write "".
- pov: whose eyes the scene is behind, by name ("Jon Umber", "a serving girl at the Twins"); "" if there is no scene.
- meanwhile: ONE plain sentence for all the small happenings, at most three clauses, or "" if none are listed.
KEEP TO THE STORIES
- Name people as the story sheets name them. Someone who is not in a story may be thought of or written to, never seen doing anything in it.
- Every number you write is one the story gives, in words ("some three hundred"), never in digits. No one arrives, reaches or joins anywhere unless the story says so.
- Name only the places the story names, or the roads between them. Never say who won, who was slain or who was taken unless the sheet says it.
- Only what has happened by today has happened: no later titles, no foreshadowing, no prophecy.
- The player's house is written like any other, by name, in the third person; never decide what its lord feels.
- Never a game word: morale, unrest, prosperity, turn, day 3, player, stat. No modern idiom, no "tapestry", no "winds of change", no moral.
- Never the ledger's phrases: ${ANTI_PATTERNS.map((p) => `"${p}"`).join('; ')}.
- ${MATURITY[maturity] || MATURITY.book}

HOW A HEADLINE AND ITS SUMMARY READ (invented, to show the wording; none of it happened)
${PAIRS.map((p) => `headline: ${p.headline}\nsummary: ${p.summary}`).join('\n\n')}

A SCENE (another house, another day)
headline: ${ex.headline}
summary: ${ex.summary}
scene: ${ex.scene}
pov: ${ex.pov}`;
}
export const INSTRUCTIONS = instructionsFor('stark');

const clip = (s, n) => { const t = String(s || '').replace(/\s+/g, ' ').trim(); if (t.length <= n) return t; const cut = t.slice(0, n - 1); return (cut.slice(0, Math.max(cut.lastIndexOf(' '), n * 0.6)) || cut).replace(/[,;:—–-]+$/, '') + '…'; };
const ord = (n) => `${n}${n % 100 >= 11 && n % 100 <= 13 ? 'th' : { 1: 'st', 2: 'nd', 3: 'rd' }[n % 10] || 'th'}`;

/** A story told by the writer alone, in the shape of the model's answer. */
export const writerEvent = (state, s) => {
  const c = cardOf(state, s);
  return { story: s.id, headline: c.headline, summary: c.summary, scene: '', pov: clip(s.pov?.name || '', 50) };
};

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
    return { stories, small: meanwhile };
  },
  /**
   * The story sheets. `stories`: to be told; `small`: the facts of the Meanwhile; `only`/`reason`: one story told again
   * alone; `ranks`: { storyId: { tier, score } } (worked out here when the caller has none).
   */
  context(state, { stories = [], small = [], only = null, reason = [], ranks = null } = {}) {
    const clock = state.meta.clock || { from: dayNumber(state.meta.date), to: dayNumber(state.meta.date) };
    const told = only ? stories.filter((s) => s.id === only) : stories;
    if (!told.length) throw new Error('no story to tell');
    const at = (d) => addDays(state.meta.date, d - dayNumber(state.meta.date));
    const date = (d) => { const x = at(d); return `the ${ord(x.day)} day of the ${ord(x.month)} moon`; };
    const rk = ranks || Object.fromEntries(rankStories(state, told).map((r) => [r.id, { tier: r.tier, score: r.score }]));
    const drafts = new Map(told.map((s) => [s.id, cardOf(state, s)]));
    const people = [...new Set(told.flatMap((s) => s.actors))].map((id) => state.characters[id]).filter(Boolean).slice(0, 14);
    const place = (s) => (s.place && state.holdings[s.place]?.name) || null;
    const who = (id) => { const c = state.characters[id]; return c ? `${c.name} (${[c.title && c.title.split(',')[0], state.houses[c.house] && `House ${state.houses[c.house].name}`].filter(Boolean).join(', ')}${c.alive ? '' : ', dead'})` : null; };
    const sheet = (s) => {
      const d = drafts.get(s.id); const lead = s.facts.find((f) => f.id === s.lead) || s.facts[0];
      const tier = (rk[s.id]?.tier) || 'news';
      const counts = d.details.filter((x) => !/^On the /.test(x));
      const why = [lead?.data?.how, lead?.data?.why, lead?.data?.cause].filter((x) => typeof x === 'string' && x).slice(0, 2);
      const days = s.days[0] === s.days[1] ? date(clock.from + s.days[0] - 1) : `${date(clock.from + s.days[0] - 1)} to ${date(clock.from + s.days[1] - 1)}`;
      return [
        `${s.id} [${tier} · ${s.archetype || 'other'}${s.heard ? ` · heard by ${s.heard.via}` : ''}] ${days}${place(s) ? `, at ${place(s)}` : ''}`,
        d.who.map(who).filter(Boolean).length ? `  WHO: ${d.who.map(who).filter(Boolean).slice(0, 5).join(' · ')}` : null,
        why.length ? `  WHY/HOW: ${why.join('; ')}` : null,
        counts.length ? `  COUNTS (for the fold; put no digits in your card): ${counts.slice(0, 4).join(' ')}` : null,
        `  DRAFT headline: ${d.headline}`, `  DRAFT summary: ${d.summary || '(none)'}`,
        `  POV: ${s.pov?.name || 'a witness of the place'}`,
      ].filter(Boolean).join('\n');
    };
    const draftSmall = only ? '' : meanwhileOf(state, small);
    return {
      state, stories: told, all: stories, only, small: only ? [] : small, reason, drafts, ranks: rk, draftSmall,
      worlds: new Map(told.map((s) => [s.id, storyWorld(state, s)])),
      dossier: [
        `DATE: from ${date(clock.from)} to ${date(clock.to)}, ${at(clock.to).year} AC. ${String(state.world?.season || 'summer').replace(/^./, (x) => x.toUpperCase())}.`,
        people.length ? `WHO IS WHERE (people in these stories): ${people.map((c) => `${c.name}${c.alive ? ` — ${whereabouts(state, c).text}` : ' — dead'}`).join('; ')}` : null,
        `STORIES (tell each once; add nothing that is not here; do not contradict anything):\n${told.map(sheet).join('\n')}`,
        draftSmall ? `MEANWHILE DRAFT (one sentence for all the small happenings; keep it or say it better): ${draftSmall}` : 'MEANWHILE: nothing (write "").',
        reason.length ? `YOUR LAST TELLING OF ${only} COULD NOT BE USED: ${reason.slice(0, 4).join('; ')}. Tell it again, keeping to the story.` : null,
      ].filter(Boolean).join('\n'),
    };
  },
  schema(ctx) {
    return obj({
      events: arr(obj({ story: oneOf(ctx.stories.map((s) => s.id)), headline: str(90), summary: str(340), scene: str(700), pov: str(50) }), { min: 1, max: ctx.stories.length }),
      meanwhile: str(200),
    });
  },
  prompt: (ctx) => [
    { role: 'system', content: system(null, instructionsFor(ctx.state.meta.player, ctx.state.meta.settings?.maturity)) },
    { role: 'user', content: `${ctx.dossier}\nTell the stories.` },
  ],
  // every event held to its story (the names, places, numbers and arrivals of narration.js) and to the headline rules (the scorer of
  // N1: H1–H10, S1–S6); the meanwhile to its happenings. Problems name their story ("S2: names — …") so the good events can be kept
  // and the bad one told again alone (salvage)
  check(v, ctx) {
    const out = []; const seen = new Set(); const heads = new Map();
    for (const e of v.events) {
      const s = ctx.stories.find((x) => x.id === e.story);
      if (seen.has(e.story)) { out.push(`${e.story}: told twice`); continue; }
      seen.add(e.story);
      const said = [];
      for (const p of checkEvent(ctx.state, e, s, ctx.worlds.get(s.id))) said.push(p);
      for (const p of scoreCard({ headline: e.headline, summary: e.summary }, s, ctx.state).detail) said.push(p);
      const key = e.headline.trim().toLowerCase();
      if (heads.has(key)) said.push({ rule: 'dup', text: `the same headline as ${heads.get(key)}` }); else heads.set(key, e.story);
      const dup = new Set(); for (const p of said) { const k = `${p.rule}|${p.text}`; if (!dup.has(k)) { dup.add(k); out.push(problemText(s, p)); } }
    }
    if (v.meanwhile) for (const p of checkMeanwhile(ctx.state, v.meanwhile, ctx.small)) out.push(problemText({ id: 'meanwhile' }, p));
    return out;
  },
  /** The events that passed, when some did: { value, problems (of the rest) } — or null (nothing worth keeping). */
  salvage(v, problems, ctx) {
    const bad = new Set(problems.map((p) => p.split(':')[0]));
    const events = v.events.filter((e) => !bad.has(e.story));
    if (!events.length && !(ctx.only == null && v.meanwhile && !bad.has('meanwhile'))) return null;
    return { value: { events, meanwhile: bad.has('meanwhile') ? '' : v.meanwhile }, problems };
  },
  // a story told again alone is told once more at most: then the writer's card stands (04 §6.4)
  attempts: (ctx) => (ctx.only ? 1 : 2),
  // the mock tells what the writer wrote: the whole path runs in CI, and this is the readable baseline
  mock: (ctx) => ({ events: ctx.stories.map((s) => ({ story: s.id, headline: ctx.drafts.get(s.id).headline, summary: ctx.drafts.get(s.id).summary, scene: '', pov: clip(s.pov?.name || '', 50) })), meanwhile: ctx.draftSmall || '' }),
  // no model: the same cards, from the same writer
  fallback: (ctx) => ({ events: ctx.stories.map((s) => ({ story: s.id, headline: ctx.drafts.get(s.id).headline, summary: ctx.drafts.get(s.id).summary, scene: '', pov: clip(s.pov?.name || '', 50) })), meanwhile: ctx.draftSmall || '', plain: true }),
  fingerprint: (ctx) => `${ctx.only || '*'}|${ctx.stories.map((s) => s.facts.map((f) => f.kind).join('+')).join('|')}`,
};

