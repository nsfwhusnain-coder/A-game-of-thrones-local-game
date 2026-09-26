// A scripted playthrough against the configured model: plays a house turn by turn with real orders, audiences
// and decisions, and writes everything that happens to playtest/<house>-<date>.md for reading.
//   node scripts/playtest.js [--house stark] [--turns 10]
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const args = Object.fromEntries(process.argv.slice(2).reduce((a, x, i, all) => (x.startsWith('--') ? [...a, [x.slice(2), all[i + 1] && !all[i + 1].startsWith('--') ? all[i + 1] : true]] : a), []));
const work = fs.mkdtempSync(path.join(os.tmpdir(), 'wc-play-'));
fs.cpSync(path.join(ROOT, 'server'), path.join(work, 'server'), { recursive: true });
fs.symlinkSync(path.join(ROOT, 'public'), path.join(work, 'public'));
fs.mkdirSync(path.join(work, 'saves'));
fs.copyFileSync(path.join(ROOT, 'config.json'), path.join(work, 'config.json'));
process.chdir(work);
const game = await import(path.join(work, 'server/game.js'));
const { whereabouts } = await import(path.join(work, 'public/js/shared/roads.js'));
const { orderOutcome } = await import(path.join(work, 'public/js/shared/errands.js'));
const seenRavens = new Set();
const house = args.house || 'stark';
const out = []; const log = (s) => { out.push(s); console.log(s); };
const { id } = game.newGame('agot_298', house);
log(`# Playtest — House ${house} — ${JSON.parse(fs.readFileSync('config.json', 'utf8')).model} — ${new Date().toISOString().slice(0, 16)}\n`);

// the script: what a player might do, turn by turn (orders, audiences, acts)
const script = {
  1: { act: [{ kind: 'call_banners', vassals: ['umber', 'karstark', 'manderly', 'glover', 'bolton'] }], orders: ['Send a raven to Walder Frey: I will want the crossing at the Twins open to my men, and I will remember who helped me.'] },
  2: { talk: [['roose_bolton', 'Lord Bolton. When I call, you come — at once, with every man. Is that understood?']] },
  3: { orders: ['Have Vayon send a discreet raven to Lady Lysa at the Eyrie asking about Jon Arryn\'s last days.'] },
  4: { talk: [['greatjon_umber', 'Jon, your men were the first to answer. The North will not forget it.']] },
  5: { orders: ['Write to Lord Tywin Lannister: if any harm comes to my family on the Kingsroad, the North will march.', 'Fund the expansion of the granaries at Winterfell.'], act: [{ kind: 'project', template: 'granaries' }] },
  6: { orders: ['Keep the children close to Winterfell while the King is our guest.', 'Send Jon Snow to Castle Black to see the Wall for himself.'], act: [{ kind: 'project', template: 'rookery' }, { kind: 'project', template: 'rookery' }] },
  7: { act: [{ kind: 'feast' }, { kind: 'scheme', house: 'lannister', kind2: 'secrets' }], orders: ['Jory Cassel is to take two hundred men of the household guard to Castle Black to help the Watch. They are not to cross the Wall.'] },
  8: { orders: ['Jon is to turn back and return to Winterfell at once.'], council: [['vayon_poole', 'luwin', 'rodrik_cassel', 'jory_cassel'], 'What do we know of the Lannisters\' intentions, and are our stores enough for a winter?'] },
  9: { orders: ['Order Ser Rodrik to garrison Winterfell, drill the levies and count our stores for winter.'] },
};
const turns = Number(args.turns || 10);
for (let t = 1; t <= turns; t++) {
  const step = script[t] || {};
  log(`\n## Turn ${t}`);
  for (const a of step.act || []) { try { const r = game.act(id, a); log(`- act ${a.kind}: ${r.summary || 'done'}`); } catch (e) { log(`- act ${a.kind} FAILED: ${e.message}`); } }
  for (const [who, line] of step.talk || []) {
    const t0 = Date.now();
    try { const r = await game.talk(id, who, line); log(`- **audience ${who}** (${((Date.now() - t0) / 1000).toFixed(0)}s, engine: ${r.stance?.verdict || '—'}, ${r.stance?.mood}) ← "${line}"\n  > ${String(r.reply).replace(/\s+/g, ' ')}${r.applied?.length ? `\n  applied: ${r.applied.map((x) => x.text).join('; ')}` : ''}`); } catch (e) { log(`- audience ${who} FAILED: ${e.message}`); }
  }
  if (step.council) {
    const t0 = Date.now();
    try { const r = await game.council(id, step.council[0], step.council[1]); log(`- **council** (${((Date.now() - t0) / 1000).toFixed(0)}s) ← "${step.council[1]}"\n${r.replies.map((x) => `  > ${x.speaker}: ${x.text.replace(/\s+/g, ' ')}`).join('\n')}`); } catch (e) { log(`- council FAILED: ${e.message}`); }
  }
  // answer what is pending: the first option, or in our own words for every third matter
  const st = game.loadState(id);
  for (const [k, d] of (st.decisions || []).filter((x) => x.status === 'pending').entries()) {
    try { const r = game.act(id, k % 3 === 2 ? { kind: 'decide', decision: d.id, custom: 'I will think on it — but tell them House Stark does not forget its friends.' } : { kind: 'decide', decision: d.id, option: 0 }); log(`- decided "${d.title}": ${k % 3 === 2 ? '(own words)' : d.options[0].label}${r.effects?.length ? ' — ' + r.effects.join(', ') : ''}`); } catch (e) { log(`- decide failed: ${e.message}`); }
  }
  if (step.orders) {
    game.setOrders(id, [...game.loadState(id).orders, ...step.orders.map((text, k) => ({ id: `t${t}o${k}`, text }))]);
    try { const pv = await game.previewOrderPlans(id); for (const o of pv.orders.filter((x) => x.preview)) log(`- receipt: ${o.text.slice(0, 60)} → ${o.preview.join('; ')}`); } catch (e) { log(`- receipt FAILED: ${e.message}`); }
  }
  const t0 = Date.now();
  let r; try { r = await game.advance(id, { span: t <= Number(args.weeks || 0) ? '1w' : t % 5 === 0 ? '1w' : '1d', orders: game.loadState(id).orders.filter((o) => o.auto || o.planFor || /^t\d+o\d+$/.test(o.id)).concat(step.orders && !game.loadState(id).orders.some((o) => /^t\d+o\d+$/.test(o.id)) ? step.orders.map((text, k) => ({ id: `t${t}o${k}`, text })) : []) }); } catch (e) { log(`- ADVANCE FAILED: ${e.message}`); continue; }
  const tr = r.turn; const u = tr.usage || {};
  log(`- ${tr.dateFrom} → ${tr.date} · ${((Date.now() - t0) / 1000).toFixed(0)}s · prompt ${u.prompt_tokens ?? '?'} (cached ${u.prompt_tokens_details?.cached_tokens ?? '?'}) · reply ${u.completion_tokens ?? '?'}${tr.salvaged ? ' · SALVAGED' : ''}`);
  if (step.orders) for (const c of tr.carried || []) log(`- carried out: ${c.order} → ${c.result.join('; ')}`);
  log(`- summary: ${tr.summary}`);
  for (const e of tr.events.filter((e) => !e.bg)) log(`- [${e.importance}] d${e.day} **${e.title}** — ${e.text}${e.where ? ` (${e.where})` : ''}`);
  const bg = tr.events.filter((e) => e.bg); if (bg.length) log(`- meanwhile: ${bg.map((e) => e.title).join('; ')}`);
  if (tr.rejected?.length) log(`- rejected: ${tr.rejected.map((x) => `${x.change?.op} (${x.reason})`).join('; ')}`);
  const s2 = game.loadState(id); const h = s2.houses[house];
  log(`- whereabouts: ${['robb_stark', 'sansa_stark', 'arya_stark', 'jon_snow', 'jory_cassel', 'rodrik_cassel'].map((c) => `${c.split('_')[0]} ${whereabouts(s2, s2.characters[c]).text}`).join(' · ')} · guard ${h.figures.menAtArms?.v}`);
  if (s2.post?.length) log(`- post: ${s2.post.map((x) => `${x.toName} ${x.status}`).join(', ')}`);
  log(`- hosts: ${Object.values(s2.armies).filter((a) => a.owner === house).map((a) => `${a.name} ${a.men}${a.march ? ' →' + a.march.to : ''}`).join(', ')}`);
  const works = (s2.projects || []).filter((x) => x.house === house && x.status === 'active'); if (works.length) log(`- works: ${works.map((x) => x.name).join(', ')}`);
  for (const x of s2.ravens.filter((x) => !seenRavens.has(x.id))) { seenRavens.add(x.id); log(`- raven from ${x.fromName}: ${x.text.replace(/\s+/g, ' ').slice(0, 140)}`); }
  const out2 = (tr.orders || []).map((o) => `${o.text.slice(0, 50)} → ${orderOutcome(o, s2).status}`); if (out2.length) log(`- order statuses: ${out2.join(' | ')}`);
  log(`- state: treasury ${Math.round(h.figures.treasury.v)} · food ${h.figures.food.v} · levies ${h.figures.levies.v} · hosts ${Object.values(s2.armies).filter((a) => a.owner === house).map((a) => `${a.name} ${a.men}`).join(', ') || 'none'} · pending decisions ${(s2.decisions || []).filter((d) => d.status === 'pending').map((d) => d.title).join(' | ') || 'none'}`);
}
const dir = path.join(ROOT, 'playtest'); fs.mkdirSync(dir, { recursive: true });
const file = path.join(dir, `${house}-${new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-')}.md`);
fs.writeFileSync(file, out.join('\n') + '\n');
fs.cpSync(path.join(work, 'saves', id), path.join(dir, id), { recursive: true });
console.log('\nReport:', path.relative(ROOT, file));
