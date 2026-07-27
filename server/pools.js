import { getDriver } from './drivers/index.js';
import { getConnection } from './store.js';

const handles = new Map(); // conn id -> { driver, handle }
// Passwords provided at connect time but not persisted to disk.
const sessionPasswords = new Map();

export function setSessionPassword(id, password) {
  sessionPasswords.set(id, password);
}

export function hasAnyPassword(conn) {
  return Boolean(conn.password || sessionPasswords.has(conn.id));
}

export async function getHandle(id) {
  const conn = getConnection(id);
  if (!conn) throw Object.assign(new Error('Connection not found'), { status: 404 });
  let entry = handles.get(id);
  if (entry) return entry;

  const driver = getDriver(conn.type);
  const password = conn.password ?? sessionPasswords.get(id) ?? undefined;
  const handle = await driver.create(conn, password);
  entry = { driver, handle, conn };
  handles.set(id, entry);
  return entry;
}

export async function closePool(id) {
  const entry = handles.get(id);
  if (entry) {
    handles.delete(id);
    await entry.driver.close(entry.handle).catch(() => {});
  }
}

export function isConnected(id) {
  return handles.has(id);
}

export function clearSessionPassword(id) {
  sessionPasswords.delete(id);
}

export function isAuthError(conn, err) {
  if (getDriver(conn?.type).isAuthError(err)) return true;
  return /password/i.test(err.message || '') && /suppl|string|authentication/i.test(err.message || '');
}
