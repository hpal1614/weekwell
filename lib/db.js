// Small database wrapper so the rest of the app doesn't care which driver runs.
//   db.query(text, params)  -> rows
//   db.batch([{ text, params }, ...]) -> runs every statement in ONE transaction
// Neon (HTTP driver) is used for real data. A plain local Postgres URL
// (localhost / 127.0.0.1) uses the `pg` driver, which is only for tests.

export async function createDb(url) {
  if (!url) throw new Error('Missing database URL.');
  const host = new URL(url).hostname;
  if (host === 'localhost' || host === '127.0.0.1') return createLocalDb(url);
  const { neon } = await import('@neondatabase/serverless');
  const sql = neon(url);
  return {
    kind: 'neon',
    query: (text, params = []) => sql.query(text, params),
    batch: (statements) => sql.transaction(statements.map((s) => sql.query(s.text, s.params || []))),
    end: async () => {},
  };
}

async function createLocalDb(url) {
  let pg;
  try {
    pg = (await import('pg')).default;
  } catch {
    throw new Error('Local Postgres needs the "pg" dev dependency. Run npm install.');
  }
  const pool = new pg.Pool({ connectionString: url, max: 4 });
  return {
    kind: 'local',
    query: async (text, params = []) => (await pool.query(text, params)).rows,
    batch: async (statements) => {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        const results = [];
        for (const s of statements) results.push((await client.query(s.text, s.params || [])).rows);
        await client.query('COMMIT');
        return results;
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      } finally {
        client.release();
      }
    },
    end: () => pool.end(),
  };
}
