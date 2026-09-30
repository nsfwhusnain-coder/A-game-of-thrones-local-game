// Build the interpret fine-tuning set from the game's own machinery.
//   node build_interpret.mjs --out C:\wc-ai\finetune\data --worlds 90 --per 30 --seed 7
// Sources: (1) synthetic orders built from a structured intent in many randomised worlds; (2) the game's labelled suite,
// TRAIN split only (index % 3 != 0) — the dev split (index % 3 == 0, 100 orders) and the whole hold-out are never written.
// Every example is the game's real prompt (context → prompt) with the label as the assistant turn. A pair is kept only if:
//   • each action is legal in the engine (perform on a copy),  • the game's own check() accepts the label for that text,
//   • the label converts back (readingOf) to exactly the intent,  • the game's rule pre-parser does not read it differently.
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { words, countPhrases, FUZZY_ESCORTS, STORY_LINES, VAGUE, LEAD, TAIL, JOINERS, WORKS, WORKS_VERBS, TAX_UP, TAX_LOW, TAX_NORMAL, TAX_CRUSH, DUES, VERDICTS, ROLE_TEXT, GO_VERBS } from './phrasing.mjs';
const MEN_NOUNS = ['men', 'men', 'spears', 'swords', 'riders', 'men-at-arms', 'knights', 'soldiers', 'guards'];

const a = Object.fromEntries(process.argv.slice(2).reduce((acc, x, i, all) => (x.startsWith('--') ? [...acc, [x.slice(2), all[i + 1] && !all[i + 1].startsWith('--') ? all[i + 1] : true]] : acc), []));
const REPO = a.repo || process.env.WC_REPO || 'C:/wc-ai/game/repo'; const OUT = a.out || 'C:/wc-ai/finetune/data'; fs.mkdirSync(OUT, { recursive: true });
const NW = Number(a.worlds || 90); const PER = Number(a.per || 30); const SEED = Number(a.seed || 7);
const imp = (p) => import(pathToFileURL(path.join(REPO, p)).href);
const W = await imp('public/js/shared/world.js'); const { withRng } = await imp('public/js/engine/rng.js'); const { commands } = await imp('public/js/engine/actions/military.js');
const { perform } = await imp('public/js/engine/actions/registry.js'); const { slug } = await imp('public/js/engine/ids.js');
const IC = await imp('server/ai/calls/interpret.js'); const { parseOrder } = await imp('server/orders/parse.js'); const { compare, loadSuite, worldFor } = await imp('bench/lib/interpret.js');
const { ROLES } = await imp('public/js/engine/actions/court.js'); const { whereabouts } = await imp('public/js/shared/roads.js');
const call = IC.default;

// ── a small seeded random source ──
let s0 = SEED >>> 0; const rnd = () => { s0 |= 0; s0 = (s0 + 0x6d2b79f5) | 0; let t = Math.imul(s0 ^ (s0 >>> 15), 1 | s0); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
const pick = (arr) => arr[Math.floor(rnd() * arr.length)]; const chance = (p) => rnd() < p; const shuffle = (arr) => arr.map((x) => [rnd(), x]).sort((p, q) => p[0] - q[0]).map((p) => p[1]);
const cap = (t) => t.charAt(0).toUpperCase() + t.slice(1); const low = (t) => t.charAt(0).toLowerCase() + t.slice(1);
const plain = (name) => String(name).replace(/\s*"[^"]*"\s*/g, ' ').replace(/\s+/g, ' ').trim();

// ── worlds ──
const HOST_NAMES = [(s) => `The Host of ${s}`, (s) => `The Riders of ${s}`, (s) => `The ${s} Levies`, (s) => `The Sworn Swords of ${s}`, (s) => `The ${s} Guard`, () => 'The Banner Host', () => 'The Vanguard', () => 'The Reserve'];
function makeWorld(house, k) {
  const state = W.createInitialState('agot_298', house, { seed: 298 + k });
  const me = state.houses[house]; const lord = state.characters[me.lord];
  const own = Object.values(state.characters).filter((c) => c.alive && c.house === house && c.id !== lord?.id && c.sex === 'm' && (c.age || 30) >= 16);
  const holds = Object.values(state.holdings).filter((h) => h.owner === house); const ops = [];
  const extra = pick([0, 1, 1, 2]); const at1 = pick(holds) || state.holdings[me.seat];
  for (let i = 0; i < extra && at1; i++) {
    const at = i === 1 && chance(0.5) ? at1 : pick(holds);
    const id = `gen_host_${k}_${i}`; const nm = pick(HOST_NAMES)(plain(at.name));
    ops.push({ op: 'army_create', id, owner: house, name: nm, at: at.id, men: pick([300, 500, 800, 1200, 2000, 3000, 4500, 6000, 9000]), ...(own.length ? { commander: pick(own).id } : {}) });
  }
  const others = Object.values(state.characters).filter((c) => c.alive && c.house !== house && c.house !== 'targaryen' && c.sex);
  for (let i = 0; i < pick([0, 1, 2]); i++) { const c = pick(others); if (c) ops.push({ op: 'character', id: c.id, status: 'imprisoned', loc: me.seat }); }
  withRng(state, () => W.applyChanges(state, ops, { source: 'gen' })); state.facts = [];
  return state;
}
function entities(state, house) {
  const me = state.houses[house]; const lord = state.characters[me.lord];
  const kept = (c) => (c.roles || []).includes('ward') && state.holdings[W.resolvePlaceId(c.loc)]?.owner === house;
  const people = Object.values(state.characters).filter((c) => c.alive && (c.house === house || kept(c)) && c.id !== lord?.id && !/imprisoned|captive|hostage/.test(c.status || ''));
  const hosts = Object.values(state.parties).filter((p) => commands(state, house, p) && p.men > 0);
  const holds = Object.values(state.holdings); const own = holds.filter((h) => h.owner === house);
  const prisoners = Object.values(state.characters).filter((c) => c.alive && /imprisoned|captive|hostage/.test(c.status || '') && state.holdings[W.resolvePlaceId(c.loc)]?.owner === house);
  const houses = Object.values(state.houses).filter((h) => h.id !== house && h.rank !== 'company' && state.characters[h.lord]?.alive);
  const sworn = Object.values(state.houses).filter((h) => h.liege === house);
  const far = Object.values(state.characters).filter((c) => c.alive && c.id !== lord?.id && c.sex && whereabouts(state, c).text !== whereabouts(state, lord).text);
  return { state, house, me, lord, people, hosts, holds, own, prisoners, houses, sworn, far };
}
// ── names as a lord would say them ──
const firstOf = (c) => plain(c.name).split(' ')[0]; const lastOf = (c) => plain(c.name).split(' ').slice(-1)[0];
function nameForms(E, c) {
  const forms = [plain(c.name)]; const dup = E.people.filter((x) => x.id !== c.id && firstOf(x) === firstOf(c)).length;
  if (!dup && firstOf(c) !== plain(c.name)) forms.push(firstOf(c), firstOf(c));
  const r = c.roles || []; const uniq = (role) => E.people.filter((x) => (x.roles || []).includes(role)).length === 1;
  const lord = E.lord;
  if (lord?.spouse === c.id) forms.push(c.sex === 'f' ? 'my wife' : 'my husband');
  if ((c.father === lord?.id || c.mother === lord?.id) && c.sex === 'm') forms.push('my son'); else if (c.father === lord?.id || c.mother === lord?.id) forms.push('my daughter');
  if (lord && ((c.father && c.father === lord.father) || (c.mother && c.mother === lord.mother)) && c.id !== lord.id) forms.push(c.sex === 'f' ? 'my sister' : 'my brother');
  if (r.includes('maester') && uniq('maester')) forms.push('the maester'); if (r.includes('steward') && uniq('steward')) forms.push('the steward');
  if (r.includes('master_at_arms') && uniq('master_at_arms')) forms.push('the master-at-arms');
  return forms;
}
const pl = (h) => plain(h.name).replace(/^The /, 'the ');
const placeForms = (E, h) => [pl(h)];
const hostForms = (E, p) => { const nm = plain(p.name); const l = /^the /i.test(nm) ? nm.replace(/^The /, 'the ') : `the ${nm}`; const f = [l, l]; if (E.hosts.length === 1) f.push(p.kind === 'fleet' ? 'the fleet' : 'the host', p.kind === 'fleet' ? 'the fleet' : 'the host'); return f; };
const houseForms = (h) => [`House ${plain(h.name)}`, `House ${plain(h.name)}`, `the ${plain(h.name)}s`];
const countOf = (n) => pick(countPhrases(n));

// ── the families: each returns { text, actions? , letter?, story?, clarify? } or null ──
const F = {};
F.send_person = (E) => {
  const c = pick(E.people); const place = pick(E.holds); if (!c || !place) return null; const P = pick(nameForms(E, c)); const L = pick(placeForms(E, place));
  const men = chance(0.4) ? (chance(0.35) ? pick(FUZZY_ESCORTS) : [null, 0]) : [null, 0]; let phr; let n = 0;
  if (men[1]) { phr = men[0]; n = men[1]; } else if (chance(0.4)) { n = pick([5, 10, 20, 30, 50, 100, 200]); const [t, v] = countOf(n); phr = `${t} ${pick(MEN_NOUNS)}`; n = v; }
  const forms = phr ? [`${pick(GO_VERBS)} ${P} to ${L} with ${phr}.`, `${cap(P)} is to take ${phr} to ${L}.`, `${cap(P)} should ride for ${L} with ${phr}.`, `${pick(GO_VERBS)} ${P} with ${phr} to ${L}.`] : [`${pick(GO_VERBS)} ${P} to ${L}.`, `${cap(P)} is to go to ${L}.`, `${cap(P)}, ride for ${L}.`, `${cap(P)} should travel to ${L}.`, `${cap(P)} must go to ${L}.`];
  return { text: pick(forms), actions: [{ verb: 'send_person', params: { character: c.id, to: place.id, ...(n ? { men: n } : {}) } }] };
};
F.march_host = (E) => {
  const h = pick(E.hosts); const place = pick(E.holds); if (!h || !place) return null; const L = pick(placeForms(E, place)); const H = pick(hostForms(E, h)); const cm = E.state.characters[h.commander];
  const verbs = h.kind === 'fleet' ? ['Sail', 'Send', 'Take'] : ['March', 'Send', 'Take', 'Move'];
  const forms = [`${pick(verbs)} ${H} ${pick(['to', 'to', 'on', 'against'])} ${L}.`, `${cap(H)} is to march on ${L}.`, `Take ${H} to ${L}.`];
  if (cm && chance(0.4)) forms.push(`${firstOf(cm)}, take ${H} to ${L}.`, `${firstOf(cm)}, march ${H} on ${L}.`);
  return { text: pick(forms), actions: [{ verb: 'march_host', params: { army: h.id, to: place.id } }] };
};
F.raise_levies = (E) => {
  const seat = pick(E.own); if (!seat) return null; const L = pl(seat); const n = pick([500, 1000, 2000, 3000, 5000, 8000, 10000]); const [t, v] = countOf(n);
  const forms = [{ t: `Raise ${t} men at ${L}.`, p: { at: seat.id, men: v } }, { t: `Levy ${t} men at ${L}.`, p: { at: seat.id, men: v } }, { t: `Call up ${t} men at ${L}.`, p: { at: seat.id, men: v } }, { t: `Raise ${t} more men at ${L}.`, p: { at: seat.id, men: v } }, { t: `Raise all the levies of ${L}.`, p: { at: seat.id } }];
  const dest = pick(E.holds); if (dest && chance(0.4)) forms.push({ t: `Raise the levies at ${L} and march them to ${pl(dest)}.`, p: { at: seat.id, to: dest.id } });
  const cm = E.people.find((c) => c.sex === 'm' && (c.age || 30) >= 16); if (cm && chance(0.3)) forms.push({ t: `Raise ${t} men at ${L} under ${pick(nameForms(E, cm))}.`, p: { at: seat.id, men: v, commander: cm.id } });
  const f = pick(forms); return { text: f.t, actions: [{ verb: 'raise_levies', params: f.p }] };
};
F.call_banners = (E) => {
  const place = chance(0.7) ? E.state.holdings[E.me.seat] : pick(E.holds); const L = pl(place); const forms = [{ t: `Call the banners to ${L}.`, p: { at: place.id } }, { t: `Summon my bannermen to ${L}.`, p: { at: place.id } }, { t: `Muster my sworn lords at ${L}.`, p: { at: place.id } }, { t: `Let every lord sworn to me come to ${L} with his levies.`, p: { at: place.id } }];
  if (E.sworn.length >= 2 && chance(0.4)) { const two = shuffle(E.sworn).slice(0, 2); forms.push({ t: `Call ${houseForms(two[0])[0]} and ${houseForms(two[1])[0]} to ${L}.`, p: { at: place.id, vassals: two.map((x) => x.id) } }); }
  const f = pick(forms); return { text: f.t, actions: [{ verb: 'call_banners', params: f.p }] };
};
F.hire_men = (E) => {
  const seat = pick(E.own); const n = pick([30, 50, 100, 200, 300, 500]); const [t, v] = countOf(n); const L = pl(seat);
  const forms = [{ t: `Hire ${t} sellswords at ${L}.`, p: { at: seat.id, men: v, kind: 'sellswords' } }, { t: `Hire ${t} men-at-arms at ${L}.`, p: { at: seat.id, men: v } }, { t: `Recruit ${t} men at ${L}.`, p: { at: seat.id, men: v } }, { t: `Take on ${t} sellswords at ${L}.`, p: { at: seat.id, men: v, kind: 'sellswords' } }, { t: `Enlist ${t} men at ${L}.`, p: { at: seat.id, men: v } }];
  const f = pick(forms); return { text: f.t, actions: [{ verb: 'hire_men', params: f.p }] };
};
F.fund_works = (E) => {
  const seat = pick(E.own); const key = pick(Object.keys(WORKS)); const v = pick(WORKS_VERBS[key]); const w = pick(WORKS[key]); const L = pl(seat);
  const forms = [`${v} ${w} at ${L}.`, `${v} ${w} in ${L}.`, `${cap(w)} at ${L}: fund it.`.replace(/^./, (x) => x)]; const f = chance(0.8) ? forms[chance(0.5) ? 0 : 1] : `${v} ${w}.`;
  return { text: f, actions: [{ verb: 'fund_works', params: { template: key, ...(f.includes(L) ? { holding: seat.id } : {}) } }] };
};
F.set_tax = () => { const lv = pick(['low', 'low', 'normal', 'high', 'high', 'crushing']); const bank = { low: TAX_LOW, normal: TAX_NORMAL, high: TAX_UP, crushing: TAX_CRUSH }[lv]; return { text: pick(bank), actions: [{ verb: 'set_tax', params: { level: lv } }] }; };
F.set_dues = (E) => { if (!E.me.liege) return null; const st = pick(['paying', 'late', 'withholding']); return { text: pick(DUES[st]), actions: [{ verb: 'set_dues', params: { status: st } }] }; };
F.declare_war = (E) => { const h = pick(E.houses); const n = houseForms(h)[0]; return { text: pick([`Declare war on ${n}.`, `Send heralds to declare war on ${n}.`, `War on ${n}: declare it.`, `We go to war with ${n}.`]), actions: [{ verb: 'declare_war', params: { house: h.id } }] }; };
F.plant_spy = (E) => { const h = pick(E.houses); const n = houseForms(h)[0]; return { text: pick([`Plant spies in the household of ${n}.`, `Put a spy in the household of ${n}.`, `Set spies among the servants of ${n}.`]), actions: [{ verb: 'plant_spy', params: { house: h.id } }] }; };
F.gather_secrets = (E) => { const h = pick(E.houses); const n = houseForms(h)[0]; return { text: pick([`Dig for the secrets of ${n}.`, `Learn what ${n} is hiding.`, `Find out what ${n} does not want known.`]), actions: [{ verb: 'gather_secrets', params: { house: h.id } }] }; };
F.appoint_office = (E) => {
  const c = pick(E.people); if (!c) return null; const role = pick(Object.keys(ROLES)); const rn = ROLES[role].toLowerCase(); const P = pick(nameForms(E, c));
  return { text: pick([`Make ${P} my ${rn}.`, `Name ${P} ${/^[aeiou]/.test(rn) ? 'an' : 'a'} ${rn}.`, `${cap(P)} is to be my ${rn}.`, `${cap(P)} shall serve as ${rn}.`]), actions: [{ verb: 'appoint_office', params: { character: c.id, role } }] };
};
F.hire_officer = (E) => { const role = pick(Object.keys(ROLE_TEXT).filter((r) => ['spymaster', 'steward', 'maester', 'captain', 'master_at_arms', 'commander', 'knight', 'envoy'].includes(r))); return { text: pick([`Find me ${pick(ROLE_TEXT[role])}.`, `I need ${pick(ROLE_TEXT[role])}.`, `Hire ${pick(ROLE_TEXT[role])}.`, `Take ${pick(ROLE_TEXT[role])} into my service.`]), actions: [{ verb: 'hire_officer', params: { role } }] }; };
F.send_gift = (E) => {
  const n = pick([500, 1000, 2000, 5000, 10000]); const [t, v] = countOf(n); const toPerson = chance(0.5); const h = pick(E.houses); const c = E.state.characters[h.lord];
  return toPerson ? { text: pick([`Send ${t} dragons to ${plain(c.name)}.`, `Give ${plain(c.name)} a gift of ${t} gold dragons.`]), actions: [{ verb: 'send_gift', params: { to: c.id, gold: v } }] } : { text: pick([`Send ${t} dragons to ${houseForms(h)[0]} as a gift.`, `Give ${houseForms(h)[0]} ${t} gold dragons.`]), actions: [{ verb: 'send_gift', params: { to: h.id, gold: v } }] };
};
F.judge_prisoner = (E) => { const c = pick(E.prisoners); if (!c) return null; const v = pick(Object.keys(VERDICTS)); return { text: pick(VERDICTS[v]).replace('{P}', plain(c.name)), actions: [{ verb: 'judge_prisoner', params: { character: c.id, verdict: v } }] }; };
F.halt_host = (E) => { const h = pick(E.hosts); if (!h) return null; const H = pick(hostForms(E, h)); return { text: pick([`Halt ${H}.`, `${cap(H)} is to stop where it stands.`, `Hold ${H} where it is.`]), actions: [{ verb: 'halt_host', params: { army: h.id } }] }; };
F.disband_host = (E) => { const h = pick(E.hosts.filter((x) => x.kind !== 'garrison')); if (!h) return null; const H = pick(hostForms(E, h)); return { text: pick([`Send ${H} home.`, `Disband ${H}.`, `${cap(H)} is dismissed: let the men go home.`]), actions: [{ verb: 'disband_host', params: { army: h.id } }] }; };
F.feast = (E) => (chance(0.5) ? { text: pick(['Hold a feast at my seat.', 'Let there be a feast for the lords.', 'Throw a feast to honour our guests.']), actions: [{ verb: 'hold_feast', params: {} }] } : { text: pick(['Hold a tourney at my seat.', 'Call a tourney.', 'Let there be a tourney for the knights of the region.']), actions: [{ verb: 'hold_tourney', params: {} }] });
F.letter = (E) => { const c = pick(E.far); if (!c) return null; const P = plain(c.name); const forms = [`Send a raven to ${P}.`, `Write to ${P}.`, `Send word to ${P}.`, `Write to ${P} asking for news.`, `Tell ${P} to send grain.`, `Send a raven to ${P} asking for men.`, `Have the maester write to ${P}.`]; return { text: pick(forms), letter: c.id }; };
F.story = () => ({ text: pick(STORY_LINES), story: true });
F.clarify_thin = (E) => { const t = pick(VAGUE); const q = { 'Send men.': 'How many men, and where are they to go?', 'Ride.': 'Who is to ride, and where?', 'Go north.': 'Who is to go north, and where to?', 'Go south.': 'Who is to go south, and where to?', 'Make ready.': 'Ready for what, my lord?', 'See to it.': 'What is to be seen to?', 'Send someone.': 'Whom shall I send, and where?', 'Take the field.': 'Which host, and to where?', 'Prepare.': 'Prepare what, my lord?', 'Move out.': 'Which host is to move, and to where?' }[t]; return { text: t, clarify: { question: q, options: [] } }; };
F.clarify_person = (E) => { const place = pick(E.holds); if (E.people.length < 2) return null; const opts = shuffle(E.people).slice(0, 4).map((c) => plain(c.name)); return { text: pick([`Send someone to ${pl(place)}.`, `Someone must go to ${pl(place)}.`]), clarify: { question: `Who should go to ${plain(place.name)}?`, options: opts } }; };
F.clarify_place = (E) => { const c = pick(E.people); if (!c) return null; const opts = shuffle(E.own.length >= 4 ? E.own : E.holds).slice(0, 4).map((h) => plain(h.name)); const P = pick(nameForms(E, c)); return { text: pick([`Send ${P}.`, `${cap(P)} is to ride at once.`]), clarify: { question: `Where should ${firstOf(c)} go?`, options: opts } }; };
F.clarify_host = (E) => { if (E.hosts.length < 2) return null; const place = pick(E.holds); return { text: pick([`March the host to ${pl(place)}.`, `Take the host to ${pl(place)}.`]), clarify: { question: `Which host should go to ${plain(place.name)}?`, options: E.hosts.slice(0, 4).map((h) => plain(h.name)) } }; };
const WEIGHTS = { send_person: 16, march_host: 10, letter: 8, story: 6, fund_works: 6, raise_levies: 5, set_tax: 4, call_banners: 4, hire_men: 3, declare_war: 3, set_dues: 2, appoint_office: 2, judge_prisoner: 3, plant_spy: 2, gather_secrets: 2, halt_host: 2, disband_host: 2, hire_officer: 2, send_gift: 2, feast: 2, clarify_thin: 2, clarify_person: 1, clarify_place: 1, clarify_host: 1 };
const FAMS = Object.entries(WEIGHTS).flatMap(([k, w]) => Array(w).fill(k));
const SIMPLE = FAMS.filter((k) => !k.startsWith('clarify') && k !== 'story');

const IMPER = new Set(['Send', 'Dispatch', 'Have', 'Order', 'March', 'Take', 'Raise', 'Levy', 'Call', 'Summon', 'Muster', 'Hire', 'Recruit', 'Enlist', 'Build', 'Fund', 'Lay', 'Fill', 'Expand', 'Strengthen', 'Repair', 'Charter', 'Found', 'Train', 'Endow', 'Deepen', 'Open', 'Dig', 'Lower', 'Ease', 'Restore', 'Return', 'Crush', 'Tax', 'Declare', 'Plant', 'Put', 'Set', 'Learn', 'Find', 'Make', 'Name', 'Halt', 'Hold', 'Disband', 'Free', 'Ransom', 'Release', 'Execute', 'Hang', 'Write', 'Sail', 'Move', 'Let', 'Throw', 'Give', 'Squeeze', 'Tell', 'Sell', 'Hire', 'Levy']);
const firstWord = (t) => t.split(/\s+/)[0].replace(/[^A-Za-z]/g, '');
function dress(text, multi) {
  let t = text.trim();
  if (!multi && chance(0.35)) {
    const soft = ['Now, ', 'Then ', 'Also, ', 'And ', 'First, ']; const hard = ['At once: ', 'Very well. ', 'My decision: ', 'Hear me: '];
    if (IMPER.has(firstWord(t))) { const lead = pick([...soft, ...hard]); t = lead + (soft.includes(lead) ? low(t) : t); } else t = pick(hard) + t;
  }
  if (!multi && chance(0.25)) t += pick(TAIL);
  return t.replace(/\s+/g, ' ').trim();
}
function combine(E) {
  const n = chance(0.8) ? 2 : 3; const parts = []; const used = new Set();
  for (let tries = 0; parts.length < n && tries < 12; tries++) { const fam = pick(SIMPLE); let r = null; try { r = F[fam](E); } catch { drop('error: ' + fam); } if (!r || r.story || r.clarify) continue; const key = JSON.stringify(r.actions || r.letter); if ([...used].some((u) => u.split('|')[0] === fam && (r.actions || []).length && fam !== 'letter')) continue; used.add(`${fam}|${key}`); parts.push({ fam, ...r }); }
  if (parts.length < 2) return null;
  let text = cap(parts[0].text.replace(/\.$/, '')); for (const p of parts.slice(1)) { const j = pick(JOINERS); const body = p.text.replace(/\.$/, ''); const soft = /(Then|Also|And) $|^,? ?(and|then) $/.test(j) || j === ' and ' || j === ', and ' || j === ', then '; text += j + (soft && IMPER.has(firstWord(body)) ? low(body) : cap(body)); }
  return { text: text + '.', actions: parts.flatMap((p) => p.actions || []), letter: parts.find((p) => p.letter)?.letter, fams: parts.map((p) => p.fam) };
}

// ── validation and output ──
const drops = {}; const drop = (why) => { drops[why] = (drops[why] || 0) + 1; return null; };
function labelOf(item) { return item.story ? { actions: [], letter: null, clarify: null } : item.clarify ? { actions: [], letter: null, clarify: { question: item.clarify.question, options: item.clarify.options.map((label) => ({ label })) } } : { actions: item.actions || [], letter: item.letter ? { to: item.letter } : null, clarify: null }; }
function toExpect(item) { return item.story ? { story: true } : item.clarify ? { clarify: true } : item.letter && !(item.actions || []).length ? { letter: item.letter } : { actions: item.actions }; }
function validate(state, house, item, opts = {}) {
  const text = item.text; const dry = structuredClone(state);
  for (const act of item.actions || []) { let ok = true; try { withRng(dry, () => { const r = perform(dry, act.verb, { house, params: act.params }); ok = !!r.ok; }); } catch { ok = false; } if (!ok) return drop('illegal ' + act.verb); }
  let ctx; try { ctx = call.context(structuredClone(state), { text, house }); } catch (e) { return drop('context: ' + e.message.slice(0, 40)); }
  const target = IC.valueOf(labelOf(item), ctx);
  const problems = call.check(target, ctx); if (problems.length) return drop('check: ' + problems[0].replace(/action \d+ \(([a-z_]+)\)/, '$1').slice(0, 60));
  const reading = IC.readingOf(structuredClone(target), state, { house }); const exp = toExpect(item);
  if (!opts.skipRound && !compare(exp, reading).exact) return drop('roundtrip');
  const ps = parseOrder(state, text, { house }); let oracle = 'incomplete';
  if (ps.complete && !ps.clarify) oracle = compare(exp, ps).exact ? 'agree' : 'disagree';
  if (oracle === 'disagree' && !opts.keepDisagree) return drop('rules disagree');
  const messages = call.prompt(ctx);
  return { messages: [...messages, { role: 'assistant', content: JSON.stringify(target) }], oracle, exp };
}

const out = []; const seen = new Set(); const famCount = {};
const candidateHouses = (() => { const s = W.createInitialState('agot_298', 'stark', { seed: 298 }); return Object.values(s.houses).filter((h) => { const st = W.createInitialState('agot_298', h.id, { seed: 298 }); const ppl = Object.values(st.characters).filter((c) => c.alive && c.house === h.id).length; return ppl >= 3 || Object.values(st.parties).some((p) => commands(st, h.id, p)); }).map((h) => h.id); })();
console.log('houses used:', candidateHouses.length, candidateHouses.join(','));
for (let wi = 0; wi < NW; wi++) {
  const house = candidateHouses[wi % candidateHouses.length]; let state; try { state = makeWorld(house, 1000 + wi); } catch (e) { drop('world: ' + e.message.slice(0, 30)); continue; }
  const E = entities(state, house); let made = 0;
  for (let tries = 0; made < PER && tries < PER * 6; tries++) {
    const multi = chance(0.1); let item = null; let fam;
    try { if (multi) { item = combine(E); fam = 'multi'; } else { fam = pick(FAMS); item = F[fam](E); } } catch (e) { drop('error: ' + (fam || 'multi')); continue; }
    if (!item) { drop('no entities: ' + fam); continue; }
    item.text = dress(item.text, multi); const key = `${house}|${item.text}`; if (seen.has(key)) { drop('duplicate'); continue; } seen.add(key);
    const ok = validate(state, house, item); if (!ok) continue;
    out.push({ id: `syn-${house}-${wi}-${made}`, source: 'synthetic', family: multi ? 'multi:' + item.fams.join('+') : fam, house, text: item.text, expect: ok.exp, oracle: ok.oracle, messages: ok.messages }); made++; famCount[fam] = (famCount[fam] || 0) + 1;
  }
}
// the game's labelled suite: TRAIN split only
const suiteGold = []; const devIds = []; const holdIds = [];
for (const suite of loadSuite(path.join(REPO, 'bench/suites/interpret'))) {
  const state = worldFor(suite);
  suite.items.forEach((it, i) => {
    if (i % 3 === 0) { devIds.push(it.id); return; } // dev: never trained on
    const e = it.expect; const item = e.clarify ? { text: it.text, clarify: { question: 'What exactly is to be done, my lord?', options: [] } } : e.story ? { text: it.text, story: true } : e.letter ? { text: it.text, letter: e.letter, actions: [] } : { text: it.text, actions: e.actions };
    // gold labels are the game's own: keep them even if the pre-parser disagrees, and do not require legality
    const ctx = call.context(structuredClone(state), { text: it.text, house: suite.house });
    const target = IC.valueOf(labelOf(item), ctx); const problems = call.check(target, ctx);
    if (problems.length) { drop('gold check: ' + problems[0].slice(0, 50)); return; }
    suiteGold.push({ id: it.id, source: 'suite-train', family: 'suite', house: suite.house, text: it.text, expect: e, oracle: 'gold', messages: [...call.prompt(ctx), { role: 'assistant', content: JSON.stringify(target) }] });
  });
}
for (const suite of loadSuite(path.join(REPO, 'bench/suites/interpret-holdout'))) for (const it of suite.items) holdIds.push(it.id);
const all = [...out, ...suiteGold, ...suiteGold]; // the human-written gold orders count twice
const shuffled = shuffle(all);
fs.writeFileSync(path.join(OUT, 'interpret-train.jsonl'), shuffled.map((r) => JSON.stringify(r)).join('\n') + '\n');
fs.writeFileSync(path.join(OUT, 'interpret-split.json'), JSON.stringify({ dev: devIds, holdout: holdIds, trainSuiteN: suiteGold.length }, null, 1));
const oracle = out.reduce((m, r) => ((m[r.oracle] = (m[r.oracle] || 0) + 1), m), {});
console.log(`synthetic ${out.length} | suite-train ${suiteGold.length} (x2) | dev ${devIds.length} | holdout ${holdIds.length} | oracle ${JSON.stringify(oracle)}`);
console.log('families', JSON.stringify(famCount)); console.log('drops', JSON.stringify(Object.entries(drops).sort((p, q) => q[1] - p[1]).slice(0, 14)));
const toks = shuffled.reduce((n, r) => n + r.messages.reduce((m, x) => m + Math.ceil(x.content.length / 3.6), 0), 0); console.log(`~${(toks / 1e6).toFixed(2)}M tokens in ${shuffled.length} examples`);
