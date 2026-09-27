// Scratch playtest harness: drives server/game.js directly against the configured model and dumps everything.
import fs from 'node:fs';
import path from 'node:path';
const game = await import('./server/game.js');
const house = process.argv[2] || 'stark';
const turns = Number(process.argv[3] || 6);
const out = []; const log = (s) => { out.push(s); console.log(s); fs.writeFileSync(`play-${house}.md`, out.join('\n')); };
const { id } = game.newGame('agot_298', house);
log(`# ${house} ${id}`);
const script = {
  stark: {
    1: { act: [{ kind: 'call_banners', vassals: 'ALL', at: 'stark', ownLevies: 4000 }] },
    2: { orders: ['Robb is to lead the northern host south to Moat Cailin and hold the Neck.'] },
    3: { talk: [['luwin', 'Maester Luwin, how many men have answered the call, and how long can we feed them?']] },
    4: { orders: ['Send Ser Rodrik Cassel with 200 men to White Harbor to speak with Lord Manderly about ships.'] },
    5: { talk: [['roose_bolton', 'Lord Bolton, I need your men at Moat Cailin within the fortnight. Will you come?']] },
  },
  lannister: {
    1: { orders: ['Raise 10,000 men at Casterly Rock under Ser Jaime Lannister.'] },
    2: { orders: ['Ser Jaime is to march the host to the Golden Tooth.'] },
    3: { talk: [['kevan_lannister', 'Kevan, how many swords can the West field before the moon is out?']] },
  },
}[house] || {};
const SAVES = process.env.WC_SAVES;
const llmLog = () => { const f = path.join(SAVES, id, 'llm-log.jsonl'); return fs.existsSync(f) ? fs.readFileSync(f, 'utf8').trim().split('\n').map((l) => JSON.parse(l)) : []; };
let seen = 0;
for (let t = 1; t <= turns; t++) {
  const step = script[t] || {};
  log(`\n## Turn ${t}`);
  for (const a0 of step.act || []) {
    const st = game.loadState(id);
    const a = { ...a0 }; if (a.vassals === 'ALL') a.vassals = Object.values(st.houses).filter((h) => h.liege === house).map((h) => h.id);
    try { const r = game.act(id, a); log(`- act ${a.kind}: ${JSON.stringify(r.summary || r.state.orders.at(-1)?.result || 'done').slice(0, 1200)}`); } catch (e) { log(`- act ${a.kind} FAILED: ${e.message}`); }
  }
  for (const [who, line] of step.talk || []) {
    const t0 = Date.now();
    try { const r = await game.talk(id, who, line); log(`- audience ${who} (${((Date.now() - t0) / 1000).toFixed(0)}s, verdict ${r.stance?.verdict}) <- "${line}"\n  > ${String(r.reply || JSON.stringify(r.raven)).replace(/\s+/g, ' ')}\n  applied: ${(r.applied || []).map((x) => x.text).join('; ')}`); } catch (e) { log(`- audience ${who} FAILED: ${e.message}`); }
  }
  if (step.orders) {
    game.setOrders(id, [...game.loadState(id).orders, ...step.orders.map((text, k) => ({ id: `t${t}o${k}`, text }))]);
    try { const pv = await game.previewOrderPlans(id); for (const o of pv.orders.filter((x) => x.preview)) log(`- receipt: ${o.text.slice(0, 80)} -> ${o.preview.join('; ')}`); } catch (e) { log(`- receipt FAILED: ${e.message}`); }
  }
  const before = game.loadState(id);
  const t0 = Date.now();
  let r; try { r = await game.advance(id, { span: 'auto' }); } catch (e) { log(`- ADVANCE FAILED: ${e.stack}`); continue; }
  const tr = r.turn;
  log(`- ${tr.dateFrom} -> ${tr.date} (${tr.span}, until ${tr.until || '-'}) ${((Date.now() - t0) / 1000).toFixed(0)}s${tr.salvaged ? ' SALVAGED' : ''}`);
  for (const c of tr.carried || []) log(`- carried: ${c.order?.slice?.(0, 80) || JSON.stringify(c).slice(0, 80)} -> ${(c.result || []).join('; ')}`);
  log(`- summary: ${tr.summary}`);
  for (const e of tr.events.filter((e) => !e.bg)) log(`- ev d${e.day} [${e.importance}] ${e.orderId ? 'ORDER ' : ''}**${e.title}** — ${e.text} (${e.where || '-'})`);
  const bg = tr.events.filter((e) => e.bg); if (bg.length) log(`- bg(${bg.length}): ${bg.map((e) => e.title).slice(0, 12).join('; ')}`);
  log(`- applied(${tr.applied.length}): ${tr.applied.map((a) => `[${a.op}] ${String(a.text || '').slice(0, 110)}`).join(' | ')}`);
  log(`- rejected(${tr.rejected.length}): ${tr.rejected.map((x) => `${x.change?.op}: ${x.reason}`).join(' | ')}`);
  const calls = llmLog(); const fresh = calls.slice(seen); seen = calls.length;
  log(`- llm calls this turn: ${fresh.map((c) => `${c.kind}(${c.promptTokens}t in, ${String(c.response || '').length}ch out)`).join(', ')}`);
  for (const c of fresh) log(`  <details>${c.kind}: ${String(c.response || '').replace(/\s+/g, ' ').slice(0, 1800)}</details>`);
  const s2 = game.loadState(id);
  const hosts = Object.values(s2.armies).filter((a) => a.owner === house || a.serving === house || Object.keys(a.contingents || {}).length && a.owner === house);
  log(`- my hosts: ${hosts.map((a) => `${a.id} "${a.name}" ${a.men} @${a.at || a.pos.map((x) => x.toFixed(0))} ${a.status}${a.march ? ' ->' + a.march.to : ''}`).join(' || ') || 'none'}`);
  log(`- other hosts: ${Object.values(s2.armies).filter((a) => !hosts.includes(a)).map((a) => `${a.id} ${a.men} ${a.status}${a.march ? '->' + a.march.to : ''}`).join(', ')}`);
  const vas = Object.values(s2.houses).filter((h) => h.liege === house).map((h) => `${h.id}:${h.obligations?.levies}`);
  log(`- vassal levies status: ${vas.join(', ')}`);
  log(`- musters: ${JSON.stringify(s2.musters || s2.plots?.musters || null).slice(0, 600)}`);
  const h = s2.houses[house];
  log(`- figures: treasury ${Math.round(h.figures.treasury.v)} levies ${h.figures.levies.v} maa ${h.figures.menAtArms.v} food ${h.figures.food.v} | pending decisions: ${(s2.decisions || []).filter((d) => d.status === 'pending').map((d) => d.title).join(' | ') || 'none'}`);
}
