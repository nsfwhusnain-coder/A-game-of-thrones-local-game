// A mind (docs/gdd/04-ai-system.md §5): one lord of the realm decides one thing to do now, in character, from what
// their house knows. The options are the registry's lawful ones for this actor at this moment (engine/minds/options.js)
// and the schema's enums carry only those; the check holds the answer to them and asks the verb's own legal() once
// more, so a refusal is told back to the model (one retry, 04 §5.4). The mock and the fallback are the house's ways
// (engine/minds/houseways.js), whose choice is also the hint the model is given (04 §5.5).
import { obj, str, int, oneOf, enumProp, buildEnum, hasForeignScript, strings } from '../schema.js';
import { placeAliases, personAliases, houseAliases } from '../../../public/js/engine/ids.js';
import { intentFor, check } from '../../../public/js/engine/actions/registry.js';
import { optionsFor, pickText, HOLD } from '../../../public/js/engine/minds/options.js';
import { treeChoice, hintFor } from '../../../public/js/engine/minds/houseways.js';
import { temperament } from '../../../public/js/shared/temperament.js';
import { whereabouts } from '../../../public/js/shared/roads.js';
import { dateStr, getRelation } from '../../../public/js/shared/world.js';
import { AGENDAS } from '../../../public/data/agendas.js';
import { VOICES } from '../../../public/data/voices.js';
import { system } from '../context/primer.js';
import { promisesOf, promiseText } from '../../../public/js/engine/politics/commitments.js';

const n = (x) => Math.round(Number(x) || 0).toLocaleString('en-GB');
const SCALE = [['courage', 'courage'], ['wits', 'wits'], ['guile', 'guile'], ['pride', 'pride'], ['volatility', 'temper'], ['warmth', 'warmth'], ['honesty', 'honesty'], ['ambition', 'ambition']];
const MEANS = {
  call_banners: 'summon your sworn lords to muster', raise_levies: 'raise your own levies', march_host: 'send a host somewhere',
  attack_host: 'march a host against an enemy host', halt_host: 'halt a host on the road', merge_hosts: 'join your hosts in one place into one',
  disband_host: 'send a host home', send_person: 'send one of your household with a small escort', set_tax: 'set the taxes on your smallfolk',
  set_dues: 'pay, delay or withhold the dues you owe your liege', fund_works: 'build', hire_men: 'hire men-at-arms', send_gift: 'send gold as a gift',
  hold_feast: 'hold a feast at your seat', hold_tourney: 'hold a tourney at your seat', judge_prisoner: 'decide the fate of a prisoner you hold',
  declare_war: 'declare war', [HOLD]: 'keep your counsel and let the days pass',
};

export const INSTRUCTIONS = `YOUR TASK
You are one lord or lady of the realm, deciding what you do now, in character. Choose ONE of the things you can do now, as the person the dossier describes would: by your nature, what you want, what you fear and what you know — and only what you know; news may be late or wrong.
- verb: one of WHAT YOU CAN DO NOW; "hold" is a choice too when nothing presses.
- target: the place, house, person or enemy host your choice names, as written in its option; host: which of your hosts; leader: who of your people leads or goes; choice: the option's own word (a tax level, a verdict, a kind of works). Anything the option does not use: "none" or 0.
- with: how you go about it, in a few words. public_face: what others are told. secret_aim: what you truly want by it. line: one sentence you say or write about it, in your own voice.
Great moves are rare: most weeks a lord governs, builds, feasts or waits. Never choose what your nature would not.`;

// every id a pick names, with the names people use for it, as one enum (seats are named for their houses: `lannister`
// is Casterly Rock or House Lannister, as the verb reads it)
function targetEnum(state, ids) {
  const want = new Set(ids); const map = new Map();
  for (const id of want) map.set(id, id);
  for (const aliases of [placeAliases(state), houseAliases(state), personAliases(state)]) for (const [a, id] of aliases) if (want.has(id) && !map.has(a)) map.set(a, id);
  return buildEnum(map);
}

export default {
  kind: 'mind',
  fixtureArgs: () => ({ actor: 'tywin_lannister' }),
  context(state, { actor, known = [], except = [] } = {}) {
    const c = state.characters[actor]; if (!c) throw new Error(`no such person: ${actor}`);
    const opts = optionsFor(state, actor, { except }); const w = opts.view;
    const tree = treeChoice(state, actor, opts);
    const picks = opts.options.flatMap((o) => o.picks.map((p) => ({ verb: o.verb, ...p })));
    const targets = targetEnum(state, [...new Set(picks.map((p) => p.target).filter(Boolean))]);
    const hosts = buildEnum(new Map(picks.filter((p) => p.host).map((p) => [p.host, p.host])));
    const leaders = buildEnum(new Map(picks.filter((p) => p.leader).map((p) => [p.leader, p.leader])));
    const choices = [...new Set(picks.map((p) => p.choice).filter(Boolean))].sort();
    const T = temperament(c); const h = state.houses[c.house];
    const agenda = AGENDAS.find((a) => a.who === c.id && (!a.when || a.when(state)));
    const wants = [agenda?.aim || VOICES[c.id]?.wants].filter(Boolean);
    const rel = Object.values(state.houses).filter((x) => x.id !== c.house && state.characters[x.lord]?.alive).map((x) => [x, getRelation(state, c.house, x.id)]).filter(([, v]) => Math.abs(v) >= 20).sort((a, b) => Math.abs(b[1]) - Math.abs(a[1])).slice(0, 6);
    const label = (id) => { const names = [...targets.canon].filter(([, v]) => v === id).map(([k]) => k); return names.length ? `[${names.slice(0, 2).join('|')}]` : `[${id}]`; };
    const optionLines = opts.options.map((o) => {
      // one place and many choices (works at the seat, the taxes): the place once, then the choices
      const one = o.picks.length > 1 && o.picks.every((p) => p.target === o.picks[0].target && p.host === o.picks[0].host && p.leader === o.picks[0].leader && p.choice);
      const shown = one ? [`${o.picks[0].target ? `at ${pickText(state, 'raise_levies', o.picks[0], w)} ${label(o.picks[0].target)} — ` : ''}choice=${o.picks.map((p) => p.choice).join('|')}`]
        : o.picks.slice(0, 6).map((p) => `${pickText(state, o.verb, p, w)}${p.target ? ` ${label(p.target)}` : ''}${p.host ? ` host=${p.host}` : ''}${p.leader ? ` leader=${p.leader}` : ''}${p.choice && !['march_host', 'attack_host'].includes(o.verb) ? ` choice=${p.choice}` : ''}`);
      return `- ${o.verb} — ${MEANS[o.verb] || o.label}${shown.filter(Boolean).length ? `: ${shown.join(' · ')}` : ''}`;
    });
    return {
      actor: c, house: c.house, opts, tree, picks, targets, hosts, leaders, choices,
      canons: { target: targets.canon, host: hosts.canon, leader: leaders.canon },
      dossier: [
        `DATE: ${dateStr(state.meta.date)}. ${String(state.world?.season || 'summer').replace(/^./, (x) => x.toUpperCase())}.`,
        `YOU ARE: ${c.name} [${c.id}]${c.title ? `, ${c.title}` : ''}${c.age ? `, ${c.age}` : ''}. ${h.regent === c.id ? 'Regent' : 'Head'} of House ${h.name}. At ${whereabouts(state, c).text}.`,
        `YOUR NATURE: ${SCALE.map(([k, word]) => `${word} ${Math.round((T[k] ?? 0.5) * 10)}`).join(', ')}.${T.sway ? ` Swayed by: ${Object.entries(T.sway).filter(([, v]) => v).map(([k]) => k).join(', ') || 'little'}.` : ''}`,
        wants.length ? `WHAT YOU WANT: ${wants.join(' — ')}` : null,
        `YOUR STRENGTH: coin ~${n(w?.gold)} dragons; levies ~${n(w?.levies)} uncalled; men-at-arms ${n(w?.menAtArms)}${w?.hosts.length ? `; hosts: ${w.hosts.map((a) => `${a.id} "${a.name}" ${n(a.men)}${a.at ? ` at ${state.holdings[a.at]?.name || a.at}` : ' in the field'}${a.march ? ` (marching)` : ''}`).join('; ')}` : '; no host in the field'}.`,
        `YOUR HOUSE: ${w?.liege ? `sworn to House ${w.liege.name}` : 'sworn to no one'}${w?.vassals.length ? ` · ${w.vassals.length} houses sworn to you (the banners ${w.bannersCalled ? 'are called' : 'are not called'})` : ''}${w?.atWar ? ` · AT WAR with ${w.foes.map((x) => `House ${state.houses[x]?.name}`).join(', ')}` : ' · at peace'}.`,
        `WHAT YOU KNOW (as it reached you; it may be late or wrong):\n${known.length ? known.slice(0, 8).map((f) => `- ${f.text}`).join('\n') : '- Nothing of note has reached you this past fortnight.'}`,
        promisesOf(state, c.id).length ? `YOUR PROMISES (a lord's word is remembered): ${promisesOf(state, c.id).map((x) => promiseText(state, x)).join('; ')}.` : null,
        rel.length ? `RELATIONS: ${rel.map(([x, v]) => `${x.name} ${v > 0 ? '+' : '−'}${Math.abs(v)}`).join(' · ')}` : null,
        `WHAT YOU CAN DO NOW (choose one):\n${optionLines.join('\n')}`,
        `A ${c.sex === 'f' ? 'LADY' : 'LORD'} OF YOUR NATURE: ${hintFor(state, c.id, tree)}`,
      ].filter(Boolean).join('\n'),
    };
  },
  schema(ctx) {
    return obj({
      verb: oneOf(ctx.opts.options.map((o) => o.verb)),
      target: enumProp(ctx.targets, 'target', ['none']),
      host: enumProp(ctx.hosts, 'host', ['none']),
      leader: enumProp(ctx.leaders, 'leader', ['self', 'none']),
      men: int(0, 100000),
      gold: int(0, 10000000),
      choice: oneOf([...ctx.choices, 'none']),
      with: str(120), public_face: str(160), secret_aim: str(160), line: str(200),
    });
  },
  prompt: (ctx) => [
    { role: 'system', content: system(null, INSTRUCTIONS) },
    { role: 'user', content: `${ctx.dossier}\nWhat do you do now?` },
  ],
  // the answer must be one of the options, and lawful as the verb sees it with its numbers
  check(v, ctx) {
    const out = [];
    if (strings(v).some(hasForeignScript)) out.push('a word in a script that is not the realm\'s');
    if (v.verb === HOLD) return out;
    const it = intentOf(v, ctx);
    if (!it) { out.push(`"${v.verb}" with ${[v.target, v.host, v.leader, v.choice].filter((x) => x && x !== 'none').join(', ') || 'nothing named'} is not one of your options: choose one as it is written`); return out; }
    const refusal = check(ctx.state || ctx.opts.view.state, intentFor(ctx.opts.view.state, it.verb, { actor: ctx.actor.id, house: ctx.house, params: it.params }));
    if (refusal) out.push(`you cannot ${it.verb.replace(/_/g, ' ')} so: ${refusal.text}`);
    return out;
  },
  mock: (ctx) => valueOf(ctx.tree, ctx),
  fallback: (ctx, problems) => ({ ...valueOf(ctx.tree, ctx), problems }),
  fingerprint: (ctx) => `${ctx.actor.id}|${ctx.opts.options.map((o) => o.verb).join(',')}`,
};

/** The tree's choice as the call's answer (every name a member of its enum). */
export function valueOf(choice, ctx) {
  const p = choice.pick || {};
  const mem = (en, id) => (id && en.canon.get(id) === id ? id : id ? [...en.canon].find(([, x]) => x === id)?.[0] || 'none' : 'none');
  return {
    verb: choice.verb, target: mem(ctx.targets, p.target), host: mem(ctx.hosts, p.host), leader: mem(ctx.leaders, p.leader),
    men: p.men && choice.params.men ? Math.round(choice.params.men) : 0, gold: p.gold && choice.params.gold ? Math.round(choice.params.gold) : 0,
    choice: p.choice && ctx.choices.includes(p.choice) ? p.choice : 'none',
    with: '', public_face: '', secret_aim: '', line: '',
  };
}

/**
 * The answer as an intent: the pick it names (verb, target, host, leader, choice — "none" matches anything), with the
 * men and gold the answer gives where the option takes them. null if it names no option.
 */
export function intentOf(v, ctx) {
  if (!v || v.verb === HOLD) return v?.verb === HOLD ? { verb: HOLD, params: {} } : null;
  const same = (want, got) => !want || want === 'none' || want === got;
  const leader = v.leader === 'self' ? ctx.actor.id : v.leader;
  const p = ctx.picks.find((x) => x.verb === v.verb && same(v.target, x.target) && same(v.host, x.host) && same(leader, x.leader) && same(v.choice, x.choice));
  if (!p) return null;
  const params = { ...p.params };
  if (p.men && v.men >= 50) params.men = Math.round(v.men);
  if (p.gold && v.gold >= 50) params.gold = Math.round(v.gold);
  return { verb: v.verb, params, pick: p };
}
