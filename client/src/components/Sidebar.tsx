import { useCallback, useState } from 'react'
import { api } from '../api'
import type { ColumnInfo, Connection, SchemaInfo } from '../api'
import ContextMenu from './ContextMenu'
import { genCount, genDelete, genInsert, genSelect, genUpdate } from '../sqlgen'

interface Props {
  connections: Connection[]
  onNewConnection: () => void
  onEditConnection: (c: Connection) => void
  onConnect: (c: Connection) => Promise<boolean> | boolean
  onDisconnect: (c: Connection) => void
  onClearCredentials: (c: Connection) => void
  onDelete: (c: Connection) => void
  onOpenQueryTab: (connectionId: string, sql: string) => void
  onAppendSql: (sql: string) => void
  onRefresh: () => void
}

export default function Sidebar(props: Props) {
  return (
    <aside className="sidebar">
      <div className="sidebar-header">
        <span className="logo">
          <span className="logo-wave">~</span> DBSurfer
        </span>
        <button className="icon-button" title="New connection" onClick={props.onNewConnection}>
          +
        </button>
      </div>
      <div className="sidebar-body">
        {props.connections.length === 0 && (
          <div className="sidebar-empty">
            <p>No connections yet.</p>
            <button className="primary-button" onClick={props.onNewConnection}>
              Add a database
            </button>
          </div>
        )}
        {props.connections.map((conn) => (
          <ConnectionNode key={conn.id} conn={conn} {...props} />
        ))}
      </div>
    </aside>
  )
}

function ConnectionNode({
  conn,
  onEditConnection,
  onConnect,
  onDisconnect,
  onClearCredentials,
  onDelete,
  onOpenQueryTab,
  onAppendSql,
}: Props & { conn: Connection }) {
  const [expanded, setExpanded] = useState(false)
  const [schema, setSchema] = useState<SchemaInfo | null>(null)
  const [loading, setLoading] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)

  const loadSchema = useCallback(async () => {
    setLoading(true)
    setLoadError(null)
    try {
      setSchema(await api.schema(conn.id))
    } catch (err) {
      setLoadError((err as Error).message)
    } finally {
      setLoading(false)
    }
  }, [conn.id])

  const toggle = async () => {
    if (expanded) {
      setExpanded(false)
      return
    }
    setExpanded(true)
    if (!conn.connected) {
      const ok = await onConnect(conn)
      if (!ok) {
        setExpanded(false)
        return
      }
    }
    if (!schema) loadSchema()
  }

  return (
    <div className="conn-node">
      <div className={`conn-row ${conn.connected ? 'connected' : ''}`}>
        <button className="tree-toggle" onClick={toggle}>
          {expanded ? '▾' : '▸'}
        </button>
        <span
          className={`status-dot ${conn.connected ? 'on' : 'off'}`}
          style={conn.color ? { boxShadow: `0 0 0 2px ${conn.color}44` } : undefined}
          title={conn.connected ? 'Connected' : 'Disconnected'}
        />
        <button
          className="conn-name"
          onClick={toggle}
          title={`${conn.type} — ${conn.host}:${conn.port}/${conn.database} as ${conn.user}`}
        >
          {conn.name}
          <span className="conn-detail">
            {conn.type === 'sqlite' ? conn.database : `${conn.host}:${conn.port}/${conn.database}`}
          </span>
        </button>
        <span className="conn-actions">
          {conn.connected ? (
            <button className="icon-button" title="Disconnect" onClick={() => onDisconnect(conn)}>
              ⏻
            </button>
          ) : (
            <button className="icon-button" title="Connect" onClick={() => onConnect(conn)}>
              ▶
            </button>
          )}
          <button className="icon-button" title="Edit connection" onClick={() => onEditConnection(conn)}>
            ✎
          </button>
          {conn.hasPassword && (
            <button
              className="icon-button"
              title="Clear stored credentials"
              onClick={() => onClearCredentials(conn)}
            >
              🔒
            </button>
          )}
          <button className="icon-button danger" title="Delete connection" onClick={() => onDelete(conn)}>
            ✕
          </button>
        </span>
      </div>
      {expanded && (
        <div className="tree-children">
          {loading && <div className="tree-info">Loading schema…</div>}
          {loadError && (
            <div className="tree-error">
              {loadError} <button className="link-button" onClick={loadSchema}>retry</button>
            </div>
          )}
          {schema &&
            Object.entries(schema.schemas).map(([schemaName, tables]) => (
              <SchemaNode
                key={schemaName}
                conn={conn}
                schemaName={schemaName}
                tables={tables}
                onOpenQueryTab={onOpenQueryTab}
                onAppendSql={onAppendSql}
              />
            ))}
          {schema && Object.keys(schema.schemas).length === 0 && (
            <div className="tree-info">Nothing to browse</div>
          )}
        </div>
      )}
    </div>
  )
}

function SchemaNode({
  conn,
  schemaName,
  tables,
  onOpenQueryTab,
  onAppendSql,
}: {
  conn: Connection
  schemaName: string
  tables: { name: string; kind: string }[]
  onOpenQueryTab: Props['onOpenQueryTab']
  onAppendSql: Props['onAppendSql']
}) {
  const [expanded, setExpanded] = useState(schemaName === 'public' || schemaName === 'main')
  return (
    <div>
      <div className="tree-row schema-row" onClick={() => setExpanded((e) => !e)}>
        <span className="tree-toggle">{expanded ? '▾' : '▸'}</span>
        <span className="tree-icon">⛁</span>
        {schemaName}
        <span className="tree-count">{tables.length}</span>
      </div>
      {expanded && (
        <div className="tree-children">
          {tables.map((t) => (
            <TableNode
              key={t.name}
              conn={conn}
              schemaName={schemaName}
              table={t}
              onOpenQueryTab={onOpenQueryTab}
              onAppendSql={onAppendSql}
            />
          ))}
        </div>
      )}
    </div>
  )
}

const KIND_ICONS: Record<string, string> = {
  view: '◫',
  collection: '⬡',
  key: '⚿',
}

function TableNode({
  conn,
  schemaName,
  table,
  onOpenQueryTab,
  onAppendSql,
}: {
  conn: Connection
  schemaName: string
  table: { name: string; kind: string }
  onOpenQueryTab: Props['onOpenQueryTab']
  onAppendSql: Props['onAppendSql']
}) {
  const [expanded, setExpanded] = useState(false)
  const [columns, setColumns] = useState<ColumnInfo[] | null>(null)
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null)

  const fetchColumns = async (): Promise<ColumnInfo[]> => {
    if (columns) return columns
    try {
      const res = await api.columns(conn.id, schemaName, table.name)
      setColumns(res.columns)
      return res.columns
    } catch {
      return []
    }
  }

  const toggle = async () => {
    setExpanded((e) => !e)
    if (!columns) await fetchColumns()
  }

  const appendWithColumns = async (
    gen: (cols: ColumnInfo[]) => string
  ) => {
    const cols = await fetchColumns()
    onAppendSql(gen(cols))
  }

  return (
    <div>
      <div
        className="tree-row table-row"
        onClick={toggle}
        onDoubleClick={() => onOpenQueryTab(conn.id, genSelect(conn.type, schemaName, table.name))}
        onContextMenu={(e) => {
          e.preventDefault()
          setMenu({ x: e.clientX, y: e.clientY })
        }}
        title="Double-click to open a SELECT in a new tab. Right-click for SQL generation."
      >
        <span className={`tree-toggle`}>{expanded ? '▾' : '▸'}</span>
        <span className={`tree-icon kind-${table.kind}`}>{KIND_ICONS[table.kind] || '▦'}</span>
        {table.name}
      </div>
      {expanded && columns && (
        <div className="tree-children">
          {columns.map((c) => (
            <div key={c.name} className="tree-row column-row" title={`${c.type}${c.nullable ? ', nullable' : ''}`}>
              <span className="tree-icon">•</span>
              {c.name}
              <span className="column-type">{c.type}</span>
            </div>
          ))}
        </div>
      )}
      {menu && (
        <ContextMenu
          x={menu.x}
          y={menu.y}
          onClose={() => setMenu(null)}
          items={[
            {
              label: 'SELECT everything',
              onClick: () => onAppendSql(genSelect(conn.type, schemaName, table.name)),
            },
            {
              label: 'COUNT rows',
              onClick: () => onAppendSql(genCount(conn.type, schemaName, table.name)),
            },
            { separator: true, label: '' },
            {
              label: 'INSERT with dummy values',
              onClick: () => appendWithColumns((cols) => genInsert(conn.type, schemaName, table.name, cols)),
            },
            {
              label: 'UPDATE with dummy values',
              onClick: () => appendWithColumns((cols) => genUpdate(conn.type, schemaName, table.name, cols)),
            },
            {
              label: 'DELETE row',
              danger: true,
              onClick: () => appendWithColumns((cols) => genDelete(conn.type, schemaName, table.name, cols)),
            },
            { separator: true, label: '' },
            {
              label: 'Open SELECT in new tab',
              onClick: () => onOpenQueryTab(conn.id, genSelect(conn.type, schemaName, table.name)),
            },
          ]}
        />
      )}
    </div>
  )
}
