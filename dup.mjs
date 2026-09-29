process.argv[2] = 'lib';
const { run } = await import('./probe.mjs');
run('summaries a writer will produce', [
  ['g-slain-01', 'Robb Stark slain by Tywin Lannister at the Twins', 'Robb Stark was killed by Tywin Lannister during the fighting at the Twins. The North is leaderless.', 'good'],
  ['g-slain-01', 'Robb Stark slain by Tywin Lannister at the Twins', 'Robb Stark fell at the Twins, cut down by Tywin Lannister\'s guard.', 'good'],
  ['g-refusal-01', 'Lady Hornwood refuses Stark\'s summons', 'Lady Hornwood will not send her men to Stark. She says the harvest is not yet in.', 'good'],
  ['g-siege-01', 'Jaime Lannister besieges Riverrun', 'Jaime Lannister has laid siege to Riverrun with some fifteen thousand men. The Tully garrison is shut inside.', 'good'],
  ['g-battle-01', 'Tywin Lannister beats Roose Bolton at the Twins', 'Tywin Lannister beat Roose Bolton at the Twins, and the northmen fled.', 'bad'],
  ['g-death-01', 'Rickard Karstark dies of old age at Karhold', 'Rickard Karstark, Lord of Karhold, has died of old age. His son Harrion now holds the seat.', 'good'],
  ['g-capture-01', 'Jaime Lannister captured by Robb Stark near Riverrun', 'Robb Stark took Jaime Lannister captive near Riverrun after a night attack.', 'good'],
]);
