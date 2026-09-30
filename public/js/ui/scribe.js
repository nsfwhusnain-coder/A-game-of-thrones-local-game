// The scribe, at the browser (WP Q1): what the lord wrote or said, put right before it becomes an order. The plain rules run here at once (they need no
// server and no model); when the game has a small model set up for it, the server's scribe mends the line further, and if that is slow or refuses, the
// line stands as the rules left it. Orders are never held up for more than a few seconds by a spelling.
import { app, api } from './common.js';
import { fixOrder, lexiconOf } from '../shared/scribe.js';

const WAIT_MS = 6000;
let model = null;

/** Does the server have a small model for the scribe? (asked once; Settings clears it) */
export async function scribeModel() {
  if (model === null) { try { model = !!(await api('/scribe')).model; } catch { model = false; } }
  return model;
}
export const forgetScribe = () => { model = null; };

/** The lord's words, mended. Never throws, never returns less than the rules made of them. */
export async function tidy(raw, { spoken = false } = {}) {
  const local = fixOrder(raw, { names: lexiconOf(app.state), spoken }).text;
  if (!local || !app.saveId || !(await scribeModel())) return local;
  try {
    const r = await Promise.race([api(`/games/${app.saveId}/scribe`, { body: { text: local, spoken } }), new Promise((_, no) => setTimeout(() => no(new Error('slow')), WAIT_MS))]);
    return String(r?.text || '').trim() || local;
  } catch { return local; }
}
