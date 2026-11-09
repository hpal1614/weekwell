import { loadEnv, databaseUrl } from '../lib/env.js';
import { createDb } from '../lib/db.js';
import { migrate } from '../lib/migrate.js';

loadEnv();
// Vercel preview copies deliberately get no database settings: skip instead of failing the build.
if (process.env.VERCEL_ENV === 'preview' && !process.env.DATABASE_URL && !process.env.NEON_DATABASE_URL) {
  console.log('Preview build without DATABASE_URL: skipping migrations.');
  process.exit(0);
}
const db = await createDb(databaseUrl());
try {
  await migrate(db, console.log);
} finally {
  await db.end();
}
