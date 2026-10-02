// The great matters of the story told as news (docs/BUG-HUNT-2026-10-02.md, ST1): the canon beats had their own titles and tellings
// in the facts, and the writer ignored them: 28 of 30 cards of a game read "Grave news reaches <place>", "The ravens carry the word
// across the realm". A beat now carries the headline it gives its news (`head`) and the card is told in the beat's own words.
// Mock only: the beats are fired on a fresh world exactly as the beat engine does and the card is the writer's, scored by the
// headline scorer the CI soak holds every card to.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createInitialState, applyChanges } from '../public/js/shared/world.js';
import { withRng } from '../public/js/engine/rng.js';
import { THREADS, BEAT_META } from '../public/data/beats.js';
import { fact } from '../public/js/engine/facts/log.js';
import { recordBeat } from '../public/js/engine/world/beats.js';
import { clusterFacts } from '../public/js/engine/facts/cluster.js';
import { cardOf } from '../public/js/engine/facts/headline.js';
import { scoreCard } from '../server/ai/validate/headline.js';
import { dayNumber } from '../public/js/engine/time.js';
import { HOOK_IDS } from '../public/data/hooks.js';

const HOUSES = ['stark', 'baratheon', 'tully', 'targaryen', 'greyjoy', 'lannister', 'baratheon_se', 'nights_watch'];
const BEATS = THREADS.flatMap((t) => t.stages.map((st) => ({ t, st, id: `${t.id}.${st.id}` })));
/** A beat's fire and its alternates, each a way the beat can be told. */
const tellings = ({ st, id }) => [{ label: id, fire: (s) => st.fire(s) }, ...(BEAT_META[id]?.alternates || []).map((a, i) => ({ label: `${id} (alternate ${i + 1})`, fire: (s) => a.effects(s) }))];

/** Fire one telling of a beat on a fresh world as the beat engine does (the card as a fact, then what it does to the world); returns { s, story, events }. */
const worlds = new Map(); // (a world is made once per house and copied: a save is JSON, so a copy through JSON is a faithful one)
const freshWorld = (house) => { if (!worlds.has(house)) worlds.set(house, JSON.stringify(createInitialState('agot_298', house, { seed: 298 }))); return JSON.parse(worlds.get(house)); };
function told({ t, st }, fire, house) {
  const s = freshWorld(house); s.plots = { stages: {}, flags: {}, fired: {} };
  const day = dayNumber(s.meta.date); s.meta.clock = { turn: 1, from: day, to: day };
  if (/hand_at_court|streets|baelors|traitor|whispering/.test(`${t.id}.${st.id}`)) s.characters.eddard_stark.title = 'Hand of the King, Lord of Winterfell'; // (the Hand is at court when the beats of his office fire)
  const r = withRng(s, () => fire(s)); if (!r?.events?.length) return null;
  const cause = { type: 'beat', ref: `${t.id}.${st.id}` };
  const events = r.events.map((e) => ({ e, card: recordBeat(s, e, { thread: t.id, data: { stage: st.id }, cause }) })); // (as the beat engine records it)
  withRng(s, () => { applyChanges(s, r.changes || [], { source: 'The ravens', cause, alongside: events[0].card.fact }); r.post?.(s); });
  const { stories } = clusterFacts(s, [...s.facts]);
  const story = stories.find((x) => x.facts.some((f) => f.id === events[0].card.fact));
  return { s, story, events: events.map((x) => x.e), beatFact: story.facts.find((f) => f.id === events[0].card.fact) };
}

test('ST1: every beat gives its news a headline, and tells itself in its own words (no "Grave news", no "The ravens carry the word")', () => {
  const missing = []; let n = 0;
  for (const b of BEATS) for (const v of tellings(b)) {
    // (the King's ride is told by its stage: where it is, and where it has come)
    if (/^kings_ride\.(progress|arrival)$/.test(b.id)) continue;
    const r = told(b, v.fire, 'stark') || told(b, v.fire, 'lannister'); if (!r) continue;
    for (const e of r.events) { n++; if (!e.head) missing.push(`${v.label}: "${e.title}"`); }
  }
  assert.ok(n >= 60, `${n} beat events read`);
  assert.deepEqual(missing, [], 'a beat with no headline is told as "Grave news reaches…"');
});

test('ST1: the card of a beat is its own headline and its own telling, and the scorer passes it, whoever plays', () => {
  const faults = []; const generic = []; let cards = 0;
  for (const house of HOUSES) for (const b of BEATS) for (const v of tellings(b)) {
    const r = told(b, v.fire, house); if (!r) continue;
    const c = cardOf(r.s, r.story); const sc = scoreCard({ headline: c.headline, summary: c.summary }, r.story, r.s); cards++;
    if (!sc.pass) faults.push(`[${house}] ${v.label}: "${c.headline}" / "${c.summary}" — ${sc.detail.map((d) => `${d.rule}: ${d.text}`).join('; ')}`);
    // and the beat told alone: the clusterer may cut a story where its dead or its captives are, and a headline that claims "dies" or "falls to" must not lean on a fact that may be in another card
    const alone = { facts: [r.beatFact] }; const ca = cardOf(r.s, alone); const sa = scoreCard({ headline: ca.headline, summary: ca.summary }, alone, r.s);
    if (!sa.pass) faults.push(`[${house}] ${v.label} (told alone): "${ca.headline}" / "${ca.summary}" — ${sa.detail.map((d) => `${d.rule}: ${d.text}`).join('; ')}`);
    if (/grave news|ravens carry the word/i.test(`${c.headline} ${c.summary}`)) generic.push(`[${house}] ${v.label}: "${c.headline}" / "${c.summary}"`);
    // when the beat itself leads the story, its headline is the card's (a death or a battle in the story may lead it instead)
    if (c.lead === r.beatFact.id && r.beatFact.data?.head && !/^kings_ride\.(progress|arrival)$/.test(b.id)) assert.equal(c.headline, r.beatFact.data.head, `${v.label}: the card says what the beat says`);
  }
  assert.ok(cards >= 300, `${cards} cards told`);
  assert.deepEqual(generic, []);
  assert.deepEqual(faults, []);
});

test('ST1: the headline in a few cases the report names, word for word', () => {
  const head = (id, house = 'stark') => { const b = BEATS.find((x) => x.id === id); const r = told(b, b.st.fire, house); const c = cardOf(r.s, r.story); return { ...c, lead: r.story.facts.find((f) => f.id === c.lead).kind }; };
  assert.equal(head('kings_ride.the_fall').headline, 'Bran Stark is found broken beneath the old tower');
  assert.match(head('kings_ride.the_fall').summary, /sleeps and does not wake/);
  assert.equal(head('catspaw.assassin').headline, "An assassin enters Bran Stark's chamber with a Valyrian blade");
  assert.equal(head('last_hunt.boar').headline, 'King Robert is gored by a boar in the kingswood');
  assert.equal(head('the_wall.lord_commander').headline, "Jon Snow is chosen Lord Commander of the Night's Watch");
});

test('ST1: the writer reads the slots of a beat, not its title or text: a fact with no headline is told by the old line, whatever it is called, and one with a headline is told by it', () => {
  const s = createInitialState('agot_298', 'stark', { seed: 298 }); const day = dayNumber(s.meta.date); s.meta.clock = { turn: 1, from: day, to: day };
  const card = (title, data) => { const c = fact(s, 'canon_beat', { title, text: 'Bran Stark, who climbed every wall of Winterfell and never fell, is found broken at the foot of the old tower. He lives, but sleeps and does not wake.', where: 'stark', importance: 5, houses: ['stark'] }, { data: { stage: 'the_fall', ...data }, thread: 'kings_ride' }); return s.facts.find((f) => f.id === c.fact); };
  // (a fact from a save made before beats had a headline: its title is the chapter's name, not news)
  assert.match(cardOf(s, { facts: [card('The boy who fell at Winterfell', {})] }).headline, /^Grave news reaches/);
  const told = cardOf(s, { facts: [card('The boy who fell', { head: 'Bran Stark is found broken beneath the old tower', tale: 'Bran Stark is found broken at the foot of the old tower. He lives, but sleeps and does not wake.' })] });
  assert.equal(told.headline, 'Bran Stark is found broken beneath the old tower'); assert.equal(told.summary, 'He lives, but sleeps and does not wake.');
  // and the progress of the King still says where he is, with the road's own sentence
  const prog = fact(s, 'canon_beat', { title: 'The King rides north', text: 'x. y.', where: 'frey', importance: 4, houses: ['baratheon', 'stark'] }, { data: { stage: 'progress' }, thread: 'kings_ride' });
  assert.match(cardOf(s, { facts: [s.facts.find((f) => f.id === prog.fact)] }).summary, /royal progress is on the road/);
});

test('N-002: every story hook is told by a card that names someone or somewhere, so the scorer (and the soak) take it', () => {
  const s = createInitialState('agot_298', 'stark', { seed: 298 }); const day = dayNumber(s.meta.date); s.meta.clock = { turn: 1, from: day, to: day };
  const faults = [];
  for (const id of HOOK_IDS) for (const place of ['stark', 'pentos']) {
    const f = { id: 'f1.1', turn: 1, day, kind: 'hook', actors: [], houses: [s.holdings[place].owner], place, data: { hook: id }, importance: 2, vis: { scope: 'public' }, text: 'x' };
    const story = { facts: [f], place, houses: f.houses }; const c = cardOf(s, story); const sc = scoreCard({ headline: c.headline, summary: c.summary }, story, s);
    if (!sc.pass) faults.push(`${id} at ${place}: "${c.headline}" / "${c.summary}" — ${sc.detail.map((d) => `${d.rule}: ${d.text}`).join('; ')}`);
  }
  assert.deepEqual(faults, []);
});
