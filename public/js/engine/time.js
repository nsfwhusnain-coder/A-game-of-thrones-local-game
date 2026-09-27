// Time in the engine (docs/gdd/03-architecture.md §3.1): a date is { year, month, day } in the Westerosi reckoning of
// twelve moons of thirty days, and every date has an absolute **day number**, the count of days since the start of the
// reckoning. Deadlines, letters in flight, turn records and facts are kept in day numbers; people read dates.

export const MONTHS = ['1st moon', '2nd moon', '3rd moon', '4th moon', '5th moon', '6th moon', '7th moon', '8th moon', '9th moon', '10th moon', '11th moon', '12th moon'];
export const DAYS_IN_MONTH = 30;
export const DAYS_IN_YEAR = 360;

/** Days since the start of the reckoning: for deadlines that run in days, whatever the length of a turn. */
export const dayNumber = (d) => d.year * DAYS_IN_YEAR + (d.month - 1) * DAYS_IN_MONTH + (d.day - 1);
/** The date of a day number. */
export function dateOfDay(n) {
  const year = Math.floor(n / DAYS_IN_YEAR); let rest = n - year * DAYS_IN_YEAR;
  const month = Math.floor(rest / DAYS_IN_MONTH) + 1; rest -= (month - 1) * DAYS_IN_MONTH;
  return { year, month, day: rest + 1 };
}
export const addDays = (d, days) => dateOfDay(dayNumber(d) + days);
/** "12 9th moon, 298 AC" — the compact form the interface has always shown. */
export const dateStr = (d) => `${d.day} ${MONTHS[d.month - 1]}, ${d.year} AC`;
export const ordinal = (n) => { const t = n % 100; return n + (t >= 11 && t <= 13 ? 'th' : ['th', 'st', 'nd', 'rd'][n % 10] || 'th'); };
/** "the 12th day of the 9th moon, 298 AC" — the form every prompt uses (docs/gdd/04-ai-system.md §2.4). */
export const longDate = (d) => `the ${ordinal(d.day)} day of the ${MONTHS[d.month - 1]}, ${d.year} AC`;
/** "from the 3rd to the 9th day of the 9th moon, 298 AC" — a span, said once. */
export function spanText(from, to) {
  if (from.year === to.year && from.month === to.month) return `from the ${ordinal(from.day)} to the ${ordinal(to.day)} day of the ${MONTHS[to.month - 1]}, ${to.year} AC`;
  return `from ${longDate(from).replace(/, \d+ AC$/, from.year === to.year ? '' : `, ${from.year} AC`)} to ${longDate(to)}`;
}

export const SPANS = {
  '1d': { days: 1, label: 'one day' }, '3d': { days: 3, label: 'three days' },
  '1w': { days: 7, label: 'one week' }, '2w': { days: 14, label: 'two weeks' }, '1m': { days: 30, label: 'one moon' },
  '3m': { days: 90, label: 'three moons' }, '6m': { days: 180, label: 'half a year' }, '1y': { days: 360, label: 'one year' },
};
/** A turn's length from its key: the old fixed spans ('1w'), or a turn of n days ('12d'). */
export function spanOf(key) {
  if (SPANS[key]) return SPANS[key];
  const m = /^(\d+)d$/.exec(String(key || '')); if (!m) return SPANS['1m'];
  const n = Math.max(1, Number(m[1])); return { days: n, label: n === 1 ? 'one day' : `${n} days` };
}
