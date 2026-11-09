// Server + database tests. They need a THROWAWAY database and wipe it, so they only
// run when TEST_DATABASE_URL is set (never DATABASE_URL, which is your real data):
//   TEST_DATABASE_URL=postgres://postgres@127.0.0.1:54329/weekwell_test npm test
import { after, before, beforeEach, test } from 'node:test';
import assert from 'node:assert/strict';
import { createDb } from '../lib/db.js';
import { createApp } from '../lib/app.js';
import { migrate } from '../lib/migrate.js';

const url = process.env.TEST_DATABASE_URL;
const skip = !url && 'set TEST_DATABASE_URL to a throwaway database to run server tests';
let db, server, base, seed = null;

const call = async (method, path, body) => {
  const res = await fetch(base + path, { method, headers: body ? { 'Content-Type': 'application/json' } : {}, body: body ? JSON.stringify(body) : undefined });
  return { status: res.status, body: await res.json() };
};

before(async () => {
  if (skip) return;
  db = await createDb(url);
  await db.query('DROP TABLE IF EXISTS weekwell_state, weekwell_transactions, weekwell_backups, weekwell_schema_migrations');
  // Simulate the old setup: table created and 0001 recorded.
  await db.query(`CREATE TABLE weekwell_state (id smallint PRIMARY KEY CHECK (id = 1), payload jsonb NOT NULL, updated_at timestamptz NOT NULL DEFAULT now())`);
  await db.query(`CREATE TABLE weekwell_schema_migrations (version text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())`);
  await db.query(`INSERT INTO weekwell_schema_migrations (version) VALUES ('0001_weekwell_state')`);
  assert.deepEqual(await migrate(db), ['0002_transactions_and_backups', '0003_transaction_source', '0004_soft_delete']);
  assert.deepEqual(await migrate(db), []);
  const upFetch = async (url) => ({ ok: true, status: 200, json: async () => (url.includes('/accounts')
    ? { data: [{ id: 'spend', attributes: { displayName: 'Spending', accountType: 'TRANSACTIONAL', balance: { valueInBaseUnits: 1000 } } }] }
    : { data: [
      { id: 'u1', attributes: { description: 'Coles', amount: { valueInBaseUnits: -4550 }, cardPurchaseMethod: { method: 'CONTACTLESS' }, transactionType: 'Purchase', createdAt: '2026-11-08T10:00:00+11:00' }, relationships: { account: { data: { id: 'spend' } }, transferAccount: { data: null }, category: { data: { id: 'groceries' } } } },
      { id: 'u2', attributes: { description: 'Cafe', amount: { valueInBaseUnits: -650 }, cardPurchaseMethod: { method: 'CONTACTLESS' }, transactionType: 'Purchase', createdAt: '2026-11-09T08:00:00+11:00' }, relationships: { account: { data: { id: 'spend' } }, transferAccount: { data: null }, category: { data: { id: 'restaurants-and-cafes' } } } },
    ], links: { next: null } }) });
  server = createApp(db, { today: '2026-11-09', seed: async () => seed, logErrors: false, upToken: 'test-token', upFetch }).listen(0);
  base = `http://127.0.0.1:${server.address().port}`;
});

after(async () => { server?.close(); await db?.end(); });

beforeEach(async () => {
  if (skip) return;
  seed = null;
  await db.query('DELETE FROM weekwell_state');
  await db.query('DELETE FROM weekwell_transactions');
  await db.query('DELETE FROM weekwell_backups');
});

const legacy = {
  income: 2000, payPeriod: 'fortnightly', saving: 50,
  budgets: [{ name: 'Groceries', icon: '🥬', limit: 120, spent: 30 }, { name: 'Transport', icon: '🚆', limit: 40, spent: 0 }, { name: 'Meals out', icon: '🍜', limit: 50, spent: 0 }],
  bills: [{ name: 'Phone', amount: 35, period: 'monthly' }],
  commitments: [{ name: 'Water', amount: 180, kind: 'Water' }],
  goals: [], afterpayBalance: 120,
  transactions: [{ name: 'Market', amount: 30, category: 'Groceries', icon: '🥬', date: 'Mon 9 Nov' }],
  week: 0,
};

test('existing data in the old format is upgraded once, with a backup of the original', { skip }, async () => {
  await db.query('INSERT INTO weekwell_state (id, payload) VALUES (1, $1::jsonb)', [JSON.stringify(legacy)]);
  const { body: state } = await call('GET', '/api/state');
  assert.equal(state.version, 3);
  assert.equal(state.pay.amount, 200000);
  assert.equal(state.afterpayBalance, 12000);
  const { body: tx } = await call('GET', '/api/transactions');
  assert.deepEqual(tx.map(({ date, amount, category, name }) => ({ date, amount, category, name })), [{ date: '2026-11-09', amount: 3000, category: 'Groceries', name: 'Market' }]);
  const backups = await db.query('SELECT reason, payload FROM weekwell_backups');
  assert.equal(backups.length, 1);
  assert.deepEqual(backups[0].payload.original, legacy);
  // A second load doesn't upgrade again or duplicate transactions.
  await call('GET', '/api/state');
  assert.equal((await call('GET', '/api/transactions')).body.length, 1);
  assert.equal((await db.query('SELECT count(*)::int AS n FROM weekwell_backups'))[0].n, 1);
});

test('first run with a private seed file in the old format is upgraded too', { skip }, async () => {
  seed = legacy;
  const { body } = await call('GET', '/api/state');
  assert.equal(body.version, 3);
  assert.equal(body.plan.savingsPerPay, 10000);
});

test('first run without any seed starts blank', { skip }, async () => {
  const { body } = await call('GET', '/api/state');
  assert.equal(body.version, 3);
  assert.equal(body.pay.amount, 0);
});

test('saving state validates whole cents', { skip }, async () => {
  const { body: state } = await call('GET', '/api/state');
  assert.equal((await call('PUT', '/api/state', { ...state, plan: { savingsPerPay: 12.5, emergencyPerPay: 0 } })).status, 400);
  assert.equal((await call('PUT', '/api/state', { ...state, plan: { savingsPerPay: 1250, emergencyPerPay: 0 } })).status, 200);
  assert.equal((await call('GET', '/api/state')).body.plan.savingsPerPay, 1250);
});

test('spending entries: add, edit, filter by date, rename category, delete', { skip }, async () => {
  await call('GET', '/api/state');
  const a = await call('POST', '/api/transactions', { date: '2026-11-09', amount: 1250, category: 'Groceries', name: 'Coles' });
  assert.equal(a.status, 201);
  assert.equal(typeof a.body.id, 'string');
  await call('POST', '/api/transactions', { date: '2026-10-01', amount: 500, category: 'Other', name: 'Old' });
  assert.equal((await call('POST', '/api/transactions', { date: '2026-11-09', amount: -5, category: 'x', name: 'x' })).status, 400);

  const edited = await call('PUT', `/api/transactions/${a.body.id}`, { date: '2026-11-08', amount: 1300, category: 'Groceries', name: 'Coles Central' });
  assert.equal(edited.body.amount, 1300);
  assert.equal(edited.body.date, '2026-11-08');

  const recent = await call('GET', '/api/transactions?from=2026-11-01');
  assert.deepEqual(recent.body.map((t) => t.name), ['Coles Central']);

  await call('POST', '/api/transactions/rename-category', { from: 'Groceries', to: 'Food' });
  assert.equal((await call('GET', '/api/transactions?from=2026-11-01')).body[0].category, 'Food');

  assert.equal((await call('DELETE', `/api/transactions/${a.body.id}`)).status, 200);
  assert.equal((await call('DELETE', `/api/transactions/${a.body.id}`)).status, 404);
  assert.equal((await call('GET', '/api/transactions')).body.length, 1);
});

test('backup round trip: export, change things, restore; current data is snapshotted first', { skip }, async () => {
  await call('GET', '/api/state');
  await call('POST', '/api/transactions', { date: '2026-11-09', amount: 1000, category: 'Other', name: 'Keep me' });
  const { body: backup } = await call('GET', '/api/export');
  assert.equal(backup.app, 'weekwell');
  assert.equal(backup.transactions.length, 1);

  await call('POST', '/api/transactions', { date: '2026-11-09', amount: 999, category: 'Other', name: 'Added after backup' });
  assert.equal((await call('POST', '/api/import', { app: 'nope' })).status, 400);
  const restored = await call('POST', '/api/import', backup);
  assert.equal(restored.status, 200);
  const names = (await call('GET', '/api/transactions')).body.map((t) => t.name);
  assert.deepEqual(names, ['Keep me']);
  const [snap] = await db.query(`SELECT payload FROM weekwell_backups WHERE reason = 'before restore from file'`);
  assert.equal(snap.payload.transactions.length, 2);
});

test('a backup made by the previous version (state version 2) can still be restored', { skip }, async () => {
  await call('GET', '/api/state');
  const old = { app: 'weekwell', exportedAt: '2026-11-09T00:00:00Z', transactions: [{ date: '2026-11-09', amount: 500, category: 'Other', name: 'Old backup' }],
    state: { version: 2, pay: { amount: 100000, period: 'weekly', nextPayday: null }, weekStartsOn: 1, saving: 0, budgets: [{ id: 'o', name: 'Other', icon: '•', limit: 0 }], bills: [], commitments: [], goals: [], afterpayBalance: 0 } };
  assert.equal((await call('POST', '/api/import', old)).status, 200);
  assert.equal((await call('GET', '/api/state')).body.version, 3);
});

test('a failed restore changes nothing', { skip }, async () => {
  await call('GET', '/api/state');
  await call('POST', '/api/transactions', { date: '2026-11-09', amount: 1000, category: 'Other', name: 'Original' });
  const { body: backup } = await call('GET', '/api/export');
  // Valid by shape, but an amount too large for the column makes the database reject it mid-batch.
  backup.transactions.push({ date: '2026-11-09', amount: 9_000_000_000, category: 'Other', name: 'Too big' });
  assert.equal((await call('POST', '/api/import', backup)).status, 503);
  assert.deepEqual((await call('GET', '/api/transactions')).body.map((t) => t.name), ['Original']);
});

test('Up sync adds card purchases once, and skips ones you already logged by hand', { skip }, async () => {
  await call('GET', '/api/state');
  await call('POST', '/api/transactions', { date: '2026-11-09', amount: 650, category: 'Other', name: 'coffee (typed in)' });
  const first = await call('POST', '/api/up/sync');
  assert.equal(first.body.configured, true);
  assert.equal(first.body.found, 2);
  assert.equal(first.body.added, 1); // the $6.50 cafe matches the hand-logged coffee
  const again = await call('POST', '/api/up/sync');
  assert.equal(again.body.added, 0); // never added twice
  const tx = (await call('GET', '/api/transactions')).body;
  assert.deepEqual(tx.map((t) => [t.name, t.source]).sort(), [['Coles', 'up'], ['coffee (typed in)', 'manual']]);
  assert.equal(tx.find((t) => t.name === 'Coles').category, 'Groceries');
});

test('deleting is undoable, and a deleted Up purchase is never synced back in', { skip }, async () => {
  await call('GET', '/api/state');
  const a = (await call('POST', '/api/transactions', { date: '2026-11-09', amount: 1234, category: 'Other', name: 'Undo me' })).body;
  assert.equal((await call('DELETE', `/api/transactions/${a.id}`)).status, 200);
  assert.equal((await call('GET', '/api/transactions')).body.length, 0);
  assert.equal((await call('GET', '/api/export')).body.transactions.length, 0);
  const back = await call('POST', `/api/transactions/${a.id}/restore`);
  assert.equal(back.status, 200);
  assert.equal(back.body.name, 'Undo me');
  assert.equal((await call('GET', '/api/transactions')).body.length, 1);

  await call('POST', '/api/up/sync');
  const coles = (await call('GET', '/api/transactions')).body.find((t) => t.name === 'Coles');
  await call('DELETE', `/api/transactions/${coles.id}`);
  assert.equal((await call('POST', '/api/up/sync')).body.added, 0); // stays deleted
  assert.ok(!(await call('GET', '/api/transactions')).body.some((t) => t.name === 'Coles'));
});
