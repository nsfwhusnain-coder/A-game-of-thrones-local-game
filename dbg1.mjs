import { spawn } from 'node:child_process'; import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
const saves = fs.mkdtempSync(path.join(os.tmpdir(), 'wc-dbg-')); const PORT=3419;
const srv = spawn(process.execPath, ['server/index.js'], { cwd: '/home/user/wc-s2', env: { ...process.env, PORT: String(PORT), WC_PROVIDER: 'mock', WC_SAVES: saves }, stdio: 'inherit' });
await new Promise(r=>setTimeout(r,1500));
const r = await fetch(`http://127.0.0.1:${PORT}/api/games`, {method:'POST', headers:{'content-type':'application/json'}, body: JSON.stringify({scenario:'agot_298', house:'stark', seed:5})});
const j = await r.json(); console.log(r.status, j.id, fs.readdirSync(saves));
srv.kill(); fs.rmSync(saves,{recursive:true,force:true});
