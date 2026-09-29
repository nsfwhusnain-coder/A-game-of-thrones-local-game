import fs from 'node:fs';
const T = {};
for (const h of ['stark','lannister','greyjoy']) {
  const b = JSON.parse(fs.readFileSync(`out-${h}-new.json`)); const st = JSON.parse(fs.readFileSync(`out-${h}-new.state.json`));
  for (const f of b) {
    const d = f.data || {};
    if (['slain_in_battle','captured_in_battle','executed','captured'].includes(f.kind)) {
      const by = d.by; const t = by == null ? 'null' : st.characters[by] ? 'char' : st.houses[by] ? 'house' : 'other:' + by;
      const key = `${f.kind}.by=${t}`; T[key] = (T[key] || 0) + 1;
    }
    if (f.kind === 'battle') { const k = `battle.how=${d.how}|w=${d.winnerHouse}|drawn=${d.winner==null}`; T['battle.how:' + (d.how ?? 'undef')] = (T['battle.how:' + (d.how ?? 'undef')] || 0) + 1; if (d.winner != null && !d.winnerHouse) console.log('NO winnerHouse', f.id); if (d.winner != null && d.winnerHouse === d.loserHouse) T['battle.sameHouseBothSides'] = (T['battle.sameHouseBothSides']||0)+1; }
    if (f.kind === 'death') { const k = `death.how=${d.how}|cause=${d.cause}`; T[k] = (T[k] || 0) + 1; }
    if (f.kind === 'call_refused') { const k = `refused.why=${d.why}`; T[k] = (T[k] || 0) + 1; }
    if (JSON.stringify(d).includes('NaN') || JSON.stringify(d).includes('undefined')) console.log('BAD', f.id, f.kind);
  }
}
console.log(T);
