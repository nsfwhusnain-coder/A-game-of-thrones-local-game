// Downloads the small speech-to-text model the microphone button uses (~45 MB, Apache-2.0) into public/models/, so speaking an order works offline.
// Without it the browser fetches the same files from the hub the first time the microphone is used and keeps them. The model runs in the page, on the CPU.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const REPO = 'onnx-community/whisper-tiny.en';
const PUBLIC = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'public', 'models');
const OUT = path.join(PUBLIC, REPO);
const FILES = ['config.json', 'generation_config.json', 'preprocessor_config.json', 'tokenizer.json', 'tokenizer_config.json', 'vocab.json', 'merges.txt', 'added_tokens.json', 'special_tokens_map.json', 'normalizer.json',
  'onnx/encoder_model_quantized.onnx', 'onnx/decoder_model_merged_quantized.onnx'];
async function get(url, dest) {
  if (fs.existsSync(dest) && fs.statSync(dest).size > 0) { console.log('have', path.relative(PUBLIC, dest)); return; }
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  const res = await fetch(url);
  if (!res.ok) { console.error('failed', url, res.status); process.exitCode = 1; return; }
  fs.writeFileSync(dest, Buffer.from(await res.arrayBuffer()));
  console.log('got', path.relative(PUBLIC, dest), fs.statSync(dest).size);
}
for (const f of FILES) await get(`https://huggingface.co/${REPO}/resolve/main/${f}`, path.join(OUT, f));
// the runtime (onnxruntime-web, MIT), shared with the voices, so nothing is fetched from a CDN
for (const f of ['ort-wasm-simd-threaded.jsep.mjs', 'ort-wasm-simd-threaded.jsep.wasm']) await get(`https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.5.1/dist/${f}`, path.join(PUBLIC, 'ort', f));
console.log('The ears are in', OUT);
