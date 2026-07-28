import { useState } from 'react'
import { api } from '../api'
import type { Connection } from '../api'
import { downloadFile } from '../exportUtils'

interface Props {
  hasSavedPasswords: boolean
  connection?: Connection | null
  onClose: () => void
}

function slug(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'connection'
}

export default function ExportSettingsModal({ hasSavedPasswords, connection, onClose }: Props) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const doExport = async (includePasswords: boolean) => {
    setBusy(true)
    setError(null)
    try {
      const data = await api.exportSettings(includePasswords, connection?.id)
      const filename = connection
        ? `dbsurfer-connection-${slug(connection.name)}.json`
        : 'dbsurfer-connections.json'
      downloadFile(filename, JSON.stringify(data, null, 2), 'application/json')
      onClose()
    } catch (err) {
      setError((err as Error).message)
      setBusy(false)
    }
  }

  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal modal-small">
        <h2>{connection ? `Export "${connection.name}"` : 'Export connection settings'}</h2>
        <p className="modal-subtitle" style={{ fontFamily: 'inherit' }}>
          {connection
            ? 'Downloads this connection (name, type, host, port, database, user, color, SSL) as a JSON file. Import it on another machine via Settings or the New connection form.'
            : 'Downloads all connections (name, type, host, port, database, user, color, SSL) as a JSON file you can import on another machine or share with your team.'}
        </p>
        {hasSavedPasswords && (
          <p className="export-warning">
            {connection
              ? 'This connection has a password saved on disk. Including it stores the password in plain text inside the exported file.'
              : "Some connections have passwords saved on disk. Including them stores the passwords in plain text inside the exported file — only do this if you're sharing privately."}
          </p>
        )}
        {error && <div className="form-error">{error}</div>}
        <div className="modal-actions" style={{ flexDirection: 'column', alignItems: 'stretch', gap: 8 }}>
          <button className="primary-button" disabled={busy} onClick={() => doExport(false)}>
            Export without passwords (recommended)
          </button>
          {hasSavedPasswords && (
            <button className="danger-outline-button" disabled={busy} onClick={() => doExport(true)}>
              Export with passwords
            </button>
          )}
          <button className="ghost-button" onClick={onClose}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  )
}
