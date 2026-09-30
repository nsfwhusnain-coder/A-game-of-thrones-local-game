// Names that read like names (docs/gdd/18-headlines.md §1.2 cause 5, §3.1; WP N2). The engine keeps its data in the shapes
// it needs — a house called "Baratheon of King's Landing", a host called "The Banners of Stark", a lord called `Jon
// "Greatjon" Umber`, an army of 1,796 men — and none of those may reach a headline as they are. These helpers turn them
// into what a herald would say: "the Crown", "the Stark host", "Lord Umber", "nearly two thousand".
//
// Pure and browser-safe (the server and the client both use them): no I/O, no dice, no clock. A helper never throws and
// never says "undefined": what it cannot name it names plainly ("a house", "someone", "a host", nothing at all for a
// number that is no number).
//
//   houseLabel(state, houseId)   "House Stark", "the Free Folk", "the Night's Watch", "the Crown", "Braavos"
//   houseShort(state, houseId)   "Stark" — the family name alone, for "the Stark host"
//   who(state, charId)           the name as it is; a byname without its quotes ("Lord Umber", "Smalljon Umber")
//   partyLabel(state, party)     "the Stark host", "the Iron fleet", "the host of Mance Rayder"
//   roughly(n)                   a number in words: "seven", "some three hundred", "nearly two thousand"
//   list(names)                  "Umber, Manderly and Karstark"; five or more, a count with two of them named

const HOUSE_RANKS = new Set(['paramount', 'major', 'minor', 'exile']); // a rank that is a House (the crown is the Crown)
const titled = (id) => String(id ?? '').replace(/[_-]+/g, ' ').trim().replace(/\b[a-z]/g, (x) => x.toUpperCase());
const noThe = (s) => String(s || '').trim().replace(/^(?:the\s+)+/i, '');
// the one house whose data name carries an epithet nobody uses ("Nymeros Martell": everyone says House Martell)
const EPITHET = /^Nymeros\s+/;

/** A house's name in parts: `base` ("Baratheon"), and `place` if the data names a branch by its seat ("Dragonstone"). */
function partsOf(h) {
  let n = noThe(h?.name).replace(/^house\s+/i, '');
  let place = null;
  // "Royce of the Gates of the Moon", "Brune of the Dyre Den": the name of a place is not part of a house's name
  const m = n.match(/^(.+?)\s+of\s+(?:the\s+)?(.+)$/i);
  if (m) { n = m[1]; place = m[2]; }
  return { base: n.replace(EPITHET, '').trim(), place };
}
const isHouse = (h) => !h?.rank || HOUSE_RANKS.has(h.rank);

/** How a house is named inside a sentence. Unknown ids come back as their own words, never as "House …". */
export function houseLabel(state, houseId) {
  const h = state?.houses?.[houseId];
  if (!h) return houseId ? titled(houseId) || 'a house' : 'a house';
  if (h.rank === 'crown') return 'the Crown';
  if (isHouse(h)) { const { base } = partsOf(h); return base ? `House ${base}` : 'a house'; }
  const name = String(h.name || '').trim();
  if (!name) return titled(houseId) || 'a house';
  // a free city is its own name ("Braavos"); an order, a tribe or a company is "the …", whatever the data called it; and a ledger's
  // "Khalasar of Drogo" is "the Dothraki" (the people's own word, from its id), never a name with a person's in it
  if (h.rank !== 'city_state' && / of /.test(name) && titled(houseId)) return `the ${titled(houseId)}`;
  if (h.rank === 'city_state') return /^the\s+/i.test(name) ? `the ${noThe(name)}` : name;
  return `the ${noThe(name)}`;
}

/** The family name alone ("Stark"); for the Crown, "royal"; for an order, a tribe or a company, its own name. */
export function houseShort(state, houseId) {
  const h = state?.houses?.[houseId];
  if (!h) return houseId ? titled(houseId) || 'a house' : 'a house';
  if (h.rank === 'crown') return 'royal';
  if (isHouse(h)) return partsOf(h).base || 'a house';
  return houseLabel(state, houseId).replace(/^the\s+/i, '');
}

/**
 * A person as a herald would name them: the name as it is; a quoted byname is dropped from the middle of it and the
 * lord of a house is "Lord Umber" (the Greatjon), his heir "Smalljon Umber". A stranger is "someone".
 */
export function who(state, charId) {
  const c = charId && typeof charId === 'object' ? charId : state?.characters?.[charId];
  const name = String(c?.name || '').trim();
  if (!name) return 'someone';
  // a byname sits between quotes, "double" or 'single' (an apostrophe inside a word, O'Neil, is no quote)
  const m = name.match(/(?:^|\s)(?:["“]([^"”]+)["”]|['‘]([^'’]+)['’])(?=\s|$)/);
  if (!m) return name;
  const byname = m[1] || m[2]; const first = name.slice(0, m.index).trim(); const last = name.slice(m.index + m[0].length).trim();
  const surname = last || first;
  if (state?.houses?.[c.house]?.lord === c.id) return `${c.sex === 'f' ? 'Lady' : 'Lord'} ${surname}`;
  return `${byname.trim()} ${surname}`.trim();
}

// the names the engine gives a host when the story gives none: "The Banners of Stark", "Host of House Umber", "Host of Stark"
const GENERIC_HOST = /^(?:the\s+)?(banners|host|army|levies|muster)\s+of\s+(.+)$/i;
const houseNamed = (state, tail, owner) => {
  const t = noThe(tail).replace(/^house\s+/i, '').toLowerCase();
  const all = Object.values(state?.houses || {});
  const whole = all.find((h) => noThe(h.name).replace(/^house\s+/i, '').toLowerCase() === t);
  if (whole) return whole;
  const o = state?.houses?.[owner];
  if (o && partsOf(o).base.toLowerCase() === t) return o;
  return all.find((h) => isHouse(h) && !partsOf(h).place && partsOf(h).base.toLowerCase() === t) || null;
};
/** "the Stark host" — a host is known by its house; a branch that shares its name by its seat ("the Dragonstone host"). */
function hostOf(state, h) {
  if (!h) return 'the host';
  if (h.rank === 'crown') return 'the royal host';
  // a free city's host is "the Braavos host"; an order, a tribe or a company is a body of men already: its own name
  if (h.rank === 'city_state') return `the ${noThe(h.name)} host`;
  if (!isHouse(h)) return houseLabel(state, h.id);
  const { base, place } = partsOf(h);
  // two Baratheon hosts are at war with each other: the one from Dragonstone is not the one from Storm's End
  const shared = place && Object.values(state?.houses || {}).some((o) => o.id !== h.id && partsOf(o).base === base);
  return `the ${(shared ? place : base) || 'great'} host`;
}

/** A party as it is told in a sentence: "the Stark host", "the Iron fleet"; a party with a name of its own keeps it. */
export function partyLabel(state, party) {
  // "the Stark Host" is a name the data may give; a sentence says "the Stark host", "the Iron fleet"
  return partyName(state, party).replace(/\b(Host|Fleet)\b/g, (w) => w.toLowerCase());
}
function partyName(state, party) {
  if (!party || typeof party !== 'object') return 'a host';
  const name = String(party.name || '').trim();
  const owner = state?.houses?.[party.owner];
  if (party.kind === 'fleet') {
    if (/fleet/i.test(name)) { const base = noThe(name).replace(/\s*fleet\s*$/i, '').trim(); if (base) return `the ${base} fleet`; }
    if (!name) return owner ? `the ${houseShort(state, party.owner)} fleet` : 'the fleet';
    // a ship with a name of her own ("The Silence") keeps it — falls through to the named-party rule below
  }
  const g = name.match(GENERIC_HOST);
  if (g) {
    const h = houseNamed(state, g[2], party.owner);
    if (h) return hostOf(state, h);
    return `the ${g[1].toLowerCase()} of ${g[2].trim()}`; // a host of a place or a man: "the host of Mance Rayder"
  }
  if (!name) return owner ? hostOf(state, owner) : 'a host';
  // a name of its own: "The City Watch" is "the City Watch"; "Robb's Northmen" needs no article
  if (/^the\s+/i.test(name)) return `the ${noThe(name)}`;
  if (/^[A-Z][\w-]*['’]s?\s/.test(name)) return name;
  // "Benjen Stark's company", and a lone rider's party is named for the rider ("Jon Snow"): a person's name takes no article
  if (/^(?:[A-Z][\w'’-]*\s+)+[A-Z][\w-]*['’]s\b/.test(name) || Object.values(state?.characters || {}).some((c) => c.name === name)) return name;
  return `the ${name}`;
}

// ── numbers in words ─────────────────────────────────────────────────────────────────────────────────────────────────
const WORDS = ['none', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen'];
const TENS = ['', '', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety'];
/** A whole number of 1..999 in words ("twelve", "forty", "a hundred", "a hundred and thirty"). */
function say(k) {
  if (k < 20) return WORDS[k];
  if (k < 100) return TENS[Math.floor(k / 10)] + (k % 10 ? `-${WORDS[k % 10]}` : '');
  const h = Math.floor(k / 100), rest = k % 100;
  return `${h === 1 ? 'a' : WORDS[h]} hundred${rest ? ` and ${say(rest)}` : ''}`;
}
const round = (q, num) => `${/^a /.test(num) && q === 'some' ? 'about' : q} ${num}`; // "some a hundred" is no English

/**
 * A number in words, roughly: under twenty exactly; then tens, hundreds, thousands and ten thousands, with a word for
 * which side of the round figure it lies on ("nearly two thousand" for 1,796; "some three thousand" for 3,300). Zero is
 * "none"; what is not a number (or is negative) is "" so the caller can leave the clause out. Never a digit.
 */
export function roughly(n) {
  if (typeof n !== 'number' || !Number.isFinite(n) || n < 0) return '';
  const x = Math.round(n);
  if (x < 20) return WORDS[x];
  if (x < 100) { const r = Math.round(x / 10); return r >= 10 ? 'nearly a hundred' : `some ${say(r * 10)}`; }
  if (x < 1000) { const r = Math.round(x / 100); return r >= 10 ? 'nearly a thousand' : round('some', say(r * 100)); }
  if (x < 20000) {
    const r = Math.round(x / 1000); const d = x - r * 1000;
    const q = d < 0 ? 'nearly' : d < 100 || r === 1 ? 'about' : 'some'; // "some a thousand" is no English either
    return `${q} ${r === 1 ? 'a thousand' : `${say(r)} thousand`}`;
  }
  if (x < 1e6) { const k = Math.round(x / 10000) * 10; return k >= 1000 ? 'nearly a million' : round('some', `${say(k)} thousand`); }
  const m = Math.round(x / 1e6);
  return m <= 1 ? 'about a million' : m < 20 ? `some ${say(m)} million` : 'many millions';
}

/** Names in a line: "Umber", "Umber and Manderly", "Umber, Manderly and Karstark"; five or more are a count, two named. */
export function list(names) {
  const n = (Array.isArray(names) ? names : []).filter((x) => typeof x === 'string' && x.trim()).map((x) => x.trim());
  if (n.length <= 1) return n[0] || '';
  if (n.length <= 4) return `${n.slice(0, -1).join(', ')} and ${n.at(-1)}`;
  const head = `${roughly(n.length)} in all`;
  const two = `${n[0]} and ${n[1]}`;
  return `${head}, ${two} among them`.length <= 60 ? `${head}, ${two} among them` : `${head}, ${n[0]} among them`;
}
