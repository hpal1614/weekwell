# Weekwell

Weekly budget planner with a Neon Postgres backend. Project source contains no personal budget figures. Local private seed data lives in `.private/initial-state.json` and stays out of Git.

## Requirements

- Node.js 20 or newer
- Neon CLI
- Neon account access to the configured project

## Set up Neon

```sh
npx neon@latest init -y --org-id <your-org-id> --project-id <your-project-id> --branch production --services postgres
npx neon@latest deploy
```

Neon CLI writes the pooled `DATABASE_URL` to `.env.local` (or `.env`). Keep that file private. Install dependencies and start app:

```sh
npm install
npm run build
npm start
```

`npm start` applies checked-in SQL migrations, then serves app at `http://127.0.0.1:3000`. Server binds to localhost by default because budget API has no user authentication. Add authentication before exposing it on a public network.

## Data and privacy

- `/api/state` stores one budget state as JSONB in Neon.
- First database read seeds from ignored `.private/initial-state.json` when present; otherwise uses blank `data/default-state.json`.
- `DATABASE_URL`, private seed, local output, and research notes are ignored by Git.
- `/api/health` verifies live Neon query. UI reads and writes state through server API; browser storage is not used.

## Checks

```sh
npm run build
npm start
```

With server running, check `GET /api/health`, `GET /api/state`, then `PUT /api/state` and `GET /api/state` again to verify persistence.

