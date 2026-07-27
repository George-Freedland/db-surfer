import { MongoClient } from 'mongodb';

export async function create(conn, password) {
  const auth = conn.user
    ? `${encodeURIComponent(conn.user)}:${encodeURIComponent(password || '')}@`
    : '';
  const url = `mongodb://${auth}${conn.host}:${conn.port}/?authSource=admin${conn.ssl ? '&tls=true&tlsAllowInvalidCertificates=true' : ''}`;
  const client = new MongoClient(url, { serverSelectionTimeoutMS: 8_000 });
  await client.connect();
  return { client, dbName: conn.database || 'test' };
}

export async function close({ client }) {
  await client.close().catch(() => {});
}

export async function test({ client }) {
  const info = await client.db('admin').command({ buildInfo: 1 });
  return `MongoDB ${info.version}`;
}

export async function getSchema({ client, dbName }) {
  const collections = await client.db(dbName).listCollections().toArray();
  collections.sort((a, b) => a.name.localeCompare(b.name));
  return {
    schemas: {
      [dbName]: collections.map((c) => ({
        name: c.name,
        kind: c.type === 'view' ? 'view' : 'collection',
      })),
    },
  };
}

export async function getColumns({ client, dbName }, _schema, collection) {
  const doc = await client.db(dbName).collection(collection).findOne();
  if (!doc) return [];
  return Object.entries(doc).map(([name, value]) => ({
    name,
    type: value === null ? 'null' : Array.isArray(value) ? 'array' : typeof value === 'object' ? value.constructor?.name || 'object' : typeof value,
    nullable: true,
    default: null,
  }));
}

// Queries are JSON command documents run against the connection's database,
// e.g. {"find": "users", "filter": {"age": {"$gt": 21}}, "limit": 50}
export async function query({ client, dbName }, text, maxRows) {
  let command;
  try {
    command = JSON.parse(text);
  } catch {
    throw new Error(
      'MongoDB queries must be a JSON command document, e.g. {"find": "users", "filter": {}, "limit": 50}. See db.runCommand docs.'
    );
  }
  const result = await client.db(dbName).command(command);
  const commandName = Object.keys(command)[0] || 'command';

  if (result.cursor && Array.isArray(result.cursor.firstBatch)) {
    const docs = result.cursor.firstBatch;
    if (result.cursor.id && result.cursor.id !== 0n && Number(result.cursor.id) !== 0) {
      try {
        await client.db(dbName).command({ killCursors: result.cursor.ns.split('.').slice(1).join('.'), cursors: [result.cursor.id] });
      } catch {
        /* best effort */
      }
    }
    const columns = [];
    for (const doc of docs) {
      for (const key of Object.keys(doc)) {
        if (!columns.includes(key)) columns.push(key);
      }
    }
    return [
      {
        command: commandName.toUpperCase(),
        rowCount: docs.length,
        fields: columns.map((name) => ({ name })),
        rows: docs.slice(0, maxRows).map((doc) => columns.map((c) => (doc[c] === undefined ? null : doc[c]))),
        truncated: docs.length > maxRows,
      },
    ];
  }

  return [
    {
      command: commandName.toUpperCase(),
      rowCount: result.n ?? result.nModified ?? (result.ok ? 1 : 0),
      fields: [{ name: 'result' }],
      rows: [[result]],
      truncated: false,
    },
  ];
}

export function isAuthError(err) {
  return err.code === 18 || err.codeName === 'AuthenticationFailed';
}
