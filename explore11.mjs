import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path'; import net from 'node:net';
import { spawn } from 'node:child_process';
const saves = fs.mkdtempSync(path.join(os.tmpdir(), 'wc-sse-'));
const port = await new Promise((res) => { const s = net.createServer().listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => res(p)); }); });
const srv = spawn(process.execPath, ['server/index.js'], { cwd: '/home/user/wc-s2', env: { ...process.env, PORT: String(port), WC_PROVIDER: 'mock', WC_SAVES: saves }, stdio: 'ignore' });
const url = (p) => `http://127.0.0.1:${port}/api${p}`;
const api = async (p, body) => { const r = await fetch(url(p), body ? { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) } : {}); const j = await r.json(); if (!r.ok) throw new Error(j.error || r.status); return j; };
for (let i = 0; i < 60; i++) { try { await api('/version'); break; } catch { await new Promise(r => setTimeout(r, 100)); } }
const { id } = await api('/games', { scenario: 'agot_298', house: 'stark', seed: 41 });
const B = 'copyb'; fs.cpSync(path.join(saves, id), path.join(saves, B), { recursive: true });
const disk = JSON.parse(fs.readFileSync(path.join(saves, B, 'state.json'), 'utf8'));
console.log('meta keys', Object.keys(disk.meta).join(','));
async function jump(gid) {
  const { job } = await api(`/games/${gid}/jump`, { span: '14d' });
  const r = await fetch(url(`/games/${gid}/jump/${job}/stream`));
  const text = await r.text();
  const evs = text.split('\n\n').filter(Boolean).map(b => { const m = b.match(/^event: (\w+)\ndata: ([\s\S]*)$/); return m ? { event: m[1], data: JSON.parse(m[2]) } : null; }).filter(Boolean);
  return evs;
}
const [ea, eb] = await Promise.all([jump(id), jump(B)]).catch(e => { console.log('err', e); return []; });
console.log('events', ea.map(e => e.event).join(','), eb.map(e => e.event).join(','));
const norm = (evs) => evs.map(e => { const d = JSON.parse(JSON.stringify(e.data)); if (e.event === 'done') { delete d.turn.ms; } return JSON.stringify({ event: e.event, data: d }); });
const na = norm(ea), nb = norm(eb);
console.log('identical after ms strip', na.length === nb.length && na.every((x, i) => x === nb[i]));
for (let i = 0; i < na.length; i++) if (na[i] !== nb[i]) { const a = JSON.parse(na[i]), b = JSON.parse(nb[i]); const keys = (o, p = '') => Object.entries(o).flatMap(([k, v]) => v && typeof v === 'object' ? keys(v, p + k + '.') : [p + k + '=' + JSON.stringify(v)]); const ka = new Set(keys(a)); const kb = keys(b).filter(x => !ka.has(x)); console.log('diff at', i, kb.slice(0, 6)); }
const done = ea.find(e => e.event === 'done').data;
console.log('done keys', Object.keys(done), 'turn.realm?', 'realm' in done.turn, 'has realmStats', 'realmStats' in done.state, 'history realm', done.state.history.some(t => 'realm' in t), 'knowledge', Object.keys(done.state.knowledge));
srv.kill(); fs.rmSync(saves, { recursive: true, force: true });
