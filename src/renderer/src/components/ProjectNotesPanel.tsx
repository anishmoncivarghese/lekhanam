import React, { useEffect, useRef, useState, useCallback } from 'react'
import { useBookStore } from '../store/bookStore'

interface Props {
  onClose: () => void
}

export default function ProjectNotesPanel({ onClose }: Props): React.JSX.Element {
  const { currentBook, saveBook } = useBookStore()
  const [text, setText] = useState(currentBook?.notes ?? '')
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  // Sync if book changes (e.g. switching books)
  useEffect(() => {
    setText(currentBook?.notes ?? '')
  }, [currentBook?.id])

  // Focus textarea on open
  useEffect(() => {
    textareaRef.current?.focus()
  }, [])

  // Escape closes
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  const handleChange = useCallback((value: string) => {
    setText(value)
    if (!currentBook) return
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => {
      saveBook({ ...currentBook, notes: value, updatedAt: new Date().toISOString() })
    }, 600)
  }, [currentBook, saveBook])

  const wordCount = text.trim() ? text.trim().split(/\s+/).length : 0

  return (
    <>
      {/* Backdrop — click to close */}
      <div
        className="fixed inset-0 z-[800]"
        onClick={onClose}
      />

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
              <polyline points="14 2 14 8 20 8"/>
              <line x1="16" y1="13" x2="8" y2="13"/>
              <line x1="16" y1="17" x2="8" y2="17"/>
              <polyline points="10 9 9 9 8 9"/>
            </svg>
            <h2 className="text-sm font-semibold text-[var(--fg)]">Project Notes</h2>
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

        {/* Textarea */}
        <textarea
          ref={textareaRef}
          value={text}
          onChange={(e) => handleChange(e.target.value)}
          placeholder="Jot down ideas, reminders, research snippets, anything you don't want to lose track of…"
          className="flex-1 w-full px-4 py-3 bg-transparent text-sm text-[var(--fg)] placeholder:text-[var(--fg-faint)] resize-none focus:outline-none leading-relaxed"
          style={{ fontFamily: 'inherit' }}
        />

        {/* Footer */}
        <div className="px-4 py-2 border-t border-[var(--border)] flex-shrink-0 flex items-center justify-between">
          <span className="text-[10px] text-[var(--fg-faint)]">
            {wordCount > 0 ? `${wordCount} word${wordCount !== 1 ? 's' : ''}` : ''}
          </span>
          <span className="text-[10px] text-[var(--fg-faint)]">Auto-saved · Esc to close</span>
        </div>
      </div>
    </>
  )
}
