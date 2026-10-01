// The households of the houses (docs/gdd/13-content-data.md §2, §3; WP G2): every landed house of the realm has at least three people — its head, a spouse and an heir — and where the books name
// none beyond the head, a plausible pair is raised at the start of a new game (`generated: true`; never a canon person, never replacing one). No dice are drawn: a name and an age come from the
// house's own id, so the same game begins with the same families, on any machine (the world is deterministic: engine/rng.js is not asked).
import { deriveSkills } from '../../data/families.js';

const slug = (s) => String(s || '').toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/[’']/g, '').replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
const NAMES = {
  north: { m: ['Brandon', 'Rickard', 'Torrhen', 'Cregan', 'Edwyle', 'Harrion', 'Artos', 'Donnor', 'Wyllis', 'Jonnel', 'Medger', 'Rodwell', 'Beron', 'Alaric', 'Gawen', 'Larence', 'Hal', 'Lyle', 'Jory', 'Willam'], f: ['Wylla', 'Lyessa', 'Alys', 'Sarra', 'Jonelle', 'Berena', 'Donella', 'Jocelyn', 'Lyarra', 'Melantha', 'Sybelle', 'Barbrey', 'Brenna', 'Ysabel'] },
  riverlands: { m: ['Tristan', 'Lucas', 'Elmo', 'Jonos', 'Theomar', 'Clement', 'Hugo', 'Lymond', 'Tytos', 'Brynden', 'Walton', 'Hoster', 'Karyl', 'Marq', 'Raymund', 'Perwyn', 'Jason', 'Alyn'], f: ['Bethany', 'Jeyne', 'Roslin', 'Minisa', 'Walda', 'Lysa', 'Shella', 'Emphyria', 'Perra', 'Merianne', 'Olenna', 'Sarra'] },
  vale: { m: ['Eon', 'Andar', 'Jon', 'Symond', 'Gerold', 'Alester', 'Harlan', 'Robar', 'Morton', 'Elbert', 'Gilwood', 'Hubert', 'Lyonel', 'Denys', 'Edmund', 'Waynard'], f: ['Ysilla', 'Mya', 'Myranda', 'Jeyne', 'Anya', 'Rhea', 'Alys', 'Marissa', 'Elinor', 'Sansa'] },
  westerlands: { m: ['Lyman', 'Tybolt', 'Damon', 'Quenten', 'Lewys', 'Humfrey', 'Regenard', 'Antario', 'Melwyn', 'Stafford', 'Daven', 'Tion', 'Leo', 'Tygett', 'Walder', 'Lorent'], f: ['Cerenna', 'Myranda', 'Lanna', 'Joanna', 'Dorna', 'Genna', 'Ellyn', 'Marla', 'Sybell', 'Alys'] },
  crownlands: { m: ['Gyles', 'Denys', 'Bartimos', 'Guncer', 'Symon', 'Ardrian', 'Monford', 'Renfred', 'Duram', 'Gerold', 'Lucas', 'Ronnel', 'Bryen', 'Orlan'], f: ['Tanda', 'Falyse', 'Lollys', 'Jeyne', 'Elinor', 'Alys', 'Marya', 'Rhea', 'Selyse', 'Lyra'] },
  reach: { m: ['Leo', 'Tanton', 'Alekyne', 'Arthor', 'Humfrey', 'Titus', 'Orton', 'Lyonel', 'Ormund', 'Moryn', 'Garth', 'Dickon', 'Mathis', 'Bryan', 'Jon', 'Willas', 'Gunthor'], f: ['Leonette', 'Rhonda', 'Alerie', 'Merilyn', 'Olene', 'Janna', 'Taena', 'Desmera', 'Elyn', 'Willa'] },
  stormlands: { m: ['Ormund', 'Lester', 'Bryce', 'Arstan', 'Guyard', 'Harwood', 'Hubert', 'Dickon', 'Lomas', 'Ronnet', 'Raymond', 'Cortnay', 'Aurane', 'Gulian', 'Elyas', 'Rolland'], f: ['Sharna', 'Ellyn', 'Cassana', 'Argella', 'Lelia', 'Alyce', 'Marla', 'Rhea', 'Allyria', 'Delena'] },
  dorne: { m: ['Harmen', 'Deziel', 'Franklyn', 'Dagos', 'Myles', 'Edgar', 'Garibald', 'Andrey', 'Quentyn', 'Ormond', 'Perros', 'Alyn', 'Yorick', 'Daemon', 'Lewyn', 'Arron'], f: ['Larra', 'Nymella', 'Ynys', 'Mellario', 'Obella', 'Elia', 'Dorea', 'Sarella', 'Alyse', 'Tyene'] },
  iron_islands: { m: ['Dagon', 'Harren', 'Torwold', 'Gorold', 'Baelor', 'Sawane', 'Lucimore', 'Alyn', 'Hotho', 'Rodrik', 'Tristifer', 'Urragon', 'Qarl', 'Quenton', 'Erik', 'Rolfe'], f: ['Gysella', 'Alannys', 'Asha', 'Esgred', 'Sigrid', 'Halla', 'Hilda', 'Maron', 'Ryella', 'Wenna'] },
};
const TRAITS = ['ambitious', 'cautious', 'proud', 'honorable', 'greedy', 'pious', 'jovial', 'shrewd', 'loyal', 'brave', 'stubborn', 'generous', 'patient', 'just', 'diligent', 'quiet', 'warm', 'sharp'];
const SKIP_RANK = new Set(['crown', 'company', 'tribe', 'exile', 'order', 'city_state']);

const seeded = (text) => { let seed = 2166136261; for (const ch of text) seed = Math.imul(seed ^ ch.charCodeAt(0), 16777619) >>> 0; return () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296); };
const pick = (xs, r) => xs[Math.floor(r() * xs.length) % xs.length];

/**
 * Raise a spouse and an heir (and, if need be, a sibling) for every landed house with fewer than three people. `characters`: id → character, changed in place; `houses`: the world's houses;
 * `year`: the scenario's year. Returns the ids added.
 */
export function fillHouseholds(characters, houses, year) {
  const added = [];
  for (const h of Object.values(houses)) {
    if (SKIP_RANK.has(h.rank) || h.landless || !h.seat || !NAMES[h.region]) continue;
    const people = () => Object.values(characters).filter((c) => c.house === h.id && c.alive !== false);
    if (people().length >= 3) continue;
    const lord = characters[h.lord]; if (!lord || lord.alive === false) continue;
    const surname = h.name.replace(/ of .*$/, '');
    const r = seeded(`household:${h.id}`); const pool = NAMES[h.region];
    const make = (female, age, role, title, bio, extra = {}) => {
      let first = pick(female ? pool.f : pool.m, r); let id = slug(`${first}_${surname}`), n = 2;
      while (characters[id]) { first = pick(female ? pool.f : pool.m, r); id = slug(`${first}_${surname}${n > 3 ? `_${n}` : ''}`); n++; if (n > 40) id = `${id}_${n}`; }
      const traits = [pick(TRAITS, r), pick(TRAITS, r)].filter((t, i, a) => a.indexOf(t) === i).join(', ');
      const c = { id, name: `${first} ${surname}`, house: h.id, title, age, born: year - age, loc: h.seat, roles: [role], traits, bio, alive: true, status: 'free', opinion: 0, loyalty: 60, memories: [], generated: true, sex: female ? 'f' : 'm', skills: deriveSkills({ roles: [role], traits, age }), ...extra };
      characters[id] = c; added.push(id); return c;
    };
    const male = lord.sex !== 'f'; const seat = h.seat;
    // a spouse, for a lord of years enough (a lady of the house keeps no consort in the roster: the books give them rarely)
    let spouse = lord.spouse ? characters[lord.spouse] : null;
    if (!spouse && male && lord.age >= 24 && people().length < 3) {
      spouse = make(true, Math.max(18, lord.age + Math.floor(r() * 10) - 7), 'family', '', `Wife of ${lord.name}, head of House ${h.name}.`, { spouse: lord.id });
      lord.spouse = spouse.id;
    }
    // an heir: a child of the lord, or, of a young lord, a younger brother
    if (people().length < 3) {
      const child = lord.age >= 28; const age = child ? Math.max(1, Math.min(34, lord.age - 22 - Math.floor(r() * 9))) : Math.max(6, lord.age - 3 - Math.floor(r() * 6));
      const female = r() < 0.25;
      const heir = make(female, age, 'heir', `Heir to ${seat === h.id ? h.name : seat}`, child ? `${female ? 'Daughter' : 'Son'} and heir of ${lord.name}.` : `${lord.name}'s younger ${female ? 'sister' : 'brother'} and heir.`);
      if (child) { heir[lord.sex === 'f' ? 'mother' : 'father'] = lord.id; if (spouse) heir[spouse.sex === 'f' ? 'mother' : 'father'] = spouse.id; }
    }
    // and, where a lady or a young lord left it short, a sibling of the house
    while (people().length < 3) {
      const female = r() < 0.5; make(female, Math.max(5, lord.age - 2 - Math.floor(r() * 8)), 'family', '', `${female ? 'Sister' : 'Brother'} of ${lord.name}.`);
    }
  }
  return added;
}
