// The family tree (docs/gdd/17-ui-declutter.md §4 U9; 12 §15.2): who is whose, generation by generation, with the lines between them. `treeOf` is the data, pure,
// so node can hold it to what the tree showed before U9 (grandparents, parents, the person, spouse and siblings, children, grandchildren: none of them is ever lost)
// and to the state (a person is in it only if the state says so); `treeHtml` is the markup, and ui/windows.js draws the lines over it. "Wider family" adds the
// uncles and aunts and their children, in a lighter hand, and changes nothing else.
import { childrenOf, siblingsOf } from '../shared/world.js';

// a first name to write under a portrait: not "Ser" or "Lady"
const firstName = (name) => { const w = String(name || '').split(/\s+/); while (w.length > 1 && /^(Ser|Lord|Lady|King|Queen|Prince|Princess|Maester|Septon|Septa|Archmaester|High|Old|Grand)$/i.test(w[0])) w.shift(); return w[0]; };
const dedupe = (xs) => { const seen = new Set(); return xs.filter((x) => x && !seen.has(x.id) && seen.add(x.id)); };

/**
 * `{ id, name, rows: [{ key, label, members: [{ id, name, first, role, alive, house, self?, wider? }] }], links: [{ from, to }], couples: [[a, b]] }` for a person, top generation
 * first; empty rows are left out. `links` run from a parent to a child, both in the tree; `couples` are the pairs joined side by side.
 */
export function treeOf(s, id, { wider = false } = {}) {
  const c = s.characters?.[id]; if (!c) return null;
  const ch = (x) => (x ? s.characters[x] : null);
  const f = ch(c.father), m = ch(c.mother);
  const gp = [f?.father, f?.mother, m?.father, m?.mother].map(ch).filter(Boolean);
  const sibs = siblingsOf(s, id); const kids = childrenOf(s, id); const spouse = ch(c.spouse);
  const grand = kids.flatMap((k) => childrenOf(s, k.id));
  const uncles = wider ? dedupe([f, m].filter(Boolean).flatMap((p) => siblingsOf(s, p.id)).filter((u) => u.id !== id)) : [];
  const cousins = wider ? dedupe(uncles.flatMap((u) => childrenOf(s, u.id)).filter((x) => x.id !== id && !sibs.some((b) => b.id === x.id))) : [];
  const mem = (x, role, extra = {}) => ({ id: x.id, name: x.name, first: firstName(x.name), role, alive: !!x.alive, house: x.house, ...extra });
  const rows = [
    { key: 'grand', label: 'Grandparents', members: gp.map((x) => mem(x, 'Grandparent')) },
    { key: 'parents', label: 'Parents', members: [...[f, m].filter(Boolean).map((x) => mem(x, x === f ? 'Father' : 'Mother')), ...uncles.map((u) => mem(u, u.sex === 'f' ? 'Aunt' : 'Uncle', { wider: true }))] },
    { key: 'self', label: 'Their own generation', members: [mem(c, 'Self', { self: true }), ...(spouse ? [mem(spouse, 'Spouse')] : []), ...sibs.map((x) => mem(x, 'Sibling')), ...cousins.map((x) => mem(x, 'Cousin', { wider: true }))] },
    { key: 'kids', label: 'Children', members: kids.map((x) => mem(x, 'Child')) },
    { key: 'grandkids', label: 'Grandchildren', members: grand.map((x) => mem(x, 'Grandchild')) },
  ].filter((r) => r.members.length);
  const inTree = new Set(rows.flatMap((r) => r.members.map((x) => x.id)));
  const links = [];
  for (const r of rows) for (const x of r.members) { const p = s.characters[x.id]; for (const par of [p.father, p.mother]) if (par && inTree.has(par)) links.push({ from: par, to: x.id }); }
  const couples = [];
  const pair = (a, b) => { if (a && b && inTree.has(a.id) && inTree.has(b.id)) couples.push([a.id, b.id]); };
  pair(c, spouse); pair(f, m); pair(ch(f?.father), ch(f?.mother)); pair(ch(m?.father), ch(m?.mother));
  return { id, name: c.name, rows, links, couples, wider };
}

const hasWider = (m) => m.rows.some((r) => r.members.some((x) => x.wider));
/** The people a tree shows (ids), a flat list: what a test compares. */
export const membersOf = (model) => model.rows.flatMap((r) => r.members.map((x) => x.id));

/**
 * The tree as markup: a row a generation, a card each (portrait, first name, role; ✝ for the dead), `data-tid` for the lines to find them by, and "Wider family" as a
 * switch that is on when it is. `env`: `{ esc, por(id) → url }`.
 */
export function treeHtml(model, env, { canWiden = true } = {}) {
  const { esc } = env;
  const card = (x) => `<button class="m tm${x.self ? ' self' : ''}${x.wider ? ' wider' : ''}${x.alive ? '' : ' dead'}" data-char="${esc(x.id)}" data-tid="${esc(x.id)}" title="${esc(x.name)}${x.alive ? '' : ' (dead)'}"><img src="${esc(env.por(x.id))}" alt=""><span class="rl">${esc(x.role)}</span><span class="nm">${esc(x.first)}${x.alive ? '' : ' ✝'}</span></button>`;
  return `<div class="tree-tools">${canWiden ? `<label class="tree-wider"><input type="checkbox" data-tree-wider="${esc(model.id)}"${model.wider ? ' checked' : ''}> Wider family</label>` : ''}<span class="muted tree-hint">Click anyone to open them. ${hasWider(model) || !model.wider ? '' : 'No uncles, aunts or cousins are known.'}</span></div>
    <div class="tree tree-v2" id="tree" data-tree-of="${esc(model.id)}">${model.rows.map((r) => `<div class="gen" data-gen="${r.key}" role="group" aria-label="${esc(r.label)}">${r.members.map(card).join('')}</div>`).join('')}<svg class="tree-links" aria-hidden="true"></svg></div>`;
}
