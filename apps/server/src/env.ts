import { config } from 'dotenv';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const SERVER_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export const REPO_ROOT = resolve(SERVER_ROOT, '../..');

// root .env first, then apps/server/.env (hosting platforms set real env vars instead)
config({ path: resolve(REPO_ROOT, '.env'), quiet: true });
config({ path: resolve(SERVER_ROOT, '.env'), quiet: true });

const key = process.env.AIVANA_API_KEY?.trim() ?? '';
const mock = process.env.AIVANA_MOCK === '1';
const port = Number(process.env.PORT ?? 3000);

export const env = {
  PORT: port,
  /** server-only secret. Never log, never return to clients. */
  AIVANA_API_KEY: key,
  AIVANA_MOCK: mock,
  AIVANA_BASE_URL: (process.env.AIVANA_BASE_URL ?? 'https://api.aivana.ai').replace(/\/$/, ''),
  PUBLIC_BASE_URL: (process.env.PUBLIC_BASE_URL || `http://localhost:${port}`).replace(/\/$/, ''),
  DB_PATH: resolve(SERVER_ROOT, process.env.DB_PATH ?? 'var/falcon.db'),
  /** mock = canned AI; live = real API; disabled = no key → AI features fall back */
  aiMode: (mock ? 'mock' : key ? 'live' : 'disabled') as 'mock' | 'live' | 'disabled',
};
