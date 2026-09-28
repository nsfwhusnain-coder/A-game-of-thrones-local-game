// The interpreter (docs/gdd/04-ai-system.md §4): a lord's written order turned into verbs of the registry. The
// pre-parser (server/orders/parse.js) reads most orders by rule; an order it cannot read completely and lawfully comes
// here, with what it found as a hint. The model only chooses — a verb from an enum cut down to the order's families,
// people, hosts, places and houses from enums of this world's names — and never changes anything: the engine tries
// every action with the verb's own legal() and the receipt tells the lord what will be done and what cannot.
//
// One action is a flat record (every field required, unused ones "none" / 0 / ""), so one small schema serves every
// verb; readingOf() turns it into the verb's own params. A letter is the verb send_letter, whose words are the order's.
import { obj, str, int, arr, bool, oneOf, enumProp, buildEnum, hasForeignScript, strings } from '../schema.js';
import { placeAliases, personAliases, houseAliases, slug } from '../../../public/js/engine/ids.js';
import { VERBS } from '../../../public/js/engine/actions/registry.js';
import { commands } from '../../../public/js/engine/actions/military.js';
import { ROLES } from '../../../public/js/engine/actions/court.js';
import { OFFICES } from '../../../public/js/engine/actions/economy.js';
import { LENDERS } from '../../../public/js/engine/economy/lenders.js';
import { isForce } from '../../../public/js/engine/parties.js';
import { PROJECT_TEMPLATES, TAX_LEVELS } from '../../../public/js/shared/economy.js';
import { whereabouts } from '../../../public/js/shared/roads.js';
import { placeName, dateStr, resolvePlaceId } from '../../../public/js/shared/world.js';
import { parseOrder, clausesOf } from '../../orders/parse.js';
import { system } from '../context/primer.js';

// the verbs an order may ask for (answering a matter of the court is done at the court, not written as an order)
const ORDERABLE = Object.values(VERBS).filter((v) => v.id !== 'answer_matter').map((v) => v.id);
// the small words some verbs take, in one enum; "take_the_black" because "wall" is a prefix of "walls" (04 §3.1)
const CHOICE_OF = {
  set_tax: Object.keys(TAX_LEVELS), set_dues: ['paying', 'late', 'withholding'],
  fund_works: PROJECT_TEMPLATES.map((t) => t.key), cancel_works: PROJECT_TEMPLATES.map((t) => t.key),
  hire_men: ['men-at-arms', 'sellswords'], hire_officer: OFFICES, appoint_office: Object.keys(ROLES),
  judge_prisoner: ['release', 'ransom', 'take_the_black', 'execute'], set_secrecy: ['open', 'hidden', 'feint'],
  borrow: Object.keys(LENDERS), repay: Object.keys(LENDERS), embargo: ['impose', 'lift'],
  set_standing_orders: ['favourable', 'always', 'avoid', 'hold'],
  offer_terms: ['march_out_with_arms', 'yield_and_swear', 'yield_hostages', 'unconditional'],
};
const CHOICES = [...new Set(Object.values(CHOICE_OF).flat())].sort();
const FLEET_VERBS = new Set(['embark_host', 'land_host', 'blockade', 'raid_coast']); const SIEGE_VERBS = new Set(['offer_terms', 'storm']);
// what each verb cannot do without ('person|houses': one of them)
const NEEDS = {
  march_host: ['subject', 'to'], attack_host: ['subject', 'to'], halt_host: ['subject'], wait_banners: ['subject'], disband_host: ['subject'], set_standing_orders: ['subject', 'choice'], offer_terms: ['at', 'choice'], storm: ['at'], embark_host: ['subject'], land_host: ['subject'], blockade: ['subject', 'at'], raid_coast: ['subject', 'at'],
  set_secrecy: ['subject', 'choice'], send_person: ['who', 'to'], recall_rider: ['who'], set_tax: ['choice'],
  set_dues: ['choice'], fund_works: ['choice'], cancel_works: ['choice'], hire_men: ['men'], hire_officer: ['choice'],
  send_gift: ['gold', 'person|houses'], appoint_office: ['who', 'choice'], grant_holding: ['at', 'houses'],
  judge_prisoner: ['person', 'choice'], declare_war: ['houses'], plant_spy: ['houses'], gather_secrets: ['houses'],
  send_letter: ['person'],
  borrow: ['gold', 'choice|houses'], repay: ['choice|houses'], call_debt: ['houses'], buy_grain: [], bribe: ['person', 'gold'], embargo: ['houses'], pay_ransom: ['person'],
};
// how the dossier explains each verb, with the fields it uses
const MEANS = {
  call_banners: 'summon sworn lords to muster at [at] (all of them, or the [houses] named)',
  raise_levies: 'raise your levies at your holding [at]: [men] (0 = all), leader [who], marching on to [to], host name in [note]',
  march_host: 'a host [subject] marches to [to]; [who] to lead it if the order names a new leader; its aim in [note]',
  attack_host: 'a host [subject] marches against an enemy host [to = party:…]; [note] "surprise" to fall on them unawares',
  set_standing_orders: 'a host [subject] meeting an enemy [choice: favourable|always|avoid|hold]',
  offer_terms: 'terms to a castle you besiege [at] [choice]',
  storm: 'storm a castle you besiege [at]',
  embark_host: 'a host [subject] boards your fleet in its port',
  land_host: 'a fleet [subject] lands its hosts',
  blockade: 'a fleet [subject] blockades a port [at]',
  raid_coast: 'a fleet [subject] raids the coast about [at]',
  halt_host: 'a host [subject] stops where it stands',
  wait_banners: 'a host [subject] waits until the banners called to it are in',
  merge_hosts: 'hosts in one place join ([subject]: one, or none for all there); leader [who]; name in [note]',
  disband_host: 'a host [subject] is sent home',
  set_secrecy: 'a host [subject] marches openly, hidden, or behind a feint toward [to] [choice: open|hidden|feint]',
  send_person: 'one of your people [who] rides to [to] with [men] men of the household (0 = alone)',
  recall_rider: 'one of your people on the road [who] turns back',
  set_tax: 'the taxes on your smallfolk [choice: low|normal|high|crushing]',
  set_dues: 'the dues you owe your liege [choice: paying|late|withholding]',
  fund_works: 'build at your holding [at] [choice: a kind of works]',
  cancel_works: 'stop works under way [choice: their kind]',
  hire_men: 'hire [men] fighting men at [at] [choice: men-at-arms|sellswords]',
  hire_officer: 'take a new officer into service at [at] [choice: the office]',
  send_gift: 'send [gold] dragons to [person] or to a house [houses]',
  borrow: 'borrow [gold] dragons from a lender [choice: iron_bank|faith|tyroshi|bank_of_oldtown] or a great house [houses]; the term in moons in [men] (0 = two years)',
  repay: 'repay a lender [choice] or a house [houses]: [gold] dragons (0 = all that can be paid)',
  call_debt: 'call in what a house [houses] owes you: repaid within [men] moons (0 = three) or a default',
  buy_grain: 'buy [men] moons of grain for your granaries (0 = two)',
  bribe: 'offer [gold] dragons to [person] of another house, to the end in [note]',
  embargo: 'forbid all trade with a house [houses], or lift it [choice: impose|lift]',
  pay_ransom: 'pay the ransom of one of your people [person] held by another house',
  appoint_office: 'give one of your people [who] an office [choice]',
  grant_holding: 'grant your holding [at] to a sworn house [houses]',
  hold_feast: 'hold a feast at your seat',
  hold_tourney: 'hold a tourney at your seat',
  judge_prisoner: 'decide the fate of a prisoner you hold [person] [choice: release|ransom|take_the_black|execute]',
  declare_war: 'declare war on [houses]; the cause in [note]',
  plant_spy: 'plant spies in the household of [houses]',
  gather_secrets: 'dig for the secrets of [houses]',
  send_letter: 'a raven to [person]; the letter says what the order says',
};

// which families of verbs an order may need, from what the pre-parse found: a march may be a journey and a journey a
// letter, so those travel together; nothing found — every verb
const KIN_FAMILIES = { military: ['military', 'movement', 'intrigue'], movement: ['movement', 'military', 'diplomacy'], diplomacy: ['diplomacy', 'movement', 'economy'], economy: ['economy', 'court', 'diplomacy'], court: ['court', 'economy', 'diplomacy'], intrigue: ['intrigue', 'diplomacy', 'military'] };
function verbsFor(parse) {
  const fams = new Set((parse?.found?.verbs || []).flatMap((v) => KIN_FAMILIES[VERBS[v]?.family] || []));
  if (parse?.letter) for (const f of KIN_FAMILIES.diplomacy) fams.add(f);
  return fams.size ? ORDERABLE.filter((id) => fams.has(VERBS[id].family)) : ORDERABLE;
}

// what one of the lord's people is to him, in a word or two
function kinOf(state, c, lord) {
  const h = state.houses[c.house];
  const is = [];
  if (lord?.spouse === c.id) is.push(c.sex === 'f' ? 'your wife' : 'your husband');
  else if (c.father === lord?.id || c.mother === lord?.id) is.push(`your ${h?.heir === c.id || (c.roles || []).includes('heir') ? 'heir' : c.sex === 'f' ? 'daughter' : 'son'}`);
  else if (lord && c.id !== lord.id && ((c.father && c.father === lord.father) || (c.mother && c.mother === lord.mother))) is.push(c.sex === 'f' ? 'your sister' : 'your brother');
  else if ((c.roles || []).includes('heir')) is.push('your heir');
  for (const r of c.roles || []) if (ROLES[r] && r !== 'knight') is.push(ROLES[r].toLowerCase());
  if ((c.roles || []).includes('ward')) is.push('your ward');
  return is.slice(0, 2).join(', ');
}
const n = (x) => Math.round(Number(x) || 0).toLocaleString('en-GB');
// a thing as the dossier names it: its name, then the member to write — its id, and its plain name if that differs
function label(name, id, en) {
  const plain = slug(name).replace(/^the_/, '');
  const names = [id, plain, ...[...en.canon].filter(([, v]) => v === id).map(([k]) => k)].filter((k, i, all) => en.canon.get(k) === id && all.indexOf(k) === i);
  return `${name} [${names.slice(0, 2).join('|') || id}]`;
}

// ── Few-shot: six orders of another house, and what they mean (04 §4.5) ──
const EXAMPLES = {
  tully: {
    who: 'Hoster Tully at Riverrun; his brother Ser Brynden is at the Bloody Gate; the Host of Riverrun (6,000) stands at Riverrun under Edmure',
    items: [
      ['Edmure, take the host to Stone Mill and hold the fords.', [{ verb: 'march_host', subject: 'host_of_riverrun', to: 'stone_mill', note: 'hold the fords' }]],
      ['Send Ser Desmond to the Twins with twenty men.', [{ verb: 'send_person', who: 'desmond_grell', to: 'the_twins', men: 20 }]],
      ['Tell my brother Brynden the Freys are not to be trusted.', [{ verb: 'send_letter', person: 'brynden_tully' }]],
      ['Hire three hundred sellswords at Maidenpool.', [{ verb: 'hire_men', at: 'maidenpool', men: 300, choice: 'sellswords' }]],
      ['Join the hosts at Riverrun into one under Edmure.', [{ verb: 'merge_hosts', who: 'edmure_tully' }]],
      ['Make the Red Fork run backwards.', []],
    ],
  },
  arryn: {
    who: 'Lysa Arryn at the Eyrie; Ser Vardis Egen, her captain, is with her; the Host of the Vale (4,000) stands at the Bloody Gate under Ser Vardis',
    items: [
      ['Ser Vardis, bring the host down to Gulltown.', [{ verb: 'march_host', subject: 'host_of_the_vale', to: 'gulltown' }]],
      ['Send Mord to the Bloody Gate with ten men.', [{ verb: 'send_person', who: 'mord', to: 'the_bloody_gate', men: 10 }]],
      ['Tell Lord Royce the Vale keeps to its mountains.', [{ verb: 'send_letter', person: 'yohn_royce' }]],
      ['Hire two hundred men-at-arms at Gulltown.', [{ verb: 'hire_men', at: 'gulltown', men: 200, choice: 'men-at-arms' }]],
      ['Join the hosts at the Bloody Gate into one.', [{ verb: 'merge_hosts' }]],
      ['Make the moon door open onto Casterly Rock.', []],
    ],
  },
};
const BLANK = { verb: '', who: 'none', subject: 'none', at: 'none', to: 'none', person: 'none', houses: [], men: 0, gold: 0, choice: 'none', note: '' };
const shown = (items) => JSON.stringify({ actions: items.map((a) => ({ ...BLANK, ...a })), clarify: { needed: false, question: '', options: [] } });

export const INSTRUCTIONS = `YOUR TASK
Read one written order of a lord and say which of the actions allowed it asks for, and with what. You choose; the realm's own rules decide whether each can be done, and tell the lord.
- One action for each thing the order asks to be done, in order, at most four. Most orders are one action.
- Use only the names in the lists you are given. A person who is not named in the order (by name, title or what they are to the lord) is not moved.
- A raven, a letter, "send word", "tell" someone far away: that is send_letter to them — no one rides unless the order says so.
- Men go with someone only if the order asks for men; a number of men is the number the order gives.
- An order that asks for nothing these actions do (a speech, a prayer, a hope, a word of comfort) has no actions: the chronicle tells it.
- If the order must be done but cannot be read without one missing thing (who should go, where, how much), ask one short question in "clarify", with up to four answers to choose from, and give no actions.
- Fields an action does not use: "none", [], 0 or "".`;

export default {
  kind: 'interpret',
  fixtureArgs: () => ({ text: 'Send Jon to the Wall with a few men, and have Maester Luwin write to Riverrun.' }),
  context(state, { text, house = state.meta.player, addressee = null, parse = null } = {}) {
    const me = state.houses[house]; const lord = state.characters[me?.lord];
    const p = parse || parseOrder(state, text, { house, addressee });
    // the house's own, and the wards it keeps (Theon Greyjoy at Winterfell is sent where Lord Stark sends him)
    const kept = (c) => (c.roles || []).includes('ward') && state.holdings[resolvePlaceId(c.loc)]?.owner === house;
    const people = Object.values(state.characters).filter((c) => c.alive && (c.house === house || kept(c)));
    const hosts = Object.values(state.parties).filter((a) => commands(state, house, a));
    const foes = Object.values(state.parties).filter((a) => isForce(a) && !commands(state, house, a) && a.men > 0
      && (p.found.houses.includes(a.owner) || (state.wars || []).some((w) => w.status !== 'ended' && ((w.attackers.includes(house) && w.defenders.includes(a.owner)) || (w.defenders.includes(house) && w.attackers.includes(a.owner))))))
      .sort((a, b) => b.men - a.men).slice(0, 6);
    const own = buildEnum(personAliases(state), { only: new Set(people.map((c) => c.id)) });
    const persons = buildEnum(personAliases(state), { only: new Set(Object.values(state.characters).filter((c) => c.alive).map((c) => c.id)) });
    const hostEnum = buildEnum(new Map(hosts.flatMap((a) => [[a.id, a.id], [slug(a.name), a.id], [slug(a.name).replace(/^the_/, ''), a.id]])));
    const places = buildEnum(placeAliases(state));
    const houses = buildEnum(houseAliases(state));
    // only what this house may do at all (answering a liege's call is a matter of the court for the player)
    // (the fleet's orders only to a house with ships, the siege's only to one before a castle's walls)
    const fleet = hosts.some((a) => a.kind === 'fleet'); const siege = hosts.some((a) => a.besieging);
    const verbs = verbsFor(p).filter((v) => (!VERBS[v].who || VERBS[v].who(state, { house, verb: v, actor: lord?.id })) && (fleet || !FLEET_VERBS.has(v)) && (siege || !SIEGE_VERBS.has(v)));
    const sworn = Object.values(state.houses).filter((h) => h.liege === house);
    const prisoners = Object.values(state.characters).filter((c) => c.alive && /imprisoned|captive|hostage/.test(c.status || '') && (resolvePlaceId(c.loc) && state.holdings[resolvePlaceId(c.loc)]?.owner === house));
    // the places the order most likely means: those it names, the lord's own, his lords' seats, the great seats
    const near = [...new Set([resolvePlaceId(lord?.loc), ...p.found.places, ...p.found.houses.map((h) => state.houses[h]?.seat), ...Object.values(state.holdings).filter((h) => h.owner === house).map((h) => h.id), ...sworn.map((h) => h.seat), ...Object.values(state.houses).filter((h) => ['paramount', 'crown'].includes(h.rank)).map((h) => h.seat)])].filter((id) => id && state.holdings[id]).slice(0, 28);
    const ex = EXAMPLES[house === 'tully' ? 'arryn' : 'tully'];
    return {
      text: String(text || ''), house, addressee, parse: p, verbs, foes: foes.map((a) => 'party:' + a.id),
      own, persons, hosts: hostEnum, places, houses,
      canons: { person: new Map([...persons.canon, ...own.canon]), party: hostEnum.canon, place: places.canon, house: houses.canon },
      examples: ex,
      dossier: [
        `THE LORD: ${lord ? `${lord.name} [${lord.id}]` : '—'}, at ${lord ? whereabouts(state, lord).text : '—'}. Head of House ${me?.name}. Today: ${dateStr(state.meta.date)}.`,
        `HOSTS AND COMPANIES YOU COMMAND:\n${hosts.map((a) => `- ${a.id} — "${a.name}": ${n(a.men)}${a.at ? ` at ${placeName(state, a.at)}` : ' in the field'}${a.commander ? ` under ${state.characters[a.commander]?.name}` : ''}${a.march?.to ? `, marching to ${placeName(state, a.march.to)}` : ''}${a.kind === 'garrison' ? ' (the garrison)' : a.kind === 'fleet' ? ' (ships)' : ''}`).join('\n') || '- none: to fight, raise your levies first'}`,
        foes.length ? `ENEMY HOSTS YOU KNOW OF: ${foes.map((a) => `party:${a.id} — "${a.name}" (House ${state.houses[a.owner]?.name}) ${n(a.men)}${a.at ? ` at ${placeName(state, a.at)}` : ''}`).join(' · ')}` : null,
        `YOUR PEOPLE (where they are):\n${people.filter((c) => c.id !== lord?.id).slice(0, 24).map((c) => `- ${label(c.name, c.id, own)}${kinOf(state, c, lord) ? ` (${kinOf(state, c, lord)})` : ''} — ${whereabouts(state, c).text}`).join('\n')}`,
        sworn.length ? `YOUR SWORN HOUSES: ${sworn.map((h) => label(h.name, h.id, houses)).join(', ')}` : null,
        prisoners.length ? `PRISONERS YOU HOLD: ${prisoners.map((c) => label(c.name, c.id, persons)).join(', ')}` : null,
        `PLACES OFTEN NAMED: ${near.map((id) => label(state.holdings[id].name, id, places)).join(' · ')}`,
        `YOUR TREASURY: ${n(me?.figures?.treasury?.v)} dragons · unraised levies ${n(me?.figures?.levies?.v)}`,
      ].filter(Boolean).join('\n'),
    };
  },
  schema(ctx) {
    const action = obj({
      verb: oneOf(ctx.verbs),
      who: enumProp(ctx.own, 'person', ['none']),
      subject: enumProp(ctx.hosts, 'party', ['none']),
      at: enumProp(ctx.places, 'place', ['none']),
      to: enumProp(ctx.places, 'place', [...ctx.foes, 'none']),
      person: enumProp(ctx.persons, 'person', ['none']),
      houses: arr(enumProp(ctx.houses, 'house'), { max: 6 }),
      men: int(0, 100000),
      gold: int(0, 10000000),
      choice: oneOf([...CHOICES, 'none']),
      note: str(120),
    });
    return obj({ actions: arr(action, { max: 4 }), clarify: obj({ needed: bool(), question: str(140), options: arr(str(60), { max: 4 }) }) });
  },
  prompt(ctx) {
    const p = ctx.parse.found;
    const hint = [p.verbs.length ? `verbs ${p.verbs.join(', ')}` : null, p.people.length ? `people ${p.people.join(', ')}` : null, p.places.length ? `places ${p.places.join(', ')}` : null, p.houses.length ? `houses ${p.houses.join(', ')}` : null, p.hosts.length ? `hosts ${p.hosts.join(', ')}` : null, p.numbers.length ? `numbers ${p.numbers.join(', ')}` : null, p.days ? `within ${p.days} days` : null].filter(Boolean).join('; ');
    return [
      { role: 'system', content: system(null, `${INSTRUCTIONS}\n\nEXAMPLES (another house: ${ctx.examples.who})\n${ctx.examples.items.map(([order, acts]) => `ORDER: "${order}"\n${shown(acts)}`).join('\n')}`) },
      { role: 'user', content: `${ctx.dossier}\nACTIONS ALLOWED:\n${ctx.verbs.map((v) => `- ${v}: ${MEANS[v]}`).join('\n')}\nTHE PRE-PARSE FOUND: ${hint || 'nothing it could read'}\nORDER: "${ctx.text.replace(/"/g, "'")}"${ctx.addressee ? `\n(said to ${ctx.addressee}, one of your people, in person)` : ''}\nTurn the order into actions.` },
    ];
  },
  // what the schema cannot say: an action with what its verb cannot do without, a choice that is not that verb's, a
  // person the order never names sent on the road, men the order never asked for, a letter made into a journey
  check(v, ctx) {
    const out = []; const text = ctx.text.toLowerCase(); const found = new Set(ctx.parse.found.people);
    // the words about one person are the clause that names them ("send Jon north, and have Luwin write" is two)
    const clauses = clausesOf(ctx.text).map((c) => c.toLowerCase());
    const about = (who) => clauses.find((c) => namedIn(who, c, ctx)) || text;
    v.actions.forEach((a, k) => {
      const at = `action ${k + 1} (${a.verb})`;
      for (const need of NEEDS[a.verb] || []) {
        const miss = need.split('|').every((f) => (Array.isArray(a[f]) ? !a[f].length : !a[f] || a[f] === 'none'));
        if (miss) out.push(`${at} needs ${need.replace('|', ' or ')}`);
      }
      if (a.choice !== 'none' && CHOICE_OF[a.verb] && !CHOICE_OF[a.verb].includes(a.choice)) out.push(`${at}: "${a.choice}" is not one of ${CHOICE_OF[a.verb].join('|')}`);
      if (String(a.to).startsWith('party:') !== (a.verb === 'attack_host') && a.to !== 'none' && (a.verb === 'attack_host' || String(a.to).startsWith('party:'))) out.push(`${at}: only attack_host goes to an enemy host`);
      if (['send_person', 'recall_rider', 'appoint_office'].includes(a.verb) && a.who !== 'none' && !found.has(a.who) && a.who !== ctx.addressee && !namedIn(a.who, text, ctx)) out.push(`${at}: the order does not name ${a.who}`);
      if (a.verb === 'send_person' && a.men > 0 && !/\d|\b(men|riders|swords|guards?|escort|company|spears|knights|soldiers|retinue|household|a few|dozen|score|hundred|thousand)\b/.test(about(a.who))) out.push(`${at}: the order asks for no men`);
      if (a.verb === 'send_person' && /\b(raven|letter|write|send word)\b/.test(about(a.who)) && !/\b(ride|go|travel|in person|himself|herself|by hand|escort)\b/.test(about(a.who))) out.push(`${at}: that is a letter — it goes by raven, and no one rides`);
      if (a.verb === 'hire_men' && !/\b(recruit|hire|enlist|sign on|take on|buy|sellswords?|free company|mercenar\w*|more men|new men|men-at-arms)\b/.test(text)) out.push(`${at}: the order does not ask for men to be hired`);
    });
    if (v.clarify.needed && !v.clarify.question.trim()) out.push('clarify: a question is needed');
    if (strings(v).some(hasForeignScript)) out.push('a word in a script that is not the realm\'s');
    return out;
  },
  mock: (ctx) => valueOf(ctx.parse, ctx),
  fallback: (ctx, problems) => ({ ...valueOf(ctx.parse, ctx), problems }),
  fingerprint: (ctx) => `${ctx.house}|${slug(ctx.text)}`,
};

// is this person named in the order: by a name they go by, or what they are to the lord ("my wife", "the maester")?
function namedIn(id, text, ctx) {
  const words = [...ctx.canons.person].filter(([, v]) => v === id).map(([k]) => k.replace(/_/g, ' '));
  return words.some((w) => w.length > 2 && new RegExp(`\\b${w.replace(/[^\w ]/g, '.')}\\b`).test(text));
}

// the pre-parse as the call's answer (the mock, and the fallback): every id written as a member of its enum
const memberOf = (en, id) => (id == null ? 'none' : en.canon.get(id) === id ? id : [...en.canon].find(([, v]) => v === id)?.[0] || 'none');
export function valueOf(parse, ctx) {
  const actions = parse.actions.slice(0, 4).map(({ verb, params: q }) => {
    const a = { ...BLANK, houses: [], verb };
    const place = (x) => (x ? memberOf(ctx.places, resolvePlaceId(String(x)) || x) : 'none');
    switch (verb) {
      case 'call_banners': a.at = place(q.at); if (Array.isArray(q.vassals)) a.houses = q.vassals.map((h) => memberOf(ctx.houses, h)).filter((m) => m !== 'none'); break;
      case 'raise_levies': a.at = place(q.at); a.men = q.men || 0; a.who = memberOf(ctx.own, q.commander); a.to = place(q.to); a.note = q.name || ''; break;
      case 'march_host': case 'halt_host': case 'wait_banners': case 'disband_host': case 'set_secrecy':
        a.subject = memberOf(ctx.hosts, q.army); a.to = place(q.to); a.who = memberOf(ctx.own, q.commander); a.note = q.intent || ''; if (q.mode) a.choice = q.mode; break;
      case 'attack_host': a.subject = memberOf(ctx.hosts, q.army); a.to = ctx.foes.includes(q.to) ? q.to : 'none'; if (q.surprise) a.note = 'surprise'; break;
      case 'set_standing_orders': a.subject = memberOf(ctx.hosts, q.army); a.choice = q.engage; break;
      case 'offer_terms': a.at = place(q.holding); a.choice = q.terms; break;
      case 'storm': a.at = place(q.holding); break;
      case 'embark_host': a.subject = memberOf(ctx.hosts, q.army); break;
      case 'land_host': a.subject = memberOf(ctx.hosts, q.fleet); break;
      case 'blockade': a.subject = memberOf(ctx.hosts, q.fleet); a.at = place(q.holding); break;
      case 'raid_coast': a.subject = memberOf(ctx.hosts, q.fleet); a.at = place(q.target); break;
      case 'merge_hosts': a.subject = memberOf(ctx.hosts, q.armies?.[0]); a.who = memberOf(ctx.own, q.commander); a.note = q.name || ''; break;
      case 'send_person': a.who = memberOf(ctx.own, q.character); a.to = place(q.to); a.men = q.men || 0; break;
      case 'recall_rider': a.who = memberOf(ctx.own, q.character); break;
      case 'set_tax': a.choice = q.level; break;
      case 'set_dues': a.choice = q.status; break;
      case 'fund_works': a.choice = q.template; a.at = place(q.holding); break;
      case 'cancel_works': a.choice = q.template || 'none'; break;
      case 'hire_men': a.at = place(q.at); a.men = q.men || 0; a.choice = q.kind || 'men-at-arms'; break;
      case 'borrow': if (LENDERS[q.lender]) a.choice = q.lender; else a.houses = [memberOf(ctx.houses, q.lender)].filter((m) => m !== 'none'); a.gold = q.gold || 0; a.men = q.months || 0; break;
      case 'repay': if (LENDERS[q.lender]) a.choice = q.lender; else a.houses = [memberOf(ctx.houses, q.lender)].filter((m) => m !== 'none'); a.gold = q.gold || 0; break;
      case 'call_debt': a.houses = [memberOf(ctx.houses, q.debtor)].filter((m) => m !== 'none'); a.men = q.months || 0; break;
      case 'buy_grain': a.men = q.moons || 0; break;
      case 'bribe': a.person = memberOf(ctx.persons, q.to); a.gold = q.gold || 0; a.note = String(q.aim || '').slice(0, 120); break;
      case 'embargo': a.houses = [memberOf(ctx.houses, q.house)].filter((m) => m !== 'none'); a.choice = q.lift ? 'lift' : 'impose'; break;
      case 'pay_ransom': a.person = memberOf(ctx.persons, q.character); break;
      case 'hire_officer': a.choice = q.role || 'none'; a.at = place(q.at); break;
      case 'send_gift': a.gold = q.gold || 0; if (ctx.persons.canon.has(q.to) || [...ctx.persons.canon.values()].includes(q.to)) a.person = memberOf(ctx.persons, q.to); else a.houses = [memberOf(ctx.houses, q.to)].filter((m) => m !== 'none'); break;
      case 'appoint_office': a.who = memberOf(ctx.own, q.character); a.choice = q.role || 'none'; break;
      case 'grant_holding': a.at = place(q.holding); a.houses = [memberOf(ctx.houses, q.house)].filter((m) => m !== 'none'); break;
      case 'judge_prisoner': a.person = memberOf(ctx.persons, q.character); a.choice = q.verdict === 'wall' ? 'take_the_black' : q.verdict; break;
      case 'declare_war': case 'plant_spy': case 'gather_secrets': a.houses = [memberOf(ctx.houses, q.house)].filter((m) => m !== 'none'); a.note = String(q.reason || '').slice(0, 120); break;
      default: break;
    }
    if (!CHOICES.includes(a.choice)) a.choice = 'none';
    return a;
  });
  if (parse.letter?.to && actions.length < 4) actions.push({ ...BLANK, houses: [], verb: 'send_letter', person: memberOf(ctx.persons, parse.letter.to) });
  const q = parse.clarify;
  return { actions: q ? [] : actions.filter((a) => ctx.verbs.includes(a.verb) || !ctx.verbs.length), clarify: { needed: !!q, question: q?.question || '', options: (q?.options || []).slice(0, 4).map((o) => String(o.label).slice(0, 60)) } };
}

/**
 * The call's answer (ids already canonical) as a reading: { actions: [{ verb, params }], letter: { to } | null,
 * clarify: { question, options: [{ label }] } | null, story }. The defaults an order leaves unsaid are the house's:
 * levies are raised and the banners called at its seat, men hired where the lord is.
 */
export function readingOf(value, state, { house = state.meta.player } = {}) {
  const me = state.houses[house]; const lord = state.characters[me?.lord];
  const id = (x) => (x && x !== 'none' ? x : null);
  const seat = me?.seat; const here = resolvePlaceId(lord?.loc) || seat;
  const out = { actions: [], letter: null, clarify: null, story: false };
  if (value?.clarify?.needed && value.clarify.question) out.clarify = { question: value.clarify.question, options: (value.clarify.options || []).map((label) => ({ label })) };
  for (const a of out.clarify ? [] : value?.actions || []) {
    const hs = (a.houses || []).filter(Boolean);
    const p = (() => {
      switch (a.verb) {
        case 'call_banners': return { vassals: hs.length ? hs : 'all', at: id(a.at) || id(a.to) || seat };
        case 'raise_levies': return { at: id(a.at) || seat, ...(a.men ? { men: a.men } : {}), ...(id(a.who) ? { commander: a.who } : {}), ...(id(a.to) ? { to: a.to } : {}), ...(a.note ? { name: a.note } : {}) };
        case 'march_host': return { army: id(a.subject), to: id(a.to), ...(id(a.who) ? { commander: a.who } : {}), ...(a.note ? { intent: a.note } : {}) };
        case 'attack_host': return { army: id(a.subject), to: id(a.to), intent: a.note || 'bring them to battle', ...(/surpris|unawares|ambush|night/i.test(a.note || '') ? { surprise: true } : {}) };
        case 'set_standing_orders': return { army: id(a.subject), engage: id(a.choice) };
        case 'offer_terms': return { holding: id(a.at), terms: id(a.choice) || 'march_out_with_arms' };
        case 'storm': return { holding: id(a.at) };
        case 'embark_host': { const h = state.parties[id(a.subject)]; const f = h && Object.values(state.parties).find((x) => x.kind === 'fleet' && x.owner === house && !x.march && Math.hypot(x.pos[0] - h.pos[0], x.pos[1] - h.pos[1]) <= 12); return { army: id(a.subject), fleet: f?.id || null }; }
        case 'land_host': return { fleet: id(a.subject) };
        case 'blockade': return { fleet: id(a.subject), holding: id(a.at) };
        case 'raid_coast': return { fleet: id(a.subject), target: id(a.at) };
        case 'halt_host': case 'wait_banners': case 'disband_host': return { army: id(a.subject) };
        case 'set_secrecy': return { army: id(a.subject), mode: id(a.choice), ...(id(a.to) ? { to: a.to } : {}) };
        case 'merge_hosts': return { ...(id(a.subject) ? { armies: [a.subject] } : {}), ...(id(a.who) ? { commander: a.who } : {}), ...(a.note ? { name: a.note } : {}) };
        case 'send_person': return { character: id(a.who), to: id(a.to), men: a.men || 0 };
        case 'recall_rider': return { character: id(a.who) };
        case 'set_tax': return { level: id(a.choice) };
        case 'set_dues': return { status: id(a.choice) };
        case 'fund_works': return { template: id(a.choice), holding: id(a.at) || seat };
        case 'cancel_works': return { project: (state.projects || []).find((x) => x.house === house && x.status === 'active' && x.template === a.choice)?.id || null };
        case 'hire_men': return { at: id(a.at) || here, men: a.men, kind: a.choice === 'sellswords' ? 'sellswords' : 'men-at-arms' };
        case 'hire_officer': return { role: id(a.choice), ...(id(a.at) ? { at: a.at } : {}) };
        case 'send_gift': return { to: id(a.person) || hs[0] || null, gold: a.gold };
        case 'appoint_office': return { character: id(a.who), role: id(a.choice) };
        case 'grant_holding': return { holding: id(a.at), house: hs[0] || null };
        case 'judge_prisoner': return { character: id(a.person), verdict: a.choice === 'take_the_black' ? 'wall' : id(a.choice) };
        case 'declare_war': return { house: hs[0] || null, ...(a.note ? { reason: a.note } : {}) };
        case 'plant_spy': case 'gather_secrets': return { house: hs[0] || null };
        case 'hold_feast': case 'hold_tourney': return {};
        case 'borrow': return { lender: id(a.choice) || hs[0] || null, gold: a.gold, ...(a.men ? { months: a.men } : {}) };
        case 'repay': return { lender: id(a.choice) || hs[0] || null, ...(a.gold ? { gold: a.gold } : {}) };
        case 'call_debt': return { debtor: hs[0] || null, ...(a.men ? { months: a.men } : {}) };
        case 'buy_grain': return { moons: a.men || 2 };
        case 'bribe': return { to: id(a.person), gold: a.gold, ...(a.note ? { aim: a.note } : {}) };
        case 'embargo': return { house: hs[0] || null, ...(a.choice === 'lift' ? { lift: 'yes' } : {}) };
        case 'pay_ransom': return { character: id(a.person) };
        default: return null;
      }
    })();
    if (a.verb === 'send_letter') { if (id(a.person)) out.letter = out.letter || { to: a.person }; continue; }
    if (p) out.actions.push({ verb: a.verb, params: p });
  }
  out.story = !out.actions.length && !out.letter && !out.clarify;
  return out;
}
