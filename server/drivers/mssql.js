import sql from 'mssql';
import { groupColumns } from './util.js';

export async function create(conn, password) {
  const pool = new sql.ConnectionPool({
    server: conn.host,
    port: conn.port,
    database: conn.database || undefined,
    user: conn.user,
    password,
    pool: { max: 5 },
    connectionTimeout: 8_000,
    requestTimeout: 120_000,
    options: {
      encrypt: Boolean(conn.ssl),
      trustServerCertificate: true,
    },
  });
  await pool.connect();
  return pool;
}

export async function close(pool) {
  await pool.close().catch(() => {});
}

export async function test(pool) {
  const result = await pool.request().query('SELECT @@VERSION AS v');
  return String(result.recordset[0].v).split('\n')[0].trim();
}

export async function getSchema(pool) {
  const result = await pool.request().query(`
    SELECT TABLE_SCHEMA AS s, TABLE_NAME AS n, TABLE_TYPE AS t
    FROM INFORMATION_SCHEMA.TABLES
    ORDER BY TABLE_SCHEMA, TABLE_NAME
  `);
  const schemas = {};
  for (const row of result.recordset) {
    (schemas[row.s] ??= []).push({ name: row.n, kind: row.t === 'VIEW' ? 'view' : 'table' });
  }

  const procResult = await pool.request().query(`
    SELECT s.name AS sch, o.name AS name, o.type AS t
    FROM sys.objects o
    JOIN sys.schemas s ON s.schema_id = o.schema_id
    WHERE o.type IN ('P', 'FN', 'TF', 'IF') AND o.is_ms_shipped = 0
    ORDER BY s.name, o.name
  `).catch(() => ({ recordset: [] }));
  const procedures = {};
  for (const row of procResult.recordset) {
    (procedures[row.sch] ??= []).push({ name: row.name, kind: row.t === 'P' ? 'procedure' : 'function' });
  }

  return { schemas, procedures };
}

export async function getColumns(pool, schema, table) {
  const result = await pool
    .request()
    .input('schema', sql.NVarChar, schema)
    .input('table', sql.NVarChar, table)
    .query(`
      SELECT c.COLUMN_NAME AS name, c.DATA_TYPE AS type,
             CASE WHEN c.IS_NULLABLE = 'YES' THEN 1 ELSE 0 END AS nullable,
             c.COLUMN_DEFAULT AS [default],
             c.CHARACTER_MAXIMUM_LENGTH AS maxLength, c.NUMERIC_PRECISION AS [precision], c.NUMERIC_SCALE AS scale,
             CASE WHEN pk.COLUMN_NAME IS NOT NULL THEN 1 ELSE 0 END AS pk
      FROM INFORMATION_SCHEMA.COLUMNS c
      LEFT JOIN (
        SELECT ku.TABLE_SCHEMA, ku.TABLE_NAME, ku.COLUMN_NAME
        FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS tc
        JOIN INFORMATION_SCHEMA.KEY_COLUMN_USAGE ku ON tc.CONSTRAINT_NAME = ku.CONSTRAINT_NAME
        WHERE tc.CONSTRAINT_TYPE = 'PRIMARY KEY'
      ) pk ON pk.TABLE_SCHEMA = c.TABLE_SCHEMA AND pk.TABLE_NAME = c.TABLE_NAME AND pk.COLUMN_NAME = c.COLUMN_NAME
      WHERE c.TABLE_SCHEMA = @schema AND c.TABLE_NAME = @table
      ORDER BY c.ORDINAL_POSITION
    `);
  return result.recordset.map((r) => ({ ...r, nullable: Boolean(r.nullable), pk: Boolean(r.pk) }));
}

export async function getIndexes(pool, schema, table) {
  const result = await pool
    .request()
    .input('schema', sql.NVarChar, schema)
    .input('table', sql.NVarChar, table)
    .query(`
      SELECT i.name AS name, i.is_unique AS [unique], i.is_primary_key AS [primary],
             i.type_desc AS method, c.name AS col, ic.key_ordinal AS seq
      FROM sys.indexes i
      JOIN sys.tables t ON t.object_id = i.object_id
      JOIN sys.schemas s ON s.schema_id = t.schema_id
      JOIN sys.index_columns ic ON ic.object_id = i.object_id AND ic.index_id = i.index_id
      JOIN sys.columns c ON c.object_id = ic.object_id AND c.column_id = ic.column_id
      WHERE s.name = @schema AND t.name = @table AND i.name IS NOT NULL
      ORDER BY i.name, ic.key_ordinal
    `);
  const byName = {};
  for (const r of result.recordset) {
    const idx = (byName[r.name] ??= {
      name: r.name,
      unique: Boolean(r.unique),
      primary: Boolean(r.primary),
      clustered: r.method === 'CLUSTERED',
      method: r.method,
      columns: [],
    });
    idx.columns.push(r.col);
  }
  return Object.values(byName);
}

export async function getForeignKeys(pool, schema, table) {
  const result = await pool
    .request()
    .input('schema', sql.NVarChar, schema)
    .input('table', sql.NVarChar, table)
    .query(`
      SELECT fk.name AS name, pc.name AS col, rc.name AS refCol,
             rs.name AS refSchema, rt.name AS refTable, fkc.constraint_column_id AS seq
      FROM sys.foreign_keys fk
      JOIN sys.foreign_key_columns fkc ON fkc.constraint_object_id = fk.object_id
      JOIN sys.tables t ON t.object_id = fk.parent_object_id
      JOIN sys.schemas s ON s.schema_id = t.schema_id
      JOIN sys.columns pc ON pc.object_id = fkc.parent_object_id AND pc.column_id = fkc.parent_column_id
      JOIN sys.tables rt ON rt.object_id = fk.referenced_object_id
      JOIN sys.schemas rs ON rs.schema_id = rt.schema_id
      JOIN sys.columns rc ON rc.object_id = fkc.referenced_object_id AND rc.column_id = fkc.referenced_column_id
      WHERE s.name = @schema AND t.name = @table
      ORDER BY fk.name, fkc.constraint_column_id
    `);
  const byName = {};
  for (const r of result.recordset) {
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

export async function query(pool, text, maxRows) {
  const request = pool.request();
  request.arrayRowMode = true;
  const result = await request.query(text);

  if (!result.recordsets || result.recordsets.length === 0) {
    const affected = (result.rowsAffected || []).reduce((a, b) => a + b, 0);
    return [{ command: 'OK', rowCount: affected, fields: [], rows: [], truncated: false }];
  }

  return result.recordsets.map((recordset) => ({
    command: 'SELECT',
    rowCount: recordset.length,
    fields: (recordset.columns || []).map((c) => ({ name: c.name })),
    rows: recordset.slice(0, maxRows),
    truncated: recordset.length > maxRows,
  }));
}

export async function getCompletion(pool) {
  const result = await pool.request().query(`
    SELECT TABLE_SCHEMA AS s, TABLE_NAME AS t, COLUMN_NAME AS c
    FROM INFORMATION_SCHEMA.COLUMNS
    ORDER BY TABLE_SCHEMA, TABLE_NAME, ORDINAL_POSITION
  `);
  return groupColumns(result.recordset);
}

export function isAuthError(err) {
  return err.code === 'ELOGIN';
}
