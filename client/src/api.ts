export type DbType = 'postgres' | 'mysql' | 'mssql' | 'sqlite' | 'mongodb' | 'redis'

export interface Connection {
  id: string
  name: string
  type: DbType
  host: string
  port: number
  database: string
  user: string
  color: string | null
  ssl?: boolean
  hasSavedPassword: boolean
  hasPassword: boolean
  connected: boolean
  serverVersion?: string
}

export interface ConnectionInput {
  name: string
  type: DbType
  host: string
  port: number
  database: string
  user: string
  password?: string
  savePassword?: boolean
  color?: string | null
  ssl?: boolean
}

export interface QueryField {
  name: string
  dataTypeID: number
}

export interface QueryResult {
  command: string
  rowCount: number | null
  fields: QueryField[]
  rows: unknown[][]
  truncated: boolean
}

export interface QueryResponse {
  results: QueryResult[]
  durationMs: number
}

export interface SchemaInfo {
  schemas: Record<string, { name: string; kind: string }[]>
}

export interface ColumnInfo {
  name: string
  type: string
  nullable: boolean
  default: string | null
}

export interface CompletionInfo {
  schema: Record<string, string[]>
  tables: string[]
  columns: string[]
}

export interface ImportResult {
  added: number
  updated: number
  skipped: number
  connections: Connection[]
}

export class ApiError extends Error {
  code?: string
  position?: number
  status: number
  constructor(message: string, status: number, code?: string, position?: number) {
    super(message)
    this.status = status
    this.code = code
    this.position = position
  }
}

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  })
  const body = await res.json().catch(() => ({}))
  if (!res.ok) {
    throw new ApiError(body.error || res.statusText, res.status, body.code, body.position)
  }
  return body as T
}

export const api = {
  listConnections: () => request<Connection[]>('/api/connections'),
  createConnection: (input: ConnectionInput) =>
    request<Connection>('/api/connections', { method: 'POST', body: JSON.stringify(input) }),
  updateConnection: (id: string, input: Partial<ConnectionInput>) =>
    request<Connection>(`/api/connections/${id}`, { method: 'PUT', body: JSON.stringify(input) }),
  deleteConnection: (id: string) =>
    request<{ ok: boolean }>(`/api/connections/${id}`, { method: 'DELETE' }),
  clearCredentials: (id: string) =>
    request<Connection>(`/api/connections/${id}/clear-credentials`, { method: 'POST' }),
  connect: (id: string, password?: string, savePassword?: boolean) =>
    request<Connection>(`/api/connections/${id}/connect`, {
      method: 'POST',
      body: JSON.stringify({ password, savePassword }),
    }),
  disconnect: (id: string) =>
    request<{ ok: boolean }>(`/api/connections/${id}/disconnect`, { method: 'POST' }),
  schema: (id: string) => request<SchemaInfo>(`/api/connections/${id}/schema`),
  columns: (id: string, schema: string, table: string) =>
    request<{ columns: ColumnInfo[] }>(
      `/api/connections/${id}/columns?schema=${encodeURIComponent(schema)}&table=${encodeURIComponent(table)}`
    ),
  completion: (id: string) => request<CompletionInfo>(`/api/connections/${id}/completion`),
  exportSettings: (includePasswords: boolean) =>
    request<{ connections: unknown[] }>(
      `/api/connections/export${includePasswords ? '?includePasswords=1' : ''}`
    ),
  importSettings: (payload: unknown, replaceExisting: boolean) =>
    request<ImportResult>('/api/connections/import', {
      method: 'POST',
      body: JSON.stringify(
        Array.isArray(payload)
          ? { connections: payload, replaceExisting }
          : { ...(payload as object), replaceExisting }
      ),
    }),
  query: (id: string, sql: string) =>
    request<QueryResponse>(`/api/connections/${id}/query`, {
      method: 'POST',
      body: JSON.stringify({ sql }),
    }),
}
