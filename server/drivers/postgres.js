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

  const procs = await pool.query(`
    SELECT n.nspname AS schema, p.proname AS name,
      CASE p.prokind WHEN 'p' THEN 'procedure' WHEN 'a' THEN 'aggregate' WHEN 'w' THEN 'window' ELSE 'function' END AS kind
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname NOT IN ('pg_catalog', 'information_schema')
      AND n.nspname NOT LIKE 'pg_toast%'
      AND n.nspname NOT LIKE 'pg_temp%'
    ORDER BY n.nspname, p.proname
  `).catch(() => ({ rows: [] }));
  const procedures = {};
  for (const row of procs.rows) {
    (procedures[row.schema] ??= []).push({ name: row.name, kind: row.kind });
  }

  return { schemas, procedures };
}

export async function getColumns(pool, schema, table) {
  const { rows } = await pool.query(
    `SELECT c.column_name AS name, c.data_type AS type, c.is_nullable = 'YES' AS nullable,
            c.column_default AS "default", c.character_maximum_length AS "maxLength",
            c.numeric_precision AS precision, c.numeric_scale AS scale,
            EXISTS (
              SELECT 1 FROM information_schema.table_constraints tc
              JOIN information_schema.key_column_usage kcu
                ON kcu.constraint_name = tc.constraint_name AND kcu.table_schema = tc.table_schema
              WHERE tc.constraint_type = 'PRIMARY KEY'
                AND kcu.table_schema = c.table_schema AND kcu.table_name = c.table_name
                AND kcu.column_name = c.column_name
            ) AS pk
     FROM information_schema.columns c
     WHERE c.table_schema = $1 AND c.table_name = $2
     ORDER BY c.ordinal_position`,
    [schema, table]
  );
  return rows;
}

export async function getIndexes(pool, schema, table) {
  const { rows } = await pool.query(
    `SELECT i.relname AS name, ix.indisunique AS unique, ix.indisprimary AS primary,
            ix.indisclustered AS clustered, am.amname AS method,
            array_agg(a.attname::text ORDER BY array_position(ix.indkey, a.attnum)) AS columns
     FROM pg_index ix
     JOIN pg_class t ON t.oid = ix.indrelid
     JOIN pg_class i ON i.oid = ix.indexrelid
     JOIN pg_namespace n ON n.oid = t.relnamespace
     JOIN pg_am am ON am.oid = i.relam
     JOIN pg_attribute a ON a.attrelid = t.oid AND a.attnum = ANY(ix.indkey)
     WHERE n.nspname = $1 AND t.relname = $2
     GROUP BY i.relname, ix.indisunique, ix.indisprimary, ix.indisclustered, am.amname
     ORDER BY i.relname`,
    [schema, table]
  );
  return rows;
}

export async function getForeignKeys(pool, schema, table) {
  const { rows } = await pool.query(
    `SELECT con.conname AS name,
            (SELECT array_agg(att.attname::text ORDER BY u.ord)
             FROM unnest(con.conkey) WITH ORDINALITY AS u(attnum, ord)
             JOIN pg_attribute att ON att.attrelid = con.conrelid AND att.attnum = u.attnum) AS columns,
            fn.nspname AS "refSchema", fc.relname AS "refTable",
            (SELECT array_agg(att.attname::text ORDER BY u.ord)
             FROM unnest(con.confkey) WITH ORDINALITY AS u(attnum, ord)
             JOIN pg_attribute att ON att.attrelid = con.confrelid AND att.attnum = u.attnum) AS "refColumns"
     FROM pg_constraint con
     JOIN pg_class c ON c.oid = con.conrelid
     JOIN pg_namespace n ON n.oid = c.relnamespace
     JOIN pg_class fc ON fc.oid = con.confrelid
     JOIN pg_namespace fn ON fn.oid = fc.relnamespace
     WHERE con.contype = 'f' AND n.nspname = $1 AND c.relname = $2
     ORDER BY con.conname`,
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
