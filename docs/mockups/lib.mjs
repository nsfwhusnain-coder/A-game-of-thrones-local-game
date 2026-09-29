// Shared pieces for the mockup generator (build.mjs): base CSS, icons, crests, portraits. Output pages are self-contained.
export const FONTS = `
@font-face{font-family:'Cinzel';font-weight:400 700;src:url(../../public/fonts/cinzel-normal-latin-1.woff2) format('woff2')}
@font-face{font-family:'Cinzel Decorative';font-weight:700;src:url(../../public/fonts/cinzeldecorative-normal-latin-3.woff2) format('woff2')}
@font-face{font-family:'EB Garamond';font-style:normal;font-weight:400 600;src:url(../../public/fonts/ebgaramond-normal-latin-7.woff2) format('woff2')}
@font-face{font-family:'EB Garamond';font-style:italic;font-weight:400 600;src:url(../../public/fonts/ebgaramond-italic-latin-5.woff2) format('woff2')}`;

export const BASE_CSS = `
:root{--bg:#0e0b08;--panel:rgba(22,17,12,.94);--panel-solid:#17120d;--panel2:#221a12;--line:#4d3c28;--line2:#6b5334;--gold:#c9a44a;--gold2:#ecd392;
--text:#ece1c8;--muted:#a8977a;--red:#b03a2e;--green:#74b84e;--blue:#5a8ac8;--amber:#d99a3a;--parch:#efe2c4;--ink:#2b2016;
--serif:'EB Garamond',Georgia,'Times New Roman',serif;--display:'Cinzel',Georgia,serif;--shadow:0 10px 40px rgba(0,0,0,.55)}
*{box-sizing:border-box}
html{font-size:clamp(12.5px,.5vw + 6.4px,16px)}
html,body{margin:0;height:100%;background:var(--bg);color:var(--text);font-family:var(--serif);overflow:hidden;font-size:1rem;line-height:1.35}
button{font:inherit;color:inherit}
h1,h2,h3,h4{font-family:var(--display);font-weight:600;letter-spacing:.04em;margin:0;color:var(--gold2)}
svg.i{width:1.25em;height:1.25em;fill:none;stroke:currentColor;stroke-width:1.6;stroke-linecap:round;stroke-linejoin:round;flex:none}
.map{position:fixed;inset:0;background:var(--bg) center/cover no-repeat}
.dim{position:fixed;inset:0;background:radial-gradient(ellipse at center,rgba(8,6,4,.45),rgba(8,6,4,.78))}
.tag{position:fixed;top:.3rem;left:50%;transform:translateX(-50%);z-index:99;font:600 .56rem/1 var(--display);letter-spacing:.14em;color:rgba(236,211,146,.7);
  background:rgba(14,11,8,.62);padding:.28rem .6rem;border-radius:2px;pointer-events:none;white-space:nowrap}
.panel{background:var(--panel);border:1px solid var(--line2);border-radius:4px;box-shadow:var(--shadow),inset 0 0 0 1px rgba(201,164,74,.07);backdrop-filter:blur(5px)}
.btn{background:linear-gradient(#4a3b29,#241b12);border:1px solid var(--line2);color:var(--gold2);padding:.4rem .9rem;border-radius:3px;font-family:var(--display);font-size:.78rem;letter-spacing:.05em;cursor:pointer;white-space:nowrap;display:inline-flex;align-items:center;gap:.4rem}
.btn.primary{background:linear-gradient(#b8923f,#7d5f22);color:#1b1408;border-color:#e0c072;font-weight:700}
.btn.ghost{background:transparent}
.muted{color:var(--muted)}
.up{color:var(--green)}.down{color:#e0664f}.flat{color:var(--muted)}

/* ---- the quiet HUD (GDD 17 §2.1) ---- */
.hud{position:fixed;z-index:5;pointer-events:none}
.hud>*{pointer-events:auto}
.hud-tl{left:1rem;top:1rem;display:flex;gap:.6rem;align-items:stretch}
.hud-tr{right:1rem;top:1rem;display:flex;gap:.6rem;align-items:flex-start}
.plate{display:flex;align-items:center;gap:.7rem;padding:.45rem .9rem .45rem .55rem;min-width:17rem}
.plate .crest{width:2.5rem;height:3rem;flex:none;filter:drop-shadow(0 2px 3px rgba(0,0,0,.6))}
.plate .house{font:600 .68rem/1 var(--display);letter-spacing:.16em;color:var(--muted);text-transform:uppercase}
.plate .date{font:600 1.02rem/1.15 var(--display);color:var(--gold2);letter-spacing:.03em;margin-top:.2rem;white-space:nowrap}
.plate .season{display:flex;align-items:center;gap:.3rem;font-style:italic;color:var(--muted);font-size:.86rem;margin-top:.1rem}
.plate .season svg{color:var(--gold);width:1.05em;height:1.05em}
.vitals{display:flex;align-items:center;padding:0 .4rem}
.vital{display:flex;align-items:center;gap:.55rem;padding:.35rem .85rem;position:relative}
.vital+.vital:before{content:"";position:absolute;left:0;top:22%;bottom:22%;border-left:1px solid var(--line)}
.vital>svg{width:1.6rem;height:1.6rem;color:var(--gold)}
.vital b{display:block;font:600 1.3rem/1 var(--display);color:var(--text);letter-spacing:.02em}
.vital small{display:block;font:600 .62rem/1 var(--display);letter-spacing:.14em;color:var(--muted);text-transform:uppercase;margin-top:.2rem}
.vital .tr{font-size:.85rem;margin-left:.15rem;align-self:flex-start;margin-top:.15rem}
.iconbtn{width:3.1rem;height:3.1rem;display:grid;place-items:center;position:relative;cursor:pointer;color:var(--gold2)}
.iconbtn svg{width:1.5rem;height:1.5rem}
.iconbtn .badge{position:absolute;top:-.35rem;right:-.35rem;background:var(--red);color:#fff;font:600 .68rem/1 sans-serif;border-radius:1rem;padding:.2rem .4rem;border:1px solid #1a1109}
.endturn{display:flex;flex-direction:column;align-items:stretch;padding:.3rem;width:16.5rem}
.endturn .go{background:linear-gradient(#3a69ad,#1f3f6e);border:1px solid #7ea6dc;border-radius:3px;color:#f0e8d2;font:700 1.05rem/1 var(--display);letter-spacing:.1em;padding:.7rem 1rem;text-align:center;text-transform:uppercase;box-shadow:0 0 18px rgba(90,138,200,.35)}
.endturn .why{font-style:italic;font-size:.88rem;color:var(--muted);text-align:center;padding:.3rem .2rem .1rem;white-space:nowrap}
.endturn .why b{font-style:normal;font-weight:500;color:var(--gold2)}
.modechip{position:fixed;right:1rem;top:5.6rem;z-index:5;font:600 .68rem/1 var(--display);letter-spacing:.1em;padding:.45rem .7rem;color:var(--muted);text-transform:uppercase;display:flex;gap:.4rem;align-items:center}

.strip{left:1rem;bottom:1rem;width:23rem;padding:.55rem .75rem .6rem}
.strip h4{display:flex;justify-content:space-between;font-size:.66rem;letter-spacing:.16em;color:var(--muted);text-transform:uppercase;margin-bottom:.35rem}
.strip h4 b{color:var(--gold);font-weight:600}
.strip .ln{display:flex;gap:.55rem;align-items:baseline;padding:.2rem 0;font-size:.98rem;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;line-height:1.25}
.strip .ln i{flex:none;width:.5rem;height:.5rem;border-radius:50%;background:var(--gold);transform:translateY(-.08rem)}
.strip .ln.old i{background:transparent;border:1px solid var(--muted)}
.strip .ln.old{color:var(--muted)}
.strip .ln span{overflow:hidden;text-overflow:ellipsis}
.cmd{left:50%;transform:translateX(-50%);bottom:1rem;width:min(38rem,42vw);padding:.5rem}
.cmd .order{display:flex;justify-content:space-between;align-items:center;gap:.6rem;padding:.3rem .6rem;margin-bottom:.4rem;background:rgba(0,0,0,.28);border-radius:3px;font-size:.95rem;color:var(--text)}
.cmd .order em{font:600 .58rem/1 var(--display);letter-spacing:.14em;font-style:normal;color:var(--green);border:1px solid rgba(116,184,78,.5);padding:.2rem .4rem;border-radius:2px;flex:none}
.cmd .order span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.cmd .row{display:flex;gap:.5rem;align-items:stretch}
.cmd .in{flex:1;background:#120d08;border:1px solid var(--line);border-radius:3px;padding:.65rem .8rem;color:var(--muted);font-style:italic;font-size:1.05rem;box-shadow:inset 0 2px 8px rgba(0,0,0,.5);white-space:nowrap;overflow:hidden}
.cmd .sq{width:2.8rem;display:grid;place-items:center;background:#241b12;border:1px solid var(--line2);border-radius:3px;color:var(--gold2)}
.cmd .sq svg{width:1.2rem;height:1.2rem}
.who{right:1rem;bottom:1rem;display:flex;align-items:center;gap:.7rem}
.who .nm{text-align:right;padding:.5rem .9rem}
.who .nm b{display:block;font:600 .95rem/1.1 var(--display);letter-spacing:.06em;color:var(--gold2);text-transform:uppercase}
.who .nm small{display:block;font-size:.85rem;color:var(--muted);margin-top:.15rem;font-style:italic}
.who .nm .mood{display:inline-flex;align-items:center;gap:.3rem;font-style:normal;font-size:.8rem;color:var(--green);margin-top:.15rem}
.who .nm .mood:before{content:"";width:.45rem;height:.45rem;border-radius:50%;background:var(--green)}
.ring{width:6.2rem;height:6.2rem;border-radius:50%;padding:.28rem;background:conic-gradient(from 210deg,#8a6a2a,#f0d68a,#8a6a2a,#f0d68a,#8a6a2a);box-shadow:0 6px 22px rgba(0,0,0,.65),0 0 0 2px #1b1409;flex:none}
.ring>div{width:100%;height:100%;border-radius:50%;overflow:hidden;border:2px solid #1b1409;background:#111}
.ring svg{width:100%;height:100%;display:block}
.chip{display:inline-flex;align-items:center;gap:.3rem;font:600 .62rem/1 var(--display);letter-spacing:.1em;text-transform:uppercase;padding:.28rem .5rem;border-radius:2rem;border:1px solid var(--line2);color:var(--muted);white-space:nowrap}
.chip.up{color:var(--green);border-color:rgba(116,184,78,.5);background:rgba(116,184,78,.09)}
.chip.down{color:#e8806b;border-color:rgba(224,102,79,.5);background:rgba(224,102,79,.09)}
.chip.gold{color:var(--gold2);border-color:rgba(201,164,74,.55);background:rgba(201,164,74,.09)}
.pchip{display:inline-flex;align-items:center;gap:.5rem;padding:.2rem .7rem .2rem .2rem;border:1px solid var(--line2);border-radius:2rem;background:rgba(0,0,0,.25);font-size:.95rem}
.pchip .pf{width:2.1rem;height:2.1rem;border-radius:50%;overflow:hidden;border:1px solid var(--gold);flex:none}
.pchip .pf svg{width:100%;height:100%;display:block}
.pchip small{display:block;color:var(--muted);font-size:.78rem;line-height:1.1}
.x{position:absolute;top:.7rem;right:.8rem;color:var(--muted);cursor:pointer}
.parch{background:linear-gradient(#f2e7cb,#e6d6b0);color:var(--ink);border:1px solid #b79a5a;border-radius:4px;box-shadow:var(--shadow),inset 0 0 60px rgba(150,110,40,.22),inset 0 0 0 4px rgba(255,250,235,.35)}
.parch h1,.parch h2,.parch h3,.parch h4{color:#5a3a12}
.center{position:fixed;inset:0;display:grid;place-items:center;padding:1rem;z-index:10}
@media (max-width:1500px){.strip{width:20.5rem}}
`;

export const SPRITE = `<svg width="0" height="0" style="position:absolute"><defs>
<symbol id="i-coin" viewBox="0 0 24 24"><ellipse cx="12" cy="7" rx="7" ry="3"/><path d="M5 7v5c0 1.7 3.1 3 7 3s7-1.3 7-3V7M5 12v5c0 1.7 3.1 3 7 3s7-1.3 7-3v-5"/></symbol>
<symbol id="i-men" viewBox="0 0 24 24"><path d="M5 19L17 7M14 5h5v5M19 19L7 7M10 5H5v5M4 20l3-3M20 20l-3-3"/></symbol>
<symbol id="i-food" viewBox="0 0 24 24"><path d="M12 21V8M12 8c-2-1-3-3-3-5 2 0 3 2 3 5zM12 8c2-1 3-3 3-5-2 0-3 2-3 5zM12 13c-2-1-4-1-5-3 2-.3 4 .5 5 3zM12 13c2-1 4-1 5-3-2-.3-4 .5-5 3zM12 18c-2-1-4-1-5-3 2-.3 4 .5 5 3zM12 18c2-1 4-1 5-3-2-.3-4 .5-5 3z"/></symbol>
<symbol id="i-sun" viewBox="0 0 24 24"><circle cx="12" cy="12" r="4"/><path d="M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3M5.3 5.3l2.1 2.1M16.6 16.6l2.1 2.1M18.7 5.3l-2.1 2.1M7.4 16.6l-2.1 2.1"/></symbol>
<symbol id="i-mail" viewBox="0 0 24 24"><rect x="3" y="6" width="18" height="13" rx="1.5"/><path d="M3 7l9 7 9-7"/></symbol>
<symbol id="i-menu" viewBox="0 0 24 24"><path d="M4 7h16M4 12h16M4 17h16"/></symbol>
<symbol id="i-crown" viewBox="0 0 24 24"><path d="M4 19h16M4 19L3 7l5 4 4-6 4 6 5-4-1 12"/></symbol>
<symbol id="i-people" viewBox="0 0 24 24"><circle cx="9" cy="8" r="3.2"/><path d="M3 20c0-3.5 2.7-6 6-6s6 2.5 6 6"/><circle cx="17" cy="9" r="2.5"/><path d="M17 14c2.6 0 4.5 2 4.5 5"/></symbol>
<symbol id="i-scroll" viewBox="0 0 24 24"><path d="M7 4h11a2 2 0 012 2v12a2 2 0 01-2 2H8M7 4a2 2 0 00-2 2v12a2 2 0 002 2M9 9h7M9 13h7"/></symbol>
<symbol id="i-gear" viewBox="0 0 24 24"><circle cx="12" cy="12" r="3"/><path d="M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3M5.3 5.3l2.1 2.1M16.6 16.6l2.1 2.1M18.7 5.3l-2.1 2.1M7.4 16.6l-2.1 2.1"/></symbol>
<symbol id="i-help" viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M9.5 9.5a2.5 2.5 0 015 .3c0 1.7-2.5 2-2.5 3.7M12 17v.5"/></symbol>
<symbol id="i-pin" viewBox="0 0 24 24"><path d="M12 21s7-6.2 7-11a7 7 0 10-14 0c0 4.8 7 11 7 11z"/><circle cx="12" cy="10" r="2.5"/></symbol>
<symbol id="i-x" viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18"/></symbol>
<symbol id="i-spark" viewBox="0 0 24 24"><path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8zM19 16l.8 2.2L22 19l-2.2.8L19 22l-.8-2.2L16 19l2.2-.8z"/></symbol>
<symbol id="i-plus" viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"/></symbol>
<symbol id="i-raven" viewBox="0 0 24 24"><path d="M3 16c4 0 6.5-3 8-6 1-1.6 3-2.2 5-1.2l3.5 1.2-2.2 2.1c0 5-4 8.4-9.3 8.4-2 0-3.2-.9-5-4.5z"/><path d="M16 9.8l.01 0"/></symbol>
<symbol id="i-flag" viewBox="0 0 24 24"><path d="M6 21V4M6 5h11l-2 4 2 4H6"/></symbol>
<symbol id="i-eye" viewBox="0 0 24 24"><path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/></symbol>
<symbol id="i-castle" viewBox="0 0 24 24"><path d="M4 21V8l2.5 1.5V6l2.5 1.5V6H15v1.5L17.5 6v3.5L20 8v13zM10 21v-5a2 2 0 014 0v5"/></symbol>
<symbol id="i-skull" viewBox="0 0 24 24"><path d="M5 11a7 7 0 1114 0c0 2-1 3.2-2 4v3H7v-3c-1-.8-2-2-2-4z"/><circle cx="9.3" cy="11.3" r="1.2"/><circle cx="14.7" cy="11.3" r="1.2"/></symbol>
</defs></svg>`;
export const ico = (n, cls = '') => `<svg class="i ${cls}"><use href="#i-${n}"/></svg>`;

/* ---- crests: simple banners in the houses' colours (the game draws the real ones) ---- */
const GL = {
  stark: ['#e9e9ec', '<path d="M10 8l3 3h6l3-3v9l-3 5-3 2-3-2-3-5z" fill="#6c7078"/><path d="M14 20h6l-3 4z" fill="#e9e9ec"/>'],
  lannister: ['#8f1d1d', '<circle cx="16" cy="17" r="6.5" fill="#e0b84a"/><circle cx="16" cy="17" r="3.4" fill="#8f1d1d"/>'],
  tully: ['#2b5aa0', '<path d="M6 17c4-6 12-6 16 0-4 6-12 6-16 0z" fill="#e9eef7"/><path d="M22 17l5-4v8z" fill="#e9eef7"/>'],
  baratheon: ['#d8ad2c', '<path d="M9 8l3 6M23 8l-3 6M16 12l0 12M12 14h8" stroke="#141110" stroke-width="2.6" stroke-linecap="round" fill="none"/>'],
  tyrell: ['#3d7a3a', '<circle cx="16" cy="17" r="7" fill="#e6c34a"/><circle cx="16" cy="17" r="3.6" fill="#3d7a3a"/><circle cx="16" cy="17" r="1.5" fill="#e6c34a"/>'],
  arryn: ['#7fb1de', '<path d="M11 9a9 9 0 100 16 7 7 0 010-16z" fill="#f2f6fb"/>'],
  greyjoy: ['#1c1a1a', '<circle cx="16" cy="14" r="5" fill="#d6b14a"/><path d="M9 18c0 5 2 6 1 8M13 19c0 4 1 5 0 7M19 19c0 4-1 5 0 7M23 18c0 5-2 6-1 8" stroke="#d6b14a" stroke-width="2" fill="none" stroke-linecap="round"/>'],
  martell: ['#c96a1e', '<circle cx="16" cy="16" r="6" fill="#c02a1f"/><path d="M16 4v26" stroke="#e8d28a" stroke-width="2.4"/>'],
  bolton: ['#a8383c', '<path d="M16 8v12M9 12l14 6M23 12L9 18" stroke="#1a1010" stroke-width="2.4" stroke-linecap="round" fill="none"/>'],
  umber: ['#7a3b1f', '<circle cx="16" cy="15" r="4.5" fill="#f0e2c0"/><path d="M9 26l7-8 7 8" stroke="#f0e2c0" stroke-width="2.4" fill="none"/>'],
  frey: ['#5f7f9f', '<path d="M8 10h16v4H8zM8 18h16v4H8z" fill="#c9d3dc"/>'],
};
export const crest = (id, cls = '') => {
  const [f, g] = GL[id] || GL.stark;
  return `<svg class="crest ${cls}" viewBox="0 0 32 38"><path d="M2 1h28v27c0 5-9 8-14 9C11 36 2 33 2 28z" fill="${f}" stroke="#17120d" stroke-width="1.4"/>${g}<path d="M2 1h28v27c0 5-9 8-14 9C11 36 2 33 2 28z" fill="none" stroke="#c9a44a" stroke-opacity=".7" stroke-width=".8" transform="translate(0 0)"/></svg>`;
};

/* ---- portraits: painted-look busts drawn in SVG (the game uses its own generated ones; these keep the mockups honest about size and framing) ---- */
let pid = 0;
export function portrait(o = {}) {
  const { skin = '#d9b592', hair = '#4a3421', style = 'short', beard = null, cloak = '#4c5560', collar = null, bg = ['#2c3a3d', '#131a1b'], age = 0, eye = '#3b4650', extra = '' } = o;
  const u = ++pid;
  const hairBack = style === 'long' ? `<path d="M22 44c-6 24-5 44-8 62h72c-3-18-2-38-8-62-4-20-12-26-28-26s-24 6-28 26z" fill="${hair}"/>` : '';
  const hairTop = {
    short: `<path d="M30 46c-2-18 8-28 20-28s22 10 20 28c-4-8-8-13-20-13s-16 5-20 13z" fill="${hair}"/>`,
    long: `<path d="M29 48c-3-19 8-30 21-30s24 11 21 30c-3-9-8-15-21-15s-18 6-21 15z" fill="${hair}"/>`,
    bald: `<path d="M28 44c0-6 2-9 4-11 2 3 3 5 3 9zM72 44c0-6-2-9-4-11-2 3-3 5-3 9z" fill="${hair}" opacity=".85"/>`,
    white: `<path d="M29 48c-3-19 8-30 21-30s24 11 21 30c-3-9-8-15-21-15s-18 6-21 15z" fill="#e9e6e0"/>`,
    crown: `<path d="M30 46c-2-18 8-28 20-28s22 10 20 28c-4-8-8-13-20-13s-16 5-20 13z" fill="${hair}"/><path d="M33 26l5 5 6-7 6 7 6-7 5 5-2 5H35z" fill="#d6b14a" stroke="#7a5f1e" stroke-width=".8"/>`,
  }[style] || '';
  const bd = beard ? `<path d="M31 52c0 20 8 30 19 30s19-10 19-30c-3 10-9 14-19 14s-16-4-19-14z" fill="${beard}"/>` : '';
  const lines = age ? `<path d="M40 50q3-2 6 0M54 50q3-2 6 0M40 63q10 5 20 0" stroke="#000" stroke-opacity=".18" fill="none" stroke-width="1"/>` : '';
  return `<svg viewBox="0 0 100 120" preserveAspectRatio="xMidYMid slice"><defs>
<radialGradient id="pb${u}" cx="50%" cy="35%" r="80%"><stop offset="0" stop-color="${bg[0]}"/><stop offset="1" stop-color="${bg[1]}"/></radialGradient>
<linearGradient id="pk${u}" x1="0" x2="1"><stop offset="0" stop-color="${skin}"/><stop offset="1" stop-color="${skin}" stop-opacity=".82"/></linearGradient>
<linearGradient id="pc${u}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${cloak}"/><stop offset="1" stop-color="#000" stop-opacity=".55"/></linearGradient>
<radialGradient id="pl${u}" cx="30%" cy="25%" r="90%"><stop offset="0" stop-color="#fff" stop-opacity=".22"/><stop offset=".6" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity=".4"/></radialGradient></defs>
<rect width="100" height="120" fill="url(#pb${u})"/>${hairBack}
<path d="M6 122c0-24 16-34 32-38l12 8 12-8c16 4 32 14 32 38z" fill="url(#pc${u})"/>
${collar ? `<path d="M10 122c0-20 12-30 28-36l12 12 12-12c16 6 28 16 28 36z" fill="${collar}" opacity=".92"/><path d="M38 86l12 12 12-12" fill="none" stroke="#000" stroke-opacity=".25"/>` : ''}
<rect x="43" y="70" width="14" height="20" rx="5" fill="url(#pk${u})"/>
<ellipse cx="50" cy="50" rx="19" ry="23" fill="url(#pk${u})"/>
<ellipse cx="31.5" cy="52" rx="3" ry="5" fill="${skin}"/><ellipse cx="68.5" cy="52" rx="3" ry="5" fill="${skin}"/>
${hairTop}${bd}
<path d="M38 43q4-3 8 0M54 43q4-3 8 0" stroke="${hair === '#e9e6e0' ? '#999' : hair}" stroke-width="2" fill="none" stroke-linecap="round"/>
<ellipse cx="42" cy="49" rx="2.2" ry="1.4" fill="${eye}"/><ellipse cx="58" cy="49" rx="2.2" ry="1.4" fill="${eye}"/>
<path d="M50 50v9l-2 1.5h4" stroke="#000" stroke-opacity=".22" fill="none" stroke-width="1.1"/>
<path d="M44 66q6 3 12 0" stroke="${beard ? '#3a2416' : '#9b4b3d'}" stroke-width="1.6" fill="none" stroke-linecap="round"/>${lines}${extra}
<rect width="100" height="120" fill="url(#pl${u})"/></svg>`;
}
export const P = {
  eddard: () => portrait({ hair: '#4b3d33', beard: '#4b3d33', cloak: '#5b646e', collar: '#8a8f96', age: 1, bg: ['#37474a', '#141b1c'] }),
  robb: () => portrait({ skin: '#e3c0a0', hair: '#7a3b22', style: 'long', cloak: '#59626d', collar: '#8a8f96', bg: ['#33434a', '#12181b'] }),
  hoster: () => portrait({ skin: '#d8b8a0', hair: '#e9e6e0', style: 'white', beard: '#e0ddd6', cloak: '#2f4f86', collar: '#8e2f2a', age: 1, bg: ['#2f4258', '#10151c'] }),
  edmure: () => portrait({ skin: '#e0bd9c', hair: '#8a3f22', cloak: '#2f4f86', collar: '#8e2f2a', bg: ['#2f4258', '#10151c'] }),
  robert: () => portrait({ skin: '#e0b998', hair: '#1c1613', beard: '#1c1613', cloak: '#c39a26', collar: '#2a2320', style: 'short', bg: ['#4b3a1c', '#17110a'] }),
  rodrik: () => portrait({ skin: '#d6ae8c', hair: '#c8c2b8', style: 'bald', beard: '#c8c2b8', cloak: '#59626d', collar: '#3d4249', age: 1, bg: ['#37474a', '#141b1c'] }),
  erik: () => portrait({ skin: '#cda88a', hair: '#251c17', beard: '#3a2a20', cloak: '#1f2426', collar: '#3b3f40', style: 'long', bg: ['#22303a', '#0d1114'] }),
  lysa: () => portrait({ skin: '#ecd0b8', hair: '#8a4527', style: 'long', cloak: '#86aad0', collar: '#e8eef5', bg: ['#3a4f66', '#111820'] }),
  donella: () => portrait({ skin: '#e4c6ac', hair: '#b8b2a8', style: 'long', cloak: '#6b4a2b', collar: '#3d2a18', age: 1, bg: ['#3c3428', '#15110c'] }),
  mance: () => portrait({ skin: '#cfa98a', hair: '#2b211b', beard: '#2b211b', cloak: '#3b3a3a', collar: '#111', age: 1, bg: ['#26302f', '#0d1211'] }),
};
export const pf = (k, cls = 'pf') => `<span class="${cls}">${P[k]()}</span>`;
export const person = (k, name, sub) => `<span class="pchip">${pf(k)}<span>${name}${sub ? `<small>${sub}</small>` : ''}</span></span>`;

/* ---- reusable HUD blocks ---- */
export const hudTop = ({ vitals = true, inbox = 3, right = true, rightOffset = '' } = {}) => `
<div class="hud hud-tl">
  <div class="panel plate">${crest('stark')}<div><div class="house">House Stark</div><div class="date">15th of the 8th Moon, 298 AC</div><div class="season">${ico('sun')} Late summer &middot; the days shorten</div></div></div>
  ${vitals ? `<div class="panel vitals">
    <div class="vital">${ico('coin')}<div><b>120,000</b><small>Coin</small></div><span class="tr up">&#9650;</span></div>
    <div class="vital">${ico('men')}<div><b>17,200</b><small>Men</small></div><span class="tr flat">&#9644;</span></div>
    <div class="vital">${ico('food')}<div><b>30 <span style="font-size:.72em;color:var(--muted)">moons</span></b><small>Food</small></div><span class="tr down">&#9660;</span></div>
  </div>` : ''}
</div>
${right ? `<div class="hud hud-tr" ${rightOffset ? `style="${rightOffset}"` : ''}>
  <div class="panel iconbtn" title="Inbox">${ico('mail')}${inbox ? `<span class="badge">${inbox}</span>` : ''}</div>
  <div class="panel endturn"><div class="go">End turn &#9654;</div><div class="why">next: <b>7 days</b> &mdash; the banners gather</div></div>
  <div class="panel iconbtn" title="Menu">${ico('menu')}</div>
</div>` : ''}`;
export const stripBlock = (lines = null) => {
  const L = lines || [[0, 'Eleven northern houses answer Stark’s call'], [0, 'Lord Hoster Tully falls ill at Riverrun'], [1, 'Snow falls on the Wall']];
  return `<div class="hud strip panel"><h4><span>Chronicle &middot; <b>2 new</b></span><span>all &#9656;</span></h4>${L.map(([o, t]) => `<div class="ln ${o ? 'old' : ''}"><i></i><span>${t}</span></div>`).join('')}</div>`;
};
export const cmdBlock = (order = true) => `<div class="hud cmd panel">${order ? `<div class="order"><span><b style="font-family:var(--display);color:var(--gold)">1</b>&ensp;Send Ser Rodrik to hold the Stony Shore</span><em>DONE</em></div>` : ''}<div class="row"><div class="in">Command your house&hellip;</div><div class="sq" title="Suggest">${ico('spark')}</div><div class="sq" title="Add">${ico('plus')}</div></div></div>`;
export const whoBlock = () => `<div class="hud who"><div class="panel nm"><b>Eddard Stark</b><small>Lord of Winterfell, Warden of the North</small><span class="mood">in good health</span></div><div class="ring"><div>${P.eddard()}</div></div></div>`;
export const tagBlock = (extra = '') => `<div class="tag">MOCKUP &mdash; target design (GDD 17/18/19)${extra}</div>`;

export const page = ({ title, css = '', body, bg = null, bgSmall = null, cls = '' }) => `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${title}</title>
<style>${FONTS}${BASE_CSS}
${bg ? `.map{background-image:url(${bg})}${bgSmall ? `@media (max-width:1500px){.map{background-image:url(${bgSmall})}}` : ''}` : ''}
${css}</style></head>
<body class="${cls}">${SPRITE}
${bg ? '<div class="map"></div>' : ''}
${body}
${tagBlock()}
</body></html>`;

export const spark = (pts, color, w = 64, h = 22, faint = false) => {
  const min = Math.min(...pts), max = Math.max(...pts), r = max - min || 1;
  const xy = pts.map((v, i) => [(i / (pts.length - 1)) * (w - 4) + 2, h - 3 - ((v - min) / r) * (h - 6)]);
  const d = xy.map((p, i) => (i ? 'L' : 'M') + p[0].toFixed(1) + ' ' + p[1].toFixed(1)).join('');
  const l = xy[xy.length - 1];
  return `<svg width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" style="overflow:visible"><path d="${d}" fill="none" stroke="${color}" stroke-width="1.6" stroke-linejoin="round" stroke-linecap="round" ${faint ? 'stroke-dasharray="3 2.5" opacity=".8"' : ''}/><circle cx="${l[0]}" cy="${l[1]}" r="2.1" fill="${color}"/></svg>`;
};
