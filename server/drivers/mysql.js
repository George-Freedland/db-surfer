import mysql from 'mysql2/promise';
import { formatBytes, groupColumns } from './util.js';

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

  const [procRows] = await pool.query(`
    SELECT ROUTINE_SCHEMA AS s, ROUTINE_NAME AS name, ROUTINE_TYPE AS type
    FROM information_schema.ROUTINES
    WHERE ROUTINE_SCHEMA NOT IN ('mysql', 'information_schema', 'performance_schema', 'sys')
    ORDER BY ROUTINE_SCHEMA, ROUTINE_NAME
  `).catch(() => [[]]);
  const procedures = {};
  for (const row of procRows) {
    (procedures[row.s] ??= []).push({ name: row.name, kind: row.type === 'PROCEDURE' ? 'procedure' : 'function' });
  }

  return { schemas, procedures };
}

export async function getColumns(pool, schema, table) {
  const [rows] = await pool.query(
    `SELECT COLUMN_NAME AS name, COLUMN_TYPE AS type, IS_NULLABLE = 'YES' AS nullable, COLUMN_DEFAULT AS \`default\`,
            CHARACTER_MAXIMUM_LENGTH AS maxLength, NUMERIC_PRECISION AS \`precision\`, NUMERIC_SCALE AS scale,
            COLUMN_KEY = 'PRI' AS pk
     FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ?
     ORDER BY ORDINAL_POSITION`,
    [schema, table]
  );
  return rows.map((r) => ({ ...r, nullable: Boolean(r.nullable), pk: Boolean(r.pk) }));
}

export async function getIndexes(pool, schema, table) {
  const [rows] = await pool.query(
    `SELECT INDEX_NAME AS name, NON_UNIQUE = 0 AS \`unique\`, INDEX_NAME = 'PRIMARY' AS \`primary\`,
            INDEX_TYPE AS method, COLUMN_NAME AS col, SEQ_IN_INDEX AS seq
     FROM information_schema.STATISTICS
     WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ?
     ORDER BY INDEX_NAME, SEQ_IN_INDEX`,
    [schema, table]
  );
  const byName = {};
  for (const r of rows) {
    const idx = (byName[r.name] ??= {
      name: r.name,
      unique: Boolean(r.unique),
      primary: Boolean(r.primary),
      clustered: Boolean(r.primary), // InnoDB clusters rows by the primary key
      method: r.method,
      columns: [],
    });
    idx.columns.push(r.col);
  }
  return Object.values(byName);
}

export async function getSchemaInfo(pool, schema) {
  const [rows] = await pool.query(
    `SELECT TABLE_NAME AS name, TABLE_TYPE AS t, TABLE_ROWS AS rowEstimate,
            (IFNULL(DATA_LENGTH, 0) + IFNULL(INDEX_LENGTH, 0)) AS sizeBytes
     FROM information_schema.TABLES
     WHERE TABLE_SCHEMA = ?
     ORDER BY (IFNULL(DATA_LENGTH, 0) + IFNULL(INDEX_LENGTH, 0)) DESC, TABLE_NAME`,
    [schema]
  );
  const [verRows] = await pool.query('SELECT VERSION() AS v');
  const [procRows] = await pool.query(
    'SELECT COUNT(*) AS n FROM information_schema.ROUTINES WHERE ROUTINE_SCHEMA = ?',
    [schema]
  );
  const tables = rows.map((r) => ({
    name: r.name,
    kind: r.t === 'VIEW' ? 'view' : 'table',
    rowEstimate: r.rowEstimate == null ? null : Number(r.rowEstimate),
    sizeBytes: Number(r.sizeBytes || 0),
  }));
  return {
    name: schema,
    serverVersion: `MySQL ${verRows[0].v}`,
    stats: [
      { label: 'Schema size', value: formatBytes(tables.reduce((a, t) => a + (t.sizeBytes || 0), 0)) },
      { label: 'Tables / views', value: String(tables.length) },
      { label: 'Routines', value: String(procRows[0].n) },
    ],
    tables,
  };
}

export async function getForeignKeys(pool, schema, table) {
  const [rows] = await pool.query(
    `SELECT CONSTRAINT_NAME AS name, COLUMN_NAME AS col,
            REFERENCED_TABLE_SCHEMA AS refSchema, REFERENCED_TABLE_NAME AS refTable, REFERENCED_COLUMN_NAME AS refCol
     FROM information_schema.KEY_COLUMN_USAGE
     WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? AND REFERENCED_TABLE_NAME IS NOT NULL
     ORDER BY CONSTRAINT_NAME, ORDINAL_POSITION`,
    [schema, table]
  );
  const byName = {};
  for (const r of rows) {
    const fk = (byName[r.name] ??= {
      name: r.name,
      columns: [],
      refSchema: r.refSchema,
      refTable: r.refTable,
      refColumns: [],
    });
    fk.columns.push(r.col);
    fk.refColumns.push(r.refCol);
  }
  return Object.values(byName);
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
