// An audience (docs/gdd/04-ai-system.md §8.1–8.2): the lord speaks with someone, face to face or by letter. The engine
// has already weighed the words (shared/temperament.js weighAudience: obey, agree, bargain, stall, refuse, rage, yield,
// dismiss); the model plays the scene and says what, if anything, they commit to — and the verdict limits even that:
// one who refuses agrees to nothing, one who agrees may promise only what was asked. Each promise becomes a Commitment
// (engine/politics/commitments.js) with a sincerity the engine rolls in secret; the model writes the words, never the
// deeds. The mock plays the verdict plainly, and reads the request itself, so the whole path runs without a model.
import { obj, str, int, arr, oneOf, enumProp, buildEnum, hasForeignScript, strings } from '../schema.js';
import { placeAliases, personAliases } from '../../../public/js/engine/ids.js';
import { system } from '../context/primer.js';
import { officerKnowledge } from '../context/officers.js';
import { COMMITMENTS, promisesOf, promiseText } from '../../../public/js/engine/politics/commitments.js';
import { dateStr, placeName } from '../../../public/js/shared/world.js';
import { placeOf } from '../../../public/js/engine/parties.js';
import { VOICES } from '../../../public/data/voices.js';
import { namesIn, numbersIn, GAME_WORDS } from '../validate/narration.js';
import { anachronismsIn } from '../../../public/data/anachronisms.js';

export const MOODS = ['warm', 'courteous', 'guarded', 'cold', 'angry', 'afraid', 'amused'];
const AGREEING = new Set(['agree', 'yield']);

export const INSTRUCTIONS = `YOUR TASK
You are the person the dossier describes, answering the lord who speaks to you — face to face, or by letter when the dossier says so. THE OUTCOME is already settled: play it exactly, in your own manner; never soften it or overturn it.
- beats: the scene in two to five beats. "narration": third person, past tense, what the lord sees you do (a gesture, a pause, the room). "speech": your own words, first person, to the lord. By letter: speech only — the letter in your own hand, a greeting and your name.
- outcome.agrees_to: only what the outcome lets you promise, each with its place or person and within how many days; [] when you promise nothing.
- outcome.asks_for: what you want in return, in a few words, or "".
- outcome.reveals: "none", unless the outcome allows a secret and you choose to let it slip.
- outcome.mood: how you feel as it ends.
Say only what you would know. Never a game word (turn, player, morale, stat); no modern idiom; nothing of what is to come.`;

// "within the fortnight", "in ten days", "by the next moon"
function daysIn(text) {
  const t = String(text || '').toLowerCase();
  const m = t.match(/\b(?:within|in|before)\s+(?:the\s+)?(?:next\s+)?(\d+|a|one|two|three|four|five|six|seven|eight|nine|ten|twelve|fourteen|twenty|thirty)?\s*(day|days|week|weeks|fortnight|moon|moons|month|months|year)\b/);
  if (!m) return null;
  const W = { a: 1, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, twelve: 12, fourteen: 14, twenty: 20, thirty: 30 };
  const k = m[1] ? (Number(m[1]) || W[m[1]] || 1) : 1;
  return k * ({ day: 1, days: 1, week: 7, weeks: 7, fortnight: 14, moon: 30, moons: 30, month: 30, months: 30, year: 360 }[m[2]] || 1);
}

/**
 * What the lord asks of them, read from the words: [{ kind, target, by_days, men?, gold? }] — the promises an agreeing
 * answer may make. Also the enum of targets the schema offers.
 */
export function requestOf(state, c, text, stance) {
  const found = namesIn(state, String(text || ''));
  const places = found.filter((x) => x.kind === 'place').map((x) => x.id);
  const people = found.filter((x) => x.kind === 'person').map((x) => x.id);
  const nums = numbersIn(text).filter((x) => x >= 50);
  const days = daysIn(text) || 30; const I = stance?.I || {};
  const s = String(text || '').toLowerCase(); const out = [];
  if (places.length && /\b(men|host|banners|swords|spears|army|levies|knights|riders|strength|force)\b/.test(s)) out.push({ kind: nums[0] ? 'send_men' : 'march_to', target: places[0], by_days: days, ...(nums[0] ? { men: nums[0] } : {}) });
  else if (places.length && /\b(come|attend|meet|join me|ride to|be at)\b/.test(s)) out.push({ kind: 'attend', target: places[0], by_days: days });
  const captive = people.find((id) => /imprisoned|captive|hostage/.test(state.characters[id]?.status || '') && state.holdings[placeOf(state, state.characters[id])]?.owner === c.house);
  if (captive && /\b(release|free|let .* go|send .* home)\b/.test(s)) out.push({ kind: 'release', target: captive, by_days: Math.min(days, 14) });
  if (I.gold && /\b(pay|give me|send me|owe|tribute|dues|lend)\b/.test(s) && !I.offer) out.push({ kind: 'pay', target: 'none', by_days: days, gold: I.gold });
  if (I.proposal === 'fealty' && state.houses[c.house]?.lord === c.id) out.push({ kind: 'swear_fealty', target: 'none', by_days: 7 });
  if (I.proposal === 'alliance' || I.proposal === 'aid') out.push({ kind: 'join_war', target: 'none', by_days: days });
  if (I.proposal === 'truce') out.push({ kind: 'stay_neutral', target: 'none', by_days: Math.max(days, 90) });
  return out.slice(0, 2);
}

// every id a promise may name, with the names people use for it
function targetEnum(state, ids) {
  const want = new Set(ids); const map = new Map();
  for (const id of want) map.set(id, id);
  for (const aliases of [placeAliases(state), personAliases(state)]) for (const [a, id] of aliases) if (want.has(id) && !map.has(a)) map.set(a, id);
  return buildEnum(map);
}

export default {
  kind: 'audience',
  // Roose Bolton, at Winterfell for the banners, asked to bring his men to Moat Cailin within the fortnight (15 §2
  // `audience-binds`); the verdict is the engine's (here: he agrees)
  fixtureArgs: (state) => ({ character: 'roose_bolton', words: 'Lord Bolton, bring your men to Moat Cailin within the fortnight.', stance: { verdict: 'agree', moodWord: 'composed', directive: 'THE OUTCOME IS SETTLED — YOU AGREE.', I: { request: true } }, face: true }),
  context(state, { character, words, stance, face = true, known = [], memory = '', receipt = [] } = {}) {
    const c = state.characters[character]; if (!c) throw new Error(`no such person: ${character}`);
    const p = state.meta.player; const lord = state.characters[state.houses[p].lord]; const own = c.house === p;
    const verdict = stance?.verdict || null;
    const asked = own ? [] : requestOf(state, c, words, stance);
    const may = AGREEING.has(verdict) ? asked : [];
    const targets = targetEnum(state, [...new Set(may.map((x) => x.target).filter((x) => x && x !== 'none'))]);
    const secrets = c.secret && !c.secretKnown && verdict === 'yield' ? ['their_secret'] : [];
    const V = VOICES[c.id];
    const log = (state.chats?.[c.id] || []).slice(-8);
    const promises = promisesOf(state, c.id);
    const where = placeName(state, placeOf(state, c) || c.loc);
    return {
      state, c, lord, own, verdict, words, face, asked, may, targets, secrets,
      canons: { target: targets.canon },
      kinds: [...new Set(may.map((x) => x.kind))],
      dossier: [
        `DATE: ${dateStr(state.meta.date)}.`,
        `YOU ARE: ${c.name}${c.title ? `, ${c.title}` : ''}${c.age ? `, ${c.age}` : ''}, of House ${state.houses[c.house]?.name}. At ${where}. ${c.traits ? `Your nature: ${c.traits}.` : ''}`,
        V ? `HOW YOU SPEAK: ${V.voice}\nWHAT YOU WANT: ${V.wants}\nWHAT YOU FEAR: ${V.fears}` : null,
        `THE LORD: ${lord?.name || 'the lord'} of House ${state.houses[p].name}.${own ? ' You are sworn to their service.' : ''}`,
        officerKnowledge(state, c) || null,
        memory ? `WHAT YOU REMEMBER (as it reached you):\n${memory}` : known.length ? `WHAT HAS REACHED YOU LATELY:\n${known.slice(0, 6).map((f) => `- ${f.text}`).join('\n')}` : null,
        promises.length ? `YOUR PROMISES: ${promises.map((x) => promiseText(state, x)).join('; ')}.` : null,
        receipt.length ? `WHAT YOU ARE ABOUT TO DO (the lord's command, as it will be done): ${receipt.join('; ')}.` : null,
        log.length ? `THE LAST WORDS BETWEEN YOU:\n${log.map((m) => `${m.role === 'player' ? 'The lord' : 'You'}: ${String(m.text).replace(/\s+/g, ' ').slice(0, 240)}`).join('\n')}` : null,
        face ? `THE SETTING: face to face at ${where}.` : `THE SETTING: a letter from the lord reached you at ${where}; you answer by raven.`,
        `THE OUTCOME (settled by the game):\n${stance?.directive || 'Answer as you would.'}${may.length ? `\nYOU MAY PROMISE: ${may.map((x) => `${x.kind}${x.target && x.target !== 'none' ? ` ${x.target}` : ''} within ${x.by_days} days`).join('; ')}.` : '\nYOU PROMISE NOTHING in this answer.'}`,
      ].filter(Boolean).join('\n'),
    };
  },
  schema(ctx) {
    return obj({
      beats: arr(obj({ kind: oneOf(ctx.face ? ['narration', 'speech'] : ['speech']), text: str(400) }), { min: 1, max: 6 }),
      outcome: obj({
        agrees_to: arr(obj({ kind: oneOf(ctx.kinds.length ? ctx.kinds : ['none']), target: enumProp(ctx.targets, 'target', ['none']), by_days: int(0, 365) }), { max: ctx.may.length ? 2 : 0 }),
        asks_for: str(160),
        reveals: oneOf(['none', ...ctx.secrets]),
        mood: oneOf(MOODS),
      }),
    });
  },
  prompt: (ctx) => [
    { role: 'system', content: system(ctx.state, INSTRUCTIONS) },
    { role: 'user', content: `${ctx.dossier}\n\nTHE LORD SAYS: "${String(ctx.words || '').slice(0, 1200)}"\nAnswer.` },
  ],
  // the words in the realm's voice; the promises the ones asked for, where they were asked
  check(v, ctx) {
    const out = [];
    const text = v.beats.map((b) => b.text).join(' ');
    if (strings(v).some(hasForeignScript)) out.push('a word in a script that is not the realm\'s');
    for (const re of GAME_WORDS) { const m = text.match(re); if (m) { out.push(`"${m[0]}" is not a word of the realm`); break; } }
    for (const a of anachronismsIn(ctx.state, text)) out.push(`"${a.phrase}": ${a.note}`);
    for (const a of v.outcome.agrees_to) {
      const want = ctx.may.find((x) => x.kind === a.kind);
      if (!want) out.push(`${a.kind} was not asked for`);
      else if (want.target !== 'none' && a.target !== want.target) out.push(`${a.kind} names ${a.target}, not ${want.target}, as the lord asked`);
    }
    return out;
  },
  mock: (ctx) => valueOf(ctx),
  fallback: (ctx, problems) => ({ ...valueOf(ctx), problems }),
  fingerprint: (ctx) => `${ctx.c.id}|${ctx.verdict || 'none'}|${ctx.kinds.join(',')}|${ctx.face ? 'face' : 'letter'}`,
};

// the verdict played plainly: a line of speech (with a gesture face to face), the promises asked for when it agrees
const LINES = {
  obey: ['He nodded once.', 'At once, my lord.'],
  agree: ['He considered it, and nodded.', 'Very well. You have my word on it.'],
  bargain: ['He pursed his lips.', 'Perhaps. But nothing comes for nothing.'],
  stall: ['He spread his hands.', 'These are weighty matters. I must think on them.'],
  refuse: ['A long silence. Then a slow shake of the head.', 'No. I will not.'],
  rage: ['His face darkened.', 'You dare? The answer is no, and you will remember that you asked.'],
  yield: ['He swallowed, and could not quite meet the lord\'s eye.', 'As you wish. Only let there be no blood over it.'],
  dismiss: ['He rose so sharply the chair scraped the stone.', 'Enough. We are done here.'],
};
function valueOf(ctx) {
  const [gesture, said] = LINES[ctx.verdict] || ['He listened.', 'I hear you, my lord.'];
  const she = ctx.c.sex === 'f';
  const g = she ? gesture.replace(/\bHe\b/g, 'She').replace(/\bHis\b/g, 'Her').replace(/\bhis\b/g, 'her') : gesture;
  return {
    beats: ctx.face ? [{ kind: 'narration', text: g }, { kind: 'speech', text: said }] : [{ kind: 'speech', text: `${said} — ${ctx.c.name}` }],
    outcome: {
      agrees_to: ctx.may.map((x) => ({ kind: x.kind, target: x.target === 'none' ? 'none' : [...ctx.targets.canon].find(([, id]) => id === x.target)?.[0] || 'none', by_days: x.by_days })),
      asks_for: ctx.verdict === 'bargain' ? 'something real in return' : '',
      reveals: 'none',
      mood: { agree: 'courteous', obey: 'courteous', bargain: 'guarded', stall: 'guarded', refuse: 'cold', rage: 'angry', yield: 'afraid', dismiss: 'angry' }[ctx.verdict] || 'guarded',
    },
  };
}

/** The beats as the conversation keeps them: *narration* between asterisks, speech as it is. */
export const replyText = (v) => v.beats.map((b) => (b.kind === 'narration' ? `*${b.text.replace(/^\*|\*$/g, '')}*` : b.text)).join(' ');
/** The promises of an answer, as the engine makes them: [{ kind, params, days }]. */
export function promisesIn(v, ctx) {
  return (v.outcome?.agrees_to || []).map((a) => {
    const want = ctx.may.find((x) => x.kind === a.kind); if (!want) return null;
    const params = {};
    if (['march_to', 'send_men', 'attend'].includes(a.kind)) params.place = want.target;
    if (a.kind === 'send_men') params.men = want.men;
    if (a.kind === 'release') params.captive = want.target;
    if (a.kind === 'pay') params.gold = want.gold;
    return { kind: a.kind, params, days: Math.max(1, a.by_days || want.by_days) };
  }).filter(Boolean).filter((x) => COMMITMENTS[x.kind]);
}
