import Database from 'better-sqlite3';

export async function create(conn) {
  if (!conn.database) throw new Error('SQLite connections need a database file path');
  return new Database(conn.database);
}

export async function close(db) {
  db.close();
}

export async function test(db) {
  const { v } = db.prepare('SELECT sqlite_version() AS v').get();
  return `SQLite ${v}`;
}

export async function getSchema(db) {
  const rows = db
    .prepare(
      `SELECT name, type FROM sqlite_master
       WHERE type IN ('table', 'view') AND name NOT LIKE 'sqlite_%'
       ORDER BY name`
    )
    .all();
  return { schemas: { main: rows.map((r) => ({ name: r.name, kind: r.type })) } };
}

export async function getColumns(db, _schema, table) {
  const rows = db.prepare(`PRAGMA table_info("${table.replace(/"/g, '""')}")`).all();
  return rows.map((r) => ({
    name: r.name,
    type: r.type || 'any',
    nullable: !r.notnull,
    default: r.dflt_value,
  }));
}

// Split a script into statements, respecting quotes and comments.
function splitStatements(text) {
  const statements = [];
  let current = '';
  let i = 0;
  while (i < text.length) {
    const ch = text[i];
    const two = text.slice(i, i + 2);
    if (ch === "'" || ch === '"') {
      const quote = ch;
      current += ch;
      i++;
      while (i < text.length) {
        current += text[i];
        if (text[i] === quote) {
          if (text[i + 1] === quote) {
            current += text[++i];
          } else {
            i++;
            break;
          }
        }
        i++;
      }
      continue;
    }
    if (two === '--') {
      while (i < text.length && text[i] !== '\n') current += text[i++];
      continue;
    }
    if (two === '/*') {
      while (i < text.length && text.slice(i, i + 2) !== '*/') current += text[i++];
      current += '*/';
      i += 2;
      continue;
    }
    if (ch === ';') {
      statements.push(current);
      current = '';
      i++;
      continue;
    }
    current += ch;
    i++;
  }
  if (current.trim()) statements.push(current);
  return statements.map((s) => s.trim()).filter(Boolean);
}

export async function query(db, text, maxRows) {
  const results = [];
  for (const statement of splitStatements(text)) {
    const stmt = db.prepare(statement);
    if (stmt.reader) {
      const rows = stmt.raw().all();
      results.push({
        command: 'SELECT',
        rowCount: rows.length,
        fields: stmt.columns().map((c) => ({ name: c.name })),
        rows: rows.slice(0, maxRows),
        truncated: rows.length > maxRows,
      });
    } else {
      const info = stmt.run();
      results.push({
        command: 'OK',
        rowCount: info.changes,
        fields: [],
        rows: [],
        truncated: false,
      });
    }
  }
  return results;
}

export function isAuthError() {
  return false;
}
