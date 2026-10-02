import { pronouns } from './people.js';
import { random } from '../engine/rng.js';
import { partyOf, forces, together, placeOf as placeAt } from '../engine/parties.js';
import { fact } from '../engine/facts/log.js';
// ═══════════════════════════════════════════════════════════════════════════════════════════════
// THE TOLL A WAR TAKES ON A MIND
//
// In the books nobody is a counter that moves across a board. Men crack. Robert drinks because he
// won a throne he did not want; Tywin's cruelty is a lifetime of being laughed at once; Lysa is
// terrified into madness; Theon is unmade. A world that tracks gold and swords and not this one
// thing is missing the part the story is actually about.
//
// So every named person carries two hidden numbers — STRESS (what is being done to them) and
// PARANOIA (what they have come to believe about everyone else) — and neither is ever shown to
// the player as a number. They are shown as behaviour: a lord who will not sleep, who drinks, who
// sees treason in a courtesy, who lashes out, who falls ill, who breaks.
//
// The engine owns the numbers. The story is told what they LOOK like, never what they are, and it
// may not narrate a man calm when he is coming apart.
// ═══════════════════════════════════════════════════════════════════════════════════════════════

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const rel = (state, a, b) => state.relations?.[a < b ? `${a}|${b}` : `${b}|${a}`]?.v ?? 0;

/** Who bends and who breaks: a person's own nature decides how much of the world reaches them. */
export function resilience(c) {
  const t = String(c.traits || '').toLowerCase();
  let r = 1;
  if (/stoic|dutiful|patient|calm|pious|hard|iron|disciplined/.test(t)) r -= 0.2;
  if (/brave|fearless|bold/.test(t)) r -= 0.1;
  if (/anxious|fearful|timid|nervous|frail|sickly|mad|unstable/.test(t)) r += 0.3;
  if (/proud|vain|wrathful|cruel|jealous|paranoid|suspicious/.test(t)) r += 0.15;
  if (/drunk|drinks|wine|dissolute/.test(t)) r += 0.15;
  if ((c.age ?? 30) < 16) r += 0.25; // children feel everything twice
  if ((c.age ?? 30) > 60) r += 0.1;
  const wits = c.skills?.[1]; // the shrewd see more to worry about
  if (typeof wits === 'number' && wits >= 14) r += 0.05;
  return clamp(r, 0.5, 1.8);
}

/** Whether a party is a campaign (a host in the field, a fleet at sea) and not a court on the road (the King's progress), a household's ride, a castle's garrison: the cold, the wet and the dying are the field's. The Night's Watch and the royal children were "on campaign" at a hundred. */
const campaigning = (p) => !!p && ['host', 'fleet', 'band'].includes(p.kind);
/** What one death is to one person: a wife, a child, a parent, any other of the house; null for a stranger. */
function griefOf(c, d) {
  if (d.id === c.spouse) return { v: 28, why: 'his wife dead' };
  if (d.father === c.id || d.mother === c.id) return { v: 34, why: 'a child buried' };
  if (c.father === d.id || c.mother === d.id) return { v: 16, why: 'a parent buried' };
  if (d.house === c.house) return { v: 5, why: 'another of his blood gone' };
  return null;
}
const GRIEVED_KEPT = 24; // the deaths a person remembers having mourned
/** The pressures on one person this period, each with the reason it is there. */
export function stressors(state, c, days, ix = null) { // `ix`: the tick's one reckoning of who holds what, who leads which host and who died lately (psycheTick), not asked of every person again
  const out = [];
  const add = (v, why) => { if (v) out.push({ v, why }); };
  const house = state.houses?.[c.house];
  const moons = days / 30;

  if (c.status === 'imprisoned') add(20 * moons, 'a captive');
  else if (c.status === 'hostage') add(7 * moons, 'a hostage in another man\'s hall');
  else if (c.status === 'missing') add(6 * moons, 'lost, and knows it');
  if (c.status === 'wounded') add(9 * moons, 'hurt, and healing badly');
  if (c.status === 'exiled') add(8 * moons, 'far from home, with no way back');

  // war: the men who command feel it worst, and the longer it runs the worse it gets
  const wars = (state.wars || []).filter((w) => w.status !== 'ended'
    && ((w.attackers || []).includes(c.house) || (w.defenders || []).includes(c.house)));
  if (wars.length) add((c.roles?.includes('lord') ? 7 : 4) * wars.length * moons, wars.length > 1 ? 'a war on two fronts' : 'the war');

  // in the field: campaigning is cold, wet, and full of other people's dying
  const withArmy = campaigning(partyOf(state, c)) ? partyOf(state, c) : null;
  const commands = ix ? ix.leads.get(c.id) : forces(state).find((a) => campaigning(a) && a.commander === c.id);
  const army = withArmy || commands;
  if (army) {
    add(5 * moons, 'on campaign');
    if ((army.morale ?? 70) < 40) add(6 * moons, 'a host that is coming apart beneath him');
    if ((army.supply ?? 80) < 35) add(5 * moons, 'no food in the baggage train');
  }

  // the seat under siege, the granaries empty, the smallfolk restive
  const seat = house?.seat && state.holdings?.[house.seat];
  if (seat && /besieg/i.test(seat.status || '')) add(12 * moons, 'his own walls invested');
  if (house?.figures?.food?.v != null && house.figures.food.v < 2) add(6 * moons, 'the granaries near empty');
  const mine = ix ? ix.held.get(c.house) || [] : Object.values(state.holdings || {}).filter((h) => h.owner === c.house);
  const unrest = mine.length ? mine.reduce((a, h) => a + h.unrest, 0) / mine.length : 0;
  if (unrest > 55) add(4 * moons, 'his own smallfolk muttering');
  if ((house?.figures?.debt?.v || 0) > (house?.figures?.treasury?.v || 0) * 2 && (house?.figures?.debt?.v || 0) > 2000) add(4 * moons, 'debts he cannot pay');

  // blood: the dead of one's own house are not a statistic
  const turn = state.meta?.turn ?? 0;
  const recent = ix ? ix.recent : Object.values(state.characters || {}).filter((d) => !d.alive && d.diedTurn != null && turn - d.diedTurn <= 2);
  for (const d of recent) {
    if (c.grieved?.includes(d.id)) continue; // a death is a blow once: it was struck every week of its three moons, and a house after a battle was at a hundred
    const g = griefOf(c, d); if (g) add(g.v, g.why);
  }

  // a regency, a minority, a claim contested: the seat itself is heavy
  if (house?.lord === c.id) {
    add(2 * moons, 'the weight of the seat');
    if (state.regency?.[c.house]) add(6 * moons, 'ruling in another\'s name');
  }
  return out;
}

/** What eases a mind: home, family, a full granary, a feast, and nothing happening for a while. */
function reliefs(state, c, days, ix = null) {
  const moons = days / 30;
  // A man in a cell, a hostage in another hall, an exile or a host in the field gets none of the
  // things that mend a mind: his own bed, his wife, his children, his own gods.
  if (['imprisoned', 'hostage', 'missing', 'exiled'].includes(c.status)) return 0.5 * moons;
  if (campaigning(partyOf(state, c))) return 1 * moons;
  let r = 3 * moons; // time itself, if nothing else happens
  const house = state.houses?.[c.house];
  const atHome = house?.seat && placeAt(state, c) === house.seat;
  if (atHome && !/besieg/i.test(state.holdings?.[house.seat]?.status || '')) r += 4 * moons;
  const spouse = c.spouse && state.characters?.[c.spouse];
  if (spouse?.alive && together(state, spouse, c)) r += 2.5 * moons;
  const kids = (ix ? ix.kids.get(c.id) || [] : Object.values(state.characters || {}).filter((x) => x.alive && (x.father === c.id || x.mother === c.id))).filter((x) => together(state, x, c));
  if (kids.length) r += Math.min(3, kids.length) * moons;
  if (/pious|septon|faith/.test(String(c.traits || '').toLowerCase())) r += 1.5 * moons;
  return r;
}

/**
 * One period of living. Returns the events worth telling — and only the ones the player's own
 * people would notice, because a lord does not know that a Dornish castellan is not sleeping.
 */
/**
 * How a man who is worn past bearing is found, by where he is (ST13: it was always "on the floor of the solar at dawn", a prisoner who commands an army three
 * times): a prisoner in his cell, a lord with a host in his tent, a man at sea in his cabin, one on the road at the roadside, the rest in their solar; and the
 * household that speaks of it is the maester's when the house has one.
 */
export function collapseText(state, c) {
  const P = pronouns(c); const held = /imprisoned|captive|hostage/.test(c.status || ''); const party = partyOf(state, c);
  const where = held ? `on the stones of ${P.his} cell` : party?.kind === 'fleet' ? `on the planks of ${P.his} cabin` : party && ['host', 'garrison', 'progress'].includes(party.kind) && party.at == null ? `on the ground of ${P.his} tent` : party && party.at == null ? `by the side of the road` : `on the floor of the solar`;
  const when = held ? 'at first light' : party && party.at == null ? 'at dawn, when the column was to move' : 'at dawn';
  const maester = Object.values(state.characters || {}).some((x) => x.alive && x.house === c.house && (x.roles || []).includes('maester')) && !held && !party;
  return `${c.name} was found ${where} ${when}, grey-faced and shaking, and could not be roused for an hour. ${maester ? 'The maester speaks of the strain, and of rest that will not be taken' : 'Those about speak of the strain, and of rest that will not be taken'}.`;
}

export function psycheTick(state, days) {
  const events = []; const applied = [];
  const player = state.meta?.player;
  // one reckoning for the whole tick of what each person's pressures ask of the world (it was asked of every person: a thousand people, a thousand scans)
  const ix = { held: new Map(), leads: new Map(), recent: [], kids: new Map() }; const turnNow = state.meta?.turn ?? 0;
  for (const h of Object.values(state.holdings || {})) { const l = ix.held.get(h.owner); if (l) l.push(h); else ix.held.set(h.owner, [h]); }
  for (const a of forces(state)) if (campaigning(a) && a.commander && !ix.leads.has(a.commander)) ix.leads.set(a.commander, a);
  for (const d of Object.values(state.characters || {})) {
    if (!d.alive && d.diedTurn != null && turnNow - d.diedTurn <= 2) ix.recent.push(d);
    if (d.alive) for (const p of [d.father, d.mother]) if (p) { const l = ix.kids.get(p); if (l) l.push(d); else ix.kids.set(p, [d]); }
  }
  for (const c of Object.values(state.characters || {})) {
    if (!c.alive) continue;
    const before = c.stress ?? 0;
    const beforeP = c.paranoia ?? 0;
    const load = stressors(state, c, days, ix).reduce((a, x) => a + x.v, 0) * resilience(c);
    const ease = reliefs(state, c, days, ix);
    const stress = clamp(before + load - ease, 0, 100);
    for (const d of ix.recent) if (!c.grieved?.includes(d.id) && griefOf(c, d)) c.grieved = [...(c.grieved || []), d.id].slice(-GRIEVED_KEPT);

    // Paranoia is slower than stress, and it never quite goes away. It is fed by being lied to,
    // by plots against one's house, and by long stress with no relief.
    const plotted = (state.plots?.against?.[c.house] || 0) + (c.betrayed ? 8 : 0);
    let paranoia = clamp(beforeP + (stress > 60 ? (stress - 60) / 14 : -0.35) * (days / 30) + plotted * 0.25, 0, 100);
    if (/paranoid|suspicious|jealous/.test(String(c.traits || '').toLowerCase())) paranoia = clamp(paranoia + 0.6 * (days / 30), 0, 100);

    c.stress = Math.round(stress * 10) / 10;
    c.paranoia = Math.round(paranoia * 10) / 10;

    // ── What it does to the world ──────────────────────────────────────────────────────────
    // Never a number in front of the player: a man who is breaking is seen breaking.
    const band = stressBand(c);
    const wasBand = bandOf(before);
    // told when a man gets worse, and not again at the same pitch for a while: a lord who hovers about a line is not a new story each week
    if (bandNews(c, band, wasBand, turnNow) && strainShown(state, c, band)) {
      const line = BAND_TEXT[band]?.(c);
      if (line) {
        c.toldBand = { band, turn: turnNow };
        events.push(fact(state, 'behaviour', {
          title: `${c.name} is not ${pronouns(c).himself}`,
          text: line, where: placeOf(state, c), importance: c.house === player ? 3 : 2, type: 'court', houses: [c.house], mind: true,
        }, { actors: [c.id], data: { band }, vis: { scope: 'local' } }));
      }
    }
    // a mind under siege makes worse decisions, trusts less, and drives its own people away
    if (c.paranoia > 55) {
      const liege = state.houses?.[c.house]?.liege;
      if (liege && random() < 0.25 * (days / 30)) {
        c.loyalty = clamp((c.loyalty ?? 50) - 2, -100, 100);
        applied.push({ op: 'psyche', text: `${c.name} trusts ${state.houses[liege].name} a little less than ${pronouns(c).he} did` });
      }
    }
    if (c.stress > 85 && random() < 0.12 * (days / 30)) {
      // the body keeps the account: a collapse, a fever, a fit, a night of wine that does not end
      c.status = c.status === 'free' ? 'wounded' : c.status;
      events.push(fact(state, 'illness', {
        title: `${c.name} collapses`,
        text: collapseText(state, c),
        where: placeOf(state, c), importance: c.house === player ? 4 : 2, type: 'court', houses: [c.house], mind: true,
      }, { actors: [c.id], data: { why: 'strain' } }));
      c.stress = clamp(c.stress - 25, 0, 100);
      applied.push({ op: 'psyche', text: `${c.name} is worn past bearing` });
    }
  }
  return { events, applied };
}

const BAND_RANK = { steady: 0, weary: 1, strained: 2, fraying: 3, breaking: 4 };
const TOLD_AGAIN_TURNS = 12; // turns (about a year) before a man's strain at the same pitch is told again: a lord who stays at the breaking point is not news each season
/** Whether the player is told of a man's strain: always of his own house and his own lord; of others who are known to him only once it is past weariness (a lord glimpsed at court who sleeps badly is not news: it was fifty cards in fourteen moons). */
export function strainShown(state, c, band) {
  const player = state.meta?.player;
  if (c.house === player || c.id === state.houses?.[player]?.lord) return true;
  return BAND_RANK[band] >= BAND_RANK.strained && isKnownTo(state, c, player);
}
/** Is a change of band news: a man getting worse, and not at a pitch already told within the last few turns. */
export function bandNews(c, band, wasBand, turn) {
  const told = c.toldBand;
  return BAND_RANK[band] > BAND_RANK[wasBand] && (!told || BAND_RANK[band] > BAND_RANK[told.band] || turn - told.turn >= TOLD_AGAIN_TURNS);
}
const bandOf = (v) => (v >= 85 ? 'breaking' : v >= 65 ? 'fraying' : v >= 40 ? 'strained' : v >= 20 ? 'weary' : 'steady');
export const stressBand = (c) => bandOf(c.stress ?? 0);

const BAND_TEXT = {
  weary: (c) => `${c.name} has the look of a ${pronouns(c).man} who has not slept well in some time.`,
  strained: (c) => `${c.name} is short with the servants, and twice this moon has left the table before the meal was done.`,
  fraying: (c) => `${c.name} snaps at those who bring ${pronouns(c).him} news, and the household has learned not to bring it at all.`,
  breaking: (c) => `${c.name} is spoken of in low voices: the shaking hands, the wine at breakfast, the long silences in the middle of a sentence.`,
};

function placeOf(state, c) {
  if (partyOf(state, c)) return null;
  return state.holdings?.[c.loc] ? c.loc : state.houses?.[c.house]?.seat || null;
}
function isKnownTo(state, c, player) {
  if (!player) return false;
  if (c.house === player) return true;
  const h = state.houses?.[c.house];
  if (!h) return false;
  return h.liege === player || state.houses?.[player]?.liege === c.house || Math.abs(rel(state, c.house, player)) > 40;
}

/**
 * How a person is to be written this turn — for the prompts. Never numbers: the model is told
 * what a man looks like from outside, and is bound to write him that way.
 */
export function mindLine(c) {
  const b = stressBand(c);
  const p = (c.paranoia ?? 0);
  const bits = [];
  if (b === 'weary') bits.push('tired, and shows it');
  if (b === 'strained') bits.push('under strain: curt, distracted, sleeping badly');
  if (b === 'fraying') bits.push(`fraying: quick to anger, slow to hear counsel, drinking more than ${pronouns(c).he} did`);
  if (b === 'breaking') bits.push('close to breaking: shaking hands, black moods, decisions made and unmade in a day');
  if (p >= 70) bits.push('trusts almost no one, and reads treason into courtesies');
  else if (p >= 45) bits.push(`has grown suspicious, and keeps ${pronouns(c).his} own counsel`);
  return bits.join('; ');
}

/** A digest of the player's own household, for the turn prompt. */
export function mindsDigest(state, houseId) {
  const out = [];
  for (const c of Object.values(state.characters || {})) {
    if (!c.alive || c.house !== houseId) continue;
    const l = mindLine(c);
    if (l) out.push(`- ${c.name} (${c.id}): ${l}`);
  }
  return out.length ? `HOW THE PEOPLE OF THIS HOUSE ARE BEARING UP (write them this way; never give a number for it)\n${out.slice(0, 12).join('\n')}` : '';
}
