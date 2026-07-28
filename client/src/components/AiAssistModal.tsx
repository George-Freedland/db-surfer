import { useState } from 'react'
import { api } from '../api'

interface Props {
  connectionId: string | null
  connectionName?: string
  modelLabel: string
  onInsert: (sql: string) => void
  onClose: () => void
}

export default function AiAssistModal({ connectionId, connectionName, modelLabel, onInsert, onClose }: Props) {
  const [prompt, setPrompt] = useState('')
  const [sql, setSql] = useState<string | null>(null)
  const [generating, setGenerating] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const generate = async () => {
    if (!prompt.trim() || generating) return
    setGenerating(true)
    setError(null)
    setSql(null)
    try {
      const res = await api.aiGenerate(connectionId, prompt.trim())
      setSql(res.sql)
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setGenerating(false)
    }
  }

  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal ai-assist-modal">
        <div className="docs-header">
          <h2>✨ AI Assist</h2>
          <span className="ai-assist-meta">
            {modelLabel}
            {connectionName ? ` · ${connectionName}` : ' · no connection selected'}
          </span>
          <button className="icon-button" title="Close" onClick={onClose}>
            ✕
          </button>
        </div>

        <div className="ai-assist-body">
          <textarea
            className="ai-assist-input"
            placeholder='Describe the query you want, e.g. "get all of user X&apos;s posts and make sure user Y has liked them"'
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) generate()
            }}
            rows={3}
            autoFocus
          />
          <div className="settings-row">
            <button className="primary-button" onClick={generate} disabled={!prompt.trim() || generating}>
              {generating ? 'Generating…' : sql ? 'Regenerate' : 'Generate'}
            </button>
            <span className="toolbar-hint">⌘⏎ to generate — schema of the selected connection is used as context</span>
          </div>

          {error && <div className="form-error">{error}</div>}

          {sql && (
            <>
              <pre className="ai-assist-result">{sql}</pre>
              <div className="settings-row">
                <button className="primary-button" onClick={() => onInsert(sql)}>
                  Insert into current tab
                </button>
                <button className="ghost-button" onClick={onClose}>
                  Cancel
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
