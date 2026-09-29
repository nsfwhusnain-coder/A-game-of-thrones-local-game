process.argv[2] = 'lib';
const { run } = await import('./probe.mjs');
run('summary words', [
  ['g-death-02', 'Old Nan dies at Winterfell', 'She told three generations of Starks the old stories of the Long Night.', 'good'],
  ['g-death-02', 'Old Nan dies at Winterfell', 'In fact she had been failing since the autumn.', 'good'],
  ['g-muster-02', 'Lord Umber raises men at Last Hearth', 'Umber has called in the levies of his hill clans; some two thousand will march.', 'good'],
  ['g-refusal-01', 'Lady Hornwood refuses Stark\'s summons', 'The Lady of the Hornwood says the harvest is not in, and the fact is that her men are few.', 'good'],
  ['g-battle-04', 'Tywin Lannister beats the Stark host near Whitewalls', 'Theon Greyjoy\'s van broke at the first charge and it never re-formed.', 'good'],
  ['g-battle-04', 'Tywin Lannister beats the Stark host near Whitewalls', 'The Stark force lost more than three thousand men. It was a rout.', 'good'],
  ['g-battle-04', 'Tywin Lannister beats the Stark host near Whitewalls', 'The Stark force lost more than three thousand men.', 'good'],
  ['g-battle-04', 'Tywin Lannister beats the Stark host near Whitewalls', 'Some three thousand Stark men were lost.', 'good'],
  ['g-battle-04', 'Tywin Lannister beats the Stark host near Whitewalls', 'Some three thousand one hundred Stark men were lost.', 'good'],
  ['g-siege-01', 'Jaime Lannister besieges Riverrun', 'Some fifteen thousand Lannister men now sit before the walls of the castle. The Tully garrison is shut inside.', 'good'],
]);
