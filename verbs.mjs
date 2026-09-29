import fs from 'node:fs';
process.env.WC_PROVIDER='mock';
const { createInitialState } = await import('/home/user/wc-s1/public/js/shared/world.js');
const { scoreCard, hasVerb, entitiesIn } = await import('/home/user/wc-s1/server/ai/validate/headline.js');
const state = createInitialState('agot_298', 'stark', { seed: 298 });
const list = 'abandons accepts accuses adopts advances agrees allows announces appoints approves arms arrests arrives attacks avoids backs bans bars begins betrays blocks boards bribes brings builds burns buys calls captures carries changes charges chooses claims clears closes collects commands concedes confirms crosses crowns cuts declares defeats defends delays demands denies departs destroys dies disbands discovers dismisses drives drops elects enters escapes executes exiles expels faces fails falls fears fights finds flees follows forbids forgives founds frees fires gathers gives goes grants greets guards hangs hears helps hides hires holds hunts imprisons invades invites jails joins judges keeps kills kneels knights leads leaves lends lets lifts loses makes marches marries meets moves murders names offers opens orders outlaws pardons pays plans plots poisons pours prepares presses proclaims promises protests punishes pursues quits raids raises ransoms reaches receives recalls recruits refuses rejects releases relieves renounces repays rescues resigns retreats returns rewards rides rises routs rules sacks sails seeks seizes sells sends sentences settles shelters signs sinks sits slays speaks spares spies starts stops storms strikes submits succeeds summons surrenders swears takes tells threatens trades trains travels trusts turns unites visits waits wants warns watches weds welcomes wins withdraws writes yields'.split(' ');
const bad = [];
for (const w of list) { const h = `Robb Stark ${w} the Twins`; const ents = entitiesIn(state, h, {start:true}); if (!hasVerb(h, ents)) bad.push(w); }
console.log(list.length, 'checked; fail:', bad.join(' '));
const bases = list.map(w=>w.replace(/ies$/,'y').replace(/(ch|sh|ss|x|o)es$/,'$1').replace(/s$/,''));
const bad2=[]; for (const b of bases) { const h = `Robb Stark and Tywin Lannister ${b} at the Twins`; const ents = entitiesIn(state, h, {start:true}); if (!hasVerb(h, ents)) bad2.push(b); }
console.log('base forms fail:', bad2.join(' '));
