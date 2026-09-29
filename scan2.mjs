import fs from 'node:fs';
for (const h of ['stark','lannister','greyjoy']) {
  const b = JSON.parse(fs.readFileSync(`out-${h}-new.json`)); const st = JSON.parse(fs.readFileSync(`out-${h}-new.state.json`));
  for (const f of b) {
    const d = f.data || {};
    if (f.kind === 'battle' && d.winner != null && !d.winnerHouse) console.log(h, 'battle no winnerHouse', f.id, 'att', d.attacker, 'def', d.defender, 'w', d.winner, 'houses', JSON.stringify(f.houses), 'text', f.text.slice(0, 90));
    if (f.kind === 'slain_in_battle' && d.by == null) console.log(h, 'slain no by', f.id, JSON.stringify(d), f.text.slice(0, 80), 'place', f.place);
    if (f.kind === 'executed' && d.by == null) console.log(h, 'executed no by', f.id, JSON.stringify(d), f.text.slice(0, 80));
    if (f.kind === 'death' && d.how == null) console.log(h, 'death no how', f.id, JSON.stringify(d).slice(0,100));
  }
}
