import sys; sys.path.insert(0,'/tmp/claude-0/-home-user-A-game-of-thrones-local-game/1a59ec30-8b4e-5558-8c33-823b20aa5156/scratchpad')
from mut import run
run('M1a leak live prosperity/unrest of non-friend houses', 'public/js/engine/realm/estimate.js',
    "      default: cells[k] = gone;",
    "      default: cells[k] = (k === 'prosperity' || k === 'unrest') ? { v: ctx.figuresOf(subject)[k], mark: '~', via: 'rumour' } : gone;",
    ['tests/realm-view.test.js','tests/realm-stats.test.js'])
run('M2 own food in moons not tenths (figuresOf)', 'public/js/engine/realm/figures.js',
    "food: whole((Number(f.food?.v) || 0) * 10)", "food: whole((Number(f.food?.v) || 0) * 1)",
    ['tests/realm-view.test.js','tests/realm-stats.test.js'])
