import { forwardRef, useImperativeHandle, useMemo, useRef } from 'react'
import CodeMirror from '@uiw/react-codemirror'
import type { ReactCodeMirrorRef } from '@uiw/react-codemirror'
import { sql, PostgreSQL, MySQL, MSSQL, SQLite, StandardSQL } from '@codemirror/lang-sql'
import type { SQLDialect } from '@codemirror/lang-sql'
import { keymap } from '@codemirror/view'
import { Prec } from '@codemirror/state'
import { oneDark } from '@codemirror/theme-one-dark'
import type { CompletionInfo, DbType } from '../api'

export interface SqlEditorHandle {
  getSelection: () => string
}

interface Props {
  value: string
  onChange: (value: string) => void
  onRun: () => void
  placeholder?: string
  dbType?: DbType
  completion?: CompletionInfo | null
}

const DIALECTS: Record<DbType, SQLDialect> = {
  postgres: PostgreSQL,
  mysql: MySQL,
  mssql: MSSQL,
  sqlite: SQLite,
  mongodb: StandardSQL,
  redis: StandardSQL,
}

const SqlEditor = forwardRef<SqlEditorHandle, Props>(
  ({ value, onChange, onRun, placeholder, dbType, completion }, ref) => {
    const cmRef = useRef<ReactCodeMirrorRef>(null)
    const onRunRef = useRef(onRun)
    onRunRef.current = onRun

    useImperativeHandle(ref, () => ({
      getSelection: () => {
        const view = cmRef.current?.view
        if (!view) return ''
        const { from, to } = view.state.selection.main
        return from === to ? '' : view.state.sliceDoc(from, to)
      },
    }))

    const extensions = useMemo(() => {
      const dialect = DIALECTS[dbType ?? 'postgres'] ?? PostgreSQL
      return [
        sql({
          dialect,
          upperCaseKeywords: true,
          schema: completion?.schema && Object.keys(completion.schema).length ? completion.schema : undefined,
          tables: completion?.tables?.map((label) => ({ label })),
        }),
        Prec.highest(
          keymap.of([
            {
              key: 'Mod-Enter',
              run: () => {
                onRunRef.current()
                return true
              },
            },
          ])
        ),
      ]
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [dbType, completion])

    return (
      <CodeMirror
        ref={cmRef}
        value={value}
        onChange={onChange}
        theme={oneDark}
        height="100%"
        style={{ height: '100%' }}
        extensions={extensions}
        basicSetup={{
          lineNumbers: true,
          highlightActiveLine: true,
          autocompletion: true,
          foldGutter: false,
        }}
        placeholder={placeholder ?? '-- Write SQL here. Highlight lines and press ⌘⏎ to run just those.'}
      />
    )
  }
)

export default SqlEditor
