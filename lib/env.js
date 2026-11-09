import dotenv from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

export function loadEnv() {
  dotenv.config({ path: path.join(root, '.env.local'), quiet: true });
  dotenv.config({ path: path.join(root, '.env'), quiet: true });
}

export function databaseUrl() {
  const url = process.env.DATABASE_URL || process.env.NEON_DATABASE_URL;
  if (!url) throw new Error('Missing DATABASE_URL. Run Neon deploy (see README), then start the app.');
  return url;
}
