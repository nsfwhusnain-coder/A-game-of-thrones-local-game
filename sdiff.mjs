import fs from 'node:fs';
const diffs = [];
const walk = (a, b, p) => {
  if (JSON.stringify(a) === JSON.stringify(b)) return;
  if (a && b && typeof a === 'object' && typeof b === 'object' && !Array.isArray(a) === !Array.isArray(b)) {
    for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) walk(a[k], b[k], p + '.' + k);
  } else diffs.push(p + ' : ' + JSON.stringify(a)?.slice(0, 60) + ' -> ' + JSON.stringify(b)?.slice(0, 60));
};
for (const h of ['stark', 'lannister', 'greyjoy']) {
  const a = JSON.parse(fs.readFileSync(`out-${h}-old.state.json`)); const b = JSON.parse(fs.readFileSync(`out-${h}-new.state.json`));
  delete a.meta.id; delete b.meta.id;
  diffs.length = 0; walk(a, b, h);
  console.log(h, diffs.length, 'state diffs'); console.log(diffs.slice(0, 12).join('\n'));
}
