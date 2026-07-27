import { useState } from 'react'
import type { Tab } from '../App'

interface Props {
  tabs: Tab[]
  activeTabId: string
  onSelect: (id: string) => void
  onClose: (id: string) => void
  onAdd: () => void
  onRename: (id: string, title: string) => void
}

export default function TabBar({ tabs, activeTabId, onSelect, onClose, onAdd, onRename }: Props) {
  const [editingId, setEditingId] = useState<string | null>(null)
  const [draft, setDraft] = useState('')

  const commitRename = () => {
    if (editingId && draft.trim()) onRename(editingId, draft.trim())
    setEditingId(null)
  }

  return (
    <div className="tab-bar">
      {tabs.map((tab) => (
        <div
          key={tab.id}
          className={`tab ${tab.id === activeTabId ? 'active' : ''}`}
          onClick={() => onSelect(tab.id)}
          onDoubleClick={() => {
            setEditingId(tab.id)
            setDraft(tab.title)
          }}
          onAuxClick={(e) => e.button === 1 && onClose(tab.id)}
        >
          {editingId === tab.id ? (
            <input
              className="tab-rename"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onBlur={commitRename}
              onKeyDown={(e) => {
                if (e.key === 'Enter') commitRename()
                if (e.key === 'Escape') setEditingId(null)
              }}
              autoFocus
              onClick={(e) => e.stopPropagation()}
            />
          ) : (
            <span className="tab-title" title="Double-click to rename">
              {tab.title}
            </span>
          )}
          <button
            className="tab-close"
            title="Close tab"
            onClick={(e) => {
              e.stopPropagation()
              onClose(tab.id)
            }}
          >
            ×
          </button>
        </div>
      ))}
      <button className="tab-add" title="New script tab" onClick={onAdd}>
        +
      </button>
    </div>
  )
}
