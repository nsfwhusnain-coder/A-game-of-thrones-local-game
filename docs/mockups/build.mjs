// Generates the eight self-contained mockup pages: `node docs/mockups/build.mjs` (the pages are plain HTML; edit either).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { page, ico, crest, P, pf, person, hudTop, stripBlock, cmdBlock, whoBlock, spark } from './lib.mjs';
const OUT = path.dirname(fileURLToPath(import.meta.url));
const write = (n, html) => fs.writeFileSync(path.join(OUT, n), html);
const S = (d, n) => [`../screens/${d}/${n}-1920x1080.jpg`, `../screens/${d}/${n}-1366x768.jpg`];

/* ============ 01 before, annotated ============ */
{
  const [bg, bgS] = S('e2', 'mode-political');
  // [n, x1, y1, x2, y2 in 1920x1080 px, badge x, badge y, title, problem]
  const C = [
    [1, 18, 10, 1008, 94, 1010, 8, 'Six-tile resource bar', 'Treasury, Levies, Men-at-arms, Ships, Food, Season: 6 labels, 6 values, 6 sub-lines. About 1000 px wide (three quarters of the screen at 1366). The player speaks and the AI acts, so these are read-outs, not levers. Keep 3 vitals.'],
    [2, 1030, 10, 1258, 68, 1142, 82, 'Date box + turn counter', 'Date, "Turn 0" and "N decisions awaiting" in one box. Drop the turn number; fold the pending count into one Inbox badge.'],
    [3, 1608, 14, 1904, 62, 1895, 78, 'Six system icons', 'Ravens, music, undo, help, settings, menu: six icons at the same weight. Collapse into one menu button.'],
    [4, 1408, 14, 1594, 62, 1500, 80, 'End turn', 'The most important control is fine, but its reason ("next turn: 7 days, a quiet week") is a separate tiny line elsewhere. Put it inside the button.'],
    [5, 38, 196, 573, 511, 590, 208, '"Your situation" card', 'Five lines of prose plus Aims and Levers, at the top of the feed on turn 0. Show once as a welcome card, then never again.'],
    [6, 38, 522, 573, 890, 590, 540, '"How to play" wall', 'Eleven bullets (about 25 lines) that push the real chronicle out of sight. Move to the ? help; replace with three coach marks.'],
    [7, 30, 908, 580, 1048, 594, 930, 'Order composer in the drawer', 'The command bar is trapped in the drawer and dies when the drawer collapses. Give it its own bottom-centre bar.'],
    [8, 1778, 90, 1904, 126, 1748, 108, 'Nine map modes', 'Realms, Holders, Diplomacy, Knowledge, War, Wealth, Prosperity, Unrest, Terrain behind one dropdown. One dropdown with three pinned favourites is enough.'],
    [9, 940, 972, 1606, 1062, 1620, 990, 'Eight-button dock', 'Realm, Council, Military, Economy, Diplomacy, Intrigue, People, Chronicle, always on: the "economy and military buttons all the time" the owner objects to, plus a fourth badge system. Replace with three menu entries.'],
    [10, 1618, 972, 1904, 1062, 1626, 950, 'Portrait plate', 'Keep it, it is the player’s face. It is small, sits beside the dock and has no life in it: make it larger, framed and warmer.'],
    [11, 676, 676, 1060, 766, 1066, 690, 'Colliding map labels', '"LANNI~300" and "KINGS SHIPS ING" overlap: army tokens and region names fight. Label declutter is work package U8.'],
  ];
  const boxes = C.map(([n, x1, y1, x2, y2, bx, by]) => `<div class="cb" style="left:${x1 / 19.2}%;top:${y1 / 10.8}%;width:${(x2 - x1) / 19.2}%;height:${(y2 - y1) / 10.8}%"></div><div class="cn" style="left:${bx / 19.2}%;top:${by / 10.8}%">${n}</div>`).join('');
  const leg = C.map(([n, , , , , , , t, p]) => `<li><span class="cn s">${n}</span><div><b>${t}</b><p>${p}</p></div></li>`).join('');
  write('01-before-annotated.html', page({
    title: 'Before: annotated', cls: 'b4', css: `
    body{display:flex;background:#0b0907}
    .left{flex:1;min-width:0;display:flex;flex-direction:column;padding:.6rem 0 .6rem .6rem;gap:.6rem}
    .shot{position:relative;width:min(100%,calc((100vh - 5.6rem) * 16 / 9));aspect-ratio:16/9;border:1px solid var(--line2);box-shadow:var(--shadow);background:#000 url(${bg}) center/cover no-repeat}
    @media (max-width:1500px){.shot{background-image:url(${bgS})}}
    .cb{position:absolute;border:2px solid #ff4a3a;border-radius:3px;box-shadow:0 0 0 1px rgba(0,0,0,.6),0 0 14px rgba(255,74,58,.35)}
    .cn{position:absolute;transform:translate(-50%,-50%);width:1.55rem;height:1.55rem;border-radius:50%;background:#d8281a;border:2px solid #fff;color:#fff;font:700 .85rem/1 sans-serif;display:grid;place-items:center;box-shadow:0 2px 6px rgba(0,0,0,.7)}
    .cn.s{position:static;transform:none;flex:none;margin-top:.1rem}
    .stats{display:flex;gap:1rem;width:min(100%,calc((100vh - 5.6rem) * 16 / 9))}
    .stat{flex:1;padding:.5rem .8rem;text-align:center}
    .stat b{display:block;font:700 1.55rem/1 var(--display);color:#ff7a68}
    .stat span{display:block;font-size:.85rem;color:var(--muted);margin-top:.25rem}
    aside{width:26.5rem;flex:none;padding:.9rem 1rem .6rem;overflow:auto;background:#120e0a;border-left:1px solid var(--line)}
    aside h2{font-size:1.05rem;letter-spacing:.12em;margin-bottom:.15rem;color:#ff8a78}
    aside .sub{color:var(--muted);font-style:italic;font-size:.9rem;margin:0 0 .7rem}
    ol{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:.55rem}
    li{display:flex;gap:.6rem}
    li b{font:600 .8rem/1.2 var(--display);letter-spacing:.05em;color:var(--gold2)}
    li p{margin:.1rem 0 0;font-size:.86rem;line-height:1.25;color:#cfc2a4}
    @media (max-width:1500px){aside{width:24.5rem;padding:.6rem .8rem}li p{font-size:.8rem;line-height:1.2}ol{gap:.38rem}}
    .tag{left:calc(50% - 13rem)}`,
    body: `<div class="left"><div class="shot">${boxes}</div>
      <div class="stats"><div class="panel stat"><b>~40</b><span>controls and read-outs on screen at turn 0</span></div><div class="panel stat"><b>55%</b><span>of the pixels covered at 1366&times;768</span></div><div class="panel stat"><b>3</b><span>badge systems for "something needs you"</span></div><div class="panel stat"><b>11</b><span>bullets of "How to play" always open</span></div></div></div>
      <aside><h2>Today: what is wrong</h2><p class="sub">The current UI at turn 0 (docs/screens/e2), before any player input. GDD 17 &sect;1.</p><ol>${leg}</ol></aside>`,
  }));
}

/* ============ 02 target HUD ============ */
{
  const [bg, bgS] = S('e1', 'lod1');
  write('02-target-hud.html', page({ title: 'Target: the quiet HUD', bg, bgSmall: bgS, body: hudTop() + '<div class="panel modechip">' + ico('eye') + 'Realms &#9662;</div>' + stripBlock() + cmdBlock() + whoBlock() }));
}

/* ============ 03 headline feed ============ */
const CARD_CSS = `
.card{display:grid;grid-template-columns:.42rem 1fr;background:linear-gradient(90deg,rgba(255,255,255,.03),rgba(0,0,0,0));border:1px solid var(--line);border-radius:3px;overflow:hidden}
.card .bar{background:var(--muted)}
.card.great{border-color:rgba(201,164,74,.75);box-shadow:0 0 0 1px rgba(201,164,74,.15),0 4px 18px rgba(0,0,0,.4);background:linear-gradient(90deg,rgba(201,164,74,.09),rgba(0,0,0,0))}
.card.great .bar{background:linear-gradient(#f3d98d,#a67c2a)}
.card.major .bar{background:var(--amber)}
.card.news .bar{background:var(--blue)}
.card.minor .bar{background:#6e6250}
.card.meanwhile .bar{background:repeating-linear-gradient(#5b5140 0 .3rem,transparent .3rem .5rem)}
.card .in{padding:.55rem .85rem .55rem .8rem;min-width:0}
.tier{display:flex;align-items:center;gap:.5rem;font:600 .6rem/1 var(--display);letter-spacing:.16em;text-transform:uppercase;color:var(--muted)}
.great .tier{color:var(--gold2)}.major .tier{color:var(--amber)}.news .tier{color:#8db3e0}
.tier .pips{letter-spacing:.1em;font-size:.7rem}
.tier .mine{margin-left:auto;color:var(--gold);border:1px solid rgba(201,164,74,.5);padding:.15rem .4rem;border-radius:2px;letter-spacing:.12em}
.card h3{font:600 1.12rem/1.22 var(--display);letter-spacing:.02em;color:#f6ecd2;margin:.35rem 0 .2rem}
.great h3{font-size:1.3rem}
.minor h3{font-size:.98rem;color:var(--text);margin:.3rem 0 0}
.card p{margin:0;font-size:1rem;line-height:1.32;color:#d7cbb0}
.meta{display:flex;align-items:center;gap:.45rem;margin-top:.35rem;font-size:.86rem;color:var(--muted);font-style:italic}
.meta svg{width:.95em;height:.95em;color:var(--gold)}
.meta .dt{font-style:normal;font-variant:small-caps;letter-spacing:.06em}
.meta .more{margin-left:auto;font:600 .64rem/1 var(--display);letter-spacing:.1em;font-style:normal;color:var(--gold);text-transform:uppercase;cursor:pointer;white-space:nowrap}
`;
{
  const [bg, bgS] = S('e1', 'lod1');
  const card = (t, h, s, dt, pl, o = {}) => `<article class="card ${t} ${o.cls || ''}"><div class="bar"></div><div class="in">
    <div class="tier"><span class="pips">${{ great: '&#9670;&#9670;&#9670;', major: '&#9670;&#9670;', news: '&#9670;', minor: '&#9675;', meanwhile: '&middot;' }[t]}</span>${{ great: 'Great news', major: 'Major', news: 'News', minor: 'Minor', meanwhile: 'Meanwhile' }[t]}${o.mine ? `<span class="mine">${o.mine}</span>` : ''}</div>
    <h3>${h}</h3>${s ? `<p>${s}</p>` : ''}
    <div class="meta">${ico('pin')}<span class="dt">${dt}</span> &middot; <span>${pl}</span><span class="more">Details &#9656;</span></div></div></article>`;
  const cards = [
    card('great', 'The King’s progress reaches Winterfell', 'King Robert rides through the gate with the Queen, her brothers and three hundred knights. Men say he means to make Lord Eddard his Hand.', '15th of the 8th moon', 'Winterfell', { mine: 'Your house' }),
    card('major', 'Robb Stark calls the banners at Winterfell', 'Nineteen sworn houses are told to bring their men to Winterfell before the first snow. The first ravens have already flown.', '13th of the 8th moon', 'Winterfell', { mine: 'Your kin' }),
    card('major', 'Lord Hoster Tully falls ill at Riverrun', 'A raven from Riverrun says Lord Hoster has kept to his bed for a fortnight. Ser Edmure holds the castle in his name.', '12th of the 8th moon', 'Riverrun &middot; raven, 4 days old', { mine: 'Your kin' }),
    card('news', 'Lady Hornwood refuses Stark’s summons', 'Donella Hornwood will keep her men at home. Word of it reached Winterfell with the first ravens.', '11th of the 8th moon', 'Hornwood'),
    card('news', 'Lady Lysa raises the Vale’s levies at the Eyrie', 'House Arryn is calling its banners; nothing yet says against whom.', '10th of the 8th moon', 'The Eyrie &middot; rumour', { cls: 'opt' }),
    card('news', 'Mance Rayder gathers the free folk beyond the Wall', 'A great host of wildlings is answering him. The Night’s Watch has not yet learned how many.', '9th of the 8th moon', 'Castle Black &middot; a ranger’s word', { cls: 'opt' }),
    card('minor', 'Lord Bolton begins a market at the Dreadfort', '', '9th of the 8th moon', 'The Dreadfort'),
    card('meanwhile', 'Lords ride to feasts and hunts across the Reach and the Vale', 'A Pentoshi galley was wrecked off Widow’s Watch.', 'This week', 'The realm'),
  ].join('');
  write('03-headline-feed.html', page({
    title: 'Target: headline feed', bg, bgSmall: bgS, css: CARD_CSS + `
    .feed{position:fixed;left:1rem;top:5.6rem;bottom:1rem;width:41rem;max-width:calc(100vw - 30rem);display:flex;flex-direction:column;z-index:6}
    .feed header{padding:.7rem 1rem .6rem;border-bottom:1px solid var(--line)}
    .feed header .r1{display:flex;justify-content:space-between;align-items:center}
    .feed h2{font-size:1.1rem;letter-spacing:.1em}
    .feed header small{color:var(--muted);font-style:italic}
    .filters{display:flex;gap:.4rem;margin-top:.5rem;flex-wrap:wrap;align-items:center}
    .filters .chip{cursor:pointer}
    .filters .chip.on{color:var(--gold2);border-color:var(--gold);background:rgba(201,164,74,.12)}
    .filters .sp{margin-left:auto;font-size:.85rem;color:var(--muted);font-style:italic}
    .list{flex:1;overflow:hidden;padding:.7rem .8rem;display:flex;flex-direction:column;gap:.5rem;position:relative}
    .day{font:600 .62rem/1 var(--display);letter-spacing:.2em;color:var(--muted);text-transform:uppercase;display:flex;gap:.6rem;align-items:center}
    .day:after{content:"";flex:1;border-top:1px solid var(--line)}
    @media (max-height:800px){.opt{display:none}}
    .hint{position:fixed;left:44rem;top:8rem;width:14rem;color:var(--gold2);font-style:italic;font-size:.95rem;text-shadow:0 1px 4px #000;display:none}`,
    body: hudTop({ vitals: false }) + `<section class="feed panel"><header><div class="r1"><h2>Chronicle</h2><small>8th moon, 298 AC &middot; 5 new</small></div>
      <div class="filters"><span class="chip on">&#10003; Only what matters</span><span class="chip">Mine</span><span class="chip">War</span><span class="chip">Letters</span><span class="chip">Rumours</span><span class="sp">${ico('x')}</span></div></header>
      <div class="list"><div class="day">Today</div>${cards}</div></section>` + whoBlock(),
  }));
}

/* ============ 04 expanded event card ============ */
{
  const [bg, bgS] = S('e5', 'tokens-l1');
  write('04-event-card-expanded.html', page({
    title: 'Target: expanded event card', bg, bgSmall: bgS, css: CARD_CSS + `
    .ec{position:fixed;left:50%;top:50%;transform:translate(-50%,-50%);width:min(54rem,94vw);z-index:8;display:grid;grid-template-columns:.5rem 1fr;overflow:hidden}
    .ec .bar{background:linear-gradient(#f3d98d,#a67c2a)}
    .ec .in{padding:1.1rem 1.5rem 1.1rem 1.3rem;position:relative}
    .ec h1{font:600 1.75rem/1.15 var(--display);letter-spacing:.02em;color:#f6ecd2;margin:.5rem 0 .55rem;padding-right:2rem}
    .ec .lead{font-size:1.18rem;line-height:1.38;color:#e2d6ba;margin:0 0 .9rem}
    .cols{display:grid;grid-template-columns:1.1fr 1fr;gap:1.4rem}
    h4.sec{font-size:.66rem;letter-spacing:.2em;color:var(--muted);text-transform:uppercase;margin:0 0 .45rem;padding-bottom:.3rem;border-bottom:1px solid var(--line)}
    .det{list-style:none;margin:0;padding:0;font-size:1rem}
    .det li{display:flex;justify-content:space-between;gap:1rem;padding:.28rem 0;border-bottom:1px dotted rgba(107,83,52,.5)}
    .det li span:first-child{color:var(--muted)}
    .det li b{font-weight:500;color:var(--text);text-align:right}
    .det .loss b{color:#e8806b}.det .win b{color:var(--green)}
    .scene{height:9.5rem;border:1px solid var(--line2);border-radius:3px;position:relative;background:url(${bg}) 11% 45%/400% no-repeat;box-shadow:inset 0 0 30px rgba(0,0,0,.5)}
    @media (max-width:1500px){.scene{background-image:url(${bgS})}}
    .scene .mk{position:absolute;left:50%;top:50%;width:1.6rem;height:1.6rem;margin:-.8rem;border-radius:50%;border:2px solid #ffd76a;box-shadow:0 0 0 4px rgba(255,215,106,.25),0 0 20px rgba(255,215,106,.6)}
    .scene .mk:after{content:"";position:absolute;inset:.35rem;border-radius:50%;background:#ffd76a}
    .scene .lb{position:absolute;left:.6rem;bottom:.5rem;font:600 .7rem/1 var(--display);letter-spacing:.1em;color:#fff;text-shadow:0 0 4px #000,0 0 8px #000}
    .people{display:flex;flex-wrap:wrap;gap:.5rem;margin:.9rem 0 .2rem}
    .foot{display:flex;gap:.6rem;align-items:center;margin-top:1rem;padding-top:.8rem;border-top:1px solid var(--line)}
    .foot .sp{margin-left:auto;font-size:.88rem;color:var(--muted);font-style:italic}
    .ec .meta{margin:0;font-size:.95rem}`,
    body: hudTop({ vitals: false }) + '<div class="dim" style="background:rgba(8,6,4,.5)"></div>' + `
    <article class="ec panel"><div class="bar"></div><div class="in"><span class="x">${ico('x')}</span>
      <div class="tier" style="display:flex;align-items:center;gap:.5rem;font:600 .68rem/1 var(--display);letter-spacing:.16em;color:var(--gold2);text-transform:uppercase"><span>&#9670;&#9670;&#9670;</span>Great news &middot; battle<span class="mine" style="margin-left:auto;margin-right:2rem;color:var(--gold);border:1px solid rgba(201,164,74,.5);padding:.2rem .45rem;border-radius:2px">Your host</span></div>
      <h1>Northmen scatter ironborn raiders on the Stony Shore</h1>
      <div class="meta" style="margin:0 0 .8rem">${ico('pin')}<span class="dt">12th of the 8th moon, 298 AC</span> &middot; <span>The Stony Shore, three days west of Winterfell</span></div>
      <p class="lead">Ser Rodrik’s riders caught three longships beached at dusk and drove the crews back into the surf. Most of the raiders were killed or taken, and their captain was among the captives. Your host lost few.</p>
      <div class="cols"><div><h4 class="sec">Details</h4><ul class="det">
        <li><span>Your host</span><b>Stark levies, about 600</b></li>
        <li class="loss"><span>Your losses</span><b>~40 dead, ~70 wounded</b></li>
        <li><span>The raiders</span><b>~180 ironborn, 3 longships</b></li>
        <li class="win"><span>Their losses</span><b>~110 dead, 23 taken</b></li>
        <li><span>Ships</span><b>2 burned, 1 taken</b></li>
        <li><span>Ground</span><b>Shingle beach, dusk</b></li></ul></div>
        <div><h4 class="sec">Where</h4><div class="scene"><div class="mk"></div><span class="lb">THE STONY SHORE</span></div></div></div>
      <div class="people">${person('rodrik', 'Ser Rodrik Cassel', 'commanded, unhurt')}${person('erik', 'Erik Saltbeard', 'ironborn captain, taken')}${person('eddard', 'Eddard Stark', 'your lord')}</div>
      <div class="foot"><span class="btn primary">${ico('pin')} Show on map</span><span class="btn">${ico('raven')} Ransom the captain</span><span class="btn ghost">Send Ser Rodrik a raven</span><span class="sp">Facts: 6 &middot; your maester wrote this</span></div>
    </div></article>` + whoBlock(),
  }));
}

/* ============ 05 turn digest ============ */
{
  const [bg, bgS] = S('e1', 'lod1');
  write('05-turn-digest.html', page({
    title: 'Target: end-of-week digest', bg, bgSmall: bgS, css: `
    .dg{width:min(47rem,94vw);padding:1.5rem 2.2rem 1.3rem;position:relative}
    .dg .kick{text-align:center;font:600 .68rem/1 var(--display);letter-spacing:.3em;color:#8a6a3a;text-transform:uppercase}
    .dg h1{font:700 1.55rem/1.2 var(--display);text-align:center;letter-spacing:.04em;margin:.5rem 0 .2rem;color:#4a2f0c}
    .orn{display:flex;align-items:center;gap:.7rem;justify-content:center;color:#8a6a3a;margin:.5rem 0 .8rem}
    .orn:before,.orn:after{content:"";flex:1;border-top:1px solid rgba(90,58,18,.4)}
    .hl{display:grid;grid-template-columns:2rem 1fr;gap:.2rem .5rem;padding:.42rem 0}
    .hl+.hl{border-top:1px dotted rgba(90,58,18,.35)}
    .hl .n{font:700 1.5rem/1 var(--display);color:#a47a2a}
    .hl h3{font:600 1.1rem/1.2 var(--display);color:#3a230a;letter-spacing:.02em}
    .hl p{margin:.15rem 0 0;font-size:1.05rem;line-height:1.3;color:#3b2d1c}
    .sect{font:600 .68rem/1 var(--display);letter-spacing:.24em;text-transform:uppercase;color:#7a5a2a;margin:.9rem 0 .35rem}
    .meanw{font-style:italic;font-size:1.05rem;line-height:1.35;color:#43331f;margin:0}
    .also{font-size:.95rem;color:#5a4a34;margin:.4rem 0 0}
    .await{display:flex;flex-direction:column;gap:.35rem}
    .aw{display:flex;align-items:center;gap:.7rem;padding:.4rem .7rem;background:rgba(90,58,18,.09);border:1px solid rgba(90,58,18,.3);border-radius:3px;font-size:1.02rem;color:#2f2214}
    .aw span{flex:1}
    .aw em{font:600 .6rem/1 var(--display);letter-spacing:.12em;font-style:normal;color:#7a3a1a;text-transform:uppercase;border:1px solid rgba(122,58,26,.5);padding:.25rem .45rem;border-radius:2px}
    .go{display:flex;justify-content:center;margin-top:1rem}
    .go .btn{font-size:.95rem;padding:.65rem 2.6rem}`,
    body: '<div class="dim"></div>' + `<div class="center"><section class="dg parch">
      <div class="kick">The maester’s report</div>
      <h1>The week of 8&ndash;14th of the 8th moon, 298 AC</h1><div class="orn">&#10087;</div>
      <div class="hl"><span class="n">1</span><div><h3>Eleven northern houses answer Stark’s call</h3><p>Lords across the North gather their men for Winterfell; only Hornwood refused.</p></div></div>
      <div class="hl"><span class="n">2</span><div><h3>The King’s progress reaches Winterfell</h3><p>King Robert rides in with the Queen, her brothers and three hundred knights.</p></div></div>
      <div class="hl"><span class="n">3</span><div><h3>Lord Hoster Tully falls ill at Riverrun</h3><p>A raven from Riverrun says he has kept to his bed for a fortnight.</p></div></div>
      <div class="sect">Meanwhile&hellip;</div>
      <p class="meanw">Lords ride to feasts and hunts across the Reach and the Vale; a Pentoshi galley was wrecked off Widow’s Watch.</p>
      <p class="also"><b>Also:</b> tourney at Bear Island proclaimed &middot; Lord Bolton opens a market</p>
      <div class="sect">Awaiting your word</div>
      <div class="await"><div class="aw"><span>The King asks you to name a day for the feast.</span><em>Audience</em></div><div class="aw"><span>Lady Hornwood’s answer is still unanswered.</span><em>Letter</em></div></div>
      <div class="go"><span class="btn primary">Continue &#9654;</span></div>
    </section></div>`,
  }));
}

/* ============ 06 realm ledger ============ */
{
  const [bg, bgS] = S('e4', 'labels-l1');
  const G = '#74b84e', R = '#e0664f', M = '#a8977a';
  // [id, name, sub, power, men, coin, food, ships, lands, series, word, you, faint]
  const H = [
    ['lannister', 'Lannister', 'raven, 6 days old', '71 ~', '~52,000', '<i>said to be rich</i>', '&mdash;', '~40', '~9', [30, 32, 33, 36, 40, 46, 52], 'up', 0],
    ['tyrell', 'Tyrell', 'rumour, a moon old ?', '64 &asymp;', '&asymp; 40&ndash;55k', '&mdash;', '&mdash;', '~20', '~12', [46, 46, 47, 46, 47, 47, 48], 'flat', 1],
    ['stark', 'Stark', 'exact &middot; your house', '58', '17,200', '120,000', '30 moons', '4', '14', [9, 10, 12, 13, 15, 16, 17.2], 'up', 0, 1],
    ['baratheon', 'Baratheon', 'a rider, 9 days old', '44 ~', '~30,000', '<i>pressed</i>', '&mdash;', '~60', '&ge; 6', [38, 37, 35, 34, 33, 31, 30], 'down', 0],
    ['arryn', 'Arryn', 'raven, 4 days old', '41 ~', '~24,000', '&mdash;', '&mdash;', '~10', '~5', [14, 14, 15, 17, 19, 22, 24], 'up', 0],
    ['greyjoy', 'Greyjoy', 'seen off the coast, 3 days', '36 ~', '~20,000', '&mdash;', '&mdash;', '~100', '~7', [18, 19, 19, 20, 19, 20, 20], 'flat', 0],
    ['tully', 'Tully', 'sworn ally &middot; this moon', '33 ~', '~9,000', '&asymp; 30&ndash;50k', '~12 moons', '~8', '~11', [12, 12, 11, 11, 10, 9.5, 9], 'down', 0],
    ['martell', 'Martell', 'long unheard of ?', '30 &asymp;', '&asymp; 12&ndash;18k', '&mdash;', '&mdash;', '~25', '~6', [15, 15, 15, 14, 15, 15, 15], 'flat', 1],
  ];
  const rows = H.map(([id, n, sub, pw, men, coin, food, ships, lands, ser, word, faint, you], i) => {
    const col = word === 'up' ? G : word === 'down' ? R : M;
    const est = !you;
    return `<div class="tr ${you ? 'you' : ''} ${faint ? 'faint' : ''}"><span class="rk">${i + 1}</span>
      <span class="hs">${crest(id)}<span class="nm"><b>${n}${you ? ' <em>you</em>' : ''}</b><small>${sub}</small></span></span>
      <span class="c s pw">${pw}</span><span class="c s">${men}</span><span class="c e">${coin}</span><span class="c e">${food}</span><span class="c s">${ships}</span><span class="c">${lands}</span>
      <span class="tn">${spark(ser, col, 58, 22, est)}<span class="chip ${word}">${word === 'up' ? '&#9650; Rising' : word === 'down' ? '&#9660; Falling' : '&#9644; Steady'}</span></span></div>`;
  }).join('');
  write('06-realm-ledger.html', page({
    title: 'Target: State of the Realm', bg, bgSmall: bgS, cls: 'led', css: `
    .dim{background:rgba(8,6,4,.62)}
    .led .hud-tl .vitals,.led .strip,.led .cmd{display:none}
    .led .hud-tr{right:59.5rem}
    .win{position:fixed;z-index:8;right:1rem;top:1rem;bottom:1rem;width:57rem;display:flex;flex-direction:column;overflow:hidden}
    .win header{display:flex;align-items:center;gap:1rem;padding:.75rem 1.1rem .6rem;border-bottom:1px solid var(--line);position:relative}
    .win h2{font-size:1.3rem;letter-spacing:.1em}
    .win header small{color:var(--muted);font-style:italic;font-size:.95rem;flex:1}
    .seg{display:flex;border:1px solid var(--line2);border-radius:3px;overflow:hidden;font:600 .62rem/1 var(--display);letter-spacing:.08em}
    .seg span{padding:.4rem .6rem;color:var(--muted)}.seg span.on{background:rgba(201,164,74,.18);color:var(--gold2)}
    .win header .cl{color:var(--muted)}
    .lens{display:flex;align-items:center;gap:.2rem;padding:.5rem 1.1rem 0;border-bottom:1px solid var(--line)}
    .lens .t{font:600 .78rem/1 var(--display);letter-spacing:.1em;text-transform:uppercase;padding:.6rem 1rem .55rem;color:var(--muted);border-bottom:2px solid transparent;margin-bottom:-1px}
    .lens .t.on{color:var(--gold2);border-color:var(--gold)}
    .lens .sp{margin-left:auto;font-size:.85rem;color:var(--muted);padding-bottom:.4rem}
    .lens .sp b{font-weight:500;color:var(--gold2);border:1px solid var(--line2);padding:.15rem .5rem;border-radius:2px;margin-left:.3rem}
    .going{display:flex;gap:1.6rem;padding:.6rem 1.1rem;background:rgba(0,0,0,.22);border-bottom:1px solid var(--line);font-size:1rem}
    .going div{display:flex;gap:.5rem;align-items:baseline;flex-wrap:wrap}
    .going .k{font:600 .6rem/1 var(--display);letter-spacing:.18em;color:var(--muted);text-transform:uppercase}
    .tbl{padding:.4rem 1.1rem .2rem}
    .th,.tr{display:grid;grid-template-columns:1.4rem 10.6rem 4.1rem 6.3rem 5.9rem 4.7rem 3.1rem 3.1rem 1fr;gap:.35rem;align-items:center}
    .th{font:600 .58rem/1 var(--display);letter-spacing:.14em;color:var(--muted);text-transform:uppercase;padding:.35rem 0;border-bottom:1px solid var(--line)}
    .th .c,.tr .c{text-align:right}
    .th .s{color:var(--gold)}
    .tr{padding:.32rem 0;border-bottom:1px solid rgba(77,60,40,.55);font-size:1rem}
    .tr .rk{font:600 .85rem var(--display);color:var(--muted)}
    .hs{display:flex;align-items:center;gap:.55rem;min-width:0}
    .hs .crest{width:1.55rem;height:1.85rem;flex:none}
    .nm b{display:block;font:600 .95rem/1.1 var(--display);letter-spacing:.03em;color:var(--text)}
    .nm b em{font:600 .5rem var(--display);font-style:normal;letter-spacing:.14em;color:#1b1408;background:var(--gold);padding:.12rem .3rem;border-radius:2px;vertical-align:.12em;margin-left:.2rem;text-transform:uppercase}
    .nm small{display:block;font-size:.76rem;line-height:1.1;color:var(--muted);font-style:italic;white-space:nowrap}
    .tr .c{font-variant-numeric:tabular-nums;color:#d9cdb0}
    .tr .c.s{background:rgba(201,164,74,.07);margin:-.32rem 0;padding:.62rem .3rem;height:calc(100% + .64rem)}
    .tr .c.e i{font-size:.82rem;color:var(--muted)}
    .tr.you{background:linear-gradient(90deg,rgba(201,164,74,.2),rgba(201,164,74,.04));box-shadow:inset 3px 0 0 var(--gold)}
    .tr.you .c{color:#fff;font-weight:600}
    .tr.you .nm b{color:var(--gold2)}
    .tr.faint{opacity:.62}
    .tn{display:flex;align-items:center;justify-content:flex-end;gap:.5rem}
    .legend{display:flex;gap:1.1rem;flex-wrap:wrap;font-size:.82rem;color:var(--muted);font-style:italic;padding:.4rem 1.1rem .5rem}
    .legend b{font-style:normal;color:var(--gold2);font-weight:500}
    .say{display:grid;grid-template-columns:1.25fr 1fr;gap:1.1rem;padding:.7rem 1.1rem .85rem;border-top:1px solid var(--line);margin-top:auto;background:rgba(0,0,0,.2)}
    .say h4{font-size:.62rem;letter-spacing:.2em;color:var(--muted);text-transform:uppercase;margin-bottom:.35rem;font-weight:600}
    .say ul{margin:0;padding:0;list-style:none;font-size:.98rem;line-height:1.3;display:flex;flex-direction:column;gap:.3rem}
    .say li{display:flex;gap:.5rem}.say li:before{content:"\\00b7";color:var(--gold)}
    .say li small{color:var(--muted);font-style:italic;white-space:nowrap}
    .focus{display:flex;flex-direction:column;gap:.35rem}
    .focus .f{display:flex;align-items:center;gap:.6rem;justify-content:space-between;font-size:.95rem;line-height:1.2}
    .focus .btn{padding:.3rem .6rem;font-size:.66rem}
    @media (max-width:1500px){.led .hud{display:none}.win{left:50%;right:auto;top:50%;bottom:auto;transform:translate(-50%,-50%);height:92vh;width:min(57rem,94vw)}}`,
    body: '<div class="dim"></div>' + hudTop({ vitals: false }) + cmdBlock(false) + `
    <section class="win panel"><header><h2>State of the Realm</h2><small>as of the 15th of the 8th moon, 298 AC</small><div class="seg"><span>3</span><span class="on">6</span><span>12 moons</span></div><span class="cl">${ico('x')}</span></header>
      <div class="lens"><span class="t on">Strength</span><span class="t">Economy</span><span class="t">Lands</span><span class="t">Wars</span><span class="sp">Show <b>Great houses &#9662;</b></span></div>
      <div class="going"><div><span class="k">Rising</span><span class="chip up">&#9650; Lannister</span><span class="chip up">&#9650; Arryn</span><span class="chip up">&#9650; Stark</span></div><div><span class="k">Falling</span><span class="chip down">&#9660; Baratheon</span><span class="chip down">&#9660; Tully</span></div></div>
      <div class="tbl"><div class="th"><span></span><span>House</span><span class="c s">Power</span><span class="c s">Men</span><span class="c">Coin</span><span class="c">Food</span><span class="c s">Ships</span><span class="c">Lands</span><span class="c">Six moons</span></div>${rows}</div>
      <div class="legend"><span><b>~</b> an estimate, dated as the word reached you</span><span><b>&asymp;</b> a band, <b>&ge;</b> at least</span><span><b>?</b> older than two turns</span><span><b>&mdash;</b> nothing known</span><span>Dashed line: estimated history</span></div>
      <div class="say"><div><h4>What the realm is saying</h4><ul><li><span>Lannister banners are called <small>raven, 6 days old</small></span></li><li><span>Lord Hoster is ill; Tully strength may fall <small>Riverrun, 4 days</small></span></li><li><span>The Crown owes six million dragons <small>public</small></span></li></ul></div>
      <div><h4>Where to focus</h4><div class="focus"><div class="f"><span>Hornwood keeps 400 men at home</span><span class="btn">Send a raven</span></div><div class="f"><span>Winter comes; grain is 30 moons</span><span class="btn">Buy grain</span></div></div></div></div>
    </section>` + '',
  }));
}

/* ============ 07 menu and castle card ============ */
{
  const [bg, bgS] = S('e4', 'labels-l1');
  write('07-menu-and-card.html', page({
    title: 'Target: menu and castle card', bg, bgSmall: bgS, css: `
    .menu{position:fixed;right:1rem;top:5.4rem;width:19rem;z-index:8;padding:.5rem}
    .menu .it{display:flex;align-items:center;gap:.9rem;padding:.75rem .8rem;border-radius:3px;cursor:pointer}
    .menu .it.on{background:linear-gradient(90deg,rgba(201,164,74,.2),rgba(201,164,74,.05));box-shadow:inset 2px 0 0 var(--gold)}
    .menu .it svg{width:1.7rem;height:1.7rem;color:var(--gold)}
    .menu .it b{display:block;font:600 1.02rem/1.1 var(--display);letter-spacing:.08em;color:var(--gold2);text-transform:uppercase}
    .menu .it small{display:block;font-size:.88rem;color:var(--muted);font-style:italic;margin-top:.15rem}
    .menu .it kbd{margin-left:auto;font:600 .65rem/1 var(--display);color:var(--muted);border:1px solid var(--line2);padding:.25rem .4rem;border-radius:2px}
    .menu .sep{border-top:1px solid var(--line);margin:.35rem .4rem}
    .menu .sm{display:flex;gap:.4rem}
    .menu .sm span{flex:1;display:flex;align-items:center;justify-content:center;gap:.45rem;padding:.55rem .3rem;font:600 .68rem/1 var(--display);letter-spacing:.1em;color:var(--muted);text-transform:uppercase;border-radius:3px;cursor:pointer}
    .menu .sm span:hover{background:rgba(255,255,255,.05)}
    .menu .sm svg{width:1.05rem;height:1.05rem}
    .hud-tr .iconbtn:last-child{border-color:var(--gold);box-shadow:0 0 0 1px rgba(201,164,74,.4),var(--shadow);background:rgba(50,38,22,.95)}
    .pin{position:fixed;left:50%;top:77.6%;width:2rem;height:2rem;margin:-1rem;border-radius:50%;border:2px solid #ffd76a;box-shadow:0 0 0 5px rgba(255,215,106,.22),0 0 22px rgba(255,215,106,.7);z-index:4}
    .cc{position:fixed;left:calc(50% + 2.8rem);top:39vh;width:24rem;z-index:7;padding:0;overflow:visible}
    .cc:before{content:"";position:absolute;left:-.55rem;top:calc(77.6vh - 39vh - .5rem);width:1rem;height:1rem;background:var(--panel-solid);border-left:1px solid var(--line2);border-bottom:1px solid var(--line2);transform:rotate(45deg)}
    .cc .hd{display:flex;gap:.8rem;align-items:center;padding:.85rem 1rem .7rem;border-bottom:1px solid var(--line)}
    .cc .hd .crest{width:2.6rem;height:3.1rem;flex:none}
    .cc h2{font-size:1.4rem;letter-spacing:.06em}
    .cc .hd small{display:block;color:var(--muted);font-style:italic;font-size:.95rem}
    .cc .bd{padding:.7rem 1rem .3rem;display:flex;flex-direction:column;gap:.55rem}
    .kv{display:flex;gap:.8rem;font-size:1rem;align-items:baseline}
    .kv>span:first-child{width:5rem;flex:none;font:600 .6rem/1 var(--display);letter-spacing:.16em;color:var(--muted);text-transform:uppercase}
    .kv b{font-weight:500;color:var(--text)}
    .kv small{color:var(--muted);font-style:italic}
    .cc .pchip{margin-top:.1rem}
    .cc .guests{display:flex;gap:.4rem;flex-wrap:wrap}
    .cc .act{display:flex;gap:.5rem;padding:.7rem 1rem .9rem}
    .cc .act .btn{flex:1;justify-content:center;padding:.55rem .4rem;font-size:.72rem}
    .cc .warn{margin:0 1rem;font-size:.92rem;font-style:italic;color:#e0b070;display:flex;gap:.4rem;align-items:center}
    .cc .warn svg{color:#e0b070}
    .lab{position:fixed;left:50%;top:77.6%;transform:translate(-50%,1.6rem);z-index:3}`,
    body: '<div class="dim" style="background:rgba(8,6,4,.25)"></div>' + hudTop({ vitals: true }) + `
    <div class="panel menu"><div class="it on">${ico('crown')}<div><b>Realm</b><small>How your house stands</small></div><kbd>R</kbd></div>
      <div class="it">${ico('people')}<div><b>People</b><small>Family, court and guests</small></div><kbd>P</kbd></div>
      <div class="it">${ico('scroll')}<div><b>Chronicle</b><small>All that has happened</small></div><kbd>H</kbd></div>
      <div class="sep"></div><div class="sm"><span>${ico('gear')} Settings</span><span>${ico('help')} Help</span><span>${ico('eye')} Focus <b style="color:var(--gold)">F</b></span></div></div>
    <div class="pin"></div>
    <aside class="panel cc"><div class="hd">${crest('tully')}<div><h2>Riverrun</h2><small>Seat of House Tully &middot; the Riverlands</small></div><span class="x">${ico('x')}</span></div>
      <div class="bd">
        <div class="kv"><span>Holder</span><div><span class="pchip" style="margin:0">${pf('hoster')}<span>Lord Hoster Tully<small>your wife’s father &middot; ailing</small></span></span></div></div>
        <div class="kv"><span>Garrison</span><b>~1,100 men</b><small>a raven, 4 days old</small></div>
        <div class="kv"><span>Guests</span><div class="guests"><span class="pchip">${pf('edmure')}<span>Edmure<small>heir</small></span></span><small>+ 2 more</small></div></div>
        <div class="kv"><span>Lands</span><b>Prosperous</b><small>granaries full</small></div>
      </div>
      <div class="warn">${ico('scroll')} In the chronicle: Lord Hoster falls ill</div>
      <div class="act"><span class="btn">${ico('raven')} Send a raven</span><span class="btn">${ico('castle')} Visit</span><span class="btn primary">${ico('flag')} March here</span></div>
    </aside>` + stripBlock() + cmdBlock() + whoBlock(),
  }));
}

/* ============ 08 first run ============ */
{
  const [bg, bgS] = S('e1', 'lod1');
  write('08-first-run.html', page({
    title: 'Target: first run', bg, bgSmall: bgS, css: `
    .dim{background:rgba(8,6,4,.5)}
    .wel{width:min(43rem,92vw);padding:1.6rem 2.2rem 1.5rem;position:relative;text-align:left;margin-top:-4rem}
    .wel .kick{text-align:center;font:600 .68rem/1 var(--display);letter-spacing:.3em;color:#8a6a3a;text-transform:uppercase}
    .wel h1{text-align:center;font:700 1.55rem/1.2 var(--display);letter-spacing:.05em;color:#4a2f0c;margin:.45rem 0 .1rem}
    .wel .sub{text-align:center;font-style:italic;color:#6b5230;margin:0 0 .2rem}
    .orn{display:flex;align-items:center;gap:.7rem;justify-content:center;color:#8a6a3a;margin:.4rem 0 .7rem}
    .orn:before,.orn:after{content:"";flex:1;border-top:1px solid rgba(90,58,18,.4)}
    .wel p{margin:0 0 .6rem;font-size:1.12rem;line-height:1.38;color:#2f2214}
    .wel p b{font:600 .68rem/1 var(--display);letter-spacing:.18em;text-transform:uppercase;color:#7a5a2a;margin-right:.3rem}
    .wel .go{display:flex;align-items:center;justify-content:space-between;margin-top:1rem}
    .wel .go small{font-style:italic;color:#6b5230;font-size:.9rem}
    .wel .btn{font-size:.95rem;padding:.65rem 2.4rem}
    .ring2{position:fixed;z-index:9;border-radius:6px;border:2px solid #ffe08a;box-shadow:0 0 0 4px rgba(255,224,138,.25),0 0 26px rgba(255,224,138,.7)}
    .cm{position:fixed;z-index:9;width:15.5rem;padding:.65rem .85rem .7rem;border-radius:5px;background:#f0e2bf;color:#2b2016;border:1px solid #b79a5a;box-shadow:0 8px 28px rgba(0,0,0,.6);font-size:1rem;line-height:1.28}
    .cm .st{display:block;font:600 .6rem/1 var(--display);letter-spacing:.2em;color:#8a6a3a;text-transform:uppercase;margin-bottom:.3rem}
    .cm .st span{float:right;letter-spacing:.1em}
    .cm:after{content:"";position:absolute;width:.9rem;height:.9rem;background:#f0e2bf;border:1px solid #b79a5a;transform:rotate(45deg)}
    .cm.dn:after{left:50%;margin-left:-.45rem;bottom:-.5rem;border-top:none;border-left:none}
    .cm.up:after{right:1.4rem;top:-.5rem;border-bottom:none;border-right:none}
    .cm.c1{left:50%;transform:translateX(-50%);bottom:8.3rem;width:17rem}
    .r1{left:calc(50% - min(19rem,21vw) - .4rem);bottom:.6rem;width:calc(min(38rem,42vw) + .8rem);height:5.2rem;animation:none}
    .r2{right:3.9rem;top:.6rem;width:16.5rem;height:4.2rem}
    .r3{right:.6rem;top:.6rem;width:3.7rem;height:4.2rem}
    .cm.c2{right:4.2rem;top:5.6rem}
    .cm.c3{right:1rem;top:11.6rem;width:14rem}
    .cm.c3:after{right:.9rem}
    .lead{position:fixed;z-index:9;right:1.55rem;top:4.9rem;height:6.4rem;border-left:2px dashed #ffe08a}
    @media (max-height:800px){.wel{margin-top:-1rem;padding:1.2rem 2rem 1.2rem}.wel p{font-size:1.05rem;margin-bottom:.4rem}}`,
    body: '<div class="dim"></div>' + hudTop({ vitals: true }) + stripBlock() + cmdBlock(false) + whoBlock() + `
    <div class="center"><section class="wel parch"><div class="kick">A Game of Thrones &middot; 298 AC</div><h1>Your situation</h1><p class="sub">Lord Eddard of Winterfell</p><div class="orn">&#10087;</div>
      <p>The North is a third of the realm and holds a tenth of its people. Your bannermen are hard, proud and loyal, mostly. Summer is ending, and in the North winter kills. The King is riding north to ask you to be his Hand.</p>
      <p><b>Aims</b>Decide whether to go south as Hand &middot; protect your family &middot; fill the granaries before winter.</p>
      <p><b>Levers</b>The North’s loyalty &middot; Moat Cailin &middot; White Harbor’s ships &middot; the old gods.</p>
      <div class="go"><small>You will not see this again.</small><span class="btn primary">Begin &#9654;</span></div></section></div>
    <div class="ring2 r1"></div><div class="cm c1 dn"><span class="st">Tip <span>1 of 3</span></span>Tell your house what to do, in your own words.</div>
    <div class="ring2 r2"></div><div class="cm c2 up"><span class="st">Tip <span>2 of 3</span></span>Then let the world move.</div>
    <div class="ring2 r3"></div><div class="lead"></div><div class="cm c3 up"><span class="st">Tip <span>3 of 3</span></span>Open the menu to see how your house stands.</div>`,
  }));
}
console.log('mockups written to', OUT);
