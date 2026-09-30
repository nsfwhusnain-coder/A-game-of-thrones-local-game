p = 'C:/wc-ai/finetune/gen/build_interpret.mjs'
s = open(p, encoding='utf-8').read()

# place names read mid-sentence: "the Shadow Tower"
s = s.replace("const placeForms = (E, h) => [plain(h.name)];", "const pl = (h) => plain(h.name).replace(/^The /, 'the ');\nconst placeForms = (E, h) => [pl(h)];")
s = s.replace("const L = plain(seat.name); const n = pick([500, 1000", "const L = pl(seat); const n = pick([500, 1000")
s = s.replace("t: `Raise the levies at ${L} and march them to ${plain(dest.name)}.`", "t: `Raise the levies at ${L} and march them to ${pl(dest)}.`")
s = s.replace("const L = plain(place.name); const forms = [{ t: `Call the banners", "const L = pl(place); const forms = [{ t: `Call the banners")
s = s.replace("const [t, v] = countOf(n); const L = plain(seat.name);\n  const forms = [{ t: `Hire", "const [t, v] = countOf(n); const L = pl(seat);\n  const forms = [{ t: `Hire")
s = s.replace("const w = pick(WORKS[key]); const L = plain(seat.name);", "const w = pick(WORKS[key]); const L = pl(seat);")
s = s.replace("`Send someone to ${plain(place.name)}.`, `Someone must go to ${plain(place.name)}.`", "`Send someone to ${pl(place)}.`, `Someone must go to ${pl(place)}.`")
s = s.replace("question: `Who should go to ${plain(place.name)}?`", "question: `Who should go to ${plain(place.name)}?`")
s = s.replace("`March the host to ${plain(place.name)}.`, `Take the host to ${plain(place.name)}.`", "`March the host to ${pl(place)}.`, `Take the host to ${pl(place)}.`")

# hosts read as "the Host of X"
s = s.replace("const hostForms = (E, p) => { const nm = plain(p.name); const l = nm.replace(/^The /, 'the '); const f = [nm.replace(/^The /, 'the '), l];",
              "const hostForms = (E, p) => { const nm = plain(p.name); const l = /^the /i.test(nm) ? nm.replace(/^The /, 'the ') : `the ${nm}`; const f = [l, l];")

# only count nouns the game's own check accepts
s = s.replace("MEN_NOUNS, GO_VERBS } from './phrasing.mjs';", "GO_VERBS } from './phrasing.mjs';\nconst MEN_NOUNS = ['men', 'men', 'spears', 'swords', 'riders', 'men-at-arms', 'knights', 'soldiers', 'guards'];")

# dress(): leads that keep proper names intact
old_start = s.index("function dress(text, multi) {")
old_end = s.index("function combine(E) {")
new_dress = """const IMPER = new Set(['Send', 'Dispatch', 'Have', 'Order', 'March', 'Take', 'Raise', 'Levy', 'Call', 'Summon', 'Muster', 'Hire', 'Recruit', 'Enlist', 'Build', 'Fund', 'Lay', 'Fill', 'Expand', 'Strengthen', 'Repair', 'Charter', 'Found', 'Train', 'Endow', 'Deepen', 'Open', 'Dig', 'Lower', 'Ease', 'Restore', 'Return', 'Crush', 'Tax', 'Declare', 'Plant', 'Put', 'Set', 'Learn', 'Find', 'Make', 'Name', 'Halt', 'Hold', 'Disband', 'Free', 'Ransom', 'Release', 'Execute', 'Hang', 'Write', 'Sail', 'Move', 'Let', 'Throw', 'Give', 'Squeeze', 'Tell', 'Sell', 'Hire', 'Levy']);
const firstWord = (t) => t.split(/\\s+/)[0].replace(/[^A-Za-z]/g, '');
function dress(text, multi) {
  let t = text.trim();
  if (!multi && chance(0.35)) {
    const soft = ['Now, ', 'Then ', 'Also, ', 'And ', 'First, ']; const hard = ['At once: ', 'Very well. ', 'My decision: ', 'Hear me: '];
    if (IMPER.has(firstWord(t))) { const lead = pick([...soft, ...hard]); t = lead + (soft.includes(lead) ? low(t) : t); } else t = pick(hard) + t;
  }
  if (!multi && chance(0.25)) t += pick(TAIL);
  return t.replace(/\\s+/g, ' ').trim();
}
"""
s = s[:old_start] + new_dress + s[old_end:]

# combine(): lowercase only imperatives after a joiner
s = s.replace("text += j + (j.startsWith('.') ? cap(body) : low(body)); }", "const soft = /(Then|Also|And) $|^,? ?(and|then) $/.test(j) || j === ' and ' || j === ', and ' || j === ', then '; text += j + (soft && IMPER.has(firstWord(body)) ? low(body) : cap(body)); }")
open(p, 'w', encoding='utf-8').write(s)
print('patched')
