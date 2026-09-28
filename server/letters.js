// Letters as things of their own (docs/gdd/04-ai-system.md §8.2; 03-architecture.md §3.5). A lord's words to someone
// far away are a letter: it flies for days, and only when it lands is it read. The one it reaches weighs it then — in
// the mood and the world of that day — and answers in their own hand (the audience call, by letter); what they promise
// dates from that day and is private. The answer flies back and reaches the lord's inbox, the conversation and the
// chronicle on the day it lands. `state.post` holds them all: the lord's letters (`from` the lord, or older ones with no
// `from`) and the answers (`reply: true`).
import { runCall } from './ai/client.js';
import { replyText, promisesIn } from './ai/calls/audience.js';
import { weighAudience, holdToVerdict, moodWord } from '../public/js/shared/temperament.js';
import { applyChanges, dateStr, placeName } from '../public/js/shared/world.js';
import { dayNumber, dateOfDay } from '../public/js/engine/time.js';
import { fact } from '../public/js/engine/facts/log.js';
import { makeCommitment, COMMITMENTS } from '../public/js/engine/politics/commitments.js';
import { learn } from '../public/js/engine/knowledge.js';
import { placeOf, partyOf } from '../public/js/engine/parties.js';
import { nextId } from '../public/js/engine/ids.js';
import { resolvePlaceId } from '../public/js/shared/world.js';

const firstSentence = (t) => String(t).replace(/\*[^*]*\*/g, ' ').replace(/\s+/g, ' ').trim().split(/(?<=[.!?])\s/)[0] || '';

/**
 * The letters of a turn: the lord's that land are read and answered; the answers that land are delivered. Returns the
 * cards of the answers for the chronicle. opts: { provider, cfg, log, known(house) → facts, memory(person, words) → the relevant memory's text }.
 */
export async function deliverLetters(state, { provider = 'mock', cfg, log, known = () => [], memory = () => '' } = {}) {
  const clock = state.meta.clock; if (!clock) return [];
  const p = state.meta.player; const lordId = state.houses[p].lord; const lord = state.characters[lordId];
  const today = dayNumber(state.meta.date); const cards = [];
  state.post = state.post || [];
  // the lord's letters that land this turn: read, weighed and answered on the day they land
  for (const l of [...state.post]) {
    if (l.reply || l.status !== 'in flight' || l.arriveDay > clock.to) continue;
    l.status = 'delivered'; l.delivered = l.arriveDay;
    const c = state.characters[l.to];
    if (!c?.alive || c.house === p || l.answered) continue;
    const stance = weighAudience(state, c, l.text);
    const r = await runCall('audience', state, { character: c.id, words: l.text, stance, face: false, known: known(c.house), memory: memory(c, l.text) }, { provider, cfg, log });
    const v = r.value; if (!v?.beats) continue;
    const back = Math.max(1, l.days || 1);
    // what the verdict settles of a proposal (a pact, fealty) and what it leaves in their memory, from the day it lands
    const settled = applyChanges(state, holdToVerdict(state, c, stance, []), { source: `${c.name}'s answer`, protectPlayer: true, cause: { type: 'intent', ref: c.id }, on: l.arriveDay - clock.from + 1 });
    const promised = promisesIn(v, r.ctx || {}).map((x) => makeCommitment(state, { by: c.id, to: lordId, kind: x.kind, params: x.params, days: x.days, source: { type: 'letter', ref: l.id }, publicity: 'private', on: l.arriveDay - today }));
    if (v.outcome?.reveals === 'their_secret' && c.secret && !c.secretKnown) reveal(state, c, p);
    l.answered = true;
    state.post.unshift({
      id: nextId(state, 'post'), reply: true, replyTo: l.id, from: c.id, fromName: c.name, to: lordId, toName: lord?.name, text: replyText(v),
      sent: dateStr(dateOfDay(l.arriveDay)), sentDay: l.arriveDay, arriveDay: l.arriveDay + back, days: back, status: 'in flight',
      verdict: stance.verdict || null, mood: moodWord(stance.mood), applied: [...settled.applied.map((a) => a.text), ...promised.map((x) => `Promises to ${COMMITMENTS[x.kind].says(state, x)} within ${x.dueDay - x.madeDay} days`)],
    });
  }
  // the answers that land this turn: the inbox, the conversation, the chronicle
  for (const a of [...state.post]) {
    if (!a.reply || a.status !== 'in flight' || a.arriveDay > clock.to) continue;
    a.status = 'delivered'; a.delivered = a.arriveDay;
    const c = state.characters[a.from]; if (!c) continue;
    const date = dateStr(dateOfDay(a.arriveDay));
    state.ravens = state.ravens || [];
    state.ravens.unshift({ id: nextId(state, 'r'), day: a.arriveDay, from: c.id, fromName: c.name, to: lordId, text: a.text.replace(/\*[^*]*\*/g, '').trim(), date, read: false });
    const wait = (state.chats[c.id] || []).find((m) => m.pending && m.letter === a.replyTo);
    if (wait) Object.assign(wait, { text: a.text, date, applied: a.applied, mood: a.mood, ...(a.verdict ? { verdict: a.verdict } : {}), pending: false });
    const orig = state.post.find((x) => x.id === a.replyTo); if (orig) orig.status = 'answered';
    const pp = partyOf(state, c); const whence = pp ? (pp.kind === 'rider' ? 'the road' : `the camp of ${pp.name}`) : placeName(state, placeOf(state, c) || c.loc);
    cards.push(fact(state, 'letter_arrived', {
      title: `${c.name} answers ${lord?.name || 'the lord'}`, text: `A raven from ${whence}: “${firstSentence(a.text).slice(0, 220)}”${a.applied?.length ? ` — ${a.applied.join('; ')}` : ''}`,
      where: resolvePlaceId(placeOf(state, lord) || lord?.loc) || state.houses[p].seat || null, importance: 3, houses: [p, c.house], mine: true, day: a.arriveDay - clock.from + 1,
    }, { actors: [c.id, lordId], data: { from: c.id, reply: true, letter: a.id }, vis: { scope: 'houses', houses: [p, c.house] } }));
  }
  state.post = state.post.slice(0, 60);
  return cards;
}

/** A secret let slip, in an audience or a letter: known to the lord's house by confession (invariant 9). */
export function reveal(state, c, house) {
  const before = (state.facts || []).length;
  applyChanges(state, [{ op: 'character', id: c.id, revealSecret: true }], { cause: { type: 'intent', ref: c.id } });
  for (const f of (state.facts || []).slice(before)) if (f.kind === 'secret_revealed') learn(state, house, f, { via: 'confession' });
}
