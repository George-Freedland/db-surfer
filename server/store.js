import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';

const DATA_DIR = path.join(os.homedir(), '.dbsurfer');
const FILE = path.join(DATA_DIR, 'connections.json');

function load() {
  let raw;
  try {
    raw = JSON.parse(fs.readFileSync(FILE, 'utf8'));
  } catch {
    return [];
  }
  if (!Array.isArray(raw)) return [];
  // Migrate records created before the multi-engine `type` field existed.
  return raw.map((c) => ({ type: 'postgres', ssl: false, ...c }));
}

function save(connections) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(FILE, JSON.stringify(connections, null, 2), { mode: 0o600 });
}

let connections = load();

export function listConnections() {
  return connections;
}

export function getConnection(id) {
  return connections.find((c) => c.id === id);
}

export function createConnection({ name, type, host, port, database, user, password, savePassword, color, ssl }) {
  const conn = {
    id: crypto.randomUUID(),
    name: name || `${host}/${database}`,
    type: type || 'postgres',
    host: host || 'localhost',
    port: Number(port) || 5432,
    database: database ?? '',
    user: user ?? '',
    color: color || null,
    ssl: Boolean(ssl),
    createdAt: new Date().toISOString(),
  };
  if (savePassword && password) conn.password = password;
  connections.push(conn);
  save(connections);
  return conn;
}

export function updateConnection(id, patch) {
  const conn = getConnection(id);
  if (!conn) return null;
  const { name, type, host, port, database, user, password, savePassword, color, ssl } = patch;
  if (name !== undefined) conn.name = name;
  if (type !== undefined) conn.type = type;
  if (host !== undefined) conn.host = host;
  if (port !== undefined) conn.port = Number(port) || 5432;
  if (database !== undefined) conn.database = database;
  if (user !== undefined) conn.user = user;
  if (color !== undefined) conn.color = color;
  if (ssl !== undefined) conn.ssl = Boolean(ssl);
  if (savePassword === false) {
    delete conn.password;
  } else if (password) {
    conn.password = password;
  }
  save(connections);
  return conn;
}

export function deleteConnection(id) {
  connections = connections.filter((c) => c.id !== id);
  save(connections);
}

export function clearSavedPassword(id) {
  const conn = getConnection(id);
  if (conn) {
    delete conn.password;
    save(connections);
  }
}

const EXPORT_FIELDS = ['name', 'type', 'host', 'port', 'database', 'user', 'color', 'ssl'];

export function exportConnections({ includePasswords = false, id = null } = {}) {
  const source = id ? connections.filter((c) => c.id === id) : connections;
  return {
    format: 'dbsurfer-connections',
    version: 1,
    exportedAt: new Date().toISOString(),
    connections: source.map((conn) => {
      const out = {};
      for (const field of EXPORT_FIELDS) out[field] = conn[field];
      if (includePasswords && conn.password) out.password = conn.password;
      return out;
    }),
  };
}

function connectionKey(c) {
  return `${c.type}|${c.host}|${c.port}|${c.database}|${c.user}`;
}

export function importConnections(incoming, { replaceExisting = false } = {}) {
  if (!Array.isArray(incoming)) throw new Error('Import file has no "connections" array');
  const existingByKey = new Map(connections.map((c) => [connectionKey(c), c]));
  let added = 0;
  let updated = 0;
  let skipped = 0;

  for (const raw of incoming) {
    if (!raw || typeof raw !== 'object') continue;
    const candidate = {
      name: raw.name,
      type: raw.type || 'postgres',
      host: raw.host,
      port: raw.port,
      database: raw.database,
      user: raw.user,
      color: raw.color ?? null,
      ssl: Boolean(raw.ssl),
    };
    const existing = existingByKey.get(connectionKey(candidate));
    if (existing) {
      if (replaceExisting) {
        updateConnection(existing.id, { ...candidate, ...(raw.password ? { password: raw.password, savePassword: true } : {}) });
        updated++;
      } else {
        skipped++;
      }
      continue;
    }
    const created = createConnection({
      ...candidate,
      ...(raw.password ? { password: raw.password, savePassword: true } : {}),
    });
    existingByKey.set(connectionKey(created), created);
    added++;
  }
  return { added, updated, skipped };
}
