import React, { useEffect, useState } from 'react'
import { useBookStore } from '../store/bookStore'
import { useUIStore } from '../store/uiStore'
import { useSecurityStore } from '../store/securityStore'
import BookCard from '../components/BookCard'
import RecycleBinModal from '../components/RecycleBinModal'
import SettingsPanel from '../components/SettingsPanel'
import ConflictReviewModal from '../components/ConflictReviewModal'
import appIcon from '../assets/icon.png'
import { ConflictInfo } from '../types'

export default function HomePage(): React.JSX.Element {
  const {
    books, loadBooks, deleteBook, recoverBook,
    setCurrentBook, loadCharacters, loadChapters,
    trashedBooks, loadTrashedBooks
  } = useBookStore()
  const { setPage, setBookTab } = useUIStore()
  const { isEnabled, setEnabled, lock } = useSecurityStore()
  const [touchIdAvailable, setTouchIdAvailable] = useState(false)
  const [togglingLock, setTogglingLock] = useState(false)
  const [showRecycleBin, setShowRecycleBin] = useState(false)
  const [showAbout, setShowAbout] = useState(false)
  const [appVersion, setAppVersion] = useState<string>('—')
  const [demoLoaded, setDemoLoaded] = useState(false)
  const [loadingDemo, setLoadingDemo] = useState(false)
  const [showSettings, setShowSettings] = useState(false)
  const [conflicts, setConflicts] = useState<ConflictInfo[]>([])
  const [showConflictModal, setShowConflictModal] = useState(false)

  useEffect(() => {
    loadBooks()
    loadTrashedBooks()
    window.electron.auth.canTouchId().then(setTouchIdAvailable)
    window.electron.app.getVersion().then(setAppVersion)
    window.electron.app.isDemoBookLoaded().then(setDemoLoaded)
  }, [])

  useEffect(() => {
    const unsub = window.electron.icloud.onConflicts(setConflicts)
    return unsub
  }, [])

  const handleLoadDemo = async (): Promise<void> => {
    if (demoLoaded || loadingDemo) return
    setLoadingDemo(true)
    await window.electron.app.createDemoBook()
    await loadBooks()
    setDemoLoaded(true)
    setLoadingDemo(false)
  }

  const handleToggleLock = async (): Promise<void> => {
    setTogglingLock(true)
    try {
      const reason = isEnabled ? 'Disable App Lock' : 'Enable App Lock'
      await window.electron.auth.promptTouchId(reason)
      setEnabled(!isEnabled)
    } catch {
      // User cancelled or Touch ID failed — no change
    } finally {
      setTogglingLock(false)
    }
  }

  const openBook = async (book: (typeof books)[0]): Promise<void> => {
    if (book.backupHealth && book.backupHealth !== 'ok') return
    setCurrentBook(book)
    setBookTab('dashboard')
    // Load chapters first (JSON-only, fast) then navigate immediately.
    // Character photos are base64-encoded from disk on every open — doing that
    // before navigation blocked the click for several seconds on books with
    // photos/galleries. Load them in the background after the page is shown.
    await loadChapters(book.id)
    setPage('book')
    loadCharacters(book.id)
  }

  const handleDelete = async (bookId: string): Promise<void> => {
    if (!window.confirm('Move this book to the Recycle Bin?')) return
    if (touchIdAvailable) {
      try {
        await window.electron.auth.promptTouchId('Delete Book')
      } catch {
        return
      }
    }
    await deleteBook(bookId)
    await loadTrashedBooks()
  }

  const handleRecover = async (bookId: string): Promise<void> => {
    const result = await recoverBook(bookId)
    if (!result.ok) {
      window.alert(`Recovery failed: ${result.reason}`)
    }
  }

  return (
    <div className="min-h-screen bg-[var(--bg)]">
      {/* Top bar (traffic light safe zone) */}
      <div className="drag-region" />

      {/* Header */}
      <div className="px-8 pt-4 pb-6 flex items-end justify-between">
        <div>
          <h1 className="text-3xl font-serif font-bold text-[var(--fg)] tracking-tight">Lekhanam</h1>
          <p className="text-sm text-[var(--fg-muted)] mt-0.5">Your writing library</p>
        </div>
        <div className="no-drag flex items-center gap-2">
          {/* Shield: enable / disable app lock — only on Macs that have Touch ID */}
          {touchIdAvailable && (
            <button
              onClick={handleToggleLock}
              disabled={togglingLock}
              title={isEnabled ? 'Disable App Lock (Touch ID required)' : 'Enable App Lock (Touch ID required)'}
              className={`p-2.5 rounded-xl transition-colors disabled:opacity-40 ${
                isEnabled
                  ? 'text-[var(--accent)] bg-[var(--bg-amber)] hover:bg-amber-100'
                  : 'text-[var(--fg-muted)] hover:bg-[var(--bg-subtle)]'
              }`}
            >
              <svg
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill={isEnabled ? 'currentColor' : 'none'}
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
              </svg>
            </button>
          )}
          {/* Padlock: lock the app right now (visible only when feature is enabled) */}
          {isEnabled && (
            <button
              onClick={lock}
              title="Lock app"
              className="p-2.5 rounded-xl text-[var(--fg-muted)] hover:bg-[var(--bg-subtle)] hover:text-[var(--fg)] transition-colors"
            >
              <svg
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                <path d="M7 11V7a5 5 0 0 1 10 0v4" />
              </svg>
            </button>
          )}
          {/* Settings */}
          <button
            onClick={() => setShowSettings(true)}
            title="Settings"
            className="p-2.5 rounded-xl text-[var(--fg-muted)] hover:bg-[var(--bg-subtle)] hover:text-[var(--fg)] transition-colors"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24"
              fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/>
              <circle cx="12" cy="12" r="3"/>
            </svg>
          </button>
          <button
            onClick={() => setShowAbout(true)}
            title="About Lekhanam"
            className="p-2 rounded-xl text-[var(--fg-muted)] hover:bg-[var(--bg-subtle)] hover:text-[var(--fg)] transition-colors"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10"/>
              <line x1="12" y1="16" x2="12" y2="12"/>
              <line x1="12" y1="8" x2="12.01" y2="8"/>
            </svg>
          </button>
          <button
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-[var(--accent)] text-white font-medium text-sm hover:bg-[var(--accent-hover)] transition-colors shadow-sm"
            onClick={() => setPage('new-book')}
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M5 12h14" />
              <path d="M12 5v14" />
            </svg>
            New Book
          </button>
        </div>
      </div>

      {/* iCloud conflict banner */}
      {conflicts.length > 0 && (
        <div
          className="mx-6 mb-3 px-4 py-2.5 rounded-xl flex items-center justify-between text-sm"
          style={{ background: 'rgba(245,158,11,0.1)', border: '1px solid rgba(245,158,11,0.3)' }}
        >
          <span className="text-[var(--fg-muted)]">
            ⚠ {conflicts.length} iCloud conflict{conflicts.length > 1 ? 's' : ''} —{' '}
            <span className="font-medium text-[var(--fg)]">{conflicts[0].bookName}</span>
          </span>
          <button
            onClick={() => setShowConflictModal(true)}
            className="text-[var(--accent)] font-medium hover:underline text-sm"
          >
            Review
          </button>
        </div>
      )}

      {/* Book grid */}
      <div className="px-8 pb-20">
        {books.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24 text-center">
            <div className="w-16 h-16 rounded-xl bg-[var(--bg-subtle)] flex items-center justify-center mb-4">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="36"
                height="36"
                viewBox="0 0 24 24"
                fill="none"
                stroke="var(--accent)"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
                <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
              </svg>
            </div>
            <h2 className="text-base font-semibold text-[var(--fg)]">No books yet</h2>
            <p className="text-sm text-[var(--fg-muted)] mt-1 mb-6 max-w-xs">
              Start your first book and bring your story to life
            </p>
            <button
              className="no-drag inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-[var(--accent)] text-white font-medium text-sm hover:bg-[var(--accent-hover)] transition-colors"
              onClick={() => setPage('new-book')}
            >
              Create your first book
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-5">
            {books.map((book) => (
              <BookCard
                key={book.id}
                book={book}
                onClick={() => openBook(book)}
                onDelete={() => handleDelete(book.id)}
                onRecover={
                  book.backupHealth === 'missing' || book.backupHealth === 'corrupted'
                    ? () => handleRecover(book.id)
                    : undefined
                }
              />
            ))}
          </div>
        )}
      </div>

      {/* Load Demo Book button — fixed bottom-left */}
      <div className="no-drag fixed bottom-10 left-10" style={{ position: 'fixed' }}>
        <button
          onClick={handleLoadDemo}
          disabled={demoLoaded || loadingDemo}
          title={demoLoaded ? 'Sample book already loaded' : 'Load a sample book to explore features'}
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-medium transition-all border"
          style={{
            background: demoLoaded ? 'var(--bg-subtle)' : 'var(--bg-card)',
            border: '1px solid var(--border)',
            color: demoLoaded ? 'var(--fg-faint)' : 'var(--fg-muted)',
            cursor: demoLoaded ? 'not-allowed' : 'pointer',
            opacity: demoLoaded ? 0.5 : 1,
            boxShadow: demoLoaded ? 'none' : '0 1px 4px rgba(0,0,0,0.08)'
          }}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
            <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
            {demoLoaded
              ? <path d="M9 11l3 3 5-5" strokeWidth="2" />
              : <><line x1="12" y1="7" x2="12" y2="13" /><line x1="9" y1="10" x2="15" y2="10" /></>
            }
          </svg>
          {loadingDemo ? 'Loading…' : demoLoaded ? 'Sample book loaded' : 'Load sample book'}
        </button>
      </div>

      {/* Recycle Bin icon — fixed bottom-right (not extreme corner) */}
      <div className="no-drag fixed bottom-10 right-10" style={{ position: 'fixed' }}>
        <button
          onClick={() => setShowRecycleBin(true)}
          title="Recycle Bin"
          className={`relative w-12 h-12 rounded-2xl flex items-center justify-center shadow-md border transition-colors ${
            trashedBooks.length > 0
              ? 'text-[var(--accent)] bg-[var(--bg-amber)] border-[var(--accent)]/40 hover:bg-amber-100'
              : 'text-[var(--fg-muted)] bg-[var(--bg-card)] border-[var(--border)] hover:bg-[var(--bg-subtle)]'
          }`}
        >
          {trashedBooks.length > 0 ? (
            /* Full recycle bin — Windows-style with paper sticking out */
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="3 6 5 6 21 6" />
              <path d="M19 6l-1 14H6L5 6" />
              <path d="M10 11v6M14 11v6" />
              <path d="M9 6V4h6v2" />
              <path d="M8 4l1.5-2h5L16 4" fill="currentColor" opacity="0.45" stroke="none" />
            </svg>
          ) : (
            /* Empty recycle bin */
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="3 6 5 6 21 6" />
              <path d="M19 6l-1 14H6L5 6" />
              <path d="M10 11v6M14 11v6" />
              <path d="M9 6V4h6v2" />
            </svg>
          )}
          {trashedBooks.length > 0 && (
            <span className="absolute -top-1.5 -right-1.5 min-w-[18px] h-[18px] rounded-full bg-[var(--accent)] text-white text-[10px] font-bold flex items-center justify-center px-1 leading-none">
              {trashedBooks.length}
            </span>
          )}
        </button>
      </div>

      {/* Recycle Bin modal */}
      {showRecycleBin && (
        <RecycleBinModal
          onClose={() => setShowRecycleBin(false)}
          touchIdAvailable={touchIdAvailable}
        />
      )}

      {/* Settings panel */}
      {showSettings && <SettingsPanel onClose={() => setShowSettings(false)} />}

      {/* Conflict review modal */}
      {showConflictModal && conflicts.length > 0 && (
        <ConflictReviewModal
          conflicts={conflicts}
          onClose={() => setShowConflictModal(false)}
          onResolved={() => { setShowConflictModal(false); setConflicts([]); loadBooks() }}
        />
      )}

      {/* About modal */}
      {showAbout && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-[var(--overlay-scrim)] backdrop-blur-sm"
          onClick={() => setShowAbout(false)}
        >
          <div
            className="modal-enter bg-[var(--bg-card)] border border-[var(--border)] rounded-2xl shadow-[var(--shadow-float)] w-80 p-8 flex flex-col items-center gap-4"
            onClick={(e) => e.stopPropagation()}
          >
            <img src={appIcon} alt="Lekhanam" className="w-20 h-20 drop-shadow-lg" />

            <div className="text-center">
              <h2 className="text-lg font-semibold text-[var(--fg)]">Lekhanam</h2>
              <p className="text-xs text-[var(--fg-faint)] mt-0.5">Version {appVersion}</p>
            </div>

            <div className="w-full border-t border-[var(--border)]" />

            <div className="text-center text-xs text-[var(--fg-muted)] leading-relaxed space-y-2">
              <p>Built for writers who think locally.</p>
              <p className="text-[var(--fg-faint)]">
                All your writing lives on your Mac.<br />
                No cloud. No sync. No tracking.
              </p>
            </div>

            <div className="w-full border-t border-[var(--border)]" />

            <p className="text-[10px] text-[var(--fg-faint)] text-center">
              © {new Date().getFullYear()} Lekhanam. All rights reserved.
            </p>

            <div className="flex gap-4 text-[10px]">
              <button
                onClick={() => window.electron.shell.openExternal('https://lekhanam.app/')}
                className="text-[var(--accent)] hover:underline"
              >
                lekhanam.app
              </button>
              <span className="text-[var(--fg-faint)]">·</span>
              <button
                onClick={() => window.electron.shell.openExternal('https://lekhanam.app/privacy-policy.html')}
                className="text-[var(--fg-faint)] hover:underline"
              >
                Privacy Policy
              </button>
            </div>

            <button
              onClick={() => setShowAbout(false)}
              className="px-6 py-1.5 rounded-lg text-sm text-[var(--fg-muted)] hover:bg-[var(--bg-subtle)] transition-colors"
            >
              Close
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
