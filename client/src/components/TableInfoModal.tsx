import { useEffect, useState } from 'react'
import { api } from '../api'
import type { Connection, TableInfo } from '../api'

interface Props {
  conn: Connection
  schemaName: string
  table: { name: string; kind: string }
  onClose: () => void
}

function sizeLabel(col: TableInfo['columns'][number]): string {
  if (col.maxLength != null) return String(col.maxLength)
  if (col.precision != null) return col.scale != null ? `${col.precision},${col.scale}` : String(col.precision)
  return '—'
}

export default function TableInfoModal({ conn, schemaName, table, onClose }: Props) {
  const [info, setInfo] = useState<TableInfo | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    api
      .tableInfo(conn.id, schemaName, table.name)
      .then((res) => {
        if (!cancelled) setInfo(res)
      })
      .catch((err) => {
        if (!cancelled) setError((err as Error).message)
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [conn.id, schemaName, table.name])

  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal table-info-modal">
        <div className="docs-header">
          <h2>
            {schemaName}.{table.name}
          </h2>
          <button className="icon-button" title="Close" onClick={onClose}>
            ✕
          </button>
        </div>

        {loading && <div className="tree-info">Loading metadata…</div>}
        {error && <div className="tree-error">{error}</div>}

        {info && (
          <div className="table-info-body">
            <section>
              <h3 className="docs-group-title">Columns ({info.columns.length})</h3>
              <table className="info-table">
                <thead>
                  <tr>
                    <th></th>
                    <th>Name</th>
                    <th>Type</th>
                    <th>Size</th>
                    <th>Nullable</th>
                    <th>Default</th>
                  </tr>
                </thead>
                <tbody>
                  {info.columns.map((c) => (
                    <tr key={c.name}>
                      <td className="info-pk-cell">{c.pk ? <span title="Primary key">🔑</span> : null}</td>
                      <td className="info-mono">{c.name}</td>
                      <td className="info-mono">{c.type}</td>
                      <td className="info-mono">{sizeLabel(c)}</td>
                      <td>{c.nullable ? 'yes' : 'no'}</td>
                      <td className="info-mono">{c.default ?? '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>

            <section>
              <h3 className="docs-group-title">Indexes ({info.indexes.length})</h3>
              {info.indexes.length === 0 ? (
                <div className="tree-info">No indexes</div>
              ) : (
                <table className="info-table">
                  <thead>
                    <tr>
                      <th>Name</th>
                      <th>Columns</th>
                      <th>Type</th>
                      <th>Method</th>
                    </tr>
                  </thead>
                  <tbody>
                    {info.indexes.map((idx) => (
                      <tr key={idx.name}>
                        <td className="info-mono">{idx.name}</td>
                        <td className="info-mono">{idx.columns.join(', ')}</td>
                        <td>
                          {idx.primary ? 'Primary key' : idx.unique ? 'Unique' : 'Index'}
                          {idx.clustered ? ' (clustered)' : idx.clustered === false ? ' (unclustered)' : ''}
                        </td>
                        <td className="info-mono">{idx.method || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </section>

            <section>
              <h3 className="docs-group-title">Foreign keys ({info.foreignKeys.length})</h3>
              {info.foreignKeys.length === 0 ? (
                <div className="tree-info">No foreign keys</div>
              ) : (
                <table className="info-table">
                  <thead>
                    <tr>
                      <th>Name</th>
                      <th>Columns</th>
                      <th>References</th>
                    </tr>
                  </thead>
                  <tbody>
                    {info.foreignKeys.map((fk) => (
                      <tr key={fk.name}>
                        <td className="info-mono">{fk.name}</td>
                        <td className="info-mono">{fk.columns.join(', ')}</td>
                        <td className="info-mono">
                          {fk.refSchema}.{fk.refTable}({fk.refColumns.join(', ')})
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </section>
          </div>
        )}
      </div>
    </div>
  )
}
