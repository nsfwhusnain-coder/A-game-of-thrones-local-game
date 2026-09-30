// The scribe at the server (docs/local-ai/SCRIBE.md): the plain rules first (they need no model and are the floor), then — only if config names a
// server for it ("models": { "scribe": { "baseUrl": … } }) — the small model on the CPU, whose mending is kept only if it passes the call's checks.
// The names the rules may put a word right toward are those of the state the browser is sent (the player's view), never the whole world's.
import { runCall } from './ai/client.js';
import { loadConfig } from './llm.js';
import { fixOrder, lexiconOf } from '../public/js/shared/scribe.js';

/** Is a small model set up for the scribe? (Never on the mock provider: the mock's answer is the rules' own.) */
export const scribeOn = (cfg = loadConfig()) => cfg.provider !== 'mock' && !!cfg.models?.scribe?.baseUrl;

/**
 * `view` is the state as the player's browser holds it (playerView), `text` what the lord wrote or said. Returns { text, via, changed }:
 * `via` is 'rules' (spelling by rule alone) or 'model' (the small model mended it and the checks held).
 */
export async function scribe(view, text, { spoken = false, cfg = loadConfig(), log = null } = {}) {
  const raw = String(text ?? '').slice(0, 600);
  const rules = fixOrder(raw, { names: lexiconOf(view), spoken });
  if (!rules.text) return { text: '', via: 'rules', changed: false };
  if (!scribeOn(cfg)) return { text: rules.text, via: 'rules', changed: rules.changed };
  const r = await runCall('scribe', view, { text: rules.text, spoken }, { cfg, log });
  const mended = r.via === 'model' && r.value?.text ? String(r.value.text).trim() : '';
  // the model's line goes through the rules once more: its capitals and its stops are the game's own
  const out = mended ? fixOrder(mended, { names: lexiconOf(view), spoken: false }).text : rules.text;
  return { text: out, via: mended ? 'model' : 'rules', changed: out !== raw.trim(), ms: r.ms };
}
