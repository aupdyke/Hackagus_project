/**
 * Storage: a tiny document store over SQLite (better-sqlite3), with a JSON-file fallback if the native
 * module cannot load. Collections are JSON documents keyed by (collection, id); ai_calls is a real table.
 * Validation happens in repo.ts (Zod) — this layer only stores JSON.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname } from 'node:path';
import type { AiCallLog } from '@falcon/shared';
import { env } from './env';

export type Collection = 'trips' | 'settings' | 'trip_versions' | 'roommate_requests' | 'notifications' | 'actuals' | 'meta';
export type NewAiCall = Omit<AiCallLog, 'id' | 'created_at'>;

export interface Db {
  kind: 'sqlite' | 'json';
  get<T>(col: Collection, id: string): T | null;
  put(col: Collection, id: string, doc: unknown): void;
  list<T>(col: Collection): T[];
  del(col: Collection, id: string): void;
  insertAiCall(row: NewAiCall): void;
  listAiCalls(limit?: number): AiCallLog[];
  reset(): void;
}

function sqliteDb(path: string): Db {
  const require = createRequire(import.meta.url);
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const Database = require('better-sqlite3') as typeof import('better-sqlite3');
  if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true });
  const db = new Database(path);
  db.pragma('journal_mode = WAL');
  db.exec(`
    CREATE TABLE IF NOT EXISTS docs (col TEXT NOT NULL, id TEXT NOT NULL, data TEXT NOT NULL, updated_at TEXT NOT NULL, PRIMARY KEY (col, id));
    CREATE TABLE IF NOT EXISTS ai_calls (
      id INTEGER PRIMARY KEY AUTOINCREMENT, feature TEXT, endpoint TEXT, ok INTEGER, error_code TEXT,
      input_tokens INTEGER, cached_tokens INTEGER, output_tokens INTEGER, credits REAL, latency_ms INTEGER,
      request_id TEXT, attempts INTEGER, mock INTEGER, created_at TEXT);
  `);
  const getQ = db.prepare('SELECT data FROM docs WHERE col = ? AND id = ?');
  const putQ = db.prepare('INSERT INTO docs (col, id, data, updated_at) VALUES (?, ?, ?, ?) ON CONFLICT(col, id) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at');
  const listQ = db.prepare('SELECT data FROM docs WHERE col = ? ORDER BY id');
  const delQ = db.prepare('DELETE FROM docs WHERE col = ? AND id = ?');
  const insQ = db.prepare(`INSERT INTO ai_calls (feature, endpoint, ok, error_code, input_tokens, cached_tokens, output_tokens, credits, latency_ms, request_id, attempts, mock, created_at)
    VALUES (@feature, @endpoint, @ok, @error_code, @input_tokens, @cached_tokens, @output_tokens, @credits, @latency_ms, @request_id, @attempts, @mock, @created_at)`);
  const listAiQ = db.prepare('SELECT * FROM ai_calls ORDER BY id DESC LIMIT ?');
  return {
    kind: 'sqlite',
    get: <T>(col: Collection, id: string) => {
      const row = getQ.get(col, id) as { data: string } | undefined;
      return row ? (JSON.parse(row.data) as T) : null;
    },
    put: (col, id, doc) => void putQ.run(col, id, JSON.stringify(doc), new Date().toISOString()),
    list: <T>(col: Collection) => (listQ.all(col) as { data: string }[]).map((r) => JSON.parse(r.data) as T),
    del: (col, id) => void delQ.run(col, id),
    insertAiCall: (row) => void insQ.run({ ...row, ok: row.ok ? 1 : 0, mock: row.mock ? 1 : 0, created_at: new Date().toISOString() }),
    listAiCalls: (limit = 500) =>
      (listAiQ.all(limit) as Record<string, unknown>[]).map((r) => ({ ...r, ok: r.ok === 1, mock: r.mock === 1 }) as AiCallLog),
    reset: () => db.exec('DELETE FROM docs; DELETE FROM ai_calls;'),
  };
}

function jsonDb(path: string): Db {
  const file = path.replace(/\.db$/, '') + '.json';
  type Shape = { docs: Record<string, Record<string, unknown>>; ai_calls: AiCallLog[] };
  let state: Shape = { docs: {}, ai_calls: [] };
  if (path !== ':memory:' && existsSync(file)) state = JSON.parse(readFileSync(file, 'utf8')) as Shape;
  const save = () => {
    if (path === ':memory:') return;
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, JSON.stringify(state));
  };
  return {
    kind: 'json',
    get: <T>(col: Collection, id: string) => ((state.docs[col]?.[id] as T) ?? null),
    put: (col, id, doc) => {
      (state.docs[col] ??= {})[id] = doc;
      save();
    },
    list: <T>(col: Collection) => Object.keys(state.docs[col] ?? {}).sort().map((k) => state.docs[col]![k] as T),
    del: (col, id) => {
      delete state.docs[col]?.[id];
      save();
    },
    insertAiCall: (row) => {
      state.ai_calls.unshift({ ...row, id: (state.ai_calls[0]?.id ?? 0) + 1, created_at: new Date().toISOString() });
      state.ai_calls = state.ai_calls.slice(0, 2000);
      save();
    },
    listAiCalls: (limit = 500) => state.ai_calls.slice(0, limit),
    reset: () => {
      state = { docs: {}, ai_calls: [] };
      save();
    },
  };
}

export function openDb(path = env.DB_PATH): Db {
  try {
    return sqliteDb(path);
  } catch (e) {
    console.warn(`[db] better-sqlite3 unavailable (${(e as Error).message}); using JSON file store`);
    return jsonDb(path);
  }
}

export const db: Db = openDb(process.env.VITEST ? ':memory:' : env.DB_PATH);
