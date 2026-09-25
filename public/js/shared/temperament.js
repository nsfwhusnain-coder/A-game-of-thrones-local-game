// How a character takes what the player says to them — decided by the engine, played by the model.
//
// A small model, asked to "play Walder Frey", plays a clever, polite noble whoever the name. So the engine
// settles the things that make people different before the model writes a word:
//   • temperament: courage, pride, wits, guile, temper, warmth, stubbornness and what sways them, read from
//     their history and nature (data/histories.js) and their manner (data/demeanours.js);
//   • what the player's words are: a request, a demand, a threat, an insult, flattery, a bribe, a proposal…;
//   • their mood, which carries through the audience: anger, fear, trust, and how much patience is left;
//   • the verdict: agree, bargain, stall, refuse, refuse in anger, give in from fear, or end the audience.
// The prompt then tells the model the outcome and the manner; the server holds the model to the outcome
// (a refusal cannot sign a pact; an agreement is recorded even if the model forgets).
import { personaFor } from '../../data/histories.js';
import { DEMEANOURS, REGION_SPEECH } from '../../data/demeanours.js';
import { disposition } from './diplomacy.js';
import { realmTotals } from './world.js';

const clamp = (v, a = 0, b = 100) => Math.max(a, Math.min(b, v));
const level = (s, table, dflt) => { s = String(s || '').toLowerCase(); for (const [re, v] of table) if (re.test(s)) return v; return dflt; };

// ── Temperament: a person's nature as numbers (0..1) ──
export function temperament(c) {
  const P = personaFor(c); const t = String(c.traits || '').toLowerCase(); const dm = DEMEANOURS[c.id];
  const courage = level(P.courage, [[/coward|timid|avoids danger|lets others fight/, 0.15], [/patient|cautious|hides it|mild/, 0.35], [/once brave|boastful|in boast|for her children|when it counts|growing/, 0.5], [/fearless|reckless|unbending/, 0.95], [/brave/, 0.75]], 0.55);
  const pride = level(P.pride, [[/immense|arrogant|vain|contempt|grandiose|loud and proud/, 0.92], [/proud|wounded|touchy|jealous|resentful|prickly|insecure/, 0.78], [/humble|modest/, 0.2], [/hid|quiet|wry/, 0.55]], 0.5);
  const wits = level(P.wits, [[/not very clever|not clever|dull|foolish|narrow|simple|shallow/, 0.2], [/brilliant/, 0.92], [/sharp|shrewd|clever|cunning|learned|wise|quick|capable|perceptive|practical/, 0.68]], 0.5);
  const guile = level(P.guile, [[/master schemer/, 0.95], [/schemer|cunning|corrupt|lies|charming schemer/, 0.75], [/honest|none|blunt/, 0.12], [/guarded|secretive|hide|mocking/, 0.5]], 0.45);
  const volatility = level(P.temper, [[/volatile|hot|savage|fierce|hysterical|rage|cruel|passionate|querulous|spiteful|bluster/, 0.85], [/never|cold|calm|patient|controlled|steady|gentle|mild|weary|easy/, 0.15]], 0.45);
  const warmth = level(`${P.temper} ${t} ${dm?.reg || ''}`, [[/cold|contempt|cruel|savage|petulant|sneer|querulous|shrill|bitter|surly|withering|cutting|brutal|harsh|grim|humourless/, 0.18], [/jovial|genial|warm|gentle|kind|charming|generous|easy|earnest|courteous|gracious/, 0.8]], 0.5);
  const stubbornSrc = `${P.weakness} ${P.courage} ${P.temper} ${t} ${dm?.never || ''}`.toLowerCase();
  const stubborn = clamp(pride * 0.5 + (1 - guile) * 0.1 + (/stubborn|unbend|inflexib|grudge|never forgive|will not bend|headstrong|will not be told/.test(stubbornSrc) ? 0.35 : 0) + (courage > 0.8 ? 0.1 : 0), 0, 1);
  const sw = `${P.swayedBy} ${P.weakness}`.toLowerCase();
  const sway = {
    flattery: /flatter|admiration|vain|called king|respect|recognition|approval/.test(sw) || /vain|pompous/.test(t),
    gold: /gold|coin|bribe|advantage|trade/.test(sw) || /greedy/.test(t),
    fear: /fear|safety|safe/.test(sw),
    duty: /duty|oath|law|justice|rights/.test(sw),
    honour: /honou?r/.test(sw),
    family: /family|children|son|daughter|kin|sister|legacy/.test(sw),
    faith: /faith|god|light/.test(sw),
    power: /power|crown|advancement|throne|legacy|climb|winning side/.test(sw),
    vengeance: /vengeance|revenge/.test(sw),
    strength: /strength|boldness|courage|victory/.test(sw),
  };
  return { courage, pride, wits, guile, volatility, warmth, stubborn, sway, persona: P };
}

// ── What the player's words are ──
const NUM = { a: 1, one: 1, two: 2, three: 3, four: 4, five: 5, ten: 10, twenty: 20, fifty: 50, hundred: 100, thousand: 1000 };
export function readIntent(text) {
  const s = ` ${String(text || '').toLowerCase().replace(/[’']/g, "'")} `;
  const has = (re) => re.test(s);
  let gold = 0;
  const g = s.match(/(\d[\d,.]*)\s*(k\b|thousand)?\s*(gold|dragons|golden dragons|coin)/) || s.match(/\b(a|one|two|three|four|five|ten|twenty|fifty|a hundred|hundred)\s+(thousand)?\s*(gold|dragons)/);
  if (g) { const base = /\d/.test(g[1]) ? Number(g[1].replace(/,/g, '')) : (NUM[g[1].replace('a hundred', 'hundred')] || 1); gold = base * (g[2] ? 1000 : 1); }
  const proposal = has(/\b(swear|kneel|bend the knee|fealty|homage|vassal|serve me|be my man|submit)\b/) ? 'fealty'
    : has(/\b(marr(y|iage)|wed|betroth|match between|hand of your|son to your|daughter to)\b/) ? 'marriage'
      : has(/\b(alliance|ally|allies|join (me|us|my|our)|stand with (me|us)|side with (me|us)|fight (with|beside) (me|us))\b/) ? 'alliance'
        : has(/\b(truce|peace|cease|lay down (your|our) arms|end this war)\b/) ? 'truce'
          : has(/\b(trade|commerce|goods|merchants|market|sell (me|us)|buy from)\b/) ? 'trade'
            : has(/\b(lend|loan|borrow)\b/) ? 'loan'
              : has(/\b(send (me|us) (men|knights|swords|ships|aid|grain|food)|men to (help|aid)|your aid|help (me|us))\b/) ? 'aid' : null;
  const threat = has(/\b(or (i|we) (will|shall)|or else|else (i|we)|i will (burn|crush|destroy|kill|hang|take|end)|burn your|crush you|destroy you|you will (regret|pay|die|hang)|my (host|army|armies|swords|men) (will|are|stand)|at your gates|put (you|your) .* to the sword|last warning|mark my words)\b/);
  const insult = has(/\b(coward|craven|fool|idiot|traitor|turncloak|oathbreaker|liar|whore|cunt|bastard|snake|worm|pig|dog|craven|weakling|kingslayer|imp|halfman|old fool|fat)\b/) && !has(/\b(not a|no) (coward|fool|traitor)\b/);
  const flattery = has(/\b(wise|wisest|great(est)?|renowned|famed|mighty|noble|honou?red|brave(st)?|glorious|none (braver|wiser|finer)|your (wisdom|valour|courage|beauty|grace is)|legendary|admire)\b/) && !insult;
  const apology = has(/\b(forgive me|i('m| am) sorry|apologi[sz]e|my apologies|i was wrong|pardon me|beg your pardon)\b/);
  const demand = has(/\b(i demand|you will|you must|you shall|i command|i order|i insist|surrender|hand over|give me|pay me|yield)\b/) && !has(/\bwill you\b/);
  const request = !demand && has(/\b(will you|would you|could you|can you|i ask|i beg|i request|i would have you|please|may i|let us)\b/);
  const offer = gold > 0 || has(/\b(i offer|i will give|i('ll| will) pay|in exchange|in return|a gift|gifts|as a token|you shall have|i can give|i promise you)\b/);
  const question = /\?\s*$/.test(s.trim()) || has(/^\s*(what|where|who|why|how|when|is|are|do|does|did|have|has)\b/);
  const command = has(/^\s*(go|ride|send|raise|bring|fetch|take|find|tell|summon|prepare|muster|march|gather|hire|recruit)\b/);
  const greeting = has(/^\s*(greetings|good (morrow|day|evening)|well met|my lord|my lady|hail|hello)\b/) && s.trim().split(/\s+/).length < 8;
  return { proposal, gold, threat, insult, flattery, apology, demand, request, offer, question, command, greeting };
}

// ── Mood: carries through an audience, cools between turns ──
export function moodOf(state, c) {
  state.moods = state.moods || {};
  const T = temperament(c);
  let m = state.moods[c.id];
  const fullPatience = Math.round(4 + T.warmth * 4 - T.volatility * 2 - (T.pride > 0.85 ? 1 : 0));
  if (!m) m = state.moods[c.id] = { anger: 0, fear: 0, trust: clamp(50 + (c.opinion || 0) * 0.3), patience: fullPatience, turn: state.meta.turn, asked: {} };
  if (m.turn !== state.meta.turn) {
    // a new moon: tempers cool, fear fades, and they will hear you out again
    const k = Math.max(1, state.meta.turn - m.turn);
    m.anger = Math.round(m.anger * 0.5 ** k); m.fear = Math.round(m.fear * 0.5 ** k);
    m.trust = Math.round(m.trust + (clamp(50 + (c.opinion || 0) * 0.3) - m.trust) * 0.3);
    m.patience = fullPatience; m.turn = state.meta.turn; m.asked = {}; delete m.closed;
  }
  m.full = fullPatience;
  return m;
}
export function moodWord(m) {
  if (m.closed) return 'will not see you';
  if (m.anger >= 70) return 'furious';
  if (m.fear >= 60) return 'afraid';
  if (m.anger >= 40) return 'angered';
  if (m.fear >= 30) return 'uneasy';
  if (m.trust >= 75) return 'warm';
  if (m.trust <= 25) return 'distrustful';
  if (m.anger >= 15) return 'irritated';
  return 'composed';
}

const powerOf = (state, h) => { const t = realmTotals(state, h); const armies = Object.values(state.armies || {}).filter((a) => a.owner === h).reduce((n, a) => n + (a.men || 0), 0); return (Number(t.levies) || 0) + (Number(t.menAtArms) || 0) * 2 + armies; };

/**
 * Weigh what the player just said to character c. Mutates the character's mood in state.
 * Returns { verdict, proposal, reasons[], mood, moodWord, directive, T, I }.
 */
export function weighAudience(state, c, text) {
  const p = state.meta.player; const own = c.house === p;
  const T = temperament(c); const I = readIntent(text); const m = moodOf(state, c);
  const reasons = [];
  const odds = powerOf(state, p) / Math.max(1, powerOf(state, c.house));
  // — how the words land —
  if (I.insult) { m.anger += 18 + 40 * T.volatility + 15 * T.pride; m.trust -= 12; m.patience -= T.pride > 0.7 || T.volatility > 0.7 ? 2 : 1; reasons.push('insulted'); }
  if (I.threat && !own) {
    const yieldy = (1 - T.courage) + (odds > 2 ? 0.3 : odds > 1.2 ? 0.1 : odds < 0.6 ? -0.35 : 0) - (T.pride > 0.85 ? 0.15 : 0);
    if (yieldy > 0.75) { m.fear += 45; reasons.push('frightened by the threat'); }
    else if (yieldy > 0.45) { m.fear += 20; m.anger += 15; reasons.push('threatened'); }
    else { m.anger += 28 + 30 * T.pride; reasons.push('defiant under threat'); }
    m.patience -= 1;
  }
  if (I.flattery) {
    if (T.sway.flattery || T.wits < 0.35) { m.trust += 12; reasons.push('flattered'); }
    else if (T.wits > 0.8 && T.guile > 0.6) { m.trust -= 4; reasons.push('sees through the flattery'); }
    else m.trust += 3;
  }
  if (I.apology) { m.anger -= Math.round(22 * (1 - T.stubborn * 0.6)); m.trust += 4; if (m.anger > 20) reasons.push('the apology does not quite mend it'); }
  if (I.offer) { m.trust += T.sway.gold ? 14 : 5; }
  if (I.demand && !own) { m.patience -= 1; m.anger += Math.round(10 * T.pride); }
  // asking the same thing again after a refusal wears on them
  const key = I.proposal || (I.demand ? 'demand' : I.request ? 'request' : null);
  if (key && m.asked[key] === 'refused') { m.patience -= 1; m.anger += 6; reasons.push('asked again'); }
  m.anger = clamp(Math.round(m.anger)); m.fear = clamp(Math.round(m.fear)); m.trust = clamp(Math.round(m.trust));
  m.patience = Math.max(0, Math.round(m.patience));

  // — the outcome, when something is asked of them —
  let verdict = null;
  if (own) {
    verdict = I.command || I.demand || I.request ? 'obey' : null;
  } else if (I.proposal || I.demand || I.request || I.offer) {
    const d = disposition(state, c.id);
    let score = d ? ((I.proposal && d.proposals[I.proposal]) ? d.proposals[I.proposal].score : d.score) : 0;
    if (I.gold) {
      const theirs = Number(state.houses[c.house]?.figures?.treasury?.v) || 5000;
      const w = Math.min(35, (I.gold / Math.max(500, theirs * 0.2)) * 12) * (T.sway.gold ? 1.5 : 0.8);
      score += w; if (w > 5) reasons.push(`tempted by ${I.gold.toLocaleString('en-US')} dragons`);
    }
    score += (m.trust - 50) * 0.35 - m.anger * 0.5;
    score += m.fear * 0.6 * (1 - T.courage);
    if (I.demand) score -= 12 + T.stubborn * 15;
    if (I.flattery && T.sway.flattery) score += 6;
    const fear = m.fear >= 55 && T.courage < 0.55;
    if (fear) verdict = 'yield';
    else if (score >= 18) verdict = 'agree';
    else if (score >= 0) verdict = I.proposal || I.demand ? 'bargain' : 'agree';
    else if (score >= -18) verdict = 'stall';
    else verdict = m.anger >= 45 && T.volatility >= 0.6 ? 'rage' : 'refuse';
    if (verdict === 'agree' && I.proposal === 'fealty' && ['paramount', 'crown'].includes(state.houses[c.house]?.rank) && !fear) verdict = score > 40 ? 'bargain' : 'refuse';
    reasons.push(`reckoning ${Math.round(score)}`);
    if (key) m.asked[key] = ['refuse', 'rage', 'stall'].includes(verdict) ? 'refused' : verdict;
  }
  if (!own && (m.patience <= 0 || (m.anger >= 88 && T.volatility >= 0.6))) { verdict = 'dismiss'; m.closed = true; }
  return { verdict, proposal: I.proposal, reasons, mood: m, moodWord: moodWord(m), T, I, directive: directive(state, c, T, I, m, verdict) };
}

// What a character wants in return when they will not simply agree
function priceOf(T, I) {
  if (T.sway.gold) return 'gold — name a sum';
  if (T.sway.power) return 'a place, a title or lands for your house';
  if (T.sway.family) return 'a marriage for one of your children, or safety for your kin';
  if (T.sway.vengeance) return 'help against the enemy you hate';
  if (T.sway.flattery) return 'to be honoured publicly — a seat of honour, a title, a song';
  if (T.sway.duty || T.sway.honour) return 'a sworn promise, and proof the cause is just';
  if (I.proposal === 'alliance') return 'aid in your own quarrels first';
  return 'something real in return';
}

function manner(state, c, T) {
  const dm = DEMEANOURS[c.id]; const p = state.meta.player; const ph = state.houses[p]; const lord = state.characters[ph?.lord];
  const lordWord = lord && /\b(lady|queen|princess)\b/i.test(`${lord.title} ${(lord.roles || []).join(' ')}`) ? 'my lady' : 'my lord';
  const title = lord ? `${lordWord === 'my lady' ? 'Lady' : 'Lord'} ${ph.name}` : `the lord of House ${ph?.name}`;
  const fill = (s) => String(s).replace(/\{lord\}/g, `"${lordWord}"`).replace(/\{title\}/g, `"${title}"`).replace(/\{first\}/g, `"${lord?.name.split(' ')[0] || lordWord}"`).replace(/\{House\}/g, ph?.name || '');
  const LEN = { terse: 'Say little: one to three short sentences of speech in all.', plain: 'Speak plainly: a few sentences.', full: 'You talk a good deal: several sentences, with colour.', rambling: 'You ramble and wander off the point before you come back to it.' };
  if (dm) return `HOW YOU CARRY YOURSELF: ${dm.reg}. You address the player as ${fill(dm.addr)}. Habits: ${dm.tics}. You would never ${dm.never}. ${LEN[dm.len] || LEN.plain}`;
  // everyone else: a manner read from their nature and homeland
  const reg = [];
  if (T.warmth > 0.7) reg.push('warm and courteous'); else if (T.warmth < 0.3) reg.push(T.pride > 0.75 ? 'haughty and curt' : 'cold and unfriendly');
  if (T.courage < 0.3) reg.push('nervous and deferential, hedging every answer');
  if (T.volatility > 0.7 && T.warmth < 0.5) reg.push('rude and quick to take offence');
  if (T.guile > 0.7) reg.push('smooth and evasive; you never say quite what you mean');
  if (T.wits < 0.3) reg.push('plain, simple words; you miss subtleties');
  if (T.pride > 0.8) reg.push('conscious of your rank and your house\'s dignity');
  if ((c.age || 30) >= 65) reg.push('old and slow of speech');
  if ((c.age || 30) < 15) reg.push('young, and you sound it');
  const region = state.houses[c.house]?.region;
  return `HOW YOU CARRY YOURSELF: ${reg.join('; ') || 'an ordinary courtesy'}${REGION_SPEECH[region] ? `; ${REGION_SPEECH[region]}` : ''}. Address the player as "${lordWord}" unless your mood says otherwise. ${T.warmth < 0.3 || T.courage > 0.8 ? LEN.terse : LEN.plain}`;
}

function directive(state, c, T, I, m, verdict) {
  const out = [manner(state, c, T)];
  const mw = moodWord(m);
  const moodLine = {
    furious: 'You are FURIOUS. It shows: in your voice, your hands, your words.',
    angered: 'You are ANGERED by how this audience has gone, and do not hide it well.',
    afraid: 'You are AFRAID of the player. You try to hide it and fail.',
    uneasy: 'You are UNEASY; the player\'s power weighs on you.',
    warm: 'You feel WARMLY toward the player at this moment.',
    distrustful: 'You DISTRUST the player and weigh every word they say.',
    irritated: 'You are IRRITATED.',
    composed: 'You are composed.',
  }[mw];
  if (moodLine) out.push(`YOUR MOOD NOW: ${moodLine}${m.patience <= 1 && !m.closed ? ' Your patience is nearly gone — one more provocation and you will end this.' : ''}`);
  if (I.insult) out.push(T.volatility > 0.6 ? 'They have insulted you: answer the insult in kind, sharply.' : T.pride > 0.75 ? 'They have insulted you: answer with icy dignity; you will remember it.' : 'They have insulted you: it wounds you; you may show it or swallow it.');
  if (I.flattery && T.wits > 0.8 && T.guile > 0.6 && !T.sway.flattery) out.push('You see the flattery for what it is, and may say so.');
  const what = I.proposal ? { fealty: 'swearing fealty to the player', marriage: 'the marriage', alliance: 'the alliance', truce: 'peace / a truce', trade: 'the trade', loan: 'the loan', aid: 'sending aid' }[I.proposal] : 'what the player asks';
  const V = {
    obey: 'The player is your lord. You do as he bids, at once and willingly, in your own manner.',
    agree: `THE OUTCOME IS SETTLED — YOU AGREE to ${what}. Say yes in your own manner${T.guile > 0.6 ? ', and perhaps let slip what you gain by it' : ''}.`,
    bargain: `THE OUTCOME IS SETTLED — YOU DO NOT AGREE YET to ${what}. You are willing only for a price: ${priceOf(T, I)}. Name it. Do not accept without it.`,
    stall: `THE OUTCOME IS SETTLED — YOU NEITHER ACCEPT NOR REFUSE ${what}. You delay: you must think on it, consult your kin, see how the wind blows. Commit to nothing.`,
    refuse: `THE OUTCOME IS SETTLED — YOU REFUSE ${what}. Refuse ${T.warmth > 0.65 ? 'with courtesy and regret' : T.pride > 0.8 ? 'with cold contempt' : T.guile > 0.7 ? 'smoothly, with a reason that is not the true one' : 'plainly'}. Do not give way, whatever else is said.`,
    rage: `THE OUTCOME IS SETTLED — YOU REFUSE ${what}, IN ANGER. You may threaten or insult them back.`,
    yield: `THE OUTCOME IS SETTLED — YOU GIVE IN to ${what}, out of fear. Try to save face — bargain for small mercies — but you yield.`,
    dismiss: 'THE OUTCOME IS SETTLED — YOU END THIS AUDIENCE NOW. You rise and leave, or order them out, or (by raven) write that you will hear no more. Make it final. You will not speak with them again this moon.',
  }[verdict];
  if (V) out.push(V);
  else if (I.question || I.greeting || !verdict) {
    const open = m.trust >= 60 && T.guile < 0.7;
    out.push(open ? 'You answer freely what you know, as far as your house\'s interest allows.' : T.guile > 0.7 ? 'You give little away; you may mislead them if it serves you, and you ask questions of your own.' : 'You are guarded: you answer, but share no more than you must.');
  }
  return out.join('\n');
}

// Ops a character's reply may not carry unless they agreed: a refusal signs nothing.
const BINDING = new Set(['pact', 'liege', 'wed', 'betroth']);
/**
 * Hold the reply to the verdict. Returns the changes to apply (the model's, filtered, plus the agreement
 * itself when the model forgot to record it).
 */
export function holdToVerdict(state, c, stance, changes) {
  const p = state.meta.player; const agreed = ['agree', 'yield'].includes(stance.verdict);
  let out = (changes || []).filter((ch) => {
    if (!ch || !BINDING.has(String(ch.op))) return true;
    const touchesPlayer = [ch.a, ch.b, ch.house, ch.liege].some((x) => String(x || '').toLowerCase() === p) || ch.op === 'wed' || ch.op === 'betroth';
    return !touchesPlayer || agreed;
  });
  if (agreed && stance.proposal && c.house !== p) {
    const has = (op) => out.some((ch) => ch && ch.op === op);
    const terms = `Agreed in audience with ${c.name}`;
    if (['alliance', 'trade', 'truce', 'loan'].includes(stance.proposal) && !has('pact')) out.push({ op: 'pact', type: stance.proposal, a: p, b: c.house, terms, status: 'active' });
    if (stance.proposal === 'marriage' && !has('pact') && !has('betroth')) out.push({ op: 'pact', type: 'marriage', a: p, b: c.house, terms: `${terms}: a match to be arranged`, status: 'pending' });
    if (stance.proposal === 'fealty' && !has('liege') && state.houses[c.house]?.lord === c.id) out.push({ op: 'liege', house: c.house, liege: p });
  }
  // an agreement warms them a little; a refusal is remembered
  if (c.house !== p && stance.verdict) {
    const note = { agree: 'Agreed to the player\'s proposal', yield: 'Gave in to the player out of fear', refuse: 'Refused the player', rage: 'Was provoked to anger by the player', dismiss: 'Threw the player out of an audience', bargain: 'Named a price to the player', stall: 'Put the player off' }[stance.verdict];
    if (note && !out.some((ch) => ch?.op === 'character' && ch.id === c.id)) out.push({ op: 'character', id: c.id, note: `${note}${stance.proposal ? ' (' + stance.proposal + ')' : ''}.`, opinion: clamp((c.opinion || 0) + ({ agree: 3, yield: -6, rage: -10, dismiss: -12, refuse: -2 }[stance.verdict] || 0), -100, 100) });
  }
  return out;
}

/** A few words for a person's nature, for the character sheet and the audience header. */
export function natureTags(T) {
  const tags = [];
  tags.push(T.courage >= 0.9 ? 'fearless' : T.courage >= 0.7 ? 'brave' : T.courage <= 0.2 ? 'craven' : T.courage <= 0.4 ? 'cautious' : null);
  tags.push(T.pride >= 0.9 ? 'arrogant' : T.pride >= 0.75 ? 'proud' : T.pride <= 0.25 ? 'humble' : null);
  tags.push(T.wits >= 0.9 ? 'brilliant' : T.wits >= 0.65 ? 'shrewd' : T.wits <= 0.25 ? 'dim' : null);
  tags.push(T.guile >= 0.9 ? 'a schemer' : T.guile >= 0.7 ? 'cunning' : T.guile <= 0.15 ? 'honest' : null);
  tags.push(T.volatility >= 0.8 ? 'hot-tempered' : T.volatility <= 0.2 ? 'cold-blooded' : null);
  tags.push(T.warmth >= 0.75 ? 'warm' : T.warmth <= 0.2 ? 'unfriendly' : null);
  tags.push(T.stubborn >= 0.75 ? 'stubborn' : T.stubborn <= 0.3 ? 'pliable' : null);
  const sway = Object.keys(T.sway).filter((k) => T.sway[k]);
  return { tags: tags.filter(Boolean), sway };
}
export const VERDICT_LABEL = { obey: 'Obeys', agree: 'Agrees', bargain: 'Names a price', stall: 'Puts you off', refuse: 'Refuses', rage: 'Refuses in anger', yield: 'Gives in', dismiss: 'Ends the audience' };
