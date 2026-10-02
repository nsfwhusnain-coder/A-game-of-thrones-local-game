// The deterministic writer (docs/gdd/18-headlines.md §3.1; WP N3): a story of facts becomes a card a stranger can read — a
// headline that says what happened, one to three plain sentences that say why or how, and the numbers kept for the fold.
// It works from the facts' SLOTS (who, where, what the data says), never from `f.text` or `f.title`, and it is the floor
// under the narrator (N5): a model that is off or wrong leaves this card standing, so it is held to the same scorer.
//
//   cardOf(state, story)          → { headline, summary, details: [strings], kind, archetype, who: [ids], where, lead, rolled }
//   meanwhileOf(state, facts)     → one sentence for the small news of a week ('' for none)
//
// Pure: no I/O, no dice, no clock; the state, the story and its facts are read and never changed. The viewer is
// state.meta.player (whose friends' numbers are told exactly and everyone else's to two figures, in `details` only).
// A story from cluster.js and a bare list of facts (an old save, N6) get the same card: nothing here needs the clusterer's
// own fields — the lead, the archetype and the roll-up are worked out again from the facts.
import { HEAD, SUM, ALSO, DETAIL, ARCHETYPE, LEDE, ctxFor, say } from './heads.js';
import { dateOfDay, longDate } from '../time.js';
import { list } from './label.js';

const wordCount = (t) => String(t || '').trim().split(/\s+/).filter(Boolean).length;
const cap1 = (t) => t.charAt(0).toUpperCase() + t.slice(1);
/** A headline as it is printed: one line, no full stop, a capital, no doubled article. */
const tidy = (t) => cap1(String(t || '').replace(/\s+/g, ' ').replace(/\b(the|The) the\b/g, '$1').replace(/\s+([,.;])/g, '$1').replace(/[.;,\s]+$/, '').trim());

// ── The lead ─────────────────────────────────────────────────────────────────────────────────────────────────────────
// The fact the card is about: the weightiest, then the kind that reads as the news (LEDE); and a result before its cause
// whatever their weights (a tourney's host is told by its champion, a siege by its end).
const RESULT_OF = { tourney: ['tourney_result'], siege_begun: ['holding_fell'] };
const byWeight = (a, b) => b.importance - a.importance || (LEDE[b.kind] ?? 0) - (LEDE[a.kind] ?? 0) || a.day - b.day || (a.id < b.id ? -1 : 1);
function leadOf(facts) {
  let lead = [...facts].sort(byWeight)[0];
  const res = (RESULT_OF[lead.kind] || []).map((k) => facts.find((x) => x.kind === k)).find(Boolean);
  return res || lead;
}

// ── Roll-ups (C2) ────────────────────────────────────────────────────────────────────────────────────────────────────
// Three or more facts of one kind that are one errand (hosts leaving for Winterfell, houses answering a call) are told as
// one: "Five northern hosts march for Winterfell", the houses and their men in the fold.
const ROLLABLE = new Set(['set_out', 'call_answered', 'arrived', 'host_joined']);
function rollOf(facts, story) {
  const n = new Map(); for (const f of facts) if (ROLLABLE.has(f.kind)) n.set(f.kind, (n.get(f.kind) || 0) + 1);
  const [kind, count] = [...n.entries()].sort((a, b) => b[1] - a[1])[0] || [];
  if (!kind || count < 3 || (story?.rolled !== true && count * 2 < facts.length)) return null;
  const group = facts.filter((f) => f.kind === kind && !f.data?.against).sort((a, b) => a.day - b.day || (a.id < b.id ? -1 : 1));
  return group.length >= 3 ? { kind, group, rest: facts.filter((f) => !group.includes(f)) } : null;
}
/** The houses of a roll-up, once each, in the order of their days. */
const houseIds = (c, group) => [...new Set(group.map((f) => c.owner(f)).filter(Boolean))];
/** "northern hosts", "hosts of the Vale": the noun of a roll-up with its region, when all its houses share one. */
const REGION = { north: ['the North', 'northern'], westerlands: ['the Westerlands', 'western'], dorne: ['Dorne', 'Dornish'], iron_islands: ['the Iron Islands', 'ironborn'], vale: ['the Vale'], riverlands: ['the Riverlands'], reach: ['the Reach'], stormlands: ['the Stormlands'], crownlands: ['the Crownlands'] };
function regionNoun(c, hs, noun) {
  // one house alone is named (the story's own who), not placed: "Four Lannister hosts", not "four western hosts"
  if (hs.length === 1 && c.short(hs[0])) return `${c.short(hs[0])} ${noun === 'houses' ? 'banners' : noun}`;
  const rs = [...new Set(hs.map((h) => c.region(h)).filter(Boolean))];
  if (rs.length !== 1 || !REGION[rs[0]]) return noun;
  const [place, adj] = REGION[rs[0]];
  return adj ? `${adj} ${noun}` : `${noun} of ${place}`;
}
const rollHead = {
  set_out: (g, s, c) => {
    const host = g.filter((f) => f.data?.party && c.known.party(f.data.party) ? !['rider', 'envoy', 'retinue'].includes(c.known.party(f.data.party).kind) : !f.data?.why).length * 2 >= g.length;
    const hs = houseIds(c, g); const N = cap1(c.count(hs.length > 1 ? hs.length : g.length)); const to = c.dest(g.every((f) => f.data?.to === g[0].data?.to) ? g[0].data?.to : null);
    const noun = regionNoun(c, hs, host ? 'hosts' : 'lords');
    if (to) return c.pick(g[0], host ? [`${N} ${noun} march for ${to}`, `${N} ${noun} ride for ${to}`, `${N} ${noun} leave for ${to}`] : [`${N} ${noun} ride for ${to}`, `${N} ${noun} leave for ${to}`, `${N} ${noun} take the road to ${to}`]);
    const rs = regionCount(c, hs); const who = hs.length === 1 ? noun : host ? 'hosts' : 'lords';
    return c.pick(g[0], [`${N} ${who} ride out across ${rs}`, `${N} ${who} take the road across ${rs}`]);
  },
  call_answered: (g, s, c) => {
    const hs = houseIds(c, g); const N = cap1(c.count(hs.length > 1 ? hs.length : g.length)); const noun = regionNoun(c, hs, 'houses');
    const lg = [...new Set(g.map((f) => f.data?.liege || f.data?.to).filter(Boolean))].map((id) => (c.known.house(id) ? id : s.holdings?.[id]?.owner)).find((id) => c.known.house(id));
    if (!lg) return c.pick(g[0], [`${N} ${noun} answer the call`, `${N} ${noun} rally to the banners`]);
    return c.pick(g[0], [`${N} ${noun} answer ${c.hpos(lg)} call`, `${N} ${noun} rally to ${c.hs(lg)}`, `${N} ${noun} gather for ${c.hs(lg)}`]);
  },
  arrived: (g, s, c) => {
    const hs = houseIds(c, g); const N = cap1(c.count(hs.length > 1 ? hs.length : g.length)); const noun = regionNoun(c, hs, 'hosts');
    const p = g.every((f) => f.place === g[0].place) ? c.pl(g[0].place) : '';
    return p ? c.pick(g[0], [`${N} ${noun} reach ${p}`, `${N} ${noun} arrive at ${p}`]) : `${N} ${noun} finish the march`;
  },
  host_joined: (g, s, c) => {
    const hs = houseIds(c, g); const N = cap1(c.count(hs.length > 1 ? hs.length : g.length)); const noun = regionNoun(c, hs, 'houses');
    const other = [...new Set(g.flatMap((f) => f.houses || []))].find((h) => !hs.includes(h) && c.known.house(h)); const host = other ? c.host(other) : 'the host';
    const p = g.every((f) => f.place === g[0].place) ? c.pl(g[0].place) : '';
    return c.pick(g[0], [`${N} ${noun} join ${host}${p ? ` at ${p}` : ''}`, `${N} ${noun} bring their men to ${host}${p ? ` at ${p}` : ''}`]);
  },
};
/** "the North and the Reach": where a company of lords rides, by the regions of their houses. */
function regionCount(c, hs) {
  const n = new Map(); for (const h of hs) { const r = c.region(h); if (r && REGION[r]) n.set(r, (n.get(r) || 0) + 1); }
  const top = [...n.entries()].sort((a, b) => b[1] - a[1]).slice(0, 2).map(([r]) => REGION[r][0]);
  return top.length ? top.join(' and ') : 'the realm';
}
const days = (f) => (f.data?.eta && f.data.eta > f.day ? f.data.eta - f.day : f.data?.days || 0);
// how a house is named among others in a roll-up: a family by its plural ("Lockes"), anything else by its name ("Night's Watch")
const kin = (c, s, h) => (/^(?:paramount|major|minor|exile)$/.test(s.houses?.[h]?.rank || 'minor') ? c.plural(c.short(h)) : c.short(h));
const rollSum = {
  set_out: (g, s, c) => {
    const hs = houseIds(c, g); const names = hs.map((h) => kin(c, s, h)).filter(Boolean);
    const first = names.slice(0, 3);
    const long = [...g].sort((a, b) => days(b) - days(a))[0]; const sp = c.span(days(long));
    const purposes = purposeWords(g);
    const s1 = purposes ? `They ride to ${purposes}` : first.length ? `${list(first.length < names.length ? [...first, 'others'] : first)} were the first to leave` : '';
    const s2 = !purposes && sp && long.data?.to && names.length > 1 ? `The ${kin(c, s, c.owner(long))} have the longest road, ${sp}` : '';
    return [s1, s2].filter(Boolean).map((t) => `${t}.`).join(' ');
  },
  call_answered: (g, s, c, rest) => {
    const big = [...g].sort((a, b) => (b.data?.men || 0) - (a.data?.men || 0)).slice(0, 4).map((f) => c.owner(f)).filter(Boolean).map((h) => kin(c, s, h)).filter(Boolean);
    const to = g.every((f) => f.data?.to === g[0].data?.to) ? c.dest(g[0].data?.to) : '';
    const s1 = big.length ? `The ${list(big)} raised the largest hosts${to ? `, and all are bound for ${to}` : ''}` : '';
    const ref = rest.filter((f) => f.kind === 'call_refused').map((f) => (f.actors || []).find((id) => c.known.person(id))).filter(Boolean).map((id) => c.lordly(id));
    const s2 = ref.length === 1 ? `${ref[0]} alone refused` : ref.length ? `${list(ref)} refused` : '';
    return [s1, s2].filter(Boolean).map((t) => `${t}.`).join(' ');
  },
  arrived: () => '',
  host_joined: (g, s, c) => { const men = g.reduce((a, f) => a + (f.data?.men || 0), 0); return men ? `The host grows by ${c.body(men)}.` : ''; },
};
const PURPOSE = [[/feast/i, 'feasts'], [/hunt/i, 'hunts'], [/market/i, 'markets'], [/respects/i, 'courtesy calls'], [/quarrel/i, 'quarrels to settle'], [/pray|sept/i, 'shrines'], [/ward/i, 'wards to see'], [/tourney/i, 'a tourney']];
/** What a company of riders ride for, from the reasons of their facts: "feasts, hunts and markets". */
function purposeWords(g) {
  const found = []; for (const [re, w] of PURPOSE) if (g.some((f) => re.test(String(f.data?.why || '')))) found.push(w);
  return found.length ? list(found.slice(0, 3)) : '';
}
const rollDetail = (g, s, c) => g.flatMap((f) => DETAIL[f.kind]?.(f, s, c) || []);

// ── The card ─────────────────────────────────────────────────────────────────────────────────────────────────────────
/** The shortest telling that always passes: who, and a plain verb, by the kind of thing it is. */
const SHORT = {
  muster: (a) => `${a} calls for men`, march: (a) => `${a} takes the road`, battle: (a) => `${a} fights on`, siege: (a) => `${a} waits at the walls`, death: (a) => `${a} is mourned`,
  capture: (a) => `${a} is held`, court: (a) => `${a} holds court`, wedding: (a) => `${a} is honoured`, letter: (a) => `${a} sends word`, plot: (a) => `${a} plots`,
  omen: (a) => `Word of a sign reaches ${a}`, works: (a) => `${a} builds anew`, harvest: (a) => `Word of want reaches ${a}`, feast: (a) => `${a} holds a feast`, other: (a) => `Word reaches ${a}`,
};
const known = (state, id) => state.characters?.[id] || state.houses?.[id] || state.parties?.[id] || state.holdings?.[id];
function slotIds(facts) {
  const ids = new Set();
  const walk = (v) => { if (typeof v === 'string') ids.add(v); else if (Array.isArray(v)) v.forEach(walk); else if (v && typeof v === 'object') for (const [k, x] of Object.entries(v)) { ids.add(k); walk(x); } };
  for (const f of facts) walk([f.actors, f.houses, f.place, f.data]);
  return ids;
}
/** The whole telling of a summary: the lead's sentences, then what one other fact adds, never more than three sentences. */
function summaryOf(state, c, lead, others, roll) {
  let text = roll ? (rollSum[roll.kind]?.(roll.group, state, c, roll.rest) || '') : (SUM[lead.kind]?.(lead, state, c) || '');
  if (!roll) {
    for (const f of others) {
      const also = ALSO[f.kind]; if (!also || f.kind === lead.kind) continue;
      const t = also(f, state, c, lead); if (!t) continue;
      const joined = text ? `${text} ${t}` : t;
      if (joined.length <= 320 && (joined.match(/[.!?](?:\s|$)/g) || []).length <= 3) text = joined;
      break;
    }
  }
  return text.trim();
}
/**
 * The card of a story. `story`: { facts, place?, … } as cluster.js makes it, or a bare { facts }.
 * `opts.pin` (tests): a form index that forces every verb form in turn.
 */
export function cardOf(state, story, opts = {}) {
  const facts = [...(story?.facts || [])];
  if (!facts.length) return { headline: 'Word reaches the realm', summary: '', details: [], kind: 'legacy', archetype: 'other', who: [], where: story?.place || null, lead: null, rolled: false };
  const roll = rollOf(facts, story);
  const lead = roll ? roll.group[0] : leadOf(facts);
  const others = facts.filter((f) => f !== lead).sort(byWeight);
  const kind = lead.kind; const archetype = ARCHETYPE[kind] || 'other';
  const build = roll ? (c) => rollHead[roll.kind](roll.group, state, c) : (c) => (HEAD[kind] || (() => ''))(lead, state, c);
  // the fitting (18 §3.1): the whole telling, then no place, then short names, then the archetype's short form
  let c; let headline = '';
  for (let level = 0; level <= 3; level++) {
    c = ctxFor(state, { ...story, facts }, { level: Math.min(level, 2), pin: opts.pin });
    headline = tidy(level < 3 ? build(c) : (SHORT[archetype] || SHORT.other)(c.subj(lead)));
    if (wordCount(headline) >= 3 && wordCount(headline) <= 12 && headline.length <= 80) break;
  }
  const full = ctxFor(state, { ...story, facts }, { pin: opts.pin });
  const summary = summaryOf(state, full, lead, others, roll);
  const details = [...new Set([
    ...(roll ? rollDetail(roll.group, state, full) : DETAIL[kind]?.(lead, state, full) || []),
    ...(roll ? [] : others.filter((f) => f.kind !== kind).flatMap((f) => DETAIL[f.kind]?.(f, state, full) || [])).slice(0, 4),
    Number.isFinite(lead.day) ? `On ${longDate(dateOfDay(lead.day))}.` : '',
  ].filter((t) => typeof t === 'string' && t.trim()))];
  const ids = slotIds(facts);
  let who = c.used.filter((id) => known(state, id) && ids.has(id));
  if (!who.length) who = [...new Set([...(lead.actors || []), ...(lead.houses || [])])].filter((id) => known(state, id) && ids.has(id)).slice(0, 3);
  return { headline, summary, details, kind, archetype, who, where: story?.place ?? lead.place ?? facts.find((f) => f.place)?.place ?? null, lead: lead.id, rolled: !!roll };
}

// ── The Meanwhile (C7) ───────────────────────────────────────────────────────────────────────────────────────────────
const REGION_NAME = { north: 'the North', vale: 'the Vale', riverlands: 'the Riverlands', westerlands: 'the Westerlands', reach: 'the Reach', stormlands: 'the Stormlands', dorne: 'Dorne', crownlands: 'the Crownlands', iron_islands: 'the Iron Islands', wall: 'the Wall', beyond: 'the lands beyond the Wall', essos: 'Essos' };
const SING = { feasts: 'a feast', hunts: 'a hunt', markets: 'a market', 'courtesy calls': 'a courtesy call', 'quarrels to settle': 'a quarrel to settle', shrines: 'a shrine', 'wards to see': 'a ward to see', 'a tourney': 'a tourney' };
const TALK = {
  court: (p) => `the households of ${p} have small news`, economy: (p) => `merchants of ${p} talk of prices and tolls`, war: (p) => `raiders and deserters trouble the roads near ${p}`,
  religion: (p) => `pilgrims and septons stir at ${p}`, rumor: (p) => `rumour runs at ${p}`, disaster: (p) => `misfortune strikes ${p}`, magic: (p) => `strange word comes from ${p}`,
  intrigue: (p) => `whispers pass between the houses of ${p}`, diplomacy: (p) => `ravens pass between the houses of ${p}`,
};
// ... but a place is a kind of place (ST14: "Merchants of Castle Black talk of prices and tolls", "pilgrims and septons stir at Norvos", a city of the Bearded Priests): the
// Wall's fortresses, the North's holds, the free cities and a castle's steward have their own small news
const TALK_AT = {
  economy: { wall: (p) => `the brothers count their stores at ${p}`, hold: (p) => `the steward of ${p} reckons the stores`, essos: (p) => `traders of ${p} talk of ships and tolls` },
  religion: { wall: (p) => `the brothers keep their vigil at ${p}`, north: (p) => `the old gods are honoured at ${p}`, essos: (p) => `the priests of ${p} keep their rites` },
  court: { wall: (p) => `the Watch has small news at ${p}` },
  intrigue: { wall: (p) => `whispers pass among the brothers at ${p}`, essos: (p) => `whispers pass among the great houses of ${p}` },
  diplomacy: { wall: (p) => `riders come and go at ${p}`, essos: (p) => `envoys pass between the great houses of ${p}` },
};
/** The kind of place, for the small news: the Wall's, a free city's, the North's, a town's, a castle's. */
const placeClass = (c, id) => { const h = c.s.holdings?.[id]; if (!h) return 'town'; if (/^(wall|beyond)$/.test(h.region)) return 'wall'; if (h.region === 'essos') return 'essos'; if (/city|town|palace/.test(h.type || '')) return h.region === 'north' ? 'north' : 'town'; return h.region === 'north' ? 'north' : 'hold'; };
const KIND_TALK = { feast: (p) => `lords feast at ${p}`, tourney_result: (p) => `knights ride the lists at ${p}`, works_begun: (p) => `masons are busy at ${p}`, works_done: (p) => `masons finish their work at ${p}`, hook: (p) => `small quarrels stir at ${p}` };
/** The small news of a week as one sentence, at most three clauses: "Lords ride to feasts and hunts across the Reach; a Pentoshi ship is lost off Widow's Watch." */
export function meanwhileOf(state, facts) {
  const fs = (facts || []).filter((f) => f && f.kind); if (!fs.length) return '';
  const c = ctxFor(state, { facts: fs });
  const clauses = [];
  // journeys: lords riding to feasts and hunts
  const rides = fs.filter((f) => f.kind === 'set_out' && !f.data?.against);
  if (rides.length) {
    const ps = rides.map((f) => c.known.person((f.actors || [])[0])).filter(Boolean);
    const women = ps.filter((p) => p.sex === 'f').length; const who = !ps.length || women === 0 ? 'lord' : women === ps.length ? 'lady' : 'lord and lady';
    const purposes = []; for (const [re, w] of PURPOSE) if (rides.some((f) => re.test(String(f.data?.why || '')))) purposes.push(w);
    const rn = new Map(); for (const f of rides) { const r = c.region(c.owner(f)); if (r && REGION_NAME[r]) rn.set(r, (rn.get(r) || 0) + 1); }
    const where = [...rn.entries()].sort((a, b) => b[1] - a[1]).slice(0, 2).map(([r]) => REGION_NAME[r]);
    const across = where.length ? where.join(' and ') : 'the realm';
    if (rides.length === 1) clauses.push(`a ${who.split(' ')[0]} rides ${purposes[0] ? `to ${SING[purposes[0]]}` : 'out'} in ${across}`);
    else clauses.push(`${who === 'lord' ? 'lords' : who === 'lady' ? 'ladies' : 'lords and ladies'} ride ${purposes.length ? `to ${list(purposes.slice(0, 3))}` : 'out'} across ${across}`);
  }
  // a wreck: "a Pentoshi ship is lost off Widow's Watch"
  const wreck = fs.find((f) => f.kind === 'lost_at_sea');
  if (wreck) {
    const d = wreck.data || {}; const n = Number(d.ships) || 0; const flag = { pentos: 'Pentoshi', braavos: 'Braavosi', myr: 'Myrish', tyrosh: 'Tyroshi', lys: 'Lysene', greyjoy: 'ironborn' }[(wreck.houses || [])[0]] || '';
    const where = c.off(wreck.place) || ' at sea';
    clauses.push(n > 1 ? `${say(n) || 'several'} ${flag ? `${flag} ` : ''}ships are lost${where}` : `a ${flag ? `${flag} ` : ''}ship is lost${where}`);
  }
  // the rest, by the kind of thing it was: the small life of the realm
  const rest = fs.filter((f) => f.kind !== 'set_out' && f.kind !== 'lost_at_sea');
  const groups = new Map();
  for (const f of rest) {
    const type = f.kind === 'happening' ? (c.s.holdings && TALK[hapType(f)] ? hapType(f) : 'rumor') : f.kind;
    const say1 = f.kind === 'happening' ? TALK[type] : KIND_TALK[f.kind];
    if (!say1) continue;
    const cls = f.kind === 'happening' ? placeClass(c, f.place) : ''; const key = `${type}|${cls}`; const own = TALK_AT[type]?.[cls];
    const g = groups.get(key) || { say: own || say1, places: [] }; const p = c.pl(f.place); if (p && !g.places.includes(p)) g.places.push(p); groups.set(key, g);
  }
  for (const g of [...groups.values()].sort((a, b) => b.places.length - a.places.length)) {
    if (clauses.length >= 3) break;
    if (g.places.length) clauses.push(g.say(list(g.places.slice(0, 2))));
  }
  if (!clauses.length) {
    const places = [...new Set(fs.map((f) => c.pl(f.place)).filter(Boolean))].slice(0, 2);
    clauses.push(places.length ? `small news comes from ${list(places)}` : 'small news comes from across the realm');
  }
  const text = clauses.slice(0, 3).join('; ');
  const out = `${cap1(text)}.`;
  return out.length <= 200 ? out : `${cap1(clauses.slice(0, 2).join('; '))}.`.slice(0, 200).replace(/[^.]*$/, (m) => (m.includes('.') ? m : '')) || `${cap1(clauses[0])}.`;
}
import { HAPPENINGS } from '../../../data/happenings.js';
const HAP_TYPES = new Map(HAPPENINGS.map((h) => [h.id, h.type]));
const hapType = (f) => (HAP_TYPES.get(f.data?.tpl) === 'rumor' || !HAP_TYPES.has(f.data?.tpl) ? 'rumor' : HAP_TYPES.get(f.data.tpl));
