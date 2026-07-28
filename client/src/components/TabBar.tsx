import { useState } from 'react'
import type { Tab } from '../App'
import ContextMenu from './ContextMenu'

interface Props {
  tabs: Tab[]
  activeTabId: string
  onSelect: (id: string) => void
  onClose: (id: string) => void
  onCloseOthers: (id: string) => void
  onCloseRight: (id: string) => void
  onCloseAll: () => void
  onAdd: () => void
  onRename: (id: string, title: string) => void
  onOpenDocs: () => void
  onOpenSettings: () => void
}

export default function TabBar({
  tabs,
  activeTabId,
  onSelect,
  onClose,
  onCloseOthers,
  onCloseRight,
  onCloseAll,
  onAdd,
  onRename,
  onOpenDocs,
  onOpenSettings,
}: Props) {
  const [editingId, setEditingId] = useState<string | null>(null)
  const [draft, setDraft] = useState('')
  const [menu, setMenu] = useState<{ x: number; y: number; tabId: string } | null>(null)

  const commitRename = () => {
    if (editingId && draft.trim()) onRename(editingId, draft.trim())
    setEditingId(null)
  }

  const startRename = (tab: Tab) => {
    setEditingId(tab.id)
    setDraft(tab.title)
  }

  const menuTab = menu ? tabs.find((t) => t.id === menu.tabId) : null
  const menuIndex = menuTab ? tabs.indexOf(menuTab) : -1

  return (
    <div className="tab-bar">
      {tabs.map((tab) => (
        <div
          key={tab.id}
          className={`tab ${tab.id === activeTabId ? 'active' : ''}`}
          onClick={() => onSelect(tab.id)}
          onDoubleClick={() => startRename(tab)}
          onAuxClick={(e) => e.button === 1 && onClose(tab.id)}
          onContextMenu={(e) => {
            e.preventDefault()
            setMenu({ x: e.clientX, y: e.clientY, tabId: tab.id })
          }}
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
      <button className="docs-button settings-button" title="Settings — connections import/export, AI keys" onClick={onOpenSettings}>
        ⚙
      </button>
      <button className="docs-button" title="Docs & cheat sheet" onClick={onOpenDocs}>
        ? Docs
      </button>

      {menu && menuTab && (
        <ContextMenu
          x={menu.x}
          y={menu.y}
          onClose={() => setMenu(null)}
          items={[
            { label: 'Rename', onClick: () => startRename(menuTab) },
            { separator: true, label: '' },
            { label: 'Close', onClick: () => onClose(menuTab.id) },
            {
              label: 'Close others',
              disabled: tabs.length <= 1,
              onClick: () => onCloseOthers(menuTab.id),
            },
            {
              label: 'Close all to the right',
              disabled: menuIndex === tabs.length - 1,
              onClick: () => onCloseRight(menuTab.id),
            },
            { label: 'Close all', danger: true, onClick: onCloseAll },
          ]}
        />
      )}
    </div>
  )
}
