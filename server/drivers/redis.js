import { createClient } from 'redis';

export async function create(conn, password) {
  const client = createClient({
    socket: {
      host: conn.host,
      port: conn.port,
      connectTimeout: 8_000,
      tls: conn.ssl || undefined,
    },
    username: conn.user && conn.user !== 'default' ? conn.user : undefined,
    password: password || undefined,
    database: Number(conn.database) || 0,
  });
  client.on('error', () => {});
  await client.connect();
  return client;
}

export async function close(client) {
  await client.quit().catch(() => client.disconnect().catch(() => {}));
}

export async function test(client) {
  const info = await client.info('server');
  const version = /redis_version:([^\r\n]+)/.exec(info)?.[1] || '?';
  return `Redis ${version}`;
}

export async function getSchema(client) {
  const keys = [];
  // node-redis v5 scanIterator yields batches of keys per iteration
  for await (const batch of client.scanIterator({ COUNT: 200 })) {
    keys.push(...(Array.isArray(batch) ? batch : [batch]));
    if (keys.length >= 200) break;
  }
  keys.length = Math.min(keys.length, 200);
  keys.sort();
  const total = await client.dbSize();
  const label = total > keys.length ? `keys (${keys.length} of ${total})` : 'keys';
  return { schemas: { [label]: keys.map((k) => ({ name: k, kind: 'key' })) } };
}

export async function getColumns(client, _schema, key) {
  const type = await client.type(key);
  const ttl = await client.ttl(key);
  return [
    { name: 'type', type, nullable: false, default: null },
    { name: 'ttl', type: ttl === -1 ? 'none' : `${ttl}s`, nullable: false, default: null },
  ];
}

// Tokenize a Redis command line, honoring quoted strings.
function tokenize(line) {
  const tokens = [];
  const re = /"((?:\\.|[^"\\])*)"|'((?:\\.|[^'\\])*)'|(\S+)/g;
  let m;
  while ((m = re.exec(line))) {
    tokens.push(m[1] ?? m[2] ?? m[3]);
  }
  return tokens;
}

function toRows(reply) {
  if (reply === null) return [[null]];
  if (Array.isArray(reply)) return reply.map((v) => [v]);
  if (typeof reply === 'object') return Object.entries(reply).map(([k, v]) => [`${k}`, v]);
  return [[reply]];
}

// Each non-empty line is executed as one Redis command.
export async function query(client, text, maxRows) {
  const lines = text
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith('#') && !l.startsWith('//'));
  if (lines.length === 0) throw new Error('No Redis commands to run (one command per line, e.g. GET mykey)');

  const results = [];
  for (const line of lines) {
    const args = tokenize(line);
    const reply = await client.sendCommand(args);
    const rows = toRows(reply);
    const isPairs = rows.length > 0 && rows[0].length === 2;
    results.push({
      command: args[0].toUpperCase(),
      rowCount: Array.isArray(reply) ? reply.length : reply === null ? 0 : 1,
      fields: isPairs ? [{ name: 'field' }, { name: 'value' }] : [{ name: 'reply' }],
      rows: rows.slice(0, maxRows),
      truncated: rows.length > maxRows,
    });
  }
  return results;
}

export function isAuthError(err) {
  return /NOAUTH|WRONGPASS|invalid username-password|invalid password/i.test(err.message || '');
}
