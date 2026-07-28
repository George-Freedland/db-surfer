import { useEffect, useState } from 'react'
import { api } from '../api'
import type { Connection, SchemaStats } from '../api'

interface Props {
  conn: Connection
  schemaName: string
  onClose: () => void
}

function formatBytes(n: number | null): string {
  if (n == null) return '—'
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  let v = n
  let i = 0
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024
    i++
  }
  return `${v >= 10 || i === 0 ? Math.round(v) : v.toFixed(1)} ${units[i]}`
}

export default function SchemaInfoModal({ conn, schemaName, onClose }: Props) {
  const [info, setInfo] = useState<SchemaStats | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    api
      .schemaInfo(conn.id, schemaName)
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
  }, [conn.id, schemaName])

  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal table-info-modal">
        <div className="docs-header">
          <h2>
            {conn.name} — {schemaName}
          </h2>
          <button className="icon-button" title="Close" onClick={onClose}>
            ✕
          </button>
        </div>

        {loading && <div className="tree-info">Loading schema details…</div>}
        {error && <div className="tree-error">{error}</div>}

        {info && (
          <div className="table-info-body">
            <section>
              <div className="schema-info-version">{info.serverVersion}</div>
              <div className="schema-info-stats">
                {info.stats.map((s) => (
                  <div key={s.label} className="schema-info-stat">
                    <div className="schema-info-stat-value">{s.value}</div>
                    <div className="schema-info-stat-label">{s.label}</div>
                  </div>
                ))}
              </div>
            </section>

            {info.tables.length > 0 && (
              <section>
                <h3 className="docs-group-title">Objects ({info.tables.length})</h3>
                <table className="info-table">
                  <thead>
                    <tr>
                      <th>Name</th>
                      <th>Kind</th>
                      <th>Rows (est.)</th>
                      <th>Size</th>
                    </tr>
                  </thead>
                  <tbody>
                    {info.tables.map((t) => (
                      <tr key={t.name}>
                        <td className="info-mono">{t.name}</td>
                        <td>{t.kind}</td>
                        <td className="info-mono">{t.rowEstimate == null ? '—' : t.rowEstimate.toLocaleString()}</td>
                        <td className="info-mono">{formatBytes(t.sizeBytes)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </section>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
