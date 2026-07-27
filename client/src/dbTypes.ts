import type { DbType } from './api'

export interface DbTypeInfo {
  label: string
  defaultPort: number
  /** Field labels/visibility differ per engine */
  fileBased?: boolean
  queryHint: string
}

export const DB_TYPES: Record<DbType, DbTypeInfo> = {
  postgres: {
    label: 'PostgreSQL',
    defaultPort: 5432,
    queryHint: '-- Write SQL here. Highlight lines and press ⌘⏎ to run just those.',
  },
  mysql: {
    label: 'MySQL / MariaDB',
    defaultPort: 3306,
    queryHint: '-- Write SQL here. Highlight lines and press ⌘⏎ to run just those.',
  },
  mssql: {
    label: 'SQL Server',
    defaultPort: 1433,
    queryHint: '-- Write T-SQL here. Highlight lines and press ⌘⏎ to run just those.',
  },
  sqlite: {
    label: 'SQLite',
    defaultPort: 0,
    fileBased: true,
    queryHint: '-- Write SQL here. Highlight lines and press ⌘⏎ to run just those.',
  },
  mongodb: {
    label: 'MongoDB',
    defaultPort: 27017,
    queryHint: '{"find": "collection", "filter": {}, "limit": 100}',
  },
  redis: {
    label: 'Redis',
    defaultPort: 6379,
    queryHint: '# One Redis command per line, e.g.\n# GET mykey',
  },
}

export const DEFAULT_PORTS = Object.fromEntries(
  Object.entries(DB_TYPES).map(([type, info]) => [type, info.defaultPort])
) as Record<DbType, number>

/** Map a connection-URL scheme to a DbType */
export function typeFromScheme(scheme: string): DbType | null {
  const s = scheme.toLowerCase().replace(/:$/, '')
  if (s === 'postgres' || s === 'postgresql') return 'postgres'
  if (s === 'mysql' || s === 'mariadb') return 'mysql'
  if (s === 'mssql' || s === 'sqlserver') return 'mssql'
  if (s === 'mongodb' || s === 'mongodb+srv') return 'mongodb'
  if (s === 'redis' || s === 'rediss') return 'redis'
  if (s === 'file' || s === 'sqlite') return 'sqlite'
  return null
}
