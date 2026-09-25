// Illustrated headers for great events: layered silhouettes against a painted sky, chosen from what the
// event is about (a death, a battle, dragons, the Wall, a crowning, a wedding, poison, the sea, winter).
const W = 400, H = 110;
const sky = (id, a, b, c) => `<linearGradient id="${id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${a}"/><stop offset="0.6" stop-color="${b}"/><stop offset="1" stop-color="${c}"/></linearGradient>`;
const hills = (y, fill, amp = 10, seed = 1) => { let d = `M0 ${H} L0 ${y}`; for (let x = 0; x <= W; x += 20) d += ` L${x} ${y - Math.abs(Math.sin(x * 0.037 * seed + seed) * amp) - Math.abs(Math.sin(x * 0.11 + seed * 3)) * amp * 0.4}`; return `<path d="${d} L${W} ${H} Z" fill="${fill}"/>`; };
const glow = (id, cx, cy, r, col) => `<radialGradient id="${id}" cx="${cx}" cy="${cy}" r="${r}"><stop offset="0" stop-color="${col}" stop-opacity="0.9"/><stop offset="1" stop-color="${col}" stop-opacity="0"/></radialGradient>`;
const spear = (x, y, h) => `<path d="M${x} ${y} l0 -${h} l-2 -5 l2 -6 l2 6 l-2 5" stroke="#0c0a09" stroke-width="1.4" fill="#0c0a09"/>`;
const banner = (x, y, col) => `<path d="M${x} ${y} l0 -46" stroke="#0c0a09" stroke-width="1.6"/><path d="M${x} ${y - 46} l16 0 l0 22 l-8 -5 l-8 5 z" fill="${col}" stroke="#0c0a09" stroke-width="0.8"/>`;

const SCENES = {
  battle: () => `<defs>${sky('s', '#2a0d08', '#8a2a14', '#e0762a')}${glow('g', 0.7, 0.8, 0.5, '#ffb050')}</defs>
    <rect width="${W}" height="${H}" fill="url(#s)"/><rect width="${W}" height="${H}" fill="url(#g)"/>
    ${[40, 120, 250, 330].map((x) => `<ellipse cx="${x}" cy="${40 + (x % 30)}" rx="60" ry="12" fill="#1a0a06" opacity="0.35"/>`).join('')}
    ${hills(88, '#1a0c08', 8, 2)}
    ${Array.from({ length: 26 }, (_, i) => spear(20 + i * 14 + (i % 3) * 3, 96 - (i % 4) * 2, 34 + (i % 5) * 4)).join('')}
    ${banner(110, 96, '#7a1a14')}${banner(290, 94, '#1a2a4a')}
    ${hills(100, '#0c0605', 4, 5)}`,
  death: () => `<defs>${sky('s', '#07080c', '#141620', '#1c1a1e')}${glow('g', 0.5, 0.55, 0.35, '#ffcf80')}</defs>
    <rect width="${W}" height="${H}" fill="url(#s)"/><rect width="${W}" height="${H}" fill="url(#g)"/>
    <rect x="186" y="58" width="28" height="44" fill="#e9dcc0"/><rect x="186" y="58" width="28" height="44" fill="url(#g)" opacity="0.3"/>
    <path d="M200 58 q-5 -10 0 -22 q6 12 0 22" fill="#ffd27a"/><path d="M200 56 q-2 -6 0 -12 q3 6 0 12" fill="#fff4d0"/>
    <rect x="150" y="100" width="100" height="10" fill="#0a0908"/>
    <path d="M0 0 L70 0 L0 70 Z" fill="#050505"/><path d="M8 0 L20 0 L0 20 L0 8 Z" fill="#1a1a1a"/>`,
  dragons: () => `<defs>${sky('s', '#1a0806', '#6a1c0e', '#e08a2a')}${glow('g', 0.5, 0.95, 0.6, '#ffcc60')}</defs>
    <rect width="${W}" height="${H}" fill="url(#s)"/><rect width="${W}" height="${H}" fill="url(#g)"/>
    ${hills(96, '#140806', 12, 3)}
    <g fill="#0c0605"><path d="M150 50 c20 -20 50 -30 70 -10 c-15 -3 -25 2 -30 8 c14 -2 28 4 36 14 c-18 -6 -34 -4 -44 4 c-10 -2 -22 -8 -32 -16 z"/>
    <path d="M205 42 c30 -30 70 -35 110 -20 c-30 0 -50 10 -62 22 c20 -4 40 0 52 10 c-25 -6 -50 -2 -66 6 z"/>
    <path d="M190 48 l14 -2 l6 6 l-10 2 z"/><path d="M240 60 q30 10 60 30" stroke="#0c0605" stroke-width="4" fill="none"/></g>`,
  wall: () => `<defs>${sky('s', '#05080f', '#142238', '#3a5068')}</defs>
    <rect width="${W}" height="${H}" fill="url(#s)"/>
    ${Array.from({ length: 40 }, (_, i) => `<circle cx="${(i * 97) % W}" cy="${(i * 53) % 60}" r="${(i % 3) * 0.4 + 0.4}" fill="#dfe8ff" opacity="0.8"/>`).join('')}
    <path d="M0 52 L${W} 46 L${W} 92 L0 96 Z" fill="#b8d0e0"/><path d="M0 52 L${W} 46 L${W} 52 L0 58 Z" fill="#e8f4fb"/>
    ${Array.from({ length: 16 }, (_, i) => `<rect x="${i * 25 + 4}" y="${60 + (i % 3) * 8}" width="${10 + (i % 4) * 4}" height="1.5" fill="#8aa8bc" opacity="0.6"/>`).join('')}
    ${hills(100, '#0a1018', 5, 7)}
    ${Array.from({ length: 30 }, (_, i) => `<circle cx="${(i * 131) % W}" cy="${(i * 71) % H}" r="0.9" fill="#fff" opacity="0.7"/>`).join('')}`,
  winter: () => `<defs>${sky('s', '#9aa8b8', '#c8d2dc', '#eef2f6')}</defs>
    <rect width="${W}" height="${H}" fill="url(#s)"/>
    <path d="M0 80 L60 40 L100 70 L160 24 L220 72 L280 36 L340 68 L400 46 L400 110 L0 110 Z" fill="#7a8a9a"/>
    <path d="M160 24 L176 44 L150 40 Z M280 36 L294 52 L270 50 Z M60 40 L72 54 L50 52 Z" fill="#fff"/>
    ${hills(96, '#e8eef4', 6, 4)}
    <g fill="#fff" stroke="#9aa6b2" stroke-width="0.6"><path d="M300 30 c6 -4 12 -4 16 0 c4 -6 12 -8 18 -4 c-6 2 -10 6 -12 10 c-8 2 -16 0 -22 -6 z"/></g>
    ${Array.from({ length: 50 }, (_, i) => `<circle cx="${(i * 89) % W}" cy="${(i * 37) % H}" r="1" fill="#fff" opacity="0.9"/>`).join('')}`,
  court: () => `<defs>${sky('s', '#140e08', '#2a1c10', '#1a120a')}${glow('g', 0.5, 0.15, 0.55, '#ffd890')}</defs>
    <rect width="${W}" height="${H}" fill="url(#s)"/>
    <path d="M150 0 L250 0 L300 110 L100 110 Z" fill="url(#g)" opacity="0.5"/>
    <g fill="#0c0908">${Array.from({ length: 21 }, (_, i) => { const x = 160 + i * 4; const h = 30 + Math.abs(Math.sin(i * 1.7)) * 34; return `<path d="M${x} 96 L${x + 1.5} ${96 - h} L${x + 3} 96 Z"/>`; }).join('')}
    <rect x="170" y="70" width="60" height="30"/><rect x="164" y="96" width="72" height="14"/><rect x="176" y="60" width="48" height="12"/></g>
    ${[60, 110, 290, 340].map((x) => `<rect x="${x}" y="10" width="14" height="100" fill="#0e0a07"/>`).join('')}`,
  wedding: () => `<defs>${sky('s', '#1a0f06', '#3a2410', '#2a1a0c')}${glow('g', 0.5, 0.4, 0.6, '#ffb860')}</defs>
    <rect width="${W}" height="${H}" fill="url(#s)"/><rect width="${W}" height="${H}" fill="url(#g)"/>
    <rect x="40" y="78" width="320" height="8" fill="#0e0905"/><rect x="40" y="86" width="320" height="24" fill="#1a1008"/>
    ${[80, 130, 180, 230, 280, 330].map((x) => `<path d="M${x} 78 l-5 -12 l10 0 z M${x} 66 l0 -4" stroke="#0e0905" fill="#0e0905"/>`).join('')}
    ${[100, 200, 300].map((x) => `<rect x="${x - 2}" y="56" width="4" height="22" fill="#e8dcc0"/><path d="M${x} 56 q-3 -7 0 -12 q3 5 0 12" fill="#ffd27a"/>`).join('')}`,
  intrigue: () => `<defs>${sky('s', '#07060a', '#141018', '#0c0a10')}${glow('g', 0.3, 0.5, 0.4, '#8a6aa0')}</defs>
    <rect width="${W}" height="${H}" fill="url(#s)"/><rect width="${W}" height="${H}" fill="url(#g)" opacity="0.5"/>
    <g transform="rotate(-18 220 60)"><path d="M140 60 L300 56 L312 60 L300 64 Z" fill="#c8ccd2"/><rect x="118" y="54" width="22" height="12" rx="2" fill="#3a2a1a"/><rect x="136" y="46" width="6" height="28" fill="#b89a4a"/></g>
    <path d="M320 100 l-10 -38 l28 0 l-10 38 z" fill="#2a1a2a"/><ellipse cx="324" cy="62" rx="14" ry="4" fill="#5a1a3a"/>`,
  sea: () => `<defs>${sky('s', '#1a2430', '#3a4c5c', '#5a6a70')}</defs>
    <rect width="${W}" height="${H}" fill="url(#s)"/>
    ${[70, 180, 300].map((x, i) => `<g fill="#0c0e10"><path d="M${x - 30} 80 q30 12 60 0 l-6 8 l-48 0 z"/><rect x="${x - 1}" y="40" width="2" height="40"/><path d="M${x + 1} 42 l${22 - i * 3} 8 l0 22 l-${22 - i * 3} -4 z"/></g>`).join('')}
    ${Array.from({ length: 12 }, (_, i) => `<path d="M${i * 36} ${92 + (i % 2) * 4} q9 -5 18 0 t18 0" stroke="#8aa0ac" stroke-width="1" fill="none" opacity="0.6"/>`).join('')}
    <rect y="96" width="${W}" height="14" fill="#1a2630"/>`,
  harvest: () => `<defs>${sky('s', '#e8b060', '#f4d49a', '#f8e8c0')}${glow('g', 0.8, 0.4, 0.3, '#fff4c0')}</defs>
    <rect width="${W}" height="${H}" fill="url(#s)"/><rect width="${W}" height="${H}" fill="url(#g)"/>
    ${hills(78, '#9a8a3a', 8, 1)}${hills(92, '#7a6a2a', 6, 3)}
    ${Array.from({ length: 14 }, (_, i) => `<path d="M${20 + i * 28} 104 l4 -14 l4 14 z" fill="#5a4a1a"/>`).join('')}`,
};

function sceneFor(e) {
  const t = `${e.title} ${e.text}`.toLowerCase();
  if (/dragon/.test(t)) return 'dragons';
  if (/the wall|wildling|free folk|castle black|the others|haunted forest|ranger/.test(t)) return 'wall';
  if (/red wedding|rains of castamere|massacre/.test(t)) return 'battle';
  if (/\bdead\b|\bdies\b|died|death|beheaded|murdered|slain|killed|poisoned|is no more|funeral/.test(t) && !/battle/.test(t)) return /poison/.test(t) ? 'intrigue' : 'death';
  if (/\bwinter\b|white raven|\bsnow/.test(t)) return 'winter';
  if (/wedding|feast|betroth|married|weds/.test(t)) return 'wedding';
  if (/fleet|longship|iron fleet|reaving|sail|galleys/.test(t)) return 'sea';
  if (e.type === 'war' || /battle|burn|siege|host|banners|war\b|sack/.test(t)) return 'battle';
  if (e.type === 'intrigue' || /dagger|spy|plot|secret|assassin|knife/.test(t)) return 'intrigue';
  if (e.type === 'economy' || /harvest|granar|grain/.test(t)) return 'harvest';
  return 'court';
}

let n = 0;
export function eventArt(e) {
  if ((e.importance || 0) < 4) return '';
  const key = sceneFor(e);
  // unique gradient ids per illustration so several on one page do not collide
  const id = 'ea' + (n++);
  const svg = SCENES[key]().replace(/id="(s|g)"/g, `id="${id}$1"`).replace(/url\(#(s|g)\)/g, `url(#${id}$1)`);
  return `<div class="event-art ${key}"><svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid slice" aria-hidden="true">${svg}</svg></div>`;
}
