// Speaking an order (WP Q1): the microphone button records what the lord says, the ears (ears-worker.js, a small speech model on the CPU, in this
// page) write it down, and the scribe puts it right; the words land in the order box for the lord to read and send with the quill. Nothing is sent
// anywhere: the sound never leaves the page, and is dropped as soon as it has been written down.
//
//   const ears = makeEars({ onState(state, text), onText(text), onError(message) })
//   ears.toggle()     start listening, or — when listening — stop and write it down
//   states: 'idle' | 'listening' | 'writing'
const RATE = 16000;
const MAX_SECONDS = 60;

export const canListen = () => !!(navigator.mediaDevices?.getUserMedia && window.MediaRecorder && (window.AudioContext || window.webkitAudioContext));

/** The recording as the ears want it: mono samples at 16 kHz. */
async function samplesOf(blob) {
  const Ctx = window.AudioContext || window.webkitAudioContext; const ctx = new Ctx();
  try {
    const buf = await ctx.decodeAudioData(await blob.arrayBuffer());
    const off = new OfflineAudioContext(1, Math.max(1, Math.ceil(buf.duration * RATE)), RATE);
    const src = off.createBufferSource(); src.buffer = buf; src.connect(off.destination); src.start();
    return (await off.startRendering()).getChannelData(0);
  } finally { ctx.close?.(); }
}

export function makeEars({ onState = () => {}, onText = () => {}, onError = () => {} } = {}) {
  let worker = null, rec = null, stream = null, chunks = [], stopTimer = null, state = 'idle', seq = 0;
  const set = (s, text = '') => { state = s; onState(s, text); };
  const ear = () => {
    if (worker) return worker;
    worker = new Worker('/js/ui/ears-worker.js', { type: 'module' });
    worker.onmessage = ({ data }) => {
      if (data.type === 'status') { if (state === 'writing') onState('writing', data.text); }
      else if (data.type === 'text') { set('idle'); onText(data.text); }
      else if (data.type === 'error') { set('idle'); onError(`The ears could not write that down: ${data.message}`); }
    };
    worker.onerror = (e) => { worker = null; set('idle'); onError(`The listening model could not start: ${e.message || 'the page could not load it'}`); };
    return worker;
  };
  const release = () => { clearTimeout(stopTimer); stream?.getTracks().forEach((t) => t.stop()); stream = null; };

  async function start() {
    try { stream = await navigator.mediaDevices.getUserMedia({ audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true } }); }
    catch { onError('The browser would not let the game hear you: allow the microphone for this page, and try again.'); return; }
    chunks = []; rec = new MediaRecorder(stream);
    rec.ondataavailable = (e) => { if (e.data?.size) chunks.push(e.data); };
    rec.onstop = async () => {
      const blob = new Blob(chunks, { type: rec.mimeType || 'audio/webm' }); chunks = []; release();
      if (blob.size < 800) { set('idle'); onError('Nothing was heard. Press the microphone, speak, and press it again.'); return; }
      set('writing', 'Writing it down…');
      try { const audio = await samplesOf(blob); ear().postMessage({ type: 'transcribe', id: ++seq, audio }, [audio.buffer]); }
      catch (e) { set('idle'); onError(`The recording could not be read: ${e.message}`); }
    };
    rec.start(); set('listening'); stopTimer = setTimeout(() => stop(), MAX_SECONDS * 1000);
  }
  function stop() { if (rec && rec.state !== 'inactive') rec.stop(); else { release(); set('idle'); } }

  return {
    get state() { return state; },
    toggle() { if (state === 'listening') stop(); else if (state === 'idle') return start(); },
    cancel() { if (rec && rec.state !== 'inactive') { rec.onstop = null; rec.stop(); } release(); chunks = []; set('idle'); },
  };
}
