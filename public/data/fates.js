// Canon fates (docs/gdd/08-characters-politics.md §5): who the story keeps alive, and until when. Under Canon gravity a
// character whose canon death is still to come cannot die of random causes or in a battle before it — they are taken or
// wounded instead; when the window has passed without the beat (the world has diverged), the protection ends. Under
// Loose gravity only the pillars of the story are kept; under Sandbox, no one. Dates are [year, moon] — the window's
// first moon, and the last moon it may still come in.
export const CANON_DEATHS = {
  robert_baratheon: { from: [298, 10], to: [298, 12], cause: 'the boar', pillar: true },
  viserys_targaryen: { from: [298, 9], to: [298, 12], cause: 'the golden crown' },
  eddard_stark: { from: [299, 1], to: [299, 3], cause: "Baelor's Sept", pillar: true },
  khal_drogo: { from: [299, 1], to: [299, 4], cause: 'a festering wound' },
  renly_baratheon: { from: [299, 5], to: [299, 8], cause: 'a shadow', pillar: true },
  cortnay_penrose: { from: [299, 5], to: [299, 9], cause: 'a second shadow' },
  hoster_tully: { from: [299, 5], to: [299, 9], cause: 'old age and illness' },
  balon_greyjoy: { from: [299, 9], to: [299, 12], cause: 'a fall at Pyke' },
  jeor_mormont: { from: [299, 9], to: [299, 12], cause: "the mutiny at Craster's Keep" },
  rickard_karstark: { from: [299, 9], to: [299, 12], cause: "his king's justice" },
  robb_stark: { from: [299, 10], to: [300, 1], cause: 'the Red Wedding', pillar: true },
  catelyn_stark: { from: [299, 10], to: [300, 1], cause: 'the Red Wedding', pillar: true },
  joffrey_baratheon: { from: [300, 1], to: [300, 4], cause: 'poison at his wedding', pillar: true },
  tywin_lannister: { from: [300, 1], to: [300, 5], cause: "his son's crossbow", pillar: true },
  lysa_arryn: { from: [300, 1], to: [300, 8], cause: 'the Moon Door' },
  oberyn_martell: { from: [300, 2], to: [300, 5], cause: 'the Mountain, in a trial by combat' },
};
// the children the story carries through 300 AC — and the Imp, and the Kingslayer, whose capture in the Whispering Wood
// is one of its beats: never of *random* causes (a battle they were merely present at), though the player's own orders
// have teeth
export const CANON_PROTECTED = ['jaime_lannister', 'gregor_clegane', 'sansa_stark', 'arya_stark', 'bran_stark', 'rickon_stark', 'jon_snow', 'tyrion_lannister', 'daenerys_targaryen', 'tommen_baratheon', 'myrcella_baratheon'];
