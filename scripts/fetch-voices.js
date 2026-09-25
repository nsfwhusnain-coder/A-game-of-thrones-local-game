// Downloads the Kokoro-82M neural voice model (~90 MB, Apache-2.0) into public/models/ so character voices
// work offline. Without it, the browser downloads the same files from Hugging Face on first use and caches them.
import fs from 'node:fs';
import path from 'node:path';
const REPO = 'onnx-community/Kokoro-82M-v1.0-ONNX';
const OUT = path.join(path.dirname(new URL(import.meta.url).pathname), '..', 'public', 'models', REPO);
const VOICES = ['af_heart', 'af_bella', 'af_nicole', 'af_sarah', 'af_sky', 'af_nova', 'af_river', 'af_kore', 'af_aoede', 'af_jessica', 'af_alloy',
  'am_adam', 'am_echo', 'am_eric', 'am_fenrir', 'am_liam', 'am_michael', 'am_onyx', 'am_puck',
  'bf_alice', 'bf_emma', 'bf_isabella', 'bf_lily', 'bm_daniel', 'bm_fable', 'bm_george', 'bm_lewis'];
const FILES = ['config.json', 'tokenizer.json', 'tokenizer_config.json', 'onnx/model_quantized.onnx', ...VOICES.map((v) => `voices/${v}.bin`)];
for (const f of FILES) {
  const dest = path.join(OUT, f);
  if (fs.existsSync(dest) && fs.statSync(dest).size > 0) { console.log('have', f); continue; }
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  const res = await fetch(`https://huggingface.co/${REPO}/resolve/main/${f}`);
  if (!res.ok) { console.error('failed', f, res.status); process.exitCode = 1; continue; }
  fs.writeFileSync(dest, Buffer.from(await res.arrayBuffer()));
  console.log('got', f, fs.statSync(dest).size);
}
// the speech runtime (onnxruntime-web, MIT), so voices need no CDN either
const ORT = path.join(OUT, '..', '..', 'ort');
for (const f of ['ort-wasm-simd-threaded.jsep.mjs', 'ort-wasm-simd-threaded.jsep.wasm']) {
  const dest = path.join(ORT, f);
  if (fs.existsSync(dest) && fs.statSync(dest).size > 0) { console.log('have', f); continue; }
  fs.mkdirSync(ORT, { recursive: true });
  const res = await fetch(`https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.5.1/dist/${f}`);
  if (!res.ok) { console.error('failed', f, res.status); process.exitCode = 1; continue; }
  fs.writeFileSync(dest, Buffer.from(await res.arrayBuffer()));
  console.log('got', f, fs.statSync(dest).size);
}
console.log('Voices are in', OUT);
