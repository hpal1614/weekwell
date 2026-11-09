import express from 'express';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import {
  addDays, defaultState, isISODate, isLegacyState, todayISO, upgradeState,
  validateBackup, validateState, validateTransaction,
} from '../src/engine.js';
import { root } from './env.js';
import { fetchFromUp } from './up.js';
import {
  SECURITY_HEADERS, authConfig, clearedCookie, createSession, parseCookies, readSession, sessionCookie,
  SESSION_COOKIE, verifyGoogleCredential,
} from './auth.js';

const TX_COLUMNS = `id::text AS id, occurred_on::text AS date, amount_cents AS amount, category, name, source`;

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
  const auth = options.auth || authConfig();
  app.disable('x-powered-by');
  app.set('trust proxy', true);
  app.use((_req, res, next) => { for (const [k, v] of Object.entries(SECURITY_HEADERS)) res.setHeader(k, v); next(); });

  // ---------- login ----------

  app.get('/auth/config', (_req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    res.json(auth.mode === 'google' ? { mode: 'google', clientId: auth.clientId } : { mode: auth.mode, missing: auth.missing });
  });

  // Google posts the signed ID token here (redirect mode).
  app.post('/auth/google', express.urlencoded({ extended: false, limit: '16kb' }), async (req, res) => {
    if (auth.mode !== 'google') return res.status(404).end();
    // Google's double-submit check: if both values are present they must match.
    const cookieToken = parseCookies(req.headers.cookie).g_csrf_token;
    if (cookieToken && req.body.g_csrf_token && cookieToken !== req.body.g_csrf_token) return res.redirect(303, '/?login=failed');
    try {
      const user = await verifyGoogleCredential(req.body.credential, { clientId: auth.clientId, keys: options.googleKeys });
      if (!auth.allowed.includes(user.email)) return res.redirect(303, '/?login=denied');
      res.setHeader('Set-Cookie', sessionCookie(createSession(user, auth.secret), auth));
      res.redirect(303, '/');
    } catch (error) {
      if (options.logErrors !== false) console.error('Login failed:', error.message);
      res.redirect(303, '/?login=failed');
    }
  });

  app.post('/auth/logout', (_req, res) => {
    if (auth.mode === 'google') res.setHeader('Set-Cookie', clearedCookie(auth));
    res.json({ ok: true });
  });

  // Everything under /api needs a valid session when login is on.
  app.use('/api', (req, res, next) => {
    res.setHeader('Cache-Control', 'no-store');
    if (auth.mode === 'off') return next();
    if (auth.mode === 'misconfigured') return res.status(503).json({ error: 'Login is not set up on this server yet', missing: auth.missing });
    const user = readSession(parseCookies(req.headers.cookie)[SESSION_COOKIE], auth);
    if (!user) return res.status(401).json({ error: 'Please sign in' });
    // Changes must come from this site (blocks cross-site request forgery).
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      const site = req.get('sec-fetch-site');
      const origin = req.get('origin');
      const host = req.get('x-forwarded-host') || req.get('host');
      if ((site && site !== 'same-origin') || (origin && new URL(origin).host !== host)) return res.status(403).json({ error: 'Blocked: request did not come from Weekwell' });
    }
    // Keep you signed in while you use it: refresh the cookie when it's over halfway through.
    if (user.exp - Date.now() < 15 * 86400000) res.setHeader('Set-Cookie', sessionCookie(createSession(user, auth.secret), auth));
    req.user = user;
    next();
  });

  app.use('/api', express.json({ limit: '5mb' }));

  app.get('/api/me', (req, res) => {
    res.json(req.user ? { email: req.user.email, name: req.user.name } : { email: null, name: null });
  });

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
       WHERE NOT hidden AND ($1::date IS NULL OR occurred_on >= $1::date) AND ($2::date IS NULL OR occurred_on <= $2::date)
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
       WHERE id = $1 AND NOT hidden RETURNING ${TX_COLUMNS}`,
      [req.params.id, t.date, t.amount, t.category.trim(), t.name.trim()],
    );
    if (!row) return res.status(404).json({ error: 'Not found' });
    res.json(row);
  }));

  app.delete('/api/transactions/:id', wrap(async (req, res) => {
    if (!/^\d+$/.test(req.params.id)) return res.status(404).json({ error: 'Not found' });
    // Hidden rather than erased: it can be undone, and a deleted Up purchase is never synced back in.
    const rows = await db.query('UPDATE weekwell_transactions SET hidden = true, updated_at = now() WHERE id = $1 AND NOT hidden RETURNING id', [req.params.id]);
    if (!rows.length) return res.status(404).json({ error: 'Not found' });
    res.json({ ok: true });
  }));

  app.post('/api/transactions/:id/restore', wrap(async (req, res) => {
    if (!/^\d+$/.test(req.params.id)) return res.status(404).json({ error: 'Not found' });
    const [row] = await db.query(`UPDATE weekwell_transactions SET hidden = false, updated_at = now() WHERE id = $1 RETURNING ${TX_COLUMNS}`, [req.params.id]);
    if (!row) return res.status(404).json({ error: 'Not found' });
    res.json(row);
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

  // ---------- Up Bank ----------
  const upToken = () => options.upToken ?? process.env.UP_API_TOKEN;

  app.get('/api/up/status', (_req, res) => res.json({ configured: Boolean(upToken()) }));

  // Pull recent Up card purchases into spending. Safe to run any time: nothing is added twice.
  app.post('/api/up/sync', wrap(async (req, res) => {
    const token = upToken();
    if (!token) return res.json({ configured: false });
    const state = await loadState(db, options);
    const [last] = await db.query(`SELECT max(occurred_on)::text AS d FROM weekwell_transactions WHERE source = 'up'`);
    const today = options.today || todayISO();
    // Re-read a week back each time so purchases that were still pending get picked up.
    const since = last?.d ? addDays(last.d, -7) : addDays(today, -42);
    let result;
    try {
      result = await fetchFromUp({ token, since, state, fetchImpl: options.upFetch || fetch });
    } catch (error) {
      return res.status(error.status === 401 ? 401 : 502).json({ error: error.message, upError: true });
    }
    let added = 0;
    for (const e of result.entries) {
      // Skip if it's already there from Up, or you logged the same amount by hand within a day.
      const rows = await db.query(
        `INSERT INTO weekwell_transactions (occurred_on, amount_cents, category, name, source, external_id)
         SELECT $1, $2, $3, $4, 'up', $5
         WHERE NOT EXISTS (SELECT 1 FROM weekwell_transactions WHERE external_id = $5)
           AND NOT EXISTS (SELECT 1 FROM weekwell_transactions WHERE source = 'manual' AND NOT hidden AND amount_cents = $2
                           AND occurred_on BETWEEN $1::date - 1 AND $1::date + 1)
         RETURNING id`,
        [e.date, e.amount, e.category, e.name, e.externalId],
      );
      added += rows.length;
    }
    res.json({ configured: true, added, found: result.entries.length, skipped: result.skipped, accounts: result.accounts, since });
  }));

  app.get('/api/export', wrap(async (_req, res) => {
    const state = await loadState(db, options);
    const transactions = await db.query(`SELECT ${TX_COLUMNS} FROM weekwell_transactions WHERE NOT hidden ORDER BY occurred_on, id`);
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
    const currentTx = await db.query(`SELECT ${TX_COLUMNS} FROM weekwell_transactions WHERE NOT hidden ORDER BY occurred_on, id`);
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
