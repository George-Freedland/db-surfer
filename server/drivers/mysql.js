import mysql from 'mysql2/promise';
import { groupColumns } from './util.js';

export async function create(conn, password) {
  return mysql.createPool({
    host: conn.host,
    port: conn.port,
    database: conn.database || undefined,
    user: conn.user,
    password,
    ssl: conn.ssl ? { rejectUnauthorized: false } : undefined,
    connectionLimit: 5,
    multipleStatements: true,
    connectTimeout: 8_000,
  });
}

export async function close(pool) {
  await pool.end().catch(() => {});
}

export async function test(pool) {
  const [rows] = await pool.query('SELECT VERSION() AS v');
  return `MySQL ${rows[0].v}`;
}

export async function getSchema(pool) {
  const [rows] = await pool.query(`
    SELECT TABLE_SCHEMA AS s, TABLE_NAME AS n, TABLE_TYPE AS t
    FROM information_schema.TABLES
    WHERE TABLE_SCHEMA NOT IN ('mysql', 'information_schema', 'performance_schema', 'sys')
    ORDER BY TABLE_SCHEMA, TABLE_NAME
  `);
  const schemas = {};
  for (const row of rows) {
    (schemas[row.s] ??= []).push({ name: row.n, kind: row.t === 'VIEW' ? 'view' : 'table' });
  }
  return { schemas };
}

export async function getColumns(pool, schema, table) {
  const [rows] = await pool.query(
    `SELECT COLUMN_NAME AS name, COLUMN_TYPE AS type, IS_NULLABLE = 'YES' AS nullable, COLUMN_DEFAULT AS \`default\`
     FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ?
     ORDER BY ORDINAL_POSITION`,
    [schema, table]
  );
  return rows.map((r) => ({ ...r, nullable: Boolean(r.nullable) }));
}

function isFieldPacket(value) {
  return value && !Array.isArray(value) && typeof value.name === 'string';
}

export async function query(pool, sql, maxRows) {
  const [rows, fields] = await pool.query({ sql, rowsAsArray: true });

  // mysql2 shapes: single SELECT -> (rows[][], FieldPacket[]); single write -> (ResultSetHeader, undefined);
  // multi-statement -> arrays of the above, element-wise.
  const isMulti = Array.isArray(fields) && fields.length > 0 && !isFieldPacket(fields[0]);
  const resultSets = isMulti ? rows : [rows];
  const fieldSets = isMulti ? fields : [fields];

  return resultSets.map((set, i) => {
    const f = fieldSets[i];
    if (Array.isArray(f) && f.length > 0) {
      return {
        command: 'SELECT',
        rowCount: set.length,
        fields: f.map((fp) => ({ name: fp.name })),
        rows: set.slice(0, maxRows),
        truncated: set.length > maxRows,
      };
    }
    return {
      command: 'OK',
      rowCount: set?.affectedRows ?? 0,
      fields: [],
      rows: [],
      truncated: false,
    };
  });
}

export async function getCompletion(pool) {
  const [rows] = await pool.query(`
    SELECT TABLE_SCHEMA AS s, TABLE_NAME AS t, COLUMN_NAME AS c
    FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA NOT IN ('mysql', 'information_schema', 'performance_schema', 'sys')
    ORDER BY TABLE_SCHEMA, TABLE_NAME, ORDINAL_POSITION
  `);
  return groupColumns(rows);
}

export function isAuthError(err) {
  return err.code === 'ER_ACCESS_DENIED_ERROR' || err.errno === 1045;
}
