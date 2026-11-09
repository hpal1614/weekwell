import express from 'express';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import {
  defaultState, isISODate, isLegacyState, todayISO, upgradeState,
  validateBackup, validateState, validateTransaction,
} from '../src/engine.js';
import { root } from './env.js';

const TX_COLUMNS = `id::text AS id, occurred_on::text AS date, amount_cents AS amount, category, name`;

async function readSeed() {
  try {
    return JSON.parse(await readFile(path.join(root, '.private', 'initial-state.json'), 'utf8'));
  } catch {
    return null;
  }
}

function insertTransaction(t) {
  return {
    text: `INSERT INTO weekwell_transactions (occurred_on, amount_cents, category, name) VALUES ($1, $2, $3, $4)`,
    params: [t.date, t.amount, t.category.trim(), t.name.trim()],
  };
}

function saveState(state) {
  return {
    text: `INSERT INTO weekwell_state (id, payload, updated_at) VALUES (1, $1::jsonb, now())
      ON CONFLICT (id) DO UPDATE SET payload = EXCLUDED.payload, updated_at = now()`,
    params: [JSON.stringify(state)],
  };
}

function backup(reason, payload) {
  return { text: `INSERT INTO weekwell_backups (reason, payload) VALUES ($1, $2::jsonb)`, params: [reason, JSON.stringify(payload)] };
}

/**
 * Load the budget state, upgrading the original format if needed.
 * The upgrade keeps a full copy of the old data in weekwell_backups first,
 * and runs as one transaction, so it either fully happens or not at all.
 */
export async function loadState(db, { today = todayISO(), seed = readSeed } = {}) {
  const [row] = await db.query('SELECT payload FROM weekwell_state WHERE id = 1');
  if (row && !isLegacyState(row.payload)) return row.payload;

  const original = row ? row.payload : await seed();
  if (!original) {
    const fresh = defaultState();
    await db.batch([saveState(fresh)]);
    return fresh;
  }
  if (!isLegacyState(original)) {
    await db.batch([saveState(original)]);
    return original;
  }

  const { state, transactions } = upgradeState(original, today);
  const statements = [backup(`before upgrade from version ${original.version || 1} to ${state.version}`, { original }), saveState(state), ...transactions.map(insertTransaction)];
  // Guard against two requests upgrading at once: only upgrade if the stored row is still the old one.
  if (row) {
    const [again] = await db.query('SELECT payload FROM weekwell_state WHERE id = 1');
    if (again && !isLegacyState(again.payload)) return again.payload;
  }
  await db.batch(statements);
  return state;
}

export function createApp(db, options = {}) {
  const app = express();
  app.disable('x-powered-by');
  app.use(express.json({ limit: '5mb' }));

  const wrap = (fn) => async (req, res) => {
    try {
      await fn(req, res);
    } catch (error) {
      if (options.logErrors !== false) console.error(error);
      res.status(503).json({ error: 'Database problem. Your data was not changed.' });
    }
  };

  app.get('/api/health', wrap(async (_req, res) => {
    const [row] = await db.query('SELECT current_database() AS database, now() AS checked_at');
    res.json({ ok: true, database: row.database, checkedAt: row.checked_at });
  }));

  app.get('/api/state', wrap(async (_req, res) => {
    res.json(await loadState(db, options));
  }));

  app.put('/api/state', wrap(async (req, res) => {
    const errors = validateState(req.body);
    if (errors.length) return res.status(400).json({ error: 'Invalid budget state', details: errors });
    await db.batch([saveState(req.body)]);
    res.json({ ok: true });
  }));

  app.get('/api/transactions', wrap(async (req, res) => {
    const { from, to } = req.query;
    if ((from && !isISODate(from)) || (to && !isISODate(to))) return res.status(400).json({ error: 'from/to must be YYYY-MM-DD' });
    const rows = await db.query(
      `SELECT ${TX_COLUMNS} FROM weekwell_transactions
       WHERE ($1::date IS NULL OR occurred_on >= $1::date) AND ($2::date IS NULL OR occurred_on <= $2::date)
       ORDER BY occurred_on DESC, id DESC`,
      [from || null, to || null],
    );
    res.json(rows);
  }));

  app.post('/api/transactions', wrap(async (req, res) => {
    const t = req.body;
    const errors = validateTransaction(t);
    if (errors.length) return res.status(400).json({ error: 'Invalid spending entry', details: errors });
    const [row] = await db.query(
      `INSERT INTO weekwell_transactions (occurred_on, amount_cents, category, name) VALUES ($1, $2, $3, $4) RETURNING ${TX_COLUMNS}`,
      [t.date, t.amount, t.category.trim(), t.name.trim()],
    );
    res.status(201).json(row);
  }));

  app.put('/api/transactions/:id', wrap(async (req, res) => {
    if (!/^\d+$/.test(req.params.id)) return res.status(404).json({ error: 'Not found' });
    const t = req.body;
    const errors = validateTransaction(t);
    if (errors.length) return res.status(400).json({ error: 'Invalid spending entry', details: errors });
    const [row] = await db.query(
      `UPDATE weekwell_transactions SET occurred_on = $2, amount_cents = $3, category = $4, name = $5, updated_at = now()
       WHERE id = $1 RETURNING ${TX_COLUMNS}`,
      [req.params.id, t.date, t.amount, t.category.trim(), t.name.trim()],
    );
    if (!row) return res.status(404).json({ error: 'Not found' });
    res.json(row);
  }));

  app.delete('/api/transactions/:id', wrap(async (req, res) => {
    if (!/^\d+$/.test(req.params.id)) return res.status(404).json({ error: 'Not found' });
    const rows = await db.query('DELETE FROM weekwell_transactions WHERE id = $1 RETURNING id', [req.params.id]);
    if (!rows.length) return res.status(404).json({ error: 'Not found' });
    res.json({ ok: true });
  }));

  // Rename a category everywhere, so history follows a renamed budget.
  app.post('/api/transactions/rename-category', wrap(async (req, res) => {
    const { from, to } = req.body || {};
    if (typeof from !== 'string' || typeof to !== 'string' || !from.trim() || !to.trim() || to.length > 200) {
      return res.status(400).json({ error: 'from and to are required' });
    }
    await db.query('UPDATE weekwell_transactions SET category = $2, updated_at = now() WHERE category = $1', [from, to.trim()]);
    res.json({ ok: true });
  }));

  app.get('/api/export', wrap(async (_req, res) => {
    const state = await loadState(db, options);
    const transactions = await db.query(`SELECT ${TX_COLUMNS} FROM weekwell_transactions ORDER BY occurred_on, id`);
    const stamp = new Date().toISOString();
    res.setHeader('Content-Disposition', `attachment; filename="weekwell-backup-${stamp.slice(0, 10)}.json"`);
    res.json({
      app: 'weekwell',
      exportedAt: stamp,
      state,
      transactions: transactions.map(({ date, amount, category, name }) => ({ date, amount, category, name })),
    });
  }));

  // Replace everything with a backup file. The current data is snapshotted first.
  app.post('/api/import', wrap(async (req, res) => {
    // Backups made by an older version are upgraded before checking.
    if (req.body && req.body.app === 'weekwell' && req.body.state && isLegacyState(req.body.state)) {
      req.body.state = upgradeState(req.body.state, options.today || todayISO()).state;
    }
    const errors = validateBackup(req.body);
    if (errors.length) return res.status(400).json({ error: 'That file is not a valid Weekwell backup', details: errors.slice(0, 20) });
    const [current] = await db.query('SELECT payload FROM weekwell_state WHERE id = 1');
    const currentTx = await db.query(`SELECT ${TX_COLUMNS} FROM weekwell_transactions ORDER BY occurred_on, id`);
    await db.batch([
      backup('before restore from file', { state: current ? current.payload : null, transactions: currentTx }),
      { text: 'DELETE FROM weekwell_transactions' },
      saveState(req.body.state),
      ...req.body.transactions.map(insertTransaction),
    ]);
    res.json({ ok: true, transactions: req.body.transactions.length });
  }));

  app.use('/api', (_req, res) => res.status(404).json({ error: 'Not found' }));

  const dist = path.join(root, 'dist');
  app.use(express.static(dist));
  app.use((_req, res) => res.sendFile(path.join(dist, 'index.html')));
  return app;
}
