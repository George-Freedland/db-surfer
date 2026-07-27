import { forwardRef, useImperativeHandle, useRef } from 'react'
import CodeMirror from '@uiw/react-codemirror'
import type { ReactCodeMirrorRef } from '@uiw/react-codemirror'
import { sql, PostgreSQL } from '@codemirror/lang-sql'
import { keymap } from '@codemirror/view'
import { Prec } from '@codemirror/state'
import { oneDark } from '@codemirror/theme-one-dark'

export interface SqlEditorHandle {
  getSelection: () => string
}

interface Props {
  value: string
  onChange: (value: string) => void
  onRun: () => void
}

const SqlEditor = forwardRef<SqlEditorHandle, Props>(({ value, onChange, onRun }, ref) => {
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

  return (
    <CodeMirror
      ref={cmRef}
      value={value}
      onChange={onChange}
      theme={oneDark}
      height="100%"
      style={{ height: '100%' }}
      extensions={[
        sql({ dialect: PostgreSQL, upperCaseKeywords: true }),
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
      ]}
      basicSetup={{
        lineNumbers: true,
        highlightActiveLine: true,
        autocompletion: true,
        foldGutter: false,
      }}
      placeholder="-- Write SQL here. Highlight lines and press ⌘⏎ to run just those."
    />
  )
})

export default SqlEditor
