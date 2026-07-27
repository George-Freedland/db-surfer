import { useState } from 'react'
import type { Connection, ConnectionInput } from '../api'

const COLORS = [
  { value: null, label: 'None' },
  { value: '#4ade80', label: 'Green (local)' },
  { value: '#facc15', label: 'Yellow (staging)' },
  { value: '#f87171', label: 'Red (production)' },
  { value: '#60a5fa', label: 'Blue' },
]

interface Props {
  connection?: Connection
  onSave: (input: ConnectionInput, existingId?: string) => Promise<void>
  onClose: () => void
}

export default function ConnectionModal({ connection, onSave, onClose }: Props) {
  const [form, setForm] = useState({
    name: connection?.name ?? '',
    host: connection?.host ?? 'localhost',
    port: connection?.port ?? 5432,
    database: connection?.database ?? '',
    user: connection?.user ?? 'postgres',
    password: '',
    savePassword: connection?.hasSavedPassword ?? false,
    color: connection?.color ?? null,
    ssl: connection?.ssl ?? false,
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pasteUrl, setPasteUrl] = useState('')

  const set = (patch: Partial<typeof form>) => setForm((f) => ({ ...f, ...patch }))

  const applyUrl = (raw: string) => {
    setPasteUrl(raw)
    if (!/^postgres(ql)?:\/\//i.test(raw.trim())) return
    try {
      const url = new URL(raw.trim())
      set({
        host: url.hostname || 'localhost',
        port: url.port ? Number(url.port) : 5432,
        database: decodeURIComponent(url.pathname.replace(/^\//, '')) || 'postgres',
        user: decodeURIComponent(url.username) || 'postgres',
        password: decodeURIComponent(url.password),
        ssl: /sslmode=(require|verify)/i.test(url.search),
      })
    } catch {
      /* keep typing */
    }
  }

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    setError(null)
    try {
      await onSave(
        {
          ...form,
          port: Number(form.port) || 5432,
          password: form.password || undefined,
        },
        connection?.id
      )
    } catch (err) {
      setError((err as Error).message)
      setSaving(false)
    }
  }

  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <form className="modal" onSubmit={submit}>
        <h2>{connection ? 'Edit connection' : 'New connection'}</h2>

        <label>
          Paste a connection URL (optional)
          <input
            value={pasteUrl}
            onChange={(e) => applyUrl(e.target.value)}
            placeholder="postgresql://user:password@host:5432/dbname"
            autoComplete="off"
            spellCheck={false}
          />
        </label>

        <label>
          Name
          <input
            value={form.name}
            onChange={(e) => set({ name: e.target.value })}
            placeholder="labsesh local"
            autoFocus
          />
        </label>

        <div className="form-row">
          <label style={{ flex: 3 }}>
            Host
            <input value={form.host} onChange={(e) => set({ host: e.target.value })} placeholder="localhost" />
          </label>
          <label style={{ flex: 1 }}>
            Port
            <input
              value={form.port}
              onChange={(e) => set({ port: Number(e.target.value.replace(/\D/g, '')) })}
              inputMode="numeric"
            />
          </label>
        </div>

        <div className="form-row">
          <label>
            Database
            <input value={form.database} onChange={(e) => set({ database: e.target.value })} placeholder="labsesh" />
          </label>
          <label>
            User
            <input value={form.user} onChange={(e) => set({ user: e.target.value })} placeholder="postgres" />
          </label>
        </div>

        <label>
          Password
          <input
            type="password"
            value={form.password}
            onChange={(e) => set({ password: e.target.value })}
            placeholder={connection?.hasSavedPassword ? '(unchanged)' : 'optional'}
            autoComplete="new-password"
          />
        </label>

        <label className="checkbox-label">
          <input
            type="checkbox"
            checked={form.savePassword}
            onChange={(e) => set({ savePassword: e.target.checked })}
          />
          Save password on disk (unchecked = kept in memory for this session only)
        </label>

        <label className="checkbox-label">
          <input type="checkbox" checked={form.ssl} onChange={(e) => set({ ssl: e.target.checked })} />
          Use SSL (needed by most cloud databases)
        </label>

        <label>
          Environment color
          <div className="color-row">
            {COLORS.map((c) => (
              <button
                type="button"
                key={c.label}
                className={`color-swatch ${form.color === c.value ? 'selected' : ''}`}
                style={{ background: c.value ?? 'transparent' }}
                title={c.label}
                onClick={() => set({ color: c.value })}
              >
                {c.value ? '' : '∅'}
              </button>
            ))}
          </div>
        </label>

        {error && <div className="form-error">{error}</div>}

        <div className="modal-actions">
          <button type="button" className="ghost-button" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="primary-button" disabled={saving}>
            {saving ? 'Saving…' : connection ? 'Save changes' : 'Add connection'}
          </button>
        </div>
      </form>
    </div>
  )
}
