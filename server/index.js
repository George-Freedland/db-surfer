import express from 'express';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
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
import {
  getAiConfig,
  addAiKey,
  deleteAiKey,
  setActiveAiKey,
  updateAiKey,
  getActiveAiKey,
  getAiKeyById,
} from './aiStore.js';
import { AI_PROVIDERS, isValidProvider, listModels, generateSql, buildSystemPrompt } from './ai.js';

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
  const id = req.query.id || null;
  res.json(exportConnections({ includePasswords, id }));
});

app.post('/api/connections/import', (req, res) => {
  const body = req.body || {};
  // Accept a bulk export ({connections: [...]}), a bare array, or a single
  // exported connection object.
  let list = Array.isArray(body) ? body : body.connections;
  if (!list && typeof body === 'object' && (body.host !== undefined || body.database !== undefined) ) {
    list = [body];
  }
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

app.get('/api/connections/:id/table-info', async (req, res) => {
  const { schema, table } = req.query;
  try {
    const { driver, handle } = await getHandle(req.params.id);
    const [columns, indexes, foreignKeys] = await Promise.all([
      driver.getColumns(handle, schema, table),
      driver.getIndexes ? driver.getIndexes(handle, schema, table) : [],
      driver.getForeignKeys ? driver.getForeignKeys(handle, schema, table) : [],
    ]);
    res.json({ columns, indexes, foreignKeys });
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

app.get('/api/connections/:id/schema-info', async (req, res) => {
  const { schema } = req.query;
  try {
    const { driver, handle } = await getHandle(req.params.id);
    if (!driver.getSchemaInfo) return res.status(400).json({ error: 'Not supported for this database type' });
    res.json(await driver.getSchemaInfo(handle, schema));
  } catch (err) {
    handleQueryError(req, res, err);
  }
});

// --- AI Assist (BYOK) ---

app.get('/api/ai', (_req, res) => {
  res.json({ ...getAiConfig(), providers: AI_PROVIDERS });
});

app.post('/api/ai/keys', (req, res) => {
  const { provider, apiKey, model, label } = req.body || {};
  if (!isValidProvider(provider)) return res.status(400).json({ error: `Unknown provider: ${provider}` });
  if (!apiKey || !model) return res.status(400).json({ error: 'apiKey and model are required' });
  res.status(201).json(addAiKey({ provider, apiKey, model, label }));
});

app.put('/api/ai/keys/:id', (req, res) => {
  try {
    res.json(updateAiKey(req.params.id, req.body || {}));
  } catch (err) {
    res.status(404).json({ error: err.message });
  }
});

app.delete('/api/ai/keys/:id', (req, res) => {
  deleteAiKey(req.params.id);
  res.json({ ok: true });
});

app.post('/api/ai/active', (req, res) => {
  try {
    setActiveAiKey(req.body?.keyId ?? null);
    res.json(getAiConfig());
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.post('/api/ai/models', async (req, res) => {
  const { provider, apiKey, keyId } = req.body || {};
  try {
    let p = provider;
    let k = apiKey;
    if (keyId) {
      const stored = getAiKeyById(keyId);
      if (!stored) return res.status(404).json({ error: 'Key not found' });
      p = stored.provider;
      k = stored.apiKey;
    }
    if (!isValidProvider(p)) return res.status(400).json({ error: `Unknown provider: ${p}` });
    if (!k) return res.status(400).json({ error: 'apiKey is required' });
    res.json({ models: await listModels(p, k) });
  } catch (err) {
    res.status(502).json({ error: errorMessage(err) });
  }
});

app.post('/api/ai/generate', async (req, res) => {
  const { connectionId, prompt } = req.body || {};
  if (!prompt || !prompt.trim()) return res.status(400).json({ error: 'Describe what to generate first' });
  const key = getActiveAiKey();
  if (!key) return res.status(400).json({ error: 'No active AI key - add one in Settings' });

  let dbType = 'postgres';
  let completion = null;
  if (connectionId) {
    const conn = getConnection(connectionId);
    if (conn) dbType = conn.type || 'postgres';
    try {
      const { driver, handle } = await getHandle(connectionId);
      if (driver.getCompletion) completion = await driver.getCompletion(handle);
    } catch {
      // not connected - generate without schema context
    }
  }

  try {
    const sql = await generateSql({
      provider: key.provider,
      apiKey: key.apiKey,
      model: key.model,
      system: buildSystemPrompt(dbType, completion),
      prompt,
    });
    if (!sql) return res.status(502).json({ error: 'The model returned an empty response' });
    res.json({ sql, provider: key.provider, model: key.model });
  } catch (err) {
    res.status(502).json({ error: errorMessage(err) });
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

// Serve the built UI (client/dist) when it exists, so `npm start` (or Docker)
// runs the whole app from this one server. In dev, Vite serves the UI instead.
const CLIENT_DIST = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'client', 'dist');
const hasUi = fs.existsSync(path.join(CLIENT_DIST, 'index.html'));
if (hasUi) {
  app.use(express.static(CLIENT_DIST));
  app.get('*', (req, res) => {
    if (req.path.startsWith('/api/')) return res.status(404).json({ error: 'Not found' });
    res.sendFile(path.join(CLIENT_DIST, 'index.html'));
  });
}

app.listen(PORT, () => {
  console.log(`DBSurfer server listening on http://localhost:${PORT}${hasUi ? '' : ' (API only - run `npm run dev` for the UI, or `npm run build` first)'}`);
});
