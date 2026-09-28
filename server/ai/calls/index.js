// The registry of model calls (docs/gdd/04-ai-system.md §1). Each module carries the whole contract of 04 §14; the
// contract test (tests/ai-contract.test.js) runs over every entry, so a new call is covered the moment it is added.
import probe from './probe.js';
import interpret from './interpret.js';
import mind from './mind.js';
import narrate from './narrate.js';
import audience from './audience.js';
import council from './council.js';
import director from './director.js';

export const CALLS = { probe, interpret, mind, narrate, audience, council, director };
