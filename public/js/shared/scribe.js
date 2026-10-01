// The scribe's plain rules (docs/gdd/12-ui-ux.md §4, WP Q1): what is done to a lord's words before they go to the steward as an order — with no
// model at all, so it is instant, the same on the server and in the browser, and the floor under the small model that may do more.
//
//   fixOrder(text, { names, spoken }) → { text, changed }
//
// It mends spacing and punctuation, the capitals of a sentence and of a name the lord has met (a name is only ever put right toward a name
// the caller lists: the names the browser was sent), a table of frequent slips ("teh", "wiht"), and the letters of the words an order is made
// of ("banaers" → "banners", "mne" → "men"). A dictated line also loses its "um"s. It never adds a word, never drops one that means something,
// never changes a number, and leaves a word it does not know exactly as it was: what it cannot mend is the small model's to try, and the
// steward's to ask about. Pure: no DOM, no clock, no dice.

const SLIPS = {
  teh: 'the', adn: 'and', nad: 'and', wiht: 'with', wtih: 'with', taht: 'that', thier: 'their', wich: 'which', whihc: 'which', untill: 'until', recieve: 'receive', recieved: 'received',
  definately: 'definitely', seperate: 'separate', occured: 'occurred', becuase: 'because', becasue: 'because', alot: 'a lot', tommorow: 'tomorrow', tomorow: 'tomorrow', wnat: 'want',
  shoud: 'should', woudl: 'would', coudl: 'could', hte: 'the', yuo: 'you',sned: 'send', sedn: 'send', mrach: 'march', amry: 'army', gaurd: 'guard', garison: 'garrison', garrision: 'garrison', tourny: 'tourney', banermen: 'bannermen', calvary: 'cavalry',
  soliders: 'soldiers', solders: 'soldiers', knigths: 'knights', archres: 'archers', speamen: 'spearmen', dragns: 'dragons', dragonns: 'dragons',
};

/** The words an order is made of: a word of these that is a letter or two out is put right (only from six letters, or a plain swap of two neighbours). */
const VOCAB = ['banners', 'banner', 'muster', 'mustered', 'garrison', 'garrisons', 'soldiers', 'knights', 'archers', 'spearmen', 'cavalry', 'infantry', 'levies', 'bannermen', 'castle', 'castles',
  'tourney', 'tournament', 'feast', 'wedding', 'marriage', 'betrothal', 'alliance', 'treaty', 'ransom', 'prisoner', 'prisoners', 'hostage', 'hostages', 'dragons', 'stags', 'coin', 'grain',
  'harvest', 'granary', 'granaries', 'treasury', 'taxes', 'tribute', 'merchants', 'smallfolk', 'refugees', 'messenger', 'messengers', 'letter', 'raven', 'ravens', 'envoy', 'emissary',
  'march', 'ride', 'send', 'sail', 'raise', 'call', 'gather', 'hold', 'defend', 'attack', 'besiege', 'siege', 'relieve', 'reinforce', 'reinforcements', 'escort', 'protect', 'guard', 'watch',
  'scout', 'scouts', 'patrol', 'ambush', 'retreat', 'advance', 'withdraw', 'surrender', 'negotiate', 'propose', 'demand', 'summon', 'summoned', 'command', 'commander', 'captain', 'steward',
  'maester', 'septon', 'lady', 'lord', 'king', 'queen', 'prince', 'princess', 'warden', 'kingsroad', 'ships', 'fleet', 'harbor', 'harbour', 'hundred', 'thousand', 'twenty', 'thirty', 'forty',
  'fifty', 'sixty', 'seventy', 'eighty', 'ninety', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen', 'thirteen', 'fourteen', 'twelve', 'eleven', 'between', 'towards', 'toward',
  'winter', 'summer', 'autumn', 'spring', 'northern', 'southern', 'western', 'eastern', 'river', 'bridge', 'forest', 'mountains', 'wall', 'walls', 'towers', 'gates', 'rebuild', 'repair',
  'fortify', 'fortifications', 'supplies', 'provisions', 'wagons', 'horses', 'weapons', 'armor', 'armour', 'swords', 'spears', 'crossbows', 'catapults', 'tomorrow', 'immediately'];

/** Words that are already right, whatever they resemble: a name is never put right toward one of these. */
const COMMON = new Set(('a about above after again against all also although always am an and any are army as at away back be because been before being between both but by can come could day days did do does down each ' +
  'every few first for from get give go going good got had has have he her here hers him his how i if in into is it its just keep last least less let like made make many may me men more most much must my ' +
  'need never new next no nor not now of off on once one only or other our out over own same see she should since so some still such take than that the their them then there these they this those ' +
  'through to too two under until up upon us very want was we well were what when where which while who whom why will with without would year yes you your ' +
  'lord lady ser king queen prince house north south east west near far high low old young great small big long short strong weak fast slow ready safe sure dead alive free hold held word words ' +
  'winter summer autumn spring camp valley point sound sept ford harbor harbour moon brothers burned painted dogs sons second ears crows pass weaver shepherd humble hasty gaunt wells broom hunt hunter yew ' +
  'gold food men host hosts sword swords shield shields horse horses ship ships boat boats road roads land lands town towns keep tower towers hall halls gate gates wall walls river hill hills field fields ' +
  'give tell ask say said send sent bring brought take took find found leave left stay stand stood wait watch fight fought win won lose lost kill killed die died live lived meet met talk speak spoke write wrote ' +
  'marsh sand snow ice fire blood iron stone wood water salt wine bread grain corn crown throne realm peace war truce oath vow debt gift gifts tax taxes moon moons week weeks month months ' +
  'zero one two three four five six seven eight nine ten eleven twelve thirteen fourteen fifteen sixteen seventeen eighteen nineteen twenty thirty forty fifty sixty seventy eighty ninety hundred thousand dozen score half ' +
  'first second third fourth fifth tenth').split(/\s+/));
const NUMBER_WORDS = /\b(?:zero|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety|hundred|thousand|dozen|score|half)\b/g;

/** What two neighbouring letters swapped may have been meant for: the order's own words, and a few little ones ("mne" is "men"; "form" is a word, so "from" is not here). */
const SWAPS = [...VOCAB, 'men', 'and', 'the', 'with', 'that', 'have', 'they', 'then', 'them', 'when', 'where', 'which', 'would', 'could', 'should', 'about', 'after', 'ready', 'send', 'take', 'bring', 'hold', 'gold'];
const QUESTION = /^(?:what|who|whom|whose|where|when|why|how|which|is|are|am|was|were|do|does|did|can|could|would|will|shall|should|may|might|have|has|had)\b/i;
const FILLERS = /\b(?:u+m+|u+h+|e+r+m*|hm+|mm+h?m*|ah+m*)\b[,.]?\s*|\b(?:you know|i mean|kind of|sort of)\b,?\s*/gi;

// ── edit distance (Damerau: a swap of neighbours is one slip) ────────────────────────────────────────────────────────────────
export function distance(a, b, max = Infinity) {
  if (a === b) return 0; if (Math.abs(a.length - b.length) > max) return max + 1;
  const n = a.length, m = b.length; const d = Array.from({ length: n + 1 }, (_, i) => [i, ...Array(m).fill(0)]);
  for (let j = 1; j <= m; j++) d[0][j] = j;
  for (let i = 1; i <= n; i++) for (let j = 1; j <= m; j++) {
    d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
  }
  return d[n][m];
}
const limitFor = (len) => (len >= 9 ? 2 : len >= 6 ? 1 : 0);
/** The one candidate nearest to `word` within `max` slips, or null when none is, or two are equally near. */
function nearest(word, list, max, keep, prefer = null) {
  let best = null, bestD = max + 1, tie = false; let tied = [];
  for (const c of list) {
    if (keep && !keep(c)) continue;
    const d = distance(word, c.toLowerCase(), max); if (d > max) continue;
    if (d < bestD) { best = c; bestD = d; tie = false; tied = [c]; } else if (d === bestD && c.toLowerCase() !== best.toLowerCase()) { tie = true; tied.push(c); }
  }
  if (tie && prefer) { const mine = tied.filter((c) => prefer.has(c)); if (mine.length === 1) return mine[0]; } // two names as near: the lord's own household's wins ("rodrick" is Ser Rodrik, not Podrick of the Rock)
  return best && !tie ? best : null;
}
/** A plain inflection of a word already right ("harbors", "raised", "mustering") is no slip: it is left as it was. */
const inflected = (w, known) => ['s', 'es', 'ed', 'd', 'ing', 'ly', 'er', 'ers'].some((x) => w.endsWith(x) && (known(w.slice(0, -x.length)) || known(w.slice(0, -x.length) + 'e')));
const swapOf = (a, b) => a.length === b.length && a.length >= 3 && distance(a, b, 1) === 1 && [...a].sort().join('') === [...b].sort().join('');

/** The single words of a list of names ("Moat Cailin" → Moat, Cailin), with the words that are only common ones left out. */
export function nameWords(names) {
  const out = new Set();
  for (const n of names || []) for (const w of String(n).split(/[\s'’-]+/)) if (/^\p{L}{3,}$/u.test(w) && (w[0] === w[0].toUpperCase())) out.add(w);
  return [...out];
}

/**
 * The lord's words, mended by rule. `names` are the names he has been sent (holdings, houses, people): a name is put right only toward one of
 * these, so the rules can never say a name the lord has not met. `spoken` also drops what a dictated line is full of ("um", "you know").
 */
export function fixOrder(text, { names = [], spoken = false } = {}) {
  const original = String(text ?? '');
  let s = original.replace(/[​-‍﻿]/g, '').replace(/\s+/g, ' ').trim();
  if (!s) return { text: '', changed: original !== '' };
  if (spoken) s = s.replace(FILLERS, ' ').replace(/^(?:i['’]m|i am|and)\s+(?=(?:send|call|march|raise|hold|gather|summon|ride|sail|hire|buy|build|seize|give|bring|take|tell|write|ask|order|have|let|make|marry|host|muster)\b)/i, '').replace(/\s+/g, ' ').trim();
  const words = nameWords(names).filter((w) => !COMMON.has(w.toLowerCase())); const byLower = new Map(words.map((w) => [w.toLowerCase(), w]));
  const vocab = new Set(VOCAB);
  const prefer = names.own ? new Set(nameWords(names.slice(0, names.own))) : null; // `names.own`: how many of the names, from the first, are the lord's own people (lexiconOf)
  // word by word: letters only, so numbers, quotes and the marks between words are left as they are
  const known = (x) => COMMON.has(x) || vocab.has(x);
  s = s.replace(/\p{L}[\p{L}'’]*/gu, (w) => {
    const lower = w.toLowerCase();
    if (SLIPS[lower] !== undefined && SLIPS[lower] !== lower) { const r = SLIPS[lower]; return w[0] === w[0].toUpperCase() && w.length > 1 && w === w[0] + w.slice(1).toLowerCase() ? r[0].toUpperCase() + r.slice(1) : r; }
    // a name the lord has met, however it was cased
    if (byLower.has(lower) && lower.length >= 4) return byLower.get(lower);
    if (known(lower) || inflected(lower, known)) return w;
    if (lower.length >= 6) {
      const capital = w[0] === w[0].toUpperCase();
      const name = nearest(lower, words, capital && lower.length >= 7 ? 2 : limitFor(lower.length), (c) => !COMMON.has(c.toLowerCase()), prefer);
      if (name && (capital || distance(lower, name.toLowerCase(), 2) <= 1)) return name;
    }
    // an order's own words: a slip of a letter in a long one, or two neighbours swapped in any
    const swap = SWAPS.find((v) => swapOf(lower, v));
    if (swap) return w[0] === w[0].toUpperCase() ? swap[0].toUpperCase() + swap.slice(1) : swap;
    if (lower.length >= 6) { const v = nearest(lower, VOCAB, limitFor(lower.length)); if (v) return w[0] === w[0].toUpperCase() ? v[0].toUpperCase() + v.slice(1) : v; }
    return w;
  });
  // a word said twice running ("the the")
  s = s.replace(/\b(the|a|an|to|and|of|in|on|with|at|for)(\s+\1\b)+/giu, '$1');
  // a title before a name is written with a capital
  s = s.replace(/\b(ser|lord|lady|maester|septon|prince|princess|king|queen|khal|master)\s+(?=\p{Lu})/gu, (m, t) => t[0].toUpperCase() + t.slice(1) + ' ');
  // spacing and marks
  s = s.replace(/\s+([,.;:!?])/g, '$1').replace(/([,;:])(?=\p{L})/gu, '$1 ').replace(/([.!?])(?=\p{Lu})/gu, '$1 ').replace(/\s+/g, ' ').replace(/[,;:]+$/, '').trim();
  // "i" is I; a sentence begins with a capital
  s = s.replace(/\bi\b(?=\s|'|’|$)/g, 'I').replace(/(^|[.!?]\s+)(\p{Ll})/gu, (m, a, c) => a + c.toUpperCase());
  if (s && !/[.!?"”’)]$/.test(s)) s += QUESTION.test(s) ? '?' : '.';
  return { text: s, changed: s !== original.trim() };
}

/** The names a lord has been sent — the holdings, houses and people of the state the browser holds — for the scribe to put a misspelt name right toward. */
export function lexiconOf(state) {
  const player = state?.meta?.player; const people = Object.values(state?.characters || {}).filter((c) => c?.name);
  const own = people.filter((c) => player && c.house === player).map((c) => c.name);
  const out = [...own];
  for (const h of Object.values(state?.holdings || {})) if (h?.name) out.push(h.name);
  for (const h of Object.values(state?.houses || {})) if (h?.name) out.push(h.name);
  for (const c of people) if (!(player && c.house === player)) out.push(c.name);
  out.own = own.length; // the lord's own people come first, and break a tie between two names as near a slip
  return out;
}

/**
 * What a model's mending of `before` may not have done to it (an empty list when it did none of these): change a number, drop a name, rewrite
 * more than a spelling's worth of the line, or write in another script. Used by the scribe call's check and by anything that would trust a mended line.
 */
export function driftOf(before, after, { spoken = false } = {}) { void spoken; // (a dictated line reaches the model with its "um"s already taken out by the rules, so it is held to the same measure)
  const out = []; const a = String(before || ''), b = String(after || '');
  if (!b.trim()) return ['nothing was written'];
  const digits = (t) => [...(t.match(/\d+/g) || []), ...(t.toLowerCase().match(NUMBER_WORDS) || [])].join(',');
  if (digits(a) !== digits(b)) out.push('a number was changed');
  const wa = a.toLowerCase().match(/\p{L}+|\d+/gu) || [], wb = b.toLowerCase().match(/\p{L}+|\d+/gu) || [];
  const same = (x, y) => x === y || (x.length >= 4 && y.length >= 4 && distance(x, y, x.length >= 7 ? 2 : 1) <= (x.length >= 7 ? 2 : 1));
  const L = Array.from({ length: wa.length + 1 }, () => Array(wb.length + 1).fill(0));
  for (let i = 1; i <= wa.length; i++) for (let j = 1; j <= wb.length; j++) L[i][j] = same(wa[i - 1], wb[j - 1]) ? L[i - 1][j - 1] + 1 : Math.max(L[i - 1][j], L[i][j - 1]);
  if (wa.length && L[wa.length][wb.length] < 0.85 * Math.max(wa.length, wb.length)) out.push('the words were changed, not only their spelling');
  const ratio = b.length / Math.max(1, a.length);
  if (ratio < 0.7 || ratio > 1.4) out.push('the length changed too much for a spelling');
  const la = a.toLowerCase(), lb = b.toLowerCase();
  if (distance(la, lb, Math.ceil(la.length * 0.4)) > la.length * 0.4) out.push('more than spelling was changed');
  // a name written with a capital in the middle of a sentence must still be there, or a slip of it
  const tokensB = (lb.match(/\p{L}+/gu) || []);
  for (const m of a.matchAll(/(?<=[\p{L}\d,;] )\p{Lu}\p{L}{2,}/gu)) {
    const w = m[0].toLowerCase(); if (!tokensB.some((t) => distance(w, t, 2) <= 2)) { out.push(`the name ${m[0]} was lost`); break; }
  }
  return out;
}
