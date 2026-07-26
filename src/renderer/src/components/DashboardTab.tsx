import React, { useState, useEffect } from 'react'
import { format } from 'date-fns'
import { useBookStore } from '../store/bookStore'
import { useSecurityStore } from '../store/securityStore'
import { useUIStore } from '../store/uiStore'
import { getWordsLastNDays, getTodayWordCount, getGoalProgress, getStreak } from '../utils/wordStats'
import { BOOK_FORMATS, DEFAULT_FORMAT_KEY } from '../constants/bookFormats'
import { DEFAULT_BOOK_STYLE } from '../types'
import FormatSelector from './FormatSelector'
import BookTrashModal from './BookTrashModal'

export default function DashboardTab(): React.JSX.Element {
  const { currentBook, chapters, acts, saveBook, bookTrashItems, loadBookTrash, sessionStartTotal, resetSession } = useBookStore()
  const { isEnabled, setEnabled } = useSecurityStore()
  const { isDark, toggleTheme } = useUIStore()
  const [canUseTouchId, setCanUseTouchId] = useState(false)
  const [goalType, setGoalType] = useState<'daily' | 'weekly' | 'monthly'>(
    (currentBook?.wordGoals && Object.keys(currentBook.wordGoals)[0] as 'daily' | 'weekly' | 'monthly') || 'daily'
  )
  const [goalValue, setGoalValue] = useState<string>(
    String(
      (currentBook?.wordGoals?.daily ?? currentBook?.wordGoals?.weekly ?? currentBook?.wordGoals?.monthly) || ''
    )
  )
  const [saving, setSaving] = useState(false)
  const [toggleError, setToggleError] = useState<string | null>(null)
  const [showBookTrash, setShowBookTrash] = useState(false)
  const [historyDays, setHistoryDays] = useState<7 | 30>(7)
  const [titleDraft, setTitleDraft] = useState(currentBook?.name ?? '')
  const [authorDraft, setAuthorDraft] = useState(currentBook?.author ?? '')
  const [synopsisDraft, setSynopsisDraft] = useState(currentBook?.synopsis ?? '')
  const [isEditingInfo, setIsEditingInfo] = useState(false)

  useEffect(() => {
    window.electron.auth.canTouchId().then(setCanUseTouchId)
  }, [])

  useEffect(() => {
    if (currentBook) loadBookTrash(currentBook.id)
  }, [currentBook?.id])

  // Sync drafts when the active book changes
  useEffect(() => {
    setTitleDraft(currentBook?.name ?? '')
    setAuthorDraft(currentBook?.author ?? '')
    setSynopsisDraft(currentBook?.synopsis ?? '')
  }, [currentBook?.id])

  const toggleSecurity = async (): Promise<void> => {
    if (isEnabled) {
      try {
        await window.electron.auth.promptTouchId('Disable Lekhanam security lock')
        setEnabled(false)
      } catch {
        setToggleError('Touch ID required to disable the lock')
        setTimeout(() => setToggleError(null), 2500)
      }
    } else {
      setEnabled(true)
    }
  }

  if (!currentBook) return <></>

  const activeFormat =
    BOOK_FORMATS[currentBook.format ?? DEFAULT_FORMAT_KEY] ?? BOOK_FORMATS[DEFAULT_FORMAT_KEY]

  const totalWords = chapters.reduce((sum, c) => sum + (c.wordCount || 0), 0)
  const wordsLastWeek = getWordsLastNDays(currentBook.wordHistory, historyDays)
  const todayWords = getTodayWordCount(currentBook.wordHistory)
  const sessionWords = Math.max(0, totalWords - sessionStartTotal)
  const streak = currentBook.wordGoals?.daily
    ? getStreak(currentBook.wordHistory, currentBook.wordGoals.daily)
    : 0

  const activeGoal =
    currentBook.wordGoals?.daily ??
    currentBook.wordGoals?.weekly ??
    currentBook.wordGoals?.monthly

  const activeGoalType = currentBook.wordGoals?.daily
    ? 'daily'
    : currentBook.wordGoals?.weekly
      ? 'weekly'
      : currentBook.wordGoals?.monthly
        ? 'monthly'
        : undefined

  const progress =
    activeGoal && activeGoalType
      ? getGoalProgress(currentBook.wordHistory, activeGoalType, activeGoal)
      : null

  const saveGoal = async (): Promise<void> => {
    if (!currentBook) return
    const num = parseInt(goalValue)
    if (isNaN(num) || num <= 0) return
    setSaving(true)
    await saveBook({
      ...currentBook,
      wordGoals: { [goalType]: num } as { daily?: number; weekly?: number; monthly?: number },
      updatedAt: new Date().toISOString()
    })
    setSaving(false)
  }

  const saveBookInfo = async (): Promise<void> => {
    const trimmedTitle = titleDraft.trim()
    const updated = {
      ...currentBook,
      name: trimmedTitle || currentBook.name,
      author: authorDraft,
      synopsis: synopsisDraft,
      updatedAt: new Date().toISOString()
    }
    if (
      updated.name !== currentBook.name ||
      updated.author !== currentBook.author ||
      updated.synopsis !== currentBook.synopsis
    ) {
      await saveBook(updated)
    }
  }

  const handleToggleEdit = async (): Promise<void> => {
    if (isEditingInfo) {
      await saveBookInfo()
      setIsEditingInfo(false)
    } else {
      setIsEditingInfo(true)
    }
  }

  // Activity chart data — dynamic based on historyDays
  const activityDays = Array.from({ length: historyDays }, (_, i) => {
    const d = new Date()
    d.setDate(d.getDate() - (historyDays - 1 - i))
    const dateStr = d.toISOString().slice(0, 10)
    const entry = currentBook.wordHistory.find((h) => h.date === dateStr)
    const label = historyDays === 7
      ? ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'][d.getDay()]
      : `${d.getMonth() + 1}/${d.getDate()}`
    return {
      day: label,
      count: entry?.count ?? 0,
      isToday: i === historyDays - 1
    }
  })
  const maxDayWords = Math.max(...activityDays.map((d) => d.count), 1)

  return (
    <>
    <div className="p-8 flex gap-8 items-start">

      {/* ── Left column — book identity ── */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between mb-8">
          <h2 className="text-xl font-semibold text-[var(--fg)]">Dashboard</h2>
          <div className="flex items-center gap-2">
            {/* Auto-save toggle */}
            {currentBook && (() => {
              const autoSave = currentBook.style?.autoSave ?? true
              const toggleAutoSave = (): void => {
                const next = !autoSave
                saveBook({ ...currentBook, style: { ...(currentBook.style ?? DEFAULT_BOOK_STYLE), autoSave: next }, updatedAt: new Date().toISOString() })
              }
              return (
                <div className="flex items-center gap-2 pl-2.5 pr-1.5 py-1 rounded-xl border border-[var(--border)] bg-[var(--bg-subtle)] select-none">
                  <span className={`text-[11px] font-medium whitespace-nowrap transition-colors duration-200 ${autoSave ? 'text-[var(--fg)]' : 'text-[var(--fg-muted)]'}`}>
                    Auto-save
                  </span>
                  <button
                    role="switch"
                    aria-checked={autoSave}
                    onClick={toggleAutoSave}
                    title={autoSave ? 'Auto-save ON — click to disable' : 'Auto-save OFF — click to enable'}
                    className={`relative flex-shrink-0 overflow-hidden w-11 h-6 rounded-full transition-colors duration-200 focus:outline-none ${autoSave ? 'bg-[var(--accent)]' : 'bg-[var(--fg-faint)]'}`}
                  >
                    <span
                      className="absolute left-0 top-[2px] w-5 h-5 rounded-full bg-white transition-transform duration-200"
                      style={{ transform: autoSave ? 'translateX(22px)' : 'translateX(2px)', boxShadow: '0 1px 4px rgba(0,0,0,0.28), 0 0.5px 1px rgba(0,0,0,0.12)' }}
                    />
                  </button>
                </div>
              )
            })()}
            {/* Dark / Light toggle */}
            <button
              onClick={toggleTheme}
              title={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
              className="flex items-center gap-2 px-3 py-1.5 rounded-[10px] border border-[var(--border)] bg-[var(--bg-subtle)] hover:bg-[var(--border)] transition-colors"
            >
              {isDark ? (
                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-[var(--fg-muted)]">
                  <path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"/>
                </svg>
              ) : (
                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-[var(--fg-muted)]">
                  <circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41"/>
                </svg>
              )}
              <span className="text-xs font-medium text-[var(--fg-muted)]">{isDark ? 'Dark' : 'Light'}</span>
              <div className={`relative w-8 h-4 rounded-full transition-colors ${isDark ? 'bg-[var(--accent)]' : 'bg-[var(--border)]'}`}>
                <span className={`absolute top-0.5 left-0.5 w-3 h-3 bg-[var(--bg-card)] rounded-full shadow transition-transform ${isDark ? 'translate-x-4' : 'translate-x-0'}`} />
              </div>
            </button>
          </div>
        </div>

        {/* Stats grid */}
        <div className="grid grid-cols-4 gap-3 mb-8">
          <StatCard label="Total Words" value={totalWords.toLocaleString()} icon="📝" />
          <StatCard label={`Words (${historyDays}d)`} value={wordsLastWeek.toLocaleString()} icon="📅" />
          <StatCard label="Acts / Sections" value={acts.length.toString()} icon="🎭" />
          <StatCard label="Chapters" value={chapters.filter((c) => !c.kind || c.kind === 'chapter').length.toString()} icon="📖" />
        </div>

        {/* Format card */}
        <div className="mb-8 p-5 rounded-xl border border-[var(--border)] bg-[var(--bg-card)] shadow-[var(--shadow-card-md)] flex items-center justify-between gap-4">
          <div className="min-w-0">
            <p className="text-[11px] font-semibold text-[var(--fg-faint)] uppercase tracking-wider mb-0.5">
              Page Format
            </p>
            <p className="text-sm font-medium text-[var(--fg)]">
              {activeFormat.name} — {activeFormat.widthIn} × {activeFormat.heightIn}&thinsp;in
            </p>
            <p className="text-xs text-[var(--fg-muted)] mt-0.5 leading-snug">{activeFormat.useCase}</p>
          </div>
          <FormatSelector />
        </div>

        {/* Book Info */}
        <div className="p-5 rounded-xl border border-[var(--border)] bg-[var(--bg-card)] shadow-[var(--shadow-card-md)]">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-base font-semibold text-[var(--fg)]">Book Info</h3>
            <button
              onClick={handleToggleEdit}
              title={isEditingInfo ? 'Save changes' : 'Edit book info'}
              className="p-1.5 rounded-lg text-[var(--fg-muted)] hover:text-[var(--fg)] hover:bg-[var(--bg-subtle)] transition-colors"
            >
              {isEditingInfo ? (
                /* Check icon — save */
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
              ) : (
                /* Pencil icon — edit */
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                  <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                </svg>
              )}
            </button>
          </div>

          {/* Title */}
          <div className="mb-4">
            <label className="text-[11px] font-semibold text-[var(--fg-faint)] uppercase tracking-wider mb-1 block">
              Title
            </label>
            {isEditingInfo ? (
              <input
                type="text"
                value={titleDraft}
                onChange={(e) => setTitleDraft(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur() }}
                placeholder="Book title…"
                className="w-full px-3 py-2 rounded-[10px] border border-[var(--border)] bg-[var(--bg)] text-sm font-serif font-semibold text-[var(--fg)] placeholder-[var(--fg-faint)] focus:outline-none focus:ring-2 focus:ring-[var(--focus-ring)] focus:border-[var(--accent)]"
              />
            ) : (
              <p className="text-sm font-serif font-semibold text-[var(--fg)] px-0.5">
                {titleDraft || <span className="text-[var(--fg-faint)] font-normal">No title</span>}
              </p>
            )}
          </div>

          {/* Author */}
          <div className="mb-4">
            <label className="text-[11px] font-semibold text-[var(--fg-faint)] uppercase tracking-wider mb-1 block">
              Author
            </label>
            {isEditingInfo ? (
              <input
                type="text"
                value={authorDraft}
                onChange={(e) => setAuthorDraft(e.target.value)}
                placeholder="Add author name…"
                className="w-full px-3 py-2 rounded-[10px] border border-[var(--border)] bg-[var(--bg)] text-sm text-[var(--fg)] placeholder-[var(--fg-faint)] focus:outline-none focus:ring-2 focus:ring-[var(--focus-ring)] focus:border-[var(--accent)]"
              />
            ) : (
              <p className="text-sm text-[var(--fg)] px-0.5">
                {authorDraft || <span className="text-[var(--fg-faint)]">No author</span>}
              </p>
            )}
          </div>

          {/* Synopsis */}
          <div className="mb-4">
            <label className="text-[11px] font-semibold text-[var(--fg-faint)] uppercase tracking-wider mb-1 block">
              Synopsis
            </label>
            {isEditingInfo ? (
              <textarea
                value={synopsisDraft}
                onChange={(e) => setSynopsisDraft(e.target.value)}
                placeholder="What is your book about…"
                rows={7}
                className="w-full px-3 py-2 rounded-[10px] border border-[var(--border)] bg-[var(--bg)] text-sm text-[var(--fg)] placeholder-[var(--fg-faint)] focus:outline-none focus:ring-2 focus:ring-[var(--focus-ring)] focus:border-[var(--accent)] resize-y leading-relaxed min-h-[80px]"
              />
            ) : (
              <p className="text-sm text-[var(--fg)] px-0.5 leading-relaxed whitespace-pre-wrap">
                {synopsisDraft || <span className="text-[var(--fg-faint)]">No synopsis</span>}
              </p>
            )}
          </div>

          {/* Dates */}
          <div className="flex flex-col gap-1.5 pt-3 border-t border-[var(--border)]">
            <div className="flex justify-between items-center">
              <span className="text-xs text-[var(--fg-faint)]">Created</span>
              <span className="text-xs text-[var(--fg-muted)]">
                {format(new Date(currentBook.createdAt), 'MMM d, yyyy')}
              </span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-xs text-[var(--fg-faint)]">Last edited</span>
              <span className="text-xs text-[var(--fg-muted)]">
                {format(new Date(currentBook.updatedAt), 'MMM d, yyyy')}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* ── Right column — writing metrics & settings ── */}
      <div className="w-80 flex-shrink-0 flex flex-col gap-6">

        {/* Today's count + session */}
        <div className="p-5 rounded-xl bg-[var(--bg-amber)] border border-[var(--border-amber)] shadow-[var(--shadow-card-md)]">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-sm text-[var(--today-title)] font-medium">Today</p>
              <p className="text-2xl font-serif font-bold tracking-tight text-[var(--today-value)] mt-0.5">
                {todayWords.toLocaleString()}{' '}
                <span className="text-base font-normal text-[var(--today-title)]">words</span>
              </p>
            </div>
            {streak >= 2 && (
              <div className="flex flex-col items-center gap-0.5">
                <span className="text-xl leading-none">🔥</span>
                <span className="text-[10px] font-bold text-[var(--today-title)]">{streak}d streak</span>
              </div>
            )}
          </div>
          <div className="mt-2.5 pt-2.5 border-t border-[var(--border-amber)] flex items-center justify-between">
            <div>
              <span className="text-xs text-[var(--today-title)]">Session </span>
              <span className="text-sm font-semibold text-[var(--today-value)]">
                {sessionWords > 0 ? `+${sessionWords.toLocaleString()} words` : '—'}
              </span>
            </div>
            {sessionWords > 0 && (
              <button
                onClick={resetSession}
                title="Reset session counter to zero"
                className="text-[10px] text-[var(--today-title)] hover:underline"
              >
                Reset
              </button>
            )}
          </div>
        </div>

        {/* Goal progress */}
        {progress && (
          <div className="p-5 rounded-xl border border-[var(--border)] bg-[var(--bg-card)] shadow-[var(--shadow-card-md)]">
            <div className="flex justify-between items-center mb-2">
              <p className="text-sm font-medium text-[var(--fg)] capitalize">
                {activeGoalType} goal
              </p>
              <p className="text-sm text-[var(--fg-muted)]">
                {progress.current.toLocaleString()} / {progress.target.toLocaleString()}
              </p>
            </div>
            <div className="w-full h-2.5 bg-[var(--bg-subtle)] rounded-full overflow-hidden shadow-inner">
              <div
                className="h-full rounded-full transition-all duration-500"
                style={{ width: `${progress.percentage}%`, background: 'linear-gradient(to right, var(--accent), var(--accent-light))' }}
              />
            </div>
            <p className="text-xs text-[var(--fg-muted)] mt-1">{progress.percentage}% complete</p>
          </div>
        )}

        {/* Word goal setter */}
        <div className="p-5 rounded-xl border border-[var(--border)] bg-[var(--bg-card)] shadow-[var(--shadow-card-md)]">
          <h3 className="text-base font-semibold text-[var(--fg)] mb-4">Set Writing Goal</h3>
          <div className="flex gap-2 mb-4">
            {(['daily', 'weekly', 'monthly'] as const).map((t) => (
              <button
                key={t}
                onClick={() => setGoalType(t)}
                className={`flex-1 py-2 rounded-lg text-sm font-medium transition-colors capitalize ${
                  goalType === t
                    ? 'bg-[var(--accent)] text-white'
                    : 'bg-[var(--bg-subtle)] text-[var(--fg-muted)] hover:bg-[#e7e0d8]'
                }`}
              >
                {t}
              </button>
            ))}
          </div>
          <div className="flex gap-3 items-center">
            <input
              type="number"
              min="1"
              value={goalValue}
              onChange={(e) => setGoalValue(e.target.value)}
              placeholder="e.g. 500"
              className="w-24 min-w-0 px-3 py-2.5 rounded-[10px] border border-[var(--border)] bg-[var(--bg)] text-[var(--fg)] placeholder-[var(--fg-faint)] focus:outline-none focus:ring-2 focus:ring-[var(--focus-ring)] focus:border-[var(--accent)] text-sm"
            />
            <span className="text-sm text-[var(--fg-muted)]">words</span>
            <button
              onClick={saveGoal}
              disabled={saving || !goalValue}
              className="px-4 py-2.5 rounded-[10px] bg-[var(--accent)] text-white text-sm font-medium hover:bg-[var(--accent-hover)] transition-colors disabled:opacity-40"
            >
              {saving ? 'Saving…' : 'Save'}
            </button>
          </div>
        </div>

        {/* Writing Activity */}
        <div className="p-5 rounded-xl border border-[var(--border)] bg-[var(--bg-card)] shadow-[var(--shadow-card-md)]">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-base font-semibold text-[var(--fg)]">Writing Activity</h3>
            <div className="flex gap-1">
              {([7, 30] as const).map((n) => (
                <button
                  key={n}
                  onClick={() => setHistoryDays(n)}
                  className={`px-2 py-0.5 rounded-md text-[10px] font-semibold transition-colors ${
                    historyDays === n
                      ? 'bg-[var(--accent)] text-white'
                      : 'bg-[var(--bg-subtle)] text-[var(--fg-muted)] hover:bg-[var(--border)]'
                  }`}
                >
                  {n}d
                </button>
              ))}
            </div>
          </div>

          {/* Bar chart */}
          <div className="flex items-end gap-0.5 h-20 mb-2">
            {activityDays.map((d, i) => (
              <div key={i} className="flex-1 flex flex-col items-center justify-end h-full" title={`${d.day}: ${d.count.toLocaleString()} words`}>
                <div
                  className={`w-full rounded-t transition-all duration-300 ${
                    d.isToday ? 'bg-[var(--accent)] shadow-sm' : 'bg-[var(--border-accent)]'
                  }`}
                  style={{
                    height: d.count > 0
                      ? `${Math.max(12, Math.round((d.count / maxDayWords) * 80))}px`
                      : '3px'
                  }}
                />
              </div>
            ))}
          </div>

          {/* Day labels — skip some labels in 30-day view to avoid crowding */}
          <div className="flex gap-0.5">
            {activityDays.map((d, i) => (
              <div key={i} className="flex-1 text-center overflow-hidden">
                {(historyDays === 7 || i === 0 || i === activityDays.length - 1 || i % 7 === 0) && (
                  <span className={`text-[9px] font-medium ${d.isToday ? 'text-[var(--accent)]' : 'text-[var(--fg-faint)]'}`}>
                    {d.day}
                  </span>
                )}
              </div>
            ))}
          </div>

          {/* Total */}
          <div className="mt-3 pt-3 border-t border-[var(--border)] flex justify-between items-center">
            <span className="text-xs text-[var(--fg-faint)]">Last {historyDays} days</span>
            <span className="text-xs font-semibold text-[var(--fg)]">
              {wordsLastWeek.toLocaleString()} words
            </span>
          </div>
        </div>

        {/* Security */}
        <div className="p-5 rounded-xl border border-[var(--border)] bg-[var(--bg-card)] shadow-[var(--shadow-card-md)]">
          <h3 className="text-base font-semibold text-[var(--fg)] mb-1">Security</h3>
          <p className="text-xs text-[var(--fg-muted)] mb-4">
            Lock the app with Touch ID when stepping away.
          </p>
          {canUseTouchId ? (
            <>
              <div className="flex items-center justify-between">
                <span className="text-sm text-[var(--fg)]">Lock with Touch ID</span>
                <button
                  onClick={toggleSecurity}
                  className={`relative w-11 h-6 rounded-full transition-colors ${
                    isEnabled ? 'bg-[var(--accent)]' : 'bg-[#d4cdc7]'
                  }`}
                >
                  <span
                    className={`absolute top-0.5 left-0.5 w-5 h-5 bg-[var(--bg-card)] rounded-full shadow transition-transform ${
                      isEnabled ? 'translate-x-5' : 'translate-x-0'
                    }`}
                  />
                </button>
              </div>
              {toggleError && (
                <p className="mt-2 text-xs text-red-500">{toggleError}</p>
              )}
            </>
          ) : (
            <p className="text-xs text-[var(--fg-faint)]">Touch ID is not available on this Mac.</p>
          )}
        </div>

        {/* Trash */}
        <div className="p-5 rounded-xl border border-[var(--border)] bg-[var(--bg-card)] shadow-[var(--shadow-card-md)]">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-base font-semibold text-[var(--fg)]">Trash</h3>
              <p className="text-xs text-[var(--fg-muted)] mt-0.5">
                {bookTrashItems.length === 0
                  ? 'No deleted items'
                  : `${bookTrashItems.length} deleted item${bookTrashItems.length === 1 ? '' : 's'}`}
              </p>
            </div>
            <button
              onClick={() => setShowBookTrash(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-[10px] border border-[var(--border)] text-xs font-medium text-[var(--fg-muted)] hover:text-[var(--fg)] hover:bg-[var(--bg-subtle)] transition-colors"
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="3 6 5 6 21 6" />
                <path d="M19 6l-1 14H6L5 6" />
                <path d="M10 11v6M14 11v6" />
                <path d="M9 6V4h6v2" />
              </svg>
              Open
              {bookTrashItems.length > 0 && (
                <span className="ml-0.5 min-w-[18px] h-[18px] rounded-full bg-[var(--accent)] text-white text-[10px] font-bold flex items-center justify-center px-1 leading-none">
                  {bookTrashItems.length}
                </span>
              )}
            </button>
          </div>
        </div>

      </div>
    </div>

    {showBookTrash && currentBook && (
      <BookTrashModal
        bookId={currentBook.id}
        onClose={() => setShowBookTrash(false)}
        touchIdAvailable={canUseTouchId}
      />
    )}
    </>
  )
}

function StatCard({
  label,
  value,
  icon
}: {
  label: string
  value: string
  icon: string
}): React.JSX.Element {
  return (
    <div className="p-5 rounded-xl border border-[var(--border)] bg-[var(--bg-card)] shadow-[var(--shadow-card-md)]">
      <p className="text-xl mb-1">{icon}</p>
      <p className="text-2xl font-serif font-bold tracking-tight text-[var(--fg)]">{value}</p>
      <p className="text-xs text-[var(--fg-muted)] mt-0.5">{label}</p>
    </div>
  )
}
