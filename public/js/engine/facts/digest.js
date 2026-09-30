// The week's news in one small block (docs/gdd/18-headlines.md §2.5; WP N6/N9), and the one shape every card has.
//
//   shapeCard(card)          → the card with headline, summary, details[] (an array), tier and score, whatever it was made as:
//                            the writer's and the narrator's cards already have them; the engine's own cards (a lord's order, a
//                            succession) and the cards of a save from before the headlines have `title`, `text` and a string
//                            `details`, which become the headline, the summary and one line of the fold. `title` and `text` stay,
//                            as aliases, for the surfaces not yet rewritten.
//   digestOf(cards, meanwhile) → { top: [{ id, headline, line }], also: [{ id, headline }], meanwhile, words, text }
//                            The Turn's digest: the top three cards by score, each as its headline and the first sentence of its
//                            summary; up to five more as headlines only ("Also"); then the Meanwhile sentence. At most 90 words in
//                            all, built up from whole pieces (a sentence is left out, never cut), by the engine from the cards, so
//                            it can never contradict them.
// Pure: no I/O, no dice, no clock.
import { tierOf } from './rank.js';

export const DIGEST_WORDS = 90;
const ALSO_MAX = 5;
const words = (t) => String(t || '').trim().split(/\s+/).filter(Boolean).length;
const stop = (t) => String(t || '').trim().replace(/[.!?…]+$/, '');
/** The first sentence of a summary, whole. */
export function firstSentence(t) {
  const s = String(t || '').replace(/\s+/g, ' ').trim(); if (!s) return '';
  const m = s.match(/^.*?[.!?]["”’]?(?=\s+[A-Z“"‘']|$)/);
  return (m ? m[0] : s).trim();
}

/** A card in the one shape (see the head of this file). Never changes the card it is given. */
export function shapeCard(c) {
  if (!c || typeof c !== 'object') return c;
  const headline = String(c.headline || c.title || '').trim();
  const summary = String(c.summary ?? c.text ?? '').trim();
  const details = Array.isArray(c.details) ? c.details.filter((d) => typeof d === 'string' && d.trim()) : typeof c.details === 'string' && c.details.trim() ? [c.details.trim()] : [];
  const importance = c.importance || 1;
  const score = Number.isFinite(c.score) ? c.score : importance + (c.mine ? 1 : 0);
  const tier = c.tier || (c.bg ? 'meanwhile' : tierOf(score));
  return { ...c, headline, summary, title: headline, text: summary, details, tier, score, told: c.told || 'engine' };
}

/** The plain text of a digest's parts. */
const textOf = (top, also, m) => [
  ...top.map((t) => `${stop(t.headline)}.${t.line ? ` ${t.line}` : ''}`),
  also.length ? `Also: ${also.map((a) => stop(a.headline)).join('; ')}.` : '',
  m,
].filter(Boolean).join(' ');

/** The digest of a turn's cards (any shape) and its Meanwhile sentence(s). */
export function digestOf(cards, meanwhile = '') {
  const news = (cards || []).filter((c) => c && !c.bg && (c.headline || c.title)).map((c, i) => [shapeCard(c), i])
    .sort((a, b) => b[0].score - a[0].score || (a[0].day || 0) - (b[0].day || 0) || a[1] - b[1]).map(([c]) => c);
  const top = []; const also = []; let m = '';
  const one = (c, sentence) => ({ id: c.id ?? null, headline: c.headline, ...(sentence ? { line: sentence } : {}) });
  const fits = (t, a, x) => words(textOf(t, a, x)) <= DIGEST_WORDS;
  // the top three: a headline and its first sentence each, or the headline alone when the sentence will not fit
  for (const c of news.slice(0, 3)) {
    let line = firstSentence(c.summary); if (stop(line) === stop(c.headline)) line = ''; // (a card told as it was made says its headline twice)
    // room is kept for the two headlines that may still follow
    const reserve = top.length < 2 ? 8 : 0;
    if (line && words(textOf([...top, one(c, line)], also, m)) <= DIGEST_WORDS - reserve) top.push(one(c, line));
    else if (fits([...top, one(c)], also, m)) top.push(one(c));
  }
  // then up to five more as headlines only
  for (const c of news.slice(top.length, top.length + ALSO_MAX)) {
    if (!fits(top, [...also, one(c)], m)) break;
    also.push(one(c));
  }
  // the Meanwhile: the first sentence there is, if it fits
  const mw = firstSentence(meanwhile);
  if (mw && fits(top, also, mw)) m = mw;
  const text = textOf(top, also, m);
  return { top, also, meanwhile: m, words: words(text), text };
}
