// The words of a letter, quoted for a card (bug hunt TX1). A letter opens with its greeting ("Eddard. My dear Ned, ..."; "Lord Targaryen."), and a card
// that quoted the first sentence quoted the greeting: "A raven from Riverrun: “Eddard.”". This takes the first sentence that says something.
//
// Pure and browser-safe: no I/O, no dice, no clock.

const OPENER = /^(?:my|dear|good|noble|honou?red|gracious|most|your|to)$/i;
// one word that is an answer, not an address ("No." is the whole of a letter that refuses)
const ANSWER = /^(?:no|yes|aye|nay|never|enough|perhaps|maybe|well|agreed|done|so|why|how|what|who|when|where|indeed|alas|wait|stay|hold|listen|hear|come|never)$/i;
const VERBY = /\b(?:will|shall|am|are|is|was|were|have|had|do|did|must|can|cannot|send|come|ask|bring|hold|take|give|write|wish|beg|hope|fear|know|remember|ride|march|hear|see)\b/i;
const LINK = /^(?:of|the|and|in|at|from|lord|lady|ser|prince|princess|king|queen|maester|septon)$/i;
// "My dear Prince, my lord—" before the matter of a sentence: the matter is what is quoted
const SALUTE = /^(?:(?:my|dear|good|noble|honou?red|gracious|most)\b[^,;:.!?—–]{0,40}[,—–]\s*)+(?=\S)/i;
const SIGNED = /\s+[—–-]+\s+(?:[A-Z][\w'’-]*\s?){1,4}$/; // ("… — Hoster Tully": the name a letter is signed with)

const plainWords = (s) => String(s).replace(/[.,:;!?…—–-]+$/g, '').split(/\s+/).filter(Boolean);

/** A greeting: a few words that only address someone (a name, a title, "My dear Ned") and say nothing. */
export function isGreeting(sentence) {
  const w = plainWords(String(sentence || '').trim());
  if (!w.length || w.length > 5) return false;
  if (w.length === 1 && ANSWER.test(w[0])) return false;
  if (w.some((x) => !/^[A-Za-z'’,-]+$/.test(x)) || VERBY.test(w.join(' '))) return false;
  return OPENER.test(w[0]) || w.every((x) => /^[A-Z]/.test(x) || LINK.test(x));
}

const clip = (s, max) => {
  if (s.length <= max) return s;
  const cut = s.slice(0, max); const at = cut.search(/[\s,;:—–-][^\s,;:—–-]*$/);
  return `${(at > max * 0.5 ? cut.slice(0, at) : cut).replace(/[\s,;:—–-]+$/, '')}…`;
};

/** What to quote of a letter: its first sentence that is not a greeting (with the next, when it is only a few words), clipped to `max` characters. */
export function quoteOf(text, max = 220) {
  const plain = String(text ?? '').replace(/\*[^*]*\*/g, ' ').replace(/\s+/g, ' ').trim().replace(SIGNED, '');
  const parts = plain.split(/(?<=[.!?…])\s+/).filter(Boolean);
  let i = 0; while (i < parts.length - 1 && isGreeting(parts[i])) i++;
  let q = parts[i] || '';
  const bare = q.replace(SALUTE, '');
  if (plainWords(bare).length >= 4) q = bare.charAt(0).toUpperCase() + bare.slice(1);
  if (plainWords(q).length <= 3 && parts[i + 1]) q = `${q} ${parts[i + 1]}`;
  return clip(q.trim(), max);
}
