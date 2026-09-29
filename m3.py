import sys; sys.path.insert(0,'/tmp/claude-0/-home-user-A-game-of-thrones-local-game/1a59ec30-8b4e-5558-8c33-823b20aa5156/scratchpad')
from mut import run
run('M3 one dice draw at creation call site', 'public/js/shared/world.js',
    "  sampleRealm(state); // the first row",
    "  random(); sampleRealm(state); // the first row",
    ['tests/realm-view.test.js','tests/realm-stats.test.js','tests/replay.test.js','tests/knowledge.test.js'])
run('M3b one dice draw per turn at the advance call site', 'server/game.js',
    "  record.realm = sampleRealm(state);",
    "  withRng(state, () => random()); record.realm = sampleRealm(state);",
    ['tests/realm-stats.test.js','tests/replay.test.js'])
