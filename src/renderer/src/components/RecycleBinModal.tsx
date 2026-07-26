import React, { useState } from 'react'
import { useBookStore } from '../store/bookStore'
import { TrashedBook } from '../types'

interface Props {
  onClose: () => void
  touchIdAvailable: boolean
}

function formatTrashedDate(iso: string): string {
  const date = new Date(iso)
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24))
  if (diffDays === 0) return 'Today'
  if (diffDays === 1) return 'Yesterday'
  if (diffDays < 7) return `${diffDays} days ago`
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

export default function RecycleBinModal({ onClose, touchIdAvailable }: Props): React.JSX.Element {
  const { trashedBooks, restoreFromTrash, permanentlyDeleteBook } = useBookStore()
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [restoring, setRestoring] = useState<string | null>(null)
  const [deleting, setDeleting] = useState(false)

  const selectedBook: TrashedBook | undefined = trashedBooks.find((b) => b.id === selectedId)

  const handleRestore = async (bookId: string): Promise<void> => {
    setRestoring(bookId)
    try {
      await restoreFromTrash(bookId)
      if (selectedId === bookId) setSelectedId(null)
    } finally {
      setRestoring(null)
    }
  }

  const handleDeletePermanently = async (): Promise<void> => {
    if (!selectedId) return
    if (touchIdAvailable) {
      try {
        await window.electron.auth.promptTouchId('Permanently Delete Book')
      } catch {
        return
      }
    }
    setDeleting(true)
    try {
      await permanentlyDeleteBook(selectedId)
      setSelectedId(null)
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
            <svg
              width="20" height="20" viewBox="0 0 24 24" fill="none"
              stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"
              className="text-[var(--fg-muted)]"
            >
              <polyline points="3 6 5 6 21 6" />
              <path d="M19 6l-1 14H6L5 6" />
              <path d="M10 11v6M14 11v6" />
              <path d="M9 6V4h6v2" />
            </svg>
            <h2 className="text-base font-semibold text-[var(--fg)]">Recycle Bin</h2>
          </div>
          <button
            onClick={onClose}
            className="w-7 h-7 rounded-full flex items-center justify-center text-[var(--fg-muted)] hover:bg-[var(--bg-subtle)] hover:text-[var(--fg)] transition-colors"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Book list */}
        <div className="flex-1 overflow-y-auto min-h-0 max-h-80">
          {trashedBooks.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center px-6">
              <svg
                width="48" height="48" viewBox="0 0 24 24" fill="none"
                stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"
                className="text-[var(--fg-faint)] mb-3"
              >
                <polyline points="3 6 5 6 21 6" />
                <path d="M19 6l-1 14H6L5 6" />
                <path d="M10 11v6M14 11v6" />
                <path d="M9 6V4h6v2" />
              </svg>
              <p className="text-sm text-[var(--fg-muted)] font-medium">Recycle bin is empty</p>
              <p className="text-xs text-[var(--fg-faint)] mt-1">Deleted books will appear here</p>
            </div>
          ) : (
            <ul className="divide-y divide-[var(--border)]">
              {trashedBooks.map((book) => (
                <li
                  key={book.id}
                  className={`flex items-center gap-3 px-5 py-3.5 cursor-pointer transition-colors ${
                    selectedId === book.id
                      ? 'bg-[var(--bg-amber)]'
                      : 'hover:bg-[var(--bg-subtle)]'
                  }`}
                  onClick={() => setSelectedId(selectedId === book.id ? null : book.id)}
                >
                  {/* Cover or initial */}
                  <div className="w-10 h-10 rounded-lg bg-[var(--bg-subtle)] flex-shrink-0 overflow-hidden flex items-center justify-center">
                    {book.coverDataUrl ? (
                      <img src={book.coverDataUrl} alt={book.name} className="w-full h-full object-cover" />
                    ) : (
                      <span className="text-lg font-serif font-bold text-[var(--accent)] opacity-50 select-none">
                        {book.name.charAt(0).toUpperCase()}
                      </span>
                    )}
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-[var(--fg)] truncate">{book.name}</p>
                    <p className="text-xs text-[var(--fg-faint)]">Deleted {formatTrashedDate(book.trashedAt)}</p>
                  </div>

                  {/* Restore button */}
                  <button
                    className="flex-shrink-0 px-3 py-1.5 rounded-[10px] border border-[var(--border)] text-xs font-medium text-[var(--fg-muted)] hover:text-[var(--fg)] hover:bg-[var(--bg)] transition-colors disabled:opacity-40"
                    onClick={(e) => { e.stopPropagation(); handleRestore(book.id) }}
                    disabled={restoring === book.id}
                  >
                    {restoring === book.id ? 'Restoring…' : 'Restore'}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Footer */}
        {trashedBooks.length > 0 && (
          <div className="px-5 py-4 border-t border-[var(--border)] flex items-center justify-between gap-3">
            <p className="text-xs text-[var(--fg-faint)]">
              {selectedBook
                ? `"${selectedBook.name}" selected`
                : 'Select a book to delete permanently'}
            </p>
            <button
              onClick={handleDeletePermanently}
              disabled={!selectedId || deleting}
              className="px-4 py-2 rounded-xl bg-red-500 text-white text-sm font-semibold hover:bg-red-600 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
            >
              {deleting ? 'Deleting…' : 'Delete Permanently'}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
