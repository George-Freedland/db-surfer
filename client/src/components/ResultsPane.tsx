import { useState } from 'react'
import type { TabRun } from '../App'
import type { QueryResult } from '../api'
import { exportResultCsv, exportResultJson, resultToObjects } from '../exportUtils'

export default function ResultsPane({ run }: { run: TabRun }) {
  return (
    <div className="results-pane">
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

function ResultBlock({
  result,
  index,
  total,
  durationMs,
}: {
  result: QueryResult
  index: number
  total: number
  durationMs?: number
}) {
  const [view, setView] = useState<'table' | 'json'>('table')
  const hasRows = result.fields.length > 0

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

      {hasRows && view === 'table' && (
        <div className="grid-wrap">
          <table className="grid">
            <thead>
              <tr>
                <th className="row-num">#</th>
                {result.fields.map((f, i) => (
                  <th key={i}>{f.name}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {result.rows.map((row, ri) => (
                <tr key={ri}>
                  <td className="row-num">{ri + 1}</td>
                  {row.map((cell, ci) => (
                    <td key={ci}>{renderCell(cell)}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {hasRows && view === 'json' && (
        <pre className="json-view">{JSON.stringify(resultToObjects(result), null, 2)}</pre>
      )}
    </div>
  )
}

function renderCell(value: unknown) {
  if (value === null || value === undefined) return <span className="cell-null">NULL</span>
  if (typeof value === 'object') return JSON.stringify(value)
  if (typeof value === 'boolean') return value ? 'true' : 'false'
  return String(value)
}
