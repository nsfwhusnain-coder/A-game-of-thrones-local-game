// ═══════════════════════════════════════════════════════════════════════════════════════════════
// THE CHOKEPOINTS OF WESTEROS
//
// Geography in this world is not decoration. Robb Stark won the North because Moat Cailin plugs
// the Neck; Tywin's host could not simply walk into the Vale; the Golden Tooth is why the
// westerlands are hard to invade and easy to leave. A simulation that lets a host walk from
// Winterfell to Riverrun in a straight line at a flat pace is not simulating Westeros.
//
// So the map carries a small matrix of hard places. Each is a LINE a march must cross, with a
// gate — the castle or pass that commands it — and a price for crossing anywhere else, or at all.
// The price is paid in days, in men, in morale, and sometimes in gold or in blood feud.
//
// This is engine truth, not story invention: the model is TOLD what a road costs (the Maester's
// charge quotes this matrix) and may not wave it away.
// ═══════════════════════════════════════════════════════════════════════════════════════════════

/**
 * pos are map units, the same space as holding positions (x ≈ 217..1708, y ≈ 446..2282;
 * north is small y). `line` is the barrier segment [[x1,y1],[x2,y2]]; a march that crosses it
 * pays. `gate` is the holding that commands the crossing, and `near` how close (map units) a
 * host must pass to be using the gate rather than the wilderness.
 */
export const CHOKEPOINTS = [
  {
    id: 'the_neck',
    name: 'The Neck',
    line: [[398, 1158], [540, 1168], [700, 1186]],
    gate: 'moat_cailin', near: 70,
    guides: ['reed'], // the crannogmen know the safe paths; with their leave, the bogs are merely wet
    holder: 'moat_cailin',
    days: 4, loss: 0.05, morale: 8,
    daysGated: 1, lossGated: 0.01, moraleGated: 2,
    blurb: 'A hundred leagues of bog, fever and black water. Only the causeway carries a host, and Moat Cailin sits on the causeway.',
    tollText: 'The bogs take their tithe: men lost to fever, to quicksand and to crannogman arrows out of the reeds.',
  },
  {
    id: 'green_fork',
    name: 'The crossing of the Green Fork',
    line: [[360, 1298], [500, 1322], [640, 1348]],
    gate: 'frey', near: 60,
    toll: { house: 'frey', perThousand: 40 }, // the Late Lord Frey does nothing for nothing
    days: 6, loss: 0.02, morale: 6,
    daysGated: 0, lossGated: 0, moraleGated: 0,
    blurb: 'The Green Fork runs deep and fast. The Twins hold the only bridge for a hundred leagues; everyone else fords, or swims, or waits.',
    tollText: 'Without the Twins a host must march upriver to the fords and back again, and the river takes a few who cannot swim in mail.',
  },
  {
    id: 'bloody_gate',
    name: 'The Bloody Gate',
    // the mountain wall of the Vale, from the shore of the Bite round to Gulltown's hills
    line: [[700, 1195], [702, 1300], [716, 1392], [747, 1482], [800, 1522], [900, 1520], [980, 1478]],
    gate: 'bloody_gate', near: 70,
    clans: true, // the Stone Crows, Black Ears, Burned Men and Milk Snakes take their own toll
    days: 5, loss: 0.06, morale: 10,
    daysGated: 1, lossGated: 0.015, moraleGated: 3,
    blurb: 'The high road to the Vale climbs through the Mountains of the Moon. The Bloody Gate lets no host by that the Arryns have not admitted, and the clans hold everything above the treeline.',
    tollText: 'Stone Crows and Burned Men come down in the night for the horses, the steel and the stragglers.',
  },
  {
    id: 'golden_tooth',
    name: 'The Golden Tooth',
    line: [[398, 1540], [412, 1680]],
    gate: 'lefford', near: 55,
    days: 4, loss: 0.04, morale: 7,
    daysGated: 1, lossGated: 0.01, moraleGated: 2,
    blurb: 'The pass into the westerlands is a narrow thing under Lefford\'s walls. An army that is not welcome climbs the hills instead, in single file.',
    tollText: 'The hill tracks are steep and the baggage train falls behind; wagons are abandoned and men with them.',
  },
  {
    id: 'princes_pass',
    name: 'The Prince\'s Pass and the Boneway',
    // the Red Mountains, from the Reach's marches to the sea east of the Boneway
    line: [[470, 2028], [700, 2040], [880, 2120], [1010, 2162]],
    gate: 'dondarrion', near: 120,
    desert: true,
    days: 6, loss: 0.07, morale: 9,
    daysGated: 2, lossGated: 0.02, moraleGated: 3,
    blurb: 'Two roads lead into Dorne through the Red Mountains, and both of them are ambushes with a view. Beyond them the sun does what the Dornish do not need to.',
    tollText: 'Thirst, sunstroke, and spears out of the rocks at dusk. Dorne has never been taken by an army in a hurry.',
  },
  {
    id: 'the_wall',
    name: 'The Wall',
    line: [[420, 600], [900, 600]],
    gate: 'nights_watch', near: 90,
    days: 3, loss: 0.02, morale: 5,
    daysGated: 1, lossGated: 0, moraleGated: 0,
    blurb: 'Seven hundred feet of ice, and three gates in three hundred leagues. The Watch opens them, or no one passes.',
    tollText: 'The cold beyond the Wall is a different kind of cold, and it counts its own toll.',
  },
];

const sub = (a, b) => [a[0] - b[0], a[1] - b[1]];
const cross = (a, b) => a[0] * b[1] - a[1] * b[0];
const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);

/** Do the segments p→p2 and q→q2 cross? (Plain orientation test; touching counts.) */
function segmentsCross(p, p2, q, q2) {
  const r = sub(p2, p), s = sub(q2, q);
  const d = cross(r, s);
  if (Math.abs(d) < 1e-9) return false; // parallel: a march along a barrier does not cross it
  const t = cross(sub(q, p), s) / d;
  const u = cross(sub(q, p), r) / d;
  return t >= 0 && t <= 1 && u >= 0 && u <= 1;
}

/** The point at which the march meets the barrier, for the map and for the event's "where". */
function meetingPoint(p, p2, q, q2) {
  const r = sub(p2, p), s = sub(q2, q);
  const d = cross(r, s); if (Math.abs(d) < 1e-9) return p;
  const t = cross(sub(q, p), s) / d;
  return [p[0] + r[0] * t, p[1] + r[1] * t];
}

/** Which hard places a straight march from `from` to `to` must cross. Barriers are polylines. */
export function crossings(from, to) {
  const out = [];
  for (const cp of CHOKEPOINTS) {
    for (let i = 0; i < cp.line.length - 1; i++) {
      const q = cp.line[i], q2 = cp.line[i + 1];
      if (!segmentsCross(from, to, q, q2)) continue;
      out.push({ cp, at: meetingPoint(from, to, q, q2) });
      break; // a barrier is paid once, however many of its segments the road grazes
    }
  }
  return out;
}

/** Is this crossing made at the gate that commands it, rather than through the wild? */
function atTheGate(state, cp, at) {
  const gate = cp.gate && state.holdings?.[cp.gate];
  return !!gate && dist(at, gate.pos) <= cp.near;
}

/**
 * Would the gate be shut in this host's face? Leave is settled elsewhere (hasLeave); this is the
 * middle case — no friendship, no enmity. A castle on a causeway does not open for strangers it
 * dislikes, and a host that cannot use the road must take the wild way round.
 */
function gateBars(state, army, cp) {
  const gate = cp.gate && state.holdings?.[cp.gate];
  const owner = gate?.owner; if (!owner || owner === army.owner) return false;
  if (/ruin|sack|abandon/i.test(gate.status || '')) return false; // no one holds a ruin
  const atWarNow = (state.wars || []).some((w) => w.status !== 'ended'
    && (((w.attackers || []).includes(army.owner) && (w.defenders || []).includes(owner))
      || ((w.defenders || []).includes(army.owner) && (w.attackers || []).includes(owner))));
  if (atWarNow) return true;
  const rel = state.relations?.[army.owner < owner ? `${army.owner}|${owner}` : `${owner}|${army.owner}`]?.v ?? 0;
  return rel < 0;
}

/** Does this host have the gate's leave — because it holds it, is sworn to whoever does, or is guided? */
export function hasLeave(state, army, cp) {
  const gate = cp.gate && state.holdings?.[cp.gate];
  const owner = gate?.owner;
  const mine = army.owner;
  if (owner && mine) {
    if (owner === mine) return 'own';
    const h = state.houses?.[mine]; const g = state.houses?.[owner];
    if (h && g) {
      if (h.liege === owner || g.liege === mine) return 'sworn';
      const atWar = (state.wars || []).some((w) => w.status !== 'ended'
        && ((w.attackers || []).includes(mine) && (w.defenders || []).includes(owner)
          || (w.defenders || []).includes(mine) && (w.attackers || []).includes(owner)));
      if (atWar) return null;
      const rel = state.relations?.[mine < owner ? `${mine}|${owner}` : `${owner}|${mine}`]?.v ?? 0;
      if (rel >= 20) return 'friendly';
      const ally = (state.pacts || []).some((p) => p.status === 'active' && ['alliance', 'non_aggression', 'truce', 'vassalage'].includes(p.type)
        && ((p.a === mine && p.b === owner) || (p.b === mine && p.a === owner)));
      if (ally) return 'allied';
    }
  }
  // the crannogmen will walk a friend through the Neck, and no one else
  if (cp.guides?.length) {
    for (const g of cp.guides) {
      if (g === mine) return 'guides';
      const rel = state.relations?.[g < mine ? `${g}|${mine}` : `${mine}|${g}`]?.v ?? 0;
      if (rel >= 30) return 'guides';
    }
  }
  return null;
}

const seasonBite = (state) => (state.world?.season === 'winter' ? 1.6 : state.world?.season === 'autumn' ? 1.15 : 1);

/**
 * March a host across whatever lies in its way. Called by the turn pipeline with the leg the host
 * actually covered this turn. Returns the price, and the events that tell it.
 *
 * Nothing here is random for its own sake: the same host, on the same road, in the same season,
 * pays the same. What varies is who holds the gate and who has made friends.
 */
export function chokepointToll(state, army, from, to, days) {
  const out = { days: 0, losses: 0, morale: 0, gold: 0, events: [], met: [] };
  if (!army || army.type === 'fleet' || !from || !to) return out;
  const bite = seasonBite(state);
  for (const { cp, at } of crossings(from, to)) {
    const leave = hasLeave(state, army, cp);
    // a host passes cheaply if it has leave, or if it crosses at the gate itself and no one bars it
    const gated = !!leave || (atTheGate(state, cp, at) && !cp.clans && !gateBars(state, army, cp));
    const d = (gated ? cp.daysGated : cp.days) * bite;
    const lossRate = (gated ? cp.lossGated : cp.loss) * bite;
    const mor = (gated ? cp.moraleGated : cp.morale) * bite;
    const lost = Math.round(army.men * lossRate * Math.min(1, Math.max(0.35, (d || 1) / Math.max(1, days))));
    out.days += d; out.losses += lost; out.morale += mor;
    out.met.push({ id: cp.id, name: cp.name, gated, leave, lost, days: Math.round(d * 10) / 10 });

    // the Freys take coin from anyone who wants the bridge, kin or not
    if (gated && cp.toll && state.houses?.[cp.toll.house] && army.owner !== cp.toll.house) {
      out.gold += Math.round((army.men / 1000) * cp.toll.perThousand);
    }
    if (lost || d >= 1) {
      out.events.push({
        title: gated ? `${army.name} passes ${cp.name}` : `${army.name} pays the price of ${cp.name}`,
        text: gated
          ? `${army.name} crosses at ${cp.gate && state.holdings?.[cp.gate] ? state.holdings[cp.gate].name : cp.name}${lost ? `, and is ${lost.toLocaleString('en-GB')} men lighter for it` : ' without trouble'}.`
          : `${cp.tollText} ${army.name} loses ${lost.toLocaleString('en-GB')} men and ${Math.round(d)} days.`,
        details: cp.blurb,
        where: cp.gate || null, at,
        importance: gated ? 2 : 3, type: 'war', houses: [army.owner],
      });
    }
  }
  return out;
}

/** Plain-words warning for the player and for the model, before a host sets out. */
export function roadWarnings(state, army, from, to) {
  return crossings(from, to).map(({ cp, at }) => {
    const leave = hasLeave(state, army, cp);
    const gate = cp.gate && state.holdings?.[cp.gate];
    const bythegate = atTheGate(state, cp, at) && !gateBars(state, army, cp);
    const toll = cp.toll && army.owner !== cp.toll.house ? ` House ${state.houses?.[cp.toll.house]?.name || cp.toll.house} will want ${Math.round((army.men / 1000) * cp.toll.perThousand).toLocaleString('en-GB')} dragons for the crossing.` : '';
    if (leave) return `${cp.name}: the road is open (${leave === 'own' ? 'the gate is theirs' : leave === 'guides' ? 'guides will take them through' : `${gate ? gate.name : 'the gate'} will let them by`}).${toll}`;
    if (bythegate && !cp.clans) return `${cp.name}: their road goes right past ${gate ? gate.name : 'the gate'}, which does not love them — it may be barred, and then the crossing costs ${Math.round(cp.days)} days and about ${Math.round(cp.loss * 100)} men in every hundred.${toll}`;
    return `${cp.name}: ${cp.blurb} With no leave from ${gate ? gate.name : 'whoever holds it'}, reckon ${Math.round(cp.days)} days lost and about ${Math.round(cp.loss * 100)} men in every hundred.`;
  });
}

/** The whole matrix as the Maester would recite it — used in the swarm's grounding prompt. */
export function chokepointDigest(state) {
  return CHOKEPOINTS.map((cp) => {
    const gate = cp.gate && state.holdings?.[cp.gate];
    return `- ${cp.name}${gate ? ` (held by House ${state.houses?.[gate.owner]?.name || gate.owner} at ${gate.name})` : ''}: ${cp.blurb}`;
  }).join('\n');
}
