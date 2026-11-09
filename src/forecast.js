// Weekwell forecast: looks ahead day by day at every known money movement and works out
// what is provably spare. Plain functions, all money in cents, dates as 'YYYY-MM-DD'.
//
// The model:
//   cash = money you can spend or pay bills from today
//        = Everyday (CommBank + Up Spending) + the Bills & buffer Saver.
//   Each day: + pay on paydays, − bills and commitments on their due dates,
//             − everyday spending (weekly estimate spread over 7 days),
//             − the amount moved to savings/emergency/wants pots on each payday.
//   "Safe to save per pay" is the largest steady amount moved out every payday
//   that never lets cash fall below the buffer target over the next year.

import { addDays, categoryAverages, daysBetween, isISODate, perWeek, weeksPerPay } from './engine.js';

export const HORIZON_DAYS = 365;

// ---------- dates ----------

/** Add months, keeping the anchor's day of month where possible (31 Jan + 1 month = 28/29 Feb). */
export function addMonths(iso, months) {
  const [y, m, d] = iso.split('-').map(Number);
  const total = m - 1 + months;
  const year = y + Math.floor(total / 12);
  const month = ((total % 12) + 12) % 12;
  const lastDay = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  return `${year}-${String(month + 1).padStart(2, '0')}-${String(Math.min(d, lastDay)).padStart(2, '0')}`;
}

function step(anchor, period, k) {
  switch (period) {
    case 'weekly': return addDays(anchor, 7 * k);
    case 'fortnightly': return addDays(anchor, 14 * k);
    case 'monthly': return addMonths(anchor, k);
    case 'quarterly': return addMonths(anchor, 3 * k);
    case 'annual': return addMonths(anchor, 12 * k);
    default: return addDays(anchor, 7 * k);
  }
}

/**
 * Every date from `anchor` repeating by `period`, between `from` and `to` inclusive.
 * An anchor in the past is rolled forward (recurring bills are assumed paid on time).
 */
export function occurrences(anchor, period, from, to) {
  const dates = [];
  let k = 0;
  // Skip past occurrences quickly.
  while (step(anchor, period, k) < from && k < 10000) k++;
  for (let date = step(anchor, period, k); date <= to; date = step(anchor, period, ++k)) dates.push(date);
  return dates;
}

export function nextPayday(pay, today) {
  if (!pay?.nextPayday || !isISODate(pay.nextPayday)) return null;
  return occurrences(pay.nextPayday, pay.period, today, addDays(today, 400))[0] || null;
}

// ---------- inputs ----------

/**
 * Weekly everyday-spending estimate: your limits, or what you actually spent on average
 * over the last 4 full weeks if that's higher. Planning on the higher number is what
 * stops the forecast being too optimistic.
 */
export function spendingEstimate(state, transactions, today) {
  const limits = state.budgets.reduce((s, b) => s + (b.limit || 0), 0);
  const avg = categoryAverages(transactions, state.budgets, today, state.weekStartsOn, 4);
  const actual = avg.rows.reduce((s, r) => s + r.average, 0);
  return { weekly: Math.max(limits, actual), limits, actual, usingActual: actual > limits };
}

export function startingCash(state) {
  return (state.balances?.everyday || 0) + (state.pots?.buffer?.balance || 0);
}

/**
 * Build the day-by-day cash flow (without savings transfers).
 * Returns { days: [{ date, net, payday, events: [{ name, amount }] }], paydays: [dates] }.
 */
export function buildCashflow(state, today, weeklySpending, extraToday = 0) {
  const end = addDays(today, HORIZON_DAYS - 1);
  const days = [];
  const index = new Map();
  for (let i = 0; i < HORIZON_DAYS; i++) {
    const date = addDays(today, i);
    // Spread weekly spending over 7 days without losing cents.
    const spend = Math.floor(((i % 7) + 1) * weeklySpending / 7) - Math.floor((i % 7) * weeklySpending / 7);
    const day = { date, net: -spend, payday: false, events: [] };
    days.push(day);
    index.set(date, day);
  }
  const add = (date, amount, name, kind) => {
    const day = index.get(date < today ? today : date);
    if (!day) return;
    day.net += amount;
    day.events.push({ name, amount, kind });
  };

  const paydays = state.pay?.amount > 0 && nextPayday(state.pay, today)
    ? occurrences(nextPayday(state.pay, today), state.pay.period, today, end) : [];
  for (const date of paydays) { add(date, state.pay.amount, 'Pay', 'pay'); index.get(date).payday = true; }

  for (const bill of state.bills) {
    if (bill.nextDue && isISODate(bill.nextDue)) {
      for (const date of occurrences(bill.nextDue, bill.period, today, end)) add(date, -bill.amount, bill.name, 'bill');
    } else {
      // No due date yet: assume it comes out evenly, a weekly share every 7 days from today.
      const weekly = perWeek(bill.amount, bill.period);
      for (let i = 6; i < HORIZON_DAYS; i += 7) add(addDays(today, i), -weekly, `${bill.name} (weekly share)`, 'bill-estimate');
    }
  }
  for (const c of state.commitments) add(c.due && c.due >= today ? c.due : today, -c.amount, c.name, c.kind === 'Afterpay' ? 'afterpay' : 'commitment');
  if (extraToday) add(today, -extraToday, 'Purchase being checked', 'purchase');
  return { days, paydays };
}

/** Run the cash flow with `perPay` moved out on every payday. */
export function simulate(flow, startCash, perPay) {
  let cash = startCash;
  let min = Infinity;
  let minDate = null;
  const series = [];
  for (const day of flow.days) {
    cash += day.net;
    if (day.payday) cash -= perPay;
    series.push(cash);
    if (cash < min) { min = cash; minDate = day.date; }
  }
  return { min, minDate, series };
}

/** Largest steady amount per pay (whole dollars) keeping cash ≥ buffer every day. */
export function maxSafePerPay(flow, startCash, buffer, payAmount) {
  if (!flow.paydays.length) return 0;
  if (simulate(flow, startCash, 0).min < buffer) return 0;
  let lo = 0;
  let hi = Math.floor(payAmount / 100);
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2);
    if (simulate(flow, startCash, mid * 100).min >= buffer) lo = mid; else hi = mid - 1;
  }
  return lo * 100;
}

// ---------- the main answer ----------

/**
 * Everything the forecast panel needs.
 * status: 'needs-pay' | 'needs-payday' | 'needs-balances' | 'ok' | 'short'
 */
export function forecast(state, transactions, today, { extraToday = 0 } = {}) {
  const missing = !state.pay?.amount ? 'needs-pay' : !nextPayday(state.pay, today) ? 'needs-payday' : !state.balances?.updatedOn ? 'needs-balances' : null;
  const spending = spendingEstimate(state, transactions, today);
  if (missing) return { status: missing, spending };

  const buffer = state.pots.buffer.target;
  const cash = startingCash(state);
  const flow = buildCashflow(state, today, spending.weekly, extraToday);
  const perPay = maxSafePerPay(flow, cash, buffer, state.pay.amount);
  const withPlan = simulate(flow, cash, perPay);
  const withNothing = simulate(flow, cash, 0);
  const short = withNothing.min < buffer;
  const nextPay = flow.paydays[0];
  const staleDays = daysBetween(state.balances.updatedOn, today);

  const upcoming = flow.days
    .filter((d) => d.date <= addDays(today, 55))
    .flatMap((d) => d.events.filter((e) => e.amount < 0 && e.kind !== 'bill-estimate').map((e) => ({ date: d.date, ...e })))
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.amount - b.amount));

  return {
    status: short ? 'short' : 'ok',
    perPay,
    buffer,
    cash,
    nextPay,
    paydays: flow.paydays,
    min: withPlan.min,
    minDate: withPlan.minDate,
    shortfall: short ? buffer - withNothing.min : 0,
    shortDate: short ? withNothing.minDate : null,
    series: flow.days.map((d, i) => ({ date: d.date, balance: withPlan.series[i], events: d.events })),
    upcoming,
    spending,
    staleDays,
    flow,
  };
}

// ---------- pots and the split ----------

export const DEFAULT_SPLIT = { building: { savings: 40, emergency: 40, wants: 20 }, full: { savings: 70, wants: 30 } };

export function emergencyFull(state) {
  return state.pots.emergency.balance >= state.pots.emergency.target;
}

/** Suggested per-pay amounts for the safe-to-save total, rounded down to whole dollars. */
export function suggestSplit(state, perPay) {
  const dollars = (pct) => Math.floor((perPay * pct) / 100 / 100) * 100;
  if (emergencyFull(state)) {
    const savings = dollars(DEFAULT_SPLIT.full.savings);
    return { savings, emergency: 0, wants: perPay - savings };
  }
  const savings = dollars(DEFAULT_SPLIT.building.savings);
  const gap = state.pots.emergency.target - state.pots.emergency.balance;
  const emergency = Math.min(dollars(DEFAULT_SPLIT.building.emergency), gap);
  return { savings, emergency, wants: perPay - savings - emergency };
}

/**
 * What actually goes where each pay, given your commitments.
 * Savings and emergency are protected; wants get whatever is left.
 */
export function allocation(state, perPay) {
  const savings = state.plan.savingsPerPay;
  const gap = Math.max(0, state.pots.emergency.target - state.pots.emergency.balance);
  const emergency = Math.min(state.plan.emergencyPerPay, gap);
  const protectedAmount = savings + emergency;
  return {
    savings,
    emergency,
    wants: Math.max(0, perPay - protectedAmount),
    overBy: Math.max(0, protectedAmount - perPay),
    committed: protectedAmount > 0,
  };
}

// ---------- wants ----------

/** Cooling-off: 1 day under $100, 7 days up to $500, 30 days above. */
export function coolingDays(priceCents) {
  if (priceCents < 10000) return 1;
  if (priceCents <= 50000) return 7;
  return 30;
}

/**
 * When each want will be fully saved, funding them one at a time in list order
 * with `wantsPerPay` from each payday. Returns Map(id -> date | null).
 */
export function wantsTimeline(wants, paydays, wantsPerPay) {
  const result = new Map();
  const queue = wants.map((w) => ({ id: w.id, need: Math.max(0, w.price - w.saved) }));
  for (const item of queue) if (item.need === 0) result.set(item.id, 'now');
  let i = 0;
  for (const date of wantsPerPay > 0 ? paydays : []) {
    let money = wantsPerPay;
    while (money > 0 && i < queue.length) {
      const item = queue[i];
      if (item.need === 0) { i++; continue; }
      const used = Math.min(money, item.need);
      item.need -= used;
      money -= used;
      if (item.need === 0) { result.set(item.id, date); i++; }
    }
    if (i >= queue.length) break;
  }
  for (const item of queue) if (!result.has(item.id)) result.set(item.id, null);
  return result;
}

/**
 * "Can I buy it now?"
 * Yes only if the money is already in its pot, or if paying the rest today still leaves
 * enough spare every pay to keep your savings and emergency amounts unchanged.
 */
export function canBuyNow(state, transactions, today, want) {
  if (want.coolUntil > today) return { answer: 'cooling', until: want.coolUntil };
  const need = Math.max(0, want.price - want.saved);
  if (need === 0) return { answer: 'yes-saved' };
  const base = forecast(state, transactions, today);
  if (base.status !== 'ok' && base.status !== 'short') return { answer: 'setup', status: base.status };
  const after = forecast(state, transactions, today, { extraToday: need });
  const committed = allocation(state, base.perPay);
  const protectedAmount = committed.committed ? committed.savings + committed.emergency : suggestSplit(state, base.perPay).savings + suggestSplit(state, base.perPay).emergency;
  const result = { need, perPayBefore: base.perPay, perPayAfter: after.perPay, protectedAmount };
  if (after.status === 'ok' && after.perPay >= protectedAmount) return { answer: 'yes', ...result };

  // Not yet: when will it be saved, and how much sooner with $20/week less spending?
  const wantsPerPay = Math.max(0, base.perPay - protectedAmount);
  const order = state.wants.filter((w) => w.id === want.id || state.wants.indexOf(w) < state.wants.indexOf(want));
  const readyOn = wantsTimeline(order, base.paydays, wantsPerPay).get(want.id);
  const extra = Math.round(2000 * weeksPerPay(state.pay.period));
  const fasterOn = wantsTimeline(order, base.paydays, wantsPerPay + extra).get(want.id);
  return { answer: 'not-yet', ...result, readyOn, fasterOn, wantsPerPay };
}
