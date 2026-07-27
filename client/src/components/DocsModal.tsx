import { useMemo, useState } from 'react'
import { ABOUT, DOC_SECTIONS } from '../docsContent'
import type { DocEntry } from '../docsContent'

interface Props {
  onClose: () => void
  onInsert?: (code: string) => void
}

export default function DocsModal({ onClose, onInsert }: Props) {
  const [active, setActive] = useState<string>(DOC_SECTIONS[0].id)
  const [search, setSearch] = useState('')

  const query = search.trim().toLowerCase()

  const filtered = useMemo(() => {
    if (!query) return null
    return DOC_SECTIONS.map((section) => ({
      ...section,
      entries: section.entries.filter(
        (e) =>
          e.title.toLowerCase().includes(query) ||
          e.code.toLowerCase().includes(query) ||
          e.note?.toLowerCase().includes(query)
      ),
    })).filter((s) => s.entries.length > 0)
  }, [query])

  const activeSection = DOC_SECTIONS.find((s) => s.id === active)

  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal docs-modal">
        <div className="docs-header">
          <h2>Docs &amp; cheat sheet</h2>
          <input
            className="docs-search"
            placeholder="Search all databases… (e.g. upsert, join, TTL)"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            autoFocus
          />
          <button className="icon-button" title="Close" onClick={onClose}>
            ✕
          </button>
        </div>

        <div className="docs-body">
          {!query && (
            <div className="docs-nav">
              {DOC_SECTIONS.map((s) => (
                <button
                  key={s.id}
                  className={`docs-nav-item ${active === s.id ? 'active' : ''}`}
                  onClick={() => setActive(s.id)}
                >
                  {s.label}
                </button>
              ))}
              <div className="context-menu-separator" />
              <button
                className={`docs-nav-item ${active === 'about' ? 'active' : ''}`}
                onClick={() => setActive('about')}
              >
                {ABOUT.label}
              </button>
            </div>
          )}

          <div className="docs-content">
            {query ? (
              filtered && filtered.length > 0 ? (
                filtered.map((section) => (
                  <div key={section.id}>
                    <h3 className="docs-group-title">{section.label}</h3>
                    {section.entries.map((entry) => (
                      <DocCard key={entry.title} entry={entry} onInsert={onInsert} />
                    ))}
                  </div>
                ))
              ) : (
                <div className="results-placeholder">No matches for “{search}”.</div>
              )
            ) : active === 'about' ? (
              <AboutSection />
            ) : (
              activeSection?.entries.map((entry) => (
                <DocCard key={entry.title} entry={entry} onInsert={onInsert} />
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

function DocCard({ entry, onInsert }: { entry: DocEntry; onInsert?: (code: string) => void }) {
  const [copied, setCopied] = useState(false)
  const copy = () => {
    navigator.clipboard?.writeText(entry.code)
    setCopied(true)
    setTimeout(() => setCopied(false), 1200)
  }
  return (
    <div className="doc-card">
      <div className="doc-card-head">
        <span className="doc-card-title">{entry.title}</span>
        <span className="doc-card-actions">
          {onInsert && (
            <button className="mini-button" onClick={() => onInsert(entry.code)} title="Insert into current tab">
              Insert
            </button>
          )}
          <button className="mini-button" onClick={copy}>
            {copied ? 'Copied' : 'Copy'}
          </button>
        </span>
      </div>
      <pre className="doc-card-code">{entry.code}</pre>
      {entry.note && <div className="doc-card-note">{entry.note}</div>}
    </div>
  )
}

function AboutSection() {
  return (
    <div className="about-section">
      {ABOUT.paragraphs.map((p, i) => (
        <p key={i}>{p}</p>
      ))}
      <a className="about-repo" href={ABOUT.repo} target="_blank" rel="noreferrer">
        {ABOUT.repo}
      </a>
    </div>
  )
}
