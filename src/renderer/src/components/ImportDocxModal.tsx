import React, { useEffect } from 'react'
import { ImportedChapter } from '../utils/importDocx'

interface Props {
  chapters: ImportedChapter[]
  importing: boolean
  onConfirm: () => void
  onClose: () => void
}

export default function ImportDocxModal({ chapters, importing, onConfirm, onClose }: Props): React.JSX.Element {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  const totalWords = chapters.reduce((s, c) => s + c.wordCount, 0)

  return (
    <div
      className="fixed inset-0 z-[9000] flex items-center justify-center bg-[var(--overlay-scrim)] backdrop-blur-sm"
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="modal-enter bg-[var(--bg-card)] border border-[var(--border)] rounded-2xl shadow-[var(--shadow-float)] w-[480px] max-h-[70vh] flex flex-col">

        {/* Header */}
        <div className="flex items-center justify-between px-5 pt-4 pb-3 border-b border-[var(--border)] flex-shrink-0">
          <div>
            <h2 className="text-sm font-semibold text-[var(--fg)]">Import from DOCX</h2>
            {chapters.length > 0 && (
              <p className="text-xs text-[var(--fg-muted)] mt-0.5">
                {chapters.length} chapter{chapters.length !== 1 ? 's' : ''} found · {totalWords.toLocaleString()} words total
              </p>
            )}
          </div>
          <button
            onClick={onClose}
            className="w-6 h-6 flex items-center justify-center rounded-md text-[var(--fg-muted)] hover:bg-[var(--bg-subtle)] hover:text-[var(--fg)]"
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M18 6 6 18M6 6l12 12"/>
            </svg>
          </button>
        </div>

        {/* Chapter list */}
        <div className="flex-1 overflow-y-auto px-5 py-3 min-h-0">
          {chapters.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-10 text-center gap-2">
              <p className="text-sm text-[var(--fg-muted)]">No content found in this file.</p>
              <p className="text-xs text-[var(--fg-faint)]">Make sure the document contains text.</p>
            </div>
          ) : (
            <div className="flex flex-col gap-1.5">
              {chapters.map((ch, i) => (
                <div
                  key={i}
                  className="flex items-center gap-3 px-3 py-2.5 rounded-lg bg-[var(--bg-subtle)]"
                >
                  <span className="text-[10px] font-bold text-white bg-[var(--accent)] rounded px-1.5 py-0.5 flex-shrink-0">
                    {i + 1}
                  </span>
                  <span className="text-sm text-[var(--fg)] flex-1 truncate">{ch.title}</span>
                  <span className="text-[11px] text-[var(--fg-faint)] flex-shrink-0">
                    {ch.wordCount > 0 ? `${ch.wordCount.toLocaleString()}w` : '—'}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Info note */}
        {chapters.length > 0 && (
          <div className="mx-5 mb-3 px-3 py-2 rounded-lg bg-[var(--bg-subtle)] border border-[var(--border)] flex-shrink-0">
            <p className="text-[11px] text-[var(--fg-muted)]">
              Chapters will be added to the end of your Body Matter. Split detected on Heading 1 markers.
            </p>
          </div>
        )}

        {/* Actions */}
        <div className="flex items-center justify-end gap-2 px-5 py-3 border-t border-[var(--border)] flex-shrink-0">
          <button
            onClick={onClose}
            disabled={importing}
            className="px-3 py-1.5 text-xs rounded-[10px] border border-[var(--border)] text-[var(--fg-muted)] hover:bg-[var(--bg-subtle)] transition-colors disabled:opacity-40"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            disabled={chapters.length === 0 || importing}
            className="px-3 py-1.5 text-xs rounded-[10px] bg-[var(--accent)] text-white font-medium hover:bg-[var(--accent-hover)] disabled:opacity-40 transition-colors"
          >
            {importing
              ? 'Importing…'
              : `Import ${chapters.length} chapter${chapters.length !== 1 ? 's' : ''}`}
          </button>
        </div>
      </div>
    </div>
  )
}
