import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'migrations');

/** Split a migration file into statements. Files must not use semicolons inside statements. */
export function splitStatements(text) {
  return text
    .split('\n')
    .filter((line) => !line.trim().startsWith('--'))
    .join('\n')
    .split(';')
    .map((s) => s.trim())
    .filter(Boolean);
}

/** Apply every migrations/NNNN_*.sql file not yet recorded, in order. Returns versions applied. */
export async function migrate(db, log = () => {}) {
  await db.query(`CREATE TABLE IF NOT EXISTS weekwell_schema_migrations (
    version text PRIMARY KEY,
    applied_at timestamptz NOT NULL DEFAULT now()
  )`);
  const files = (await readdir(dir)).filter((f) => /^\d{4}_.+\.sql$/.test(f)).sort();
  const applied = new Set((await db.query('SELECT version FROM weekwell_schema_migrations')).map((r) => r.version));
  const done = [];
  for (const file of files) {
    const version = file.replace(/\.sql$/, '');
    if (applied.has(version)) continue;
    const statements = splitStatements(await readFile(path.join(dir, file), 'utf8')).map((text) => ({ text }));
    statements.push({ text: 'INSERT INTO weekwell_schema_migrations (version) VALUES ($1)', params: [version] });
    await db.batch(statements);
    log(`Applied ${version}`);
    done.push(version);
  }
  if (!done.length) log('Database is up to date');
  return done;
}
