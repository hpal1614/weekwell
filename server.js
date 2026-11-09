import { createDb } from './lib/db.js';
import { createApp } from './lib/app.js';
import { databaseUrl, loadEnv } from './lib/env.js';

loadEnv();
const port = Number(process.env.PORT || 3000);
// Localhost only: the API has no login. Add authentication before exposing it.
const host = process.env.HOST || '127.0.0.1';

const db = await createDb(databaseUrl());
createApp(db).listen(port, host, () => {
  console.log(`Weekwell listening at http://${host}:${port}`);
});
