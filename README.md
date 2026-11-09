# Weekwell

Weekly budget planner with a Neon Postgres backend. Project source contains no personal budget figures. Local private seed data lives in `.private/initial-state.json` and stays out of Git.

- [`docs/PLAN.md`](docs/PLAN.md): the roadmap and the money approach behind it.
- [`docs/DEPLOY.md`](docs/DEPLOY.md): put it online with Google sign-in (free), then install it on your phone or computer like an app.

## Requirements

- Node.js 20 or newer
- Neon CLI
- Neon account access to the configured project

## Set up Neon

```sh
npx neon@latest init -y --org-id <your-org-id> --project-id <your-project-id> --branch production --services postgres
npx neon@latest deploy
```

Neon CLI writes the pooled `DATABASE_URL` to `.env.local` (or `.env`). Keep that file private.

## Run

```sh
npm install
npm start
```

`npm start` builds the page into `dist/`, applies any new SQL migrations, then serves the app at `http://127.0.0.1:3000`.

Locally there's no login unless `GOOGLE_CLIENT_ID` is set. When hosted (Vercel), Google sign-in is **required**: the API refuses to serve data until `GOOGLE_CLIENT_ID`, `ALLOWED_EMAILS` and `SESSION_SECRET` are set. See `docs/DEPLOY.md`.

### Upgrading from an earlier version

The first time a new version starts, it converts your existing data automatically:

- amounts become whole cents
- spending entries move into their own table and get real dates

Before converting, it stores an exact copy of your original data in the `weekwell_backups` table. The conversion runs as a single database transaction, so it either completes fully or changes nothing.

**Recommended:** after the first start, open **Backup → Download backup** and keep the file somewhere safe.

## Data and privacy

| Table | Holds |
|---|---|
| `weekwell_state` | Your plan as JSONB: pay, categories, bills, commitments, goals |
| `weekwell_transactions` | Every spending entry, kept so history works |
| `weekwell_backups` | Automatic snapshots, taken before the upgrade and before any restore |

- `/api/export` downloads everything as one JSON file. `/api/import` restores one, after snapshotting the current data first.
- If no data exists yet, the first read seeds from the ignored `.private/initial-state.json` when present (old or new format). Otherwise it starts blank.
- `DATABASE_URL`, the private seed, local output and research notes are ignored by Git.

## Code layout

| Path | What's there |
|---|---|
| `src/engine.js` | All money maths (cents, weeks, plan, history, data upgrade, validation). Plain functions used by both the browser and the server. |
| `src/forecast.js` | 12-month look-ahead: safe to save each pay, lowest point, savings split, wants and “Can I buy it now?” |
| `src/app.js`, `src/api.js`, `src/index.html`, `src/styles.css` | The page |
| `lib/app.js` | API routes |
| `lib/auth.js` | Google sign-in, session cookie, security headers |
| `api/index.js`, `vercel.json` | Vercel hosting |
| `src/manifest.webmanifest`, `src/sw.js`, `src/icons/` | Install-as-app support. Icons are regenerated with `node scripts/icons.cjs`. |
| `lib/db.js` | Database wrapper: Neon for real use, plain Postgres on localhost for tests |
| `lib/migrate.js` | Runs every `migrations/NNNN_*.sql` file once, in order |

## Checks

```sh
npm test
```

This runs the money-engine tests.

The server tests need a **throwaway** Postgres database and wipe it, so they only run when `TEST_DATABASE_URL` is set. Never point it at your real data. Either a local Postgres or a Neon branch works:

```sh
TEST_DATABASE_URL=postgres://postgres@127.0.0.1:5432/weekwell_test npm test
```
