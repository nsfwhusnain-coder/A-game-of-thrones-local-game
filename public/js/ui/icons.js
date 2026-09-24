// A small heraldic icon set (24×24, stroked in the current colour) that replaces emoji everywhere in the UI.
// Emoji render differently on every system; these are drawn once, in the game's own hand.
const P = {
  coin: '<circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="5"/><path d="M12 9.5v5M10.5 12h3"/>',
  scales: '<path d="M12 4v15M8 20h8M5 7h14M12 4l-1.2 1.6h2.4z"/><path d="M5 7l-2.6 6.2h5.2zM19 7l-2.6 6.2h5.2z"/><path d="M2.4 13.2a2.6 1.6 0 0 0 5.2 0M16.4 13.2a2.6 1.6 0 0 0 5.2 0"/>',
  swords: '<path d="M4 4l10.5 10.5M20 4L9.5 14.5"/><path d="M12.5 16.5l4-4M7.5 12.5l4 4"/><path d="M15.2 15.2l3.8 3.8M8.8 15.2L5 19"/><circle cx="19.6" cy="19.6" r="0.9"/><circle cx="4.4" cy="19.6" r="0.9"/>',
  shield: '<path d="M12 3l7.5 2.8v5.4c0 5-3.4 8.4-7.5 9.8-4.1-1.4-7.5-4.8-7.5-9.8V5.8z"/><path d="M12 3v18M4.5 10.5h15"/>',
  ship: '<path d="M3 15.5h18l-2.8 4.5H5.8z"/><path d="M12 3v12.5"/><path d="M12 4.5c3.5 2 5 5 5.2 9H12M12 5.5c-2.6 1.8-4 4.4-4.3 8H12"/><path d="M12 3l3 1.2-3 1.2"/>',
  wheat: '<path d="M12 21V5"/><path d="M12 9c-2.6-.2-4.2-2-4.2-4.4 2.6.2 4.2 2 4.2 4.4zM12 9c2.6-.2 4.2-2 4.2-4.4-2.6.2-4.2 2-4.2 4.4z"/><path d="M12 13.5c-2.6-.2-4.2-2-4.2-4.4 2.6.2 4.2 2 4.2 4.4zM12 13.5c2.6-.2 4.2-2 4.2-4.4-2.6.2-4.2 2-4.2 4.4z"/><path d="M12 18c-2.6-.2-4.2-2-4.2-4.4 2.6.2 4.2 2 4.2 4.4zM12 18c2.6-.2 4.2-2 4.2-4.4-2.6.2-4.2 2-4.2 4.4z"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3M5.3 5.3l2.1 2.1M16.6 16.6l2.1 2.1M5.3 18.7l2.1-2.1M16.6 7.4l2.1-2.1"/>',
  leaf: '<path d="M5 19C5 10.5 10.5 5 19.5 4.5 19.5 13 14 19 5 19z"/><path d="M5 19l9-9M9 15h4.5M11.5 12.5V9"/>',
  snow: '<path d="M12 2.5v19M3.8 7.2l16.4 9.6M3.8 16.8l16.4-9.6"/><path d="M9.8 4.2L12 6l2.2-1.8M9.8 19.8L12 18l2.2 1.8M4.3 10.4l2.4-.9-.4-2.6M19.7 13.6l-2.4.9.4 2.6M4.3 13.6l2.4.9-.4 2.6M19.7 10.4l-2.4-.9.4-2.6"/>',
  sprout: '<path d="M12 21v-9"/><path d="M12 13.5c0-4-2.8-6.3-7-6.3 0 4 2.8 6.3 7 6.3zM12 11c0-4.4 2.9-6.8 7.3-6.8 0 4.4-2.9 6.8-7.3 6.8z"/><path d="M7.5 21h9"/>',
  castle: '<path d="M4 21V10.5L3 9.5V5.5h3v2h2v-2h3v2h2v-2h3v2h2v-2h3v4l-1 1V21z"/><path d="M10 21v-4a2 2 0 0 1 4 0v4M3 21h18M8 12.5v1.5M16 12.5v1.5"/>',
  candle: '<path d="M8 21h8M9.5 21v-9.5h5V21"/><path d="M12 11.5V9.5"/><path d="M12 3c1.6 1.8 1.9 3.6 0 5.5-1.9-1.9-1.6-3.7 0-5.5z"/>',
  dove: '<path d="M3 13.5c2.8-.3 5 .6 6.8 2.6.7-4.7 3.8-8.8 10.2-10.1-.8 3.1-2.1 5.4-4 6.7 1.7-.1 3 .5 4 1.7-3 2.6-6.7 3.5-10 2.3-1.8 1.8-4.1 2.9-7 2.9 1.5-1.4 2.2-3.6 0-6.1z"/><circle cx="16.8" cy="9.2" r=".6"/>',
  raven: '<path d="M2.5 14c3.2-.2 5.4.4 7.2 2 1.5-4.4 5.2-7.5 11.8-8-1.3 1.4-2.1 2.6-2.3 3.9 1.1.2 1.9.8 2.3 1.7l-2.6.5c-1 2.7-3.6 4.4-7 4.6l.8 2.8-2.2-2.4-2 1.7.3-2.6c-2.3-.4-4.3-1.8-6.3-4.2z"/><circle cx="17.2" cy="10.4" r=".6"/>',
  letter: '<path d="M3 6.5h18v11H3z"/><path d="M3 6.5l9 6.5 9-6.5"/><circle cx="12" cy="15.2" r="1.6"/>',
  dagger: '<path d="M12 2.5l2 3.5v9h-4V6z"/><path d="M7.5 15h9M12 15v4.5"/><circle cx="12" cy="20.6" r="1.1"/>',
  people: '<circle cx="9" cy="8" r="3.2"/><path d="M3 20c0-3.6 2.7-6.2 6-6.2s6 2.6 6 6.2"/><circle cx="17" cy="9" r="2.5"/><path d="M15.8 14.2c3 .1 5.2 2.2 5.2 5.3"/>',
  scroll: '<path d="M6 4h12v13.5a2.5 2.5 0 0 1-2.5 2.5H6a2.5 2.5 0 0 1-2.5-2.5v-1H13v1a2.5 2.5 0 0 0 2.5 2.5"/><path d="M6 4a2 2 0 0 0-2 2v1.5h2M9 8.5h6M9 11.5h6M9 14h3.5"/>',
  undo: '<path d="M9 14L4 9l5-5"/><path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11"/>',
  gear: '<circle cx="12" cy="12" r="3"/><path d="M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3M5.3 5.3l2.1 2.1M16.6 16.6l2.1 2.1M5.3 18.7l2.1-2.1M16.6 7.4l2.1-2.1"/><circle cx="12" cy="12" r="6.5"/>',
  menu: '<path d="M4 6.5h16M4 12h16M4 17.5h16"/>',
  close: '<path d="M6 6l12 12M18 6L6 18"/>',
  play: '<path class="f" d="M8 5.5l11 6.5-11 6.5z"/>',
  sparkle: '<path d="M11 3l1.8 5.4L18.2 10l-5.4 1.8L11 17.2l-1.8-5.4L3.8 10l5.4-1.6z"/><path d="M18.5 15l.8 2 2 .8-2 .8-.8 2-.8-2-2-.8 2-.8z"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  crown: '<path d="M3.5 17.5L2.5 7.5l5.2 4.3L12 5l4.3 6.8 5.2-4.3-1 10z"/><path d="M4 20.5h16"/><circle cx="12" cy="14" r="1"/>',
  horn: '<path d="M3 9.5c5 0 10-2.5 14-6v17c-4-3.5-9-6-14-6z"/><path d="M3 9.5v5M17 3.5c2.5 2 3.8 5 3.8 8.5S19.5 18.5 17 20.5"/>',
  key: '<circle cx="7.5" cy="12" r="3.5"/><path d="M11 12h10M17.5 12v3.2M20.5 12v2.4"/>',
  lock: '<rect x="5" y="10.5" width="14" height="10" rx="1.5"/><path d="M8 10.5V7.5a4 4 0 0 1 8 0v3M12 14.5v2.5"/>',
  speak: '<path d="M4 5.5h16v10H11l-4.5 4v-4H4z"/><path d="M8 9.5h8M8 12.5h5"/>',
  fire: '<path d="M12 2.5c4.2 3.8 6.5 7.3 6.5 11.2a6.5 6.5 0 0 1-13 0c0-2.8 1.6-5 3.2-6.4 0 2.8 1.2 4 3.2 4-.9-3.1-.4-6 .1-8.8z"/>',
  tent: '<path d="M2.5 20.5L12 4l9.5 16.5z"/><path d="M12 4v16.5M9 20.5l3-5.5 3 5.5M12 4l1.5-2"/>',
  cross: '<path d="M12 3v18M7 8h10"/>',
  warn: '<path d="M12 3.5l9.5 16.5h-19z"/><path d="M12 10v4.5M12 17.2v.3"/>',
  flag: '<path d="M5 21V3.5"/><path d="M5 4h13l-3 4 3 4H5"/>',
  eye: '<path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z"/><circle cx="12" cy="12" r="3"/>',
  quill: '<path d="M20 3.5C12 4 6.5 9.5 5.5 18.5L4 21"/><path d="M20 3.5c-1.5 5-4.5 9-10 11.5M9 11l3.5 1M11.5 8l3 .8"/>',
  hourglass: '<path d="M6 3h12M6 21h12M7.5 3c0 5 9 6 9 9s-9 4-9 9M16.5 3c0 5-9 6-9 9s9 4 9 9"/>',
  pick: '<path d="M4 7c4.5-3.5 11.5-3.5 16 0"/><path d="M12 5.5L6 21"/>',
  horse: '<path d="M6 21c-.5-3.5.5-6 3-8L7.5 9.5 10 8l1-3.5 2 2 5 1.5 2.5 4-2 1.3-3.2-1.8-.8 3.5L16 21"/><path d="M10 8l-3.5-1.5"/>',
  wine: '<path d="M7.5 3h9c0 5-1.5 8.5-4.5 8.5S7.5 8 7.5 3z"/><path d="M12 11.5V20M8 20.5h8M8 6.5h8"/>',
  fish: '<path d="M3 12c3-4 8-6 13-4l5-3v14l-5-3c-5 2-10 0-13-4z"/><circle cx="7.5" cy="11" r=".8"/>',
  sheep: '<path d="M6.5 16.5c-2.2 0-3.5-1.7-3.5-3.8 0-1.6 1-2.8 2.4-3.3.3-2 2-3.4 4-3.4 1 0 1.9.3 2.6 1 .7-.7 1.6-1 2.6-1 2 0 3.7 1.4 4 3.4 1.4.5 2.4 1.7 2.4 3.3 0 2.1-1.3 3.8-3.5 3.8z"/><path d="M8 16.5V20M16 16.5V20"/>',
  timber: '<ellipse cx="17" cy="12" rx="3" ry="5"/><path d="M17 7H6c-1.7 0-3 2.2-3 5s1.3 5 3 5h11"/><path d="M17 10.5v3"/>',
  fur: '<path d="M6 4c2 2 4 2.5 6 2.5S16 6 18 4l1.5 5.5L17 12l2 8-7-2.5L5 20l2-8-2.5-2.5z"/>',
  salt: '<path d="M8 9h8l-1 11.5H9z"/><path d="M9 9V6.5a3 3 0 0 1 6 0V9M11 5.5h.01M13 5.5h.01M12 4h.01"/>',
  cloth: '<path d="M5 4h14v4H5zM5 8c0 4 3 5 3 12M19 8c0 4-3 5-3 12M8 20h8"/>',
  silver: '<path d="M4 16l4-7h8l4 7z"/><path d="M4 16h16v3H4zM8 9l2 7M16 9l-2 7"/>',
  gold: '<path d="M3.5 18l3-6h11l3 6z"/><path d="M8 12l2.5-5h3L16 12M3.5 18h17v2.5h-17z"/>',
  road: '<path d="M8 21L10.5 3M16 21L13.5 3M12 5v2.5M12 10.5v3M12 16.5v3"/>',
  anchor: '<circle cx="12" cy="5" r="2"/><path d="M12 7v14M8 11h8M4.5 14.5c0 3.5 3.3 6.5 7.5 6.5s7.5-3 7.5-6.5"/>',
  tower: '<path d="M8 21V8h8v13M7 8V4.5h2V6h2V4.5h2V6h2V4.5h2V8z"/><path d="M10.5 21v-3.5h3V21M12 11v2"/>',
  market: '<path d="M3 9l2-5h14l2 5M3 9h18v2a3 3 0 0 1-6 0 3 3 0 0 1-6 0 3 3 0 0 1-6 0zM5 13v8h14v-8"/><path d="M10 21v-4h4v4"/>',
  granary: '<path d="M4 11L12 4l8 7M6 10v11h12V10"/><path d="M10 21v-5h4v5M9 13h6"/>',
  hammer: '<path d="M14 4l6 6-2.5 2.5-6-6z"/><path d="M13 8l-9 9 3 3 9-9"/>',
  map: '<path d="M3 6l6-2.5 6 2.5 6-2.5v14.5l-6 2.5-6-2.5-6 2.5z"/><path d="M9 3.5v14.5M15 6v14.5"/>',
  battle: '<path d="M4 4l10.5 10.5M20 4L9.5 14.5M12.5 16.5l4-4M7.5 12.5l4 4M15.2 15.2l3.8 3.8M8.8 15.2L5 19"/>',
  pin: '<path d="M12 21s-6.5-6.3-6.5-11a6.5 6.5 0 0 1 13 0c0 4.7-6.5 11-6.5 11z"/><circle cx="12" cy="10" r="2.3"/>',
  chevronL: '<path d="M15 5l-7 7 7 7"/>',
  chevronR: '<path d="M9 5l7 7-7 7"/>',
  check: '<path d="M4.5 12.5l5 5L19.5 7"/>',
  up: '<path d="M12 5l7 9H5z" class="f"/>',
  down: '<path d="M12 19l7-9H5z" class="f"/>',
  skull: '<path d="M12 3a7.5 7.5 0 0 0-7.5 7.5c0 2.6 1.3 4.3 3 5.3V19h9v-3.2c1.7-1 3-2.7 3-5.3A7.5 7.5 0 0 0 12 3z"/><circle cx="9" cy="11" r="1.6"/><circle cx="15" cy="11" r="1.6"/><path d="M10 19v2M14 19v2"/>',
  heart: '<path d="M12 20s-8-4.8-8-10.2A4.3 4.3 0 0 1 12 7.5a4.3 4.3 0 0 1 8 2.3C20 15.2 12 20 12 20z"/>',
  diamond: '<path d="M12 3l8 9-8 9-8-9z"/>',
};

// Emoji the game has used, and what to draw instead
export const EMOJI = {
  '🪙': 'coin', '💰': 'coin', '⚖': 'scales', '⚔': 'swords', '🛡': 'shield', '⛵': 'ship', '🚢': 'ship', '🌾': 'wheat', '❄': 'snow', '☀': 'sun', '🍂': 'leaf', '🌱': 'sprout',
  '🏰': 'castle', '🕯': 'candle', '🕊': 'dove', '🗡': 'dagger', '👥': 'people', '📜': 'scroll', '🐦‍⬛': 'raven', '🐦': 'raven', '↶': 'undo', '⚙': 'gear', '☰': 'menu',
  '✕': 'close', '✖': 'close', '✨': 'sparkle', '＋': 'plus', '📯': 'horn', '🗝': 'key', '🔒': 'lock', '🗣': 'speak', '✉': 'letter', '🔥': 'fire', '⛺': 'tent', '✝': 'cross',
  '⚠': 'warn', '👑': 'crown', '⛏': 'pick', '🐎': 'horse', '🍷': 'wine', '🐟': 'fish', '🐑': 'sheep', '🪵': 'timber', '🦫': 'fur', '🧂': 'salt', '🧵': 'cloth', '🥈': 'silver',
  '🛤': 'road', '⚓': 'anchor', '🗼': 'tower', '🏪': 'market', '🏚': 'granary', '🔨': 'hammer', '🗺': 'map', '📍': 'pin', '💀': 'skull', '❖': 'diamond', '◆': 'diamond', '✔': 'check', '✓': 'check',
  '▶': 'play', '⟩': 'chevronR', '⟨': 'chevronL', '▲': 'up', '▼': 'down',
};

export function icon(name, cls = '') {
  const body = P[name] || P[EMOJI[name]]; if (!body) return name;
  return `<svg class="ico ${cls}" viewBox="0 0 24 24" aria-hidden="true" data-icon="${EMOJI[name] || name}">${body}</svg>`;
}

// Replace emoji in text nodes with icons, across the whole document, as it changes
const keys = Object.keys(EMOJI).sort((a, b) => b.length - a.length).map((k) => k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
const RX = new RegExp(`(${keys.join('|')})\\uFE0F?`, 'g');
const SKIP = new Set(['SCRIPT', 'STYLE', 'TEXTAREA', 'INPUT', 'OPTION', 'SELECT', 'svg', 'CODE', 'PRE']);
function iconizeNode(node) {
  if (node.nodeType === 3) {
    const t = node.nodeValue; if (!t || !RX.test(t)) return; RX.lastIndex = 0;
    const parent = node.parentNode; if (!parent || SKIP.has(parent.nodeName) || parent.closest?.('[contenteditable],.no-icons')) return;
    const span = document.createElement('span'); span.className = 'ico-wrap';
    span.innerHTML = t.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c])).replace(RX, (m, e) => icon(e));
    parent.replaceChild(span, node);
    // unwrap: keep the text flow intact
    while (span.firstChild) parent.insertBefore(span.firstChild, span); parent.removeChild(span);
    return;
  }
  if (node.nodeType === 1 && !SKIP.has(node.nodeName)) for (const c of [...node.childNodes]) iconizeNode(c);
}
export function startIconizer(root = document.body) {
  iconizeNode(root);
  new MutationObserver((muts) => { for (const m of muts) { if (m.type === 'characterData') iconizeNode(m.target); else for (const n of m.addedNodes) iconizeNode(n); } })
    .observe(root, { childList: true, subtree: true, characterData: true });
}
