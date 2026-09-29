// A throwaway reference reading of docs/gdd/18 §5.2 + the lead's decisions, only to check that the fixtures are
// self-consistent. It is NOT the builder's scorer and lives outside the repo.
import { namesIn, storyWorld, numbersIn, numbersOf, sentencesOf, GAME_WORDS } from '/home/user/wc-s1/server/ai/validate/narration.js';
import { FORBIDDEN_EXACT } from '/home/user/wc-s1/public/data/style.js';
import fs from 'node:fs';

const G = JSON.parse(fs.readFileSync('/home/user/wc-s1/tests/fixtures/headlines/golden.json', 'utf8'));
export const BOILER = ['is raised at', 'sets out from', 'begins works at', 'calls up [\\d,]+ levies', 'answers the call with', 'the host now numbers', '\\bstrong\\b', 'House The\\b', 'Banners of', 'House [A-Z][\\w\']+ of [A-Z]', '\\brides for\\b', '\\bimportance\\b', '\\bfact\\b', '\\bstory\\b', '\\bmorale\\b'].map((x) => new RegExp(x, 'i'));
const JARGON = [/\blevies\b/i, /\bcharter\b/i, /\bworks\b/i, /~/];
const extra = 'refuses refused slain slays slew slay beats beaten beat defeats defeated routs routed fight fights fought marches march marched rides ride rode raises raise raised gathers gather gathered calls call called answers answer answered dies died die captured captures capture takes taken took holds hold held opens open opened builds building begins begin began writes write wrote reaches reach reached sails sail sailed crowned crowns proclaims proclaimed weds wed betrothed spread spreads scatters scattered sinks sank blankets weeps born fills grips wins won win besieges besiege lays storms storm falls fell betrayed beheads beheaded hanged hangs burn burns burned wrecked grow grows breaks break broke turns'.split(' ');
const VERBS = new Set(extra);
const OUTCOME = [[/\b(slain|slays?|slew)\b/i, ['slain_in_battle', 'executed', 'death']], [/\b(captured|captures?)\b/i, ['captured_in_battle', 'captured', 'hostage_taken']], [/\b(wins?|won|beats?|beaten|defeats?|defeated|routs?|routed)\b/i, ['battle', 'sea_battle', 'tourney_result', 'rout']], [/\b(falls?|fell)\b/i, ['holding_fell', 'storm_assault']], [/\bcrowned\b/i, ['crowned']], [/\b(weds?|wed|married)\b/i, ['wedding']], [/\bbetrothed\b/i, ['betrothal']], [/\b(beheads?|beheaded|hangs?|hanged|executed)\b/i, ['executed']], [/\b(dies|died|dead)\b/i, ['death', 'slain_in_battle', 'executed']]];
const toks = (t) => String(t).toLowerCase().match(/[a-z][a-z'’-]*/g)?.map((w) => w.replace(/['’]s$/, '')) || [];
export const overlaps = (h, s) => { const H = new Set(toks(h)), S = new Set(toks(s)); const both = [...H].filter((w) => S.has(w)).length; return { cover: both / H.size, coverS: both / S.size, jac: both / new Set([...H, ...S]).size }; };
const houseOfName = (state, id) => state.characters[id]?.house;

export function scoreCard(card, story, state) {
  const F = new Set(); const h = String(card.headline || '').trim(); const sm = card.summary == null ? '' : String(card.summary);
  const w = h.split(/\s+/).filter(Boolean);
  if (w.length < 3 || w.length > 12 || h.length > 80) F.add('len');
  if (sm) { if (sentencesOf(sm).length > 3 || sm.length > 340) F.add('len'); }
  const facts = story.facts || [];
  const W = storyWorld(state, { ...story, facts });
  // who
  const lc = h.toLowerCase();
  const whoNames = [...(story.must || [])];
  for (const f of facts) { for (const a of f.actors || []) { const c = state.characters[a]; if (c) whoNames.push(c.name.replace(/\s*"[^"]+"\s*/g, ' ').replace(/^(Ser|Lord|Lady|Maester)\s+/, '')); } if (f.place && state.holdings[f.place]) whoNames.push(state.holdings[f.place].name.replace(/^The /, '')); for (const x of f.houses || []) if (state.houses[x]) whoNames.push(state.houses[x].name.replace(/ of .*/, '')); }
  const found = namesIn(state, h);
  if (!whoNames.some((n) => n && lc.includes(n.toLowerCase().replace(/^the /, ''))) && !found.some((n) => (n.kind === 'person' && W.people.has(n.id)) || (n.kind === 'place' && W.places.has(n.id)))) F.add('who');
  // invented
  for (const t of [h, sm]) for (const n of namesIn(state, t)) { if (n.kind === 'person' && !W.people.has(n.id)) F.add('invented'); if (n.kind === 'place' && !W.places.has(n.id)) F.add('invented'); if (n.kind === 'party' && !W.parties.has(n.id)) F.add('invented'); }
  for (const m of story.mustNot || []) if ((h + ' ' + sm).toLowerCase().includes(m.toLowerCase())) F.add('invented');
  // verb
  if (!toks(h).some((x) => VERBS.has(x))) F.add('verb');
  // numbers
  for (const t of [h, sm]) {
    if (/\d|~/.test(t)) F.add('numbers');
    const ns = numbersIn(t).filter((n) => n > 12);
    for (const n of ns) if (!numbersOf(facts).some((x) => Math.abs(x - n) <= Math.max(1, x * 0.02))) F.add('numbers');
  }
  if (numbersIn(h).length > 1) F.add('numbers');
  // punct
  if (/[():;—–…]|\.\.\./.test(h) || /\.$/.test(h) || /\.\s/.test(h)) F.add('punct');
  if (sm && (/…|\.\.\./.test(sm) || !/[.]$/.test(sm.trim()))) F.add('punct');
  // boiler
  for (const t of [h, sm]) { for (const re of [...GAME_WORDS, ...BOILER, ...JARGON]) if (re.test(t)) F.add('boiler'); }
  // roles
  const passive = h.match(/^(.+?) (slain|captured|beaten|defeated) by (.+?)(?: (?:at|near|in) .*)?$/i);
  const active = h.match(/^(.+?) (slays|beats|defeats|captures) (.+?)(?: (?:at|near|in) .*)?$/i);
  const who = (t) => namesIn(state, t)[0];
  const check = (patient, agent, verb) => {
    const p = who(patient), a = who(agent);
    for (const f of facts) {
      if (['slain_in_battle', 'executed', 'captured_in_battle', 'captured'].includes(f.kind) && /slain|slays|captured|captures/i.test(verb)) {
        const by = f.data?.by; const byHouse = state.characters[by]?.house || by;
        if (p?.kind === 'person' && p.id === by) F.add('roles');
        if (a?.kind === 'person' && a.id === f.actors[0]) F.add('roles');
        if (p?.kind === 'person' && f.actors[0] && p.id !== f.actors[0] && a?.kind === 'person' && a.id === f.actors[0]) F.add('roles');
      }
      if (f.kind === 'battle' && /beats|beaten|defeat/i.test(verb) && f.data?.winnerHouse) {
        const wh = a?.kind === 'person' ? houseOfName(state, a.id) : null; const lh = p?.kind === 'person' ? houseOfName(state, p.id) : null;
        if (wh && lh && (wh === f.data.loserHouse || lh === f.data.winnerHouse)) F.add('roles');
      }
    }
  };
  if (passive) check(passive[1], passive[3], passive[2]);
  if (active) check(active[3], active[1], active[2]) ; // (active: subject is the agent)
  // dup
  if (sm) { const o = overlaps(h, sm.replace(/\.$/, '')); if (o.cover >= 0.8 || o.coverS >= 0.8 || o.jac >= 0.8) F.add('dup'); }
  // outcome
  for (const [re, kinds] of OUTCOME) if (re.test(h) && !facts.some((f) => kinds.includes(f.kind))) F.add('outcome');
  return { pass: F.size === 0, faults: [...F] };
}
export { G };
