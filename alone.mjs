const root = process.argv[2];
process.env.WC_PROVIDER = 'mock'; process.env.WC_SAVES = '/tmp/claude-0/x';
const { parseOrder } = await import(root + '/server/orders/parse.js');
const { loadSuite, runSuite } = await import(root + '/bench/lib/interpret.js');
const path = await import('node:path');
for (const dir of ['interpret', 'interpret-holdout']) {
  const r = await runSuite((s, text, house) => parseOrder(s, text, { house }), { suites: loadSuite(path.join(root, 'bench', 'suites', dir)) });
  console.log(dir, 'total', r.total, 'exact', r.exact, 'alone', JSON.stringify(r.alone), 'clarified', r.clarified, 'receipts', JSON.stringify(r.receipts));
}
