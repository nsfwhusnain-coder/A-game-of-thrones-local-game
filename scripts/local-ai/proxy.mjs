// Wire-logging reverse proxy for an OpenAI-compatible server (llama-swap / llama-server).
//
// Sits between the game (or my bench runner) and the model server and writes ONE JSON LINE per chat completion:
// the full request (messages, response_format schema, sampler fields), the assembled reply, time to first token,
// total time, finish reason, and llama.cpp's own `usage` + `timings` (prompt_n, cache_n, predicted_per_second...).
// That file is the source for latency percentiles, real prompt sizes, retry/fallback counts and the fine-tuning set
// (the game's own llm-log.jsonl keeps neither prompt nor schema).
//
//   node proxy.mjs --target http://127.0.0.1:8043 --port 8044 --log C:\wc-ai\logs\wire.jsonl --label baseline
//   (in code)  const p = await startProxy({ target, logFile, label }); ... p.setLabel('interpret'); ... await p.close();
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { REPO, HOME, RESULTS, CORPUS, SPEED, LOGS } from './paths.mjs';

export function startProxy({ target = 'http://127.0.0.1:8043', port = 0, host = '127.0.0.1', logFile = null, label = '', slim = false } = {}) {
  const up = new URL(target);
  let curLabel = label; let seq = 0;
  const stats = { requests: 0, errors: 0, open: 0 };
  if (logFile) fs.mkdirSync(path.dirname(logFile), { recursive: true });
  const agent = new http.Agent({ keepAlive: true, maxSockets: 64 });
  const write = (rec) => { if (logFile) fs.appendFileSync(logFile, JSON.stringify(rec) + '\n'); };

  const server = http.createServer((req, res) => {
    if (req.url === '/__stats') { res.writeHead(200, { 'content-type': 'application/json' }); return res.end(JSON.stringify({ ...stats, label: curLabel })); }
    if (req.url === '/__label' && req.method === 'POST') {
      const chunks = []; req.on('data', (c) => chunks.push(c)); req.on('end', () => { try { curLabel = JSON.parse(Buffer.concat(chunks).toString()).label ?? ''; } catch { /* ignore */ } res.writeHead(200); res.end('ok'); });
      return;
    }
    const chunks = []; req.on('data', (c) => chunks.push(c));
    req.on('end', () => {
      const body = Buffer.concat(chunks);
      const t0 = Date.now(); const id = ++seq; stats.requests++; stats.open++;
      const isChat = req.method === 'POST' && /\/chat\/completions$/.test(req.url);
      let parsed = null; if (isChat) { try { parsed = JSON.parse(body.toString('utf8')); } catch { /* not JSON */ } }
      const rec = isChat && parsed ? {
        id, ts: new Date(t0).toISOString(), label: req.headers['x-wc-label'] || curLabel, path: req.url,
        kind: parsed.response_format?.json_schema?.name || (parsed.response_format ? parsed.response_format.type : 'free'),
        model: parsed.model, slot: parsed.id_slot ?? null, temp: parsed.temperature, max_tokens: parsed.max_tokens, stream: !!parsed.stream,
        extra: Object.fromEntries(Object.entries(parsed).filter(([k]) => !['messages', 'response_format', 'model', 'temperature', 'max_tokens', 'stream', 'stream_options'].includes(k))),
        req_bytes: body.length,
        messages: slim ? undefined : parsed.messages, msg_chars: (parsed.messages || []).reduce((n, m) => n + String(m.content || '').length, 0),
        schema: slim ? undefined : parsed.response_format?.json_schema?.schema, schema_bytes: JSON.stringify(parsed.response_format?.json_schema?.schema || '').length,
      } : null;
      const headers = { ...req.headers, host: up.host, connection: 'keep-alive' }; delete headers['x-wc-label'];
      const ureq = http.request({ hostname: up.hostname, port: up.port, path: req.url, method: req.method, headers, agent }, (ures) => {
        res.writeHead(ures.statusCode, ures.headers);
        let buf = ''; let content = ''; let reasoning = ''; let finish = null; let usage = null; let timings = null; let ttft = null; let raw = '';
        const streaming = /text\/event-stream/.test(String(ures.headers['content-type'] || ''));
        ures.on('data', (c) => {
          res.write(c);
          if (!rec) return;
          if (!streaming) { raw += c.toString('utf8'); return; }
          buf += c.toString('utf8'); let nl;
          while ((nl = buf.indexOf('\n')) >= 0) {
            const line = buf.slice(0, nl).trim(); buf = buf.slice(nl + 1);
            if (!line.startsWith('data:')) continue;
            const payload = line.slice(5).trim(); if (!payload || payload === '[DONE]') continue;
            let ev; try { ev = JSON.parse(payload); } catch { continue; }
            if (ev.usage) usage = ev.usage; if (ev.timings) timings = ev.timings;
            const ch = ev.choices?.[0]; if (!ch) continue;
            const d = ch.delta || {};
            if (d.content) content += d.content; if (d.reasoning_content) reasoning += d.reasoning_content; if (ch.text) content += ch.text;
            if ((d.content || d.reasoning_content || ch.text) && ttft == null) ttft = Date.now() - t0;
            if (ch.finish_reason) finish = ch.finish_reason;
          }
        });
        ures.on('end', () => {
          res.end(); stats.open--;
          if (!rec) return;
          if (!streaming) { try { const j = JSON.parse(raw); const m = j.choices?.[0]?.message || {}; content = m.content || ''; reasoning = m.reasoning_content || ''; finish = j.choices?.[0]?.finish_reason; usage = j.usage; timings = j.timings; } catch { content = raw.slice(0, 500); } }
          if (ures.statusCode >= 400) stats.errors++;
          write({ ...rec, status: ures.statusCode, ttft_ms: ttft, total_ms: Date.now() - t0, content, reasoning: reasoning || undefined, finish, usage, timings });
        });
        ures.on('error', () => { stats.open--; });
      });
      ureq.on('error', (e) => {
        stats.errors++; stats.open--;
        if (!res.headersSent) res.writeHead(502, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ error: { message: `proxy: ${e.message}` } }));
        if (rec) write({ ...rec, status: 502, total_ms: Date.now() - t0, error: e.message });
      });
      // a client that gives up frees the upstream slot
      res.on('close', () => { if (!res.writableEnded) ureq.destroy(); });
      if (body.length) ureq.write(body); ureq.end();
    });
  });
  return new Promise((resolve) => server.listen(port, host, () => {
    const p = server.address().port;
    resolve({ port: p, url: `http://${host}:${p}`, server, stats: () => ({ ...stats }), setLabel: (l) => { curLabel = l; }, close: () => new Promise((r) => { agent.destroy(); server.close(r); server.closeAllConnections?.(); }) });
  }));
}

if (process.argv[1] && path.resolve(fileURLToPath(import.meta.url)) === path.resolve(process.argv[1])) {
  const a = Object.fromEntries(process.argv.slice(2).reduce((acc, x, i, all) => (x.startsWith('--') ? [...acc, [x.slice(2), all[i + 1] && !all[i + 1].startsWith('--') ? all[i + 1] : true]] : acc), []));
  const p = await startProxy({ target: a.target || 'http://127.0.0.1:8043', port: Number(a.port || 8044), logFile: a.log || path.join(LOGS, 'wire.jsonl'), label: a.label || '', slim: !!a.slim });
  console.log(`wire proxy on ${p.url} -> ${a.target || 'http://127.0.0.1:8043'} logging to ${a.log || path.join(LOGS, 'wire.jsonl')}`);
}
