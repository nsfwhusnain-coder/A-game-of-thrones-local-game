import fs from 'node:fs'; import zlib from 'node:zlib';
process.env.WC_PROVIDER='mock'; process.env.WC_SAVES = process.argv[2];
const R='/home/user/A-game-of-thrones-local-game';
const { parseOrder } = await import(R+'/server/orders/parse.js');
const { check, intentFor } = await import(R+'/public/js/engine/actions/registry.js');
for (const [dir, house] of [['playtest/lannister-mulyhuy8-c2a0','lannister'],['playtest/greyjoy-mulyi3qw-03d1','greyjoy']]) {
  const st = JSON.parse(zlib.gunzipSync(fs.readFileSync(`${dir}/snapshots/000004.json.gz`))).state;
  for (const t of ['Robb is to march the Northern Host to Moat Cailin.', 'The Northern Host marches to Moat Cailin.', 'Robb Stark, march to Moat Cailin.']) {
    const p = parseOrder(st, t, { house });
    console.log(house, '|', t, '\n  ', JSON.stringify(p.actions.map(a=>({v:a.verb,p:a.params}))), 'complete', p.complete, 'clarify', p.clarify?.question);
    for (const a of p.actions) console.log('   check', a.verb, JSON.stringify(check(st, intentFor(st, a.verb, {house, params:a.params}))));
  }
}
