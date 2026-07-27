import sql from 'mssql';

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
  return { schemas };
}

export async function getColumns(pool, schema, table) {
  const result = await pool
    .request()
    .input('schema', sql.NVarChar, schema)
    .input('table', sql.NVarChar, table)
    .query(`
      SELECT COLUMN_NAME AS name, DATA_TYPE AS type,
             CASE WHEN IS_NULLABLE = 'YES' THEN 1 ELSE 0 END AS nullable,
             COLUMN_DEFAULT AS [default]
      FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_SCHEMA = @schema AND TABLE_NAME = @table
      ORDER BY ORDINAL_POSITION
    `);
  return result.recordset.map((r) => ({ ...r, nullable: Boolean(r.nullable) }));
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

export function isAuthError(err) {
  return err.code === 'ELOGIN';
}
