// A throwaway label.js, only to check that the label tests can be satisfied. Not the builder's; outside the repo.
const ONES = ['none', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen'];
const TENS = ['', '', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety'];
export function houseLabel(state, id) {
  const h = state.houses?.[id];
  if (!h) return String(id || 'a house').replace(/_/g, ' ');
  const n = h.name.replace(/^The /, '');
  if (['order', 'tribe', 'company', 'city_state'].includes(h.rank)) return h.rank === 'city_state' ? n : `the ${n}`;
  if (h.rank === 'crown') return 'the Crown';
  return `House ${n.replace(/ of .+$/, '').replace(/^Nymeros /, '')}`;
}
export function who(state, id) {
  const c = state.characters?.[id]; if (!c) return String(id || 'someone').replace(/_/g, ' ');
  const m = c.name.match(/^(.*?)\s*"([^"]+)"\s*(.*)$/); if (!m) return c.name;
  return state.houses?.[c.house]?.lord === c.id ? `Lord ${m[3]}` : `${m[2]} ${m[3]}`;
}
export function partyLabel(state, p) {
  if (!p) return '';
  const short = houseLabel(state, p.owner).replace(/^House /, '').replace(/^the /, '');
  if (p.kind === 'host' && /^(The )?(Banners of|Host of (House )?)/.test(p.name || '')) return /^The Host of Mance/.test(p.name) ? 'the Free Folk host' : `the ${short} host`;
  return `the ${String(p.name || short).replace(/^The /i, '')}`;
}
export function roughly(n) {
  if (typeof n !== 'number' || !Number.isFinite(n) || n < 0) return '';
  n = Math.round(n); if (n === 0) return 'none';
  if (n < 20) return ONES[n];
  if (n < 100) { const t = Math.round(n / 10); return t >= 10 ? 'some a hundred' : `some ${TENS[t]}`; }
  if (n < 1000) { const k = Math.round(n / 100); return k >= 10 ? 'about a thousand' : `some ${ONES[k]} hundred`; }
  if (n < 20000) { const K = Math.round(n / 1000); const e = (n - K * 1000) / (K * 1000); const w = K === 1 ? 'a' : ONES[K]; return `${e <= -0.01 ? 'nearly' : e <= 0.03 ? 'about' : 'some'} ${w} thousand`; }
  const K = Math.round(n / 10000); return K >= 10 ? 'some a hundred thousand' : `some ${TENS[K] || ONES[K * 10]} thousand`;
}
export function list(names) {
  const a = (names || []).filter(Boolean);
  if (a.length < 2) return a[0] || '';
  if (a.length >= 5) return `${ONES[a.length] || 'many'} of them, ${a[0]} and ${a[1]} first`;
  return `${a.slice(0, -1).join(', ')} and ${a.at(-1)}`;
}
