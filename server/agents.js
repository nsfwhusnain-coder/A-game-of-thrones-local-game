// ═══════════════════════════════════════════════════════════════════════════════════════════════
// THE SWARM
//
// One prompt used to ask one model to be a strategist, a lore-keeper, an economist, a spymaster
// and a novelist all in the same breath. It did all five indifferently: attention drifts across a
// twenty-thousand-token instruction, and the prose comes out flat because the same pass has just
// finished counting bushels of grain.
//
// So the turn is shared out. Every agent reads the SAME world — the same system prompt, the same
// digest, the same memory — and differs only in the last block of the user message. That ordering
// is deliberate: a local model server keeps its KV cache for the shared prefix, so the second,
// third and fourth agent of a turn cost only their own decoding, not a re-read of the realm.
//
// They speak in order, each told what the ones before settled:
//   Maester    — what is true and what is impossible. Moves nothing.
//   Hand       — plays every house but the player's. Pure change operations, no prose.
//   Weaver     — gives the story's new inventions real numbers (inject_rule).
//   Whisperer  — secrets, letters, lies, and what the player is allowed to learn.
//   Bard       — told everything that happened, writes the chronicle. Sees no mechanics at all.
// ═══════════════════════════════════════════════════════════════════════════════════════════════

export const AGENT_ORDER = ['maester', 'hand', 'weaver', 'whisperer', 'bard'];

/** What the player is shown while each one thinks (diegetic: never "calling agent 3 of 5"). */
export const AGENT_LABELS = {
  maester: 'The maester consults his books',
  hand: 'The Hand moves the realm',
  weaver: 'The world grows a new thread',
  whisperer: 'A little bird is listening',
  bard: 'The chronicle is written',
};

/** Which ops each agent is allowed to emit. Anything else it writes is dropped before it is applied. */
export const AGENT_OPS = {
  maester: [],
  hand: ['army_create', 'raise_army', 'army_march', 'army_move', 'army_update', 'army_destroy', 'army_disband',
    'holding', 'holding_new', 'landmark', 'character', 'character_new', 'travel', 'ride', 'send_character',
    'relation', 'liege', 'house_update', 'war', 'war_join', 'pact', 'battle', 'obligation', 'project',
    'decision', 'season', 'wed', 'betroth', 'succession', 'figure'],
  weaver: ['inject_rule', 'rule', 'mechanic', 'project'],
  whisperer: ['raven', 'report', 'character', 'relation', 'pact', 'chronicle', 'decision'],
  bard: [],
};

const LEAN = ['hand', 'bard']; // for slow machines: the realm still moves and is still written well

export function agentsFor(mode) {
  if (mode === 'off') return [];
  if (mode === 'lean') return LEAN;
  return AGENT_ORDER;
}

// ── The charges ────────────────────────────────────────────────────────────────────────────────
// Written as plain prose with the shape of the reply at the end. Each one is short: a small model
// that has just read the state of the realm has little attention left for a second essay.

export function agentCharge(agent, span, brief) {
  const period = `these ${span.days} ${span.days === 1 ? 'day' : 'days'}`;
  const B = brief ? `

WHAT HAS ALREADY BEEN SETTLED FOR ${period.toUpperCase()} (true; build on it, never contradict it, never write it again)
${brief}` : '';
  const F = (o) => `Reply with ONE JSON object and nothing else:\n${o}`;

  switch (agent) {
    case 'maester':
      return `YOU ARE THE MAESTER OF THE CITADEL, and you are consulted before anyone acts.

You move no one and invent nothing. You read the state of the realm above and set down what is TRUE and what is IMPOSSIBLE in ${period}, so that those who act next do not blunder against the world. Be short, concrete, and specific to THIS position — distances in days, names and ids, not sentiment. Geography binds: the Neck swallows armies, the mountain passes belong to the clans, a fleet needs a port, the Bloody Gate lets no host by, and winter roads take twice as long.

${F(`{"facts":["up to 6 hard facts bearing on what happens next: who is where, who owes whom, what a host would meet on its road, what the season does to it"],
 "impossible":["up to 4 things that CANNOT happen in ${period}, and why — a host that cannot cover the distance, a man imprisoned or dead, a fleet with no harbour, a levy already called"],
 "chokepoints":["places on the likely roads that exact a price, and the price: the Neck without crannogman guides, the high passes, the Bite in winter, the Golden Tooth"],
 "opportunities":["up to 3 openings the great houses would see in this position"]}`)}${B}`;

    case 'hand':
      return `YOU ARE THE HAND OF THE KING, and you play every house in the realm except the player's.

You are cold, patient, and self-interested on each house's behalf. You write no prose — not one line of it; another hand writes the chronicle. You decide what HAPPENS in ${period} and say it only in change operations.

Move the realm: hosts march, lords ride, banners are called, tribute is withheld, pacts are struck and broken, castles change hands, wars begin and end. Each house acts in its own interest and in its own manner (see HOW THE GREAT HOUSES BEHAVE). At least two houses other than the player's must do something consequential, and their doings must follow from the position above, not from habit. Answer the player's orders and decisions truthfully: the world obliges, bargains, or resists.

${F(`{"plan":["one very short line for each house that acts: its id, what it does, why"],
 "changes":[ ...change operations, at most ${Math.max(6, Math.min(20, 4 + span.days))}... ]}`)}
Only ids that appear in the tables above. Never move the player's own people or hosts, never change their allegiance or their taxes.${B}`;

    case 'weaver':
      return `YOU ARE THE WEAVER, and your charge is the part of the world the engine does not yet know how to count.

When the story has raised something that ought to have weight — a smuggling ring, a network of informants, a cult's tithe, a toll on the river trade, a blight, a bounty on wolves, a debt to the Iron Bank, a custom a new lord imposes on his smallfolk — you give it a FORMULA with inject_rule, and from that moon on every steward in the realm reckons with it, for the rest of the game. It goes into the save. It is the only real power you have, and it is a great one.

Use it sparingly and exactly: at most TWO new customs in ${period}, and only where the story has truly earned one. Prefer none to a silly one. Also end the customs the story has ended, and revise the ones whose terms have changed.

${F(`{"reasoning":"one line: what the story has raised that has no number yet, or 'nothing this turn'",
 "changes":[ ...only inject_rule operations... ]}`)}
An empty changes array is a perfectly good answer. Do not invent a rule merely to have invented one.${B}`;

    case 'whisperer':
      return `YOU ARE THE MASTER OF WHISPERERS, and you deal in what is hidden.

Secrets, plots, sealed letters, poisons, coin passed in the dark, and lies told well. In ${period} you decide what moves beneath the surface — and, just as important, how much of it reaches the player, and how crooked it is by the time it does. A report may be stale, exaggerated, or a deliberate feint (set "false":true). Most of what you set in motion should stay unseen this turn; a secret is worth more later.

${F(`{"whispers":["up to 4 short lines: what is truly happening in secret, whether or not the player learns of it"],
 "changes":[ ...only these ops: raven, report, character (secret, revealSecret, opinion, loyalty, status), relation, pact, chronicle — at most 6... ]}`)}
A letter reaches the player only when its "to" is one of their own people.${B}`;

    case 'bard':
      return `YOU ARE THE CHRONICLER, and you write the way George R. R. Martin writes.

Everything that happens in ${period} has already been decided by others and is set down for you below. You decide nothing, you correct nothing, and you emit no change operations whatsoever. Your one charge is to make it live on the page.

HOW YOU WRITE
- Third person limited. Every event sits behind ONE person's eyes — a lord, a spearman, a serving girl, a raven-keeper — and we are told only what that person could see, hear and guess.
- The senses before the summary: cold wax under a thumb, the smell of horse and wet wool, a hound worrying a bone beneath the table while a man's life is decided above it.
- Let people talk, and let them talk past each other. Small human detail beside great matters. Dry, dark humour where it fits. Courtesy used as a weapon.
- No three-deep adjectives, no winds of change, no prophecy-speak, no modern idiom, no moral of the story.
- NEVER a number of dragons, never morale, unrest, prosperity, a rule, a turn, a day counter, an op, or anything else that betrays a game. A steward may swear the granaries will not see the winter out; he may not say "food 2.4".
- Names, always: Ser Wylis Manderly, not "a knight". The player's own house is written of in the third person, by name, like everyone else.

${F(`{"summary":"2-4 paragraphs on ${period} as the player's own people would come to know them",
 "events":[ {"day":DAY_OF_THE_PERIOD,"order":ORDER_NUMBER_IF_IT_ANSWERS_ONE,"title":"a herald's cry: short, plain, and about a person","text":"ONE sentence: what happened","details":"2-4 sentences behind one person's eyes: the scene, the talk, what it cost","where":PLACE_ID,"importance":1-5,"type":"war|diplomacy|economy|intrigue|court|disaster|rumor|religion|magic","houses":[HOUSE_IDS]} ],
 "threads":[ {"title":"3-6 words","status":"open|resolved","last":"its latest turn, one line"} ]}`)}
Write an event for the consequential things below and for nothing else. Do not write again what the engine has already set down — write around it: what led to it, what was said about it, what it set in motion.${B}`;

    default:
      return `Now simulate the ${span.label}. Reply with the JSON object only.`;
  }
}

// ── The brief ──────────────────────────────────────────────────────────────────────────────────
// What one agent hands the next. Deliberately plain English, never JSON: the Bard must never see a
// change operation, or it starts writing them into the prose.

export function briefFromMaester(obj) {
  if (!obj) return '';
  const L = (k, head) => (Array.isArray(obj[k]) && obj[k].length ? `${head}\n${obj[k].slice(0, 6).map((x) => '- ' + String(x).slice(0, 220)).join('\n')}` : '');
  return [
    L('facts', 'THE MAESTER SETS DOWN AS TRUE'),
    L('impossible', 'THE MAESTER SAYS THESE CANNOT HAPPEN NOW'),
    L('chokepoints', 'THE ROADS AND WHAT THEY COST'),
    L('opportunities', 'WHAT A CLEVER LORD WOULD SEE IN THIS POSITION'),
  ].filter(Boolean).join('\n\n');
}

/** What actually happened, in plain words, from the engine's own receipts. */
export function briefFromApplied(applied, head) {
  const lines = applied.map((a) => String(a.text || '').trim()).filter(Boolean);
  if (!lines.length) return '';
  const seen = new Set(); const out = [];
  for (const l of lines) { if (seen.has(l)) continue; seen.add(l); out.push('- ' + l.slice(0, 220)); if (out.length >= 24) break; }
  return `${head}\n${out.join('\n')}`;
}

/** A chronicle is witnessed scenes, not release notes. Quiet turns may remain quiet. */
export function chronicleNeedsRewrite(out = {}) {
  const events = Array.isArray(out.events) ? out.events.filter((e) => !e.bg && Number(e.importance ?? 2) >= 2) : [];
  if (!events.length) return false;
  const thin = events.filter((e) => `${e.text || ''} ${e.details || ''}`.trim().length < 150 || String(e.details || '').trim().length < 55);
  const mechanical = events.filter((e) => /\b(?:game|turn|tick|stat|buff|debuff|supply (?:meter|points?)|morale points?|mechanic)\b/i.test(`${e.text || ''} ${e.details || ''}`));
  return String(out.summary || '').trim().length < 100 || mechanical.length > 0 || thin.length > events.length / 2;
}

export function briefFromWhispers(obj) {
  const w = Array.isArray(obj?.whispers) ? obj.whispers : [];
  return w.length ? `WHAT MOVES BENEATH THE SURFACE (write around it — the player may not learn it plainly)\n${w.slice(0, 4).map((x) => '- ' + String(x).slice(0, 220)).join('\n')}` : '';
}

export function briefFromPlan(obj) {
  const p = Array.isArray(obj?.plan) ? obj.plan : [];
  return p.length ? `THE HAND'S INTENT THIS PERIOD\n${p.slice(0, 8).map((x) => '- ' + String(x).slice(0, 200)).join('\n')}` : '';
}

/** Keep only the ops an agent is permitted to emit; the rest are quietly dropped. */
export function filterOps(agent, changes) {
  const allowed = AGENT_OPS[agent];
  if (!Array.isArray(changes)) return [];
  if (!allowed || !allowed.length) return [];
  return changes.filter((c) => c && typeof c === 'object' && allowed.includes(String(c.op || '').toLowerCase()));
}
