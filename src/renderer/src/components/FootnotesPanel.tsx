import React, { useEffect, useState } from 'react'
import { Editor } from '@tiptap/react'

interface Footnote {
  id: string
  content: string
  from: number
  to: number
}

function getFootnotes(editor: Editor): Footnote[] {
  const results: Footnote[] = []
  editor.state.doc.descendants((node, pos) => {
    if (node.isText) {
      const mark = node.marks.find((m) => m.type.name === 'footnote')
      if (mark) {
        results.push({
          id: mark.attrs.id as string,
          content: mark.attrs.content as string,
          from: pos,
          to: pos + node.nodeSize,
        })
      }
    }
  })
  return results
}

interface Props {
  editor: Editor
  onClose: () => void
}

export default function FootnotesPanel({ editor, onClose }: Props): React.JSX.Element {
  const [footnotes, setFootnotes] = useState<Footnote[]>(() => getFootnotes(editor))
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editDraft, setEditDraft] = useState('')

  useEffect(() => {
    const handler = (): void => setFootnotes(getFootnotes(editor))
    editor.on('update', handler)
    return () => { editor.off('update', handler) }
  }, [editor])

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  const goTo = (fn: Footnote): void => {
    editor.chain().setTextSelection({ from: fn.from, to: fn.to }).scrollIntoView().run()
    editor.commands.focus()
  }

  const remove = (fn: Footnote): void => {
    editor.chain()
      .setTextSelection({ from: fn.from, to: fn.to })
      .deleteSelection()
      .run()
  }

  const startEdit = (fn: Footnote): void => {
    setEditingId(fn.id)
    setEditDraft(fn.content)
  }

  const saveEdit = (fn: Footnote): void => {
    editor.chain()
      .setTextSelection({ from: fn.from, to: fn.to })
      .setMark('footnote', { id: fn.id, content: editDraft })
      .run()
    setEditingId(null)
  }

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 z-[800]" onClick={onClose} />

      {/* Panel */}
      <div
        className="fixed top-0 right-0 bottom-0 z-[801] flex flex-col bg-[var(--bg-card)] border-l border-[var(--border)] shadow-2xl"
        style={{ width: 360 }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 pt-10 pb-3 border-b border-[var(--border)] flex-shrink-0">
          <div className="flex items-center gap-2">
            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--fg-muted)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
              <polyline points="14,2 14,8 20,8"/>
              <line x1="8" y1="13" x2="16" y2="13"/>
              <line x1="8" y1="17" x2="12" y2="17"/>
            </svg>
            <h2 className="text-sm font-semibold text-[var(--fg)]">
              Footnotes
              {footnotes.length > 0 && (
                <span className="ml-1.5 text-[10px] font-normal text-[var(--fg-faint)]">
                  {footnotes.length}
                </span>
              )}
            </h2>
          </div>
          <button
            onClick={onClose}
            className="w-6 h-6 flex items-center justify-center rounded-md text-[var(--fg-muted)] hover:bg-[var(--bg-subtle)] hover:text-[var(--fg)] transition-colors"
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M18 6 6 18M6 6l12 12"/>
            </svg>
          </button>
        </div>

        {/* List */}
        <div className="flex-1 overflow-y-auto">
          {footnotes.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-center px-6 gap-2">
              <svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="var(--fg-faint)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                <polyline points="14,2 14,8 20,8"/>
              </svg>
              <p className="text-xs text-[var(--fg-faint)]">No footnotes yet</p>
              <p className="text-[11px] text-[var(--fg-faint)]">Place cursor and click ¹ in the toolbar to add one</p>
            </div>
          ) : (
            <div className="divide-y divide-[var(--border)]">
              {footnotes.map((fn, idx) => (
                <div
                  key={fn.id}
                  className="px-4 py-3 hover:bg-[var(--bg-subtle)] transition-colors group"
                >
                  {/* Number badge + go-to */}
                  <div className="flex items-center gap-2 mb-1.5 cursor-pointer" onClick={() => goTo(fn)}>
                    <span className="text-[11px] font-bold text-[var(--accent)] bg-[var(--bg-amber)] px-1.5 py-0.5 rounded leading-none">
                      {idx + 1}
                    </span>
                    <span className="text-[10px] text-[var(--fg-faint)] group-hover:text-[var(--fg-muted)] transition-colors">
                      Go to in text ↗
                    </span>
                  </div>

                  {/* Footnote content (click to edit) */}
                  {editingId === fn.id ? (
                    <textarea
                      autoFocus
                      value={editDraft}
                      onChange={(e) => setEditDraft(e.target.value)}
                      onBlur={() => saveEdit(fn)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); saveEdit(fn) }
                        if (e.key === 'Escape') setEditingId(null)
                      }}
                      rows={3}
                      className="w-full px-2 py-1.5 text-xs border border-[var(--accent)] rounded-lg bg-[var(--bg)] text-[var(--fg)] focus:outline-none resize-none leading-relaxed"
                    />
                  ) : (
                    <p
                      className="text-xs text-[var(--fg)] leading-snug cursor-text hover:text-[var(--accent)] transition-colors"
                      onClick={() => startEdit(fn)}
                      title="Click to edit footnote text"
                    >
                      {fn.content
                        ? fn.content
                        : <span className="text-[var(--fg-faint)] italic">Empty — click to add text</span>
                      }
                    </p>
                  )}

                  {/* Remove */}
                  <button
                    onClick={() => remove(fn)}
                    className="mt-1.5 text-[10px] text-[var(--fg-faint)] hover:text-red-500 transition-colors opacity-0 group-hover:opacity-100"
                  >
                    Remove
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-4 py-2 border-t border-[var(--border)] flex-shrink-0">
          <p className="text-[10px] text-[var(--fg-faint)]">Footnotes export as proper Word footnotes in DOCX · Esc to close</p>
        </div>
      </div>
    </>
  )
}
