import pg from 'pg';
import { getConnection } from './store.js';

const pools = new Map();
// Passwords provided at connect time but not persisted to disk.
const sessionPasswords = new Map();

export function setSessionPassword(id, password) {
  sessionPasswords.set(id, password);
}

export function hasAnyPassword(conn) {
  return Boolean(conn.password || sessionPasswords.has(conn.id));
}

export function getPool(id) {
  const conn = getConnection(id);
  if (!conn) throw Object.assign(new Error('Connection not found'), { status: 404 });
  let entry = pools.get(id);
  if (entry) return entry;

  const password = conn.password ?? sessionPasswords.get(id) ?? undefined;
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
  pools.set(id, pool);
  return pool;
}

export async function closePool(id) {
  const pool = pools.get(id);
  if (pool) {
    pools.delete(id);
    await pool.end().catch(() => {});
  }
}

export function isConnected(id) {
  return pools.has(id);
}

export function clearSessionPassword(id) {
  sessionPasswords.delete(id);
}

export function isAuthError(err) {
  // 28P01 invalid_password, 28000 invalid_authorization_specification
  if (err.code === '28P01' || err.code === '28000') return true;
  return /password/i.test(err.message || '') && /suppl|string|authentication/i.test(err.message || '');
}
