// Sound follows the story (docs/gdd/14-audio.md §1, §2; WP H1). The lead cannot listen, so every rule here is a pure function the tests can read as "state X is mood Y" and "fact Z sounds cue C"; the owner
// judges the result by ear. No page, no audio context: music.js plays what `moodFor` says, sfx.js what `cueFor` says.

/** The moods the music can be in. A folder of the player's own music with that name plays for it; with none, the nearest fitting one does (music.js). */
export const MOODS = ['theme', 'court', 'north', 'reach', 'dorne', 'iron', 'war', 'tension', 'lament', 'silence'];
const REGION_MOOD = { north: 'north', wall: 'north', beyond: 'north', reach: 'reach', dorne: 'dorne', iron_islands: 'iron' };
/** How much of itself the music keeps while a matter is read: it fades to a fifth of its volume and the lord decides in quiet. */
export const QUIET_LEVEL = 0.2;
/** How long a jump may be waited for before the tension gives way to the planning mood again (seconds). */
export const TENSION_SECONDS = 20;

const atWar = (s, p) => (s.wars || []).some((w) => w.status !== 'ended' && ((w.attackers || []).includes(p) || (w.defenders || []).includes(p)));
const regionOf = (s, p) => s.holdings?.[s.houses?.[p]?.seat]?.region || s.houses?.[p]?.region || '';
/** A family death in a card (the player's own: a character of their house is in it, and it is a death). */
export function familyDeath(card, state) {
  if (!card || !['death', 'slain_in_battle', 'executed'].includes(card.kind)) return false;
  const p = state?.meta?.player;
  return (card.who || card.actors || []).some((id) => state.characters?.[id]?.house === p);
}

/**
 * The scene of the music, from what is on the screen. `ctx`: { screen: 'title' | 'game' | 'end', state, house (the highlighted house on the title), waiting (seconds waited for a jump's first
 * segment, or null), matterOpen, card (the card being told in playback), result ('victory' | 'defeat' on the end screen) }.
 * Returns { mood, region, cold, quiet }: `mood` the one to play, `region` the planning variant under it, `cold` winter's colder mix of it, `quiet` the fraction of its volume to keep (1 = all).
 */
export function moodFor(ctx = {}) {
  const { screen = 'game', state = null } = ctx;
  if (screen === 'title') return { mood: 'theme', region: ctx.house || null, cold: false, quiet: 1 };
  if (screen === 'end') return { mood: ctx.result === 'victory' ? 'theme' : 'lament', region: null, cold: false, quiet: 1 };
  const p = state?.meta?.player; const region = state ? regionOf(state, p) : '';
  const base = state && atWar(state, p) ? 'war' : REGION_MOOD[region] || 'court';
  const cold = state?.world?.season === 'winter';
  let mood = base;
  if (ctx.waiting != null && ctx.waiting <= TENSION_SECONDS) mood = 'tension';
  else if (ctx.card && familyDeath(ctx.card, state)) mood = 'lament';
  return { mood, region: base, cold, quiet: ctx.matterOpen ? QUIET_LEVEL : 1 };
}

// ── sound effects ──
/** The cues the effects bank has (sfx.js SOUNDS): every cue named below is one of these (tests/audio-map.test.js). */
export const CUES = ['click', 'open', 'close', 'bell', 'raven', 'horn', 'steel', 'coins', 'seal', 'error', 'lowhorn', 'horn2', 'drums', 'lute', 'wind', 'tick', 'toll', 'sting'];
/** What a cue does to the music while it sounds: it ducks it by this fraction (the cue's own length is in sfx.js). */
export const DUCK = 0.3;
/** At most one cue in this many milliseconds. */
export const CUE_GAP_MS = 400;

const player = (f, p) => (f.houses || []).includes(p) || (f.actors || []).some((id) => id === p);
/**
 * The cue a fact sounds in playback (as a list: a caw and a parchment, a horn and a clash), or []. `ctx`: { state, player (the house) }.
 * The facts the table names are the ones the GDD names; any other kind is silent.
 */
export const FACT_SOUND = {
  letter_arrived: (f, c) => (player(f, c.player) ? ['raven', 'open'] : []),
  battle: () => ['horn', 'steel'],
  holding_fell: () => ['lowhorn'],
  siege_begun: () => ['lowhorn'],
  storm_assault: () => ['lowhorn'],
  levies_called: () => ['horn2'],
  host_formed: () => ['horn2'],
  host_joined: (f) => ((f.data?.men || 0) >= 2000 ? ['drums'] : []),
  death: (f, c) => (great(f, c) ? ['toll'] : []),
  slain_in_battle: (f, c) => (great(f, c) ? ['toll'] : []),
  executed: (f, c) => (great(f, c) ? ['toll'] : []),
  wedding: () => ['lute'],
  feast: () => ['lute'],
  tourney: () => ['lute'],
  season_turned: (f) => (f.data?.season === 'winter' || /winter/i.test(String(f.title || f.text || '')) ? ['wind'] : []),
};
const great = (f, c) => (f.importance ?? 1) >= 4 || f.tier === 'great' || (f.actors || []).some((id) => c.state?.houses?.[c.state?.characters?.[id]?.house]?.lord === id && ['crown', 'paramount'].includes(c.state?.houses?.[c.state?.characters?.[id]?.house]?.rank));
export function cueFor(fact, ctx = {}) {
  const make = FACT_SOUND[fact?.kind]; if (!make) return [];
  return make(fact, { state: ctx.state, player: ctx.player ?? ctx.state?.meta?.player });
}
/** What a card sounds when it is told in playback: its fact's cue, else (for a card with no kind of a sound) the horn for a great thing of war and the page turning for the rest. */
export function cueForCard(card, ctx = {}) {
  const k = cueFor(card, ctx); if (k.length) return k;
  return (card?.importance ?? 1) >= 4 && card?.type === 'war' ? ['horn'] : ['open'];
}
/** The jump pressed: a distant bell. A matter opened: the wax seal. A receipt: a soft tick, or the muted error. A change of coin of more than a tenth: coins. */
export const UI_SOUND = { jump: ['bell'], matter: ['seal'], receiptOk: ['tick'], receiptNo: ['error'] };
export const coinCue = (before, after) => (Number.isFinite(before) && before > 0 && Math.abs(after - before) / before > 0.1 ? ['coins'] : []);

/** The rate limiter: `allow(nowMs)` is true at most once in CUE_GAP_MS (it remembers the time of the last cue it allowed). */
export function cueGate(gap = CUE_GAP_MS) { let last = -Infinity; return { allow(now) { if (now - last < gap) return false; last = now; return true; } }; }
