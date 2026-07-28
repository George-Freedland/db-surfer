import { useEffect, useState } from 'react'
import { api } from '../api'
import type { AiConfig, AiProvider } from '../api'

interface Props {
  onClose: () => void
  onExportSettings: () => void
  onImportSettings: () => void
  onAiConfigChanged: (config: AiConfig) => void
}

export default function SettingsModal({ onClose, onExportSettings, onImportSettings, onAiConfigChanged }: Props) {
  const [config, setConfig] = useState<AiConfig | null>(null)
  const [error, setError] = useState<string | null>(null)

  // add-key form state
  const [adding, setAdding] = useState(false)
  const [provider, setProvider] = useState<AiProvider>('openai')
  const [apiKey, setApiKey] = useState('')
  const [models, setModels] = useState<string[] | null>(null)
  const [model, setModel] = useState('')
  const [loadingModels, setLoadingModels] = useState(false)
  const [saving, setSaving] = useState(false)

  const refresh = async () => {
    try {
      const c = await api.aiConfig()
      setConfig(c)
      onAiConfigChanged(c)
    } catch (err) {
      setError((err as Error).message)
    }
  }

  useEffect(() => {
    refresh()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const resetForm = () => {
    setAdding(false)
    setApiKey('')
    setModels(null)
    setModel('')
    setError(null)
  }

  const loadModels = async () => {
    if (!apiKey.trim()) {
      setError('Enter the API key first')
      return
    }
    setLoadingModels(true)
    setError(null)
    try {
      const res = await api.aiListModels({ provider, apiKey: apiKey.trim() })
      setModels(res.models)
      setModel(res.models[0] || '')
    } catch (err) {
      setError(`Could not fetch models: ${(err as Error).message}`)
      setModels(null)
    } finally {
      setLoadingModels(false)
    }
  }

  const saveKey = async () => {
    if (!apiKey.trim() || !model) return
    setSaving(true)
    setError(null)
    try {
      await api.aiAddKey({ provider, apiKey: apiKey.trim(), model })
      resetForm()
      await refresh()
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setSaving(false)
    }
  }

  const removeKey = async (id: string) => {
    if (!confirm('Remove this API key?')) return
    await api.aiDeleteKey(id)
    await refresh()
  }

  const setActive = async (id: string) => {
    const c = await api.aiSetActive(id)
    setConfig((prev) => (prev ? { ...prev, ...c } : prev))
    onAiConfigChanged({ ...(config as AiConfig), ...c })
  }

  const providerLabel = (p: string) => config?.providers?.[p]?.label ?? p

  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal settings-modal">
        <div className="docs-header">
          <h2>Settings</h2>
          <button className="icon-button" title="Close" onClick={onClose}>
            ✕
          </button>
        </div>

        <div className="table-info-body">
          <section>
            <h3 className="docs-group-title">Connection settings</h3>
            <p className="settings-hint">
              Sync your saved connections with another machine or share them with your team.
            </p>
            <div className="settings-row">
              <button className="ghost-button" onClick={onImportSettings}>
                ⇧ Import connections…
              </button>
              <button className="ghost-button" onClick={onExportSettings}>
                ⇩ Export connections…
              </button>
            </div>
          </section>

          <section>
            <h3 className="docs-group-title">AI Assist — bring your own key</h3>
            <p className="settings-hint">
              Add an API key from your provider to enable the AI Assist button. Keys are stored locally in
              ~/.dbsurfer/ai.json and only ever sent to the provider you chose.
            </p>

            {error && <div className="form-error">{error}</div>}

            {config && config.keys.length > 0 && (
              <table className="info-table settings-keys-table">
                <thead>
                  <tr>
                    <th>In use</th>
                    <th>Provider</th>
                    <th>Model</th>
                    <th>Key</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {config.keys.map((k) => (
                    <tr key={k.id}>
                      <td>
                        <input
                          type="radio"
                          name="active-ai-key"
                          checked={config.activeKeyId === k.id}
                          onChange={() => setActive(k.id)}
                          title="Use this provider/model for AI Assist"
                        />
                      </td>
                      <td>{providerLabel(k.provider)}</td>
                      <td className="info-mono">{k.model}</td>
                      <td className="info-mono">{k.keyPreview}</td>
                      <td>
                        <button className="icon-button danger" title="Remove key" onClick={() => removeKey(k.id)}>
                          ✕
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            {config && config.keys.length === 0 && !adding && (
              <div className="tree-info">No keys yet — AI Assist is disabled.</div>
            )}

            {!adding ? (
              <button className="ghost-button" onClick={() => setAdding(true)}>
                + Add key
              </button>
            ) : (
              <div className="settings-add-key">
                <div className="settings-row">
                  <label className="settings-field">
                    <span>Provider</span>
                    <select
                      value={provider}
                      onChange={(e) => {
                        setProvider(e.target.value as AiProvider)
                        setModels(null)
                        setModel('')
                      }}
                    >
                      {Object.entries(config?.providers || {}).map(([id, p]) => (
                        <option key={id} value={id}>
                          {p.label}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="settings-field settings-field-grow">
                    <span>API key</span>
                    <input
                      type="password"
                      value={apiKey}
                      placeholder={provider === 'openai' ? 'sk-…' : provider === 'anthropic' ? 'sk-ant-…' : 'AIza…'}
                      onChange={(e) => setApiKey(e.target.value)}
                    />
                  </label>
                </div>
                <div className="settings-row">
                  {models === null ? (
                    <button className="ghost-button" onClick={loadModels} disabled={loadingModels || !apiKey.trim()}>
                      {loadingModels ? 'Fetching models…' : 'Fetch available models'}
                    </button>
                  ) : (
                    <label className="settings-field settings-field-grow">
                      <span>Model ({models.length} available)</span>
                      <select value={model} onChange={(e) => setModel(e.target.value)}>
                        {models.map((m) => (
                          <option key={m} value={m}>
                            {m}
                          </option>
                        ))}
                      </select>
                    </label>
                  )}
                </div>
                <div className="settings-row">
                  <button className="primary-button" onClick={saveKey} disabled={!model || saving}>
                    {saving ? 'Saving…' : 'Save key'}
                  </button>
                  <button className="ghost-button" onClick={resetForm}>
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </section>
        </div>
      </div>
    </div>
  )
}
