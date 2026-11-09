import dotenv from "dotenv";
import { neon } from "@neondatabase/serverless";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(here, "..", ".env.local") });
dotenv.config({ path: path.join(here, "..", ".env") });
const databaseUrl = process.env.DATABASE_URL || process.env.NEON_DATABASE_URL;
if (!databaseUrl) throw new Error("Missing DATABASE_URL. Run Neon deploy first.");

const sql = neon(databaseUrl);
await sql`CREATE TABLE IF NOT EXISTS weekwell_schema_migrations (
  version text PRIMARY KEY,
  applied_at timestamptz NOT NULL DEFAULT now()
)`;

const version = "0001_weekwell_state";
const [applied] = await sql`SELECT version FROM weekwell_schema_migrations WHERE version = ${version}`;
if (!applied) {
  const migration = await readFile(path.join(here, "..", "migrations", `${version}.sql`), "utf8");
  await sql.unsafe(migration);
  await sql`INSERT INTO weekwell_schema_migrations (version) VALUES (${version})`;
  console.log(`Applied ${version}`);
} else {
  console.log(`${version} already applied`);
}

