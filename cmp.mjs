import fs from 'node:fs';
for (const h of ['stark','lannister','greyjoy']) {
  const a = JSON.parse(fs.readFileSync(`out-${h}-old.json`)); const b = JSON.parse(fs.readFileSync(`out-${h}-new.json`));
  console.log(h, 'counts', a.length, b.length);
  let diffs = 0; const keyAdds = {}; const valChanges = {};
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const x = a[i], y = b[i]; if (!x || !y) { diffs++; continue; }
    for (const k of Object.keys({ ...x, ...y })) {
      if (k === 'data') continue;
      if (JSON.stringify(x[k]) !== JSON.stringify(y[k])) { diffs++; if (diffs < 6) console.log('DIFF', i, k, JSON.stringify(x[k]), JSON.stringify(y[k])); }
    }
    const dx = x.data || {}, dy = y.data || {};
    for (const k of Object.keys({ ...dx, ...dy })) {
      if (!(k in dx)) { const key = `${x.kind}.${k}`; keyAdds[key] = (keyAdds[key] || 0) + 1; }
      else if (JSON.stringify(dx[k]) !== JSON.stringify(dy[k])) { const key = `${x.kind}.${k}`; valChanges[key] = (valChanges[key] || []); valChanges[key].push([dx[k], dy[k]]); }
      else if (!(k in dy)) console.log('REMOVED', x.kind, k);
    }
  }
  console.log(' non-data diffs', diffs, '\n added', keyAdds);
  for (const [k, v] of Object.entries(valChanges)) console.log(' VALUE CHANGED', k, v.length, JSON.stringify(v.slice(0, 3)));
}
