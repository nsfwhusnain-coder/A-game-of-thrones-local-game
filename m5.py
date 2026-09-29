import sys; sys.path.insert(0,'/tmp/claude-0/-home-user-A-game-of-thrones-local-game/1a59ec30-8b4e-5558-8c33-823b20aa5156/scratchpad')
from mut import run
T=['tests/leaks-r1-r3.test.js']
run('M4 observe counts every host as seen', 'public/js/engine/realm/estimate.js',
    "    if (seesParty(state, viewer, a, E)) { const o = at(a.owner);", "    if (true) { const o = at(a.owner);", T)
run('M1a leak live prosperity/unrest via estimateOf', 'public/js/engine/realm/estimate.js',
    "      default: cells[k] = gone;",
    "      default: cells[k] = (k === 'prosperity' || k === 'unrest') ? { v: ctx.figuresOf(subject)[k], mark: '~', via: 'rumour' } : gone;", T)
run('M2 own food *1', 'public/js/engine/realm/figures.js', "food: whole((Number(f.food?.v) || 0) * 10)", "food: whole((Number(f.food?.v) || 0) * 1)", T)
run('M6 observe stores the besieged status as a note (truth of unseen sieges)', 'public/js/engine/realm/estimate.js',
    "      note(R, id, { day: today, turn: t, via, v: { holdings: face.holdings,",
    "      note(R, id, { day: today, turn: t, via, v: { unrest: Math.round((ctx.held.get(id)||[]).filter(x=>x.status==='besieged').length), holdings: face.holdings,", T)
