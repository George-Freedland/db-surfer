import express from 'express';
import {
  listConnections,
  getConnection,
  createConnection,
  updateConnection,
  deleteConnection,
  clearSavedPassword,
} from './store.js';
import {
  getPool,
  closePool,
  isConnected,
  setSessionPassword,
  clearSessionPassword,
  hasAnyPassword,
  isAuthError,
} from './pools.js';

const app = express();
app.use(express.json({ limit: '10mb' }));

const PORT = process.env.PORT || 4400;
const MAX_ROWS = 5000;

function publicConnection(conn) {
  const { password, ...rest } = conn;
  return {
    ...rest,
    hasSavedPassword: Boolean(password),
    hasPassword: hasAnyPassword(conn),
    connected: isConnected(conn.id),
  };
}

app.get('/api/connections', (_req, res) => {
  res.json(listConnections().map(publicConnection));
});

app.post('/api/connections', (req, res) => {
  const conn = createConnection(req.body || {});
  if (!req.body.savePassword && req.body.password) {
    setSessionPassword(conn.id, req.body.password);
  }
  res.status(201).json(publicConnection(conn));
});

app.put('/api/connections/:id', async (req, res) => {
  const conn = updateConnection(req.params.id, req.body || {});
  if (!conn) return res.status(404).json({ error: 'Connection not found' });
  if (!req.body.savePassword && req.body.password) {
    setSessionPassword(conn.id, req.body.password);
  }
  await closePool(conn.id); // settings changed; force reconnect
  res.json(publicConnection(conn));
});

app.delete('/api/connections/:id', async (req, res) => {
  await closePool(req.params.id);
  clearSessionPassword(req.params.id);
  deleteConnection(req.params.id);
  res.json({ ok: true });
});

app.post('/api/connections/:id/clear-credentials', async (req, res) => {
  const conn = getConnection(req.params.id);
  if (!conn) return res.status(404).json({ error: 'Connection not found' });
  await closePool(conn.id);
  clearSessionPassword(conn.id);
  clearSavedPassword(conn.id);
  res.json(publicConnection(getConnection(req.params.id)));
});

app.post('/api/connections/:id/connect', async (req, res) => {
  const conn = getConnection(req.params.id);
  if (!conn) return res.status(404).json({ error: 'Connection not found' });
  const { password, savePassword } = req.body || {};
  if (password) {
    await closePool(conn.id);
    if (savePassword) updateConnection(conn.id, { password });
    else setSessionPassword(conn.id, password);
  }
  try {
    const pool = getPool(conn.id);
    const result = await pool.query('SELECT version()');
    res.json({ ...publicConnection(getConnection(conn.id)), connected: true, serverVersion: result.rows[0].version });
  } catch (err) {
    await closePool(conn.id);
    if (isAuthError(err)) {
      return res.status(401).json({ error: err.message, code: 'password_required' });
    }
    res.status(502).json({ error: err.message });
  }
});

app.post('/api/connections/:id/disconnect', async (req, res) => {
  await closePool(req.params.id);
  res.json({ ok: true });
});

app.get('/api/connections/:id/schema', async (req, res) => {
  try {
    const pool = getPool(req.params.id);
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
    res.json({ schemas });
  } catch (err) {
    handleQueryError(res, err);
  }
});

app.get('/api/connections/:id/columns', async (req, res) => {
  const { schema, table } = req.query;
  try {
    const pool = getPool(req.params.id);
    const { rows } = await pool.query(
      `SELECT column_name AS name, data_type AS type, is_nullable = 'YES' AS nullable, column_default AS "default"
       FROM information_schema.columns
       WHERE table_schema = $1 AND table_name = $2
       ORDER BY ordinal_position`,
      [schema, table]
    );
    res.json({ columns: rows });
  } catch (err) {
    handleQueryError(res, err);
  }
});

app.post('/api/connections/:id/query', async (req, res) => {
  const { sql } = req.body || {};
  if (!sql || !sql.trim()) return res.status(400).json({ error: 'No SQL to execute' });
  const started = Date.now();
  try {
    const pool = getPool(req.params.id);
    const raw = await pool.query({ text: sql, rowMode: 'array' });
    const results = (Array.isArray(raw) ? raw : [raw]).map((r) => ({
      command: r.command,
      rowCount: r.rowCount,
      fields: (r.fields || []).map((f) => ({ name: f.name, dataTypeID: f.dataTypeID })),
      rows: (r.rows || []).slice(0, MAX_ROWS),
      truncated: (r.rows || []).length > MAX_ROWS,
    }));
    res.json({ results, durationMs: Date.now() - started });
  } catch (err) {
    handleQueryError(res, err, started);
  }
});

function handleQueryError(res, err, started) {
  const status = err.status || (isAuthError(err) ? 401 : 400);
  res.status(status).json({
    error: err.message,
    code: isAuthError(err) ? 'password_required' : err.code,
    position: err.position ? Number(err.position) : undefined,
    durationMs: started ? Date.now() - started : undefined,
  });
}

app.listen(PORT, () => {
  console.log(`DBSurfer server listening on http://localhost:${PORT}`);
});
