import { useState } from 'react'
import type { Connection } from '../api'

interface Props {
  connection: Connection
  error?: string
  onSubmit: (password: string, savePassword: boolean) => void
  onClose: () => void
}

export default function PasswordModal({ connection, error, onSubmit, onClose }: Props) {
  const [password, setPassword] = useState('')
  const [save, setSave] = useState(false)

  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <form
        className="modal modal-small"
        onSubmit={(e) => {
          e.preventDefault()
          onSubmit(password, save)
        }}
      >
        <h2>Password required</h2>
        <p className="modal-subtitle">
          {connection.user}@{connection.host}:{connection.port}/{connection.database}
        </p>
        <label>
          Password
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoFocus
            autoComplete="current-password"
          />
        </label>
        <label className="checkbox-label">
          <input type="checkbox" checked={save} onChange={(e) => setSave(e.target.checked)} />
          Save password on disk
        </label>
        {error && <div className="form-error">{error}</div>}
        <div className="modal-actions">
          <button type="button" className="ghost-button" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="primary-button">
            Connect
          </button>
        </div>
      </form>
    </div>
  )
}
