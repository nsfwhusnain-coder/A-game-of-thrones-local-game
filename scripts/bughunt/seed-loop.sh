#!/bin/bash
# Plays the CI soak (scripts/soak.js) on many seeds for one house and prints the seeds that break an invariant.
# Usage: scripts/bughunt/seed-loop.sh [house] [first] [last]
cd "$(dirname "$0")/../.." || exit 1
house=${1:-stark}; first=${2:-1}; last=${3:-60}
for s in $(seq "$first" "$last"); do
  out=$(WC_PROVIDER=mock node scripts/soak.js --turns 8 --houses "$house" --seed "$s" --quiet 2>&1)
  if [ $? -ne 0 ]; then echo "SEED $s FAILED"; echo "$out" | head -8; fi
done
echo done
