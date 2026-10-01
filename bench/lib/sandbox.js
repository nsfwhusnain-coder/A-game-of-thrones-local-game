// A game to play in, away from the player's own: a scratch copy of the server with its own saves directory and its own config, so a bench, a playtest or a coherence run never touches the owner's saves or config.json
// (docs/gdd/15-qa-tooling.md §8). The public/ folder is linked, not copied: the engine the run plays is the engine in the checkout.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url'; // a path on Windows is not a URL: import() wants the file URL

/**
 * `{ game, work, dispose }`: `game` is the scratch copy's server/game.js. `config` is what goes in its config.json: an object, or null for the checkout's own config.json
 * (the model the owner has set up), or `{}` for the defaults. WC_PROVIDER, when set, still wins (llm.js), which is how a test plays on the mock.
 */
export async function sandbox({ root, config = null, prefix = 'wc-sandbox-' } = {}) {
  const work = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  fs.cpSync(path.join(root, 'server'), path.join(work, 'server'), { recursive: true });
  fs.symlinkSync(path.join(root, 'public'), path.join(work, 'public'), 'junction'); // a junction: Windows needs no admin rights for it
  fs.mkdirSync(path.join(work, 'saves'));
  const own = (() => { try { return JSON.parse(fs.readFileSync(path.join(root, 'config.json'), 'utf8')); } catch { return {}; } })();
  fs.writeFileSync(path.join(work, 'config.json'), JSON.stringify(config ?? own, null, 2));
  const game = await import(pathToFileURL(path.join(work, 'server', 'game.js')).href);
  const dispose = () => {
    try { fs.unlinkSync(path.join(work, 'public')); } catch { try { fs.rmdirSync(path.join(work, 'public')); } catch { /* already gone */ } } // the link, never what it points at
    try { fs.rmSync(work, { recursive: true, force: true }); } catch { /* the OS will clear a temp directory */ }
  };
  return { game, work, dispose, saves: game.SAVES }; // (where the game keeps its saves: the scratch directory's own, unless WC_SAVES says otherwise)
}
