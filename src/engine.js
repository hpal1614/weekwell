// Weekwell money engine.
// Plain functions only: no DOM, no network. Shared by the browser UI, the
// server and the tests. All money is stored and calculated in whole cents.

export const STATE_VERSION = 3;
export const PERIODS = ['weekly', 'fortnightly', 'monthly', 'quarterly', 'annual'];
export const PAY_PERIODS = ['weekly', 'fortnightly', 'monthly'];
export const COMMITMENT_KINDS = ['Invoice', 'Afterpay', 'Bill', 'Friend', 'Other'];
export const POT_DEFAULT_NAMES = { buffer: 'Bills & buffer', emergency: 'Emergency fund', savings: 'Locked savings' };

// ---------- money ----------

export function toCents(dollars) {
  const n = Number(dollars);
  if (!Number.isFinite(n)) return 0;
  return Math.round(n * 100);
}

export function fromCents(cents) {
  return (Number(cents) || 0) / 100;
}

export function formatMoney(cents) {
  const n = Number(cents) || 0;
  const sign = n < 0 ? '-' : '';
  return sign + '$' + (Math.abs(n) / 100).toLocaleString('en-AU', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/** Weekly share of an amount paid every `period`. */
export function perWeek(amountCents, period) {
  const a = Number(amountCents) || 0;
  switch (period) {
    case 'weekly': return a;
    case 'fortnightly': return Math.round(a / 2);
    case 'monthly': return Math.round((a * 12) / 52);
    case 'quarterly': return Math.round((a * 4) / 52);
    case 'annual': return Math.round(a / 52);
    default: return a;
  }
}

// ---------- dates (ISO 'YYYY-MM-DD', local calendar, no time zones) ----------

const ISO_RE = /^\d{4}-\d{2}-\d{2}$/;

export function isISODate(value) {
  if (typeof value !== 'string' || !ISO_RE.test(value)) return false;
  const [y, m, d] = value.split('-').map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  return date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d;
}

function parseISO(iso) {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

function toISO(date) {
  return date.toISOString().slice(0, 10);
}

export function todayISO(now = new Date()) {
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

export function addDays(iso, days) {
  const d = parseISO(iso);
  d.setUTCDate(d.getUTCDate() + days);
  return toISO(d);
}

export function daysBetween(fromISO, toISO_) {
  return Math.round((parseISO(toISO_) - parseISO(fromISO)) / 86400000);
}

export function dayOfWeek(iso) {
  return parseISO(iso).getUTCDay(); // 0 = Sunday
}

/** First day of the week containing `iso`, for weeks starting on `startDay` (0 = Sun … 6 = Sat). */
export function weekStart(iso, startDay = 1) {
  const offset = (dayOfWeek(iso) - startDay + 7) % 7;
  return addDays(iso, -offset);
}

export function weekRange(iso, startDay = 1) {
  const start = weekStart(iso, startDay);
  return { start, end: addDays(start, 6) };
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export function shortDate(iso) {
  const d = parseISO(iso);
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}`;
}

export function longDate(iso) {
  const d = parseISO(iso);
  return `${DAYS[d.getUTCDay()]} ${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

export function weekLabel(range) {
  const s = parseISO(range.start);
  const e = parseISO(range.end);
  if (s.getUTCMonth() === e.getUTCMonth()) return `${s.getUTCDate()}–${e.getUTCDate()} ${MONTHS[e.getUTCMonth()]}`;
  return `${shortDate(range.start)} – ${shortDate(range.end)}`;
}

/** Whole weeks until `dueISO`, at least 1. */
export function weeksUntil(dueISO, today) {
  return Math.max(1, Math.ceil(daysBetween(today, dueISO) / 7));
}

// ---------- plan ----------

/**
 * How much each commitment needs this week.
 * - No due date, or overdue: the full amount is needed now.
 * - Future due date: spread evenly over the weeks left.
 */
export function commitmentNeed(commitment, today) {
  const amount = Number(commitment.amount) || 0;
  if (!commitment.due) return { status: 'now', perWeek: amount, savedSoFar: 0 };
  if (commitment.due < today) return { status: 'overdue', perWeek: amount, savedSoFar: 0 };
  // A fixed weekly amount from the day it was added, so it doesn't creep up every week
  // (the old version re-divided the full amount by the weeks left, which overstated it).
  const from = commitment.addedOn && commitment.addedOn <= today ? commitment.addedOn : today;
  const perWeek_ = Math.round(amount / weeksUntil(commitment.due, from));
  const savedSoFar = Math.min(amount, perWeek_ * Math.floor(daysBetween(from, today) / 7));
  return { status: 'scheduled', perWeek: perWeek_, savedSoFar };
}

export function weeksPerPay(period) {
  return { weekly: 1, fortnightly: 2, monthly: 52 / 12 }[period] || 1;
}

export function weeklyIncome(pay) {
  return perWeek(pay?.amount || 0, pay?.period || 'weekly');
}

/** The weekly plan shown at the top of the app. All values in cents. */
export function weeklyPlan(state, today) {
  const income = weeklyIncome(state.pay);
  const bills = state.bills.reduce((sum, b) => sum + perWeek(b.amount, b.period), 0);
  let commitments = 0;
  let overdue = 0;
  let dueNow = 0;
  for (const c of state.commitments) {
    const need = commitmentNeed(c, today);
    commitments += need.perWeek;
    if (need.status === 'overdue') overdue += need.perWeek;
    if (need.status === 'now') dueNow += need.perWeek;
  }
  const spending = state.budgets.reduce((sum, b) => sum + (Number(b.limit) || 0), 0);
  const perPay = (state.plan?.savingsPerPay || 0) + (state.plan?.emergencyPerPay || 0);
  const saving = Math.round(perPay / weeksPerPay(state.pay?.period));
  const left = income - bills - commitments - spending - saving;
  return { income, bills, commitments, overdue, dueNow, spending, saving, left };
}

// ---------- spending ----------

export function inRange(iso, range) {
  return iso >= range.start && iso <= range.end;
}

/** Spending per budget category for the transactions given. Unknown categories land in `unmatched`. */
export function spentByCategory(transactions, budgets) {
  const byName = new Map(budgets.map((b) => [b.name, 0]));
  let unmatched = 0;
  for (const t of transactions) {
    if (byName.has(t.category)) byName.set(t.category, byName.get(t.category) + t.amount);
    else unmatched += t.amount;
  }
  return { byName, unmatched };
}

/**
 * Week-by-week history for the last `count` weeks ending with the week containing `today`.
 * Returns newest first.
 */
export function weeklyHistory(transactions, budgets, today, startDay = 1, count = 8) {
  const totalLimit = budgets.reduce((s, b) => s + (Number(b.limit) || 0), 0);
  const current = weekStart(today, startDay);
  const weeks = [];
  for (let i = 0; i < count; i++) {
    const start = addDays(current, -7 * i);
    const range = { start, end: addDays(start, 6) };
    const items = transactions.filter((t) => inRange(t.date, range));
    const spent = items.reduce((s, t) => s + t.amount, 0);
    weeks.push({ range, spent, limit: totalLimit, unspent: totalLimit - spent, count: items.length, current: i === 0 });
  }
  return weeks;
}

/**
 * Average weekly spend per category over the last `weeks` complete weeks
 * (the current, unfinished week is left out so it doesn't drag averages down).
 */
export function categoryAverages(transactions, budgets, today, startDay = 1, weeks = 4) {
  const end = addDays(weekStart(today, startDay), -1);
  const start = addDays(weekStart(today, startDay), -7 * weeks);
  const range = { start, end };
  const items = transactions.filter((t) => inRange(t.date, range));
  const totals = new Map();
  for (const t of items) totals.set(t.category, (totals.get(t.category) || 0) + t.amount);
  const names = [...new Set([...budgets.map((b) => b.name), ...totals.keys()])];
  return {
    range,
    rows: names.map((name) => {
      const budget = budgets.find((b) => b.name === name);
      const total = totals.get(name) || 0;
      return { name, icon: budget?.icon || '•', total, average: Math.round(total / weeks), limit: budget ? budget.limit : null };
    }).sort((a, b) => b.total - a.total),
  };
}

// ---------- ids ----------

export function newId(prefix = 'id') {
  const rand = typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID().slice(0, 8) : Math.random().toString(36).slice(2, 10);
  return `${prefix}_${rand}`;
}

// ---------- state shape ----------

export function defaultState() {
  return {
    version: STATE_VERSION,
    pay: { amount: 0, period: 'fortnightly', nextPayday: null },
    weekStartsOn: 1,
    budgets: [
      { id: 'cat_groceries', name: 'Groceries', icon: '🥬', limit: 0 },
      { id: 'cat_transport', name: 'Transport', icon: '🚆', limit: 0 },
      { id: 'cat_meals', name: 'Meals out', icon: '🍜', limit: 0 },
      { id: 'cat_other', name: 'Other', icon: '☀️', limit: 0 },
    ],
    bills: [],
    commitments: [],
    afterpayBalance: 0,
    balances: { everyday: 0, updatedOn: null },
    pots: { buffer: { target: 50000, balance: 0 }, emergency: { target: 200000, balance: 0 }, savings: { balance: 0 } },
    plan: { savingsPerPay: 0, emergencyPerPay: 0 },
    wants: [],
  };
}

const MONTH_INDEX = Object.fromEntries(MONTHS.map((m, i) => [m.toLowerCase(), i]));

/**
 * Old transactions stored a display date such as "Mon 9 Nov" with no year.
 * Pick the most recent such date that is not in the future.
 */
export function parseLegacyDate(text, today) {
  if (isISODate(text)) return text;
  const match = /(\d{1,2})\s+([A-Za-z]{3})/.exec(String(text || ''));
  if (!match) return today;
  const day = Number(match[1]);
  const month = MONTH_INDEX[match[2].toLowerCase()];
  if (month === undefined) return today;
  let year = Number(today.slice(0, 4));
  for (let attempt = 0; attempt < 2; attempt++) {
    const iso = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    if (isISODate(iso) && iso <= today) return iso;
    year -= 1;
  }
  return today;
}

const cents = (v) => toCents(v);

/**
 * Convert the original (version 1, dollars) state into version 2 (cents).
 * Transactions are returned separately because they now live in their own table.
 * Never throws on odd input: anything unrecognised falls back to a safe default.
 */
function legacyToV2(old, today) {
  const src = old && typeof old === 'object' ? old : {};
  const base = defaultState();
  const budgets = Array.isArray(src.budgets) && src.budgets.length
    ? src.budgets.map((b, i) => ({ id: b.id || `cat_${i}_${slug(b.name)}`, name: String(b.name || `Category ${i + 1}`), icon: b.icon || '•', limit: cents(b.limit) }))
    : base.budgets;
  if (!budgets.some((b) => b.name === 'Other')) budgets.push({ id: 'cat_other', name: 'Other', icon: '☀️', limit: 0 });

  const state = {
    version: 2,
    pay: { amount: cents(src.income), period: PAY_PERIODS.includes(src.payPeriod) ? src.payPeriod : 'fortnightly', nextPayday: null },
    weekStartsOn: 1,
    saving: cents(src.saving),
    budgets,
    bills: (Array.isArray(src.bills) ? src.bills : []).map((b) => ({ id: b.id || newId('bill'), name: String(b.name || 'Bill'), icon: b.icon || '↻', amount: cents(b.amount), period: PERIODS.includes(b.period) ? b.period : 'monthly' })),
    commitments: (Array.isArray(src.commitments) ? src.commitments : []).map((c) => ({ id: c.id || newId('com'), name: String(c.name || 'Payment'), amount: cents(c.amount), due: isISODate(c.due) ? c.due : null, kind: typeof c.kind === 'string' && c.kind ? c.kind : 'Invoice' })),
    goals: (Array.isArray(src.goals) ? src.goals : []).map((g) => ({ id: g.id || newId('goal'), name: String(g.name || 'Goal'), amount: cents(g.amount) })),
    afterpayBalance: cents(src.afterpayBalance),
  };

  const transactions = (Array.isArray(src.transactions) ? src.transactions : []).map((t) => ({
    date: parseLegacyDate(t.date, today),
    amount: cents(t.amount),
    // Old app counted "Other" against Meals out; keep the label the person chose.
    category: String(t.category || 'Other'),
    name: String(t.name || 'Spending'),
  })).filter((t) => t.amount > 0);

  return { state, transactions };
}

/**
 * Version 2 -> 3: adds balances, pots, the savings commitment and wants.
 * Old weekly "saving" becomes a per-pay savings commitment; old goals become wants
 * (already decided on, so no cooling-off).
 */
function v2ToV3(v2, today) {
  const base = defaultState();
  const period = PAY_PERIODS.includes(v2.pay?.period) ? v2.pay.period : 'fortnightly';
  return {
    version: STATE_VERSION,
    pay: { amount: v2.pay?.amount || 0, period, nextPayday: isISODate(v2.pay?.nextPayday) ? v2.pay.nextPayday : null },
    weekStartsOn: Number.isInteger(v2.weekStartsOn) ? v2.weekStartsOn : 1,
    budgets: v2.budgets,
    bills: (v2.bills || []).map((b) => ({ ...b, nextDue: isISODate(b.nextDue) ? b.nextDue : null })),
    commitments: (v2.commitments || []).map((c) => ({ ...c, addedOn: isISODate(c.addedOn) ? c.addedOn : today })),
    afterpayBalance: v2.afterpayBalance || 0,
    balances: base.balances,
    pots: base.pots,
    plan: { savingsPerPay: Math.round((v2.saving || 0) * weeksPerPay(period)), emergencyPerPay: 0 },
    wants: (v2.goals || []).filter((g) => g.amount > 0).map((g) => ({ id: g.id || newId('want'), name: g.name, price: g.amount, saved: 0, addedOn: today, coolUntil: today })),
  };
}

/**
 * Bring any stored state (version 1, 2 or 3) up to the current version.
 * Transactions found inside version 1 data are returned separately.
 */
export function upgradeState(payload, today) {
  if (payload && payload.version === STATE_VERSION) return { state: payload, transactions: [] };
  if (payload && payload.version === 2) return { state: v2ToV3(payload, today), transactions: [] };
  const { state, transactions } = legacyToV2(payload, today);
  return { state: v2ToV3(state, today), transactions };
}

function slug(text) {
  return String(text || 'x').toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '') || 'x';
}

export function isLegacyState(state) {
  return !state || typeof state !== 'object' || state.version !== STATE_VERSION;
}

// ---------- validation ----------

const isCents = (v) => Number.isSafeInteger(v);
const isText = (v) => typeof v === 'string' && v.length <= 200;

/** Returns a list of problems; empty means the state is valid. */
export function validateState(state) {
  const errors = [];
  if (!state || typeof state !== 'object' || Array.isArray(state)) return ['state must be an object'];
  if (state.version !== STATE_VERSION) errors.push(`version must be ${STATE_VERSION}`);
  if (!state.pay || !isCents(state.pay.amount) || state.pay.amount < 0) errors.push('pay.amount must be whole cents ≥ 0');
  if (state.pay && !PAY_PERIODS.includes(state.pay.period)) errors.push('pay.period is invalid');
  if (state.pay && state.pay.nextPayday != null && !isISODate(state.pay.nextPayday)) errors.push('pay.nextPayday must be a date');
  if (!Number.isInteger(state.weekStartsOn) || state.weekStartsOn < 0 || state.weekStartsOn > 6) errors.push('weekStartsOn must be 0–6');
  if (!isCents(state.afterpayBalance) || state.afterpayBalance < 0) errors.push('afterpayBalance must be whole cents ≥ 0');
  for (const key of ['budgets', 'bills', 'commitments', 'wants']) if (!Array.isArray(state[key])) errors.push(`${key} must be a list`);
  const b = state.balances;
  if (!b || !isCents(b.everyday) || (b.updatedOn != null && !isISODate(b.updatedOn))) errors.push('balances are invalid');
  const p = state.pots;
  const potOk = (pot, withTarget) => pot && isCents(pot.balance) && pot.balance >= 0 && (!withTarget || (isCents(pot.target) && pot.target >= 0));
  if (!p || !potOk(p.buffer, true) || !potOk(p.emergency, true) || !potOk(p.savings, false)) errors.push('pots are invalid');
  else for (const key of ['buffer', 'emergency', 'savings']) if (p[key].name != null && (typeof p[key].name !== 'string' || p[key].name.length > 40)) errors.push(`pots.${key}.name must be text up to 40 characters`);
  const pl = state.plan;
  if (!pl || !isCents(pl.savingsPerPay) || pl.savingsPerPay < 0 || !isCents(pl.emergencyPerPay) || pl.emergencyPerPay < 0) errors.push('plan amounts must be whole cents ≥ 0');
  if (errors.length) return errors;

  const names = new Set();
  state.budgets.forEach((b, i) => {
    if (!isText(b.id) || !isText(b.name) || !b.name.trim()) errors.push(`budgets[${i}] needs an id and name`);
    if (!isCents(b.limit) || b.limit < 0) errors.push(`budgets[${i}].limit must be whole cents ≥ 0`);
    if (names.has(b.name)) errors.push(`budget name "${b.name}" is used twice`);
    names.add(b.name);
  });
  state.bills.forEach((b, i) => {
    if (!isText(b.id) || !isText(b.name)) errors.push(`bills[${i}] needs an id and name`);
    if (!isCents(b.amount) || b.amount < 0) errors.push(`bills[${i}].amount must be whole cents ≥ 0`);
    if (!PERIODS.includes(b.period)) errors.push(`bills[${i}].period is invalid`);
    if (b.nextDue != null && !isISODate(b.nextDue)) errors.push(`bills[${i}].nextDue must be a date`);
  });
  state.commitments.forEach((c, i) => {
    if (!isText(c.id) || !isText(c.name)) errors.push(`commitments[${i}] needs an id and name`);
    if (!isCents(c.amount) || c.amount < 0) errors.push(`commitments[${i}].amount must be whole cents ≥ 0`);
    if (c.due != null && !isISODate(c.due)) errors.push(`commitments[${i}].due must be a date`);
    if (!isText(c.kind)) errors.push(`commitments[${i}].kind is invalid`);
    if (c.addedOn != null && !isISODate(c.addedOn)) errors.push(`commitments[${i}].addedOn must be a date`);
  });
  if (state.incoming != null && !Array.isArray(state.incoming)) errors.push('incoming must be a list');
  (state.incoming || []).forEach((m, i) => {
    if (!isText(m.id) || !isText(m.name) || !m.name.trim()) errors.push(`incoming[${i}] needs an id and name`);
    if (!isCents(m.amount) || m.amount <= 0) errors.push(`incoming[${i}].amount must be whole cents > 0`);
    if (m.expectedOn != null && !isISODate(m.expectedOn)) errors.push(`incoming[${i}].expectedOn must be a date`);
  });
  state.wants.forEach((w, i) => {
    if (!isText(w.id) || !isText(w.name)) errors.push(`wants[${i}] needs an id and name`);
    if (!isCents(w.price) || w.price <= 0) errors.push(`wants[${i}].price must be whole cents > 0`);
    if (!isCents(w.saved) || w.saved < 0) errors.push(`wants[${i}].saved must be whole cents ≥ 0`);
    if (!isISODate(w.addedOn) || !isISODate(w.coolUntil)) errors.push(`wants[${i}] needs addedOn and coolUntil dates`);
  });
  return errors;
}

export function validateTransaction(t) {
  const errors = [];
  if (!t || typeof t !== 'object') return ['transaction must be an object'];
  if (!isISODate(t.date)) errors.push('date must be YYYY-MM-DD');
  if (!isCents(t.amount) || t.amount <= 0) errors.push('amount must be whole cents > 0');
  if (!isText(t.category) || !t.category.trim()) errors.push('category is required');
  if (!isText(t.name) || !t.name.trim()) errors.push('name is required');
  return errors;
}

/** Validate a backup file produced by /api/export. */
export function validateBackup(backup) {
  if (!backup || typeof backup !== 'object') return ['backup must be an object'];
  if (backup.app !== 'weekwell') return ['this is not a Weekwell backup file'];
  const errors = validateState(backup.state).map((e) => `state: ${e}`);
  if (!Array.isArray(backup.transactions)) errors.push('transactions must be a list');
  else backup.transactions.forEach((t, i) => validateTransaction(t).forEach((e) => errors.push(`transactions[${i}]: ${e}`)));
  return errors;
}
