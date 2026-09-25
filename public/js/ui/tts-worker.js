// Neural voices (Kokoro-82M) running in a worker, so speaking never stalls the map.
// The model comes from public/models/ when `npm run fetch-voices` has put it there, otherwise from
// Hugging Face once (the browser caches it).
//
// A voice may be a blend — "bm_george*0.7+am_fenrir*0.3" — so that every character can have a timbre of
// their own from Kokoro's few English voices. The blend is mixed from the voices' style vectors, the same
// way Kokoro's own tools mix them.
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

// ── blended voices ──
const styles = new Map(); // voice name -> Float32Array (510 x 256)
async function styleOf(name) {
  if (!styles.has(name)) styles.set(name, fetch(`${HF}voices/${name}.bin`).then((r) => { if (!r.ok) throw new Error(`voice ${name} not found`); return r.arrayBuffer(); }).then((b) => new Float32Array(b)));
  return styles.get(name);
}
function parseBlend(spec) {
  const parts = String(spec).split('+').map((x) => { const [n, w] = x.trim().split('*'); return [n.trim(), w === undefined ? 1 : Number(w)]; }).filter(([n, w]) => n && w > 0);
  const total = parts.reduce((a, [, w]) => a + w, 0) || 1;
  return parts.map(([n, w]) => [n, w / total]);
}
let blendNow = null; // the blend for the generation in progress (generations are serialised below)
function teach(t) {
  // generate() tokenises, then calls this.generate_from_ids(): replace that step so the style comes from the blend
  const plain = t.generate_from_ids.bind(t);
  t.generate_from_ids = async function (ids, { voice, speed = 1 } = {}) {
    if (!blendNow || blendNow.length < 2) return plain(ids, { voice, speed });
    const row = 256 * Math.min(Math.max(ids.dims.at(-1) - 2, 0), 509);
    const mix = new Float32Array(256);
    for (const [name, w] of blendNow) { const st = await styleOf(name); for (let i = 0; i < 256; i++) mix[i] += st[row + i] * w; }
    const Tensor = ids.constructor; // the library's tensor class, taken from the ids it hands us
    const { waveform } = await this.model({ input_ids: ids, style: new Tensor('float32', mix, [1, 256]), speed: new Tensor('float32', [speed], [1]) });
    return { audio: waveform.data, sampling_rate: 24000 };
  };
}

async function model() {
  if (tts) return tts;
  loading ??= KokoroTTS.from_pretrained(REPO, {
    dtype: 'q8', device: 'wasm',
    progress_callback: (p) => { if (p?.status === 'progress' && p.total > 1e6) self.postMessage({ type: 'progress', loaded: p.loaded, total: p.total }); },
  });
  tts = await loading; teach(tts); self.postMessage({ type: 'ready' });
  return tts;
}

// one generation at a time: the runtime is single-threaded anyway, and the blend must not change mid-way
let queue = Promise.resolve();
self.onmessage = (e) => {
  const { id, type, text, voice, speed, local } = e.data || {};
  if (local) useLocal();
  queue = queue.then(async () => {
    try {
      const t = await model();
      if (type === 'warm') return;
      const blend = parseBlend(voice || 'bm_george');
      blendNow = blend;
      const out = await t.generate(text, { voice: blend[0][0], speed });
      blendNow = null;
      const pcm = out.audio;
      self.postMessage({ id, pcm, rate: out.sampling_rate }, [pcm.buffer]);
    } catch (err) {
      blendNow = null;
      self.postMessage({ id, error: String(err?.message || err) });
    }
  });
};
