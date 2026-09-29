#!/bin/bash
# wait until no other test run / browser / screenshot job has been alive for 20 s in a row, then run the gate once
S=/tmp/claude-0/-home-user-A-game-of-thrones-local-game/1a59ec30-8b4e-5558-8c33-823b20aa5156/scratchpad
OUT=$S/${1:-gate-before}.txt; shift
quiet=0
for i in $(seq 1 360); do
  if pgrep -f "node --test" >/dev/null || pgrep -f "chrome-headless" >/dev/null || pgrep -f "scripts/screens.js" >/dev/null || pgrep -f "check-syntax" >/dev/null; then quiet=0; else quiet=$((quiet+1)); fi
  [ $quiet -ge 2 ] && break
  sleep 5
done
echo "starting at $(date +%T)" > $OUT
cd /home/user/wc-s5
export PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers
UI_GATE_PORT=3496 timeout 1500 node scripts/ui-gate.mjs "$@" >> $OUT 2>&1
echo "exit=$?" >> $OUT
