import sys; sys.path.insert(0,'/tmp/claude-0/-home-user-A-game-of-thrones-local-game/1a59ec30-8b4e-5558-8c33-823b20aa5156/scratchpad')
from mut import run
run('M3b one dice draw per turn at the advance call site', 'server/game.js',
    "  record.realm = sampleRealm(state);",
    "  random(); record.realm = sampleRealm(state);",
    ['tests/realm-stats.test.js','tests/replay.test.js','tests/jump.test.js'])
