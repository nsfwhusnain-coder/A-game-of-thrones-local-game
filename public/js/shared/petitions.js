// Matters of the realm: small petitions and disputes that come before a ruling lord.
// Used when the simulator itself raised nothing for the player this turn.
import { vassalsOf, getRelation } from './world.js';

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
        options: [{ label: `Judge for House ${a.name}`, hint: `${a.name} grateful, ${b.name} aggrieved` }, { label: `Judge for House ${b.name}`, hint: `${b.name} grateful, ${a.name} aggrieved` }, { label: 'Divide the land between them', hint: 'Neither is happy, neither is shamed' }, { label: 'Take the land into your own hands', hint: 'Profitable; both lords resent it' }],
      };
    });
  }
  if (vas.length) {
    templates.push(() => {
      const v = pick(vas);
      return {
        title: `House ${v.name} begs forbearance`, from: v.lord,
        text: `${lordOf(v).name} writes that blight and bad weather have ruined half their harvest, and begs to be excused this year's dues.`,
        options: [{ label: 'Forgive the dues this year', hint: 'Less coin; a grateful vassal' }, { label: 'Halve the dues', hint: 'A middle course' }, { label: 'Demand full payment', hint: 'Coin now; resentment later' }],
      };
    });
    templates.push(() => {
      const v = pick(vas);
      const kids = Object.values(state.characters).filter((c) => c.alive && c.house === p && c.age >= 8 && c.age <= 20 && !c.spouse && !c.betrothed);
      if (!kids.length) return null;
      const kid = pick(kids);
      return {
        title: `A match proposed by House ${v.name}`, from: v.lord,
        text: `${lordOf(v).name} proposes a betrothal between ${kid.name} and a child of House ${v.name}, "to bind our houses closer in these uncertain times".`,
        options: [{ label: 'Accept the match', hint: `House ${v.name} bound closer; ${kid.name}'s hand is spent` }, { label: 'Politely refuse', hint: 'Keeps the match free for a greater house' }, { label: 'Ask for a larger dowry', hint: 'Coin or men — and some offence' }],
      };
    });
    templates.push(() => {
      const v = pick(vas);
      return {
        title: 'A knight accused', from: v.lord,
        text: `A sworn knight of House ${v.name} is accused by the smallfolk of burning a village and taking a miller's daughter. ${lordOf(v).name} asks that the matter be left to him; the villagers ask for the lord's justice.`,
        options: [{ label: 'Try the knight yourself', hint: 'Justice seen to be done; the vassal feels slighted' }, { label: `Leave it to House ${v.name}`, hint: 'Keeps the peace with your vassal; the smallfolk grumble' }, { label: 'Send him to the Night\'s Watch', hint: 'A quiet, merciful exile' }],
      };
    });
  }
  if (holdings.length) {
    templates.push(() => {
      const h = pick(holdings);
      return {
        title: `The smallfolk of ${h.name}`, from: null,
        text: `A delegation of smallfolk from the lands of ${h.name} kneels in your hall. The winter stores are thin, they say, and prices in the market have doubled. They beg grain from your granaries.`,
        options: [{ label: 'Open the granaries to them', hint: 'Food stores down; unrest down, love up' }, { label: 'Sell them grain at a fair price', hint: 'Some coin; some goodwill' }, { label: 'Send them away', hint: 'Stores kept; unrest rises' }],
      };
    });
    templates.push(() => ({
      title: 'Outlaws on the roads', from: null,
      text: `Merchants complain of outlaws on the roads near ${pick(holdings).name}: deserters and broken men who rob travellers and burn holdfasts.`,
      options: [{ label: 'Send men to hunt them down', hint: 'Costs coin and men; trade recovers' }, { label: 'Offer them pardon if they take the black', hint: 'Cheap; the Night\'s Watch gains men' }, { label: 'Let the local lords deal with it', hint: 'Free; the problem may grow' }],
    }));
  }
  const friends = Object.values(state.houses).filter((h) => h.id !== p && h.lord && state.characters[h.lord]?.alive && getRelation(state, p, h.id) > 20 && !vas.includes(h));
  if (friends.length && (Number(me.figures?.treasury?.v) || 0) >= 15000) {
    templates.push(() => {
      const f = pick(friends);
      return {
        title: `A request from House ${f.name}`, from: f.lord,
        text: `${state.characters[f.lord].name} asks for a loan of 5,000 dragons "between friends", to be repaid within the year.`,
        options: [{ label: 'Lend the gold', hint: 'Friendship deepens; the coin may not return' }, { label: 'Lend half', hint: 'A cautious friend' }, { label: 'Refuse politely', hint: 'Keeps your gold; cools the friendship' }],
      };
    });
  }
  for (let i = 0; i < 6 && templates.length; i++) { const t = pick(templates)(); if (t) return t; }
  return null;
}
