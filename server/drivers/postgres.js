import pg from 'pg';
import { groupColumns } from './util.js';

export async function create(conn, password) {
  const pool = new pg.Pool({
    host: conn.host,
    port: conn.port,
    database: conn.database,
    user: conn.user,
    password,
    ssl: conn.ssl ? { rejectUnauthorized: false } : undefined,
    max: 5,
    idleTimeoutMillis: 60_000,
    connectionTimeoutMillis: 8_000,
    application_name: 'DBSurfer',
  });
  pool.on('error', () => {});
  return pool;
}

export async function close(pool) {
  await pool.end().catch(() => {});
}

export async function test(pool) {
  const { rows } = await pool.query('SELECT version()');
  return rows[0].version;
}

export async function getSchema(pool) {
  const { rows } = await pool.query(`
    SELECT n.nspname AS schema, c.relname AS name, c.relkind AS kind
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE c.relkind IN ('r', 'v', 'm', 'p', 'f')
      AND n.nspname NOT IN ('pg_catalog', 'information_schema')
      AND n.nspname NOT LIKE 'pg_toast%'
      AND n.nspname NOT LIKE 'pg_temp%'
    ORDER BY n.nspname, c.relname
  `);
  const kindLabel = { r: 'table', p: 'table', v: 'view', m: 'matview', f: 'foreign' };
  const schemas = {};
  for (const row of rows) {
    (schemas[row.schema] ??= []).push({ name: row.name, kind: kindLabel[row.kind] || row.kind });
  }
  return { schemas };
}

export async function getColumns(pool, schema, table) {
  const { rows } = await pool.query(
    `SELECT column_name AS name, data_type AS type, is_nullable = 'YES' AS nullable, column_default AS "default"
     FROM information_schema.columns
     WHERE table_schema = $1 AND table_name = $2
     ORDER BY ordinal_position`,
    [schema, table]
  );
  return rows;
}

export async function query(pool, sql, maxRows) {
  const raw = await pool.query({ text: sql, rowMode: 'array' });
  return (Array.isArray(raw) ? raw : [raw]).map((r) => ({
    command: r.command,
    rowCount: r.rowCount,
    fields: (r.fields || []).map((f) => ({ name: f.name })),
    rows: (r.rows || []).slice(0, maxRows),
    truncated: (r.rows || []).length > maxRows,
  }));
}

export async function getCompletion(pool) {
  const { rows } = await pool.query(`
    SELECT table_schema AS s, table_name AS t, column_name AS c
    FROM information_schema.columns
    WHERE table_schema NOT IN ('pg_catalog', 'information_schema')
    ORDER BY table_schema, table_name, ordinal_position
  `);
  return groupColumns(rows);
}

export function isAuthError(err) {
  if (err.code === '28P01' || err.code === '28000') return true;
  return /password/i.test(err.message || '') && /suppl|string|authentication/i.test(err.message || '');
}
