// The canon of 298–300 AC (docs/gdd/10-narrative-events.md §4): the great threads of the books, each a run of beats in
// the books' order. A beat's month is when its window opens (`at`), its grace how many moons more it may wait for the
// world to fit it (`needs`), and `fire` what happens — through the engine's own ops and the lord's matters, never a
// teleport. The beat engine (engine/world/beats.js) runs them; BEAT_META (below) gives each beat what the v2 schema adds:
// its trigger, whether it is a pillar of the story (kept even under Loose gravity), the people it canon-locks while it is
// pending, its alternates when the world has diverged, and what its lapse leaves behind.
import { joinParty, settle } from '../js/engine/parties.js';
import { pronouns } from '../js/shared/people.js';
import { random } from '../js/engine/rng.js';
import { YM, C, alive, free, at, flag, player, plays, inWar, ev } from '../js/engine/world/beatkit.js';

export const THREADS = [
  {
    id: 'kings_ride', name: 'The King rides north', stages: [
      {
        id: 'progress', at: YM(298, 8), grace: 1, needs: (s) => alive(s, 'robert_baratheon') && at(s, 'robert_baratheon', 'baratheon', 'kings_landing'),
        fire: (s) => ({
          events: [ev('The King rides north', 'King Robert\'s progress has crossed the Green Fork at the Twins — the Queen, her brothers, the royal children and three hundred knights, a mile of wagons — bound for Winterfell. Men say he means to make Lord Eddard Stark his Hand, now that Jon Arryn is dead.', 'frey', 4, 'court', ['baratheon', 'stark'])],
          // the court has been a moon on the kingsroad already when the tale begins: it is at the Twins, mounted
          changes: [{ op: 'army_create', id: 'royal_progress', owner: 'baratheon', name: 'The King\'s progress', commander: 'robert_baratheon', at: 'frey', men: 1400, composition: 'The royal household: knights and riders of the court, men-at-arms, the Queen\'s wheelhouse', status: 'marching' }],
          // the court rides with the host, and the host walks the kingsroad at a wheelhouse's pace
          post: (st) => { const a = st.parties.royal_progress; if (!a) return; a.kind = 'progress'; a.public = true; a.canonLock = 'kings_ride'; a.march = { to: 'stark', since: st.meta.turn }; a.at = null; for (const id of ['robert_baratheon', 'cersei_lannister', 'jaime_lannister', 'tyrion_lannister', 'joffrey_baratheon', 'myrcella_baratheon', 'tommen_baratheon', 'sandor_clegane']) if (st.characters[id]?.alive && at(st, id, 'baratheon', 'kings_landing')) joinParty(st, st.characters[id], a); settle(st, a); },
        }),
      },
      {
        id: 'arrival', at: YM(298, 9), grace: 4, needs: (s) => alive(s, 'robert_baratheon', 'eddard_stark') && s.characters.robert_baratheon.status !== 'imprisoned' && (s.parties.royal_progress ? s.parties.royal_progress.at === 'stark' : at(s, 'robert_baratheon', 'stark')),
        fire: (s) => {
          const out = {
            events: [ev('The King comes to Winterfell', 'King Robert rides through the gates of Winterfell with the Queen, her brothers, the royal children and three hundred knights. He has come, he roars, to make his oldest friend the Hand of the King.', 'stark', 4, 'court', ['stark', 'baratheon'])],
            changes: [...(s.parties.royal_progress ? [] : [{ op: 'character', id: 'robert_baratheon', loc: 'stark' }, { op: 'character', id: 'cersei_lannister', loc: 'stark' }, { op: 'character', id: 'jaime_lannister', loc: 'stark' }, { op: 'character', id: 'tyrion_lannister', loc: 'stark' }, { op: 'character', id: 'joffrey_baratheon', loc: 'stark' }]), ],
          };
          if (plays(s, 'stark')) {
            out.decision = {
              id: 'hand_offer', title: 'The King asks you to be his Hand', from: 'robert_baratheon', days: 10,
              text: '"Ned, I need you. The realm needs you. Jon is dead and I am surrounded by flatterers and fools." Robert offers you the chain of the Hand, and a match between Sansa and Prince Joffrey. Maester Luwin has had a letter from Lysa Arryn, in a cipher only Catelyn knows: the Lannisters murdered Jon Arryn.',
              options: [
                { label: 'Accept the chain and go south', hint: 'Power at court and the King\'s ear; Winterfell left to Robb. You ride with the King when he leaves', fx: [{ plot: ['ned_hand', true] }, { plot: ['hand_daughters', true] }, { rel: ['baratheon', 20] }, { rel: ['lannister', -5] }, { ops: [{ op: 'character', id: 'eddard_stark', title: 'Hand of the King, Lord of Winterfell' }] }] },
                { label: 'Refuse him: your place is in the North', hint: 'Robert is wounded; the Lannisters fill the empty chair', fx: [{ plot: ['ned_hand', false] }, { rel: ['baratheon', -20] }, { ops: [{ op: 'character', id: 'tywin_lannister', title: 'Hand of the King, Lord of Casterly Rock' }] }] },
                { label: 'Accept, but leave your daughters home', hint: 'The chain without the hostages', fx: [{ plot: ['ned_hand', true] }, { plot: ['hand_daughters', false] }, { rel: ['baratheon', 10] }, { ops: [{ op: 'character', id: 'eddard_stark', title: 'Hand of the King, Lord of Winterfell' }] }] },
              ],
              lapse: [{ plot: ['ned_hand', true] }, { plot: ['hand_daughters', true] }, { ops: [{ op: 'character', id: 'eddard_stark', title: 'Hand of the King, Lord of Winterfell' }] }],
            };
          } else {
            out.changes.push({ op: 'character', id: 'eddard_stark', title: 'Hand of the King, Lord of Winterfell' });
            out.flags = { ned_hand: true, hand_daughters: true };
          }
          return out;
        },
      },
      {
        id: 'the_fall', at: YM(298, 9), needs: (s) => alive(s, 'bran_stark') && at(s, 'jaime_lannister', 'stark') && at(s, 'bran_stark', 'stark'),
        fire: (s) => ({
          events: [ev('The boy who fell', 'Bran Stark, who climbed every wall of Winterfell and never fell, is found broken at the foot of the old tower. He lives, but sleeps and does not wake. The Lannisters are very kind.', 'stark', plays(s, 'stark') ? 5 : 3, 'intrigue', ['stark'])],
          changes: [{ op: 'character', id: 'bran_stark', status: 'wounded', note: 'Fell from the broken tower — or was pushed. Cannot remember.' }],
        }),
      },
      {
        id: 'southward', at: YM(298, 10), needs: (s) => alive(s, 'robert_baratheon') && at(s, 'robert_baratheon', 'stark'),
        fire: (s) => {
          const ch = [{ op: 'character', id: 'robert_baratheon', loc: 'baratheon' }, { op: 'character', id: 'cersei_lannister', loc: 'baratheon' }, { op: 'character', id: 'jaime_lannister', loc: 'baratheon' }, { op: 'character', id: 'joffrey_baratheon', loc: 'baratheon' }];
          if (s.parties.royal_progress) { ch.length = 0; const a = s.parties.royal_progress; a.public = true; a.canonLock = 'kings_ride'; a.march = { to: 'baratheon', since: s.meta.turn }; a.at = null; for (const id of ['robert_baratheon', 'cersei_lannister', 'jaime_lannister', 'joffrey_baratheon', 'myrcella_baratheon', 'tommen_baratheon', 'sandor_clegane']) if (alive(s, id) && at(s, id, 'stark')) joinParty(s, s.characters[id], a); settle(s, a); }
          if (alive(s, 'tyrion_lannister')) ch.push({ op: 'character', id: 'tyrion_lannister', loc: 'nights_watch' });
          if (alive(s, 'jon_snow') && s.characters.jon_snow.house === 'stark') ch.push({ op: 'character', id: 'jon_snow', house: 'nights_watch', title: 'Recruit of the Night\'s Watch', loc: 'nights_watch' });
          // the new Hand rides south with his King, as in the books — with his daughters if he chose to bring them
          if (flag(s, 'ned_hand') && free(s, 'eddard_stark') && at(s, 'eddard_stark', 'stark')) ch.push({ op: 'travel', character: 'eddard_stark', to: 'kings_landing', men: 300, name: 'The Hand\'s household', companions: ['jory_cassel', 'vayon_poole', 'septa_mordane', ...(flag(s, 'hand_daughters') ? ['sansa_stark', 'arya_stark'] : [])] });
          return { events: [ev('The court goes south', 'The King\'s party leaves Winterfell by the kingsroad. Jon Snow rides north to take the black, and Tyrion Lannister goes with him to see the Wall.', 'stark', 2, 'court', ['stark', 'baratheon'])], changes: ch };
        },
      },
    ],
  },
  {
    id: 'catspaw', name: 'A dagger of Valyrian steel', stages: [
      {
        id: 'assassin', at: YM(298, 10), needs: (s) => alive(s, 'bran_stark', 'catelyn_stark') && s.characters.bran_stark.status === 'wounded',
        fire: (s) => {
          const out = { events: [ev('A knife in the night', 'A cutthroat with a dagger of Valyrian steel creeps into Bran Stark\'s chamber. Lady Catelyn fights him with her bare hands and the boy\'s direwolf tears out his throat. Such a blade is not a common sellsword\'s.', 'stark', plays(s, 'stark') ? 5 : 3, 'intrigue', ['stark'])], changes: [] };
          if (plays(s, 'stark')) {
            out.decision = {
              id: 'catspaw', title: 'Whose was the dagger?', from: 'catelyn_stark',
              text: 'Catelyn is white with fury. "Someone wants my son dead. Someone who could pay for Valyrian steel." She means to ride south in secret to tell Ned — and to find out whose dagger it was.',
              options: [
                { label: 'Let her ride south in secret', hint: 'The truth may come out — or she may start a war', fx: [{ plot: ['cat_south', true] }, { ops: [{ op: 'character', id: 'catelyn_stark', loc: 'baratheon' }] }] },
                { label: 'Keep her at Winterfell; send a raven', hint: 'Safer; the ravens can be read by others', fx: [{ plot: ['cat_south', false] }, { rel: ['lannister', -5] }] },
                { label: 'Accuse the Lannisters openly', hint: 'Honest, and dangerous without proof', fx: [{ plot: ['cat_south', false] }, { rel: ['lannister', -25] }, { rel: ['baratheon', -5] }] },
              ],
              lapse: [{ plot: ['cat_south', true] }, { ops: [{ op: 'character', id: 'catelyn_stark', loc: 'baratheon' }] }],
            };
          } else { out.flags = { cat_south: true }; out.changes.push({ op: 'character', id: 'catelyn_stark', loc: 'baratheon', note: 'Rode south in secret with the catspaw\'s dagger.' }); }
          out.changes.push({ op: 'character', id: 'bran_stark', note: 'An assassin came for him as he lay dreaming.' });
          return out;
        },
      },
    ],
  },
  {
    id: 'hands_tourney', name: 'The Tourney of the Hand', stages: [
      {
        id: 'tourney', at: YM(298, 11), needs: (s) => alive(s, 'robert_baratheon') && flag(s, 'ned_hand') !== undefined,
        fire: (s) => {
          const winner = free(s, 'loras_tyrell') ? 'Ser Loras Tyrell, the Knight of Flowers' : free(s, 'jaime_lannister') ? 'Ser Jaime Lannister' : 'a hedge knight no one had heard of';
          const out = {
            events: [ev('The Tourney of the Hand', `King Robert holds a great tourney in King's Landing, forty thousand golden dragons to the champion. Ser Hugh of the Vale dies with a lance through his throat; the Mountain loses his temper and tries to kill ${winner}, and the Hound stands between them. The crown's debt grows by the purse.`, 'baratheon', 3, 'court', ['baratheon', 'tyrell', 'clegane'])],
            changes: [{ op: 'figure', house: 'baratheon', field: 'treasury', delta: -90000, source: 'The tourney accounts' }],
          };
          if (!plays(s, 'baratheon') && s.houses[player(s)]?.rank !== 'minor') {
            out.decision = {
              id: 'tourney_champion', title: 'Send a champion to the Hand\'s tourney?',
              text: `Every house of note sends knights to King's Landing to break lances for forty thousand dragons and the King's favour. Your master-at-arms asks whether House ${s.houses[player(s)].name} will be seen in the lists.`,
              options: [
                { label: 'Send your best knight, richly furnished', hint: '1,500 gold. Glory, or a broken neck', fx: [{ gold: -1500 }, { chance: [0.35, [{ rel: ['baratheon', 15] }, { gold: 8000 }, { prestige: 10 }], [{ rel: ['baratheon', 4] }]] }] },
                { label: 'Send a few household knights', hint: '400 gold. Show the flag', fx: [{ gold: -400 }, { rel: ['baratheon', 4] }] },
                { label: 'Stay away', hint: 'Coin saved; the court notices', fx: [{ rel: ['baratheon', -3] }] },
              ],
            };
          }
          return out;
        },
      },
    ],
  },
  {
    id: 'the_imp', name: 'The Imp taken', stages: [
      {
        id: 'seized', at: YM(298, 11), needs: (s) => free(s, 'catelyn_stark') && free(s, 'tyrion_lannister') && flag(s, 'cat_south') === true && !inWar(s, 'stark', 'lannister'),
        fire: (s) => ({
          events: [ev('Seized at the crossroads', 'At the inn at the crossroads, Catelyn Stark calls on the knights of her father\'s bannermen to seize Tyrion Lannister for the attempted murder of her son. He is carried off to the Eyrie to stand before her sister.', 'crossroads_inn', 5, 'intrigue', ['stark', 'tully', 'lannister', 'arryn'])],
          changes: [{ op: 'character', id: 'tyrion_lannister', status: 'imprisoned', loc: 'arryn' }, { op: 'character', id: 'catelyn_stark', loc: 'arryn' }, { op: 'relation', a: 'lannister', b: 'stark', delta: -30 }, { op: 'relation', a: 'lannister', b: 'tully', delta: -25 }],
          decision: plays(s, 'lannister') ? {
            id: 'imp_taken', title: 'They have taken Tyrion', from: 'kevan_lannister',
            text: 'Catelyn Stark has seized your son on the kingsroad and carried him off to the Eyrie. Whatever you think of the dwarf, he is a Lannister; the realm is watching to see what the lion does.',
            options: [
              { label: 'Loose the Mountain on the Riverlands', hint: 'Burn Tully villages until he is returned. This is war', fx: [{ plot: ['riverlands_burn', true] }, { rel: ['tully', -30] }, { rel: ['stark', -20] }] },
              { label: 'Demand his release before the King', hint: 'Lawful; slow; Robert may not care', fx: [{ rel: ['baratheon', 5] }, { rel: ['stark', -10] }] },
              { label: 'Buy him back quietly', hint: '20,000 gold to the right hands in the Vale', fx: [{ gold: -20000 }, { ops: [{ op: 'character', id: 'tyrion_lannister', status: 'free', loc: 'lannister' }] }] },
            ],
            lapse: [{ plot: ['riverlands_burn', true] }],
          } : undefined,
          flags: plays(s, 'lannister') ? {} : { riverlands_burn: true },
        }),
      },
      {
        id: 'burning', at: YM(298, 12), needs: (s) => flag(s, 'riverlands_burn') && alive(s, 'gregor_clegane') && !inWar(s, 'lannister', 'tully'),
        fire: (s) => {
          const out = {
            events: [ev('Fire in the Riverlands', 'Men with no banners — but everyone knows the Mountain — burn Sherrer, the Mummer\'s Ford and a score of villages across the Riverlands. Edmure Tully calls his banners; Lord Tywin gathers a host at Casterly Rock.', 'riverrun', 5, 'war', ['lannister', 'tully', 'clegane'])],
            changes: [{ op: 'war', id: 'lannister_vs_tully', name: 'War in the Riverlands', attackers: ['lannister'], defenders: ['tully'], reason: 'The seizure of Tyrion Lannister' }],
          };
          for (const h of Object.values(s.holdings)) if (s.houses[h.owner]?.region === 'riverlands' && random() < 0.35) out.changes.push({ op: 'holding', id: h.id, unrest: Math.min(100, (h.unrest || 0) + 25), prosperity: Math.max(0, (h.prosperity || 50) - 15), note: 'Raided and burned by men without banners' });
          if (plays(s, 'tully') || s.houses[player(s)]?.region === 'riverlands') {
            out.decision = {
              id: 'riverlands_burn', title: 'The Riverlands burn', from: 'edmure_tully',
              text: 'Refugees crowd the roads to Riverrun. The raiders wear no colours but ride Lannister horses. Your vassals demand vengeance.',
              options: [
                { label: 'Call your banners and ride out', hint: 'Meet fire with steel', fx: [{ unrestAll: -8 }, { rel: ['lannister', -15] }, { plot: ['riverlands_rise', true] }] },
                { label: 'Appeal to the Hand for justice', hint: 'Slow; the King\'s law must be seen to act', fx: [{ rel: ['baratheon', 5] }, { unrestAll: 6 }] },
                { label: 'Shelter the smallfolk behind your walls', hint: 'Food spent; lives saved', fx: [{ food: -2 }, { unrestAll: -4 }] },
              ],
            };
          }
          return out;
        },
      },
    ],
  },
  {
    id: 'last_hunt', name: 'The King\'s last hunt', stages: [
      {
        id: 'boar', at: YM(298, 12), needs: (s) => alive(s, 'robert_baratheon') && s.characters.robert_baratheon.status !== 'imprisoned',
        fire: (s) => {
          if (plays(s, 'baratheon')) {
            return {
              events: [ev('A hunt in the kingswood', 'The King is restless and means to hunt boar in the kingswood. His squire Lancel keeps his cup full of strongwine.', 'baratheon', 3, 'court', ['baratheon'])],
              decision: {
                id: 'last_hunt', title: 'Ride out after the boar?', from: 'lancel_lannister',
                text: '"A boar, Your Grace, the biggest in the kingswood." Your squire is pouring the strongwine the Queen sent. Your gut aches and your Hand frowns.',
                options: [
                  { label: 'Hunt the boar yourself', hint: 'The kingswood, the wine, the spear', fx: [{ chance: [0.75, [{ ops: [{ op: 'character', id: 'robert_baratheon', alive: false, cause: 'gored by a boar in the kingswood' }] }], [{ prestige: 5 }]] }] },
                  { label: 'Hunt, but drink nothing the Queen sent', hint: 'Suspicious; she will notice', fx: [{ chance: [0.25, [{ ops: [{ op: 'character', id: 'robert_baratheon', alive: false, cause: 'gored by a boar' }] }], [{ rel: ['lannister', -5] }]] }] },
                  { label: 'Stay in the Red Keep', hint: 'The boar lives; the King sulks', fx: [{ rel: ['lannister', -2] }] },
                ],
                lapse: [{ ops: [{ op: 'character', id: 'robert_baratheon', alive: false, cause: 'gored by a boar in the kingswood' }] }],
              },
            };
          }
          return {
            events: [ev('The King is dead', 'King Robert, drunk on strongwine, is opened from groin to nipple by a boar in the kingswood and dies of it. Before he dies he names Lord Eddard Protector of the Realm until his son comes of age.', 'baratheon', 5, 'court', ['baratheon', 'lannister', 'stark'])],
            changes: [{ op: 'character', id: 'robert_baratheon', alive: false, cause: 'gored by a boar in the kingswood' }],
          };
        },
      },
      {
        id: 'coup', at: YM(298, 12), needs: (s) => !alive(s, 'robert_baratheon') && free(s, 'eddard_stark') && at(s, 'eddard_stark', 'baratheon') && alive(s, 'cersei_lannister'),
        fire: (s) => {
          if (plays(s, 'stark')) {
            return {
              events: [ev('The throne room', 'Robert is dead. Joffrey sits the Iron Throne; Cersei holds his letters. You alone know that none of her children are Robert\'s.', 'baratheon', 5, 'intrigue', ['stark', 'lannister'])],
              decision: {
                id: 'ned_choice', title: 'Robert is dead. What does the Hand do?', from: 'petyr_baelish',
                text: 'Littlefinger says the gold cloaks can be bought for six thousand dragons. The Queen has not yet moved. Robert\'s letter names you Protector of the Realm "until my heir comes of age" — and Joffrey is no heir of his.',
                options: [
                  { label: 'Proclaim Stannis the true king', hint: 'The honourable course. Trust the gold cloaks?', fx: [{ chance: [0.2, [{ rel: ['baratheon_ds', 30] }, { ops: [{ op: 'character', id: 'cersei_lannister', status: 'imprisoned' }] }], [{ ops: [{ op: 'character', id: 'eddard_stark', status: 'imprisoned', note: 'Betrayed in the throne room; the gold cloaks turned their spears.' }] }, { plot: ['ned_seized', true] }]] }] },
                  { label: 'Bend the knee to Joffrey and keep the secret', hint: 'You live, and your daughters with you', fx: [{ rel: ['lannister', 15] }, { rel: ['baratheon_ds', -20] }, { ops: [{ op: 'character', id: 'eddard_stark', title: 'Lord of Winterfell', note: 'Bent the knee to Joffrey to save his daughters.' }] }] },
                  { label: 'Flee north with your daughters tonight', hint: 'Abandon the court; the Lannisters will call it treason', fx: [{ chance: [0.6, [{ ops: [{ op: 'character', id: 'eddard_stark', loc: 'stark', title: 'Lord of Winterfell' }, { op: 'character', id: 'sansa_stark', loc: 'stark' }, { op: 'character', id: 'arya_stark', loc: 'stark' }] }, { rel: ['lannister', -30] }], [{ ops: [{ op: 'character', id: 'eddard_stark', status: 'imprisoned' }] }, { plot: ['ned_seized', true] }]] }] },
                ],
                lapse: [{ ops: [{ op: 'character', id: 'eddard_stark', status: 'imprisoned' }] }, { plot: ['ned_seized', true] }],
              },
            };
          }
          return {
            events: [ev('Treason in the throne room', 'Lord Eddard Stark produces the late King\'s letter naming him Protector of the Realm. The gold cloaks turn their spears on his guards. The Hand is dragged to the black cells, and Joffrey is proclaimed king.', 'baratheon', 5, 'intrigue', ['stark', 'lannister', 'baratheon'])],
            changes: [{ op: 'character', id: 'eddard_stark', status: 'imprisoned', note: 'Seized in the throne room for treason.' }, { op: 'relation', a: 'stark', b: 'lannister', delta: -40 }],
            flags: { ned_seized: true },
          };
        },
      },
      {
        id: 'banners', at: YM(299, 1), needs: (s) => flag(s, 'ned_seized') && !inWar(s, 'stark', 'lannister') && s.houses.stark?.lord && alive(s, s.houses.stark.lord),
        fire: (s) => {
          const out = {
            events: [ev('The North calls its banners', `${C(s, 'robb_stark')?.alive ? 'Robb Stark, fifteen years old,' : 'Winterfell'} calls the banners of the North. The lords come: Umber, Karstark, Bolton, Glover, Mormont, Manderly. Eighteen thousand men march for Moat Cailin.`, 'stark', 5, 'war', ['stark', 'lannister'])],
            changes: [{ op: 'war', id: 'war_of_five_kings', name: 'The War of the Five Kings', attackers: ['stark', 'tully'], defenders: ['lannister', 'baratheon'], reason: 'The imprisonment of Lord Eddard Stark' }],
          };
          if (!plays(s, 'stark')) out.changes.push({ op: 'army_create', owner: 'stark', name: 'The Northern Host', at: 'moat_cailin', men: 18000, commander: alive(s, 'robb_stark') ? 'robb_stark' : null, composition: 'Northern levies, heavy horse of the Umbers and Karstarks', status: 'marching' });
          return out;
        },
      },
      {
        id: 'brothers', at: YM(299, 2), needs: (s) => !alive(s, 'robert_baratheon') && (alive(s, 'renly_baratheon') || alive(s, 'stannis_baratheon')),
        fire: (s) => {
          const ch = []; const ev_ = [];
          if (alive(s, 'renly_baratheon') && !plays(s, 'baratheon_se')) { ch.push({ op: 'character', id: 'renly_baratheon', title: 'King Renly, First of His Name', loc: 'tyrell' }, { op: 'pact', type: 'alliance', a: 'baratheon_se', b: 'tyrell', terms: 'Renly weds Margaery; the Reach crowns him' }); ev_.push('At Highgarden, Renly Baratheon weds Margaery Tyrell and is crowned king, with the whole power of the Reach and the Stormlands behind him.'); }
          if (alive(s, 'stannis_baratheon') && !plays(s, 'baratheon_ds')) { ch.push({ op: 'character', id: 'stannis_baratheon', title: 'King Stannis, First of His Name' }); ev_.push('On Dragonstone, Stannis Baratheon names himself Robert\'s heir and sends letters to every lord in the realm: Joffrey, Myrcella and Tommen are bastards born of incest.'); }
          if (!ch.length) return null;
          return { events: [ev('Brothers crowned', ev_.join(' '), 'baratheon_ds', 5, 'court', ['baratheon_se', 'baratheon_ds', 'tyrell'])], changes: ch };
        },
      },
    ],
  },
  {
    id: 'crown_justice', name: 'The King\'s justice', stages: [
      {
        id: 'baelors_sept', at: YM(299, 2), grace: 3, needs: (s) => alive(s, 'eddard_stark') && s.characters.eddard_stark.status === 'imprisoned' && at(s, 'eddard_stark', 'baratheon') && alive(s, 'joffrey_baratheon'),
        fire: (s) => {
          if (plays(s, 'baratheon', 'lannister')) {
            return {
              events: [ev('The traitor in the black cells', 'Lord Eddard Stark has confessed his treason, if he is allowed to take the black. The small council is divided; the King wants a head.', 'baratheon', 4, 'court', ['stark', 'baratheon'])],
              decision: {
                id: 'ned_fate', title: 'What becomes of Eddard Stark?', from: 'varys',
                text: 'Varys has persuaded him to confess before the Great Sept of Baelor. Pycelle says a live Stark is a hostage worth an army; the King says a dead one is a lesson. The North is watching.',
                options: [
                  { label: 'Let him confess and take the black', hint: 'Mercy; the North may yet be kept at the table', fx: [{ ops: [{ op: 'character', id: 'eddard_stark', status: 'free', house: 'nights_watch', title: 'Brother of the Night\'s Watch', loc: 'nights_watch' }] }, { rel: ['stark', 20] }] },
                  { label: 'Keep him in the black cells as a hostage', hint: 'The wolves cannot attack while you hold their lord', fx: [{ rel: ['stark', -5] }] },
                  { label: 'Give the King his head', hint: 'A lesson to the realm. The North will never forgive it', fx: [{ ops: [{ op: 'character', id: 'eddard_stark', alive: false, cause: 'beheaded on the steps of the Great Sept of Baelor' }] }, { rel: ['stark', -60] }, { rel: ['tully', -30] }] },
                ],
                lapse: [{ ops: [{ op: 'character', id: 'eddard_stark', alive: false, cause: 'beheaded on the steps of the Great Sept of Baelor' }] }],
              },
            };
          }
          return {
            events: [ev('The steps of Baelor\'s Sept', 'Before the Great Sept, Eddard Stark confesses to treason he did not commit, to save his daughters. King Joffrey, to the horror of his mother and council, has Ser Ilyn Payne take his head. His sword Ice goes to the Lannisters.', 'baratheon', 5, 'court', ['stark', 'baratheon', 'lannister'])],
            changes: [{ op: 'character', id: 'eddard_stark', alive: false, cause: 'beheaded on the steps of the Great Sept of Baelor' }, { op: 'relation', a: 'stark', b: 'lannister', delta: -40 }, { op: 'relation', a: 'stark', b: 'baratheon', delta: -40 }],
            flags: { ned_dead: true },
          };
        },
      },
    ],
  },
  {
    id: 'king_in_north', name: 'The King in the North', stages: [
      {
        id: 'crowned', at: YM(299, 3), grace: 6, needs: (s) => (!alive(s, 'eddard_stark') || s.characters.eddard_stark.house === 'nights_watch') && inWar(s, 'stark', 'lannister') && s.houses.stark?.liege,
        fire: (s) => {
          const lord = s.characters[s.houses.stark.lord];
          if (plays(s, 'stark')) {
            return {
              events: [ev('A council of war', 'Your lords have gathered in the great hall of Riverrun. The Greatjon is on his feet.', 'tully', 4, 'court', ['stark'])],
              decision: {
                id: 'kinginthenorth', title: '"The King in the North!"', from: 'greatjon_umber',
                text: `The Greatjon lays his sword before ${lord?.name || 'you'}: "Here is the only king I mean to bow my knee to. Why shouldn't we rule ourselves again? It was the dragons we married, and the dragons are all dead." The hall takes up the cry. Renly and Stannis both demand your fealty.`,
                options: [
                  { label: 'Take the crown of winter', hint: 'The North and the Riverlands independent — and at war with every claimant', fx: [{ ops: [{ op: 'liege', house: 'stark', liege: null }, { op: 'character', id: s.houses.stark.lord, title: 'King in the North' }] }, { prestige: 25 }] },
                  { label: 'Kneel to Stannis, Robert\'s true heir', hint: 'The lawful course; a cold ally', fx: [{ rel: ['baratheon_ds', 30] }, { ops: [{ op: 'liege', house: 'stark', liege: 'baratheon_ds' }] }] },
                  { label: 'Kneel to Renly, who has the Reach behind him', hint: 'The strongest claimant', fx: [{ rel: ['baratheon_se', 30] }, { ops: [{ op: 'liege', house: 'stark', liege: 'baratheon_se' }] }] },
                ],
                lapse: [{ ops: [{ op: 'liege', house: 'stark', liege: null }, { op: 'character', id: s.houses.stark.lord, title: 'King in the North' }] }],
              },
            };
          }
          return {
            events: [ev('The King in the North', `At Riverrun the northern lords lay their swords before ${lord?.name || 'the Stark'} and proclaim ${lord ? pronouns(lord).him : 'him'} ${lord && pronouns(lord).he === 'she' ? 'Queen' : 'King'} in the North, as ${lord ? pronouns(lord).his : 'his'} forefathers were before Aegon came. The river lords kneel with them.`, 'tully', 5, 'court', ['stark', 'tully'])],
            changes: [{ op: 'liege', house: 'stark', liege: null }, ...(lord ? [{ op: 'character', id: lord.id, title: 'King in the North' }] : []), ...(s.houses.tully && !plays(s, 'tully') ? [{ op: 'liege', house: 'tully', liege: 'stark' }] : [])],
          };
        },
      },
    ],
  },
  {
    id: 'five_kings', name: 'The War of the Five Kings', stages: [
      {
        id: 'twins', at: YM(299, 2), grace: 3, needs: (s) => inWar(s, 'stark', 'lannister') && alive(s, 'walder_frey') && s.houses.stark?.lord && alive(s, s.houses.stark.lord),
        fire: (s) => {
          if (plays(s, 'stark')) {
            return {
              events: [ev('The crossing at the Twins', 'Your host must cross the Green Fork, and the only bridge for a hundred leagues belongs to Lord Walder Frey — who called his banners and has not yet decided which side to march on.', 'frey', 4, 'war', ['stark', 'frey'])],
              decision: {
                id: 'twins', title: 'Lord Walder\'s price', from: 'walder_frey',
                text: '"Your father\'s bannermen, your mother\'s bannermen, all of them want something." Walder Frey will open his bridge and send four thousand swords, if your lord marries one of his daughters when the war is done, and takes two of his grandsons to foster.',
                options: [
                  { label: 'Swear to marry a Frey', hint: 'The bridge and 4,000 men. A vow that must be kept', fx: [{ plot: ['frey_pact', true] }, { rel: ['frey', 30] }, { menAtArms: 1000 }, { ops: [{ op: 'pact', type: 'alliance', a: 'stark', b: 'frey', terms: 'Passage of the Twins; a Stark to wed a Frey' }] }] },
                  { label: 'March around by the causeway', hint: 'Weeks lost; the Lannisters reach Riverrun first', fx: [{ rel: ['frey', -15] }, { unrestAll: 4 }] },
                  { label: 'Take the Twins by storm', hint: 'Bloody; the realm will call it madness', fx: [{ rel: ['frey', -60] }, { menAtArms: -800 }, { chance: [0.3, [{ ops: [{ op: 'holding', id: 'frey', owner: 'stark', note: 'Stormed by the northmen' }] }], []] }] },
                ],
                lapse: [{ plot: ['frey_pact', true] }, { rel: ['frey', 20] }],
              },
            };
          }
          return { events: [ev('The crossing at the Twins', 'Lord Walder Frey lets the northern host cross the Green Fork, for a price: his daughter\'s marriage to the young Stark lord when the war is done. Four thousand Frey swords march south with them.', 'frey', 3, 'war', ['stark', 'frey'])], changes: [{ op: 'pact', type: 'alliance', a: 'stark', b: 'frey', terms: 'Passage of the Twins; a Stark to wed a Frey' }], flags: { frey_pact: true } };
        },
      },
      {
        // the player's own battles are fought by the engine where their hosts are, never scripted for them
        id: 'whispering_wood', at: YM(299, 3), grace: 3, needs: (s) => inWar(s, 'stark', 'lannister') && free(s, 'jaime_lannister') && !plays(s, 'lannister', 'stark', 'tully'),
        fire: (s) => {
          const win = random() < (plays(s, 'stark') ? 0.6 : 0.7);
          return win
            ? { events: [ev('The Whispering Wood', 'In the dark of the Whispering Wood the northmen fall on Jaime Lannister\'s camp from three sides. The Kingslayer is taken alive, and three lordlings with him. The siege of Riverrun is broken.', 'tully', 5, 'war', ['stark', 'lannister'])], changes: [{ op: 'character', id: 'jaime_lannister', status: 'imprisoned', loc: 'tully' }, { op: 'battle', name: 'Battle of the Whispering Wood', at: 'tully', attacker: 'stark', defender: 'lannister', victor: 'stark' }] }
            : { events: [ev('A trap that failed', 'The northmen try to take Jaime Lannister in the Whispering Wood, but his scouts smell them out. He cuts his way free and the siege of Riverrun goes on.', 'tully', 3, 'war', ['stark', 'lannister'])], changes: [{ op: 'battle', name: 'Skirmish in the Whispering Wood', at: 'tully', attacker: 'stark', defender: 'lannister', victor: 'lannister' }] };
        },
      },
      {
        id: 'shadow', at: YM(299, 6), grace: 2, needs: (s) => alive(s, 'renly_baratheon', 'stannis_baratheon', 'melisandre') && /king/i.test(s.characters.renly_baratheon.title || '') && /king/i.test(s.characters.stannis_baratheon.title || '') && !plays(s, 'baratheon_se', 'baratheon_ds'),
        fire: () => ({
          events: [ev('A shadow in the king\'s tent', 'On the eve of battle outside Storm\'s End, King Renly is slain in his own tent by a shadow with his brother\'s face, before the eyes of Catelyn Stark and Brienne of Tarth. By dawn the stormlords have gone over to Stannis; the Tyrells ride home.', 'baratheon_se', 5, 'intrigue', ['baratheon_se', 'baratheon_ds', 'tyrell'])],
          changes: [{ op: 'character', id: 'renly_baratheon', alive: false, cause: 'slain by a shadow in his tent' }, { op: 'pact', type: 'alliance', a: 'baratheon_se', b: 'tyrell', status: 'ended' }],
        }),
      },
      {
        id: 'blackwater', at: YM(299, 9), grace: 1, needs: (s) => alive(s, 'stannis_baratheon', 'joffrey_baratheon') && /king/i.test(s.characters.stannis_baratheon.title || '') && !plays(s, 'baratheon', 'baratheon_ds'),
        fire: (s) => {
          const lanTyrell = alive(s, 'tywin_lannister') && !alive(s, 'renly_baratheon');
          if (lanTyrell) {
            return { events: [ev('The Blackwater', 'Stannis\'s fleet sails into the mouth of the Blackwater Rush — and into a river of wildfire. As his army storms the Mud Gate, Lord Tywin and the Tyrells fall on its flank. The ghost of Renly, men say, led the charge. Stannis flees to Dragonstone with a remnant.', 'baratheon', 5, 'war', ['baratheon', 'baratheon_ds', 'lannister', 'tyrell'])], changes: [{ op: 'battle', name: 'Battle of the Blackwater', at: 'baratheon', attacker: 'baratheon_ds', defender: 'baratheon', victor: 'baratheon' }, { op: 'pact', type: 'alliance', a: 'lannister', b: 'tyrell', terms: 'Margaery Tyrell to wed King Joffrey' }, { op: 'figure', house: 'baratheon_ds', field: 'ships', delta: -100 }, { op: 'relation', a: 'lannister', b: 'tyrell', delta: 30 }] };
          }
          return { events: [ev('The Blackwater', 'Stannis Baratheon storms King\'s Landing. The wildfire burns half his fleet, but no relief comes: the gates are forced, the gold cloaks throw down their spears, and Joffrey is dragged from the Red Keep.', 'baratheon', 5, 'war', ['baratheon', 'baratheon_ds'])], changes: [{ op: 'battle', name: 'Battle of the Blackwater', at: 'baratheon', attacker: 'baratheon_ds', defender: 'baratheon', victor: 'baratheon_ds' }, { op: 'character', id: 'joffrey_baratheon', status: 'imprisoned' }, { op: 'character', id: 'stannis_baratheon', loc: 'baratheon' }] };
        },
      },
      {
        id: 'red_wedding', at: YM(299, 11), grace: 3, needs: (s) => flag(s, 'frey_pact') && !plays(s, 'stark') && alive(s, 'walder_frey', 'roose_bolton') && s.houses.stark?.lord && alive(s, s.houses.stark.lord) && inWar(s, 'stark', 'lannister') && random() < 0.7,
        fire: (s) => {
          const lord = s.houses.stark.lord;
          return {
            events: [ev('The Red Wedding', 'At the Twins, under Lord Walder\'s roof, the musicians strike up "The Rains of Castamere" and the Freys and Boltons murder the King in the North, his mother and his bannermen at the wedding feast. Guest right is broken. The North remembers.', 'frey', 5, 'war', ['stark', 'frey', 'bolton', 'lannister'])],
            changes: [{ op: 'character', id: lord, alive: false, cause: 'murdered at the Red Wedding' }, ...(alive(s, 'catelyn_stark') ? [{ op: 'character', id: 'catelyn_stark', alive: false, cause: 'murdered at the Red Wedding' }] : []), { op: 'character', id: 'roose_bolton', title: 'Warden of the North, Lord of the Dreadfort' }, { op: 'relation', a: 'stark', b: 'frey', delta: -100 }, { op: 'relation', a: 'lannister', b: 'frey', delta: 30 }],
          };
        },
      },
      {
        id: 'purple_wedding', at: YM(300, 2), grace: 1, needs: (s) => alive(s, 'joffrey_baratheon', 'olenna_tyrell') && free(s, 'joffrey_baratheon') && /king/i.test(s.characters.joffrey_baratheon.title || '') && (s.pacts || []).some((p) => p.status !== 'ended' && [p.a, p.b].includes('tyrell') && [p.a, p.b].includes('lannister')) && !plays(s, 'baratheon'),
        fire: () => ({
          events: [ev('The Purple Wedding', 'At his wedding feast King Joffrey chokes on pigeon pie and wine, clawing at his throat, and dies purple-faced in his mother\'s arms. Cersei screams that Tyrion poisoned him. Tommen, eight years old, is king.', 'baratheon', 5, 'intrigue', ['baratheon', 'lannister', 'tyrell'])],
          changes: [{ op: 'character', id: 'joffrey_baratheon', alive: false, cause: 'poisoned at his wedding feast' }, { op: 'character', id: 'tyrion_lannister', status: 'imprisoned', loc: 'baratheon', note: 'Accused of poisoning the King.' }],
        }),
      },
    ],
  },
  {
    id: 'the_wall', name: 'Beyond the Wall', stages: [
      {
        id: 'benjen', at: YM(298, 11), needs: (s) => free(s, 'benjen_stark'),
        fire: () => ({ events: [ev('A ranger overdue', 'Benjen Stark, First Ranger of the Night\'s Watch, rode beyond the Wall with six men to look for Ser Waymar Royce. Weeks later his horse comes back to Castle Black without him.', 'nights_watch', 3, 'court', ['nights_watch', 'stark'])], changes: [{ op: 'character', id: 'benjen_stark', status: 'missing', loc: 'beyond the Wall', note: 'Vanished ranging beyond the Wall.' }] }),
      },
      {
        id: 'wights', at: YM(299, 1), grace: 2, needs: (s) => alive(s, 'jeor_mormont'), // canon: the dead rise at Castle Black early in 299 (GDD 10 §4.8 N2), whatever the threat reads
        fire: () => ({ events: [ev('The dead come to Castle Black', 'Two rangers\' bodies, found in the haunted forest and carried back, rise in the night and kill a brother in the Lord Commander\'s tower. They burn only with fire. Lord Commander Mormont resolves to lead a great ranging beyond the Wall.', 'nights_watch', 5, 'court', ['nights_watch'])], changes: [{ op: 'character', id: 'jeor_mormont', note: 'Saw the dead walk in his own tower.' }], flags: { dead_walk: true } }),
      },
    ],
  },
  {
    id: 'dragons', name: 'The blood of the dragon', stages: [
      {
        id: 'wedding', at: YM(298, 9), needs: (s) => alive(s, 'daenerys_targaryen', 'khal_drogo') && !s.characters.daenerys_targaryen.spouse,
        fire: () => ({
          events: [ev('A Dothraki wedding', 'Outside Pentos, Khal Drogo weds Daenerys Targaryen before forty thousand screamers. There are three deaths at the feast, which the Dothraki count a dull wedding. Among her gifts are three dragon eggs, turned to stone by the ages.', 'pentos', 3, 'court', ['targaryen', 'dothraki'])],
          changes: [{ op: 'character', id: 'daenerys_targaryen', spouse: 'khal_drogo', title: 'Khaleesi of Drogo\'s khalasar', loc: 'dothraki' }],
        }),
      },
      {
        id: 'golden_crown', at: YM(298, 11), needs: (s) => alive(s, 'viserys_targaryen', 'khal_drogo') && !plays(s, 'targaryen'),
        fire: () => ({
          events: [ev('A crown for a king', 'In Vaes Dothrak, Viserys Targaryen draws a sword in the sacred city and threatens his sister. Khal Drogo gives him the golden crown he demanded: a pot of molten gold, poured over his head. "He was no dragon," says Daenerys. "Fire cannot kill a dragon."', 'dothraki', 4, 'court', ['targaryen', 'dothraki'])],
          changes: [{ op: 'character', id: 'viserys_targaryen', alive: false, cause: 'crowned with molten gold by Khal Drogo' }, { op: 'character', id: 'daenerys_targaryen', title: 'Princess of Dragonstone, Khaleesi' }],
        }),
      },
      {
        id: 'hatching', at: YM(299, 1), needs: (s) => alive(s, 'daenerys_targaryen') && !flag(s, 'dragons_hatched'),
        fire: (s) => ({
          events: [ev('Dragons', 'Rumour runs from the Dothraki sea to the Free Cities, and nobody believes it: a silver-haired queen walked into a funeral pyre and came out unburned, with three living dragons at her breast.', 'dothraki', 5, 'court', ['targaryen'])],
          changes: [...(alive(s, 'khal_drogo') ? [{ op: 'character', id: 'khal_drogo', alive: false, cause: 'a festering wound' }] : []), { op: 'character', id: 'daenerys_targaryen', title: 'Mother of Dragons, the Unburnt', note: 'Hatched three dragons in Drogo\'s pyre.' }],
          flags: { dragons_hatched: true },
        }),
      },
    ],
  },
  {
    id: 'ironborn', name: 'The Old Way', stages: [
      {
        id: 'crown', at: YM(299, 4), needs: (s) => alive(s, 'balon_greyjoy') && !plays(s, 'greyjoy') && (s.wars || []).some((w) => w.status !== 'ended' && w.attackers.concat(w.defenders).includes('stark')),
        fire: () => ({
          events: [ev('The King of the Isles and the North', 'With the wolves in the south, Balon Greyjoy crowns himself on Pyke and launches the Iron Fleet at the undefended North. "We do not sow." Ironborn longships are sighted off the Stony Shore.', 'greyjoy', 5, 'war', ['greyjoy', 'stark'])],
          changes: [{ op: 'character', id: 'balon_greyjoy', title: 'King of the Iron Islands and the North' }, { op: 'war', id: 'ironborn_reaving', name: 'The Ironborn Reaving', attackers: ['greyjoy'], defenders: ['stark'], reason: 'The Old Way' }],
        }),
      },
    ],
  },
];

// What the v2 schema adds to each beat (10 §3): its trigger (a date unless said), whether it is a pillar of the story
// (kept under Loose gravity: Robert's death, Ned's arrest, the war's outbreak, Robb's call, the dragons, the ironborn,
// the Twins' price), the people canon-locked while it is near, its alternates, and its lapse.
const KING = ['robert_baratheon', 'cersei_lannister', 'jaime_lannister', 'tyrion_lannister', 'joffrey_baratheon', 'myrcella_baratheon', 'tommen_baratheon', 'sandor_clegane'];
export const BEAT_META = {
  'kings_ride.progress': { names: KING },
  'kings_ride.arrival': {
    trigger: { kind: 'arrival', party: 'royal_progress', at: 'stark' }, names: [...KING, 'eddard_stark'],
    // the King never came: the chain goes to Lord Tywin, and the tourney is his
    lapse: { effects: (s) => ({ flags: { ned_hand: false }, changes: alive(s, 'tywin_lannister') ? [{ op: 'character', id: 'tywin_lannister', title: 'Hand of the King, Lord of Casterly Rock' }] : [] }) },
  },
  'kings_ride.the_fall': { trigger: { kind: 'after', beat: 'kings_ride.arrival', days: [4, 12] }, names: ['bran_stark', 'jaime_lannister'] },
  'kings_ride.southward': { names: KING },
  'catspaw.assassin': { names: ['bran_stark', 'catelyn_stark'] },
  'the_imp.seized': { pillar: true, names: ['catelyn_stark', 'tyrion_lannister'] },
  'the_imp.burning': { pillar: true, names: ['gregor_clegane'] },
  'last_hunt.boar': { pillar: true, names: ['robert_baratheon', 'lancel_lannister'] },
  'last_hunt.coup': {
    pillar: true, trigger: { kind: 'death', actor: 'robert_baratheon' }, names: ['eddard_stark', 'cersei_lannister', 'joffrey_baratheon'],
    alternates: [{
      // Robert is dead and the Hand is not in King's Landing to stand against the Queen: the crown passes quietly to Joffrey
      when: (s) => !alive(s, 'robert_baratheon') && alive(s, 'joffrey_baratheon') && !at(s, 'eddard_stark', 'baratheon'),
      effects: (s) => ({
        events: [ev('A boy king', 'King Robert is dead of a boar\'s tusk. With no Hand to gainsay her, Queen Cersei has Prince Joffrey crowned before the week is out; the realm bends the knee to the boy.', 'baratheon', 5, 'court', ['baratheon', 'lannister'])],
        changes: [{ op: 'character', id: 'joffrey_baratheon', title: 'King of the Andals and the First Men' }],
      }),
    }],
  },
  'last_hunt.banners': { pillar: true, names: ['robb_stark'] },
  'last_hunt.brothers': { names: ['renly_baratheon', 'stannis_baratheon'] },
  'crown_justice.baelors_sept': { names: ['eddard_stark', 'joffrey_baratheon'] },
  'king_in_north.crowned': { names: ['robb_stark'] },
  'five_kings.twins': { pillar: true, names: ['walder_frey', 'robb_stark'] },
  'five_kings.whispering_wood': { names: ['jaime_lannister', 'robb_stark'] },
  'five_kings.shadow': { names: ['renly_baratheon', 'stannis_baratheon', 'melisandre'] },
  'five_kings.blackwater': { names: ['stannis_baratheon', 'tyrion_lannister'] },
  'five_kings.red_wedding': { names: ['walder_frey', 'roose_bolton', 'robb_stark', 'catelyn_stark'] },
  'five_kings.purple_wedding': { names: ['joffrey_baratheon', 'olenna_tyrell'] },
  'the_wall.benjen': { names: ['benjen_stark'] },
  'dragons.wedding': { names: ['daenerys_targaryen', 'khal_drogo', 'viserys_targaryen'] },
  'dragons.golden_crown': { names: ['viserys_targaryen', 'khal_drogo'] },
  'dragons.hatching': { pillar: true, names: ['daenerys_targaryen'] },
  'ironborn.crown': { pillar: true, names: ['balon_greyjoy', 'theon_greyjoy'] },
};

