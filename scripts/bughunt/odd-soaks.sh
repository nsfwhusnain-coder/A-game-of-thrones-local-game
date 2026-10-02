#!/bin/bash
# The odd houses (a city, a company, a tribe, the Wall), 14 turns of 30 days each, one after the other.
cd "$(dirname "$0")/../.." || exit 1
i=0
for h in nights_watch free_folk dothraki braavos golden_company second_sons stone_crows thenns pentos volantis; do
  i=$((i+1)); node scripts/bughunt/sweep-soak.mjs "$h" $((200+i)) 14 30d 2>&1 | tail -1 | cut -c1-240
done
echo done
