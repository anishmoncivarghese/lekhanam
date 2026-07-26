import React, { useEffect } from 'react'
import { useBookStore } from '../store/bookStore'
import { useUIStore } from '../store/uiStore'
import { useSecurityStore } from '../store/securityStore'
import DashboardTab from '../components/DashboardTab'
import CharactersTab from '../components/CharactersTab'
import ChaptersTab from '../components/ChaptersTab'
import CoverDesignTab from '../components/CoverDesignTab'
import SnapshotTab from '../components/SnapshotTab'
import StoryboardTab from '../components/StoryboardTab'

type Tab = 'dashboard' | 'characters' | 'cover' | 'chapters' | 'snapshots' | 'storyboard'

const TAB_LABELS: { id: Tab; label: string }[] = [
  { id: 'dashboard', label: 'Dashboard' },
  { id: 'characters', label: 'Characters' },
  { id: 'storyboard', label: 'Storyboard' },
  { id: 'cover', label: 'Cover Design' },
  { id: 'chapters', label: 'Content' },
  { id: 'snapshots', label: 'Snapshots' },
]

export default function BookDashboard(): React.JSX.Element {
  const { currentBook, saveCover } = useBookStore()
  const { setPage, activeBookTab, setBookTab, focusMode, toggleFocusMode, exitFocusMode } = useUIStore()
  const { isEnabled, lock } = useSecurityStore()

  // Auto-exit focus mode when switching away from the chapters tab
  useEffect(() => {
    if (activeBookTab !== 'chapters') exitFocusMode()
  }, [activeBookTab])

  // ⌘⇧F toggles focus mode; Escape exits it
  useEffect(() => {
    const handler = (e: KeyboardEvent): void => {
      if (e.metaKey && e.altKey && e.code === 'KeyF') {
        e.preventDefault()
        if (activeBookTab === 'chapters') toggleFocusMode()
      }
      if (e.key === 'Escape' && focusMode) exitFocusMode()
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [focusMode, activeBookTab])

  if (!currentBook) return <></>

  const handleCoverClick = async (): Promise<void> => {
    const dataUrl = await window.electron.image.openDialog()
    if (!dataUrl) return
    const ext = dataUrl.split(';')[0].split('/')[1] ?? 'jpg'
    await saveCover(currentBook.id, dataUrl, ext)
  }

  return (
    <div className="flex flex-col h-screen bg-[var(--bg)]">
      {/* Traffic light safe region */}
      <div className="drag-region flex-shrink-0" />

      {/* Header — hidden in focus mode */}
      <div className={`overflow-hidden transition-all duration-300 ease-in-out flex-shrink-0 ${focusMode ? 'max-h-0' : 'max-h-[88px]'}`}>
      <header className="flex items-center gap-4 px-6 pb-3 pt-1 border-b border-[var(--border)] bg-[var(--bg)]">
        {/* Back */}
        <button
          onClick={() => setPage('home')}
          className="no-drag text-[var(--fg-muted)] hover:text-[var(--fg)] transition-colors flex-shrink-0"
          title="Back to library"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="m15 18-6-6 6-6" />
          </svg>
        </button>

        {/* Book cover mini */}
        <div
          onClick={handleCoverClick}
          className="no-drag w-9 h-12 rounded flex-shrink-0 overflow-hidden bg-[var(--bg-subtle)] border border-[var(--border)] cursor-pointer hover:opacity-80 transition-opacity"
          title="Change cover"
        >
          {currentBook.coverDataUrl ? (
            <img
              src={currentBook.coverDataUrl}
              alt="cover"
              className="w-full h-full object-cover"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center">
              <span className="text-base font-serif font-bold text-[var(--accent)] opacity-50">
                {currentBook.name.charAt(0)}
              </span>
            </div>
          )}
        </div>

        {/* Title & synopsis */}
        <div className="min-w-0 flex-1">
          <h1 className="text-base font-serif font-bold text-[var(--fg)] truncate leading-tight">
            {currentBook.name}
          </h1>
          {currentBook.synopsis && (
            <p className="text-xs text-[var(--fg-muted)] truncate">{currentBook.synopsis}</p>
          )}
        </div>

        {/* Tab nav */}
        <nav className="no-drag flex items-center gap-1 flex-shrink-0">
          {TAB_LABELS.map(({ id, label }) => (
            <button
              key={id}
              onClick={() => setBookTab(id)}
              className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                activeBookTab === id
                  ? 'bg-[var(--accent)] text-white shadow-sm'
                  : 'text-[var(--fg-muted)] hover:bg-[var(--bg-subtle)] hover:text-[var(--fg)]'
              }`}
            >
              {label}
            </button>
          ))}

          {isEnabled && (
            <button
              onClick={lock}
              title="Lock app"
              className="ml-1 p-1.5 rounded-lg text-[var(--fg-muted)] hover:bg-[var(--bg-subtle)] hover:text-[var(--fg)] transition-colors"
            >
              <svg
                width="16"
                height="16"
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
        </nav>
      </header>
      </div>

      {/* Tab content */}
      <div className="flex-1 overflow-hidden">
        {/* CoverDesignTab is always mounted to preserve canvas state across tab switches */}
        <div className="h-full" style={{ display: activeBookTab === 'cover' ? 'flex' : 'none' }}>
          <CoverDesignTab />
        </div>
        {activeBookTab === 'dashboard' && (
          <div className="h-full overflow-y-auto">
            <DashboardTab />
          </div>
        )}
        {activeBookTab === 'characters' && (
          <div className="h-full overflow-y-auto">
            <CharactersTab />
          </div>
        )}
        {activeBookTab === 'chapters' && (
          <div className="h-full">
            <ChaptersTab />
          </div>
        )}
        {activeBookTab === 'snapshots' && (
          <div className="h-full">
            <SnapshotTab />
          </div>
        )}
        {activeBookTab === 'storyboard' && (
          <div className="h-full">
            <StoryboardTab />
          </div>
        )}
      </div>

    </div>
  )
}
