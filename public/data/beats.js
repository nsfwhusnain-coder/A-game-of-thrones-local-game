// The canon of 298–300 AC (docs/gdd/10-narrative-events.md §4): the great threads of the books, each a run of beats in
// the books' order. A beat's month is when its window opens (`at`), its grace how many moons more it may wait for the
// world to fit it (`needs`), and `fire` what happens — through the engine's own ops and the lord's matters, never a
// teleport. The beat engine (engine/world/beats.js) runs them; BEAT_META (below) gives each beat what the v2 schema adds:
// its trigger, whether it is a pillar of the story (kept even under Loose gravity), the people it canon-locks while it is
// pending, its alternates when the world has diverged, and what its lapse leaves behind.
import { joinParty, settle } from '../js/engine/parties.js';
import { pronouns } from '../js/shared/people.js';
import { random } from '../js/engine/rng.js';
import { dayNumber } from '../js/engine/time.js';
import { YM, C, alive, free, at, flag, player, plays, inWar, ev } from '../js/engine/world/beatkit.js';

// the men who hold a place against a night's work: its garrison and whatever hosts have come to it (the attackers' own never count)
const menHolding = (s, place, against) => Object.values(s.parties || {}).filter((p) => p.at === place && ['garrison', 'host'].includes(p.kind) && p.owner !== against && p.men > 0).reduce((n, p) => n + p.men, 0);
// the King's Hand is at court: canon keeps the boar and the tourney waiting for him while he is on the kingsroad
const handAtCourt = (s) => !flag(s, 'ned_hand') || !free(s, 'eddard_stark') || at(s, 'eddard_stark', 'baratheon');
// whether a thread has gone past a beat (fired, bent or lapsed): the boar waits for the Riverlands to burn, as in the books
const passed = (s, id) => { const [t, st] = id.split('.'); const i = THREADS.find((x) => x.id === t)?.stages.findIndex((x) => x.id === st) ?? -1; return (s.plots?.stages?.[t] || 0) > i; };

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
          events: [ev('The boy who fell', 'Bran Stark, who climbed every wall of Winterfell and never fell, is found broken at the foot of the old tower. He lives, but sleeps and does not wake. Maester Luwin sits by his bed.', 'stark', plays(s, 'stark') ? 5 : 3, 'intrigue', ['stark'], 'Bran Stark is found broken beneath the old tower')],
          changes: [{ op: 'character', id: 'bran_stark', status: 'wounded', note: 'Found broken at the foot of the old tower; remembers nothing of the fall.' }],
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
          return { events: [ev('The court goes south', 'The King\'s party leaves Winterfell by the kingsroad. Jon Snow rides north to take the black, and Tyrion Lannister goes with him to see the Wall.', 'stark', 2, 'court', ['stark', 'baratheon'], 'The royal court rides south from Winterfell')], changes: ch };
        },
      },
      {
        // K8: the wolf and the lion on the Trident — only if the girls ride south with the court
        id: 'trident', at: YM(298, 10), grace: 1, needs: (s) => flag(s, 'hand_daughters') && alive(s, 'arya_stark', 'sansa_stark', 'joffrey_baratheon') && !at(s, 'arya_stark', 'stark'),
        fire: () => ({
          events: [ev('The wolf and the lion', 'On the Trident, near the inn at Darry, Prince Joffrey draws steel on a butcher\'s boy who crossed swords of wood with Arya Stark; her direwolf savages the prince\'s arm. The Hound rides the boy down. The Queen demands a wolf\'s life, and Lord Eddard kills Sansa\'s Lady with his own hand. Arya\'s wolf is driven off into the woods.', 'darry', 3, 'court', ['stark', 'lannister', 'baratheon'], 'Arya Stark\'s direwolf wounds Prince Joffrey on the Trident')],
          changes: [{ op: 'relation', a: 'stark', b: 'lannister', delta: -8 }],
        }),
      },
      {
        // K9: the Hand in King's Landing — and the Crown's debt laid before him
        id: 'hand_at_court', at: YM(298, 11), grace: 2, needs: (s) => flag(s, 'ned_hand') && free(s, 'eddard_stark') && at(s, 'eddard_stark', 'baratheon'),
        fire: (s) => ({
          events: [ev('The Hand takes his seat', `Lord Eddard Stark sits the Hand's chair at the small council. The master of coin tells him, smiling, that the Crown owes six million dragons — three to Lord Tywin, the rest to the Iron Bank, the Faith and the Tyrells — and that the King wants a tourney.`, 'baratheon', plays(s, 'stark', 'baratheon') ? 4 : 2, 'court', ['stark', 'baratheon'], 'Eddard Stark takes his seat at the small council')],
          changes: [{ op: 'character', id: 'eddard_stark', note: 'Took his seat as Hand; learned the depth of the Crown\'s debt.' }],
        }),
      },
    ],
  },
  {
    id: 'catspaw', name: 'A dagger of Valyrian steel', stages: [
      {
        id: 'assassin', at: YM(298, 10), needs: (s) => alive(s, 'bran_stark', 'catelyn_stark') && s.characters.bran_stark.status === 'wounded',
        fire: (s) => {
          const out = { events: [ev('A knife in the night', 'A cutthroat with a dagger of Valyrian steel creeps into Bran Stark\'s chamber. Lady Catelyn fights him with her bare hands and the boy\'s direwolf tears out his throat. Such a blade is not a common sellsword\'s.', 'stark', plays(s, 'stark') ? 5 : 3, 'intrigue', ['stark'], 'An assassin enters Bran Stark\'s chamber with a Valyrian blade')], changes: [] };
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
      {
        // C3: in King's Landing Catelyn is told whose dagger it was (what she is told, not what is true)
        id: 'littlefingers_lie', at: YM(298, 11), grace: 1, needs: (s) => flag(s, 'cat_south') && free(s, 'catelyn_stark') && free(s, 'petyr_baelish') && at(s, 'catelyn_stark', 'baratheon'),
        fire: (s) => ({
          events: [ev('Whose dagger?', 'In a room above one of Petyr Baelish\'s establishments, Catelyn Stark shows her childhood friend the catspaw\'s dagger. He knows it: he lost it, he says, on a wager at the Prince\'s nameday tourney — to Tyrion Lannister.', 'baratheon', plays(s, 'stark', 'tully') ? 4 : 2, 'intrigue', ['stark', 'tully'], 'Petyr Baelish tells Catelyn Stark the dagger was Tyrion Lannister\'s')],
          changes: [{ op: 'relation', a: 'stark', b: 'lannister', delta: -10 }],
          flags: { cat_told: true },
        }),
      },
    ],
  },
  {
    id: 'hands_tourney', name: 'The Tourney of the Hand', stages: [
      {
        id: 'tourney', at: YM(298, 11), needs: (s) => alive(s, 'robert_baratheon') && flag(s, 'ned_hand') !== undefined && handAtCourt(s),
        fire: (s) => {
          const winner = free(s, 'loras_tyrell') ? 'Ser Loras Tyrell, the Knight of Flowers' : free(s, 'jaime_lannister') ? 'Ser Jaime Lannister' : 'a hedge knight no one had heard of';
          const out = {
            events: [ev('The Tourney of the Hand', `King Robert holds a great tourney in King's Landing, forty thousand golden dragons to the champion. Ser Hugh of the Vale dies with a lance through his throat; the Mountain loses his temper and tries to kill ${winner}, and the Hound stands between them. The crown's debt grows by the purse.`, 'baratheon', 3, 'court', ['baratheon', 'tyrell', 'clegane'], 'King Robert holds a great tourney at King\'s Landing', 'Forty thousand golden dragons go to the champion. The Mountain loses his temper and tries to kill Ser Loras Tyrell, the Knight of Flowers, and the Hound stands between them. The crown\'s debt grows by the purse.')],
            changes: [{ op: 'figure', house: 'baratheon', field: 'treasury', delta: -90000, source: 'The tourney accounts' }],
            post: (st) => { st.plots.tourneys = { ...(st.plots.tourneys || {}), baratheon: dayNumber(st.meta.date) }; },
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
        id: 'seized', at: YM(298, 11), needs: (s) => free(s, 'catelyn_stark') && free(s, 'tyrion_lannister') && flag(s, 'cat_south') === true && flag(s, 'cat_told') && !inWar(s, 'stark', 'lannister'),
        fire: (s) => ({
          events: [ev('Seized at the crossroads', 'At the inn at the crossroads, Catelyn Stark calls on the knights of her father\'s bannermen to seize Tyrion Lannister for the attempted murder of her son. He is carried off to the Eyrie to stand before her sister.', 'crossroads_inn', 5, 'intrigue', ['stark', 'tully', 'lannister', 'arryn'], 'Catelyn Stark calls for Tyrion Lannister\'s arrest at the crossroads inn')],
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
        // I4: Jaime answers his brother's taking in the streets of King's Landing
        id: 'streets', at: YM(298, 11), grace: 1, needs: (s) => free(s, 'jaime_lannister') && free(s, 'eddard_stark') && at(s, 'jaime_lannister', 'baratheon') && at(s, 'eddard_stark', 'baratheon') && !plays(s, 'stark', 'lannister'),
        fire: (s) => ({
          events: [ev('Swords in the street', 'Ser Jaime Lannister and twenty gold-cloaked swords fall on the Hand in the rain outside Chataya\'s. Jory Cassel and two of the Hand\'s guards die in the mud; Lord Eddard\'s leg is broken under his fallen horse. Jaime rides for Casterly Rock that night.', 'baratheon', 4, 'war', ['stark', 'lannister'], 'Jaime Lannister\'s swords ambush Eddard Stark in the rain')],
          changes: [...(alive(s, 'jory_cassel') ? [{ op: 'character', id: 'jory_cassel', alive: false, cause: 'slain by Jaime Lannister\'s men in the streets of King\'s Landing' }] : []), { op: 'character', id: 'eddard_stark', status: 'wounded', note: 'His leg broken in the fight in the street.' }, { op: 'travel', character: 'jaime_lannister', to: 'casterly_rock', men: 20, name: 'The Kingslayer\'s riders' }, { op: 'relation', a: 'stark', b: 'lannister', delta: -15 }],
        }),
      },
      {
        id: 'burning', at: YM(298, 12), needs: (s) => flag(s, 'riverlands_burn') && alive(s, 'gregor_clegane') && !inWar(s, 'lannister', 'tully'),
        fire: (s) => {
          const out = {
            events: [ev('Fire in the Riverlands', 'Men with no banners — but everyone knows the Mountain — burn Sherrer, the Mummer\'s Ford and a score of villages across the Riverlands. Edmure Tully calls his banners; Lord Tywin gathers a host at Casterly Rock.', 'riverrun', 5, 'war', ['lannister', 'tully', 'clegane'], 'Raiders burn the Riverlands and Edmure Tully calls his banners')],
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
      {
        // I2: the high road and the Eyrie: a sellsword wins the Imp his freedom
        id: 'trial', at: YM(298, 12), grace: 1, needs: (s) => alive(s, 'tyrion_lannister') && s.characters.tyrion_lannister.status === 'imprisoned' && at(s, 'tyrion_lannister', 'arryn') && alive(s, 'bronn') && !plays(s, 'arryn', 'lannister'),
        fire: (s) => ({
          events: [ev('Trial by combat in the Eyrie', 'Before Lady Lysa\'s high seat Tyrion Lannister demands a trial by combat. A sellsword named Bronn takes his part and, in the garden of the Eyrie, tires out Ser Vardis Egen and sends him through the Moon Door. The Imp is set free on the high road, where the mountain clans come for him — and go with him.', 'arryn', 4, 'intrigue', ['arryn', 'lannister'], 'Tyrion Lannister is freed by Bronn\'s sword at the Eyrie')],
          changes: [...(alive(s, 'vardis_egen') ? [{ op: 'character', id: 'vardis_egen', alive: false, cause: 'slain by Bronn in Tyrion Lannister\'s trial by combat' }] : []), { op: 'character', id: 'tyrion_lannister', status: 'free', note: 'Freed by trial by combat; the mountain clans ride with him.' }, { op: 'travel', character: 'tyrion_lannister', to: 'casterly_rock', men: 0, companions: ['bronn'] }],
        }),
      },
      {
        // I5: the Hand sends the King's justice after the Mountain
        id: 'berics_ride', at: YM(298, 12), grace: 1, needs: (s) => flag(s, 'ned_hand') && alive(s, 'eddard_stark', 'beric_dondarrion') && at(s, 'eddard_stark', 'baratheon') && !plays(s, 'stark', 'dondarrion'),
        fire: () => ({
          events: [ev('The King\'s justice rides', 'From the Iron Throne, in the King\'s name, the Hand sends Lord Beric Dondarrion with a hundred and twenty men to bring Ser Gregor Clegane to justice for the burning of the Riverlands. Thoros of Myr rides with him.', 'baratheon', 3, 'court', ['stark', 'dondarrion', 'clegane'], 'Beric Dondarrion rides to bring Gregor Clegane to the King\'s justice')],
          changes: [{ op: 'character', id: 'beric_dondarrion', note: 'Sent by the Hand to bring the Mountain to justice.' }, { op: 'relation', a: 'stark', b: 'clegane', delta: -20 }],
        }),
      },
      {
        // I6: the lions come down into the Riverlands in strength
        id: 'lions', at: YM(299, 1), grace: 1, needs: (s) => inWar(s, 'lannister', 'tully') && alive(s, 'tywin_lannister') && !plays(s, 'lannister', 'tully'),
        fire: (s) => {
          const out = {
            events: [ev('The lions in the Riverlands', 'Ser Jaime Lannister comes down through the Golden Tooth with fifteen thousand and scatters the river lords beneath Riverrun, taking Ser Edmure Tully captive; Riverrun is closed in. Lord Tywin, with twenty thousand more, takes Harrenhal and burns his way east along the Trident.', 'tully', 5, 'war', ['lannister', 'tully'], 'Jaime Lannister scatters the river lords and shuts in Riverrun')],
            changes: [{ op: 'battle', name: 'Battle beneath the walls of Riverrun', at: 'tully', attacker: 'lannister', defender: 'tully', victor: 'lannister' }],
          };
          const camp = Object.values(s.parties).filter((a) => a.owner === 'lannister' && a.kind === 'host' && a.men > 0 && a.pos).sort((a, b) => Math.hypot(a.pos[0] - s.holdings.tully.pos[0], a.pos[1] - s.holdings.tully.pos[1]) - Math.hypot(b.pos[0] - s.holdings.tully.pos[0], b.pos[1] - s.holdings.tully.pos[1]))[0];
          if (free(s, 'edmure_tully')) out.changes.push({ op: 'character', id: 'edmure_tully', status: 'imprisoned', loc: camp ? `party:${camp.id}` : 'lannister', note: 'Taken beneath the walls of Riverrun by Jaime Lannister.' });
          for (const id of ['darry', 'blackwood', 'whent']) if (s.holdings[id]) out.changes.push({ op: 'holding', id, unrest: Math.min(100, (s.holdings[id].unrest || 0) + 20), prosperity: Math.max(0, (s.holdings[id].prosperity || 50) - 15), note: 'Harried by Lord Tywin\'s host' });
          return out;
        },
      },
    ],
  },
  {
    id: 'last_hunt', name: 'The King\'s last hunt', stages: [
      {
        id: 'boar', at: YM(298, 12), needs: (s) => alive(s, 'robert_baratheon') && s.characters.robert_baratheon.status !== 'imprisoned' && handAtCourt(s) && passed(s, 'the_imp.burning'),
        fire: (s) => {
          if (plays(s, 'baratheon')) {
            return {
              events: [ev('A hunt in the kingswood', 'King Robert is restless and means to hunt boar in the kingswood. His squire Lancel keeps his cup full of strongwine.', 'baratheon', 3, 'court', ['baratheon'], 'King Robert rides out to hunt boar in the kingswood')],
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
            events: [ev('The King is dead', 'King Robert, drunk on strongwine, is opened from groin to nipple by a boar in the kingswood and dies of it. Before he dies he names Lord Eddard Protector of the Realm until his son comes of age.', 'baratheon', 5, 'court', ['baratheon', 'lannister', 'stark'], 'King Robert is gored by a boar in the kingswood')],
            changes: [{ op: 'character', id: 'robert_baratheon', alive: false, cause: 'gored by a boar in the kingswood' }],
          };
        },
      },
      {
        id: 'coup', at: YM(298, 12), needs: (s) => !alive(s, 'robert_baratheon') && free(s, 'eddard_stark') && at(s, 'eddard_stark', 'baratheon') && alive(s, 'cersei_lannister'),
        fire: (s) => {
          if (plays(s, 'stark')) {
            return {
              events: [ev('The throne room', 'Robert is dead. Joffrey sits the Iron Throne; Cersei holds his letters. You alone know that none of her children are Robert\'s.', 'baratheon', 5, 'intrigue', ['stark', 'lannister'], 'Joffrey sits the Iron Throne while Cersei holds the late King\'s letters')],
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
            events: [ev('Treason in the throne room', 'Lord Eddard Stark produces the late King\'s letter naming him Protector of the Realm. The gold cloaks turn their spears on his guards. The Hand is dragged to the black cells, and Joffrey is proclaimed king.', 'baratheon', 5, 'intrigue', ['stark', 'lannister', 'baratheon'], 'Eddard Stark is dragged to the black cells for treason')],
            changes: [{ op: 'character', id: 'eddard_stark', status: 'imprisoned', note: 'Seized in the throne room for treason.' }, { op: 'relation', a: 'stark', b: 'lannister', delta: -40 }],
            flags: { ned_seized: true },
          };
        },
      },
      {
        // H3: the boy is crowned; the old Lord Commander is sent away; the Lannisters take the offices
        id: 'joffrey_crowned', at: YM(298, 12), grace: 1, needs: (s) => !alive(s, 'robert_baratheon') && free(s, 'joffrey_baratheon') && !plays(s, 'baratheon'),
        fire: (s) => {
          const ch = [{ op: 'character', id: 'joffrey_baratheon', title: 'King of the Andals and the First Men' }];
          if (free(s, 'barristan_selmy')) ch.push({ op: 'character', id: 'barristan_selmy', note: 'Dismissed from the Kingsguard by King Joffrey; rode out of the city in his armour.' });
          if (alive(s, 'tywin_lannister') && !plays(s, 'lannister')) ch.push({ op: 'character', id: 'tywin_lannister', title: 'Hand of the King, Lord of Casterly Rock' });
          if (alive(s, 'janos_slynt')) ch.push({ op: 'character', id: 'janos_slynt', title: 'Lord of Harrenhal, Commander of the City Watch' });
          return { events: [ev('King Joffrey', 'In the Great Sept of Baelor the High Septon sets the crown on Joffrey Baratheon\'s head. The new King dismisses Ser Barristan Selmy from his Kingsguard for being old; Lord Tywin is named Hand, and Janos Slynt of the gold cloaks is given Harrenhal.', 'baratheon', 4, 'court', ['baratheon', 'lannister'], 'The High Septon sets the crown on Joffrey Baratheon\'s head', 'The new King dismisses Ser Barristan Selmy from his Kingsguard for being old, and Janos Slynt of the gold cloaks is given Harrenhal.')], changes: ch };
        },
      },
      {
        id: 'banners', at: YM(299, 1), needs: (s) => flag(s, 'ned_seized') && !inWar(s, 'stark', 'lannister') && s.houses.stark?.lord && alive(s, s.houses.stark.lord),
        fire: (s) => {
          const out = {
            events: [ev('The North calls its banners', `${C(s, 'robb_stark')?.alive ? 'Robb Stark, fifteen years old,' : 'Winterfell'} calls the banners of the North. The lords come: Umber, Karstark, Bolton, Glover, Mormont, Manderly. Eighteen thousand men march for Moat Cailin.`, 'stark', 5, 'war', ['stark', 'lannister'], `${C(s, 'robb_stark')?.alive ? 'Robb Stark' : 'Winterfell'} calls the banners of the North`)],
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
          const renly = ch.some((c) => c.id === 'renly_baratheon'); const stannis = ch.some((c) => c.id === 'stannis_baratheon');
          const head = renly && stannis ? 'Renly and Stannis Baratheon each claim the crown' : renly ? 'Renly Baratheon claims the crown at Highgarden' : 'Stannis Baratheon claims the crown from Dragonstone';
          return { events: [ev('Brothers crowned', ev_.join(' '), 'baratheon_ds', 5, 'court', ['baratheon_se', 'baratheon_ds', 'tyrell'], head)], changes: ch };
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
              events: [ev('The traitor in the black cells', 'Lord Eddard Stark has confessed his treason, if he is allowed to take the black. The small council is divided; the King wants a head.', 'baratheon', 4, 'court', ['stark', 'baratheon'], 'Eddard Stark offers to confess and take the black')],
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
            events: [ev('The steps of Baelor\'s Sept', 'Before the Great Sept, Eddard Stark confesses to treason he did not commit, to save his daughters. King Joffrey, to the horror of his mother and council, has Ser Ilyn Payne take his head. His sword Ice goes to the Lannisters.', 'baratheon', 5, 'court', ['stark', 'baratheon', 'lannister'], 'Ilyn Payne takes Eddard Stark\'s head on King Joffrey\'s word')],
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
              events: [ev('A council of war', 'Your lords have gathered in the great hall of Riverrun. The Greatjon is on his feet.', 'tully', 4, 'court', ['stark'], 'The northern lords gather at Riverrun for a council of war')],
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
            events: [ev('The King in the North', `At Riverrun the northern lords lay their swords before ${lord?.name || 'the Stark'} and proclaim ${lord ? pronouns(lord).him : 'him'} ${lord && pronouns(lord).he === 'she' ? 'Queen' : 'King'} in the North, as ${lord ? pronouns(lord).his : 'his'} forefathers were before Aegon came. The river lords kneel with them.`, 'tully', 5, 'court', ['stark', 'tully'], `${lord ? lord.name : 'A young Stark'} is proclaimed ${lord && pronouns(lord).he === 'she' ? 'Queen' : 'King'} in the North at Riverrun`)],
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
              events: [ev('The crossing at the Twins', 'Your host must cross the Green Fork, and the only bridge for a hundred leagues belongs to Lord Walder Frey — who called his banners and has not yet decided which side to march on.', 'frey', 4, 'war', ['stark', 'frey'], 'Walder Frey holds the only crossing of the Green Fork')],
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
          return { events: [ev('The crossing at the Twins', 'Lord Walder Frey lets the northern host cross the Green Fork, for a price: his daughter\'s marriage to the young Stark lord when the war is done. Four thousand Frey swords march south with them.', 'frey', 3, 'war', ['stark', 'frey'], 'Walder Frey lets the northern host cross the Green Fork')], changes: [{ op: 'pact', type: 'alliance', a: 'stark', b: 'frey', terms: 'Passage of the Twins; a Stark to wed a Frey' }], flags: { frey_pact: true } };
        },
      },
      {
        // the player's own battles are fought by the engine where their hosts are, never scripted for them
        id: 'whispering_wood', at: YM(299, 3), grace: 3, needs: (s) => inWar(s, 'stark', 'lannister') && free(s, 'jaime_lannister') && !plays(s, 'lannister', 'stark', 'tully'),
        fire: (s) => {
          const win = (s.meta.settings?.canonGravity || 'canon') === 'canon' || random() < (plays(s, 'stark') ? 0.6 : 0.7);
          return win
            ? { events: [ev('The Whispering Wood', 'In the dark of the Whispering Wood the northmen fall on Jaime Lannister\'s camp from three sides. The Kingslayer is taken alive, and three lordlings with him. The siege of Riverrun is broken.', 'tully', 5, 'war', ['stark', 'lannister'], 'The northmen fall on Jaime Lannister\'s camp in the Whispering Wood')], changes: [{ op: 'character', id: 'jaime_lannister', status: 'imprisoned', loc: 'tully' }, { op: 'battle', name: 'Battle of the Whispering Wood', at: 'tully', attacker: 'stark', defender: 'lannister', victor: 'stark' }] }
            : { events: [ev('A trap that failed', 'The northmen try to take Jaime Lannister in the Whispering Wood, but his scouts smell them out. He cuts his way free and the siege of Riverrun goes on.', 'tully', 3, 'war', ['stark', 'lannister'], 'Jaime Lannister cuts his way free of the northmen\'s trap')], changes: [{ op: 'battle', name: 'Skirmish in the Whispering Wood', at: 'tully', attacker: 'stark', defender: 'lannister', victor: 'lannister' }] };
        },
      },
      {
        id: 'shadow', at: YM(299, 6), grace: 2, needs: (s) => alive(s, 'renly_baratheon', 'stannis_baratheon', 'melisandre') && /king/i.test(s.characters.renly_baratheon.title || '') && /king/i.test(s.characters.stannis_baratheon.title || '') && !plays(s, 'baratheon_se', 'baratheon_ds'),
        fire: () => ({
          events: [ev('A shadow in the king\'s tent', 'On the eve of battle outside Storm\'s End, King Renly is slain in his own tent by a shadow with his brother\'s face, before the eyes of Catelyn Stark and Brienne of Tarth. By dawn the stormlords have gone over to Stannis; the Tyrells ride home.', 'baratheon_se', 5, 'intrigue', ['baratheon_se', 'baratheon_ds', 'tyrell'], 'A shadow comes to King Renly\'s tent outside Storm\'s End')],
          changes: [{ op: 'character', id: 'renly_baratheon', alive: false, cause: 'slain by a shadow in his tent' }, { op: 'pact', type: 'alliance', a: 'baratheon_se', b: 'tyrell', status: 'ended' }],
        }),
      },
      {
        id: 'blackwater', at: YM(299, 9), grace: 1, needs: (s) => alive(s, 'stannis_baratheon', 'joffrey_baratheon') && /king/i.test(s.characters.stannis_baratheon.title || '') && !plays(s, 'baratheon', 'baratheon_ds'),
        fire: (s) => {
          const lanTyrell = alive(s, 'tywin_lannister') && !alive(s, 'renly_baratheon');
          if (lanTyrell) {
            return { events: [ev('The Blackwater', 'Stannis\'s fleet sails into the mouth of the Blackwater Rush — and into a river of wildfire. As his army storms the Mud Gate, Lord Tywin and the Tyrells fall on its flank. The ghost of Renly, men say, led the charge. Stannis flees to Dragonstone with a remnant.', 'baratheon', 5, 'war', ['baratheon', 'baratheon_ds', 'lannister', 'tyrell'], 'Wildfire burns Stannis Baratheon\'s fleet on the Blackwater')], changes: [{ op: 'battle', name: 'Battle of the Blackwater', at: 'baratheon', attacker: 'baratheon_ds', defender: 'baratheon', victor: 'baratheon' }, { op: 'pact', type: 'alliance', a: 'lannister', b: 'tyrell', terms: 'Margaery Tyrell to wed King Joffrey' }, { op: 'figure', house: 'baratheon_ds', field: 'ships', delta: -100 }, { op: 'relation', a: 'lannister', b: 'tyrell', delta: 30 }] };
          }
          return { events: [ev('The Blackwater', 'Stannis Baratheon storms King\'s Landing. The wildfire burns half his fleet, but no relief comes: the gates are forced, the gold cloaks throw down their spears, and Joffrey is dragged from the Red Keep.', 'baratheon', 5, 'war', ['baratheon', 'baratheon_ds'], 'Stannis Baratheon attacks King\'s Landing across the Blackwater')], changes: [{ op: 'battle', name: 'Battle of the Blackwater', at: 'baratheon', attacker: 'baratheon_ds', defender: 'baratheon', victor: 'baratheon_ds' }, { op: 'character', id: 'joffrey_baratheon', status: 'imprisoned' }, { op: 'character', id: 'stannis_baratheon', loc: 'baratheon' }] };
        },
      },
      {
        // W15: the Rose and the Lion: the price of the Tyrells' help
        id: 'rose_lion', at: YM(299, 10), grace: 2, needs: (s) => free(s, 'joffrey_baratheon') && alive(s, 'margaery_tyrell') && (s.pacts || []).some((p) => p.status !== 'ended' && [p.a, p.b].includes('tyrell') && [p.a, p.b].includes('lannister')) && !plays(s, 'baratheon', 'tyrell'),
        fire: (s) => ({
          events: [ev('The Rose and the Lion', 'Before the court King Joffrey sets Sansa Stark aside — the daughter of a traitor — and asks Lord Mace Tyrell for his daughter Margaery\'s hand. The wedding is set for the new year.', 'baratheon', 4, 'court', ['baratheon', 'tyrell', 'stark'], 'King Joffrey sets Sansa Stark aside and asks for Margaery Tyrell')],
          changes: [{ op: 'character', id: 'margaery_tyrell', note: 'Betrothed to King Joffrey.' }, ...(alive(s, 'sansa_stark') ? [{ op: 'character', id: 'sansa_stark', note: 'Set aside by King Joffrey; still kept at court.' }] : []), { op: 'relation', a: 'lannister', b: 'tyrell', delta: 10 }],
        }),
      },
      {
        id: 'red_wedding', at: YM(299, 11), grace: 3, needs: (s) => flag(s, 'frey_pact') && flag(s, 'frey_slight') && !plays(s, 'stark') && alive(s, 'walder_frey', 'roose_bolton') && s.houses.stark?.lord && alive(s, s.houses.stark.lord) && inWar(s, 'stark', 'lannister') && random() < 0.7,
        fire: (s) => {
          const lord = s.houses.stark.lord;
          return {
            events: [ev('The Red Wedding', 'At the Twins, under Lord Walder\'s roof, the musicians strike up "The Rains of Castamere" and the Freys and Boltons murder the King in the North, his mother and his bannermen at the wedding feast. Guest right is broken. The North remembers.', 'frey', 5, 'war', ['stark', 'frey', 'bolton', 'lannister'], 'Guest right is broken at the Twins', 'The musicians strike up "The Rains of Castamere" under Lord Walder\'s roof, and the wedding feast turns to slaughter. The North remembers.')],
            changes: [{ op: 'character', id: lord, alive: false, cause: 'murdered at the Red Wedding' }, ...(alive(s, 'catelyn_stark') ? [{ op: 'character', id: 'catelyn_stark', alive: false, cause: 'murdered at the Red Wedding' }] : []), { op: 'character', id: 'roose_bolton', title: 'Warden of the North, Lord of the Dreadfort' }, { op: 'relation', a: 'stark', b: 'frey', delta: -100 }, { op: 'relation', a: 'lannister', b: 'frey', delta: 30 }],
          };
        },
      },
      {
        id: 'purple_wedding', at: YM(300, 2), grace: 1, needs: (s) => alive(s, 'joffrey_baratheon', 'olenna_tyrell') && free(s, 'joffrey_baratheon') && /king/i.test(s.characters.joffrey_baratheon.title || '') && (s.pacts || []).some((p) => p.status !== 'ended' && [p.a, p.b].includes('tyrell') && [p.a, p.b].includes('lannister')) && !plays(s, 'baratheon'),
        fire: () => ({
          events: [ev('The Purple Wedding', 'At his wedding feast King Joffrey chokes on pigeon pie and wine, clawing at his throat, and dies purple-faced in his mother\'s arms. Cersei screams that Tyrion poisoned him. Tommen, eight years old, is king.', 'baratheon', 5, 'intrigue', ['baratheon', 'lannister', 'tyrell'], 'King Joffrey chokes at his wedding feast')],
          changes: [{ op: 'character', id: 'joffrey_baratheon', alive: false, cause: 'poisoned at his wedding feast' }, { op: 'character', id: 'tyrion_lannister', status: 'imprisoned', loc: 'baratheon', note: 'Accused of poisoning the King.' }],
        }),
      },
      {
        // W21: a trial by combat: the Red Viper stands for the accused
        id: 'viper', at: YM(300, 3), grace: 1, needs: (s) => alive(s, 'tyrion_lannister', 'oberyn_martell', 'gregor_clegane') && s.characters.tyrion_lannister.status === 'imprisoned' && at(s, 'oberyn_martell', 'baratheon', 'martell') && !plays(s, 'lannister', 'martell', 'clegane'),
        fire: () => ({
          events: [ev('The Viper and the Mountain', 'Tyrion Lannister demands a trial by combat, and Prince Oberyn Martell takes his part against Ser Gregor Clegane. The prince has the Mountain down, his spear through him, and will have a confession for his sister Elia — and the Mountain pulls him down and crushes his skull. Tyrion is condemned. Ser Gregor lies dying of the spear\'s poison.', 'baratheon', 5, 'court', ['lannister', 'martell', 'clegane'], 'Oberyn Martell fights for Tyrion Lannister against Gregor Clegane')],
          changes: [{ op: 'character', id: 'oberyn_martell', alive: false, cause: 'slain by Ser Gregor Clegane in a trial by combat' }, { op: 'character', id: 'gregor_clegane', status: 'wounded', note: 'Dying slowly of a poisoned spear.' }, { op: 'relation', a: 'martell', b: 'lannister', delta: -40 }],
        }),
      },
      {
        // W22: the condemned son and the father
        id: 'tywin_dies', at: YM(300, 4), grace: 1, needs: (s) => alive(s, 'tywin_lannister', 'tyrion_lannister') && s.characters.tyrion_lannister.status === 'imprisoned' && !plays(s, 'lannister'),
        fire: () => ({
          events: [ev('The Lord of Casterly Rock is dead', 'Lord Tywin Lannister is found dead in the privy of the Tower of the Hand with a crossbow bolt in his belly. His dwarf son, condemned to die, is gone from the black cells. Men say a great lord who shat gold has died unable to shit at all.', 'baratheon', 5, 'court', ['lannister', 'baratheon'], 'Tywin Lannister is found with a crossbow bolt in his belly')],
          changes: [{ op: 'character', id: 'tywin_lannister', alive: false, cause: 'shot with a crossbow in the Tower of the Hand' }, { op: 'character', id: 'tyrion_lannister', status: 'missing', note: 'Escaped the black cells.' }],
        }),
      },
    ],
  },
  {
    id: 'young_wolf', name: 'The Young Wolf', stages: [
      {
        // W3: Roose Bolton draws Lord Tywin to the Green Fork while Robb crosses at the Twins
        id: 'green_fork', at: YM(299, 2), grace: 1, needs: (s) => inWar(s, 'stark', 'lannister') && free(s, 'roose_bolton') && free(s, 'tywin_lannister') && !plays(s, 'stark', 'lannister', 'bolton'),
        fire: () => ({
          events: [ev('The Green Fork', 'Roose Bolton brings the northern foot down the kingsroad by night and falls on Lord Tywin\'s host on the Green Fork. The northmen are broken and fall back on the Twins, but they held the lions long enough: the northern horse has crossed the river.', 'darry', 4, 'war', ['stark', 'bolton', 'lannister'], 'Roose Bolton falls on Tywin Lannister\'s host at the Green Fork')],
          changes: [{ op: 'battle', name: 'Battle on the Green Fork', at: 'darry', attacker: 'stark', defender: 'lannister', victor: 'lannister' }],
        }),
      },
      {
        // W5: the Camps — Riverrun relieved the night after the Whispering Wood
        id: 'camps', at: YM(299, 3), grace: 1, needs: (s) => inWar(s, 'stark', 'lannister') && alive(s, 'jaime_lannister') && !free(s, 'jaime_lannister') && !plays(s, 'stark', 'lannister', 'tully'),
        fire: (s) => ({
          events: [ev('The Battle of the Camps', 'With the Kingslayer taken, the northmen fall on the three Lannister camps about Riverrun while the rivers keep them apart. The besiegers break and flee west; Riverrun\'s gates open to the Young Wolf, and Ser Edmure Tully is freed.', 'tully', 4, 'war', ['stark', 'tully', 'lannister'], 'The northmen break the Lannister camps around Riverrun')],
          changes: [{ op: 'battle', name: 'Battle of the Camps', at: 'tully', attacker: 'stark', defender: 'lannister', victor: 'stark' }, ...(alive(s, 'edmure_tully') && !free(s, 'edmure_tully') ? [{ op: 'character', id: 'edmure_tully', status: 'free', loc: 'tully', note: 'Freed at the Battle of the Camps.' }] : [])],
        }),
      },
      {
        // W9: the western campaign — Oxcross, the Crag, and a wedding that breaks a vow
        id: 'westerlands', at: YM(299, 6), grace: 2, needs: (s) => inWar(s, 'stark', 'lannister') && s.houses.stark?.lord === 'robb_stark' && free(s, 'robb_stark') && alive(s, 'jeyne_westerling') && !s.characters.robb_stark.spouse && !plays(s, 'stark', 'westerling', 'lannister', 'frey'),
        fire: () => ({
          events: [ev('The Young Wolf in the west', 'Robb Stark takes the war into the westerlands: he routs Stafford Lannister\'s levies at Oxcross and storms the Crag, where he is wounded by an arrow. Nursed by Lord Gawen\'s daughter Jeyne, he takes her to bed — and, being who he is, marries her. At the Twins, Lord Walder Frey hears of it.', 'westerling', 5, 'war', ['stark', 'westerling', 'lannister', 'frey'], 'Robb Stark takes the war into the westerlands')],
          changes: [{ op: 'battle', name: 'Battle of Oxcross', at: 'westerling', attacker: 'stark', defender: 'lannister', victor: 'stark' }, { op: 'character', id: 'robb_stark', spouse: 'jeyne_westerling', note: 'Wed Jeyne Westerling at the Crag, breaking his word to the Freys.' }, { op: 'character', id: 'jeyne_westerling', spouse: 'robb_stark' }, { op: 'liege', house: 'westerling', liege: 'stark' }, { op: 'relation', a: 'stark', b: 'frey', delta: -40 }],
          flags: { frey_slight: true },
        }),
      },
      {
        // W11: Edmure holds the fords of the Red Fork against Lord Tywin
        id: 'fords', at: YM(299, 7), grace: 1, needs: (s) => inWar(s, 'tully', 'lannister') && free(s, 'edmure_tully') && free(s, 'tywin_lannister') && !plays(s, 'tully', 'lannister'),
        fire: () => ({
          events: [ev('The Battle of the Fords', 'Lord Tywin tries to force the fords of the Red Fork, and Ser Edmure Tully, who has chosen to hold the river rather than fall back as his king bid him, throws him back again and again. Tywin draws off — towards King\'s Landing.', 'tully', 4, 'war', ['tully', 'lannister'], 'Edmure Tully holds the Red Fork against Tywin Lannister')],
          changes: [{ op: 'battle', name: 'Battle of the Fords', at: 'tully', attacker: 'lannister', defender: 'tully', victor: 'tully' }],
        }),
      },
      {
        // W12: Catelyn sends the Kingslayer south to buy back her daughters
        id: 'kingslayer_freed', at: YM(299, 8), grace: 1, needs: (s) => alive(s, 'jaime_lannister') && !free(s, 'jaime_lannister') && at(s, 'jaime_lannister', 'tully') && free(s, 'catelyn_stark') && !plays(s, 'stark', 'tully', 'lannister'),
        fire: () => ({
          events: [ev('The Kingslayer gone', 'Word runs through Riverrun that the Kingslayer is gone from his cell. Lady Catelyn has let him go in the night, under guard of a tall knight of Tarth, to be exchanged for her daughters in King\'s Landing. The river lords are furious; Lord Karstark, whose sons Jaime killed, most of all.', 'tully', 4, 'intrigue', ['stark', 'tully', 'lannister', 'karstark'], 'Catelyn Stark lets the Kingslayer go from Riverrun')],
          changes: [{ op: 'character', id: 'jaime_lannister', status: 'free', note: 'Released by Catelyn Stark to be exchanged for her daughters.' }, { op: 'relation', a: 'stark', b: 'karstark', delta: -20 }],
          flags: { jaime_freed: true },
        }),
      },
      {
        // W16: Karstark's justice — and the king's
        id: 'karstark', at: YM(299, 10), grace: 1, needs: (s) => flag(s, 'jaime_freed') && free(s, 'rickard_karstark') && inWar(s, 'stark', 'lannister') && !plays(s, 'stark', 'karstark'),
        fire: () => ({
          events: [ev('Karstark\'s justice', 'In the night Lord Rickard Karstark\'s men murder two Lannister boys held captive at Riverrun. The King in the North beheads him with his own hand for it. Half the Karstark horse ride home.', 'tully', 4, 'court', ['stark', 'karstark'], 'Robb Stark sits in judgement on Lord Rickard Karstark')],
          changes: [{ op: 'character', id: 'rickard_karstark', alive: false, cause: 'beheaded by his king for the murder of captives' }, { op: 'relation', a: 'stark', b: 'karstark', delta: -40 }],
        }),
      },
    ],
  },
  {
    id: 'riverrun', name: 'The lord of Riverrun', stages: [
      {
        // W17: Hoster Tully dies abed, as he has long been dying
        id: 'hoster', at: YM(299, 7), grace: 4, needs: (s) => alive(s, 'hoster_tully') && !plays(s, 'tully'),
        fire: (s) => ({
          events: [ev('The lord of Riverrun is dead', 'Lord Hoster Tully, long abed, dies at Riverrun with his daughter at his side. His funeral boat is set adrift on the Red Fork; his son Edmure\'s burning arrows miss it three times before his uncle takes the bow.', 'tully', 3, 'court', ['tully'], 'Hoster Tully\'s funeral boat is set adrift on the Red Fork')],
          changes: [{ op: 'character', id: 'hoster_tully', alive: false, cause: 'a long illness' }, ...(alive(s, 'edmure_tully') && s.houses.tully?.lord === 'hoster_tully' ? [{ op: 'house', house: 'tully', lord: 'edmure_tully' }] : [])],
        }),
      },
    ],
  },
  {
    id: 'omens', name: 'Signs and seasons', stages: [
      {
        id: 'comet', at: YM(299, 3), grace: 1, needs: () => true,
        fire: () => ({ events: [ev('The red comet', 'A comet the colour of blood hangs in the sky over all Westeros, by day and by night. The ironborn call it the Drowned God\'s sword; in King\'s Landing it is Joffrey\'s; the maesters say only that it is a comet. Every man reads it for his own king.', 'baratheon', 3, 'court', [], 'A red comet burns in the sky over King\'s Landing')] }),
      },
      {
        // the white raven of autumn (10 §4.10): under Canon gravity the Citadel's word, not the dice
        id: 'autumn', at: YM(299, 9), grace: 2, needs: (s) => (s.world?.season || 'summer') === 'summer',
        fire: () => ({
          events: [ev('The white ravens: autumn', 'The Conclave has met, and white ravens fly from the Citadel to every castle: summer is ended. Ten years, two turns and sixteen days it lasted, the longest in living memory. Lords are counselled to fill their granaries.', 'hightower', 4, 'court', [], 'Summer ends as white ravens fly from the Hightower')],
          post: (st) => { st.world = st.world || {}; st.world.season = 'autumn'; st.world.seasonDays = 0; st.world.seasonNote = 'The Citadel has sent forth the white ravens: summer is ended.'; },
        }),
      },
      {
        id: 'winter', at: YM(300, 7), grace: 5, needs: (s) => s.world?.season === 'autumn',
        fire: () => ({
          events: [ev('The white ravens: winter', 'White ravens fly from Oldtown again: winter has come. In the North the snows lie deep already; in the south the harvest is in, what harvest the war has left.', 'hightower', 5, 'court', [], 'Winter comes as white ravens fly from the Hightower')],
          post: (st) => { st.world = st.world || {}; st.world.season = 'winter'; st.world.seasonDays = 0; st.world.seasonNote = 'White ravens fly from Oldtown: winter has come.'; },
        }),
      },
    ],
  },
  {
    id: 'the_wall', name: 'Beyond the Wall', stages: [
      {
        id: 'benjen', at: YM(298, 11), needs: (s) => free(s, 'benjen_stark'),
        fire: () => ({ events: [ev('A ranger overdue', 'Benjen Stark, First Ranger of the Night\'s Watch, rode beyond the Wall with six men to look for Ser Waymar Royce. Weeks later his horse comes back to Castle Black without him.', 'nights_watch', 3, 'court', ['nights_watch', 'stark'], 'Benjen Stark\'s horse comes back to Castle Black without him')], changes: [{ op: 'character', id: 'benjen_stark', status: 'missing', loc: 'beyond the Wall', note: 'Vanished ranging beyond the Wall.' }] }),
      },
      {
        id: 'wights', at: YM(299, 1), grace: 2, needs: (s) => alive(s, 'jeor_mormont'), // canon: the dead rise at Castle Black early in 299 (GDD 10 §4.8 N2), whatever the threat reads
        fire: () => ({ events: [ev('The dead come to Castle Black', 'Two rangers\' bodies, found in the haunted forest and carried back, rise in the night and kill a brother in the Lord Commander\'s tower. They burn only with fire. Lord Commander Mormont resolves to lead a great ranging beyond the Wall.', 'nights_watch', 5, 'court', ['nights_watch'], 'Two rangers carried back to Castle Black rise in the night')], changes: [{ op: 'character', id: 'jeor_mormont', note: 'Saw the dead walk in his own tower.' }], flags: { dead_walk: true } }),
      },
      {
        id: 'great_ranging', at: YM(299, 3), grace: 2, needs: (s) => free(s, 'jeor_mormont') && !plays(s, 'nights_watch'),
        fire: () => ({
          events: [ev('The Great Ranging', 'Lord Commander Mormont rides out of Castle Black with three hundred brothers — a third of the Watch — to find Benjen Stark, and what Mance Rayder is gathering in the mountains. They make their camp on the Fist of the First Men.', 'nights_watch', 3, 'court', ['nights_watch'], 'Jeor Mormont leads three hundred brothers out of Castle Black')],
          changes: [{ op: 'travel', character: 'jeor_mormont', to: 'fist_first_men', men: 0 }],
          flags: { great_ranging: true },
        }),
      },
      {
        id: 'fist', at: YM(299, 10), grace: 1, needs: (s) => flag(s, 'great_ranging') && alive(s, 'jeor_mormont') && !plays(s, 'nights_watch'),
        fire: () => ({
          events: [ev('The Fist of the First Men', 'In a night of snow the dead come up the Fist of the First Men, and the Others with them. The brothers\' fires go out one by one. Of three hundred who rode out, fewer than fifty stumble through the snow to the keep of a wildling called Craster.', 'fist_first_men', 5, 'war', ['nights_watch'], 'The brothers\' fires go out on the Fist of the First Men')],
          changes: [{ op: 'figure', house: 'nights_watch', field: 'menAtArms', delta: -250, source: 'The Fist of the First Men' }],
        }),
      },
      {
        id: 'crasters', at: YM(299, 11), grace: 1, needs: (s) => alive(s, 'jeor_mormont') && !plays(s, 'nights_watch'),
        fire: () => ({
          events: [ev('Mutiny at Craster\'s Keep', 'Starving and snowbound under Craster\'s roof, the brothers turn on their host — and on the Lord Commander. Jeor Mormont, the Old Bear, dies in the mud of the keep with a knife in his back. The survivors straggle home to the Wall.', 'crasters_keep', 5, 'court', ['nights_watch'], 'Brothers of the Watch turn on Jeor Mormont at Craster\'s Keep')],
          changes: [{ op: 'character', id: 'jeor_mormont', alive: false, cause: 'murdered by mutineers at Craster\'s Keep' }],
        }),
      },
      {
        // N6: Mance Rayder's host comes against the Wall, and a king comes to its aid
        id: 'wildlings_attack', at: YM(300, 2), grace: 2, needs: (s) => alive(s, 'mance_rayder') && !plays(s, 'nights_watch', 'free_folk'),
        fire: (s) => {
          const stannis = free(s, 'stannis_baratheon') && !plays(s, 'baratheon_ds');
          return {
            events: [ev('The battle beneath the Wall', stannis
              ? 'A hundred thousand free folk come against the Wall behind their King-beyond-the-Wall, with giants and mammoths. A few hundred brothers hold Castle Black — and then King Stannis Baratheon\'s knights fall on the wildling host from the east. Mance Rayder is taken.'
              : 'A hundred thousand free folk come against the Wall behind their King-beyond-the-Wall, with giants and mammoths. A few hundred brothers hold Castle Black through nights of fire and arrows, and no one comes to help them.', 'nights_watch', 5, 'war', ['nights_watch', 'free_folk', ...(stannis ? ['baratheon_ds'] : [])], 'The free folk assault Castle Black beneath the Wall')],
            changes: [{ op: 'battle', name: 'The battle beneath the Wall', at: 'nights_watch', attacker: 'free_folk', defender: 'nights_watch', victor: stannis ? 'nights_watch' : null }, ...(stannis ? [{ op: 'character', id: 'mance_rayder', status: 'imprisoned', note: 'Taken by King Stannis at the battle beneath the Wall.' }] : [])],
          };
        },
      },
      {
        id: 'lord_commander', at: YM(300, 3), grace: 2, needs: (s) => alive(s, 'jon_snow') && s.characters.jon_snow.house === 'nights_watch' && !alive(s, 'jeor_mormont') && !plays(s, 'nights_watch'),
        fire: () => ({
          events: [ev('The nine hundred and ninety-eighth', 'The black brothers choose their new Lord Commander. After days of votes that go nowhere, a raven flies to the back of the kettle — and the choice falls on Jon Snow, Lord Eddard Stark\'s bastard son.', 'nights_watch', 4, 'court', ['nights_watch'], 'Jon Snow is chosen Lord Commander of the Night\'s Watch')],
          changes: [{ op: 'character', id: 'jon_snow', title: 'Lord Commander of the Night\'s Watch' }, { op: 'house', house: 'nights_watch', lord: 'jon_snow' }],
        }),
      },
    ],
  },
  {
    id: 'dragons', name: 'The blood of the dragon', stages: [
      {
        id: 'wedding', at: YM(298, 9), needs: (s) => alive(s, 'daenerys_targaryen', 'khal_drogo') && !s.characters.daenerys_targaryen.spouse,
        fire: () => ({
          events: [ev('A Dothraki wedding', 'Outside Pentos, Khal Drogo weds Daenerys Targaryen before forty thousand screamers. There are three deaths at the feast, which the Dothraki count a dull wedding. Among her gifts are three dragon eggs, turned to stone by the ages.', 'pentos', 3, 'court', ['targaryen', 'dothraki'], 'Khal Drogo takes Daenerys Targaryen as his bride outside Pentos')],
          changes: [{ op: 'character', id: 'daenerys_targaryen', spouse: 'khal_drogo', title: 'Khaleesi of Drogo\'s khalasar', loc: 'dothraki' }],
        }),
      },
      {
        id: 'golden_crown', at: YM(298, 11), needs: (s) => alive(s, 'viserys_targaryen', 'khal_drogo') && !plays(s, 'targaryen'),
        fire: () => ({
          events: [ev('A crown for a king', 'In Vaes Dothrak, Viserys Targaryen draws a sword in the sacred city and threatens his sister. Khal Drogo gives him the golden crown he demanded: a pot of molten gold, poured over his head. "He was no dragon," says Daenerys. "Fire cannot kill a dragon."', 'dothraki', 4, 'court', ['targaryen', 'dothraki'], 'Khal Drogo pours molten gold over Viserys Targaryen\'s head')],
          changes: [{ op: 'character', id: 'viserys_targaryen', alive: false, cause: 'crowned with molten gold by Khal Drogo' }, { op: 'character', id: 'daenerys_targaryen', title: 'Princess of Dragonstone, Khaleesi' }],
        }),
      },
      {
        id: 'wine_seller', at: YM(298, 12), grace: 1, needs: (s) => alive(s, 'daenerys_targaryen', 'khal_drogo') && !plays(s, 'targaryen', 'dothraki'),
        fire: () => ({
          events: [ev('The wine-seller', 'In the market of Vaes Dothrak a wine-seller presses a cask of Arbor gold on the khaleesi. Ser Jorah Mormont knocks it from her hands: the wine is poisoned, and the man was paid by the Usurper. Khal Drogo swears before his bloodriders to cross the poison water and take the iron chair for his son.', 'dothraki', 4, 'intrigue', ['targaryen', 'dothraki', 'baratheon'], 'Jorah Mormont knocks poisoned wine from Daenerys Targaryen\'s hands')],
          changes: [{ op: 'relation', a: 'dothraki', b: 'baratheon', delta: -40 }],
        }),
      },
      {
        id: 'maegi', at: YM(298, 12), grace: 3, needs: (s) => alive(s, 'khal_drogo', 'daenerys_targaryen') && !plays(s, 'dothraki'),
        fire: () => ({
          events: [ev('The death of a khal', 'Khal Drogo takes a cut in a fight over a Lhazareen town; it festers. The godswife Mirri Maz Duur works blood magic in his tent to save him — and the khal lives, but will never speak or ride again, and the khaleesi\'s son is born dead. The khalasar breaks apart. Drogo dies with a pillow over his face.', 'dothraki', 4, 'court', ['dothraki', 'targaryen'], 'Mirri Maz Duur works blood magic to save the wounded Khal Drogo')],
          changes: [{ op: 'character', id: 'khal_drogo', alive: false, cause: 'a festering wound and a maegi\'s magic' }],
        }),
      },
      {
        id: 'hatching', at: YM(299, 1), needs: (s) => alive(s, 'daenerys_targaryen') && !flag(s, 'dragons_hatched'),
        fire: (s) => ({
          events: [ev('Dragons', 'Rumour runs from the Dothraki sea to the Free Cities, and nobody believes it: a silver-haired queen walked into a funeral pyre and came out unburned, with three living dragons at her breast.', 'dothraki', 5, 'court', ['targaryen'], 'Rumour says Daenerys Targaryen walked unburned from a funeral pyre', 'Nobody believes it, but the tale runs from the Dothraki sea to the Free Cities: a silver-haired queen with three living dragons at her breast.')],
          changes: [...(alive(s, 'khal_drogo') ? [{ op: 'character', id: 'khal_drogo', alive: false, cause: 'a festering wound' }] : []), { op: 'character', id: 'daenerys_targaryen', title: 'Mother of Dragons, the Unburnt', note: 'Hatched three dragons in Drogo\'s pyre.' }],
          flags: { dragons_hatched: true },
        }),
      },
      {
        id: 'red_waste', at: YM(299, 4), grace: 2, needs: (s) => free(s, 'daenerys_targaryen') && flag(s, 'dragons_hatched') && !plays(s, 'targaryen'),
        fire: () => ({ events: [ev('Across the red waste', 'Traders in Pentos hear that the dragon queen led the remnant of her khalasar into the red waste, following the red comet east, and that the dead of thirst lie along her road.', 'dothraki', 2, 'court', ['targaryen'], 'Daenerys Targaryen leads her khalasar into the red waste')] }),
      },
      {
        id: 'qarth', at: YM(299, 9), grace: 3, needs: (s) => free(s, 'daenerys_targaryen') && flag(s, 'dragons_hatched') && !plays(s, 'targaryen'),
        fire: () => ({ events: [ev('Dragons in Qarth', 'Sailors out of the Jade Sea swear they saw three dragons in Qarth, in the arms of a silver-haired girl who begs ships of the merchant princes. The warlocks of the city, they say, wanted her dead.', 'dothraki', 3, 'court', ['targaryen'], 'Sailors swear Daenerys Targaryen keeps three dragons in Qarth')] }),
      },
      {
        id: 'slavers_bay', at: YM(300, 2), grace: 4, needs: (s) => free(s, 'daenerys_targaryen') && flag(s, 'dragons_hatched') && !plays(s, 'targaryen'),
        fire: () => ({
          events: [ev('The Breaker of Chains', 'From Slaver\'s Bay the tale comes to Oldtown and King\'s Landing: the dragon queen bought eight thousand Unsullied in Astapor with a dragon, then loosed the dragon on the slavers and the Unsullied on the city. Yunkai has bent; Meereen has fallen.', 'dothraki', 4, 'court', ['targaryen'], 'Daenerys Targaryen breaks the slavers of Astapor and Yunkai')],
          changes: [{ op: 'character', id: 'daenerys_targaryen', title: 'Queen of Meereen, Mother of Dragons, Breaker of Chains' }],
        }),
      },
    ],
  },
  {
    id: 'ironborn', name: 'The Old Way', stages: [
      {
        id: 'crown', at: YM(299, 4), needs: (s) => alive(s, 'balon_greyjoy') && !plays(s, 'greyjoy') && (s.wars || []).some((w) => w.status !== 'ended' && w.attackers.concat(w.defenders).includes('stark')),
        fire: () => ({
          events: [ev('The King of the Isles and the North', 'With the wolves in the south, Balon Greyjoy crowns himself on Pyke and launches the Iron Fleet at the undefended North. "We do not sow." Ironborn longships are sighted off the Stony Shore.', 'greyjoy', 5, 'war', ['greyjoy', 'stark'], 'Balon Greyjoy launches the Iron Fleet against the North')],
          changes: [{ op: 'character', id: 'balon_greyjoy', title: 'King of the Iron Islands and the North' }, { op: 'war', id: 'ironborn_reaving', name: 'The Ironborn Reaving', attackers: ['greyjoy'], defenders: ['stark'], reason: 'The Old Way' }],
        }),
      },
      {
        // W10: while the Iron Fleet holds the north's attention, Theon takes Winterfell by night
        id: 'winterfell_taken', at: YM(299, 6), grace: 2, needs: (s) => free(s, 'theon_greyjoy') && inWar(s, 'greyjoy', 'stark') && s.holdings.stark?.owner === 'stark' && !plays(s, 'stark', 'greyjoy') && menHolding(s, 'stark', 'greyjoy') <= 700, // (thirty ironmen and a rope take a hall of its few defenders, not one with a host inside: ST15)
        fire: (s) => ({
          events: [ev('Winterfell taken', 'With thirty ironmen and a rope over the walls in the dark, Theon Greyjoy takes Winterfell from its few defenders. Days later two small heads are set above the gates, and Theon says they are Bran and Rickon Stark.', 'stark', 5, 'war', ['greyjoy', 'stark'], 'Theon Greyjoy scales the walls of Winterfell with thirty ironmen')],
          flags: { winterfell_taken: true },
          changes: [{ op: 'holding', id: 'stark', owner: 'greyjoy', note: 'Taken by Theon Greyjoy in the night' }, ...['bran_stark', 'rickon_stark'].filter((id) => alive(s, id) && at(s, id, 'stark')).map((id) => ({ op: 'character', id, status: 'missing', note: 'Gone from Winterfell when the ironborn took it.' }))],
        }),
      },
      {
        id: 'winterfell_burns', at: YM(299, 10), grace: 2, needs: (s) => flag(s, 'winterfell_taken') && free(s, 'ramsay_snow') && !plays(s, 'stark', 'greyjoy', 'bolton'),
        fire: (s) => ({
          events: [ev('Winterfell burns', 'The Bastard of Bolton\'s men, let into Winterfell as friends, fall on everyone within — ironborn and northmen alike. Winterfell is put to the torch; its people are driven out or killed. Of Theon Greyjoy there is no word.', 'stark', 5, 'war', ['greyjoy', 'stark', 'bolton'], 'The Bastard of Bolton\'s men fall on Winterfell and burn it')],
          changes: [{ op: 'holding', id: 'stark', owner: 'bolton', prosperity: 5, unrest: 80, note: 'Sacked and burned by the Bastard of Bolton' }, ...(alive(s, 'theon_greyjoy') ? [{ op: 'character', id: 'theon_greyjoy', status: 'missing', note: 'Lost when Winterfell burned.' }] : []), ...(alive(s, 'rodrik_cassel') ? [{ op: 'character', id: 'rodrik_cassel', alive: false, cause: 'slain before the gates of Winterfell' }] : [])],
        }),
      },
      {
        // W19: the King of the Isles falls from a bridge in a storm; his brother's ship is seen that same day
        id: 'balon_falls', at: YM(299, 11), grace: 2, needs: (s) => alive(s, 'balon_greyjoy') && !plays(s, 'greyjoy'),
        fire: () => ({
          events: [ev('The King of the Isles falls', 'In a storm, King Balon Greyjoy falls from one of the rope bridges of Pyke to the rocks below. The priests of the Drowned God call a kingsmoot at Old Wyk; the same week the Silence, Euron Crow\'s Eye\'s ship, is seen off the isles.', 'greyjoy', 5, 'court', ['greyjoy'], 'King Balon Greyjoy falls from a rope bridge at Pyke')],
          changes: [{ op: 'character', id: 'balon_greyjoy', alive: false, cause: 'a fall from a bridge at Pyke in a storm' }],
          flags: { kingsmoot: true },
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
        events: [ev('A boy king', 'King Robert is dead of a boar\'s tusk. With no Hand to gainsay her, Queen Cersei has Prince Joffrey crowned before the week is out; the realm bends the knee to the boy.', 'baratheon', 5, 'court', ['baratheon', 'lannister'], 'Queen Cersei rushes Prince Joffrey to the throne', 'King Robert is dead of a boar\'s tusk. With no one to gainsay her, the Queen has the boy crowned before the week is out, and the realm bends the knee.')],
        changes: [{ op: 'character', id: 'joffrey_baratheon', title: 'King of the Andals and the First Men' }],
      }),
    }],
  },
  'last_hunt.banners': { pillar: true, names: ['robb_stark'] },
  'last_hunt.brothers': { names: ['renly_baratheon', 'stannis_baratheon'] },
  'crown_justice.baelors_sept': { names: ['eddard_stark', 'joffrey_baratheon'] },
  'king_in_north.crowned': { names: ['robb_stark'] },
  'five_kings.twins': { pillar: true, names: ['walder_frey', 'robb_stark'] },
  'five_kings.whispering_wood': {
    names: ['jaime_lannister', 'robb_stark'],
    alternates: [{
      // the war took the Kingslayer another way: he is already a captive of the northmen or the river lords
      when: (s) => alive(s, 'jaime_lannister') && !free(s, 'jaime_lannister') && inWar(s, 'stark', 'lannister'),
      effects: () => ({ events: [ev('The Kingslayer in chains', 'The river lords bring Ser Jaime Lannister to Riverrun in chains, taken in the fighting in the west. The lion\'s cub is the North\'s to bargain with now.', 'tully', 4, 'war', ['stark', 'tully', 'lannister'], 'The river lords bring Jaime Lannister to Riverrun in chains')] }),
    }],
  },
  'five_kings.shadow': { names: ['renly_baratheon', 'stannis_baratheon', 'melisandre'] },
  'five_kings.blackwater': { names: ['stannis_baratheon', 'tyrion_lannister'] },
  'five_kings.red_wedding': { pillar: true, names: ['walder_frey', 'roose_bolton', 'robb_stark', 'catelyn_stark'] },
  'five_kings.purple_wedding': { names: ['joffrey_baratheon', 'olenna_tyrell'] },
  'the_wall.benjen': { names: ['benjen_stark'] },
  'dragons.wedding': { names: ['daenerys_targaryen', 'khal_drogo', 'viserys_targaryen'] },
  'dragons.golden_crown': { names: ['viserys_targaryen', 'khal_drogo'] },
  'dragons.hatching': { pillar: true, names: ['daenerys_targaryen'] },
  'ironborn.crown': { pillar: true, names: ['balon_greyjoy', 'theon_greyjoy'] },
  // the full set (WP D2)
  'kings_ride.trident': { names: ['arya_stark', 'sansa_stark', 'joffrey_baratheon', 'sandor_clegane'] },
  'kings_ride.hand_at_court': { names: ['eddard_stark', 'petyr_baelish'] },
  'catspaw.littlefingers_lie': { names: ['catelyn_stark', 'petyr_baelish'] },
  'the_imp.streets': { names: ['jaime_lannister', 'eddard_stark', 'jory_cassel'] },
  'the_imp.trial': { names: ['tyrion_lannister', 'bronn', 'vardis_egen', 'lysa_arryn'] },
  'the_imp.berics_ride': { names: ['beric_dondarrion', 'thoros_of_myr'] },
  'the_imp.lions': { pillar: true, names: ['tywin_lannister', 'jaime_lannister', 'edmure_tully'] },
  'last_hunt.joffrey_crowned': { pillar: true, names: ['joffrey_baratheon', 'barristan_selmy', 'tywin_lannister', 'janos_slynt'] },
  'five_kings.rose_lion': { names: ['joffrey_baratheon', 'margaery_tyrell', 'sansa_stark', 'mace_tyrell'] },
  'five_kings.viper': { names: ['oberyn_martell', 'gregor_clegane', 'tyrion_lannister'] },
  'five_kings.tywin_dies': { names: ['tywin_lannister', 'tyrion_lannister'] },
  'young_wolf.green_fork': { names: ['roose_bolton', 'tywin_lannister'] },
  'young_wolf.camps': { trigger: { kind: 'after', beat: 'five_kings.whispering_wood', days: [1, 3] }, names: ['robb_stark', 'edmure_tully'] },
  'young_wolf.westerlands': { pillar: true, names: ['robb_stark', 'jeyne_westerling', 'gawen_westerling', 'walder_frey'] },
  'young_wolf.fords': { names: ['edmure_tully', 'tywin_lannister'] },
  'young_wolf.kingslayer_freed': { names: ['jaime_lannister', 'catelyn_stark', 'brienne_tarth'] },
  'young_wolf.karstark': { names: ['rickard_karstark', 'robb_stark'] },
  'riverrun.hoster': { names: ['hoster_tully'] },
  'omens.autumn': { pillar: true },
  'omens.winter': { pillar: true },
  'the_wall.great_ranging': { names: ['jeor_mormont', 'jon_snow'] },
  'the_wall.fist': { names: ['jeor_mormont'] },
  'the_wall.crasters': { names: ['jeor_mormont', 'craster'] },
  'the_wall.wildlings_attack': { pillar: true, names: ['mance_rayder', 'jon_snow'] },
  'the_wall.lord_commander': { names: ['jon_snow'] },
  'dragons.wine_seller': { names: ['daenerys_targaryen', 'jorah_mormont', 'khal_drogo'] },
  'dragons.maegi': { names: ['khal_drogo', 'daenerys_targaryen'] },
  'dragons.slavers_bay': { names: ['daenerys_targaryen'] },
  'ironborn.winterfell_taken': { names: ['theon_greyjoy', 'bran_stark', 'rickon_stark'] },
  'ironborn.winterfell_burns': { names: ['ramsay_snow', 'theon_greyjoy', 'rodrik_cassel'] },
  'ironborn.balon_falls': { names: ['balon_greyjoy', 'euron_greyjoy'] },
};

// The books' order where two threads touch: the canon-order test (tests/canon.test.js) and the canon playtest
// (scripts/canon.js, Q9) hold the engine to it.
export const BOOK_ORDER = [
  ['kings_ride.arrival', 'kings_ride.the_fall'], ['kings_ride.southward', 'catspaw.assassin'], ['catspaw.assassin', 'the_imp.seized'],
  ['the_imp.seized', 'the_imp.burning'], ['the_imp.burning', 'last_hunt.boar'], ['last_hunt.boar', 'last_hunt.coup'],
  ['last_hunt.coup', 'crown_justice.baelors_sept'], ['last_hunt.banners', 'five_kings.twins'], ['five_kings.twins', 'five_kings.whispering_wood'],
  ['crown_justice.baelors_sept', 'king_in_north.crowned'], ['five_kings.shadow', 'five_kings.blackwater'],
  ['five_kings.blackwater', 'five_kings.red_wedding'], ['five_kings.red_wedding', 'five_kings.purple_wedding'],
  ['dragons.wedding', 'dragons.golden_crown'], ['dragons.golden_crown', 'dragons.hatching'], ['last_hunt.coup', 'ironborn.crown'],
  ['kings_ride.southward', 'kings_ride.trident'], ['catspaw.littlefingers_lie', 'the_imp.seized'], ['the_imp.seized', 'the_imp.streets'],
  ['the_imp.burning', 'the_imp.lions'], ['last_hunt.coup', 'last_hunt.joffrey_crowned'], ['last_hunt.joffrey_crowned', 'crown_justice.baelors_sept'],
  ['five_kings.twins', 'young_wolf.green_fork'], ['five_kings.whispering_wood', 'young_wolf.camps'], ['young_wolf.westerlands', 'five_kings.red_wedding'],
  ['young_wolf.kingslayer_freed', 'young_wolf.karstark'], ['five_kings.blackwater', 'five_kings.rose_lion'], ['five_kings.purple_wedding', 'five_kings.viper'],
  ['five_kings.viper', 'five_kings.tywin_dies'], ['ironborn.crown', 'ironborn.winterfell_taken'], ['ironborn.winterfell_taken', 'ironborn.winterfell_burns'],
  ['the_wall.wights', 'the_wall.great_ranging'], ['the_wall.fist', 'the_wall.crasters'], ['the_wall.crasters', 'the_wall.lord_commander'],
  ['dragons.maegi', 'dragons.hatching'], ['omens.comet', 'omens.autumn'], ['omens.autumn', 'omens.winter'],
];
