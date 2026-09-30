// A matter as a sealed letter (docs/gdd/12-ui-ux.md §10; WP F6). Someone brings a matter before the lord — a petition, the King's call, a rising — and it waits its days;
// then the world decides without them (server/game.js closeTurn). The player should see three things at a glance: who asks and what (a few sentences), what each
// answer will do (a line each), and what happens if they say nothing — and how long they have. This is the pure side: the days left, silence in words, the letter's
// parts and its markup, so node can hold it to the engine (the words of silence are read from what the engine will actually do).
import { decisionDaysLeft, leftWord } from '../shared/pins.js';
import { waxOf } from './heraldry.js';
import { placeName } from '../shared/world.js';

const houseName = (s, id) => (s.houses?.[id] ? `House ${s.houses[id].name}` : 'a house');
const shortName = (c) => String(c?.name || '').replace(/^(Ser|Lord|Lady|Maester|Septon|Septa)\s+/, '');

/** Days until the world decides without the lord (shared/pins.js), or null when there is no reckoning. */
export const daysLeftOf = decisionDaysLeft;
export { leftWord };
/** How pressing: `late` (the last two days), `soon` (within five), `far`, `''` when unknown. */
export const toneOfLeft = (n) => (n == null ? '' : n <= 2 ? 'late' : n <= 5 ? 'soon' : 'far');

/** Who is asking, as a name a lord would use: "the King" for the King, else the person's name. */
export function askerOf(s, d) {
  const c = d.from ? s.characters?.[d.from] : null; if (!c) return { id: null, name: '', word: 'The realm', house: null };
  const t = String(c.title || '');
  const word = /^King\b/.test(t) ? 'The King' : /^Queen\b/.test(t) ? 'The Queen' : c.name;
  return { id: c.id, name: c.name, word, title: t, house: c.house || null };
}

const pushWord = (out, w) => { if (w && !out.includes(w)) out.push(w); };
const cap = (t) => t.replace(/^./, (x) => x.toUpperCase());

/**
 * What silence does, in the words a lord would use, from what the engine will do when the matter lapses (server/game.js closeTurn): the King's call is refused, a rising goes
 * unanswered, a house that rebels takes itself out of the realm, and the matter's own `lapse` — a house cooler to you, a quarrel that festers, unrest — is read effect by
 * effect. `{ line, tone }`; `tone` is `bad` when it costs something, `quiet` when nothing comes of it.
 */
export function silenceOf(s, d) {
  const asker = askerOf(s, d); const out = []; let bad = false;
  if (d.kind === 'liege_call' || d.matter === 'liege_call') { pushWord(out, `${asker.word || 'The King'} will take your silence as a refusal`); bad = true; }
  const fx = (d.options || []).flatMap((o) => o.fx || []);
  const rising = fx.find((e) => e.rising), rebel = fx.find((e) => e.rebel);
  if (rising) { pushWord(out, 'the rising goes unanswered'); bad = true; }
  if (rebel) { pushWord(out, 'they take themselves out of your realm'); bad = true; }
  for (const e of d.lapse || []) {
    if (e.rel) { const [h, n] = e.rel; if (n < 0) { pushWord(out, `${houseName(s, h)} will think less of you`); bad = true; } else if (n > 0) pushWord(out, `${houseName(s, h)} will think the better of you`); }
    if (e.rel2) { const [a, b, n] = e.rel2; if (n < 0) { pushWord(out, `${houseName(s, a)} and ${houseName(s, b)} grow more bitter`); bad = true; } else if (n > 0) pushWord(out, `${houseName(s, a)} and ${houseName(s, b)} grow closer`); }
    if (e.unrestAll > 0) { pushWord(out, 'unrest grows in your lands'); bad = true; }
    if (e.unrest && e.unrest[1] > 0) { const h = s.holdings?.[e.unrest[0]]; pushWord(out, `unrest grows${h ? ` at ${placeName(s, h.id)}` : ''}`); bad = true; }
    if (e.prosperity && e.prosperity[1] < 0) { const h = s.holdings?.[e.prosperity[0]]; pushWord(out, h ? `${placeName(s, h.id)} grows poorer` : 'the land grows poorer'); bad = true; }
    if (e.loyalty && e.loyalty[1] < 0) { const c = s.characters?.[e.loyalty[0]]; pushWord(out, c ? `${shortName(c)}'s loyalty wanes` : 'a lord\'s loyalty wanes'); bad = true; }
    if (e.gold && e.gold < 0) { pushWord(out, 'it will cost you gold'); bad = true; }
  }
  if (!out.length) return { line: 'Nothing comes of it, and the matter passes', tone: 'quiet' };
  return { line: cap(out.join('; ')), tone: bad ? 'bad' : 'quiet' };
}

const sentencesOf = (t) => String(t || '').replace(/\s+/g, ' ').trim().split(/(?<=[.!?])\s+/).filter(Boolean);

/**
 * The letter as parts a screen can lay out: `{ id, title, asker, wax, date, gist (the first three sentences), rest (any others), options: [{ i, label, hint }], daysLeft, left,
 * tone, clock (the line under the letter), silence: { line, tone } }`.
 */
export function matterOf(s, d) {
  const asker = askerOf(s, d); const n = daysLeftOf(s, d); const sents = sentencesOf(d.text);
  const h = asker.house ? s.houses?.[asker.house] : null; const arms = h?.sigil;
  const left = leftWord(n);
  const clock = n == null ? '' : `${asker.id && /^The (King|Queen)$/.test(asker.word) ? `${asker.word} will not wait` : 'It will not wait'} — ${left}`;
  return {
    id: d.id, title: d.title, asker, date: d.date || '', wax: arms?.f ? waxOf(arms.f, arms.cc || arms.f) : null,
    gist: sents.slice(0, 3).join(' '), rest: sents.slice(3).join(' '),
    options: (d.options || []).map((o, i) => ({ i, label: o.label, hint: o.hint || '' })),
    daysLeft: n, left, tone: toneOfLeft(n), clock, silence: silenceOf(s, d),
  };
}

/**
 * The sealed letter as markup, in the classes the answering code already knows (`.decision`, `.dec-opt`, `.dec-note`, `.dec-custom`, `.dec-title`). `env`: `{ esc, por(c, size), icon }`.
 * "Say nothing" is a choice too: it puts the letter away and lets the days run.
 */
export function matterHtml(m, s, env, extra = {}) {
  const { esc, por, icon } = env; const who = m.asker.id ? s.characters[m.asker.id] : null;
  const from = who ? `<img class="wc-matter__face" src="${esc(por(who, 64))}" alt="">` : '';
  return `<div class="decision wc-matter wc-vellum" data-dec="${esc(m.id)}" data-left="${esc(m.tone)}">
    <div class="wc-matter__head"><span class="wc-seal wc-seal--small wc-matter__seal"${m.wax ? ` style="--wax:${esc(m.wax)}"` : ''} aria-hidden="true">${icon('seal', 'wc-matter__ico')}</span>${from}<div class="wc-matter__from"><span class="wc-kicker">${m.asker.id ? `From ${esc(m.asker.name)}` : 'A matter for your word'}${m.date ? ` · ${esc(m.date)}` : ''}</span>${m.asker.title ? `<span class="wc-matter__sub">${esc(m.asker.title)}</span>` : ''}</div>${extra.pos ? `<span class="wc-kicker wc-matter__pos">${esc(extra.place || '')}${extra.place ? ' · ' : ''}${esc(extra.pos)}</span>` : ''}</div>
    <h3 class="dec-title wc-title">${esc(m.title)}</h3><div class="wc-rule"></div>
    <p class="eb wc-prose">${esc(m.gist)}</p>${m.rest ? `<details class="wc-matter__more"><summary>More</summary><p class="wc-prose">${esc(m.rest)}</p></details>` : ''}
    ${m.clock ? `<div class="wc-matter__clock is-${esc(m.tone)}" data-days="${m.daysLeft}">${icon('hourglass', 'wc-matter__ico')}<span>${esc(m.clock)}</span></div>` : ''}
    <div class="dec-opts wc-matter__opts">${m.options.map((o) => `<button class="wc-btn dec-opt" data-dec-id="${esc(m.id)}" data-opt="${o.i}" title="${esc(o.hint)}"><span class="dec-label">${esc(o.label)}</span>${o.hint ? `<small class="dec-hint">${esc(o.hint)}</small>` : ''}</button>`).join('')}</div>
    <div class="wc-matter__silence is-${esc(m.silence.tone)}"><button class="wc-btn wc-btn--quiet dec-silence" title="Put the letter away; it waits${m.left ? ` (${esc(m.left)})` : ''}">Say nothing</button><span class="wc-matter__silence-line">${esc(m.silence.line)}.</span>${extra.later ? '<button class="wc-btn wc-btn--quiet wc-matter__later" id="pin-skip" title="Come back to this one after the next">Later ›</button>' : ''}</div>
    <details class="dec-own"><summary>Answer in my own words</summary><textarea class="input dec-note" rows="2" placeholder="Write your answer here (the button wakes when you do) — or add conditions to a choice above…"></textarea><button class="wc-btn wc-btn--small dec-custom" data-dec-id="${esc(m.id)}" disabled title="Write your answer in the box first">Send my answer</button></details></div>`;
}
