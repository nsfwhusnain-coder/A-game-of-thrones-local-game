// The free companies (docs/gdd/07-military.md §10): who they are, what a moon of them costs, and how far their word
// goes. `price` is dragons a man a moon (06 §6.2: two for foot, more for horse); `desertAfter` the moons unpaid a
// company bears before it marches off; `turncoat` whether it goes over to an employer who offers half as much again.
// Only the companies whose house the scenario has are for hire (the Second Sons, the Stormcrows and the Windblown come
// with Essos, WP G).
export const COMPANIES = {
  golden_company: { name: 'the Golden Company', price: 2.5, desertAfter: 1, turncoat: false, home: 'golden_company_camp', motto: 'Beneath the gold, the bitter steel' },
  brave_companions: { name: 'the Brave Companions', price: 3, desertAfter: 1, turncoat: true, home: 'myr', men: 200, composition: 'Sellswords of every land, mounted: the Bloody Mummers' },
};
