import React, { useEffect, useRef, useState } from 'react'
import { Chapter } from '../types'
import { useSnapshotStore, formatSnapshotDateTime } from '../store/snapshotStore'

interface Props {
  bookId: string
  chapters: Chapter[]
  onClose: () => void
  onSaved: () => void
}

export default function SnapshotDialog({ bookId, chapters, onClose, onSaved }: Props): React.JSX.Element {
  const { createSnapshot, isSaving } = useSnapshotStore()
  const defaultName = `Snapshot — ${formatSnapshotDateTime(new Date())}`
  const [name, setName] = useState(defaultName)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    requestAnimationFrame(() => {
      inputRef.current?.focus()
      inputRef.current?.select()
    })
  }, [])

  useEffect(() => {
    const handler = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [onClose])

  const handleSave = async (): Promise<void> => {
    const trimmed = name.trim()
    if (!trimmed || isSaving) return
    try {
      await createSnapshot(bookId, trimmed, chapters)
      onSaved()
    } catch (err) {
      alert(`Failed to save snapshot: ${String(err)}`)
    }
  }

  const totalWords = chapters.reduce((s, c) => s + (c.wordCount ?? 0), 0)

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-[var(--overlay-scrim)] backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="modal-enter bg-[var(--bg-card)] rounded-2xl shadow-[var(--shadow-float)] border border-[var(--border)] w-[360px] p-6 flex flex-col gap-4"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-base font-semibold text-[var(--fg)]">Save Snapshot</h2>

        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-medium text-[var(--fg-muted)]">Name</label>
          <input
            ref={inputRef}
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') handleSave() }}
            placeholder="My Draft v1"
            className="px-3 py-2 rounded-xl border border-[var(--border)] bg-[var(--bg)] text-[var(--fg)] text-sm focus:outline-none focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent)]/20 transition-colors"
          />
          <p className="text-[10px] text-[var(--fg-faint)]">
            {chapters.length} {chapters.length === 1 ? 'chapter' : 'chapters'} •{' '}
            {totalWords.toLocaleString()} words
          </p>
        </div>

        <div className="flex justify-end gap-2 pt-1">
          <button
            onClick={onClose}
            disabled={isSaving}
            className="px-4 py-2 rounded-xl text-sm text-[var(--fg-muted)] hover:bg-[var(--bg-subtle)] transition-colors disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={isSaving || !name.trim()}
            className="px-4 py-2 rounded-xl bg-[var(--accent)] text-white text-sm font-semibold hover:bg-[var(--accent-hover)] transition-colors disabled:opacity-50"
          >
            {isSaving ? 'Saving…' : 'Save Snapshot'}
          </button>
        </div>
      </div>
    </div>
  )
}
