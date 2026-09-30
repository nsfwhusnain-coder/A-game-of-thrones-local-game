// Owner tool (never in CI): does the scribe's small model do its one job? Puts a dozen slips of spelling and a few dictated lines through the
// game's own scribe (the plain rules, then the model config.json names under "models": { "scribe": { "baseUrl": … } }) and prints what each did
// and how long the model took. With no scribe model set up it shows the rules alone.
//
//   node scripts/scribe-check.js            (WC_CONFIG=<file> to use another config; WC_PROVIDER is ignored: the mock has no model)
import { createInitialState } from '../public/js/shared/world.js';
import { playerView } from '../server/view.js';
import { scribe, scribeOn } from '../server/scribe.js';
import { loadConfig } from '../server/llm.js';
import { fixOrder, lexiconOf } from '../public/js/shared/scribe.js';

const WRITTEN = [
  'send rodrick to winterfel with fifty mne',
  'call the banaers of the north to winterfell',
  'ser rodrik should march to moat calin and hold the gate untill i say otherwise',
  'raise 200 archers at the dreadfort',
  'i wnat to hold a feast at winterfell adn invite the lords',
  'send a raven to lord tywin sayng we will not pay the tribute',
  'hire five hundred sellswords wiht gold from the treasury',
  'Send Ser Rodrik to hold the Stony Shore.',
  'marry my daughter to the arryn boy if he will take the north as her dowry',
  'seize the granary at white harbor and share the grain with the smallfolk',
  'build a bridge at the crossing teh maesters spoke of',
  'what is the state of our garrison',
];
const SPOKEN = [
  'um send jory cassel to the wall with uh twenty men',
  'call the banners of the north to winterfell you know all of them',
  'i want to uh hold a tourney no a feast at winterfell',
];

const cfg = { ...loadConfig(), provider: 'openai' };
const view = playerView(createInitialState('agot_298', 'stark', { seed: 298 }));
const names = lexiconOf(view);
console.log(scribeOn(cfg) ? `scribe model: ${cfg.models.scribe.baseUrl}` : 'no scribe model set up ("models": { "scribe": { "baseUrl": … } }): the rules alone\n');
let model = 0, total = 0, ms = 0;
for (const [lines, spoken] of [[WRITTEN, false], [SPOKEN, true]]) {
  for (const line of lines) {
    const t0 = Date.now(); const r = await scribe(view, line, { spoken, cfg }); const took = Date.now() - t0;
    total++; if (r.via === 'model') { model++; ms += took; }
    console.log(`${spoken ? 'said   ' : 'wrote  '} ${line}\n  rules  ${fixOrder(line, { names, spoken }).text}\n  ${r.via.padEnd(6)} ${r.text}${r.via === 'model' ? `   (${took} ms)` : ''}\n`);
  }
}
if (scribeOn(cfg)) console.log(`the model's mending stood for ${model} of ${total} lines${model ? `, ${Math.round(ms / model)} ms a line on average` : ''}`);
