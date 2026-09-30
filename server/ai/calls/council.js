// The council and the advisor (docs/gdd/04-ai-system.md §8.4). The lord's own officers speak in turn, each hearing the
// others and each from what their office knows truly: the steward the ledger, the master-at-arms the hosts and the
// muster, the maester the letters and the season, the spymaster the house's reports and spies. They counsel; they change
// nothing — what the lord decides becomes an order. As the advisor, one of them answers a question at length, with
// headings and a few points (the one place the chronicle allows them).
import { briefFor } from '../../../public/data/briefs.js';
import { obj, str, arr, oneOf, hasForeignScript, strings } from '../schema.js';
import { system } from '../context/primer.js';
import { musterState } from '../context/officers.js';
import { dateStr, placeName } from '../../../public/js/shared/world.js';
import { forces } from '../../../public/js/engine/parties.js';
import { VOICES } from '../../../public/data/voices.js';
import { GAME_WORDS, numbersIn } from '../validate/narration.js';
import { anachronismsIn } from '../../../public/data/anachronisms.js';
import { realmBrief } from '../../../public/js/engine/realm/brief.js';

const n = (x) => Math.round(Number(x) || 0).toLocaleString('en-GB');

export const INSTRUCTIONS = `YOUR TASK
You voice the lord's council: each counsellor in the dossier speaks in turn, in their own voice, hearing what the others said before them, from what their office knows — and only that. They may disagree; courtesy is a weapon. They counsel the lord; they decide nothing and do nothing.
- speeches: two to six, in the order they speak; "speaker" is the counsellor, "text" what they say (first person; a gesture between asterisks at most).
- Numbers only as the dossier gives them. Never a game word (turn, player, morale, stat); no modern idiom; nothing of what is to come.`;
export const ADVISOR = `YOUR TASK
One counsellor answers the lord's question at length, as their office knows the matter: a short opening in their own voice, then two to four headings (a line in capitals) each with a few short points beginning "- ". Numbers only as the dossier gives them. Never a game word; nothing of what is to come.`;

/** What an office knows of the house, truly. */
export function officeKnows(state, c) {
  const h = state.houses[c.house]; const f = h.figures || {}; const roles = c.roles || [];
  const out = [];
  if (roles.some((r) => ['steward', 'lord', 'lady', 'heir', 'council'].includes(r))) out.push(`the ledger: coin ${n(f.treasury?.v)} dragons, ${Number(f.income?.v) >= 0 ? '+' : ''}${n(f.income?.v)} a moon; debt ${n(f.debt?.v)}; food ${Math.round(Number(f.food?.v) || 0)} moons; levies not called ${n(f.levies?.v)}`);
  if (roles.some((r) => ['master_at_arms', 'captain', 'commander', 'knight', 'lord', 'heir'].includes(r))) {
    const own = forces(state).filter((a) => a.owner === c.house && a.men > 0);
    out.push(`the hosts: ${own.length ? own.map((a) => `${a.name} ${n(a.men)}${a.at ? ` at ${placeName(state, a.at)}` : ' in the field'}`).join('; ') : 'none in the field'}; men-at-arms ${n(f.menAtArms?.v)}`);
    out.push(`the banners: ${musterState(state, c.house)}`);
  }
  if (roles.includes('maester')) {
    const post = (state.post || []).filter((l) => !l.reply).slice(0, 4);
    out.push(`the season: ${state.world?.season || 'summer'}; letters: ${post.length ? post.map((l) => `to ${l.toName} (${l.status})`).join('; ') : 'none out'}`);
    out.push(`the banners: ${musterState(state, c.house)}`);
  }
  if (roles.includes('spymaster')) {
    const k = state.knowledge?.[c.house]; const reps = Object.values(k?.parties || {}).filter((r) => r.owner !== c.house).slice(0, 6);
    out.push(`the reports: ${reps.length ? reps.map((r) => `${state.houses[r.owner]?.name || 'someone'} ~${n(r.men)} near ${placeName(state, nearest(state, r.pos))} (${r.source})`).join('; ') : 'none'}; spies in ${Object.keys(k?.spies || {}).map((x) => state.houses[x]?.name).filter(Boolean).join(', ') || 'no house'}`);
  }
  return out;
}
function nearest(state, pos) {
  let best = null, d = Infinity;
  for (const h of Object.values(state.holdings)) { const x = Math.hypot(h.pos[0] - pos[0], h.pos[1] - pos[1]); if (x < d) { d = x; best = h.id; } }
  return best;
}

export default {
  kind: 'council',
  fixtureArgs: () => ({ members: ['luwin', 'rodrik_cassel', 'vayon_poole'], words: 'Can we afford a war?' }),
  context(state, { members = [], words = '', advisor = false, listening = false } = {}) {
    const people = members.map((id) => state.characters[id]).filter((c) => c?.alive);
    if (!people.length) throw new Error('no one to hold council with');
    const p = state.meta.player; const lord = state.characters[state.houses[p].lord];
    const log = (state.chats?.[`council:${[...members].sort().join(',')}`] || []).slice(-8);
    return {
      state, people, advisor, listening, words,
      dossier: [
        `DATE: ${dateStr(state.meta.date)}. ${String(state.world?.season || 'summer').replace(/^./, (x) => x.toUpperCase())}.`,
        `THE LORD: ${lord?.name || 'the lord'} of House ${state.houses[p].name}.`,
        // how the realm stands, as this house knows it: the ledger's own figures (engine/realm/brief.js), so a counsellor quotes the numbers the window shows and none the house cannot know
        `THE STATE OF THE REALM, AS YOUR HOUSE KNOWS IT:\n${realmBrief(state, p).text}`,
        `THE COUNCIL:\n${people.map((c) => `- ${c.id}: ${c.name}${c.title ? `, ${c.title}` : ''}. ${VOICES[c.id]?.voice ? `Speaks: ${VOICES[c.id].voice}` : c.traits ? `Nature: ${c.traits}.` : ''}\n  Knows ${officeKnows(state, c).join('; ') || 'the household'}.`).join('\n')}`,
        // the house's opening (data/briefs.js): what the council has heard in the first moons — news, never what is to come
        (state.meta.date.year * 12 + state.meta.date.month) <= 298 * 12 + 12 ? `WHAT THE COUNCIL HAS HEARD: ${(briefFor(state.houses[p], state).hints || []).join('. ')}.` : null,
        log.length ? `SAID SO FAR:\n${log.map((m) => `${m.role === 'player' ? 'The lord' : state.characters[m.speaker]?.name || 'A counsellor'}: ${String(m.text).replace(/\s+/g, ' ').slice(0, 240)}`).join('\n')}` : null,
      ].filter(Boolean).join('\n'),
    };
  },
  schema(ctx) {
    const one = ctx.advisor;
    return obj({ speeches: arr(obj({ speaker: oneOf(ctx.people.map((c) => c.id)), text: str(one ? 2400 : 600) }), { min: one ? 1 : Math.min(3, ctx.people.length), max: one ? 1 : Math.min(6, Math.max(2, ctx.people.length * 2)) }) }); // (a council in which two of three counsellors "said nothing" was what the tuned model gave when one speech was enough: each seated counsellor speaks, up to three)
  },
  prompt: (ctx) => [
    { role: 'system', content: system(ctx.state, ctx.advisor ? ADVISOR : INSTRUCTIONS) },
    { role: 'user', content: `${ctx.dossier}\n\n${ctx.listening ? 'The lord says nothing; the council goes on among themselves.' : `THE LORD ASKS: "${String(ctx.words).slice(0, 1200)}"`}\nAnswer.` },
  ],
  check(v, ctx) {
    const out = [];
    const text = v.speeches.map((s) => s.text).join(' ');
    if (strings(v).some(hasForeignScript)) out.push('a word in a script that is not the realm\'s');
    for (const re of GAME_WORDS) { const m = text.match(re); if (m) { out.push(`"${m[0]}" is not a word of the realm`); break; } }
    for (const a of anachronismsIn(ctx.state, text)) out.push(`"${a.phrase}": ${a.note}`);
    // B-15: a counsellor's figures are the engine's (the dossier), never the chronicle's or the model's own
    const known = numbersIn(ctx.dossier);
    for (const x of numbersIn(text)) {
      if (x <= 12 || known.some((k) => Math.abs(k - x) <= Math.max(1, k * 0.02))) continue;
      out.push(`${x.toLocaleString('en-GB')} is not a number the dossier gives`); break;
    }
    return out;
  },
  mock: (ctx) => valueOf(ctx),
  fallback: (ctx, problems) => ({ ...valueOf(ctx), problems }),
  fingerprint: (ctx) => `${ctx.people.map((c) => c.id).join(',')}|${ctx.advisor ? 'advisor' : ctx.listening ? 'listen' : 'ask'}`,
};

// each counsellor says what their office knows, plainly
function valueOf(ctx) {
  const said = ctx.people.map((c) => {
    const k = officeKnows(ctx.state, c)[0];
    return { speaker: c.id, text: k ? `As to ${k.split(':')[0]}, my lord: ${k.split(': ').slice(1).join(': ')}.` : 'I would counsel caution, my lord.' };
  });
  if (ctx.advisor) {
    const c = ctx.people[0]; const all = officeKnows(ctx.state, c);
    // each thing the office knows under its heading, one point to a clause
    const part = (k) => `${k.split(':')[0].toUpperCase()}\n${k.split(': ').slice(1).join(': ').split(/;\s*|\.\s+(?=[A-Z])/).filter(Boolean).map((x) => `- ${x.replace(/\.$/, '')}`).join('\n')}`;
    return { speeches: [{ speaker: c.id, text: `My lord, as best I can tell it.\n${all.map(part).join('\n') || 'THE HOUSE\n- All is quiet.'}` }] };
  }
  return { speeches: said.slice(0, Math.max(2, Math.min(6, said.length))).length >= 2 ? said.slice(0, 6) : [...said, { ...said[0], text: 'That is all I can tell you, my lord.' }] };
}
