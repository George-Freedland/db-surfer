import { useEffect, useState } from 'react'
import type { TabRun } from '../App'
import type { DbType, QueryResult } from '../api'
import { exportResultCsv, exportResultJson, resultToObjects } from '../exportUtils'
import { qualify, quoteIdent, textLiteral, valueLiteral } from '../sqlgen'

export interface EditContext {
  dbType: DbType
  schema: string
  table: string
  pkColumns: string[]
}

interface Props {
  run: TabRun
  height: number
  editContext?: EditContext | null
  onApplyBatch?: (sql: string) => Promise<void>
}

export default function ResultsPane({ run, height, editContext, onApplyBatch }: Props) {
  return (
    <div className="results-pane" style={{ height, flex: 'none' }}>
      {run.status === 'idle' && (
        <div className="results-placeholder">Results will show up here.</div>
      )}
      {run.status === 'running' && <div className="results-placeholder">Running…</div>}
      {run.status === 'error' && (
        <div className="results-error">
          <strong>Error</strong> {run.error}
          {run.errorPosition !== undefined && run.ranSql && (
            <pre className="error-context">{errorContext(run.ranSql, run.errorPosition)}</pre>
          )}
        </div>
      )}
      {run.status === 'done' && run.response && (
        <div className="results-scroll">
          {run.response.results.map((result, i) => (
            <ResultBlock
              key={i}
              result={result}
              index={i}
              total={run.response!.results.length}
              durationMs={i === 0 ? run.response!.durationMs : undefined}
              editContext={run.response!.results.length === 1 ? editContext : null}
              onApplyBatch={onApplyBatch}
            />
          ))}
        </div>
      )}
    </div>
  )
}

function errorContext(sql: string, position: number) {
  const upTo = sql.slice(0, position - 1)
  const line = upTo.split('\n').length
  const lines = sql.split('\n')
  const start = Math.max(0, line - 2)
  return lines
    .slice(start, line + 1)
    .map((l, i) => `${start + i + 1} | ${l}`)
    .join('\n')
}

function cellText(value: unknown): string {
  if (value === null || value === undefined) return 'NULL'
  if (typeof value === 'object') return JSON.stringify(value)
  if (typeof value === 'boolean') return value ? 'true' : 'false'
  return String(value)
}

function ResultBlock({
  result,
  index,
  total,
  durationMs,
  editContext,
  onApplyBatch,
}: {
  result: QueryResult
  index: number
  total: number
  durationMs?: number
  editContext?: EditContext | null
  onApplyBatch?: (sql: string) => Promise<void>
}) {
  const [view, setView] = useState<'table' | 'json'>('table')
  const [edits, setEdits] = useState<Record<string, string>>({})
  const [editing, setEditing] = useState<{ ri: number; ci: number } | null>(null)
  const [draft, setDraft] = useState('')
  const [batchOpen, setBatchOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)

  // New result data (e.g. after save/re-run) invalidates pending edits
  useEffect(() => {
    setEdits({})
    setEditing(null)
    setSaveError(null)
  }, [result])

  const hasRows = result.fields.length > 0
  const fieldNames = result.fields.map((f) => f.name)
  const editable = Boolean(
    editContext && onApplyBatch && editContext.pkColumns.every((pk) => fieldNames.includes(pk))
  )
  const editCount = Object.keys(edits).length

  const startEdit = (ri: number, ci: number) => {
    if (!editable) return
    const key = `${ri}:${ci}`
    setEditing({ ri, ci })
    setDraft(edits[key] ?? cellText(result.rows[ri][ci]))
  }

  const commitEdit = () => {
    if (!editing) return
    const { ri, ci } = editing
    const key = `${ri}:${ci}`
    const original = cellText(result.rows[ri][ci])
    setEdits((prev) => {
      const next = { ...prev }
      if (draft === original) delete next[key]
      else next[key] = draft
      return next
    })
    setEditing(null)
  }

  const buildBatch = (): string => {
    if (!editContext) return ''
    const { dbType, schema, table, pkColumns } = editContext
    const byRow: Record<number, Record<number, string>> = {}
    for (const [key, value] of Object.entries(edits)) {
      const [ri, ci] = key.split(':').map(Number)
      ;(byRow[ri] ??= {})[ci] = value
    }
    const statements: string[] = []
    for (const [riStr, cols] of Object.entries(byRow)) {
      const ri = Number(riStr)
      const sets = Object.entries(cols)
        .map(([ci, text]) => `${quoteIdent(dbType, fieldNames[Number(ci)])} = ${textLiteral(dbType, text)}`)
        .join(', ')
      const where = pkColumns
        .map((pk) => {
          const idx = fieldNames.indexOf(pk)
          const orig = result.rows[ri][idx]
          if (orig === null || orig === undefined) {
            return `${quoteIdent(dbType, pk)} IS NULL`
          }
          return `${quoteIdent(dbType, pk)} = ${valueLiteral(dbType, orig)}`
        })
        .join(' AND ')
      statements.push(`UPDATE ${qualify(dbType, schema, table)}\nSET ${sets}\nWHERE ${where};`)
    }
    return statements.join('\n')
  }

  const applyBatch = async (sql: string) => {
    if (!onApplyBatch) return
    setSaving(true)
    setSaveError(null)
    try {
      await onApplyBatch(sql)
      setBatchOpen(false)
      // edits are cleared by the result-change effect after the refresh
    } catch (err) {
      setSaveError((err as Error).message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="result-block">
      <div className="result-meta">
        {total > 1 && <span className="result-index">#{index + 1}</span>}
        <span className="result-command">{result.command}</span>
        <span>
          {hasRows
            ? `${result.rows.length}${result.truncated ? '+' : ''} row${result.rows.length === 1 ? '' : 's'}`
            : `${result.rowCount ?? 0} affected`}
        </span>
        {durationMs !== undefined && <span>{durationMs} ms</span>}
        {result.truncated && <span className="result-truncated">truncated to first {result.rows.length}</span>}
        {editable && editCount === 0 && (
          <span className="result-editable-hint">double-click a cell to edit</span>
        )}
        {hasRows && (
          <span className="result-actions">
            <span className="view-toggle">
              <button
                className={view === 'table' ? 'active' : ''}
                onClick={() => setView('table')}
              >
                Table
              </button>
              <button className={view === 'json' ? 'active' : ''} onClick={() => setView('json')}>
                JSON
              </button>
            </span>
            <button
              className="mini-button"
              title="Download as CSV (opens in Excel)"
              onClick={() => exportResultCsv(result, `result-${index + 1}`)}
            >
              ⇩ CSV
            </button>
            <button
              className="mini-button"
              title="Download as JSON"
              onClick={() => exportResultJson(result, `result-${index + 1}`)}
            >
              ⇩ JSON
            </button>
          </span>
        )}
      </div>

      {editCount > 0 && (
        <div className="edits-bar">
          <span className="edits-count">
            {editCount} pending change{editCount === 1 ? '' : 's'}
          </span>
          {saveError && <span className="edits-error">{saveError}</span>}
          <span className="edits-actions">
            <button className="mini-button" onClick={() => setBatchOpen(true)}>
              View batch query
            </button>
            <button className="mini-button" onClick={() => setEdits({})}>
              Discard
            </button>
            <button className="save-button" disabled={saving} onClick={() => applyBatch(buildBatch())}>
              {saving ? 'Saving…' : '💾 Save changes'}
            </button>
          </span>
        </div>
      )}

      {hasRows && view === 'table' && (
        <div className="grid-wrap">
          <table className="grid">
            <thead>
              <tr>
                <th className="row-num">#</th>
                {result.fields.map((f, i) => (
                  <th key={i}>
                    {f.name}
                    {editContext?.pkColumns.includes(f.name) && (
                      <span className="pk-badge" title="Primary key">
                        🔑
                      </span>
                    )}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {result.rows.map((row, ri) => (
                <tr key={ri}>
                  <td className="row-num">{ri + 1}</td>
                  {row.map((cell, ci) => {
                    const key = `${ri}:${ci}`
                    const isEditing = editing?.ri === ri && editing?.ci === ci
                    const edited = key in edits
                    if (isEditing) {
                      return (
                        <td key={ci} className="cell-editing">
                          <input
                            className="cell-input"
                            value={draft}
                            onChange={(e) => setDraft(e.target.value)}
                            onBlur={commitEdit}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') commitEdit()
                              if (e.key === 'Escape') setEditing(null)
                            }}
                            autoFocus
                          />
                        </td>
                      )
                    }
                    return (
                      <td
                        key={ci}
                        className={`${edited ? 'cell-edited' : ''} ${editable ? 'cell-editable' : ''}`}
                        onDoubleClick={() => startEdit(ri, ci)}
                        title={
                          edited
                            ? `Edited (was: ${cellText(cell)}). Double-click to change again.`
                            : editable
                              ? 'Double-click to edit'
                              : undefined
                        }
                      >
                        {edited ? edits[key] : renderCell(cell)}
                      </td>
                    )
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {hasRows && view === 'json' && (
        <pre className="json-view">{JSON.stringify(resultToObjects(result), null, 2)}</pre>
      )}

      {batchOpen && (
        <BatchModal
          initialSql={buildBatch()}
          saving={saving}
          error={saveError}
          onRun={applyBatch}
          onClose={() => setBatchOpen(false)}
        />
      )}
    </div>
  )
}

function BatchModal({
  initialSql,
  saving,
  error,
  onRun,
  onClose,
}: {
  initialSql: string
  saving: boolean
  error: string | null
  onRun: (sql: string) => void
  onClose: () => void
}) {
  const [sql, setSql] = useState(initialSql)
  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal batch-modal">
        <div className="docs-header">
          <h2>Batch query</h2>
          <button className="icon-button" title="Close" onClick={onClose}>
            ✕
          </button>
        </div>
        <div className="batch-body">
          <p className="settings-hint">
            Generated from your pending edits. You can tweak it before running. Closing keeps your
            edits so you can continue changing values.
          </p>
          <textarea
            className="batch-textarea"
            value={sql}
            onChange={(e) => setSql(e.target.value)}
            spellCheck={false}
          />
          {error && <div className="form-error">{error}</div>}
          <div className="settings-row">
            <button className="primary-button" disabled={saving || !sql.trim()} onClick={() => onRun(sql)}>
              {saving ? 'Running…' : 'Run batch'}
            </button>
            <button className="ghost-button" onClick={onClose}>
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

function renderCell(value: unknown) {
  if (value === null || value === undefined) return <span className="cell-null">NULL</span>
  if (typeof value === 'object') return JSON.stringify(value)
  if (typeof value === 'boolean') return value ? 'true' : 'false'
  return String(value)
}
