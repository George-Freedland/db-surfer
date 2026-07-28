import { useCallback, useEffect, useRef, useState } from 'react'
import { api, ApiError } from './api'
import type { AiConfig, CompletionInfo, Connection, ConnectionInput, QueryResponse } from './api'
import { DB_TYPES } from './dbTypes'
import { downloadFile } from './exportUtils'
import Sidebar from './components/Sidebar'
import TabBar from './components/TabBar'
import SqlEditor from './components/SqlEditor'
import type { SqlEditorHandle } from './components/SqlEditor'
import ResultsPane from './components/ResultsPane'
import ConnectionModal from './components/ConnectionModal'
import PasswordModal from './components/PasswordModal'
import DocsModal from './components/DocsModal'
import ExportSettingsModal from './components/ExportSettingsModal'
import SettingsModal from './components/SettingsModal'
import AiAssistModal from './components/AiAssistModal'
import Resizer from './components/Resizer'

export interface Tab {
  id: string
  title: string
  sql: string
  connectionId: string | null
}

export interface TabRun {
  status: 'idle' | 'running' | 'done' | 'error'
  response?: QueryResponse
  error?: string
  errorPosition?: number
  ranSql?: string
}

const TABS_KEY = 'dbsurfer.tabs'
const ACTIVE_KEY = 'dbsurfer.activeTab'
const SIDEBAR_W_KEY = 'dbsurfer.sidebarWidth'
const RESULTS_H_KEY = 'dbsurfer.resultsHeight'

function loadNumber(key: string, fallback: number) {
  const v = Number(localStorage.getItem(key))
  return Number.isFinite(v) && v > 0 ? v : fallback
}
const clamp = (v: number, min: number, max: number) => Math.max(min, Math.min(max, v))

function newTab(n: number, connectionId: string | null = null): Tab {
  return { id: crypto.randomUUID(), title: `Script ${n}`, sql: '', connectionId }
}

function loadTabs(): Tab[] {
  try {
    const tabs = JSON.parse(localStorage.getItem(TABS_KEY) || '')
    if (Array.isArray(tabs) && tabs.length > 0) return tabs
  } catch {
    /* fall through */
  }
  return [newTab(1)]
}

export default function App() {
  const [connections, setConnections] = useState<Connection[]>([])
  const [tabs, setTabs] = useState<Tab[]>(loadTabs)
  const [activeTabId, setActiveTabId] = useState<string>(
    () => localStorage.getItem(ACTIVE_KEY) || ''
  )
  const [runs, setRuns] = useState<Record<string, TabRun>>({})
  const [modal, setModal] = useState<
    | { type: 'new-connection' }
    | { type: 'edit-connection'; connection: Connection }
    | { type: 'password'; connection: Connection; error?: string }
    | { type: 'export-settings' }
    | null
  >(null)
  const [docsOpen, setDocsOpen] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [aiOpen, setAiOpen] = useState(false)
  const [aiConfig, setAiConfig] = useState<AiConfig | null>(null)
  const [sidebarWidth, setSidebarWidth] = useState(() => loadNumber(SIDEBAR_W_KEY, 290))
  const [resultsHeight, setResultsHeight] = useState(() => loadNumber(RESULTS_H_KEY, 280))
  const [completions, setCompletions] = useState<Record<string, CompletionInfo>>({})
  const editorRef = useRef<SqlEditorHandle>(null)
  const importInputRef = useRef<HTMLInputElement>(null)
  const settingsInputRef = useRef<HTMLInputElement>(null)

  const activeTab = tabs.find((t) => t.id === activeTabId) ?? tabs[0]

  useEffect(() => {
    localStorage.setItem(TABS_KEY, JSON.stringify(tabs))
  }, [tabs])
  useEffect(() => {
    if (activeTab) localStorage.setItem(ACTIVE_KEY, activeTab.id)
  }, [activeTab])
  useEffect(() => {
    localStorage.setItem(SIDEBAR_W_KEY, String(sidebarWidth))
  }, [sidebarWidth])
  useEffect(() => {
    localStorage.setItem(RESULTS_H_KEY, String(resultsHeight))
  }, [resultsHeight])

  const refreshConnections = useCallback(async () => {
    try {
      setConnections(await api.listConnections())
    } catch {
      /* server not up yet */
    }
  }, [])

  useEffect(() => {
    refreshConnections()
    api.aiConfig().then(setAiConfig).catch(() => {})
  }, [refreshConnections])

  const activeConnection = connections.find((c) => c.id === activeTab?.connectionId)

  // Fetch autocomplete schema once per connected database
  useEffect(() => {
    const conn = activeConnection
    if (!conn || !conn.connected || completions[conn.id]) return
    let cancelled = false
    api
      .completion(conn.id)
      .then((info) => {
        if (!cancelled) setCompletions((prev) => ({ ...prev, [conn.id]: info }))
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [activeConnection, completions])

  // --- connection actions ---

  const handleConnect = useCallback(
    async (conn: Connection, password?: string, savePassword?: boolean) => {
      try {
        await api.connect(conn.id, password, savePassword)
        await refreshConnections()
        setModal(null)
        return true
      } catch (err) {
        if (err instanceof ApiError && err.code === 'password_required') {
          setModal({
            type: 'password',
            connection: conn,
            error: password ? err.message : undefined,
          })
        } else {
          alert(`Connection failed: ${(err as Error).message}`)
        }
        return false
      }
    },
    [refreshConnections]
  )

  const handleDisconnect = useCallback(
    async (conn: Connection) => {
      await api.disconnect(conn.id)
      await refreshConnections()
    },
    [refreshConnections]
  )

  const handleClearCredentials = useCallback(
    async (conn: Connection) => {
      if (!confirm(`Clear stored credentials for "${conn.name}"? This also disconnects it.`)) return
      await api.clearCredentials(conn.id)
      await refreshConnections()
    },
    [refreshConnections]
  )

  const handleDelete = useCallback(
    async (conn: Connection) => {
      if (!confirm(`Delete connection "${conn.name}"?`)) return
      await api.deleteConnection(conn.id)
      setTabs((prev) =>
        prev.map((t) => (t.connectionId === conn.id ? { ...t, connectionId: null } : t))
      )
      await refreshConnections()
    },
    [refreshConnections]
  )

  const handleSaveConnection = useCallback(
    async (input: ConnectionInput, existingId?: string) => {
      if (existingId) await api.updateConnection(existingId, input)
      else await api.createConnection(input)
      setModal(null)
      await refreshConnections()
    },
    [refreshConnections]
  )

  // --- tab actions ---

  const addTab = useCallback(() => {
    const tab = newTab(tabs.length + 1, activeTab?.connectionId ?? null)
    setTabs((prev) => [...prev, tab])
    setActiveTabId(tab.id)
  }, [tabs.length, activeTab])

  const cleanupRuns = useCallback((keepIds: Set<string>) => {
    setRuns((prev) => Object.fromEntries(Object.entries(prev).filter(([id]) => keepIds.has(id))))
  }, [])

  const closeTab = useCallback(
    (id: string) => {
      setTabs((prev) => {
        const next = prev.filter((t) => t.id !== id)
        const final = next.length > 0 ? next : [newTab(1)]
        cleanupRuns(new Set(final.map((t) => t.id)))
        return final
      })
    },
    [cleanupRuns]
  )

  const closeOthers = useCallback(
    (id: string) => {
      setTabs((prev) => {
        const keep = prev.filter((t) => t.id === id)
        const final = keep.length > 0 ? keep : [newTab(1)]
        cleanupRuns(new Set(final.map((t) => t.id)))
        return final
      })
      setActiveTabId(id)
    },
    [cleanupRuns]
  )

  const closeRight = useCallback(
    (id: string) => {
      setTabs((prev) => {
        const index = prev.findIndex((t) => t.id === id)
        if (index === -1) return prev
        const final = prev.slice(0, index + 1)
        cleanupRuns(new Set(final.map((t) => t.id)))
        setActiveTabId((current) => (final.some((t) => t.id === current) ? current : id))
        return final
      })
    },
    [cleanupRuns]
  )

  const closeAll = useCallback(() => {
    const fresh = newTab(1)
    setTabs([fresh])
    setRuns({})
    setActiveTabId(fresh.id)
  }, [])

  const updateTab = useCallback((id: string, patch: Partial<Tab>) => {
    setTabs((prev) => prev.map((t) => (t.id === id ? { ...t, ...patch } : t)))
  }, [])

  // --- SQL generation / import / export ---

  const appendToActiveTab = useCallback(
    (sql: string) => {
      if (!activeTab) return
      const current = activeTab.sql
      const joined = current.trim() ? `${current.replace(/\s+$/, '')}\n\n${sql}` : sql
      updateTab(activeTab.id, { sql: joined })
    },
    [activeTab, updateTab]
  )

  const insertQueryTab = useCallback(
    (connectionId: string, sql: string) => {
      const tab: Tab = {
        id: crypto.randomUUID(),
        title: `Script ${tabs.length + 1}`,
        sql,
        connectionId,
      }
      setTabs((prev) => [...prev, tab])
      setActiveTabId(tab.id)
    },
    [tabs.length]
  )

  const importSqlFiles = useCallback(
    async (files: FileList | null) => {
      if (!files || files.length === 0) return
      let lastId = ''
      const newTabs: Tab[] = []
      for (const file of Array.from(files)) {
        const text = await file.text()
        const tab: Tab = {
          id: crypto.randomUUID(),
          title: file.name.replace(/\.(sql|txt)$/i, ''),
          sql: text,
          connectionId: activeTab?.connectionId ?? null,
        }
        newTabs.push(tab)
        lastId = tab.id
      }
      setTabs((prev) => [...prev, ...newTabs])
      if (lastId) setActiveTabId(lastId)
    },
    [activeTab]
  )

  const exportSql = useCallback(() => {
    if (!activeTab) return
    downloadFile(`${activeTab.title || 'script'}.sql`, activeTab.sql, 'application/sql')
  }, [activeTab])

  const exportSettings = useCallback(() => {
    setModal({ type: 'export-settings' })
  }, [])

  const importSettings = useCallback(
    async (files: FileList | null) => {
      if (!files || files.length === 0) return
      try {
        const payload = JSON.parse(await files[0].text())
        const replace = confirm(
          'Replace settings for connections that already exist (same host/port/db/user)?\n\nOK = update existing + add new.\nCancel = only add new, skip duplicates.'
        )
        const result = await api.importSettings(payload, replace)
        await refreshConnections()
        alert(`Imported: ${result.added} added, ${result.updated} updated, ${result.skipped} skipped.`)
      } catch (err) {
        alert(`Import failed: ${(err as Error).message}`)
      }
    },
    [refreshConnections]
  )

  // --- query execution ---

  const runSql = useCallback(
    async (sql: string) => {
      if (!activeTab) return
      const connId = activeTab.connectionId
      if (!connId) {
        setRuns((prev) => ({
          ...prev,
          [activeTab.id]: { status: 'error', error: 'Select a connection for this tab first.' },
        }))
        return
      }
      if (!sql.trim()) return
      const tabId = activeTab.id
      setRuns((prev) => ({ ...prev, [tabId]: { status: 'running', ranSql: sql } }))
      try {
        const response = await api.query(connId, sql)
        setRuns((prev) => ({ ...prev, [tabId]: { status: 'done', response, ranSql: sql } }))
        refreshConnections()
      } catch (err) {
        if (err instanceof ApiError && err.code === 'password_required') {
          const conn = connections.find((c) => c.id === connId)
          if (conn) setModal({ type: 'password', connection: conn })
          setRuns((prev) => ({
            ...prev,
            [tabId]: { status: 'error', error: 'Not connected — enter the password and run again.' },
          }))
          return
        }
        const apiErr = err as ApiError
        setRuns((prev) => ({
          ...prev,
          [tabId]: {
            status: 'error',
            error: apiErr.message,
            errorPosition: apiErr.position,
            ranSql: sql,
          },
        }))
      }
    },
    [activeTab, connections, refreshConnections]
  )

  const runSelectionOrAll = useCallback(() => {
    const editor = editorRef.current
    if (!editor || !activeTab) return
    const selection = editor.getSelection()
    runSql(selection || activeTab.sql)
  }, [activeTab, runSql])

  const activeAiKey = aiConfig?.keys.find((k) => k.id === aiConfig.activeKeyId) ?? null

  const run = runs[activeTab?.id ?? ''] ?? { status: 'idle' as const }
  const editorHint = activeConnection
    ? DB_TYPES[activeConnection.type]?.queryHint
    : DB_TYPES.postgres.queryHint

  return (
    <div className="app">
      <Sidebar
        connections={connections}
        width={sidebarWidth}
        onNewConnection={() => setModal({ type: 'new-connection' })}
        onEditConnection={(c) => setModal({ type: 'edit-connection', connection: c })}
        onConnect={(c) => handleConnect(c)}
        onDisconnect={handleDisconnect}
        onClearCredentials={handleClearCredentials}
        onDelete={handleDelete}
        onOpenQueryTab={insertQueryTab}
        onAppendSql={appendToActiveTab}
        onRefresh={refreshConnections}
      />
      <Resizer
        orientation="vertical"
        onDrag={(e) => setSidebarWidth(clamp(e.clientX, 200, 640))}
      />
      <main className="main">
        <TabBar
          tabs={tabs}
          activeTabId={activeTab?.id ?? ''}
          onSelect={setActiveTabId}
          onClose={closeTab}
          onCloseOthers={closeOthers}
          onCloseRight={closeRight}
          onCloseAll={closeAll}
          onAdd={addTab}
          onRename={(id, title) => updateTab(id, { title })}
          onOpenDocs={() => setDocsOpen(true)}
          onOpenSettings={() => setSettingsOpen(true)}
        />
        {activeTab && (
          <>
            <div className="editor-toolbar">
              <button
                className="run-button"
                onClick={runSelectionOrAll}
                disabled={run.status === 'running'}
                title="Run selection (or whole script) — ⌘⏎"
              >
                {run.status === 'running' ? 'Running…' : '▶ Run'}
              </button>
              <select
                className="connection-select"
                value={activeTab.connectionId ?? ''}
                onChange={(e) => updateTab(activeTab.id, { connectionId: e.target.value || null })}
              >
                <option value="">— no connection —</option>
                {connections.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.connected ? '● ' : '○ '}
                    {c.name} ({DB_TYPES[c.type]?.label ?? c.type})
                  </option>
                ))}
              </select>
              {activeConnection && !activeConnection.connected && (
                <button className="link-button" onClick={() => handleConnect(activeConnection)}>
                  connect
                </button>
              )}
              <button
                className="ai-assist-button"
                disabled={!activeAiKey}
                onClick={() => setAiOpen(true)}
                title={
                  activeAiKey
                    ? `Generate a query with ${activeAiKey.model}`
                    : 'Add an API key in Settings (⚙) to enable AI Assist'
                }
              >
                ✨ AI Assist
              </button>
              <span className="toolbar-spacer" />
              <button className="ghost-button small" onClick={() => importInputRef.current?.click()} title="Import .sql files into new tabs">
                ⇧ Import SQL
              </button>
              <button className="ghost-button small" onClick={exportSql} title="Download this tab as a .sql file">
                ⇩ Export SQL
              </button>
              <input
                ref={importInputRef}
                type="file"
                accept=".sql,.txt"
                multiple
                style={{ display: 'none' }}
                onChange={(e) => {
                  importSqlFiles(e.target.files)
                  e.target.value = ''
                }}
              />
              <span className="toolbar-hint">⌘⏎ runs highlighted lines, or the whole script</span>
            </div>
            <div className="editor-wrap">
              <SqlEditor
                ref={editorRef}
                key={activeTab.id}
                value={activeTab.sql}
                onChange={(sql) => updateTab(activeTab.id, { sql })}
                onRun={runSelectionOrAll}
                placeholder={editorHint}
                dbType={activeConnection?.type}
                completion={activeConnection ? completions[activeConnection.id] : null}
              />
            </div>
            <Resizer
              orientation="horizontal"
              onDrag={(e) => setResultsHeight(clamp(window.innerHeight - e.clientY, 120, window.innerHeight - 240))}
            />
            <ResultsPane run={run} height={resultsHeight} />
          </>
        )}
      </main>

      <input
        ref={settingsInputRef}
        type="file"
        accept=".json"
        style={{ display: 'none' }}
        onChange={(e) => {
          importSettings(e.target.files)
          e.target.value = ''
        }}
      />

      {modal?.type === 'new-connection' && (
        <ConnectionModal onSave={handleSaveConnection} onClose={() => setModal(null)} />
      )}
      {modal?.type === 'edit-connection' && (
        <ConnectionModal
          connection={modal.connection}
          onSave={handleSaveConnection}
          onClose={() => setModal(null)}
        />
      )}
      {modal?.type === 'password' && (
        <PasswordModal
          connection={modal.connection}
          error={modal.error}
          onSubmit={(password, save) => handleConnect(modal.connection, password, save)}
          onClose={() => setModal(null)}
        />
      )}
      {docsOpen && (
        <DocsModal
          onClose={() => setDocsOpen(false)}
          onInsert={(code) => {
            appendToActiveTab(code)
            setDocsOpen(false)
          }}
        />
      )}
      {settingsOpen && (
        <SettingsModal
          onClose={() => setSettingsOpen(false)}
          onExportSettings={exportSettings}
          onImportSettings={() => settingsInputRef.current?.click()}
          onAiConfigChanged={setAiConfig}
        />
      )}
      {modal?.type === 'export-settings' && (
        <ExportSettingsModal
          hasSavedPasswords={connections.some((c) => c.hasSavedPassword)}
          onClose={() => setModal(null)}
        />
      )}
      {aiOpen && activeAiKey && (
        <AiAssistModal
          connectionId={activeTab?.connectionId ?? null}
          connectionName={activeConnection?.name}
          modelLabel={`${activeAiKey.provider} · ${activeAiKey.model}`}
          onInsert={(sql) => {
            appendToActiveTab(sql)
            setAiOpen(false)
          }}
          onClose={() => setAiOpen(false)}
        />
      )}
    </div>
  )
}
