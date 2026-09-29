process.argv[2] = 'lib';
const { scoreCard, by, state } = await import('./probe.mjs');
const g = by['g-slain-01'];
for (const c of [null, undefined, {}, { headline: 5 }, { headline: ['a'] }, { headline: 'Robb Stark slain', summary: null }, { headline: '\u0000\u0000' }, { headline: 'x'.repeat(100000) }, { headline: 'Robb Stark slain by Tywin Lannister', summary: 'a. '.repeat(20000) }, { headline: 'Robb Stark slain by Tywin Lannister', summary: ('Robb Stark '.repeat(5000)) + '.' }]) {
  const t = Date.now(); let r; try { r = scoreCard(c, g, state); } catch (e) { r = 'THROWS ' + e.message; }
  console.log(JSON.stringify(c)?.slice(0, 50), '→', typeof r === 'string' ? r : r.faults.join(','), Date.now() - t, 'ms');
}
for (const s of [null, undefined, { facts: null }, { facts: [{}] }, { facts: [{ kind: 'battle' }] }, { facts: [{ kind: 'slain_in_battle', actors: [null], data: null }], must: [null] }, { facts: [{ kind: 'battle', data: { winnerHouse: {} , winner: 5} , actors: 'x'}] }]) {
  let r; try { r = scoreCard({ headline: 'Robb Stark slain by Tywin Lannister' }, s, state); } catch (e) { r = 'THROWS ' + e.message; }
  console.log(JSON.stringify(s), '→', typeof r === 'string' ? r : r.faults.join(','));
}
// state without optional bits
try { console.log(scoreCard({ headline: 'Robb Stark slain by Tywin Lannister' }, g, { characters: state.characters, houses: state.houses, holdings: state.holdings }).faults); } catch (e) { console.log('THROWS on thin state', e.message); }
