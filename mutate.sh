#!/bin/bash
# usage: mutate.sh <file> <python-expr old> <new> — apply to a fresh copy of the source file, run labels test, print failures
S=/tmp/claude-0/-home-user-A-game-of-thrones-local-game/1a59ec30-8b4e-5558-8c33-823b20aa5156/scratchpad
F=$1; OLD=$2; NEW=$3
cp /home/user/wc-s1/$F $S/mut/$F.orig
python3 - "$S/mut/$F" "$OLD" "$NEW" <<'PY'
import sys
p,old,new=sys.argv[1:4]
s=open(p).read()
assert s.count(old)>=1, 'mutation target not found: '+old
open(p,'w').write(s.replace(old,new,1))
PY
(cd $S/mut && WC_PROVIDER=mock node --test tests/labels.test.js 2>&1 | grep -E "^not ok|# fail" | head -6)
cp $S/mut/$F.orig $S/mut/$F; rm $S/mut/$F.orig
