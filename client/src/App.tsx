import { useCallback, useEffect, useRef, useState } from 'react'
import { api, ApiError } from './api'
import type { Connection, ConnectionInput, QueryResponse } from './api'
import { DB_TYPES } from './dbTypes'
import { downloadFile } from './exportUtils'
import Sidebar from './components/Sidebar'
import TabBar from './components/TabBar'
import SqlEditor from './components/SqlEditor'
import type { SqlEditorHandle } from './components/SqlEditor'
import ResultsPane from './components/ResultsPane'
import ConnectionModal from './components/ConnectionModal'
import PasswordModal from './components/PasswordModal'

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
    | null
  >(null)
  const editorRef = useRef<SqlEditorHandle>(null)
  const importInputRef = useRef<HTMLInputElement>(null)

  const activeTab = tabs.find((t) => t.id === activeTabId) ?? tabs[0]

  useEffect(() => {
    localStorage.setItem(TABS_KEY, JSON.stringify(tabs))
  }, [tabs])
  useEffect(() => {
    if (activeTab) localStorage.setItem(ACTIVE_KEY, activeTab.id)
  }, [activeTab])

  const refreshConnections = useCallback(async () => {
    try {
      setConnections(await api.listConnections())
    } catch {
      /* server not up yet */
    }
  }, [])

  useEffect(() => {
    refreshConnections()
  }, [refreshConnections])

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

  const run = runs[activeTab?.id ?? ''] ?? { status: 'idle' as const }
  const activeConnection = connections.find((c) => c.id === activeTab?.connectionId)
  const editorHint = activeConnection
    ? DB_TYPES[activeConnection.type]?.queryHint
    : DB_TYPES.postgres.queryHint

  return (
    <div className="app">
      <Sidebar
        connections={connections}
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
              />
            </div>
            <ResultsPane run={run} />
          </>
        )}
      </main>

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
    </div>
  )
}
