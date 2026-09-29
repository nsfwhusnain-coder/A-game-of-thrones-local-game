const VOID = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'source', 'track', 'wbr']);
function parseHtml(html) {
  const root = { tag: '#root', attrs: {}, children: [], parent: null, from: 0, to: html.length };
  const all = []; let cur = root;
  const re = /<!--[\s\S]*?-->|<(\/?)([a-zA-Z][\w:-]*)((?:"[^"]*"|'[^']*'|[^'">])*)>/g; let m;
  while ((m = re.exec(html))) {
    if (m[0].startsWith('<!--')) continue;
    const [whole, closing, rawTag, rawAttrs] = m; const tag = rawTag.toLowerCase();
    if (closing) {
      let n = cur; while (n && n.tag !== tag) n = n.parent;
      if (n && n !== root) { n.to = m.index; cur = n.parent; }
      continue;
    }
    const attrs = {};
    for (const a of rawAttrs.matchAll(/([^\s=\/]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+)))?/g)) attrs[a[1].toLowerCase()] = a[2] ?? a[3] ?? a[4] ?? '';
    const node = { tag, attrs, children: [], parent: cur, from: m.index + whole.length, to: m.index + whole.length, outer: m.index };
    cur.children.push(node); all.push(node);
    const selfClosed = /\/\s*$/.test(rawAttrs) || VOID.has(tag);
    if (selfClosed) continue;
    if (tag === 'script' || tag === 'style') { const end = html.indexOf(`</${tag}>`, re.lastIndex); node.to = end < 0 ? html.length : end; re.lastIndex = end < 0 ? html.length : end + tag.length + 3; continue; }
    cur = node;
  }
  const decode = (t) => t.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&nbsp;/g, ' ');
  const textOf = (n) => decode(html.slice(n.from, n.to).replace(/<!--[\s\S]*?-->/g, '').replace(/<[^>]*>/g, ' ')).replace(/\s+/g, ' ').trim();
  const byId = (id) => all.find((n) => n.attrs.id === id) || null;
  const classes = (n) => (n.attrs.class || '').split(/\s+/).filter(Boolean);
  const inside = (n, anc) => { for (let p = n.parent; p; p = p.parent) if (p === anc) return true; return false; };
  const under = (n) => { const out = []; const walk = (x) => { for (const c of x.children) { out.push(c); walk(c); } }; walk(n); return out; };
  return { root, all, byId, classes, inside, under, textOf, html };
}

export { parseHtml };