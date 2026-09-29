process.env.WC_PROVIDER = 'mock'; process.env.WC_SAVES = '/tmp/claude-0/x2';
import fs from 'node:fs'; fs.mkdirSync('/tmp/claude-0/x2', { recursive: true });
const root = process.argv[2];
const game = await import(root + '/server/game.js');
const K = await import(root + '/public/js/engine/knowledge.js');
const { id, state } = game.newGame('agot_298', 'stark', { seed: 7 });
const vassals = Object.values(state.houses).filter((h) => h.liege === 'stark').map((h) => h.id);
game.act(id, { kind: 'call_banners', vassals, at: 'stark', ownLevies: 3000 });
const r = await game.advance(id, { span: '7d' });
const s = game.loadState(id);
const cards = r.turn.events.filter((e) => /answers/.test(e.title));
console.log('answer cards shown to the player:', cards.length);
// facts of the log: read from the turn's saved facts if kept in state
const facts = (s.facts || []);
console.log('facts in state:', facts.length, 'call_answered:', facts.filter((f) => f.kind === 'call_answered').length);
const dir = '/tmp/claude-0/x2/' + id; console.log(fs.readdirSync(dir));
for (const e of r.turn.events) console.log(' -', e.importance, e.title);
