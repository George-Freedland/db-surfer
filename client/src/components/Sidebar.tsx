import { useCallback, useState } from 'react'
import { api } from '../api'
import type { ColumnInfo, Connection, ForeignKeyInfo, IndexInfo, ProcedureInfo, SchemaInfo, TableInfo } from '../api'
import ContextMenu from './ContextMenu'
import TableInfoModal from './TableInfoModal'
import SchemaInfoModal from './SchemaInfoModal'
import {
  genAddForeignKey,
  genCallProcedure,
  genCount,
  genCreateIndex,
  genCreateTable,
  genDelete,
  genDropForeignKey,
  genDropIndex,
  genDropTable,
  genInsert,
  genRecreateIndex,
  genSelect,
  genUpdate,
} from '../sqlgen'

function defaultSchema(conn: Connection, schema: SchemaInfo | null): string {
  if (schema) {
    const names = Object.keys(schema.schemas)
    if (names.includes('public')) return 'public'
    if (names.includes('dbo')) return 'dbo'
    if (names[0]) return names[0]
  }
  if (conn.type === 'mssql') return 'dbo'
  if (conn.type === 'mysql') return conn.database
  return 'public'
}

function createLabel(conn: Connection): string {
  if (conn.type === 'mongodb') return 'New collection'
  if (conn.type === 'redis') return 'New key'
  return 'New table'
}

interface Props {
  connections: Connection[]
  width: number
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
    <aside className="sidebar" style={{ width: props.width }}>
      <div className="sidebar-header">
        <span className="logo">
          <span className="logo-wave">~</span> DBSurfer
        </span>
        <span className="sidebar-header-actions">
          <button className="icon-button" title="New connection" onClick={props.onNewConnection}>
            +
          </button>
        </span>
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
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null)

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
      <div
        className={`conn-row ${conn.connected ? 'connected' : ''}`}
        onContextMenu={(e) => {
          e.preventDefault()
          setMenu({ x: e.clientX, y: e.clientY })
        }}
      >
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
          title={`${conn.type}: ${conn.host}:${conn.port}/${conn.database} as ${conn.user}`}
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
                procedures={schema.procedures?.[schemaName] || []}
                onOpenQueryTab={onOpenQueryTab}
                onAppendSql={onAppendSql}
                onRefreshSchema={loadSchema}
              />
            ))}
          {schema && Object.keys(schema.schemas).length === 0 && (
            <div className="tree-info">Nothing to browse</div>
          )}
        </div>
      )}
      {menu && (
        <ContextMenu
          x={menu.x}
          y={menu.y}
          onClose={() => setMenu(null)}
          items={[
            conn.connected
              ? { label: 'Disconnect', onClick: () => onDisconnect(conn) }
              : { label: 'Connect', onClick: () => onConnect(conn) },
            ...(conn.connected
              ? [
                  {
                    label: 'Refresh schema',
                    onClick: () => {
                      setExpanded(true)
                      loadSchema()
                    },
                  },
                ]
              : []),
            { separator: true, label: '' },
            { label: 'New SQL tab', onClick: () => onOpenQueryTab(conn.id, '') },
            {
              label: createLabel(conn),
              onClick: () =>
                onOpenQueryTab(conn.id, genCreateTable(conn.type, defaultSchema(conn, schema))),
            },
            { separator: true, label: '' },
            { label: 'Edit connection', onClick: () => onEditConnection(conn) },
            ...(conn.hasPassword
              ? [{ label: 'Clear stored credentials', onClick: () => onClearCredentials(conn) }]
              : []),
            { label: 'Delete connection', danger: true, onClick: () => onDelete(conn) },
          ]}
        />
      )}
    </div>
  )
}

function SchemaNode({
  conn,
  schemaName,
  tables,
  procedures,
  onOpenQueryTab,
  onAppendSql,
  onRefreshSchema,
}: {
  conn: Connection
  schemaName: string
  tables: { name: string; kind: string }[]
  procedures: ProcedureInfo[]
  onOpenQueryTab: Props['onOpenQueryTab']
  onAppendSql: Props['onAppendSql']
  onRefreshSchema: () => void
}) {
  const [expanded, setExpanded] = useState(schemaName === 'public' || schemaName === 'main')
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null)
  const [infoOpen, setInfoOpen] = useState(false)
  return (
    <div>
      <div
        className="tree-row schema-row"
        onClick={() => setExpanded((e) => !e)}
        onContextMenu={(e) => {
          e.preventDefault()
          setMenu({ x: e.clientX, y: e.clientY })
        }}
      >
        <span className="tree-toggle">{expanded ? '▾' : '▸'}</span>
        <span className="tree-icon">⛁</span>
        {schemaName}
        <span className="tree-count">{tables.length}</span>
      </div>
      {menu && (
        <ContextMenu
          x={menu.x}
          y={menu.y}
          onClose={() => setMenu(null)}
          items={[
            { label: 'Get info…', onClick: () => setInfoOpen(true) },
            { label: 'Refresh', onClick: onRefreshSchema },
            { separator: true, label: '' },
            {
              label: `${createLabel(conn)} in ${schemaName}`,
              onClick: () => onOpenQueryTab(conn.id, genCreateTable(conn.type, schemaName)),
            },
          ]}
        />
      )}
      {infoOpen && <SchemaInfoModal conn={conn} schemaName={schemaName} onClose={() => setInfoOpen(false)} />}
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
          {procedures.length > 0 && (
            <ProceduresFolder conn={conn} schemaName={schemaName} procedures={procedures} onAppendSql={onAppendSql} />
          )}
        </div>
      )}
    </div>
  )
}

const PROC_ICONS: Record<string, string> = {
  procedure: '⚙',
  function: 'ƒ',
  aggregate: 'Σ',
  window: '▤',
}

function ProceduresFolder({
  conn,
  schemaName,
  procedures,
  onAppendSql,
}: {
  conn: Connection
  schemaName: string
  procedures: ProcedureInfo[]
  onAppendSql: Props['onAppendSql']
}) {
  const [expanded, setExpanded] = useState(false)
  return (
    <div>
      <div className="tree-row schema-row" onClick={() => setExpanded((e) => !e)}>
        <span className="tree-toggle">{expanded ? '▾' : '▸'}</span>
        <span className="tree-icon">⚙</span>
        Procedures
        <span className="tree-count">{procedures.length}</span>
      </div>
      {expanded && (
        <div className="tree-children">
          {procedures.map((p) => (
            <div
              key={`${p.kind}:${p.name}`}
              className="tree-row column-row"
              title={`${p.kind} — click to insert a call template`}
              onClick={() => onAppendSql(genCallProcedure(conn.type, schemaName, p.name, p.kind))}
            >
              <span className="tree-icon">{PROC_ICONS[p.kind] || '⚙'}</span>
              {p.name}
              <span className="column-type">{p.kind}</span>
            </div>
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
  const [info, setInfo] = useState<TableInfo | null>(null)
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null)
  const [indexesOpen, setIndexesOpen] = useState(false)
  const [fksOpen, setFksOpen] = useState(false)
  const [infoModalOpen, setInfoModalOpen] = useState(false)
  const [idxMenu, setIdxMenu] = useState<{ x: number; y: number; index: IndexInfo | null } | null>(null)
  const [fkMenu, setFkMenu] = useState<{ x: number; y: number; fk: ForeignKeyInfo | null } | null>(null)

  const supportsIndexes = conn.type !== 'redis'
  const supportsFks = ['postgres', 'mysql', 'mssql', 'sqlite'].includes(conn.type)

  const refreshInfo = async () => {
    try {
      setInfo(await api.tableInfo(conn.id, schemaName, table.name))
    } catch {
      /* keep stale info */
    }
  }

  const fetchInfo = async (): Promise<TableInfo> => {
    if (info) return info
    try {
      const res = await api.tableInfo(conn.id, schemaName, table.name)
      setInfo(res)
      return res
    } catch {
      const empty: TableInfo = { columns: [], indexes: [], foreignKeys: [] }
      return empty
    }
  }

  const toggle = async () => {
    setExpanded((e) => !e)
    if (!info) await fetchInfo()
  }

  const appendWithColumns = async (gen: (cols: ColumnInfo[]) => string) => {
    const res = await fetchInfo()
    onAppendSql(gen(res.columns))
  }

  return (
    <div>
      <div
        className="tree-row table-row"
        onClick={toggle}
        onContextMenu={(e) => {
          e.preventDefault()
          setMenu({ x: e.clientX, y: e.clientY })
        }}
        title="Click to expand columns. Right-click for SQL generation."
      >
        <span className={`tree-toggle`}>{expanded ? '▾' : '▸'}</span>
        <span className={`tree-icon kind-${table.kind}`}>{KIND_ICONS[table.kind] || '▦'}</span>
        {table.name}
      </div>
      {expanded && info && (
        <div className="tree-children">
          {info.columns.map((c) => (
            <div
              key={c.name}
              className="tree-row column-row"
              title={`${c.type}${c.nullable ? ', nullable' : ''}${c.pk ? ', primary key' : ''}`}
            >
              <span className="tree-icon">{c.pk ? '🔑' : '•'}</span>
              {c.name}
              <span className="column-type">{c.type}</span>
            </div>
          ))}
          {supportsIndexes && (
            <div>
              <div
                className="tree-row schema-row"
                onClick={() => setIndexesOpen((o) => !o)}
                onContextMenu={(e) => {
                  e.preventDefault()
                  setIdxMenu({ x: e.clientX, y: e.clientY, index: null })
                }}
                title="Right-click to add an index"
              >
                <span className="tree-toggle">{indexesOpen ? '▾' : '▸'}</span>
                <span className="tree-icon">◆</span>
                Indexes
                <span className="tree-count">{info.indexes.length}</span>
              </div>
              {indexesOpen && (
                <div className="tree-children">
                  {info.indexes.length === 0 && <div className="tree-info">No indexes</div>}
                  {info.indexes.map((idx) => (
                    <div
                      key={idx.name}
                      className="tree-row column-row"
                      onContextMenu={(e) => {
                        e.preventDefault()
                        e.stopPropagation()
                        setIdxMenu({ x: e.clientX, y: e.clientY, index: idx })
                      }}
                      title={`${idx.columns.join(', ')}${idx.method ? ` — ${idx.method}` : ''}. Right-click to manage.`}
                    >
                      <span className="tree-icon">{idx.primary ? '🔑' : idx.unique ? '◇' : '◆'}</span>
                      {idx.name}
                      <span className="column-type">
                        {idx.primary ? 'primary' : idx.unique ? 'unique' : idx.clustered ? 'clustered' : 'index'}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
          {supportsFks && (
            <div>
              <div
                className="tree-row schema-row"
                onClick={() => setFksOpen((o) => !o)}
                onContextMenu={(e) => {
                  e.preventDefault()
                  setFkMenu({ x: e.clientX, y: e.clientY, fk: null })
                }}
                title="Right-click to add a foreign key"
              >
                <span className="tree-toggle">{fksOpen ? '▾' : '▸'}</span>
                <span className="tree-icon">⛓</span>
                Foreign keys
                <span className="tree-count">{info.foreignKeys.length}</span>
              </div>
              {fksOpen && (
                <div className="tree-children">
                  {info.foreignKeys.length === 0 && <div className="tree-info">No foreign keys</div>}
                  {info.foreignKeys.map((fk) => (
                    <div
                      key={fk.name}
                      className="tree-row column-row"
                      onContextMenu={(e) => {
                        e.preventDefault()
                        e.stopPropagation()
                        setFkMenu({ x: e.clientX, y: e.clientY, fk })
                      }}
                      title={`${fk.name}: ${fk.columns.join(', ')} → ${fk.refSchema}.${fk.refTable}(${fk.refColumns.join(', ')}). Right-click to manage.`}
                    >
                      <span className="tree-icon">⛓</span>
                      {fk.columns.join(', ')}
                      <span className="column-type">
                        → {fk.refTable}({fk.refColumns.join(', ')})
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}
      {idxMenu && (
        <ContextMenu
          x={idxMenu.x}
          y={idxMenu.y}
          onClose={() => setIdxMenu(null)}
          items={
            idxMenu.index
              ? [
                  {
                    label: 'New index…',
                    onClick: () =>
                      onAppendSql(
                        genCreateIndex(
                          conn.type,
                          schemaName,
                          table.name,
                          info?.columns.filter((c) => !c.pk).slice(0, 1).map((c) => c.name)
                        )
                      ),
                  },
                  ...(!idxMenu.index.primary
                    ? [
                        {
                          label: 'Edit index (drop & recreate)',
                          onClick: () => onAppendSql(genRecreateIndex(conn.type, schemaName, table.name, idxMenu.index!)),
                        },
                      ]
                    : []),
                  { separator: true, label: '' },
                  {
                    label: idxMenu.index.primary ? 'Drop primary key' : 'Drop index',
                    danger: true,
                    onClick: () => onAppendSql(genDropIndex(conn.type, schemaName, table.name, idxMenu.index!)),
                  },
                ]
              : [
                  {
                    label: 'New index…',
                    onClick: () =>
                      onAppendSql(
                        genCreateIndex(
                          conn.type,
                          schemaName,
                          table.name,
                          info?.columns.filter((c) => !c.pk).slice(0, 1).map((c) => c.name)
                        )
                      ),
                  },
                  { label: 'Refresh', onClick: refreshInfo },
                ]
          }
        />
      )}
      {fkMenu && (
        <ContextMenu
          x={fkMenu.x}
          y={fkMenu.y}
          onClose={() => setFkMenu(null)}
          items={
            fkMenu.fk
              ? [
                  {
                    label: 'Add foreign key…',
                    onClick: () => onAppendSql(genAddForeignKey(conn.type, schemaName, table.name)),
                  },
                  { separator: true, label: '' },
                  {
                    label: 'Drop foreign key',
                    danger: true,
                    onClick: () => onAppendSql(genDropForeignKey(conn.type, schemaName, table.name, fkMenu.fk!.name)),
                  },
                ]
              : [
                  {
                    label: 'Add foreign key…',
                    onClick: () => onAppendSql(genAddForeignKey(conn.type, schemaName, table.name)),
                  },
                  { label: 'Refresh', onClick: refreshInfo },
                ]
          }
        />
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
            {
              label: 'DROP TABLE',
              danger: true,
              onClick: () => onAppendSql(genDropTable(conn.type, schemaName, table.name)),
            },
            { separator: true, label: '' },
            {
              label: 'Open SELECT in new tab',
              onClick: () => onOpenQueryTab(conn.id, genSelect(conn.type, schemaName, table.name)),
            },
            {
              label: 'Info…',
              onClick: () => setInfoModalOpen(true),
            },
            { label: 'Refresh', onClick: refreshInfo },
          ]}
        />
      )}
      {infoModalOpen && (
        <TableInfoModal conn={conn} schemaName={schemaName} table={table} onClose={() => setInfoModalOpen(false)} />
      )}
    </div>
  )
}
