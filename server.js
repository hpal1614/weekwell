import dotenv from "dotenv";
import express from "express";
import { neon } from "@neondatabase/serverless";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(here, ".env.local") });
dotenv.config({ path: path.join(here, ".env") });
const port = Number(process.env.PORT || 3000);
const host = process.env.HOST || "127.0.0.1";
const databaseUrl = process.env.DATABASE_URL || process.env.NEON_DATABASE_URL;

if (!databaseUrl) {
  throw new Error("Missing DATABASE_URL. Run Neon deploy, then start the app.");
}

const sql = neon(databaseUrl);
const app = express();
app.disable("x-powered-by");
app.use(express.json({ limit: "256kb" }));

async function initialState() {
  try {
    return JSON.parse(await readFile(path.join(here, ".private", "initial-state.json"), "utf8"));
  } catch {
    return JSON.parse(await readFile(path.join(here, "data", "default-state.json"), "utf8"));
  }
}

app.get("/api/health", async (_req, res) => {
  try {
    const [row] = await sql`SELECT current_database() AS database, now() AS checked_at`;
    res.json({ ok: true, database: row.database, checkedAt: row.checked_at });
  } catch {
    res.status(503).json({ ok: false, error: "Database check failed" });
  }
});

app.get("/api/state", async (_req, res) => {
  try {
    const [existing] = await sql`SELECT payload FROM weekwell_state WHERE id = 1`;
    if (existing) return res.json(existing.payload);

    const seed = await initialState();
    await sql`INSERT INTO weekwell_state (id, payload) VALUES (1, ${JSON.stringify(seed)}::jsonb)
      ON CONFLICT (id) DO NOTHING`;
    const [created] = await sql`SELECT payload FROM weekwell_state WHERE id = 1`;
    res.json(created.payload);
  } catch {
    res.status(503).json({ error: "Could not load budget data" });
  }
});

app.put("/api/state", async (req, res) => {
  const state = req.body;
  if (!state || typeof state !== "object" || Array.isArray(state) || !Array.isArray(state.budgets) || !Array.isArray(state.bills) || !Array.isArray(state.commitments) || !Array.isArray(state.goals) || !Array.isArray(state.transactions)) {
    return res.status(400).json({ error: "Invalid budget state" });
  }

  try {
    await sql`INSERT INTO weekwell_state (id, payload, updated_at)
      VALUES (1, ${JSON.stringify(state)}::jsonb, now())
      ON CONFLICT (id) DO UPDATE SET payload = EXCLUDED.payload, updated_at = now()`;
    res.json({ ok: true });
  } catch {
    res.status(503).json({ error: "Could not save budget data" });
  }
});

app.use(express.static(path.join(here, "dist")));
app.use((_req, res) => res.sendFile(path.join(here, "dist", "index.html")));

app.listen(port, host, () => {
  console.log(`Weekwell listening at http://${host}:${port}`);
});

