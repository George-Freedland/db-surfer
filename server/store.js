import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';

const DATA_DIR = path.join(os.homedir(), '.dbsurfer');
const FILE = path.join(DATA_DIR, 'connections.json');

function load() {
  try {
    return JSON.parse(fs.readFileSync(FILE, 'utf8'));
  } catch {
    return [];
  }
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
