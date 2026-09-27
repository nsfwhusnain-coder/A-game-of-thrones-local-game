// Coin has a memory. The Iron Bank is an engine actor with finite books, terms and grudges;
// merchants move along named routes whose receipts depend on ports, war, weather and raiders.
// Models may ask for a loan or describe trade, but never choose a rate, limit or payment.

const clamp = (n, a, b) => Math.max(a, Math.min(b, n));
const distLine = (p, a, b) => {
  const dx = b[0] - a[0], dy = b[1] - a[1], d2 = dx * dx + dy * dy;
  if (!d2) return Math.hypot(p[0] - a[0], p[1] - a[1]);
  const t = clamp(((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / d2, 0, 1);
  return Math.hypot(p[0] - (a[0] + dx * t), p[1] - (a[1] + dy * t));
};
const money = (n) => Math.round(n).toLocaleString('en-GB');

const MERCHANTS = {
  braavosi_wool: { id: 'braavosi_wool', name: 'The Purple Harbour Wool Factors', seat: 'braavos', treasury: 280000 },
  narrow_sea: { id: 'narrow_sea', name: 'The Narrow Sea Company', seat: 'pentos', treasury: 190000 },
  oldtown_spicers: { id: 'oldtown_spicers', name: 'The Guild of Spicers and Chandlers', seat: 'oldtown', treasury: 145000 },
  volantene_wine: { id: 'volantene_wine', name: 'The Old Blood Wine Factors', seat: 'volantis', treasury: 320000 },
};
const ROUTES = {
  braavos_white_harbor: { id: 'braavos_white_harbor', name: 'Purple Harbour wool road', merchant: 'braavosi_wool', from: 'braavos', to: 'manderly', cargo: 'wool, timber and silver', gross: 4200, sea: true },
  pentos_kings_landing: { id: 'pentos_kings_landing', name: 'Narrow Sea crossing', merchant: 'narrow_sea', from: 'pentos', to: 'baratheon', cargo: 'grain, dyes and worked steel', gross: 6100, sea: true },
  oldtown_lannisport: { id: 'oldtown_lannisport', name: 'Sunset coast factors’ road', merchant: 'oldtown_spicers', from: 'hightower', to: 'lannisport', cargo: 'wine, cloth and spices', gross: 3600, sea: true },
  volantis_planky_town: { id: 'volantis_planky_town', name: 'Summer Sea wine road', merchant: 'volantene_wine', from: 'volantis', to: 'planky_town', cargo: 'wine, glass and oranges', gross: 5200, sea: true },
};

export function initFinance(state) {
  state.finance ||= {};
  state.finance.ironBank ||= { id: 'iron_bank', name: 'The Iron Bank of Braavos', treasury: 60000000, loans: {}, memory: {} };
  state.finance.merchants ||= {};
  for (const [id, m] of Object.entries(MERCHANTS)) state.finance.merchants[id] ||= structuredClone(m);
  state.finance.routes ||= {};
  for (const [id, r] of Object.entries(ROUTES)) state.finance.routes[id] ||= structuredClone(r);
  return state.finance;
}

function atWar(state, a, b) {
  if (!a || !b || a === b) return false;
  return (state.wars || []).some((w) => w.status !== 'ended' && ((w.attackers || []).includes(a) && (w.defenders || []).includes(b) || (w.attackers || []).includes(b) && (w.defenders || []).includes(a)));
}

export function routeRisk(state, route) {
  const a = state.holdings[route.from], b = state.holdings[route.to];
  if (!a || !b) return 1;
  let risk = 0.08;
  if (atWar(state, a.owner, b.owner)) risk += 0.42;
  for (const h of [a, b]) {
    if (/besieg|sack|burn|occup/i.test(h.status || '')) risk += 0.25;
    risk += clamp((45 - (h.prosperity ?? 50)) / 180, 0, 0.2);
  }
  if (state.world?.season === 'winter') risk += route.sea ? 0.18 : 0.12;
  else if (state.world?.season === 'autumn') risk += route.sea ? 0.08 : 0.04;
  // Hostile fleets make piracy and blockade physical: they must actually be near the sea lane.
  for (const fleet of Object.values(state.armies || {})) {
    if (fleet.type !== 'fleet' || !(fleet.ships > 0) || (!atWar(state, fleet.owner, a.owner) && !atWar(state, fleet.owner, b.owner))) continue;
    if (distLine(fleet.pos, a.pos, b.pos) < 65) risk += Math.min(0.3, fleet.ships / 180);
  }
  return clamp(risk, 0.03, 0.95);
}

function memories(bank, house) { return bank.memory[house] ||= []; }
function remember(state, house, kind, text) {
  const bank = initFinance(state).ironBank;
  memories(bank, house).push({ turn: state.meta?.turn || 0, date: state.meta?.date ? { ...state.meta.date } : null, kind, text });
  bank.memory[house] = bank.memory[house].slice(-24);
}

export function creditProfile(state, houseId) {
  const bank = initFinance(state).ironBank; const h = state.houses[houseId];
  if (!h) return { score: 0, limit: 0, rate: 0.04, reasons: ['The borrower is unknown.'] };
  const income = Number(h.figures?.income?.v) || 0, debt = Number(h.figures?.debt?.v) || 0;
  const holdings = Object.values(state.holdings || {}).filter((x) => x.owner === houseId);
  const collateral = holdings.reduce((n, x) => n + (x.population || 0) * clamp((x.prosperity ?? 50) / 70, 0.25, 1.4), 0) * 0.08;
  const wars = (state.wars || []).filter((w) => w.status !== 'ended' && [...(w.attackers || []), ...(w.defenders || [])].includes(houseId)).length;
  const mem = memories(bank, houseId); const defaults = mem.filter((x) => x.kind === 'default').length; const kept = mem.filter((x) => x.kind === 'paid').length;
  let score = 55 + Math.min(18, Math.max(-18, income / 900)) + Math.min(12, holdings.length * 1.5) - Math.min(30, debt / Math.max(2000, Math.abs(income) * 12) * 9) - wars * 7 - defaults * 28 + Math.min(8, kept * 2);
  if (h.broken) score -= 35;
  score = clamp(Math.round(score), 0, 100);
  const limit = Math.max(1000, Math.round((Math.max(0, income) * 18 + collateral) * clamp(score / 65, 0.15, 1.5)));
  const rate = Math.round(clamp(0.026 - score * 0.00022 + wars * 0.002, 0.006, 0.035) * 10000) / 10000; // each moon
  const reasons = [];
  if (income <= 0) reasons.push('The house spends more than its lands return.');
  if (wars) reasons.push(`${wars} open war${wars > 1 ? 's' : ''} imperil repayment.`);
  if (debt > limit * 0.6) reasons.push('Existing debts already weigh heavily.');
  if (defaults) reasons.push('The Iron Bank remembers missed promises.');
  if (!reasons.length) reasons.push('Lands, rents and prior conduct make credible security.');
  return { score, limit, rate, reasons, debt, income };
}

export function requestLoan(state, houseId, amount, purpose = '') {
  const bank = initFinance(state).ironBank; const h = state.houses[houseId]; const sum = Math.round(Number(amount) || 0);
  if (!h || sum < 500) return { accepted: false, text: 'The Iron Bank will not open its books for so small or uncertain a sum.' };
  const p = creditProfile(state, houseId); const existing = Object.values(bank.loans).filter((x) => x.house === houseId && x.status === 'active').reduce((n, x) => n + x.principal + (x.accrued || 0), 0);
  if (p.score < 25 || sum + existing > p.limit || sum > bank.treasury * 0.08) {
    const why = p.score < 25 ? p.reasons[0] : `The bank will risk no more than ${money(Math.max(0, p.limit - existing))} dragons on this house.`;
    remember(state, houseId, 'refused', `${money(sum)} refused. ${why}`);
    return { accepted: false, score: p.score, limit: p.limit, text: `The Iron Bank refuses ${money(sum)} dragons. ${why}` };
  }
  const id = `ib_${houseId}_${state.meta?.turn || 0}_${Object.keys(bank.loans).length + 1}`;
  const loan = { id, house: houseId, principal: sum, original: sum, rate: p.rate, termMonths: p.score >= 70 ? 36 : p.score >= 50 ? 24 : 18, accrued: 0, arrears: 0, missed: 0, purpose: String(purpose || '').slice(0, 180), status: 'active', openedTurn: state.meta?.turn || 0 };
  bank.loans[id] = loan; bank.treasury -= sum;
  h.figures.treasury.v = Math.round((Number(h.figures.treasury?.v) || 0) + sum);
  h.figures.debt.v = Math.round((Number(h.figures.debt?.v) || 0) + sum);
  remember(state, houseId, 'lent', `${money(sum)} lent at ${(p.rate * 100).toFixed(2)}% each moon for ${loan.termMonths} moons${purpose ? `: ${purpose}` : ''}.`);
  return { accepted: true, loan, score: p.score, limit: p.limit, text: `The Iron Bank lends ${money(sum)} dragons at ${(p.rate * 100).toFixed(2)}% each moon, to be repaid over ${loan.termMonths} moons.` };
}

export function repayLoan(state, houseId, amount = Infinity) {
  const bank = initFinance(state).ironBank, h = state.houses[houseId];
  const loans = Object.values(bank.loans).filter((x) => x.house === houseId && x.status === 'active').sort((a, b) => b.rate - a.rate || a.openedTurn - b.openedTurn);
  const available = Number(h?.figures?.treasury?.v) || 0; let left = Math.min(available, Number.isFinite(Number(amount)) ? Number(amount) : available), paid = 0, principalPaid = 0;
  for (const loan of loans) {
    const interest = Math.min(left, loan.accrued || 0); loan.accrued -= interest; left -= interest; paid += interest;
    const principal = Math.min(left, loan.principal); loan.principal -= principal; left -= principal; paid += principal; principalPaid += principal;
    if (loan.principal < 1 && loan.accrued < 1) loan.status = 'repaid';
    if (left < 1) break;
  }
  if (paid < 1) return { paid: 0, text: loans.length ? 'The treasury has no coin to send to Braavos.' : 'The Iron Bank holds no open note from this house.' };
  h.figures.treasury.v = Math.round(available - paid); h.figures.debt.v = Math.max(0, Math.round((Number(h.figures.debt?.v) || 0) - principalPaid)); bank.treasury += paid;
  remember(state, houseId, 'paid', `${money(paid)} paid${principalPaid ? `; ${money(principalPaid)} struck from principal` : ''}.`);
  return { paid: Math.round(paid), principalPaid: Math.round(principalPaid), text: `${money(paid)} dragons are remitted to the Iron Bank${principalPaid ? `; ${money(principalPaid)} comes off the principal` : ''}.` };
}

function ledgerLine(state, houseId, kind, label, amount, note = '') {
  const h = state.houses[houseId], L = h?.ledger?.at(-1); if (!h || !(amount > 0)) return;
  L?.lines?.push({ kind, label, amount: Math.round(amount), ...(note ? { note } : {}) });
  if (L) { if (kind === 'income') { L.income += amount; L.net += amount; } else { L.expense += amount; L.net -= amount; } L.treasury = h.figures.treasury.v; }
}

export function financeTick(state, days) {
  const f = initFinance(state), months = Math.max(0, Number(days) || 0) / 30, events = [], applied = [];
  // Caravans and ships pay harbour dues at each end. Their merchant house keeps the venture's remainder.
  for (const route of Object.values(f.routes)) {
    if (route.status === 'closed') continue;
    const risk = routeRisk(state, route); const earned = route.gross * months * (1 - risk);
    const merchant = f.merchants[route.merchant]; if (merchant) merchant.treasury += earned * 0.7;
    const ends = [state.holdings[route.from], state.holdings[route.to]].filter(Boolean);
    for (const h of ends) {
      const house = state.houses[h.owner]; if (!house) continue;
      const toll = earned * 0.15; house.figures.treasury.v = Math.round((Number(house.figures.treasury?.v) || 0) + toll);
      ledgerLine(state, h.owner, 'income', `Dues — ${route.name}`, toll, risk >= 0.55 ? 'war and raiders choke the road' : risk >= 0.3 ? 'dangerous passage' : route.cargo);
    }
    if ((route.lastRisk ?? risk) < 0.55 && risk >= 0.55) events.push({ title: `${route.name} is choked`, text: `Merchants carrying ${route.cargo} turn back or hire swords. Quays stand emptier at both ends of the road.`, details: 'War, siege, winter, or hostile ships now consume more than half the venture before its cargo can be sold.', where: route.to, importance: 2, type: 'economy', houses: ends.map((h) => h.owner) });
    route.lastRisk = risk; route.lastYield = Math.round(earned); route.lastTurn = state.meta?.turn || 0;
  }
  // Notes fall due without waiting for a storyteller. Interest is paid first; principal only falls when coin moves.
  for (const loan of Object.values(f.ironBank.loans)) {
    if (loan.status !== 'active') continue;
    const h = state.houses[loan.house]; if (!h) continue;
    loan.accrued += loan.principal * loan.rate * months;
    const scheduledPrincipal = loan.original / loan.termMonths * months;
    const due = loan.accrued + scheduledPrincipal;
    const treasury = Number(h.figures.treasury?.v) || 0;
    const reserve = Math.max(500, Math.max(0, Number(h.figures.income?.v) || 0) * 0.5);
    const tender = Math.min(due, Math.max(0, treasury - reserve));
    const interestPaid = Math.min(tender, loan.accrued); loan.accrued -= interestPaid;
    const principalPaid = Math.min(Math.max(0, tender - interestPaid), loan.principal); loan.principal -= principalPaid;
    if (tender > 0) {
      h.figures.treasury.v = Math.round(treasury - tender); h.figures.debt.v = Math.max(0, Math.round((Number(h.figures.debt?.v) || 0) - principalPaid)); f.ironBank.treasury += tender;
      ledgerLine(state, loan.house, 'expense', 'Remitted to the Iron Bank', tender, `${money(interestPaid)} interest · ${money(principalPaid)} principal`);
    }
    const missed = Math.max(0, due - tender);
    if (missed > Math.max(20, due * 0.05)) { loan.arrears += missed; loan.missed += months; }
    else { loan.arrears = Math.max(0, loan.arrears - tender * 0.1); loan.missed = Math.max(0, loan.missed - months); }
    if (loan.principal < 1 && loan.accrued < 1) {
      loan.status = 'repaid'; remember(state, loan.house, 'paid', `The note for ${money(loan.original)} is satisfied in full.`);
      events.push({ title: 'A Braavosi note is burned', text: `The last payment reaches the Iron Bank. The note bearing House ${h.name}'s seal is held to a candle and allowed to curl into ash.`, details: 'Braavos keeps an exact memory of debts honoured as well as debts broken.', where: h.seat, importance: loan.house === state.meta.player ? 2 : 1, type: 'economy', houses: [loan.house] });
    } else if (loan.missed >= 3 && !loan.defaultNoted) {
      loan.defaultNoted = true; remember(state, loan.house, 'default', `${money(loan.arrears)} in arrears on the ${money(loan.original)} note.`);
      events.push({ title: `The Iron Bank calls House ${h.name}'s note`, text: `A Braavosi factor lays the dishonoured paper before the house's steward. The sum in arrears is ${money(loan.arrears)} dragons, and the factor does not raise his voice.`, details: 'The Iron Bank has marked the broken promise in its black books. Fresh lending is now unlikely, and enemies of the debtor may find Braavosi doors opening.', where: h.seat, importance: loan.house === state.meta.player ? 4 : 2, type: 'economy', houses: [loan.house] });
      applied.push({ op: 'finance', text: `The Iron Bank records House ${h.name} in default: ${money(loan.arrears)} dragons in arrears` });
    }
  }
  return { events, applied };
}

export function financeView(state, houseId) {
  const f = initFinance(state), bank = f.ironBank;
  const loans = Object.values(bank.loans).filter((x) => x.house === houseId && x.status === 'active');
  const routes = Object.values(f.routes).filter((r) => [state.holdings[r.from]?.owner, state.holdings[r.to]?.owner].includes(houseId)).map((r) => ({ ...r, risk: routeRisk(state, r), merchantName: f.merchants[r.merchant]?.name || r.merchant }));
  return { profile: creditProfile(state, houseId), loans, routes, memory: (bank.memory[houseId] || []).slice(-5) };
}
