// Parse every source file the browser and the server will load. The client code is never imported by the
// test suite, so a stray bracket in a UI file used to reach the player as a blank screen. This catches it.
// Run with `npm run check` (or directly: node --experimental-vm-modules scripts/check-syntax.mjs).
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const SKIP = /[\\/](vendor|models|node_modules|assets)[\\/]/;
const files = [];
const walk = (d) => {
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    const f = path.join(d, e.name);
    if (SKIP.test(f + path.sep)) continue;
    if (e.isDirectory()) walk(f);
    else if (f.endsWith('.js') || f.endsWith('.mjs')) files.push(f);
  }
};
for (const d of ['public/js', 'public/data', 'server', 'scripts']) walk(path.join(ROOT, d));

let bad = 0;
for (const f of files) {
  const src = fs.readFileSync(f, 'utf8');
  try {
    // worker files are classic scripts, not modules
    if (/self\.onmessage|importScripts/.test(src) && !/^\s*(import|export)\s/m.test(src)) new vm.Script(src, { filename: f });
    else new vm.SourceTextModule(src, { identifier: f });
  } catch (e) {
    bad++; console.error(`✖ ${path.relative(ROOT, f)}: ${e.message}`);
  }
}
// Every named import must exist in the module it names. A renamed export used to reach the player as a
// blank page with "does not provide an export named …" in a console they never open.
const namesOf = (src) => {
  const out = new Set();
  for (const m of src.matchAll(/export\s+(?:async\s+)?(?:function|class|const|let|var)\s+([A-Za-z0-9_$]+)/g)) out.add(m[1]);
  for (const m of src.matchAll(/export\s*\{([^}]*)\}/g)) for (const part of m[1].split(',')) { const t = part.trim().split(/\s+as\s+/); if (t.length > 1) out.add(t[1].trim()); else if (t[0]) out.add(t[0].trim()); }
  if (/export\s+default/.test(src)) out.add('default');
  if (/export\s*\*/.test(src)) out.add('*');
  return out;
};
const cache = new Map();
for (const f of files) {
  const src = fs.readFileSync(f, 'utf8');
  for (const m of src.matchAll(/import\s*\{([^}]*)\}\s*from\s*['"]([^'"]+)['"]/g)) {
    const spec = m[2]; if (!spec.startsWith('.')) continue;
    const tgt = path.resolve(path.dirname(f), spec);
    if (!fs.existsSync(tgt)) { bad++; console.error(`✖ ${path.relative(ROOT, f)}: no such module ${spec}`); continue; }
    if (!cache.has(tgt)) cache.set(tgt, namesOf(fs.readFileSync(tgt, 'utf8')));
    const ex = cache.get(tgt); if (ex.has('*')) continue;
    for (const part of m[1].split(',')) {
      const n = part.trim().split(/\s+as\s+/)[0].trim(); if (!n) continue;
      if (!ex.has(n)) { bad++; console.error(`✖ ${path.relative(ROOT, f)}: ${path.relative(ROOT, tgt)} exports no "${n}"`); }
    }
  }
}
console.log(bad ? `✖ ${bad} problem(s) across ${files.length} source files` : `✔ ${files.length} source files parse, and every named import resolves`);
process.exit(bad ? 1 : 0);
