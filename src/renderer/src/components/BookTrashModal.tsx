import React, { useState } from 'react'
import { useBookStore } from '../store/bookStore'
import { BookTrashItem } from '../types'

interface Props {
  bookId: string
  onClose: () => void
  touchIdAvailable: boolean
}

function formatAge(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const days = Math.floor(diff / (1000 * 60 * 60 * 24))
  if (days === 0) return 'Today'
  if (days === 1) return 'Yesterday'
  if (days < 7) return `${days}d ago`
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

export default function BookTrashModal({ bookId, onClose, touchIdAvailable }: Props): React.JSX.Element {
  const { bookTrashItems, restoreChapterFromTrash, restoreCharacterFromTrash, permanentlyDeleteTrashItems } = useBookStore()
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [restoringId, setRestoringId] = useState<string | null>(null)
  const [deleting, setDeleting] = useState(false)

  const allSelected = bookTrashItems.length > 0 && selectedIds.size === bookTrashItems.length

  const toggleSelect = (id: string): void => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const toggleAll = (): void => {
    if (allSelected) {
      setSelectedIds(new Set())
    } else {
      setSelectedIds(new Set(bookTrashItems.map((i) => i.id)))
    }
  }

  const handleRestore = async (item: BookTrashItem): Promise<void> => {
    setRestoringId(item.id)
    try {
      if (item.type === 'chapter') {
        await restoreChapterFromTrash(bookId, item.id)
      } else {
        await restoreCharacterFromTrash(bookId, item.id)
      }
      setSelectedIds((prev) => { const next = new Set(prev); next.delete(item.id); return next })
    } finally {
      setRestoringId(null)
    }
  }

  const handleDeleteForever = async (): Promise<void> => {
    if (selectedIds.size === 0) return
    if (touchIdAvailable) {
      try {
        await window.electron.auth.promptTouchId('Delete Items Forever')
      } catch {
        return
      }
    }
    setDeleting(true)
    try {
      await permanentlyDeleteTrashItems(bookId, Array.from(selectedIds))
      setSelectedIds(new Set())
    } finally {
      setDeleting(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-[var(--overlay-scrim)] backdrop-blur-sm"
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="modal-enter w-full max-w-md bg-[var(--bg-card)] rounded-2xl shadow-[var(--shadow-float)] border border-[var(--border)] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--border)]">
          <div className="flex items-center gap-2.5">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="text-[var(--fg-muted)]">
              <polyline points="3 6 5 6 21 6" />
              <path d="M19 6l-1 14H6L5 6" />
              <path d="M10 11v6M14 11v6" />
              <path d="M9 6V4h6v2" />
            </svg>
            <h2 className="text-base font-semibold text-[var(--fg)]">Trash</h2>
          </div>
          <div className="flex items-center gap-3">
            {bookTrashItems.length > 0 && (
              <label className="flex items-center gap-1.5 text-xs text-[var(--fg-muted)] cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={allSelected}
                  onChange={toggleAll}
                  className="accent-[var(--accent)]"
                />
                Select All
              </label>
            )}
            <button
              onClick={onClose}
              className="w-7 h-7 rounded-full flex items-center justify-center text-[var(--fg-muted)] hover:bg-[var(--bg-subtle)] hover:text-[var(--fg)] transition-colors"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M18 6L6 18M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        {/* List */}
        <div className="flex-1 overflow-y-auto min-h-0 max-h-80">
          {bookTrashItems.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center px-6">
              <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" className="text-[var(--fg-faint)] mb-3">
                <polyline points="3 6 5 6 21 6" />
                <path d="M19 6l-1 14H6L5 6" />
                <path d="M10 11v6M14 11v6" />
                <path d="M9 6V4h6v2" />
              </svg>
              <p className="text-sm text-[var(--fg-muted)] font-medium">Trash is empty</p>
              <p className="text-xs text-[var(--fg-faint)] mt-1">Deleted chapters and characters appear here</p>
            </div>
          ) : (
            <ul className="divide-y divide-[var(--border)]">
              {bookTrashItems.map((item) => (
                <li
                  key={item.id}
                  className={`flex items-center gap-3 px-5 py-3 cursor-pointer transition-colors ${
                    selectedIds.has(item.id) ? 'bg-[var(--bg-amber)]' : 'hover:bg-[var(--bg-subtle)]'
                  }`}
                  onClick={() => toggleSelect(item.id)}
                >
                  <input
                    type="checkbox"
                    checked={selectedIds.has(item.id)}
                    onChange={() => toggleSelect(item.id)}
                    onClick={(e) => e.stopPropagation()}
                    className="accent-[var(--accent)] flex-shrink-0"
                  />

                  {/* Type icon / photo */}
                  <div className="w-9 h-9 rounded-lg flex-shrink-0 overflow-hidden flex items-center justify-center">
                    {item.type === 'character' && item.photoDataUrl ? (
                      <img src={item.photoDataUrl} alt={item.name} className="w-full h-full object-cover rounded-lg" />
                    ) : item.type === 'chapter' ? (
                      <div className="w-full h-full rounded-lg bg-amber-100 flex items-center justify-center">
                        <span className="text-xs font-bold text-[var(--accent)]">C</span>
                      </div>
                    ) : (
                      <div className="w-full h-full rounded-lg bg-teal-100 flex items-center justify-center">
                        <span className="text-xs font-bold text-teal-600">P</span>
                      </div>
                    )}
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-[var(--fg)] truncate">{item.name}</p>
                    <p className="text-xs text-[var(--fg-faint)]">
                      {item.type === 'chapter' ? 'Chapter' : 'Character'} · {formatAge(item.deletedAt)}
                      {item.type === 'chapter' && item.wordCount ? ` · ${item.wordCount.toLocaleString()} words` : ''}
                      {item.type === 'character' && item.role ? ` · ${item.role}` : ''}
                    </p>
                  </div>

                  {/* Restore button */}
                  <button
                    className="flex-shrink-0 px-3 py-1.5 rounded-[10px] border border-[var(--border)] text-xs font-medium text-[var(--fg-muted)] hover:text-[var(--fg)] hover:bg-[var(--bg)] transition-colors disabled:opacity-40"
                    onClick={(e) => { e.stopPropagation(); handleRestore(item) }}
                    disabled={restoringId === item.id}
                  >
                    {restoringId === item.id ? 'Restoring…' : 'Restore'}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Footer */}
        {bookTrashItems.length > 0 && (
          <div className="px-5 py-4 border-t border-[var(--border)] flex items-center justify-between gap-3">
            <p className="text-xs text-[var(--fg-faint)]">
              {selectedIds.size === 0
                ? 'Select items to delete permanently'
                : `${selectedIds.size} item${selectedIds.size === 1 ? '' : 's'} selected`}
            </p>
            <button
              onClick={handleDeleteForever}
              disabled={selectedIds.size === 0 || deleting}
              className="px-4 py-2 rounded-xl bg-red-500 text-white text-sm font-semibold hover:bg-red-600 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
            >
              {deleting ? 'Deleting…' : 'Delete Forever'}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
