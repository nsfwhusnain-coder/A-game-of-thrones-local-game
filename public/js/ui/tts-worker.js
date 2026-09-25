// Neural voices (Kokoro-82M) running in a worker, so speaking never stalls the map.
// The model comes from public/models/ when `npm run fetch-voices` has put it there, otherwise from
// Hugging Face once (the browser caches it).
import { KokoroTTS, env } from '/vendor/kokoro/kokoro.web.js';

const REPO = 'onnx-community/Kokoro-82M-v1.0-ONNX';
const HF = `https://huggingface.co/${REPO}/resolve/main/`;
let tts = null, loading = null, patched = false;

function useLocal() {
  if (patched) return; patched = true;
  // the speech runtime from public/models/ort/ too, so nothing is fetched from a CDN
  try { env.wasmPaths = '/models/ort/'; } catch { /* older builds */ }
  const f = self.fetch.bind(self);
  // local copy first; anything missing from it still comes from Hugging Face
  self.fetch = async (u, o) => {
    if (typeof u !== 'string' || !u.startsWith(HF)) return f(u, o);
    const r = await f(`/models/${REPO}/` + u.slice(HF.length), o).catch(() => null);
    return r && r.ok ? r : f(u, o);
  };
}

async function model() {
  if (tts) return tts;
  loading ??= KokoroTTS.from_pretrained(REPO, {
    dtype: 'q8', device: 'wasm',
    progress_callback: (p) => { if (p?.status === 'progress' && p.total > 1e6) self.postMessage({ type: 'progress', loaded: p.loaded, total: p.total }); },
  });
  tts = await loading; self.postMessage({ type: 'ready' });
  return tts;
}

self.onmessage = async (e) => {
  const { id, type, text, voice, speed, local } = e.data || {};
  if (local) useLocal();
  try {
    const t = await model();
    if (type === 'warm') return;
    const out = await t.generate(text, { voice, speed });
    const pcm = out.audio;
    self.postMessage({ id, pcm, rate: out.sampling_rate }, [pcm.buffer]);
  } catch (err) {
    self.postMessage({ id, error: String(err?.message || err) });
  }
};
