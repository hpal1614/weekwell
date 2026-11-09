# Weekwell

Weekly budget planner with a Neon Postgres backend. Project source contains no personal budget figures. Local private seed data lives in `.private/initial-state.json` and stays out of Git.

See [`docs/PLAN.md`](docs/PLAN.md) for the roadmap and the money approach behind it.

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

`npm start` builds the page into `dist/`, applies any new SQL migrations, then serves the app at `http://127.0.0.1:3000`. The server binds to localhost because the API has no login. Add authentication before exposing it on a public network.

### Upgrading from the first version

The first time the new version starts, it converts your existing data automatically:

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
| `src/app.js`, `src/api.js`, `src/index.html`, `src/styles.css` | The page |
| `lib/app.js` | API routes |
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
