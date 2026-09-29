process.env.WC_PROVIDER = 'mock'; process.env.WC_SAVES = '/tmp/claude-0/x';
const path = await import('node:path');
const out = {};
for (const [k, root] of [['base', process.argv[2]], ['after', process.argv[3]]]) {
  const { parseOrder } = await import(root + '/server/orders/parse.js');
  const { loadSuite, runSuite } = await import(root + '/bench/lib/interpret.js');
  const seen = [];
  await runSuite((s, text, house) => { const p = parseOrder(s, text, { house }); seen.push([house + ':' + text, p.complete, !!p.clarify, JSON.stringify(p.actions.map((a) => [a.verb, a.params]))]); return p; }, { suites: loadSuite(path.join(root, 'bench', 'suites', 'interpret')) });
  out[k] = seen;
}
out.base.forEach((b, i) => { const a = out.after[i]; if (b[1] !== a[1] || b[3] !== a[3]) console.log(b[0], '\n   base ', b[1], b[3], '\n   after', a[1], a[3]); });
