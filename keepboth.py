# Resolve additive merge conflicts by keeping both sides: ours first, then theirs (or theirs first with --theirs-first).
import re, sys
first_theirs = '--theirs-first' in sys.argv
for p in [a for a in sys.argv[1:] if not a.startswith('--')]:
    s = open(p).read()
    pat = re.compile(r'<<<<<<< [^\n]*\n(.*?)=======\n(.*?)>>>>>>> [^\n]*\n', re.S)
    n = len(pat.findall(s))
    s = pat.sub(lambda m: (m.group(2) + m.group(1)) if first_theirs else (m.group(1) + m.group(2)), s)
    open(p, 'w').write(s)
    print(p, 'blocks resolved:', n, 'markers left:', s.count('<<<<<<<') + s.count('>>>>>>>'))
