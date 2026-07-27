import { useCallback, useState } from 'react'
import { api } from '../api'
import type { ColumnInfo, Connection, SchemaInfo } from '../api'

interface Props {
  connections: Connection[]
  onNewConnection: () => void
  onEditConnection: (c: Connection) => void
  onConnect: (c: Connection) => Promise<boolean> | boolean
  onDisconnect: (c: Connection) => void
  onClearCredentials: (c: Connection) => void
  onDelete: (c: Connection) => void
  onOpenTable: (connectionId: string, schema: string, table: string) => void
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
  onOpenTable,
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
        <button className="conn-name" onClick={toggle} title={`${conn.host}:${conn.port}/${conn.database} as ${conn.user}`}>
          {conn.name}
          <span className="conn-detail">
            {conn.host}:{conn.port}/{conn.database}
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
                connId={conn.id}
                schemaName={schemaName}
                tables={tables}
                onOpenTable={onOpenTable}
              />
            ))}
          {schema && Object.keys(schema.schemas).length === 0 && (
            <div className="tree-info">No user tables</div>
          )}
        </div>
      )}
    </div>
  )
}

function SchemaNode({
  connId,
  schemaName,
  tables,
  onOpenTable,
}: {
  connId: string
  schemaName: string
  tables: { name: string; kind: string }[]
  onOpenTable: Props['onOpenTable']
}) {
  const [expanded, setExpanded] = useState(schemaName === 'public')
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
              connId={connId}
              schemaName={schemaName}
              table={t}
              onOpenTable={onOpenTable}
            />
          ))}
        </div>
      )}
    </div>
  )
}

function TableNode({
  connId,
  schemaName,
  table,
  onOpenTable,
}: {
  connId: string
  schemaName: string
  table: { name: string; kind: string }
  onOpenTable: Props['onOpenTable']
}) {
  const [expanded, setExpanded] = useState(false)
  const [columns, setColumns] = useState<ColumnInfo[] | null>(null)

  const toggle = async () => {
    setExpanded((e) => !e)
    if (!columns) {
      try {
        const res = await api.columns(connId, schemaName, table.name)
        setColumns(res.columns)
      } catch {
        setColumns([])
      }
    }
  }

  return (
    <div>
      <div
        className="tree-row table-row"
        onClick={toggle}
        onDoubleClick={() => onOpenTable(connId, schemaName, table.name)}
        title="Double-click to open a SELECT in a new tab"
      >
        <span className="tree-toggle">{expanded ? '▾' : '▸'}</span>
        <span className={`tree-icon kind-${table.kind}`}>{table.kind === 'view' ? '◫' : '▦'}</span>
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
    </div>
  )
}
