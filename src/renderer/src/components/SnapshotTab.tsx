import React, { useEffect, useState } from 'react'
import { Snapshot } from '../types'
import { useBookStore } from '../store/bookStore'
import { useUIStore } from '../store/uiStore'
import { useSnapshotStore, formatSnapshotDate, formatSnapshotDateTime } from '../store/snapshotStore'
import SnapshotDialog from './SnapshotDialog'
import RichTextEditor from './RichTextEditor'

type View = 'list' | 'detail'

export default function SnapshotTab(): React.JSX.Element {
  const { currentBook, chapters, loadChapters } = useBookStore()
  const { setBookTab } = useUIStore()
  const { snapshots, isLoading, isSaving, loadSnapshots, deleteSnapshot, restoreSnapshot } =
    useSnapshotStore()

  const [view, setView] = useState<View>('list')
  const [selectedSnapshot, setSelectedSnapshot] = useState<Snapshot | null>(null)
  const [activeChapterId, setActiveChapterId] = useState<string | null>(null)
  const [showDialog, setShowDialog] = useState(false)
  const [confirmingDeleteId, setConfirmingDeleteId] = useState<string | null>(null)
  const [confirmRestore, setConfirmRestore] = useState(false)
  const [isRestoring, setIsRestoring] = useState(false)

  useEffect(() => {
    if (currentBook) loadSnapshots(currentBook.id)
  }, [currentBook?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  if (!currentBook) return <></>

  const activeChapter =
    selectedSnapshot
      ? (selectedSnapshot.chapters.find((c) => c.id === activeChapterId) ??
          selectedSnapshot.chapters.slice().sort((a, b) => a.order - b.order)[0] ??
          null)
      : null

  const handleOpenDetail = (snap: Snapshot): void => {
    setSelectedSnapshot(snap)
    const sorted = snap.chapters.slice().sort((a, b) => a.order - b.order)
    setActiveChapterId(sorted[0]?.id ?? null)
    setConfirmRestore(false)
    setConfirmingDeleteId(null)
    setView('detail')
  }

  const handleBack = (): void => {
    setSelectedSnapshot(null)
    setActiveChapterId(null)
    setConfirmRestore(false)
    setConfirmingDeleteId(null)
    setView('list')
  }

  const handleDelete = async (snapshotId: string): Promise<void> => {
    await deleteSnapshot(snapshotId, currentBook.id)
    setConfirmingDeleteId(null)
    if (view === 'detail' && selectedSnapshot?.id === snapshotId) handleBack()
  }

  const handleRestore = async (): Promise<void> => {
    if (!selectedSnapshot || isRestoring) return
    setIsRestoring(true)
    setConfirmRestore(false)
    try {
      await restoreSnapshot(currentBook.id, selectedSnapshot, chapters, async () => {
        await loadChapters(currentBook.id)
        setBookTab('chapters')
      })
    } catch (err) {
      alert(`Restore failed: ${String(err)}`)
    } finally {
      setIsRestoring(false)
    }
  }

  // ── List View ──────────────────────────────────────────────────────────────

  if (view === 'list') {
    return (
      <div className="h-full overflow-y-auto bg-[var(--bg)]">
        <div className="max-w-2xl mx-auto px-6 py-8">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-lg font-semibold text-[var(--fg)]">
              Snapshots
              {snapshots.length > 0 && (
                <span className="ml-1.5 text-sm font-normal text-[var(--fg-muted)]">
                  ({snapshots.length})
                </span>
              )}
            </h2>
            <button
              onClick={() => setShowDialog(true)}
              disabled={isSaving}
              className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[var(--accent)] text-white text-sm font-semibold hover:bg-[var(--accent-hover)] transition-colors disabled:opacity-50"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24"
                fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z"/>
                <circle cx="12" cy="13" r="3"/>
              </svg>
              {isSaving ? 'Saving…' : 'Create Snapshot'}
            </button>
          </div>

          {isLoading && (
            <div className="flex items-center justify-center py-16 text-[var(--fg-muted)]">
              <svg className="animate-spin w-5 h-5 mr-2" viewBox="0 0 24 24" fill="none"
                stroke="currentColor" strokeWidth="2">
                <path d="M21 12a9 9 0 1 1-6.219-8.56"/>
              </svg>
              Loading…
            </div>
          )}

          {!isLoading && snapshots.length === 0 && (
            <div className="flex flex-col items-center justify-center py-20 text-center">
              <div className="w-16 h-16 rounded-2xl bg-[var(--bg-subtle)] flex items-center justify-center mb-4">
                <svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24"
                  fill="none" stroke="var(--accent)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z"/>
                  <circle cx="12" cy="13" r="3"/>
                </svg>
              </div>
              <p className="text-[var(--fg)] font-medium">No snapshots yet</p>
              <p className="text-sm text-[var(--fg-muted)] mt-1 mb-5">
                Save a snapshot to preserve your current content as a named version.
              </p>
              <button
                onClick={() => setShowDialog(true)}
                className="px-4 py-2 rounded-xl bg-[var(--accent)] text-white text-sm font-medium hover:bg-[var(--accent-hover)] transition-colors"
              >
                Create First Snapshot
              </button>
            </div>
          )}

          {!isLoading && snapshots.length > 0 && (
            <div className="flex flex-col gap-3">
              {snapshots.map((snap) => (
                <div
                  key={snap.id}
                  onClick={() => handleOpenDetail(snap)}
                  className="group relative flex items-center justify-between px-5 py-4 rounded-xl border border-[var(--border)] bg-[var(--bg-card)] hover:border-[var(--accent)]/50 hover:shadow-sm cursor-pointer transition-all"
                >
                  <div className="min-w-0 flex-1">
                    <p className="font-medium text-[var(--fg)] truncate">{snap.name}</p>
                    <p className="text-xs text-[var(--fg-muted)] mt-0.5">
                      {snap.chapterCount} {snap.chapterCount === 1 ? 'chapter' : 'chapters'} •{' '}
                      {snap.totalWordCount.toLocaleString()} words
                    </p>
                  </div>
                  <div className="flex items-center gap-3 ml-4 flex-shrink-0">
                    <span className="text-xs text-[var(--fg-muted)]">
                      {formatSnapshotDate(snap.createdAt)}
                    </span>
                    {confirmingDeleteId === snap.id ? (
                      <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                        <button
                          onClick={() => handleDelete(snap.id)}
                          className="px-2 py-1 rounded-lg text-xs bg-red-500 text-white hover:bg-red-600 transition-colors"
                        >
                          Delete
                        </button>
                        <button
                          onClick={() => setConfirmingDeleteId(null)}
                          className="px-2 py-1 rounded-lg text-xs text-[var(--fg-muted)] hover:bg-[var(--bg-subtle)] transition-colors"
                        >
                          Cancel
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={(e) => { e.stopPropagation(); setConfirmingDeleteId(snap.id) }}
                        className="opacity-0 group-hover:opacity-100 p-1.5 rounded-lg text-[var(--fg-faint)] hover:text-red-400 hover:bg-[var(--bg-subtle)] transition-all"
                        title="Delete snapshot"
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13"
                          viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"
                          strokeLinecap="round" strokeLinejoin="round">
                          <path d="M18 6 6 18"/><path d="m6 6 12 12"/>
                        </svg>
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {showDialog && (
          <SnapshotDialog
            bookId={currentBook.id}
            chapters={chapters}
            onClose={() => setShowDialog(false)}
            onSaved={() => setShowDialog(false)}
          />
        )}
      </div>
    )
  }

  // ── Detail View ────────────────────────────────────────────────────────────

  const snap = selectedSnapshot!
  const dateStr = formatSnapshotDateTime(new Date(snap.createdAt))
  const sortedChapters = snap.chapters.slice().sort((a, b) => a.order - b.order)

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-2.5 border-b border-[var(--border)] bg-[var(--bg)] flex-shrink-0">
        <button
          onClick={handleBack}
          className="text-[var(--fg-muted)] hover:text-[var(--fg)] transition-colors flex-shrink-0"
          title="Back to snapshots"
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24"
            fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="m15 18-6-6 6-6"/>
          </svg>
        </button>
        <div className="min-w-0 flex-1">
          <p className="font-semibold text-[var(--fg)] truncate text-sm">{snap.name}</p>
          <p className="text-xs text-[var(--fg-muted)]">
            {dateStr} • {snap.chapterCount} {snap.chapterCount === 1 ? 'chapter' : 'chapters'} • {snap.totalWordCount.toLocaleString()} words
          </p>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          {/* Restore control */}
          {confirmRestore ? (
            <div className="flex items-center gap-2">
              <span className="text-xs text-[var(--fg-muted)]">Replace current content?</span>
              <button
                onClick={handleRestore}
                disabled={isRestoring}
                className="px-3 py-1.5 rounded-[10px] bg-[var(--accent)] text-white text-xs font-semibold hover:bg-[var(--accent-hover)] transition-colors disabled:opacity-50"
              >
                {isRestoring ? 'Restoring…' : 'Yes, Restore'}
              </button>
              <button
                onClick={() => setConfirmRestore(false)}
                className="px-3 py-1.5 rounded-[10px] border border-[var(--border)] text-[var(--fg-muted)] text-xs font-medium hover:bg-[var(--bg-subtle)] transition-colors"
              >
                Cancel
              </button>
            </div>
          ) : (
            <button
              onClick={() => setConfirmRestore(true)}
              disabled={isRestoring}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-[10px] bg-[var(--accent)] text-white text-xs font-semibold hover:bg-[var(--accent-hover)] transition-colors disabled:opacity-50"
              title="Restore this snapshot as current content"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24"
                fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"/>
                <path d="M21 3v5h-5"/>
                <path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"/>
                <path d="M8 16H3v5"/>
              </svg>
              Restore
            </button>
          )}
          {/* Delete control */}
          {confirmingDeleteId === snap.id ? (
            <div className="flex items-center gap-1">
              <button
                onClick={() => handleDelete(snap.id)}
                className="px-3 py-1.5 rounded-lg text-xs bg-red-500 text-white hover:bg-red-600 transition-colors"
              >
                Delete
              </button>
              <button
                onClick={() => setConfirmingDeleteId(null)}
                className="px-3 py-1.5 rounded-lg text-xs border border-[var(--border)] text-[var(--fg-muted)] hover:bg-[var(--bg-subtle)] transition-colors"
              >
                Cancel
              </button>
            </div>
          ) : (
            <button
              onClick={() => setConfirmingDeleteId(snap.id)}
              className="p-2 rounded-lg text-[var(--fg-faint)] hover:text-red-400 hover:bg-[var(--bg-subtle)] transition-colors"
              title="Delete this snapshot"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24"
                fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="3 6 5 6 21 6"/>
                <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>
                <path d="M10 11v6"/><path d="M14 11v6"/>
                <path d="M9 6V4h6v2"/>
              </svg>
            </button>
          )}
        </div>
      </div>

      {/* Two-panel reader */}
      <div className="flex flex-1 overflow-hidden">
        {/* Chapter sidebar */}
        <div className="w-52 flex-shrink-0 border-r border-[var(--border)] flex flex-col bg-[var(--bg)] overflow-y-auto">
          <div className="py-1">
            {sortedChapters.length === 0 ? (
              <p className="px-4 py-4 text-xs text-[var(--fg-faint)]">No chapters in this snapshot.</p>
            ) : (
              sortedChapters.map((chapter) => {
                const isActive = (activeChapterId ?? sortedChapters[0]?.id) === chapter.id
                return (
                  <div
                    key={chapter.id}
                    onClick={() => setActiveChapterId(chapter.id)}
                    className={`flex items-center gap-2 px-3 py-2 mx-1 rounded-lg cursor-pointer select-none transition-colors ${
                      isActive
                        ? 'bg-[var(--bg-amber)] text-[var(--accent-hover)]'
                        : 'text-[var(--fg-muted)] hover:bg-[var(--bg-subtle)]'
                    }`}
                  >
                    <span className={`flex-1 min-w-0 text-xs truncate ${isActive ? 'font-semibold' : ''}`}>
                      {chapter.title}
                    </span>
                    {chapter.wordCount > 0 && (
                      <span className="text-[9px] text-[var(--fg-faint)] flex-shrink-0">
                        {chapter.wordCount.toLocaleString()}w
                      </span>
                    )}
                  </div>
                )
              })
            )}
          </div>
        </div>

        {/* Read-only content */}
        <div className="flex-1 overflow-hidden bg-[var(--bg-card)]">
          {activeChapter ? (
            <RichTextEditor
              content={activeChapter.content}
              bookId={currentBook.id}
              formatKey={currentBook.format}
              readOnly={true}
              onChange={() => { /* no-op: read-only */ }}
            />
          ) : (
            <div className="flex items-center justify-center h-full text-[var(--fg-faint)] text-sm">
              Select a chapter to preview
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
