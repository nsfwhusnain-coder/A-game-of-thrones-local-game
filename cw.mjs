process.argv[2] = 'lib';
const { run } = await import('./probe.mjs');
run('common-word house names at the start of a headline', [
  ['g-omen-02', 'Hunters bring down a white stag near Karhold', null, 'good'],
  ['g-feast-02', 'Pipers play at Wyman Manderly\'s feast', null, 'good'],
  ['g-omen-02', 'Cranes fly south over Karhold', null, 'good'],
  ['g-omen-02', 'Fells stand white with snow above Karhold', null, 'good'],
  ['g-omen-02', 'Meadows turn white at Karhold', null, 'good'],
  ['g-omen-02', 'Reeds freeze at Karhold', null, 'good'],
  ['g-harvest-02', 'Rowans wither at Horn Hill', null, 'good'],
  ['g-omen-02', 'Locke stones weep at Karhold', null, 'good'],
  ['g-omen-02', 'Wolves howl at Karhold', null, 'good'],
  ['g-omen-02', 'Wylde winds blow at Karhold', null, 'good'],
]);
