process.argv[2] = 'lib';
const { run } = await import('./probe.mjs');
run('invented names the scorer cannot know', [
  ['g-muster-01', 'Ser Aldric Vance raises the northern banners at Winterfell', null, 'bad'],
  ['g-muster-01', 'Eddard Stark raises the northern banners at Blackmoor Keep', null, 'bad'],
  ['g-muster-01', 'Eddard Stark raises the northern banners at the Whispering Vale', null, 'bad'],
  ['g-muster-01', 'Eddard Stark raises the Glenmore banners at Winterfell', null, 'bad'],
  ['g-muster-01', 'Eddard Stark and Maester Corwin raise the banners', null, 'bad'],
  ['g-muster-01', 'Eddard Stark raises the northern banners at Winterfell', 'Lady Brienne of Tarth rides with him.', 'bad'],
  ['g-muster-01', 'Eddard Stark raises the northern banners at Winterfell', 'Ser Jorah Mormont rides with him.', 'bad'],
  ['g-muster-01', 'Eddard Stark raises the northern banners at Winterfell', 'The Boltons are said to be slow.', 'bad'],
  ['g-muster-01', 'Eddard Stark raises the northern banners at Winterfell', 'Lord Bolton is said to be slow.', 'bad'],
  ['g-muster-01', 'Eddard Stark raises the northern banners at Winterfell', 'Bolton is said to be slow.', 'bad'],
]);
