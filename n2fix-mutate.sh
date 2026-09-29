#!/bin/bash
# n2fix-mutate.sh <file> <old> <new>: mutate one file of the private copy, run the labels test there, restore
S=/tmp/claude-0/-home-user-A-game-of-thrones-local-game/1a59ec30-8b4e-5558-8c33-823b20aa5156/scratchpad; D=$S/n2fix-mutants
F=$1
python3 - "$D/$F" "$2" "$3" <<'PY'
import sys
p,old,new=sys.argv[1:4]
s=open(p).read()
assert s.count(old)>=1, 'mutation target not found: '+old
open(p,'w').write(s.replace(old,new,1))
PY
[ $? -eq 0 ] && (cd $D && WC_PROVIDER=mock node --test tests/labels.test.js 2>&1 | grep -E "^not ok|# fail" | head -8)
cp /home/user/wc-s1/$F $D/$F
