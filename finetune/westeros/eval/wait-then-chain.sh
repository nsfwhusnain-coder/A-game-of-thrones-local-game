#!/bin/bash
# usage: wait-then-chain.sh <chain.json>  — starts the chain only after the previous one finished cleanly (never after a guard trip)
cd /c/wc-ai/eval
while true; do
  st=$(node -e "const j=JSON.parse(require('fs').readFileSync('C:/wc-ai/logs/chain-state.json','utf8'));console.log(j.finished?(j.tripped?'tripped':'done'):'running')")
  [ "$st" = "done" ] && break
  [ "$st" = "tripped" ] && { echo "previous chain tripped the guard; not starting $1"; exit 3; }
  sleep 30
done
sleep 10
node chain.mjs "$1"
