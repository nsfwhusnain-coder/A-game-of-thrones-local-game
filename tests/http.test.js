// The real server, end to end, on the mock model: every control the player can press is exercised through the API
// the browser uses — so a feature that works in the engine but not over the wire cannot pass unnoticed.
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const PORT = 3411;
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const saves = fs.mkdtempSync(path.join(os.tmpdir(), 'wc-http-'));
let srv;
const api = async (p, body) => {
  const r = await fetch(`http://127.0.0.1:${PORT}/api${p}`, body ? { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) } : {});
  const j = await r.json(); if (!r.ok) throw new Error(j.error || r.status); return j;
};

test.before(async () => {
  srv = spawn(process.execPath, ['server/index.js'], { cwd: ROOT, env: { ...process.env, PORT: String(PORT), WC_PROVIDER: 'mock', WC_SAVES: saves }, stdio: 'ignore' });
  for (let i = 0; i < 50; i++) { try { await api('/version'); return; } catch { await new Promise((r) => setTimeout(r, 100)); } }
  throw new Error('server did not start');
});
test.after(() => { srv?.kill(); fs.rmSync(saves, { recursive: true, force: true }); });

test('orders: receipt, then the turn does it; halt and call back work over the wire', async () => {
  const { id } = await api('/games', { scenario: 'agot_298', house: 'stark' });
  await api(`/games/${id}/orders`, { orders: [{ id: 'a', text: 'Send Jory Cassel to Moat Cailin with fifty men.' }, { id: 'b', text: 'Send Jon Snow to Castle Black.' }, { id: 'c', text: 'Send a raven to Lady Lysa Arryn at the Eyrie about Jon Arryn.' }] });
  const pv = await api(`/games/${id}/orders/preview`, {});
  const by = Object.fromEntries(pv.orders.map((o) => [o.id, o]));
  assert.match(by.a.preview.join(' '), /Jory Cassel rides for Moat Cailin with 50 men/);
  assert.match(by.c.preview.join(' '), /raven flies to Lysa Arryn/);
  const r = await api(`/games/${id}/advance`, { span: '1d', orders: pv.orders });
  const s = r.state;
  const co = Object.values(s.armies).find((a) => a.commander === 'jory_cassel');
  assert.equal(co.men, 50);
  assert.equal(s.characters.jon_snow.travel?.to, 'nights_watch');
  assert.equal(s.post[0].toName, 'Lysa Arryn');
  const h = await api(`/games/${id}/act`, { kind: 'recall', army: co.id });
  assert.equal(h.state.armies[co.id].march, undefined);
  const b = await api(`/games/${id}/act`, { kind: 'recall', character: 'jon_snow' });
  assert.equal(b.state.characters.jon_snow.travel?.to, 'stark');
});

test('works: one path, and a duplicate is refused with its reason', async () => {
  const { id } = await api('/games', { scenario: 'agot_298', house: 'stark' });
  await api(`/games/${id}/act`, { kind: 'project', template: 'granaries' });
  await assert.rejects(api(`/games/${id}/act`, { kind: 'project', template: 'granaries' }), /already under way/);
  const s = await api(`/games/${id}`);
  assert.equal(s.projects.filter((p) => p.status === 'active').length, 1);
});

test('a distant audience is a letter: the answer lands days later, in Letters and in the chronicle', async () => {
  const { id } = await api('/games', { scenario: 'agot_298', house: 'stark' });
  const r = await api(`/games/${id}/talk`, { character: 'lysa_arryn', message: 'Sister, what did Jon say in his last days?' });
  assert.equal(r.reply, null); assert.ok(r.raven.days >= 1);
  assert.ok(r.state.chats.lysa_arryn.at(-1).pending);
  let s = r.state; let found = null;
  for (let d = 0; d < r.raven.days * 2 + 1 && !found; d++) { const t = await api(`/games/${id}/advance`, { span: '1d', orders: [] }); s = t.state; found = t.turn.events.find((e) => /Lysa Arryn answers Eddard Stark/.test(e.title)); }
  assert.ok(found, 'the answer arrived as an event');
  assert.ok(s.ravens.some((x) => x.from === 'lysa_arryn'));
  assert.ok(!s.chats.lysa_arryn.at(-1).pending);
  assert.equal(s.post.find((p) => p.to === 'lysa_arryn').status, 'answered');
});
