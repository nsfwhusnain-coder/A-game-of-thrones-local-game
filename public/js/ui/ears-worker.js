// The ears: a small speech-to-text model, run here in a worker on the CPU (WebAssembly) — never the GPU, and nothing said leaves the machine.
// The model is served from public/models/ when `npm run fetch-ears` has put it there, otherwise it is fetched from the hub once and the browser keeps it.
// The page sends 16 kHz mono samples; the answer is the words, unspelt and unstopped: the scribe (shared/scribe.js, the small model of server/scribe.js)
// puts them right afterwards.
import { pipeline, env } from '/vendor/transformers/transformers.min.js';

export const EARS = 'onnx-community/whisper-tiny.en';
env.allowLocalModels = true; env.localModelPath = '/models/'; env.allowRemoteModels = true;
// the runtime the voices use too (npm run fetch-voices / fetch-ears), so nothing is fetched from a CDN
try { env.backends.onnx.wasm.wasmPaths = '/models/ort/'; env.backends.onnx.wasm.numThreads = self.crossOriginIsolated ? Math.min(4, navigator.hardwareConcurrency || 2) : 1; } catch { /* older builds */ }

let ears = null;
async function load() {
  if (ears) return ears;
  const say = (text) => self.postMessage({ type: 'status', text });
  const files = new Map();
  ears = pipeline('automatic-speech-recognition', EARS, {
    dtype: 'q8', device: 'wasm',
    progress_callback: (p) => {
      if (p.status === 'progress' && p.total) { files.set(p.file, [p.loaded, p.total]); const [l, t] = [...files.values()].reduce((a, [x, y]) => [a[0] + x, a[1] + y], [0, 0]); say(`Fetching the listening model… ${Math.round((100 * l) / t)} %`); }
      else if (p.status === 'ready') say('');
    },
  });
  try { return await ears; } catch (e) { ears = null; throw e; }
}

self.onmessage = async ({ data }) => {
  const { id, type, audio } = data || {};
  if (type !== 'transcribe') return;
  try {
    const model = await load();
    self.postMessage({ type: 'status', text: 'Writing it down…' });
    const out = await model(audio, { chunk_length_s: 30, return_timestamps: false });
    self.postMessage({ type: 'text', id, text: String(out?.text || '').trim() });
  } catch (e) { self.postMessage({ type: 'error', id, message: e?.message || String(e) }); }
};
