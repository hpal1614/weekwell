import { test } from 'node:test';
import assert from 'node:assert/strict';
import { budgetFor, classify, fetchFromUp, plannedKeys } from '../lib/up.js';

const state = {
  budgets: [
    { name: 'Groceries' }, { name: 'Transport' }, { name: 'Eating out' }, { name: 'Weekends out' }, { name: 'Other' },
  ],
  bills: [{ name: 'Rent' }, { name: 'Anytime Fitness' }, { name: 'Netflix' }, { name: 'Dodo phone' }, { name: 'Claude' }, { name: 'Electricity reserve' }],
  commitments: [{ name: 'Afterpay: Jetstar 2 of 4', kind: 'Afterpay' }, { name: 'Pay back friends', kind: 'Friend' }, { name: 'PT exam', kind: 'Other' }],
  merchantRules: { 'chemist warehouse': 'Other' },
};

const tx = (id, { amount = -1250, desc = 'Coles', category = 'groceries', account = 'spend', transfer = null, method = { method: 'CONTACTLESS' }, type = 'Purchase', created = '2026-11-08T18:30:00+11:00' } = {}) => ({
  id,
  attributes: { description: desc, amount: { valueInBaseUnits: amount }, cardPurchaseMethod: method, transactionType: type, createdAt: created },
  relationships: { account: { data: { id: account } }, transferAccount: { data: transfer }, category: { data: category ? { id: category } : null } },
});
const ctx = { transactionalIds: new Set(['spend']), planned: plannedKeys(state), state };

test('planned bills are recognised by their names', () => {
  assert.deepEqual(plannedKeys(state).sort(), ['afterpay', 'anytime', 'claude', 'dodo', 'electricity', 'pt exam', 'netflix', 'rent'].sort());
});

test('everyday card purchases become spending in the right category, on the local date', () => {
  assert.deepEqual(classify(tx('a'), ctx), { action: 'add', entry: { externalId: 'up:a', date: '2026-11-08', amount: 1250, category: 'Groceries', name: 'Coles' } });
  assert.equal(classify(tx('b', { desc: 'Guzman y Gomez', category: 'takeaway' }), ctx).entry.category, 'Eating out');
  assert.equal(classify(tx('c', { desc: 'The Ivy', category: 'pubs-and-bars' }), ctx).entry.category, 'Weekends out');
  assert.equal(classify(tx('d', { desc: 'Opal', category: 'public-transport' }), ctx).entry.category, 'Transport');
  assert.equal(classify(tx('e', { desc: 'JB Hi-Fi', category: 'technology' }), ctx).entry.category, 'Other');
  assert.equal(classify(tx('f', { desc: 'Uncategorised shop', category: null }), ctx).entry.category, 'Other');
});

test('your own corrections win over Up categories', () => {
  assert.equal(budgetFor('health-and-medical', 'Chemist Warehouse', state), 'Other');
  assert.equal(budgetFor('groceries', 'CHEMIST WAREHOUSE', state), 'Other');
});

test('transfers, savers, money in, non-card payments and planned bills are skipped', () => {
  const reason = (t) => classify(t, ctx).reason;
  assert.equal(reason(tx('1', { account: 'saver' })), 'saver');
  assert.equal(reason(tx('2', { amount: 238920 })), 'money in');
  assert.equal(reason(tx('3', { transfer: { id: 'saver' } })), 'transfer');
  assert.equal(reason(tx('4', { method: null, type: 'Transfer' })), 'not a card purchase');
  assert.equal(reason(tx('5', { desc: 'NETFLIX.COM', category: 'tv-and-music' })), 'planned bill');
  assert.equal(reason(tx('6', { desc: 'Anytime Fitness Parramatta', category: 'fitness-and-wellbeing' })), 'planned bill');
  assert.equal(reason(tx('7', { desc: 'Afterpay', category: null })), 'planned bill');
  assert.equal(reason(tx('8', { desc: 'Some telco', category: 'mobile-phone' })), 'planned bill');
});

test('fetchFromUp follows pages, uses the token, and reports what it skipped', async () => {
  const calls = [];
  const pages = {
    '/accounts': { data: [{ id: 'spend', attributes: { displayName: 'Spending', accountType: 'TRANSACTIONAL', balance: { valueInBaseUnits: 3457 } } }, { id: 'saver', attributes: { displayName: 'Home deposit', accountType: 'SAVER', balance: { valueInBaseUnits: 6105 } } }] },
    page1: { data: [tx('a'), tx('n', { desc: 'Netflix', category: 'tv-and-music' })], links: { next: 'https://api.up.com.au/api/v1/transactions?page=2' } },
    page2: { data: [tx('t', { transfer: { id: 'saver' } }), tx('b', { desc: 'Cafe', category: 'restaurants-and-cafes' })], links: { next: null } },
  };
  const fakeFetch = async (url, init) => {
    calls.push({ url, auth: init.headers.Authorization });
    const body = url.includes('/accounts') ? pages['/accounts'] : url.includes('page=2') ? pages.page2 : pages.page1;
    return { ok: true, status: 200, json: async () => body };
  };
  const r = await fetchFromUp({ token: 'secret', since: '2026-10-01', state, fetchImpl: fakeFetch });
  assert.deepEqual(r.entries.map((e) => [e.name, e.category]), [['Coles', 'Groceries'], ['Cafe', 'Eating out']]);
  assert.deepEqual(r.skipped, { 'planned bill': 1, transfer: 1 });
  assert.deepEqual(r.accounts, [{ name: 'Spending', type: 'TRANSACTIONAL', balance: 3457 }, { name: 'Home deposit', type: 'SAVER', balance: 6105 }]);
  assert.ok(calls.every((c) => c.auth === 'Bearer secret'));
  assert.ok(calls[1].url.includes('filter[since]=2026-10-01'));
});

test('a rejected token gives a clear message', async () => {
  const fakeFetch = async () => ({ ok: false, status: 401, json: async () => ({}) });
  await assert.rejects(fetchFromUp({ token: 'bad', since: '2026-10-01', state, fetchImpl: fakeFetch }), /Up rejected the token/);
});
