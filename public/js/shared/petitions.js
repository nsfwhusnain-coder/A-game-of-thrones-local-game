// Matters of the realm: small petitions and disputes that come before a ruling lord.
// Used when the simulator itself raised nothing for the player this turn.
import { vassalsOf, getRelation, generateKin } from './world.js';
import { isFemale } from './people.js';
import { answerCall, answerRising, answerRebel } from './vassals.js';

const pick = (a) => a[Math.floor(Math.random() * a.length)];

export function realmPetition(state) {
  const p = state.meta.player; const me = state.houses[p];
  const vas = vassalsOf(state, p).map((v) => state.houses[v]).filter((v) => v.lord && state.characters[v.lord]?.alive);
  const lordOf = (h) => state.characters[h.lord];
  const holdings = Object.values(state.holdings).filter((h) => h.owner === p);
  const templates = [];
  if (vas.length >= 2) {
    templates.push(() => {
      const [a, b] = [...vas].sort(() => Math.random() - 0.5);
      return {
        title: `A border quarrel: ${a.name} and ${b.name}`, from: a.lord,
        text: `${lordOf(a).name} and ${lordOf(b).name} both claim a mill, a ford and three villages on the land between their seats. Blood has been spilled over it. Both appeal to you for judgement.`,
        options: [
          { label: `Judge for House ${a.name}`, hint: `${a.name} grateful, ${b.name} aggrieved`, fx: [{ rel: [a.id, 12] }, { rel: [b.id, -15] }, { loyalty: [b.lord, -10] }, { rel2: [a.id, b.id, -10] }] },
          { label: `Judge for House ${b.name}`, hint: `${b.name} grateful, ${a.name} aggrieved`, fx: [{ rel: [b.id, 12] }, { rel: [a.id, -15] }, { loyalty: [a.lord, -10] }, { rel2: [a.id, b.id, -10] }] },
          { label: 'Divide the land between them', hint: 'Neither is happy, neither is shamed', fx: [{ rel: [a.id, -2] }, { rel: [b.id, -2] }, { rel2: [a.id, b.id, 5] }] },
          { label: 'Take the land into your own hands', hint: 'Profitable; both lords resent it', fx: [{ gold: 1200 }, { rel: [a.id, -12] }, { rel: [b.id, -12] }, { loyalty: [a.lord, -8] }, { loyalty: [b.lord, -8] }] }],
      };
    });
  }
  if (vas.length) {
    templates.push(() => {
      const v = pick(vas);
      return {
        title: `House ${v.name} begs forbearance`, from: v.lord,
        text: `${lordOf(v).name} writes that blight and bad weather have ruined half their harvest, and begs to be excused this year's dues.`,
        options: [
          { label: 'Forgive the dues this year', hint: 'Less coin; a grateful vassal', fx: [{ tribute: [v.id, 'forgiven'] }, { rel: [v.id, 15] }, { loyalty: [v.lord, 12] }] },
          { label: 'Halve the dues', hint: 'A middle course', fx: [{ tribute: [v.id, 'reduced'] }, { rel: [v.id, 5] }, { loyalty: [v.lord, 4] }] },
          { label: 'Demand full payment', hint: 'Coin now; resentment later', fx: [{ rel: [v.id, -10] }, { loyalty: [v.lord, -12] }] }],
      };
    });
    templates.push(() => {
      const v = pick(vas);
      const kids = Object.values(state.characters).filter((c) => c.alive && c.house === p && c.age >= 8 && c.age <= 20 && !c.spouse && !c.betrothed);
      if (!kids.length) return null;
      const kid = pick(kids);
      const partners = Object.values(state.characters).filter((c) => c.alive && c.house === v.id && !c.spouse && !c.betrothed && Math.abs(c.age - kid.age) <= 8 && c.age <= 25 && isFemale(c) !== isFemale(kid) && !(c.roles || []).some((r) => /watch|maester|septa|kingsguard/.test(r)));
      const partner = partners[0];
      const who = partner ? partner.name : `${isFemale(kid) ? 'a son' : 'a daughter'} of House ${v.name}`;
      const bond = partner ? { betroth: [kid.id, partner.id] } : { betrothNew: [kid.id, v.id, !isFemale(kid), Math.max(6, kid.age + (isFemale(kid) ? 2 : -2))] };
      return {
        title: `A match proposed by House ${v.name}`, from: v.lord,
        text: `${lordOf(v).name} proposes a betrothal between ${kid.name} and ${who}, "to bind our houses closer in these uncertain times".`,
        options: [
          { label: 'Accept the match', hint: `House ${v.name} bound closer; ${kid.name}'s hand is spent`, fx: [{ rel: [v.id, 20] }, { loyalty: [v.lord, 15] }, bond] },
          { label: 'Politely refuse', hint: 'Keeps the match free for a greater house', fx: [{ rel: [v.id, -6] }] },
          { label: 'Ask for a larger dowry', hint: 'Coin or men — and some offence', fx: [{ rel: [v.id, -4] }, { chance: [0.6, [{ gold: 1500 }, { rel: [v.id, 8] }, bond], [{ rel: [v.id, -10] }, { loyalty: [v.lord, -6] }]] }] }],
      };
    });
    templates.push(() => {
      const v = pick(vas);
      return {
        title: 'A knight accused', from: v.lord,
        text: `A sworn knight of House ${v.name} is accused by the smallfolk of burning a village and taking a miller's daughter. ${lordOf(v).name} asks that the matter be left to him; the villagers ask for the lord's justice.`,
        options: [
          { label: 'Try the knight yourself', hint: 'Justice seen to be done; the vassal feels slighted', fx: [{ unrestAll: -6 }, { rel: [v.id, -8] }, { loyalty: [v.lord, -5] }] },
          { label: `Leave it to House ${v.name}`, hint: 'Keeps the peace with your vassal; the smallfolk grumble', fx: [{ unrestAll: 5 }, { rel: [v.id, 6] }] },
          { label: 'Send him to the Night\'s Watch', hint: 'A quiet, merciful exile', fx: [{ unrestAll: -2 }, { rel: [v.id, -2] }, { rel: ['nights_watch', 3] }] }],
      };
    });
  }
  if (holdings.length) {
    templates.push(() => {
      const h = pick(holdings);
      return {
        title: `The smallfolk of ${h.name}`, from: null,
        text: `A delegation of smallfolk from the lands of ${h.name} kneels in your hall. The winter stores are thin, they say, and prices in the market have doubled. They beg grain from your granaries.`,
        options: [
          { label: 'Open the granaries to them', hint: 'Food stores down; unrest down, love up', fx: [{ food: -1.5 }, { unrest: [h.id, -15] }, { prosperity: [h.id, 3] }] },
          { label: 'Sell them grain at a fair price', hint: 'Some coin; some goodwill', fx: [{ food: -1 }, { gold: 400 }, { unrest: [h.id, -5] }] },
          { label: 'Send them away', hint: 'Stores kept; unrest rises', fx: [{ unrest: [h.id, 12] }, { prosperity: [h.id, -2] }] }],
      };
    });
    templates.push(() => {
      const h = pick(holdings);
      return {
        title: 'Outlaws on the roads', from: null,
        text: `Merchants complain of outlaws on the roads near ${h.name}: deserters and broken men who rob travellers and burn holdfasts.`,
        options: [
          { label: 'Send men to hunt them down', hint: 'Costs coin and men; trade recovers', fx: [{ gold: -600 }, { menAtArms: -40 }, { unrest: [h.id, -10] }, { prosperity: [h.id, 4] }] },
          { label: 'Offer them pardon if they take the black', hint: 'Cheap; the Night\'s Watch gains men', fx: [{ unrest: [h.id, -4] }, { rel: ['nights_watch', 5] }, { nwMen: 30 }] },
          { label: 'Let the local lords deal with it', hint: 'Free; the problem may grow', fx: [{ unrest: [h.id, 8] }, { prosperity: [h.id, -4] }] }],
      };
    });
  }
  const friends = Object.values(state.houses).filter((h) => h.id !== p && h.lord && state.characters[h.lord]?.alive && getRelation(state, p, h.id) > 20 && !vas.includes(h));
  if (friends.length && (Number(me.figures?.treasury?.v) || 0) >= 15000) {
    templates.push(() => {
      const f = pick(friends);
      return {
        title: `A request from House ${f.name}`, from: f.lord,
        text: `${state.characters[f.lord].name} asks for a loan of 5,000 dragons "between friends", to be repaid within the year.`,
        options: [
          { label: 'Lend the gold', hint: 'Friendship deepens; the coin may not return', fx: [{ gold: -5000 }, { rel: [f.id, 18] }, { debt: [f.id, 5000] }] },
          { label: 'Lend half', hint: 'A cautious friend', fx: [{ gold: -2500 }, { rel: [f.id, 6] }, { debt: [f.id, 2500] }] },
          { label: 'Refuse politely', hint: 'Keeps your gold; cools the friendship', fx: [{ rel: [f.id, -8] }] }],
      };
    });
  }
  for (let i = 0; i < 6 && templates.length; i++) { const t = pick(templates)(); if (t) return t; }
  return null;
}

// Settle the immediate, mechanical consequences of a petition choice. The simulator narrates the rest.
export function applyPetitionFx(state, fx, date = '') {
  const p = state.meta.player; const me = state.houses[p]; const out = [];
  const fig = (k) => me.figures[k] || (me.figures[k] = { v: 0 });
  const setFig = (k, v) => { me.figures[k] = { ...fig(k), v, asOf: date, src: 'Your steward', confidence: 'reported' }; };
  const rel = (a, b, d) => { if (!state.houses[a] || !state.houses[b]) return; const k = [a, b].sort().join('|'); const cur = state.relations[k]?.v ?? 0; state.relations[k] = { ...(state.relations[k] || {}), v: Math.max(-100, Math.min(100, cur + d)) }; out.push(`${state.houses[a].name}–${state.houses[b].name} ${d > 0 ? '+' : ''}${d}`); };
  const hold = (id, k, d) => { const h = state.holdings[id]; if (!h) return; h[k] = Math.max(0, Math.min(100, (h[k] || 0) + d)); out.push(`${h.name} ${k} ${d > 0 ? '+' : ''}${d}`); };
  for (const e of fx || []) {
    if (e.rel) rel(p, e.rel[0], e.rel[1]);
    if (e.rel2) rel(e.rel2[0], e.rel2[1], e.rel2[2]);
    if (e.gold) { setFig('treasury', Math.max(0, Math.round((Number(fig('treasury').v) || 0) + e.gold))); out.push(`treasury ${e.gold > 0 ? '+' : ''}${e.gold}`); }
    if (e.food) { setFig('food', Math.max(0, Math.round(((Number(fig('food').v) || 0) + e.food) * 10) / 10)); out.push(`food ${e.food > 0 ? '+' : ''}${e.food} moons`); }
    if (e.menAtArms) { setFig('menAtArms', Math.max(0, (Number(fig('menAtArms').v) || 0) + e.menAtArms)); out.push(`men-at-arms ${e.menAtArms}`); }
    if (e.nwMen && state.houses.nights_watch) { const f = state.houses.nights_watch.figures.menAtArms; if (f) f.v = (Number(f.v) || 0) + e.nwMen; out.push(`the Watch +${e.nwMen} men`); }
    if (e.unrest) hold(e.unrest[0], 'unrest', e.unrest[1]);
    if (e.prosperity) hold(e.prosperity[0], 'prosperity', e.prosperity[1]);
    if (e.unrestAll) { for (const h of Object.values(state.holdings)) if (h.owner === p) h.unrest = Math.max(0, Math.min(100, (h.unrest || 0) + e.unrestAll)); out.push(`unrest in your lands ${e.unrestAll > 0 ? '+' : ''}${e.unrestAll}`); }
    if (e.loyalty) { const c = state.characters[e.loyalty[0]]; if (c) { c.loyalty = Math.max(0, Math.min(100, (c.loyalty ?? 60) + e.loyalty[1])); out.push(`${c.name} loyalty ${e.loyalty[1] > 0 ? '+' : ''}${e.loyalty[1]}`); } }
    if (e.tribute) { const h = state.houses[e.tribute[0]]; if (h) { h.obligations = { ...(h.obligations || {}), tribute: e.tribute[1], tributeUntil: (state.meta.date.year * 12 + state.meta.date.month) + 12 }; out.push(`House ${h.name} tribute ${e.tribute[1]}`); } }
    if (e.betroth) { const [a, b] = e.betroth.map((x) => state.characters[x]); if (a && b && a.alive && b.alive && !a.betrothed && !b.betrothed) { a.betrothed = b.id; b.betrothed = a.id; out.push(`${a.name} betrothed to ${b.name}`); } }
    if (e.betrothNew) { const [kidId, hid, female, age] = e.betrothNew; const kid = state.characters[kidId]; if (kid?.alive && !kid.betrothed) { const c = generateKin(state, hid, { female, age }); if (c) { kid.betrothed = c.id; c.betrothed = kid.id; out.push(`${kid.name} betrothed to ${c.name}`); } } }
    if (e.call) out.push(...answerCall(state, e.call));
    if (e.rising) out.push(...answerRising(state, e.rising));
    if (e.rebel) out.push(...answerRebel(state, e.rebel));
    if (e.debt) { me.loans = [...(me.loans || []), { to: e.debt[0], amount: e.debt[1], turn: state.meta.turn }]; }
    if (e.chance) { const [pr, yes, no] = e.chance; out.push(...applyPetitionFx(state, Math.random() < pr ? yes : no, date)); }
  }
  return out;
}
