// Vercel entry point: every /api/* and /auth/* request is handled by the Express app.
// The page itself (dist/) is served as static files by Vercel.
import { createDb } from '../lib/db.js';
import { createApp } from '../lib/app.js';
import { databaseUrl, loadEnv } from '../lib/env.js';

loadEnv();
const db = await createDb(databaseUrl());
export default createApp(db);
