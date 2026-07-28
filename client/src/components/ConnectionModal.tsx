import { useRef, useState } from 'react'
import type { Connection, ConnectionInput, DbType } from '../api'
import { DB_TYPES, DEFAULT_PORTS, typeFromScheme } from '../dbTypes'

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
  onExport?: (connection: Connection) => void
}

export default function ConnectionModal({ connection, onSave, onClose, onExport }: Props) {
  const [form, setForm] = useState({
    name: connection?.name ?? '',
    type: (connection?.type ?? 'postgres') as DbType,
    host: connection?.host ?? 'localhost',
    port: connection?.port ?? 5432,
    database: connection?.database ?? '',
    user: connection?.user ?? '',
    password: '',
    savePassword: connection?.hasSavedPassword ?? false,
    color: connection?.color ?? null,
    ssl: connection?.ssl ?? false,
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [pasteUrl, setPasteUrl] = useState('')
  const fileInputRef = useRef<HTMLInputElement>(null)

  const set = (patch: Partial<typeof form>) => setForm((f) => ({ ...f, ...patch }))
  const typeInfo = DB_TYPES[form.type]

  const changeType = (type: DbType) => {
    const patch: Partial<typeof form> = { type }
    // Swap in the new engine's default port unless the user customized it
    if (!form.port || Object.values(DEFAULT_PORTS).includes(Number(form.port))) {
      patch.port = DEFAULT_PORTS[type]
    }
    set(patch)
  }

  const applyUrl = (raw: string) => {
    setPasteUrl(raw)
    const trimmed = raw.trim()
    const schemeMatch = /^([a-z+]+):\/\//i.exec(trimmed)
    if (!schemeMatch) return
    try {
      const url = new URL(trimmed)
      const type = typeFromScheme(url.protocol) ?? form.type
      set({
        type,
        host: url.hostname || 'localhost',
        port: url.port ? Number(url.port) : DEFAULT_PORTS[type],
        database: decodeURIComponent(url.pathname.replace(/^\//, '')) || '',
        user: decodeURIComponent(url.username),
        password: decodeURIComponent(url.password),
        ssl: /ssl(mode)?=(require|verify|true)|tls=true/i.test(url.search) || url.protocol === 'rediss:',
      })
    } catch {
      /* keep typing */
    }
  }

  const importFromFile = async (file: File) => {
    setError(null)
    setNotice(null)
    try {
      const parsed = JSON.parse(await file.text()) as unknown
      // Accept a bulk export ({connections: [...]}), a bare array, or a
      // single exported connection object.
      let list: Record<string, unknown>[]
      if (Array.isArray(parsed)) {
        list = parsed as Record<string, unknown>[]
      } else if (parsed && typeof parsed === 'object' && Array.isArray((parsed as { connections?: unknown }).connections)) {
        list = (parsed as { connections: Record<string, unknown>[] }).connections
      } else if (parsed && typeof parsed === 'object') {
        list = [parsed as Record<string, unknown>]
      } else {
        throw new Error('Not a DBSurfer connection file')
      }
      const first = list.find((c) => c && typeof c === 'object')
      if (!first) throw new Error('No connections found in this file')
      const type = (typeof first.type === 'string' && first.type in DB_TYPES ? first.type : 'postgres') as DbType
      set({
        name: typeof first.name === 'string' ? first.name : '',
        type,
        host: typeof first.host === 'string' ? first.host : 'localhost',
        port: Number(first.port) || DEFAULT_PORTS[type],
        database: typeof first.database === 'string' ? first.database : '',
        user: typeof first.user === 'string' ? first.user : '',
        password: typeof first.password === 'string' ? first.password : '',
        savePassword: typeof first.password === 'string' && first.password.length > 0,
        color: typeof first.color === 'string' ? first.color : null,
        ssl: Boolean(first.ssl),
      })
      if (list.length > 1) {
        setNotice(
          `This file contains ${list.length} connections; loaded the first one. Use Settings to import all of them at once.`
        )
      } else {
        setNotice(`Loaded "${typeof first.name === 'string' ? first.name : file.name}" from file. Review and save.`)
      }
    } catch (err) {
      setError(`Import failed: ${(err as Error).message}`)
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
          port: Number(form.port) || DEFAULT_PORTS[form.type],
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
          Database type
          <select
            className="modal-select"
            value={form.type}
            onChange={(e) => changeType(e.target.value as DbType)}
          >
            {Object.entries(DB_TYPES).map(([value, info]) => (
              <option key={value} value={value}>
                {info.label}
              </option>
            ))}
          </select>
        </label>

        {!typeInfo.fileBased && (
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
        )}

        <label>
          Name
          <input
            value={form.name}
            onChange={(e) => set({ name: e.target.value })}
            placeholder="labsesh local"
            autoFocus
          />
        </label>

        {!typeInfo.fileBased && (
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
        )}

        <div className="form-row">
          <label>
            {typeInfo.fileBased
              ? 'Database file path'
              : form.type === 'redis'
                ? 'DB index'
                : 'Database'}
            <input
              value={form.database}
              onChange={(e) => set({ database: e.target.value })}
              placeholder={
                typeInfo.fileBased ? '/path/to/data.sqlite' : form.type === 'redis' ? '0' : 'mydb'
              }
            />
          </label>
          {!typeInfo.fileBased && (
            <label>
              User
              <input
                value={form.user}
                onChange={(e) => set({ user: e.target.value })}
                placeholder={form.type === 'redis' ? 'default' : 'user'}
              />
            </label>
          )}
        </div>

        {!typeInfo.fileBased && (
          <>
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
              Use SSL/TLS (needed by most cloud databases)
            </label>
          </>
        )}

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
        {notice && <div className="form-notice">{notice}</div>}

        <div className="modal-actions">
          {connection && onExport ? (
            <button
              type="button"
              className="ghost-button"
              style={{ marginRight: 'auto' }}
              title="Download this connection as a JSON file"
              onClick={() => onExport(connection)}
            >
              Export…
            </button>
          ) : !connection ? (
            <>
              <button
                type="button"
                className="ghost-button"
                style={{ marginRight: 'auto' }}
                title="Fill this form from an exported connection file"
                onClick={() => fileInputRef.current?.click()}
              >
                Import…
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept=".json,application/json"
                style={{ display: 'none' }}
                onChange={(e) => {
                  const file = e.target.files?.[0]
                  if (file) importFromFile(file)
                  e.target.value = ''
                }}
              />
            </>
          ) : null}
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
