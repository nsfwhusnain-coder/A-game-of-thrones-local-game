// The narrator (docs/gdd/04-ai-system.md §6, docs/gdd/18-headlines.md §3.2; the style bible is 10 §8). At the end of a turn the
// facts the player's house reads are gathered into stories (engine/facts/cluster.js), and the engine's writer has already told each
// as a card — a headline and a short plain summary (engine/facts/headline.js). The model is asked for what a writer cannot make
// from slots: the scene, a few sentences behind one witness's eyes, for the stories that matter most (mode "scenes", the default);
// or, for a model good enough at it, to say the card itself better as well (mode "cards", config `narratorMode`). Every telling is
// held to the story (validate/narration.js) and to the headline rules (validate/headline.js): the good ones are kept, a bad one is
// told again alone once with what was wrong, and one that fails again is left to the writer's own card (server/narrator.js). The
// writer is the floor, so a model that is off, slow or wrong leaves the player a card that reads well; and it is the mock, so the
// whole path runs in CI. (Measured on Maester-12B, docs/local-ai: it writes scenes well and cards less surely than the writer does.)
import { obj, str, arr, oneOf } from '../schema.js';
import { system } from '../context/primer.js';
import { addDays } from '../../../public/js/shared/world.js';
import { dayNumber } from '../../../public/js/engine/time.js';
import { emit } from '../../../public/js/engine/facts/log.js';
import { clusterFacts } from '../../../public/js/engine/facts/cluster.js';
import { cardOf, meanwhileOf } from '../../../public/js/engine/facts/headline.js';
import { who as whoLabel, houseLabel, partyLabel } from '../../../public/js/engine/facts/label.js';
import { rankStories } from '../../../public/js/engine/facts/rank.js';
import { checkEvent, storyWorld, problemText } from '../validate/narration.js';
import { scoreCard, checkMeanwhile } from '../validate/headline.js';
import { VOICE, HEADLINE, SUMMARY, ANTI_PATTERNS, PAIRS, MATURITY, exampleFor } from '../../../public/data/style.js';

/** The narrator's mode: "scenes" (the writer's cards, the model's scenes: the default) or "cards" (the model also says the card). */
export const modeOf = (cfg) => (cfg?.narratorMode === 'cards' ? 'cards' : 'scenes');

// the rules of both modes: what a telling may name, say and number
const KEEP = (maturity) => `KEEP TO THE STORIES
- Name people as the story sheets name them. Someone who is not in a story may be thought of or written to, never seen doing anything in it.
- Every number you write is one the story gives, in words ("some three hundred"), never in digits. No one arrives, reaches or joins anywhere unless the story says so.
- Name only the people, houses and places on a story's NAME ONLY line: a castle, a house or a lord that is not listed is not in that story, even if you know he lives there. Never say who won, who was slain or who was taken unless the sheet says it.
- Only what has happened by today has happened: no later titles, no foreshadowing, no prophecy.
- The player's house is written like any other, by name, in the third person; never decide what its lord feels.
- Never a game word: morale, unrest, prosperity, turn, day 3, player, stat. No modern idiom, no "tapestry", no "winds of change", no moral. Never a note to the reader, a correction or a bracket.
- Never the ledger's phrases: ${ANTI_PATTERNS.map((p) => `"${p}"`).join('; ')}.
- ${MATURITY[maturity] || MATURITY.book}`;

/** The narrator's instructions (10 §8, data/style.js), with few-shot pairs and an example scene of a house other than the player's. */
export function instructionsFor(house, maturity = 'book', mode = 'cards') {
  const ex = exampleFor(house);
  if (mode === 'scenes') {
    return `YOUR TASK
You are the chronicler. The cards below are already written and true; do not change them. For each story listed, write only its scene: two to four sentences in which the reader sees the moment through one witness's eyes (the story's POV), as it happened.
- One event per story, in the order given; "story" is its label (S1, S2…).
- scene: ${VOICE.join(' ')} Do not say again what the card says; add what a witness would see, hear, smell and say. Do not sum up what the deed will cost: end on a small concrete thing, or on who noticed.
${KEEP(maturity)}

A SCENE (another house, another day; the POV was the miller's boy)
card: ${ex.headline} — ${ex.summary}
scene: ${ex.scene}`;
  }
  return `YOUR TASK
You are the chronicler. The stories below have already happened. For each one you are given a DRAFT card; write the card the reader sees. Keep the draft if it is good; say it better if you can, keeping every fact and adding none.
- One event per story, in the order given; "story" is its label (S1, S2…).
- headline: ${HEADLINE}.
- summary: ${SUMMARY}. It does not repeat the headline.
- scene: for stories marked great or major only, two to four sentences, behind the eyes of the story's POV. ${VOICE.join(' ')} Do not sum up what the deed will cost. For every other story write "".
- meanwhile: ONE plain sentence for all the small happenings, at most three clauses, or "" if none are listed.
${KEEP(maturity)}

HOW A HEADLINE AND ITS SUMMARY READ (invented, to show the wording; none of it happened)
${PAIRS.map((p) => `headline: ${p.headline}\nsummary: ${p.summary}`).join('\n\n')}

A SCENE (another house, another day; the POV was the miller's boy)
headline: ${ex.headline}
summary: ${ex.summary}
scene: ${ex.scene}`;
}
export const INSTRUCTIONS = instructionsFor('stark');

const ord = (n) => `${n}${n % 100 >= 11 && n % 100 <= 13 ? 'th' : { 1: 'st', 2: 'nd', 3: 'rd' }[n % 10] || 'th'}`;

/** A scene as it may be shown: whitespace tidied, no runs of blank lines. */
export const tidyScene = (t) => String(t || '').replace(/[ \t]+\n/g, '\n').replace(/\n{2,}/g, '\n').replace(/[ \t]{2,}/g, ' ').trim();
// what a model says to its reader instead of the scene: a note, a correction, a bracketed aside
const META = /\b(?:the prompt|as requested|as instructed)\b|\b(?:correction|note)\s*:|\((?:correction|note|the prompt)/i;
/** What is wrong with a scene that the names, arrivals and numbers of narration.js cannot say: a note to the reader, or a scene run to nothing. */
export function sceneProblems(scene) {
  const out = []; const t = String(scene || '');
  if (META.test(t)) out.push({ rule: 'meta', text: 'a note to the reader, not a scene' });
  if (/\n\s*\n\s*\n/.test(t) || /(.)\1{9,}/.test(t)) out.push({ rule: 'meta', text: 'the scene ran on to nothing' });
  return out;
}

/** A story told by the writer alone, in the shape of the model's answer. */
export const writerEvent = (state, s) => {
  const c = cardOf(state, s);
  return { story: s.id, headline: c.headline, summary: c.summary, scene: '' };
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
    return { stories, small: meanwhile, mode: 'cards' };
  },
  /**
   * The story sheets. `stories`: to be told; `small`: the facts of the Meanwhile; `only`/`reason`: one story told again
   * alone; `ranks`: { storyId: { tier, score } } (worked out here when the caller has none); `mode`: "cards" or "scenes".
   */
  context(state, { stories = [], small = [], only = null, reason = [], ranks = null, mode = 'scenes' } = {}) {
    const clock = state.meta.clock || { from: dayNumber(state.meta.date), to: dayNumber(state.meta.date) };
    const told = only ? stories.filter((s) => s.id === only) : stories;
    if (!told.length) throw new Error('no story to tell');
    const at = (d) => addDays(state.meta.date, d - dayNumber(state.meta.date));
    const date = (d) => { const x = at(d); return `the ${ord(x.day)} day of the ${ord(x.month)} moon`; };
    const rk = ranks || Object.fromEntries(rankStories(state, told).map((r) => [r.id, { tier: r.tier, score: r.score }]));
    const drafts = new Map(told.map((s) => [s.id, cardOf(state, s)]));
    const place = (s) => (s.place && state.holdings[s.place]?.name) || null;
    const who = (id) => { const c = state.characters[id]; return c ? `${c.name} (${[c.title && c.title.split(',')[0], state.houses[c.house] && `House ${state.houses[c.house].name}`].filter(Boolean).join(', ')}${c.alive ? '' : ', dead'})` : null; };
    const worlds = new Map(told.map((s) => [s.id, storyWorld(state, s)]));
    // the names a story may say (the validator's own: its people, its houses, its places and its hosts), so the model is never left to guess what it may name
    const namesOf = (s, d) => {
      const W = worlds.get(s.id); const out = [];
      // in the herald's names, never the ledger's ("the Stark host", not "The Banners of Stark"; "House Baratheon", not "Baratheon of King's Landing")
      for (const id of d.who) out.push(state.characters[id] ? whoLabel(state, id) : state.houses[id] ? houseLabel(state, id) : state.parties?.[id] ? partyLabel(state, state.parties[id]) : state.holdings[id]?.name);
      out.push(place(s));
      for (const id of [...W.places].slice(0, 6)) out.push(state.holdings[id]?.name);
      for (const id of [...W.houses].slice(0, 4)) if (state.houses[id]) out.push(houseLabel(state, id));
      for (const id of [...W.parties].slice(0, 3)) if (state.parties?.[id]) out.push(partyLabel(state, state.parties[id]));
      return [...new Set(out.filter(Boolean))].slice(0, 14);
    };
    const sheet = (s) => {
      const d = drafts.get(s.id); const lead = s.facts.find((f) => f.id === s.lead) || s.facts[0];
      const tier = (rk[s.id]?.tier) || 'news';
      const counts = d.details.filter((x) => !/^On the /.test(x));
      const why = [lead?.data?.how, lead?.data?.why, lead?.data?.cause].filter((x) => typeof x === 'string' && x).slice(0, 2);
      const days = s.days[0] === s.days[1] ? date(clock.from + s.days[0] - 1) : `${date(clock.from + s.days[0] - 1)} to ${date(clock.from + s.days[1] - 1)}`;
      const card = mode === 'scenes'
        ? [`  THE CARD: ${d.headline}${d.summary ? ` — ${d.summary}` : ''}`]
        : [counts.length ? `  COUNTS (for the fold; put no digits in your card): ${counts.slice(0, 4).join(' ')}` : null, `  DRAFT headline: ${d.headline}`, `  DRAFT summary: ${d.summary || '(none)'}`];
      return [
        `${s.id} [${tier} · ${s.archetype || 'other'}${s.heard ? ` · heard by ${s.heard.via}` : ''}] ${days}${place(s) ? `, at ${place(s)}` : ''}`,
        d.who.map(who).filter(Boolean).length ? `  WHO: ${d.who.map(who).filter(Boolean).slice(0, 5).join(' · ')}` : null,
        why.length ? `  WHY/HOW: ${why.join('; ')}` : null,
        ...card,
        `  NAME ONLY: ${namesOf(s, d).join('; ')}`,
        `  POV: ${s.pov?.name || 'a witness of the place'}`,
      ].filter(Boolean).join('\n');
    };
    const draftSmall = only || mode === 'scenes' ? '' : meanwhileOf(state, small);
    return {
      state, mode, stories: told, all: stories, only, small: only ? [] : small, reason, drafts, ranks: rk, draftSmall, worlds,
      dossier: [
        `DATE: from ${date(clock.from)} to ${date(clock.to)}, ${at(clock.to).year} AC. ${String(state.world?.season || 'summer').replace(/^./, (x) => x.toUpperCase())}.`,
        `STORIES (${mode === 'scenes' ? 'write the scene of each once' : 'tell each once'}; add nothing that is not here; do not contradict anything):\n${told.map(sheet).join('\n')}`,
        mode === 'scenes' ? null : draftSmall ? `MEANWHILE DRAFT (one sentence for all the small happenings; keep it or say it better): ${draftSmall}` : 'MEANWHILE: nothing (write "").',
        reason.length ? `YOUR LAST TELLING OF ${only} COULD NOT BE USED: ${reason.slice(0, 4).join('; ')}. Tell it again, keeping to the story.` : null,
      ].filter(Boolean).join('\n'),
    };
  },
  schema(ctx) {
    const ids = ctx.stories.map((s) => s.id);
    if (ctx.mode === 'scenes') return obj({ events: arr(obj({ story: oneOf(ids), scene: str(700) }), { min: 1, max: ids.length }) });
    return obj({
      events: arr(obj({ story: oneOf(ids), headline: str(90), summary: str(340), scene: str(700) }), { min: 1, max: ids.length }),
      meanwhile: str(200),
    });
  },
  prompt: (ctx) => [
    { role: 'system', content: system(null, instructionsFor(ctx.state.meta.player, ctx.state.meta.settings?.maturity, ctx.mode)) },
    { role: 'user', content: `${ctx.dossier}\n${ctx.mode === 'scenes' ? 'Write the scenes.' : 'Tell the stories.'}` },
  ],
  // every event held to its story (the names, places, numbers and arrivals of narration.js) and, in mode "cards", to the headline rules
  // (the scorer of N1: H1–H10, S1–S6); the meanwhile to its happenings. Problems name their story ("S2: names — …") so the good
  // events can be kept and the bad one told again alone (salvage)
  check(v, ctx) {
    const out = []; const seen = new Set(); const heads = new Map();
    for (const e of v.events) {
      const s = ctx.stories.find((x) => x.id === e.story);
      if (seen.has(e.story)) { out.push(`${e.story}: told twice`); continue; }
      seen.add(e.story);
      const said = [];
      if (ctx.mode === 'scenes') { for (const p of checkEvent(ctx.state, { scene: e.scene }, s, ctx.worlds.get(s.id))) said.push(p); } else {
        for (const p of checkEvent(ctx.state, e, s, ctx.worlds.get(s.id))) said.push(p);
        for (const p of scoreCard({ headline: e.headline, summary: e.summary }, s, ctx.state).detail) said.push(p);
        const key = e.headline.trim().toLowerCase();
        if (heads.has(key)) said.push({ rule: 'dup', text: `the same headline as ${heads.get(key)}` }); else heads.set(key, e.story);
      }
      said.push(...sceneProblems(e.scene));
      const dup = new Set(); for (const p of said) { const k = `${p.rule}|${p.text}`; if (!dup.has(k)) { dup.add(k); out.push(problemText(s, p)); } }
    }
    if (v.meanwhile) for (const p of checkMeanwhile(ctx.state, v.meanwhile, ctx.small)) out.push(problemText({ id: 'meanwhile' }, p));
    return out;
  },
  /** The events that passed, when some did: { value, problems (of the rest) } — or null (nothing worth keeping). */
  salvage(v, problems, ctx) {
    const bad = new Set(problems.map((p) => p.split(':')[0]));
    const events = v.events.filter((e) => !bad.has(e.story));
    if (ctx.mode === 'scenes') return events.length ? { value: { events }, problems } : null;
    if (!events.length && !(ctx.only == null && v.meanwhile && !bad.has('meanwhile'))) return null;
    return { value: { events, meanwhile: bad.has('meanwhile') ? '' : v.meanwhile }, problems };
  },
  // a story told again alone is told once more at most: then the writer's card stands (04 §6.4)
  attempts: (ctx) => (ctx.only ? 1 : 2),
  // the mock tells what the writer wrote (and no scene: a witness's eyes are the model's to lend): the whole path runs in CI
  mock: (ctx) => events(ctx),
  // no model: the same cards, from the same writer
  fallback: (ctx) => ({ ...events(ctx), plain: true }),
  fingerprint: (ctx) => `${ctx.mode === 'scenes' ? 's|' : ''}${ctx.only || '*'}|${ctx.stories.map((s) => s.facts.map((f) => f.kind).join('+')).join('|')}`,
};

function events(ctx) {
  if (ctx.mode === 'scenes') return { events: ctx.stories.map((s) => ({ story: s.id, scene: '' })) };
  return { events: ctx.stories.map((s) => ({ story: s.id, headline: ctx.drafts.get(s.id).headline, summary: ctx.drafts.get(s.id).summary, scene: '' })), meanwhile: ctx.draftSmall || '' };
}
