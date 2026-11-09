import { loadEnv, databaseUrl } from '../lib/env.js';
import { createDb } from '../lib/db.js';
import { migrate } from '../lib/migrate.js';

loadEnv();
const db = await createDb(databaseUrl());
try {
  await migrate(db, console.log);
} finally {
  await db.end();
}
