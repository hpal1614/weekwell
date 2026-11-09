import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  categoryAverages, commitmentNeed, defaultState, formatMoney, parseLegacyDate, upgradeState,
  perWeek, spentByCategory, toCents, validateBackup, validateState, validateTransaction, weekStart,
  weeklyHistory, weeklyPlan, weeksUntil,
} from '../src/engine.js';

const TODAY = '2026-11-09'; // a Monday

test('money is converted to whole cents without float drift', () => {
  assert.equal(toCents(0.1 + 0.2), 30);
  assert.equal(toCents('19.99'), 1999);
  assert.equal(toCents('abc'), 0);
  assert.equal(formatMoney(123456), '$1,234.56');
  assert.equal(formatMoney(-500), '-$5.00');
});

test('per-week amounts for each frequency', () => {
  assert.equal(perWeek(5200, 'weekly'), 5200);
  assert.equal(perWeek(5200, 'fortnightly'), 2600);
  assert.equal(perWeek(5200, 'monthly'), 1200);
  assert.equal(perWeek(5200, 'quarterly'), 400);
  assert.equal(perWeek(5200, 'annual'), 100);
});

test('weeks start on the chosen day', () => {
  assert.equal(weekStart('2026-11-09', 1), '2026-11-09'); // Monday
  assert.equal(weekStart('2026-11-15', 1), '2026-11-09'); // Sunday belongs to the week before
  assert.equal(weekStart('2026-11-09', 4), '2026-11-05'); // Thursday paydays
  assert.equal(weekStart('2027-01-01', 1), '2026-12-28'); // across a year boundary
});

test('BUG FIX: overdue commitments stay in the plan at the full amount', () => {
  const overdue = commitmentNeed({ amount: 30000, due: '2026-11-01' }, TODAY);
  assert.deepEqual(overdue, { status: 'overdue', perWeek: 30000, savedSoFar: 0 });
  const undated = commitmentNeed({ amount: 5000, due: null }, TODAY);
  assert.deepEqual(undated, { status: 'now', perWeek: 5000, savedSoFar: 0 });
  const future = commitmentNeed({ amount: 70000, due: '2026-12-21' }, TODAY); // 6 weeks away
  assert.equal(weeksUntil('2026-12-21', TODAY), 6);
  assert.equal(future.perWeek, Math.round(70000 / 6));
});

test('BUG FIX: the weekly set-aside for a dated payment stays the same each week', () => {
  // $700 due 21 Dec, added 6 weeks earlier on 9 Nov.
  const c = { amount: 70000, due: '2026-12-21', addedOn: '2026-11-09' };
  const weekly = [0, 7, 14, 21, 28, 35].map((d) => {
    const day = new Date(Date.UTC(2026, 10, 9 + d)).toISOString().slice(0, 10);
    return commitmentNeed(c, day);
  });
  assert.deepEqual(weekly.map((w) => w.perWeek), [11667, 11667, 11667, 11667, 11667, 11667]);
  assert.deepEqual(weekly.map((w) => w.savedSoFar), [0, 11667, 23334, 35001, 46668, 58335]);
});

test('weekly plan: an overdue bill reduces what is left, it does not increase it', () => {
  const state = { ...defaultState(), pay: { amount: 200000, period: 'fortnightly', nextPayday: null } };
  const before = weeklyPlan(state, TODAY);
  state.commitments = [{ id: 'c', name: 'Invoice', amount: 30000, due: '2026-11-01', kind: 'Invoice' }];
  const after = weeklyPlan(state, TODAY);
  assert.equal(before.left, 100000);
  assert.equal(after.left, 70000);
  assert.equal(after.overdue, 30000);
});

test('BUG FIX: "Other" spending is counted as Other, not Meals out', () => {
  const budgets = defaultState().budgets;
  const { byName, unmatched } = spentByCategory([
    { date: TODAY, amount: 1000, category: 'Other' },
    { date: TODAY, amount: 500, category: 'Meals out' },
    { date: TODAY, amount: 200, category: 'Deleted category' },
  ], budgets);
  assert.equal(byName.get('Other'), 1000);
  assert.equal(byName.get('Meals out'), 500);
  assert.equal(unmatched, 200);
});

test('legacy display dates become real dates, never in the future', () => {
  assert.equal(parseLegacyDate('Mon 9 Nov', TODAY), '2026-11-09');
  assert.equal(parseLegacyDate('Sat, 7 Nov', TODAY), '2026-11-07');
  assert.equal(parseLegacyDate('Wed 30 Dec', TODAY), '2025-12-30'); // Dec 2026 is future, so last year
  assert.equal(parseLegacyDate('rubbish', TODAY), TODAY);
  assert.equal(parseLegacyDate('2026-10-01', TODAY), '2026-10-01');
});

test('upgrading the original data keeps every number, converted to cents', () => {
  const legacy = {
    income: 2150.5, payPeriod: 'fortnightly', saving: 100,
    budgets: [{ name: 'Groceries', icon: '🥬', limit: 120, spent: 45.5 }, { name: 'Transport', icon: '🚆', limit: 40, spent: 0 }, { name: 'Meals out', icon: '🍜', limit: 50, spent: 12 }],
    bills: [{ name: 'Phone', amount: 35, period: 'monthly', icon: '↻' }],
    commitments: [{ name: 'Water', amount: 180.25, kind: 'Water' }, { name: 'Afterpay shoes', amount: 37.5, due: '2026-11-20', kind: 'Afterpay' }],
    goals: [{ name: 'Rego', amount: 850 }],
    afterpayBalance: 150,
    transactions: [{ name: 'Market', amount: 45.5, category: 'Groceries', icon: '🥬', date: 'Mon 9 Nov' }, { name: 'Gift', amount: 12, category: 'Other', icon: '☀️', date: 'Sun 8 Nov' }],
    week: 3,
  };
  const { state, transactions } = upgradeState(legacy, TODAY);
  assert.deepEqual(validateState(state), []);
  assert.equal(state.version, 3);
  assert.equal(state.pay.amount, 215050);
  assert.equal(state.plan.savingsPerPay, 20000); // $100/week saving -> $200 per fortnightly pay
  assert.deepEqual(state.budgets.map((b) => [b.name, b.limit]), [['Groceries', 12000], ['Transport', 4000], ['Meals out', 5000], ['Other', 0]]);
  assert.equal(state.bills[0].amount, 3500);
  assert.equal(state.commitments[0].amount, 18025);
  assert.equal(state.commitments[0].due, null);
  assert.equal(state.commitments[0].kind, 'Water');
  assert.equal(state.commitments[1].due, '2026-11-20');
  assert.equal(state.commitments[1].addedOn, TODAY);
  assert.deepEqual(state.wants.map((w) => [w.name, w.price, w.saved, w.coolUntil]), [['Rego', 85000, 0, TODAY]]);
  assert.equal(state.afterpayBalance, 15000);
  assert.deepEqual(transactions, [
    { date: '2026-11-09', amount: 4550, category: 'Groceries', name: 'Market' },
    { date: '2026-11-08', amount: 1200, category: 'Other', name: 'Gift' },
  ]);
  assert.equal('week' in state, false);
  assert.equal('saving' in state, false);
});

test('a version 2 state (from the previous update) upgrades to version 3', () => {
  const v2 = { version: 2, pay: { amount: 200000, period: 'fortnightly', nextPayday: '2026-11-13' }, weekStartsOn: 4, saving: 5000,
    budgets: defaultState().budgets, bills: [{ id: 'b', name: 'Rent', icon: '⌂', amount: 45000, period: 'weekly' }],
    commitments: [{ id: 'c', name: 'Invoice', amount: 1000, due: null, kind: 'Invoice' }], goals: [{ id: 'g', name: 'DDJ', amount: 100000 }, { id: 'z', name: 'Empty', amount: 0 }], afterpayBalance: 0 };
  const { state, transactions } = upgradeState(v2, TODAY);
  assert.deepEqual(validateState(state), []);
  assert.deepEqual(transactions, []);
  assert.equal(state.weekStartsOn, 4);
  assert.equal(state.pay.nextPayday, '2026-11-13');
  assert.equal(state.bills[0].nextDue, null);
  assert.deepEqual(state.wants.map((w) => w.name), ['DDJ']);
  assert.equal(upgradeState(state, TODAY).state, state); // already current: untouched
});

test('upgrading odd or empty data never throws', () => {
  for (const input of [null, {}, { budgets: 'x', bills: null }, { income: 'abc' }]) {
    const { state } = upgradeState(input, TODAY);
    assert.deepEqual(validateState(state), []);
  }
});

test('validation rejects dollars-with-decimals and bad shapes', () => {
  const s = defaultState();
  assert.deepEqual(validateState(s), []);
  assert.notDeepEqual(validateState({ ...s, plan: { savingsPerPay: 10.5, emergencyPerPay: 0 } }), []);
  assert.notDeepEqual(validateState({ ...s, version: 1 }), []);
  assert.deepEqual(validateState({ ...s, pots: { ...s.pots, savings: { balance: 0, name: 'Home deposit' } } }), []);
  assert.notDeepEqual(validateState({ ...s, pots: { ...s.pots, savings: { balance: 0, name: 'x'.repeat(41) } } }), []);
  assert.notDeepEqual(validateState({ ...s, budgets: [...s.budgets, { id: 'x', name: 'Groceries', icon: '', limit: 0 }] }), []);
  assert.deepEqual(validateTransaction({ date: TODAY, amount: 100, category: 'Other', name: 'x' }), []);
  assert.notDeepEqual(validateTransaction({ date: '9 Nov', amount: 100, category: 'Other', name: 'x' }), []);
  assert.notDeepEqual(validateTransaction({ date: TODAY, amount: 0, category: 'Other', name: 'x' }), []);
  assert.notDeepEqual(validateBackup({ app: 'other' }), []);
});

test('history groups spending into calendar weeks and averages full weeks only', () => {
  const budgets = defaultState().budgets.map((b) => ({ ...b, limit: b.name === 'Groceries' ? 10000 : 0 }));
  const tx = [
    { date: '2026-11-09', amount: 5000, category: 'Groceries' }, // this week (excluded from averages)
    { date: '2026-11-08', amount: 12000, category: 'Groceries' }, // last week
    { date: '2026-10-20', amount: 4000, category: 'Groceries' },
    { date: '2026-10-21', amount: 2000, category: 'Transport' },
  ];
  const weeks = weeklyHistory(tx, budgets, TODAY, 1, 4);
  assert.deepEqual(weeks.map((w) => [w.range.start, w.spent]), [['2026-11-09', 5000], ['2026-11-02', 12000], ['2026-10-26', 0], ['2026-10-19', 6000]]);
  assert.equal(weeks[1].unspent, -2000);
  const avg = categoryAverages(tx, budgets, TODAY, 1, 4);
  assert.deepEqual(avg.range, { start: '2026-10-12', end: '2026-11-08' });
  const groceries = avg.rows.find((r) => r.name === 'Groceries');
  assert.equal(groceries.total, 16000);
  assert.equal(groceries.average, 4000);
});
