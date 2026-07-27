import express from 'express';
import {
  listConnections,
  getConnection,
  createConnection,
  updateConnection,
  deleteConnection,
  clearSavedPassword,
  exportConnections,
  importConnections,
} from './store.js';
import {
  getHandle,
  closePool,
  isConnected,
  setSessionPassword,
  clearSessionPassword,
  hasAnyPassword,
  isAuthError,
} from './pools.js';
import { DB_TYPES, isValidType } from './drivers/index.js';

const app = express();
app.use(express.json({ limit: '10mb' }));

const PORT = process.env.PORT || 4400;
const MAX_ROWS = 5000;

// AggregateError (e.g. ECONNREFUSED on IPv4+IPv6) often has an empty message
function errorMessage(err) {
  if (err.message) return err.message;
  const inner = err.errors?.find((e) => e.message);
  if (inner) return inner.message;
  return err.code || 'Connection failed — is the database reachable?';
}

function publicConnection(conn) {
  const { password, ...rest } = conn;
  return {
    ...rest,
    type: conn.type || 'postgres',
    hasSavedPassword: Boolean(password),
    hasPassword: hasAnyPassword(conn),
    connected: isConnected(conn.id),
  };
}

app.get('/api/db-types', (_req, res) => {
  res.json(DB_TYPES);
});

app.get('/api/connections', (_req, res) => {
  res.json(listConnections().map(publicConnection));
});

app.get('/api/connections/export', (req, res) => {
  const includePasswords = req.query.includePasswords === '1';
  res.json(exportConnections({ includePasswords }));
});

app.post('/api/connections/import', (req, res) => {
  const body = req.body || {};
  const list = Array.isArray(body) ? body : body.connections;
  try {
    const summary = importConnections(list, { replaceExisting: Boolean(body.replaceExisting) });
    res.json({ ...summary, connections: listConnections().map(publicConnection) });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.post('/api/connections', (req, res) => {
  const body = req.body || {};
  if (body.type && !isValidType(body.type)) {
    return res.status(400).json({ error: `Unknown database type: ${body.type}` });
  }
  const conn = createConnection(body);
  if (!body.savePassword && body.password) {
    setSessionPassword(conn.id, body.password);
  }
  res.status(201).json(publicConnection(conn));
});

app.put('/api/connections/:id', async (req, res) => {
  const body = req.body || {};
  if (body.type && !isValidType(body.type)) {
    return res.status(400).json({ error: `Unknown database type: ${body.type}` });
  }
  const conn = updateConnection(req.params.id, body);
  if (!conn) return res.status(404).json({ error: 'Connection not found' });
  if (!body.savePassword && body.password) {
    setSessionPassword(conn.id, body.password);
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
    const { driver, handle } = await getHandle(conn.id);
    const serverVersion = await driver.test(handle);
    res.json({ ...publicConnection(getConnection(conn.id)), connected: true, serverVersion });
  } catch (err) {
    await closePool(conn.id);
    if (isAuthError(conn, err)) {
      return res.status(401).json({ error: errorMessage(err), code: 'password_required' });
    }
    res.status(502).json({ error: errorMessage(err) });
  }
});

app.post('/api/connections/:id/disconnect', async (req, res) => {
  await closePool(req.params.id);
  res.json({ ok: true });
});

app.get('/api/connections/:id/schema', async (req, res) => {
  try {
    const { driver, handle } = await getHandle(req.params.id);
    res.json(await driver.getSchema(handle));
  } catch (err) {
    handleQueryError(req, res, err);
  }
});

app.get('/api/connections/:id/columns', async (req, res) => {
  const { schema, table } = req.query;
  try {
    const { driver, handle } = await getHandle(req.params.id);
    res.json({ columns: await driver.getColumns(handle, schema, table) });
  } catch (err) {
    handleQueryError(req, res, err);
  }
});

app.get('/api/connections/:id/completion', async (req, res) => {
  try {
    const { driver, handle } = await getHandle(req.params.id);
    if (!driver.getCompletion) return res.json({ schema: {}, tables: [], columns: [] });
    res.json(await driver.getCompletion(handle));
  } catch (err) {
    handleQueryError(req, res, err);
  }
});

app.post('/api/connections/:id/query', async (req, res) => {
  const { sql } = req.body || {};
  if (!sql || !sql.trim()) return res.status(400).json({ error: 'No query to execute' });
  const started = Date.now();
  try {
    const { driver, handle } = await getHandle(req.params.id);
    const results = await driver.query(handle, sql, MAX_ROWS);
    res.json({ results, durationMs: Date.now() - started });
  } catch (err) {
    handleQueryError(req, res, err, started);
  }
});

function handleQueryError(req, res, err, started) {
  const conn = getConnection(req.params.id);
  const auth = isAuthError(conn || {}, err);
  const status = err.status || (auth ? 401 : 400);
  res.status(status).json({
    error: errorMessage(err),
    code: auth ? 'password_required' : err.code,
    position: err.position ? Number(err.position) : undefined,
    durationMs: started ? Date.now() - started : undefined,
  });
}

app.listen(PORT, () => {
  console.log(`DBSurfer server listening on http://localhost:${PORT}`);
});
