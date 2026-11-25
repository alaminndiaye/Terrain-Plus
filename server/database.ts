import type { PoolClient } from 'pg';
import { getPgPool } from './supabaseAdmin.ts';

function normalizeEnv(val: string | undefined): string {
  const s = (val || '').trim();
  if ((s.startsWith('"') && s.endsWith('"')) || (s.startsWith("'") && s.endsWith("'"))) {
    return s.slice(1, -1).trim();
  }
  return s;
}

export const USE_POSTGRES = /^postgres(ql)?:\/\//i.test(normalizeEnv(process.env.DATABASE_URL));

export interface DbRunResult {
  changes: number;
  lastInsertRowid: number;
}

export interface DbExecutor {
  get<T = Record<string, unknown>>(sql: string, ...params: unknown[]): Promise<T | undefined>;
  all<T = Record<string, unknown>>(sql: string, ...params: unknown[]): Promise<T[]>;
  run(sql: string, ...params: unknown[]): Promise<DbRunResult>;
  exec(sql: string): Promise<void>;
}

interface SqliteStatement {
  get(...params: unknown[]): unknown;
  all(...params: unknown[]): unknown[];
  run(...params: unknown[]): { changes: number; lastInsertRowid: number | bigint };
}

interface SqliteDatabaseLike {
  pragma(str: string): unknown;
  exec(sql: string): void;
  prepare(sql: string): SqliteStatement;
}

let sqliteInstance: SqliteDatabaseLike | null = null;
let sqliteLoadPromise: Promise<SqliteDatabaseLike> | null = null;
let sqliteTxQueue: Promise<void> = Promise.resolve();

async function getSqliteDb(): Promise<SqliteDatabaseLike> {
  if (process.env.VERCEL) {
    const err = new Error(
      'DATABASE_URL PostgreSQL manquante ou invalide dans les variables d’environnement Vercel.'
    ) as Error & { code?: string };
    err.code = 'MISSING_DATABASE_URL';
    throw err;
  }
  if (sqliteInstance) return sqliteInstance;
  if (!sqliteLoadPromise) {
    sqliteLoadPromise = (async () => {
      const sqlitePkg = 'better-sqlite3';
      const mod = await import(/* @vite-ignore */ sqlitePkg);
      const DatabaseCtor = mod.default as unknown as new (path: string) => SqliteDatabaseLike;
      const dbPath = process.env.DB_PATH || './terrain_plus.db';
      const instance = new DatabaseCtor(dbPath);
      instance.pragma('journal_mode = WAL');
      instance.pragma('foreign_keys = ON');
      sqliteInstance = instance;
      return instance;
    })();
  }
  return sqliteLoadPromise;
}

/**
 * Translates SQLite-flavored SQL queries used in Terrain+ into standard PostgreSQL SQL.
 * Preserves single-quoted string literals and double-quoted identifiers verbatim.
 */
export function adaptSqlForPostgres(rawSql: string, options?: { appendReturningId?: boolean }): string {
  // First pass: replace SQLite datetime(...) and date(...) expressions outside single quotes,
  // and convert positional `?` placeholders to `$1`, `$2`, ...
  let out = '';
  let paramIdx = 1;
  let i = 0;
  const len = rawSql.length;

  while (i < len) {
    const ch = rawSql[i];

    // Single-quoted SQL literal: copy verbatim including escaped ''
    if (ch === "'") {
      out += ch;
      i += 1;
      while (i < len) {
        const inner = rawSql[i];
        out += inner;
        i += 1;
        if (inner === "'") {
          if (i < len && rawSql[i] === "'") {
            out += rawSql[i];
            i += 1;
          } else {
            break;
          }
        }
      }
      continue;
    }

    // Double-quoted identifier: copy verbatim
    if (ch === '"') {
      out += ch;
      i += 1;
      while (i < len) {
        const inner = rawSql[i];
        out += inner;
        i += 1;
        if (inner === '"') break;
      }
      continue;
    }

    // Positional placeholder
    if (ch === '?') {
      out += `$${paramIdx++}`;
      i += 1;
      continue;
    }

    // Check for datetime(...) or date(...) at word boundary
    const slice = rawSql.slice(i);
    const prevChar = i > 0 ? rawSql[i - 1] : ' ';
    const atWordBoundary = !/[a-zA-Z0-9_.]/.test(prevChar);

    if (atWordBoundary) {
      const dtNowOffset = slice.match(/^datetime\(\s*'now'\s*,\s*'([+-]?\d+\s+[a-zA-Z]+)'\s*\)/i);
      if (dtNowOffset) {
        const offset = dtNowOffset[1].trim();
        if (offset.startsWith('-')) {
          out += `(NOW() - INTERVAL '${offset.slice(1).trim()}')`;
        } else if (offset.startsWith('+')) {
          out += `(NOW() + INTERVAL '${offset.slice(1).trim()}')`;
        } else {
          out += `(NOW() + INTERVAL '${offset}')`;
        }
        i += dtNowOffset[0].length;
        continue;
      }

      const dtNow = slice.match(/^datetime\(\s*'now'\s*\)/i);
      if (dtNow) {
        out += 'NOW()';
        i += dtNow[0].length;
        continue;
      }

      const dtCol = slice.match(/^datetime\(\s*([a-zA-Z_][a-zA-Z0-9_.]*)\s*\)/i);
      if (dtCol) {
        out += `${dtCol[1]}::timestamptz`;
        i += dtCol[0].length;
        continue;
      }

      const dateNowOffset = slice.match(/^date\(\s*'now'\s*,\s*'([+-]?\d+\s+[a-zA-Z]+)'\s*\)/i);
      if (dateNowOffset) {
        const offset = dateNowOffset[1].trim();
        if (offset.startsWith('-')) {
          out += `(CURRENT_DATE - INTERVAL '${offset.slice(1).trim()}')::date::text`;
        } else if (offset.startsWith('+')) {
          out += `(CURRENT_DATE + INTERVAL '${offset.slice(1).trim()}')::date::text`;
        } else {
          out += `(CURRENT_DATE + INTERVAL '${offset}')::date::text`;
        }
        i += dateNowOffset[0].length;
        continue;
      }

      const dateNow = slice.match(/^date\(\s*'now'\s*\)/i);
      if (dateNow) {
        out += 'CURRENT_DATE::text';
        i += dateNow[0].length;
        continue;
      }
    }

    out += ch;
    i += 1;
  }

  let finalSql = out.trim();
  if (
    options?.appendReturningId &&
    /^insert\s+into\s+/i.test(finalSql) &&
    !/\breturning\b/i.test(finalSql)
  ) {
    finalSql = finalSql.replace(/;+\s*$/, '') + ' RETURNING id';
  }

  return finalSql;
}

function normalizePgRow<T>(row: Record<string, unknown> | undefined): T | undefined {
  if (!row) return undefined;
  const normalized: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(row)) {
    normalized[k] = v instanceof Date ? v.toISOString() : v;
  }
  return normalized as T;
}

function makePgExecutor(queryable: { query: PoolClient['query'] }): DbExecutor {
  return {
    async get<T = Record<string, unknown>>(sql: string, ...params: unknown[]): Promise<T | undefined> {
      const pgSql = adaptSqlForPostgres(sql);
      const res = await queryable.query(pgSql, params);
      return normalizePgRow<T>(res.rows[0] as Record<string, unknown> | undefined);
    },
    async all<T = Record<string, unknown>>(sql: string, ...params: unknown[]): Promise<T[]> {
      const pgSql = adaptSqlForPostgres(sql);
      const res = await queryable.query(pgSql, params);
      return res.rows.map((r) => normalizePgRow<T>(r as Record<string, unknown>) as T);
    },
    async run(sql: string, ...params: unknown[]): Promise<DbRunResult> {
      const pgSql = adaptSqlForPostgres(sql, { appendReturningId: true });
      const res = await queryable.query(pgSql, params);
      const firstRow = res.rows[0] as { id?: unknown } | undefined;
      return {
        changes: Number(res.rowCount ?? 0),
        lastInsertRowid: firstRow?.id !== undefined && firstRow?.id !== null ? Number(firstRow.id) : 0,
      };
    },
    async exec(sql: string): Promise<void> {
      const pgSql = adaptSqlForPostgres(sql);
      await queryable.query(pgSql);
    },
  };
}

function makeSqliteExecutor(sqlite: SqliteDatabaseLike): DbExecutor {
  return {
    async get<T = Record<string, unknown>>(sql: string, ...params: unknown[]): Promise<T | undefined> {
      return sqlite.prepare(sql).get(...params) as T | undefined;
    },
    async all<T = Record<string, unknown>>(sql: string, ...params: unknown[]): Promise<T[]> {
      return sqlite.prepare(sql).all(...params) as T[];
    },
    async run(sql: string, ...params: unknown[]): Promise<DbRunResult> {
      const res = sqlite.prepare(sql).run(...params);
      return {
        changes: Number(res.changes ?? 0),
        lastInsertRowid: Number(res.lastInsertRowid ?? 0),
      };
    },
    async exec(sql: string): Promise<void> {
      sqlite.exec(sql);
    },
  };
}

export async function dbGet<T = Record<string, unknown>>(sql: string, ...params: unknown[]): Promise<T | undefined> {
  if (USE_POSTGRES) {
    const pool = getPgPool();
    if (!pool) throw new Error('DATABASE_URL PostgreSQL non configurée.');
    return makePgExecutor(pool).get<T>(sql, ...params);
  }
  const sqlite = await getSqliteDb();
  return makeSqliteExecutor(sqlite).get<T>(sql, ...params);
}

export async function dbAll<T = Record<string, unknown>>(sql: string, ...params: unknown[]): Promise<T[]> {
  if (USE_POSTGRES) {
    const pool = getPgPool();
    if (!pool) throw new Error('DATABASE_URL PostgreSQL non configurée.');
    return makePgExecutor(pool).all<T>(sql, ...params);
  }
  const sqlite = await getSqliteDb();
  return makeSqliteExecutor(sqlite).all<T>(sql, ...params);
}

export async function dbRun(sql: string, ...params: unknown[]): Promise<DbRunResult> {
  if (USE_POSTGRES) {
    const pool = getPgPool();
    if (!pool) throw new Error('DATABASE_URL PostgreSQL non configurée.');
    return makePgExecutor(pool).run(sql, ...params);
  }
  const sqlite = await getSqliteDb();
  return makeSqliteExecutor(sqlite).run(sql, ...params);
}

export async function dbExec(sql: string): Promise<void> {
  if (USE_POSTGRES) {
    const pool = getPgPool();
    if (!pool) throw new Error('DATABASE_URL PostgreSQL non configurée.');
    await makePgExecutor(pool).exec(sql);
    return;
  }
  const sqlite = await getSqliteDb();
  sqlite.exec(sql);
}

export async function dbPragma(statement: string): Promise<void> {
  if (USE_POSTGRES) return;
  const sqlite = await getSqliteDb();
  sqlite.pragma(statement);
}

export async function dbTransaction<T>(fn: (tx: DbExecutor) => Promise<T>): Promise<T> {
  if (USE_POSTGRES) {
    const pool = getPgPool();
    if (!pool) throw new Error('DATABASE_URL PostgreSQL non configurée.');
    const client = await pool.connect();
    const txExec = makePgExecutor(client);
    try {
      await client.query('BEGIN');
      const result = await fn(txExec);
      await client.query('COMMIT');
      return result;
    } catch (err) {
      try {
        await client.query('ROLLBACK');
      } catch {
        // Ignore rollback failure
      }
      throw err;
    } finally {
      client.release();
    }
  }

  // Serialize async SQLite transactions to avoid overlapping BEGIN IMMEDIATE on single handle
  let releaseLock!: () => void;
  const prevQueue = sqliteTxQueue;
  sqliteTxQueue = new Promise<void>((resolve) => {
    releaseLock = resolve;
  });
  await prevQueue;

  const sqlite = await getSqliteDb();
  const txExec = makeSqliteExecutor(sqlite);
  try {
    sqlite.exec('BEGIN IMMEDIATE');
    const result = await fn(txExec);
    sqlite.exec('COMMIT');
    return result;
  } catch (err) {
    try {
      sqlite.exec('ROLLBACK');
    } catch {
      // Ignore rollback failure
    }
    throw err;
  } finally {
    releaseLock();
  }
}

export function getDefaultDbExecutor(): DbExecutor {
  return {
    get: dbGet,
    all: dbAll,
    run: dbRun,
    exec: dbExec,
  };
}
