import { test } from 'node:test';
import assert from 'node:assert/strict';
import { defaultState } from '../src/engine.js';
import {
  addMonths, allocation, buildCashflow, canBuyNow, coolingDays, forecast, maxSafePerPay, nextPayday,
  occurrences, paydayPlan, simulate, suggestSplit, wantsTimeline,
} from '../src/forecast.js';

const TODAY = '2026-11-09';

// The worked example from docs/PLAN.md (made-up numbers).
function example(overrides = {}) {
  const s = defaultState();
  s.pay = { amount: 200000, period: 'fortnightly', nextPayday: TODAY };
  s.budgets = [{ id: 'all', name: 'Everyday', icon: '•', limit: 25000 }];
  s.bills = [
    { id: 'rent', name: 'Rent', icon: '⌂', amount: 45000, period: 'weekly', nextDue: TODAY },
    { id: 'phone', name: 'Phone', icon: '↻', amount: 6000, period: 'monthly', nextDue: '2026-11-16' },
  ];
  s.commitments = [
    { id: 'inv', name: 'Invoice', amount: 120000, due: '2027-01-04', kind: 'Invoice', addedOn: TODAY },
    { id: 'rego', name: 'Car rego', amount: 80000, due: '2027-03-22', kind: 'Bill', addedOn: TODAY },
  ];
  s.balances = { everyday: 10000, updatedOn: TODAY };
  s.pots.buffer = { target: 50000, balance: 50000 };
  return Object.assign(s, overrides);
}

test('month stepping keeps the day where it can and clamps at month end', () => {
  assert.equal(addMonths('2026-01-31', 1), '2026-02-28');
  assert.equal(addMonths('2026-11-15', 2), '2027-01-15');
  assert.deepEqual(occurrences('2026-01-31', 'monthly', '2026-03-01', '2026-05-31'), ['2026-03-31', '2026-04-30', '2026-05-31']);
});

test('a past payday or due date rolls forward', () => {
  assert.equal(nextPayday({ period: 'fortnightly', nextPayday: '2026-10-30' }, TODAY), '2026-11-13');
  assert.equal(nextPayday({ period: 'weekly', nextPayday: null }, TODAY), null);
  assert.deepEqual(occurrences('2026-11-02', 'weekly', TODAY, '2026-11-23'), ['2026-11-09', '2026-11-16', '2026-11-23']);
});

test('safe-to-save is the largest amount that never dips below the buffer', () => {
  const s = example();
  const f = forecast(s, [], TODAY);
  assert.equal(f.status, 'ok');
  assert.ok(f.perPay > 0);
  assert.ok(f.min >= 50000, 'buffer is never touched');
  // One more dollar per pay would break the buffer somewhere.
  assert.ok(simulate(f.flow, f.cash, f.perPay + 100).min < 50000);
  // Saving the naive "leftover this fortnight" amount would go far below zero.
  const naive = 200000 - 2 * (45000 + 25000) - 6000;
  assert.ok(simulate(f.flow, f.cash, naive).min < 0);
  assert.ok(f.perPay < naive);
});

test('the forecast warns when even saving nothing breaks the buffer', () => {
  const s = example({ commitments: [{ id: 'big', name: 'Huge bill', amount: 500000, due: '2026-11-20', kind: 'Invoice', addedOn: TODAY }] });
  const f = forecast(s, [], TODAY);
  assert.equal(f.status, 'short');
  assert.equal(f.perPay, 0);
  assert.ok(f.shortfall > 0);
  assert.ok(f.shortDate >= '2026-11-20' && f.shortDate < '2026-11-23'); // bill day, then spending until payday
});

test('before the first payday only $0 matters; the buffer is kept from payday on', () => {
  // $150 now (below the $500 buffer), pay arrives in 4 days.
  const s = example({ pay: { amount: 200000, period: 'fortnightly', nextPayday: '2026-11-13' }, balances: { everyday: 15000, updatedOn: TODAY } });
  s.bills = s.bills.map((b) => ({ ...b, nextDue: '2026-11-20' }));
  s.pots.buffer = { target: 50000, balance: 0 };
  const f = forecast(s, [], TODAY);
  assert.equal(f.status, 'ok');
  assert.equal(f.belowBufferUntilPayday, true);
  assert.ok(f.perPay > 0);
  // But actually running out before payday is still caught.
  const broke = forecast({ ...s, balances: { everyday: 5000, updatedOn: TODAY } }, [], TODAY);
  assert.equal(broke.status, 'short');
  assert.ok(broke.shortDate < '2026-11-13');
});

test('setup states are reported instead of guessing', () => {
  assert.equal(forecast(example({ pay: { amount: 0, period: 'weekly', nextPayday: TODAY } }), [], TODAY).status, 'needs-pay');
  assert.equal(forecast(example({ pay: { amount: 100000, period: 'weekly', nextPayday: null } }), [], TODAY).status, 'needs-payday');
  assert.equal(forecast(example({ balances: { everyday: 0, updatedOn: null } }), [], TODAY).status, 'needs-balances');
});

test('real spending above the limits is used, so the forecast is not optimistic', () => {
  const s = example();
  const heavy = [];
  for (let d = 1; d <= 28; d++) heavy.push({ date: new Date(Date.UTC(2026, 10, 9 - d)).toISOString().slice(0, 10), amount: 6000, category: 'Everyday' });
  const f = forecast(s, heavy, TODAY);
  assert.equal(f.spending.usingActual, true);
  assert.equal(f.spending.weekly, 42000);
  assert.ok(f.perPay < forecast(s, [], TODAY).perPay);
});

test('bills without a due date are still counted, spread weekly', () => {
  const s = example({ bills: [{ id: 'rent', name: 'Rent', icon: '⌂', amount: 45000, period: 'weekly', nextDue: null }] });
  const flow = buildCashflow(s, TODAY, 0);
  const rentTotal = flow.days.flatMap((d) => d.events).filter((e) => e.name.startsWith('Rent')).reduce((a, e) => a + e.amount, 0);
  assert.equal(rentTotal, -45000 * 52);
});

test('split: savings and emergency are protected, wants get the rest', () => {
  const s = example();
  s.pots.emergency = { target: 200000, balance: 100000 }; // the $1,000 Up Saver, $2,000 target
  const split = suggestSplit(s, 30000);
  assert.deepEqual(split, { savings: 12000, emergency: 12000, wants: 6000 });
  s.plan = { savingsPerPay: 12000, emergencyPerPay: 12000 };
  assert.deepEqual(allocation(s, 30000), { savings: 12000, emergency: 12000, wants: 6000, overBy: 0, committed: true });
  assert.equal(allocation(s, 20000).overBy, 4000);
  s.pots.emergency.balance = 200000; // full: its share stops
  assert.equal(allocation(s, 30000).emergency, 0);
  assert.equal(suggestSplit(s, 30000).savings, 21000);
});

test('cooling-off lengths', () => {
  assert.equal(coolingDays(5000), 1);
  assert.equal(coolingDays(50000), 7);
  assert.equal(coolingDays(100000), 30);
});

test('wants are funded one at a time, in order', () => {
  const wants = [{ id: 'a', price: 30000, saved: 0 }, { id: 'b', price: 10000, saved: 5000 }, { id: 'c', price: 1000, saved: 1000 }];
  const paydays = ['2026-11-13', '2026-11-27', '2026-12-11', '2026-12-25'];
  const t = wantsTimeline(wants, paydays, 10000);
  assert.equal(t.get('a'), '2026-12-11');
  assert.equal(t.get('b'), '2026-12-25');
  assert.equal(t.get('c'), 'now');
  assert.equal(wantsTimeline(wants, paydays, 0).get('a'), null);
});

test('"Can I buy it now?" protects committed savings', () => {
  const s = example();
  const base = forecast(s, [], TODAY).perPay;
  s.plan = { savingsPerPay: Math.floor(base * 0.8 / 100) * 100, emergencyPerPay: 0 };
  s.pots.emergency = { target: 0, balance: 0 };
  const cooling = { id: 'ddj', name: 'DDJ', price: 100000, saved: 0, addedOn: TODAY, coolUntil: '2026-12-09' };
  s.wants = [cooling];
  assert.equal(canBuyNow(s, [], TODAY, cooling).answer, 'cooling');

  const ddj = { ...cooling, coolUntil: TODAY };
  s.wants = [ddj];
  const r = canBuyNow(s, [], TODAY, ddj);
  assert.equal(r.answer, 'not-yet');
  assert.ok(r.readyOn > TODAY);
  assert.ok(!r.fasterOn || r.fasterOn <= r.readyOn);

  const cheap = { ...ddj, id: 'cheap', price: 2000 };
  s.wants = [cheap];
  assert.equal(canBuyNow(s, [], TODAY, cheap).answer, 'yes');

  const saved = { ...ddj, saved: 100000 };
  assert.equal(canBuyNow(s, [], TODAY, saved).answer, 'yes-saved');
});

test('payday plan: what is due on payday, what to keep until the next pay, and what to move', () => {
  const s = example({ pay: { amount: 200000, period: 'fortnightly', nextPayday: '2026-11-13' } });
  s.bills = [
    { id: 'rent', name: 'Rent', icon: '⌂', amount: 60000, period: 'fortnightly', nextDue: '2026-11-20' },
    { id: 'gym', name: 'Gym', icon: '↻', amount: 2000, period: 'weekly', nextDue: '2026-11-13' },
    { id: 'ai', name: 'Subscription', icon: '↻', amount: 5200, period: 'annual', nextDue: null },
  ];
  s.commitments = [
    { id: 'w', name: 'Water', amount: 10000, due: '2026-11-13', kind: 'Bill', addedOn: TODAY },
    { id: 'late', name: 'After next pay', amount: 5000, due: '2026-11-28', kind: 'Bill', addedOn: TODAY },
  ];
  s.balances = { everyday: 30000, updatedOn: TODAY };
  s.pots.buffer = { target: 20000, balance: 0 };
  const f = forecast(s, [], TODAY);
  const p = paydayPlan(f, s);
  assert.equal(p.pay, '2026-11-13');
  assert.equal(p.next, '2026-11-27');
  assert.deepEqual(p.onPayday.map((x) => [x.name, x.amount]), [['Gym', 2000], ['Water', 10000]]);
  assert.deepEqual(p.beforeNext.map((x) => [x.name, x.date]).sort(), [['Gym', '2026-11-20'], ['Rent', '2026-11-20']]);
  assert.equal(p.beforeNextTotal, 62000);
  assert.ok(!p.beforeNext.some((x) => x.name === 'After next pay'));
  assert.equal(p.undated, 200); // $52/yr subscription -> $1/week x 2 weeks
  assert.equal(p.spending, 50000); // $250/week x 2 weeks
  assert.equal(p.movesTotal, f.perPay);
  assert.equal(p.committed, false);
  assert.ok(p.lowBeforePay === null || p.lowBeforePay.date < '2026-11-13');
  assert.equal(p.leftBeforeNext.date, '2026-11-26');
  assert.ok(p.leftBeforeNext.amount >= s.pots.buffer.target);
});
