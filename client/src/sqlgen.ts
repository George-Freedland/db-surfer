import type { ColumnInfo, DbType } from './api'

export function quoteIdent(type: DbType, name: string): string {
  switch (type) {
    case 'mysql':
      return `\`${name.replace(/`/g, '``')}\``
    case 'mssql':
      return `[${name.replace(/]/g, ']]')}]`
    default:
      return `"${name.replace(/"/g, '""')}"`
  }
}

export function qualify(type: DbType, schema: string, table: string): string {
  if (type === 'sqlite') return quoteIdent(type, table)
  return `${quoteIdent(type, schema)}.${quoteIdent(type, table)}`
}

function isAutoColumn(col: ColumnInfo): boolean {
  const def = (col.default || '').toLowerCase()
  return (
    def.includes('nextval') ||
    def.includes('auto_increment') ||
    def.includes('identity') ||
    (col.type || '').toLowerCase().includes('serial')
  )
}

export function dummyValue(type: DbType, col: ColumnInfo): string {
  const t = (col.type || '').toLowerCase()
  const name = col.name.toLowerCase()
  if (/bool/.test(t)) return type === 'mysql' || type === 'mssql' || type === 'sqlite' ? '1' : 'true'
  if (/int|serial|number|numeric|decimal|float|double|real|money/.test(t)) return '1'
  if (/timestamp|datetime/.test(t)) {
    if (type === 'postgres') return 'now()'
    if (type === 'mysql') return 'NOW()'
    if (type === 'mssql') return 'GETDATE()'
    return "datetime('now')"
  }
  if (/^date$/.test(t)) return "'2026-01-01'"
  if (/^time/.test(t)) return "'12:00:00'"
  if (/uuid/.test(t)) {
    if (type === 'postgres') return 'gen_random_uuid()'
    return "'00000000-0000-0000-0000-000000000000'"
  }
  if (/json/.test(t)) return "'{}'"
  if (/mail/.test(name)) return "'user@example.com'"
  return "'value'"
}

export function genSelect(type: DbType, schema: string, table: string): string {
  const target = qualify(type, schema, table)
  if (type === 'mongodb') return JSON.stringify({ find: table, filter: {}, limit: 100 }, null, 2)
  if (type === 'redis') return `GET ${table}`
  if (type === 'mssql') return `SELECT TOP 100 *\nFROM ${target};`
  return `SELECT *\nFROM ${target}\nLIMIT 100;`
}

export function genCount(type: DbType, schema: string, table: string): string {
  if (type === 'mongodb') return JSON.stringify({ count: table }, null, 2)
  if (type === 'redis') return `TYPE ${table}`
  return `SELECT COUNT(*) FROM ${qualify(type, schema, table)};`
}

export function genInsert(type: DbType, schema: string, table: string, columns: ColumnInfo[]): string {
  if (type === 'mongodb') {
    const doc: Record<string, unknown> = {}
    for (const col of columns) {
      if (col.name === '_id') continue
      doc[col.name] = 'value'
    }
    return JSON.stringify({ insert: table, documents: [doc] }, null, 2)
  }
  if (type === 'redis') return `SET ${table} "value"`

  const cols = columns.filter((c) => !isAutoColumn(c))
  const usable = cols.length > 0 ? cols : columns
  const names = usable.map((c) => quoteIdent(type, c.name)).join(', ')
  const values = usable.map((c) => dummyValue(type, c)).join(', ')
  return `INSERT INTO ${qualify(type, schema, table)} (${names})\nVALUES (${values});`
}

export function genUpdate(type: DbType, schema: string, table: string, columns: ColumnInfo[]): string {
  if (type === 'mongodb') {
    return JSON.stringify(
      { update: table, updates: [{ q: { _id: 'value' }, u: { $set: { field: 'value' } } }] },
      null,
      2
    )
  }
  if (type === 'redis') return `SET ${table} "new-value"`

  const keyCol = columns.find((c) => isAutoColumn(c) || /^(id|_id|uuid)$/i.test(c.name)) || columns[0]
  const setCols = columns.filter((c) => c !== keyCol)
  const usable = setCols.length > 0 ? setCols : columns
  const sets = usable.map((c) => `${quoteIdent(type, c.name)} = ${dummyValue(type, c)}`).join(',\n    ')
  const where = keyCol ? `${quoteIdent(type, keyCol.name)} = ${dummyValue(type, keyCol)}` : '/* condition */'
  return `UPDATE ${qualify(type, schema, table)}\nSET ${sets}\nWHERE ${where};`
}

export function genCreateTable(type: DbType, schema: string, table = 'new_table'): string {
  switch (type) {
    case 'mongodb':
      return JSON.stringify({ create: 'new_collection' }, null, 2)
    case 'redis':
      return 'SET new:key "value"'
    case 'mysql':
      return `CREATE TABLE ${qualify(type, schema, table)} (\n  id INT AUTO_INCREMENT PRIMARY KEY,\n  name VARCHAR(255) NOT NULL,\n  created_at DATETIME DEFAULT CURRENT_TIMESTAMP\n);`
    case 'mssql':
      return `CREATE TABLE ${qualify(type, schema, table)} (\n  id INT IDENTITY(1,1) PRIMARY KEY,\n  name NVARCHAR(255) NOT NULL,\n  created_at DATETIME2 DEFAULT SYSDATETIME()\n);`
    case 'sqlite':
      return `CREATE TABLE ${quoteIdent(type, table)} (\n  id INTEGER PRIMARY KEY AUTOINCREMENT,\n  name TEXT NOT NULL,\n  created_at TEXT DEFAULT (datetime('now'))\n);`
    default:
      return `CREATE TABLE ${qualify(type, schema, table)} (\n  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,\n  name TEXT NOT NULL,\n  created_at TIMESTAMPTZ DEFAULT now()\n);`
  }
}

export function genCallProcedure(type: DbType, schema: string, name: string, kind: string): string {
  const target = qualify(type, schema, name)
  if (kind === 'function' || kind === 'aggregate' || kind === 'window') {
    if (type === 'mssql') return `SELECT * FROM ${target}();`
    return `SELECT ${target}();`
  }
  if (type === 'mssql') return `EXEC ${target};`
  if (type === 'mysql') return `CALL ${target}();`
  return `CALL ${target}();`
}

export function genDropTable(type: DbType, schema: string, table: string): string {
  if (type === 'mongodb') return JSON.stringify({ drop: table }, null, 2)
  if (type === 'redis') return `DEL ${table}`
  return `DROP TABLE ${qualify(type, schema, table)};`
}

export function genDelete(type: DbType, schema: string, table: string, columns: ColumnInfo[]): string {
  if (type === 'mongodb') {
    return JSON.stringify({ delete: table, deletes: [{ q: { _id: 'value' }, limit: 1 }] }, null, 2)
  }
  if (type === 'redis') return `DEL ${table}`

  const keyCol = columns.find((c) => isAutoColumn(c) || /^(id|_id|uuid)$/i.test(c.name)) || columns[0]
  const where = keyCol ? `${quoteIdent(type, keyCol.name)} = ${dummyValue(type, keyCol)}` : '/* condition */'
  return `DELETE FROM ${qualify(type, schema, table)}\nWHERE ${where};`
}
