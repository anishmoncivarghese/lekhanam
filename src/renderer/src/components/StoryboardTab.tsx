import React, { useState, useEffect, useRef, useCallback } from 'react'
import { Chapter, Act, Book, DEFAULT_BOOK_STYLE } from '../types'
import { useBookStore } from '../store/bookStore'
import { useUIStore } from '../store/uiStore'

// ── Section helpers ──────────────────────────────────────────────────────────

const FRONT_MATTER = ['half-title', 'title-page', 'copyright', 'dedication', 'toc']
const BACK_MATTER  = ['appendix', 'glossary', 'bibliography', 'index', 'author-bio']

function getSection(kind?: string): 0 | 1 | 2 {
  if (!kind || (!FRONT_MATTER.includes(kind) && !BACK_MATTER.includes(kind))) return 1
  return FRONT_MATTER.includes(kind) ? 0 : 2
}

const STATUS_COLOR: Record<string, string> = {
  draft: '#94a3b8',
  revised: '#f59e0b',
  final: '#22c55e',
}

function nanoid(): string {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36)
}

// ── Markdown helpers (for beats preview in Focus view) ───────────────────────

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function inlineMarkdown(s: string): string {
  // Escape HTML first so user input can never inject raw tags
  const e = escapeHtml(s)
  return e
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g,     '<em>$1</em>')
    .replace(/`(.+?)`/g,       '<code style="font-size:0.8em;background:var(--bg-subtle);padding:0 3px;border-radius:3px">$1</code>')
}

function renderBeats(md: string): string {
  let idx = 0
  return md.split('\n').map((line) => {
    const unchecked = line.match(/^- \[ \] (.*)/)
    const checked   = line.match(/^- \[x\] (.*)/i)
    if (unchecked) {
      const i = idx++
      return `<div style="display:flex;align-items:flex-start;gap:8px;margin-bottom:4px"><input type="checkbox" data-idx="${i}" style="margin-top:3px;cursor:pointer;accent-color:var(--accent);flex-shrink:0"><span>${inlineMarkdown(unchecked[1])}</span></div>`
    }
    if (checked) {
      const i = idx++
      return `<div style="display:flex;align-items:flex-start;gap:8px;margin-bottom:4px;opacity:0.55"><input type="checkbox" data-idx="${i}" checked style="margin-top:3px;cursor:pointer;accent-color:var(--accent);flex-shrink:0"><span style="text-decoration:line-through">${inlineMarkdown(checked[1])}</span></div>`
    }
    if (line.startsWith('# '))  return `<p style="font-weight:600;margin:12px 0 4px">${inlineMarkdown(line.slice(2))}</p>`
    if (line.startsWith('## ')) return `<p style="font-weight:500;font-size:0.7rem;text-transform:uppercase;letter-spacing:0.05em;margin:8px 0 2px;color:var(--fg-muted)">${inlineMarkdown(line.slice(3))}</p>`
    if (line.trim() === '') return '<div style="height:6px"></div>'
    return `<p style="margin-bottom:4px">${inlineMarkdown(line)}</p>`
  }).join('\n')
}

function toggleBeat(md: string, targetIdx: number): string {
  let idx = 0
  return md.split('\n').map((line) => {
    if (/^- \[ \] /i.test(line) || /^- \[x\] /i.test(line)) {
      if (idx++ === targetIdx) {
        return /^- \[x\] /i.test(line)
          ? line.replace(/^- \[x\] /i, '- [ ] ')
          : line.replace(/^- \[ \] /i, '- [x] ')
      }
    }
    return line
  }).join('\n')
}

// ── Focus view (scoped to an act's chapters) ─────────────────────────────────

interface FocusViewProps {
  chapter: Chapter
  index: number
  total: number
  actTitle: string
  autoSave: boolean
  onBack: () => void
  onPrev: () => void
  onNext: () => void
  onOpen: () => void
  onSave: (chapter: Chapter, patch: Partial<Chapter>) => void
}

function FocusView({ chapter, index, total, actTitle, autoSave, onBack, onPrev, onNext, onOpen, onSave }: FocusViewProps): React.JSX.Element {
  const [goal,  setGoal]  = useState(chapter.planGoal  ?? '')
  const [pov,   setPov]   = useState(chapter.planPov   ?? '')
  const [beats, setBeats] = useState(chapter.planBeats ?? '')
  const [sum,   setSum]   = useState(chapter.summary   ?? '')
  const [beatsPreview, setBeatsPreview] = useState(false)
  const [savedFlash, setSavedFlash] = useState(false)
  const autoSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const isDirty =
    goal  !== (chapter.planGoal  ?? '') ||
    pov   !== (chapter.planPov   ?? '') ||
    beats !== (chapter.planBeats ?? '') ||
    sum   !== (chapter.summary   ?? '')

  useEffect(() => {
    setGoal(chapter.planGoal  ?? '')
    setPov(chapter.planPov   ?? '')
    setBeats(chapter.planBeats ?? '')
    setSum(chapter.summary   ?? '')
    setBeatsPreview(false)
    setSavedFlash(false)
  }, [chapter.id])

  // Auto-save debounce (1 s) — fires whenever a field changes and autoSave is ON
  useEffect(() => {
    if (!autoSave) return
    if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current)
    autoSaveTimer.current = setTimeout(() => {
      onSave(chapter, { planGoal: goal, planPov: pov, planBeats: beats, summary: sum })
    }, 1000)
    return () => { if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current) }
  }, [goal, pov, beats, sum, autoSave])

  const handleSaveAll = (): void => {
    onSave(chapter, { planGoal: goal, planPov: pov, planBeats: beats, summary: sum })
    setSavedFlash(true)
    setTimeout(() => setSavedFlash(false), 1500)
  }

  useEffect(() => {
    const handler = (e: KeyboardEvent): void => {
      const tag = (e.target as HTMLElement).tagName
      if (tag === 'TEXTAREA' || tag === 'INPUT') return
      if (e.key === 'ArrowLeft')  onPrev()
      if (e.key === 'ArrowRight') onNext()
      if (e.key === 'Escape') onBack()
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onPrev, onNext, onBack])

  const fieldCls = `w-full bg-[var(--bg)] border border-[var(--border)] rounded-xl px-4 py-3
    text-sm text-[var(--fg)] placeholder-[var(--fg-faint)] leading-relaxed
    focus:outline-none focus:ring-2 focus:ring-[var(--focus-ring)] focus:border-[var(--accent)]`

  return (
    <div className="flex flex-col items-center justify-start py-8 px-6 min-h-full">
      {/* Back + nav row */}
      <div className="flex items-center gap-2 mb-5 w-full max-w-2xl">
        <button
          onClick={onBack}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm text-[var(--fg-muted)]
                     hover:bg-[var(--bg-card)] hover:text-[var(--fg)] transition-colors"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M19 12H5M12 5l-7 7 7 7" />
          </svg>
          <span className="text-xs">{actTitle}</span>
        </button>

        <div className="flex-1" />

        <p className="text-[10px] text-[var(--fg-faint)] uppercase tracking-widest">
          {index + 1} / {total}
        </p>

        <button
          onClick={onPrev}
          disabled={index === 0}
          className="p-1.5 rounded-lg text-[var(--fg-muted)] hover:bg-[var(--bg-card)] hover:text-[var(--fg)]
                     transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
          title="Previous chapter"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M19 12H5M12 5l-7 7 7 7" />
          </svg>
        </button>
        <button
          onClick={onNext}
          disabled={index === total - 1}
          className="p-1.5 rounded-lg text-[var(--fg-muted)] hover:bg-[var(--bg-card)] hover:text-[var(--fg)]
                     transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
          title="Next chapter"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M5 12h14M12 5l7 7-7 7" />
          </svg>
        </button>

        {/* Save button — shown only when auto-save is OFF */}
        {savedFlash ? (
          <span className="text-xs font-medium text-[var(--color-success)] px-3 py-1.5">Saved ✓</span>
        ) : !autoSave ? (
          <button
            onClick={handleSaveAll}
            disabled={!isDirty}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
              isDirty
                ? 'bg-[var(--accent)] text-white hover:bg-[var(--accent-hover)] shadow-sm'
                : 'text-[var(--fg-faint)] cursor-default'
            }`}
          >
            Save
          </button>
        ) : null}

        <button
          onClick={onOpen}
          title="Open in editor"
          className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs text-[var(--fg-muted)]
                     border border-[var(--border)] hover:bg-[var(--bg-card)] hover:text-[var(--fg)]
                     transition-colors"
        >
          Open in Editor
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M5 12h14M12 5l7 7-7 7" />
          </svg>
        </button>
      </div>

      {/* Chapter title */}
      <div className="w-full max-w-2xl mb-4">
        <h3 className="text-lg font-semibold text-[var(--fg)]">{chapter.title}</h3>
      </div>

      {/* Card */}
      <div className="w-full max-w-2xl bg-[var(--bg-card)] rounded-2xl shadow-lg border border-[var(--border)] p-8 flex flex-col gap-6">
        {/* Goal */}
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-widest text-[var(--fg-faint)] mb-2">Chapter Goal</p>
          <textarea
            value={goal}
            onChange={(e) => setGoal(e.target.value)}
            onBlur={() => { if (!autoSave && goal !== (chapter.planGoal ?? '')) onSave(chapter, { planGoal: goal }) }}
            placeholder="What must happen by the end of this chapter?"
            rows={3}
            className={`${fieldCls} resize-none`}
          />
        </div>

        {/* POV */}
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-widest text-[var(--fg-faint)] mb-2">POV Character</p>
          <input
            type="text"
            value={pov}
            onChange={(e) => setPov(e.target.value)}
            onBlur={() => { if (!autoSave && pov !== (chapter.planPov ?? '')) onSave(chapter, { planPov: pov }) }}
            placeholder="Whose eyes do we see through?"
            className={fieldCls}
          />
        </div>

        {/* Scene Beats */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <p className="text-[10px] font-semibold uppercase tracking-widest text-[var(--fg-faint)]">Scene Beats</p>
            <button
              onClick={() => setBeatsPreview((v) => !v)}
              className="text-xs text-[var(--fg-faint)] hover:text-[var(--fg)] px-2 py-0.5 rounded border border-[var(--border)] transition-colors"
            >
              {beatsPreview ? 'Edit' : 'Preview'}
            </button>
          </div>
          {beatsPreview ? (
            <div
              className="min-h-[120px] px-4 py-3 rounded-xl border border-[var(--border)] bg-[var(--bg)] text-sm leading-relaxed text-[var(--fg)]"
              dangerouslySetInnerHTML={{ __html: renderBeats(beats) }}
              onClick={(e) => {
                const cb = (e.target as HTMLElement).closest('input[type="checkbox"]') as HTMLInputElement | null
                if (!cb) return
                const toggled = toggleBeat(beats, Number(cb.dataset.idx))
                setBeats(toggled)
                onSave(chapter, { planBeats: toggled })
              }}
            />
          ) : (
            <textarea
              value={beats}
              onChange={(e) => setBeats(e.target.value)}
              onBlur={() => { if (!autoSave && beats !== (chapter.planBeats ?? '')) onSave(chapter, { planBeats: beats }) }}
              placeholder={'- [ ] Scene beat\n- [x] Done beat\n# Act break'}
              rows={5}
              className={`${fieldCls} resize-none font-mono`}
            />
          )}
          <p className="mt-1.5 text-[10px] text-[var(--fg-faint)]">
            Use <code className="bg-[var(--bg-subtle)] px-1 rounded">- [ ]</code> for checkboxes
          </p>
        </div>

        {/* Summary */}
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-widest text-[var(--fg-faint)] mb-2">Summary</p>
          <textarea
            value={sum}
            onChange={(e) => setSum(e.target.value)}
            onBlur={() => { if (!autoSave && sum !== (chapter.summary ?? '')) onSave(chapter, { summary: sum }) }}
            placeholder="What happens in this chapter?"
            rows={5}
            className={`${fieldCls} resize-none`}
          />
        </div>
      </div>
    </div>
  )
}

// ── Chapter thumbnail card (within act) ──────────────────────────────────────

interface ThumbnailProps {
  chapter: Chapter
  chapterIndex: number
  onFocus: () => void
  onOpen: () => void
  onDelete?: () => void
  onSave: (chapter: Chapter, patch: Partial<Chapter>) => void
}

function ChapterThumbnail({ chapter, chapterIndex, onFocus, onOpen, onDelete, onSave }: ThumbnailProps): React.JSX.Element {
  const statusColor = chapter.status ? STATUS_COLOR[chapter.status] : null
  const synopsis = chapter.summary || chapter.planGoal || ''

  const cycleStatus = (e: React.MouseEvent): void => {
    e.stopPropagation()
    const cycle: Record<string, Chapter['status']> = { draft: 'revised', revised: 'final', final: undefined }
    const next = chapter.status ? cycle[chapter.status] : 'draft'
    onSave(chapter, { status: next })
  }

  return (
    <div
      onClick={onFocus}
      className="group relative flex flex-col rounded-xl border border-[var(--border)] bg-[var(--bg-card)]
                 shadow-[var(--shadow-card-md)] hover:shadow-[var(--shadow-card-lg)] hover:-translate-y-0.5
                 transition-all duration-150 cursor-pointer select-none overflow-hidden min-h-[200px]"
    >
      {/* Status color strip */}
      <div style={{ height: 4, background: statusColor ?? 'var(--border)', flexShrink: 0 }} />

      {/* Header */}
      <div className="flex items-center gap-1.5 px-2.5 py-2 bg-[var(--accent)]">
        <span className="text-[9px] font-bold text-white bg-white/20 rounded px-1 py-0.5 leading-tight flex-shrink-0">
          {chapter.kind === 'chapter' || !chapter.kind
            ? `Ch ${chapterIndex + 1}`
            : chapter.kind.replace('-', ' ').replace(/\b\w/g, (c) => c.toUpperCase())}
        </span>
        <span className="flex-1 text-white text-[11px] font-semibold truncate leading-tight">{chapter.title}</span>
        {/* Status dot — clickable to cycle */}
        <button
          onClick={cycleStatus}
          title={chapter.status ? `Status: ${chapter.status} — click to change` : 'Click to set status'}
          className="w-3 h-3 rounded-full border flex-shrink-0 transition-colors hover:scale-125"
          style={{
            borderColor: statusColor ? 'rgba(255,255,255,0.5)' : 'rgba(255,255,255,0.5)',
            background: statusColor ?? 'transparent',
          }}
        />
      </div>

      {/* Body: synopsis */}
      <div className="flex flex-col flex-1 px-3 py-2.5 overflow-hidden">
        {synopsis ? (
          <p className="text-[12px] text-[var(--fg-muted)] leading-snug line-clamp-5">{synopsis}</p>
        ) : (
          <p className="text-[12px] text-[var(--fg-faint)] italic">No synopsis yet</p>
        )}
      </div>

      {/* Footer: word count + actions */}
      <div className="flex items-center justify-between px-3 pb-2.5 pt-1">
        <span className="text-[10px] text-[var(--fg-faint)]">
          {chapter.wordCount > 0 ? `${chapter.wordCount.toLocaleString()}w` : '—'}
        </span>
        <div className="flex items-center gap-1">
          {onDelete && (
            <button
              onClick={(e) => { e.stopPropagation(); onDelete() }}
              title="Delete chapter"
              className="opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded-md
                         text-red-400 hover:text-red-500 hover:bg-red-500/10"
            >
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="3 6 5 6 21 6" />
                <path d="M19 6l-1 14H6L5 6" />
                <path d="M10 11v6M14 11v6" />
                <path d="M9 6V4h6v2" />
              </svg>
            </button>
          )}
          <button
            onClick={(e) => { e.stopPropagation(); onOpen() }}
            title="Open in editor"
            className="opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded-md
                       text-white/60 hover:text-white hover:bg-white/10"
            style={{ color: 'var(--fg-muted)' }}
          >
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M5 12h14M12 5l7 7-7 7" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Act card ─────────────────────────────────────────────────────────────────

interface ActCardProps {
  act: Act
  actIndex: number
  allActs: Act[]
  chapters: Chapter[]
  structureLabelCap: string
  isNew?: boolean
  onCreated?: () => void
  onSaveAct: (act: Act) => void
  onDeleteAct: (actId: string) => void
  onAddChapter: (actId: string) => void
  onFocusChapter: (chapterId: string, actId: string) => void
  onOpenChapter: (chapter: Chapter) => void
  onDeleteChapter: (chapterId: string) => void
  onMoveChapter: (chapterId: string, targetActId: string | 'new') => void
  onSaveChapter: (chapter: Chapter, patch: Partial<Chapter>) => void
}

function ActCard({
  act, actIndex, allActs, chapters, structureLabelCap, isNew, onCreated,
  onSaveAct, onDeleteAct, onAddChapter, onFocusChapter, onOpenChapter, onDeleteChapter, onMoveChapter, onSaveChapter
}: ActCardProps): React.JSX.Element {
  const structureLabel = structureLabelCap.toLowerCase()
  const [summaryExpanded, setSummaryExpanded] = useState(true)
  const [editingTitle, setEditingTitle] = useState(false)
  const [titleValue, setTitleValue] = useState(act.title)
  const [editingSummary, setEditingSummary] = useState(false)
  const [summaryValue, setSummaryValue] = useState(act.summary)
  const [summarySavedFlash, setSummarySavedFlash] = useState(false)
  const cardRef = useRef<HTMLDivElement>(null)
  const titleInputRef = useRef<HTMLInputElement>(null)
  const summaryInputRef = useRef<HTMLTextAreaElement>(null)

  const isSummaryDirty = summaryValue !== act.summary

  useEffect(() => {
    setTitleValue(act.title)
    setSummaryValue(act.summary)
  }, [act.title, act.summary])

  // Auto-scroll + auto-focus title when newly created (Apple Finder / Notes pattern)
  useEffect(() => {
    if (!isNew) return
    cardRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    setEditingTitle(true)
  }, [isNew])

  useEffect(() => {
    if (editingTitle && titleInputRef.current) {
      titleInputRef.current.focus()
      titleInputRef.current.select()
    }
  }, [editingTitle])

  useEffect(() => {
    if (editingSummary && summaryInputRef.current) {
      summaryInputRef.current.focus()
    }
  }, [editingSummary])

  const saveTitle = (): void => {
    setEditingTitle(false)
    onCreated?.()
    if (titleValue.trim() !== act.title) {
      onSaveAct({ ...act, title: titleValue.trim() || act.title, updatedAt: new Date().toISOString() })
    }
  }

  const saveSummary = (): void => {
    setEditingSummary(false)
    if (summaryValue !== act.summary) {
      onSaveAct({ ...act, summary: summaryValue, updatedAt: new Date().toISOString() })
      setSummarySavedFlash(true)
      setTimeout(() => setSummarySavedFlash(false), 1500)
    }
  }

  const cancelSummary = (): void => {
    setSummaryValue(act.summary)
    setEditingSummary(false)
  }

  return (
    <div
      ref={cardRef}
      className={`rounded-2xl border bg-[var(--bg-card)] shadow-md overflow-hidden transition-all duration-300 ${
        isNew ? 'border-[var(--accent)]/50 ring-2 ring-[var(--accent)]/25' : 'border-[var(--border)]'
      }`}
    >
      {/* Act header */}
      <div className="flex items-center gap-2 px-4 py-3 border-b border-[var(--border)]">
        {/* Act number badge */}
        <span className="text-xs font-bold text-[var(--accent)] bg-[var(--accent)]/10 px-2 py-0.5 rounded-md flex-shrink-0">
          {structureLabelCap} {actIndex + 1}
        </span>

        {/* Title (inline edit on double-click) */}
        {editingTitle ? (
          <input
            ref={titleInputRef}
            value={titleValue}
            onChange={(e) => setTitleValue(e.target.value)}
            onBlur={saveTitle}
            onKeyDown={(e) => { if (e.key === 'Enter') saveTitle(); if (e.key === 'Escape') { setTitleValue(act.title); setEditingTitle(false); onCreated?.() } }}
            className="flex-1 text-sm font-semibold text-[var(--fg)] bg-[var(--bg)] border border-[var(--accent)]
                       rounded-lg px-2 py-0.5 focus:outline-none focus:ring-2 focus:ring-[var(--focus-ring)]"
          />
        ) : (
          <span
            onDoubleClick={() => setEditingTitle(true)}
            title="Double-click to rename"
            className="flex-1 text-sm font-semibold text-[var(--fg)] cursor-text select-none truncate"
          >
            {act.title || <span className="text-[var(--fg-faint)] italic font-normal">Untitled {structureLabel}</span>}
          </span>
        )}

        {/* Chapter count pill */}
        {chapters.length > 0 && (
          <span className="text-[10px] font-medium text-[var(--fg-faint)] bg-[var(--bg-subtle)]
                           border border-[var(--border)] px-2 py-0.5 rounded-full flex-shrink-0 select-none">
            {chapters.length} {chapters.length === 1 ? 'chapter' : 'chapters'}
          </span>
        )}

        <div className="flex items-center gap-1 flex-shrink-0">
          {/* Collapse toggle */}
          <button
            onClick={() => setSummaryExpanded((v) => !v)}
            title={summaryExpanded ? 'Collapse summary' : 'Expand summary'}
            className="p-1.5 rounded-lg text-[var(--fg-faint)] hover:text-[var(--fg)] hover:bg-[var(--bg-subtle)] transition-colors"
          >
            <svg
              width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor"
              strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
              style={{ transform: summaryExpanded ? 'rotate(0deg)' : 'rotate(-90deg)', transition: 'transform 0.2s ease' }}
            >
              <path d="M6 9l6 6 6-6" />
            </svg>
          </button>

          {/* Delete */}
          <button
            onClick={() => onDeleteAct(act.id)}
            title={`Delete ${structureLabel}`}
            className="p-1.5 rounded-lg text-[var(--fg-faint)] hover:text-red-400 hover:bg-red-400/10 transition-colors"
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="3 6 5 6 21 6" />
              <path d="M19 6l-1 14H6L5 6" />
              <path d="M10 11v6M14 11v6" />
              <path d="M9 6V4h6v2" />
            </svg>
          </button>
        </div>
      </div>

      {/* Collapsible summary */}
      <div
        style={{
          maxHeight: summaryExpanded ? '200px' : '0px',
          overflow: 'hidden',
          transition: 'max-height 0.3s ease-in-out',
        }}
      >
        <div className="px-4 py-3 border-b border-[var(--border)]">
          {editingSummary ? (
            <div className="flex flex-col gap-2">
              <textarea
                ref={summaryInputRef}
                value={summaryValue}
                onChange={(e) => setSummaryValue(e.target.value)}
                onBlur={() => { /* blur no-op; use buttons instead */ }}
                placeholder={`What happens in this ${structureLabel}? Describe the arc...`}
                rows={3}
                className="w-full text-sm text-[var(--fg)] bg-[var(--bg)] border border-[var(--accent)] rounded-xl
                           px-3 py-2 resize-none focus:outline-none focus:ring-2 focus:ring-[var(--focus-ring)] leading-relaxed"
              />
              <div className="flex items-center gap-2 justify-end">
                <button
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={cancelSummary}
                  className="px-3 py-1 rounded-lg text-xs text-[var(--fg-muted)] hover:bg-[var(--bg-subtle)] transition-colors"
                >
                  Cancel
                </button>
                <button
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={saveSummary}
                  disabled={!isSummaryDirty}
                  className={`px-3 py-1 rounded-lg text-xs font-semibold transition-colors
                    ${isSummaryDirty
                      ? 'bg-[var(--accent)] text-white hover:bg-[var(--accent-hover)]'
                      : 'text-[var(--fg-faint)] cursor-default'
                    }`}
                >
                  Save
                </button>
              </div>
            </div>
          ) : (
            <div className="flex items-start gap-2">
              <p
                onClick={() => setEditingSummary(true)}
                className="flex-1 text-sm text-[var(--fg-muted)] leading-relaxed cursor-text min-h-[2rem]
                           hover:text-[var(--fg)] transition-colors"
              >
                {act.summary || <span className="italic text-[var(--fg-faint)]">Click to add {structureLabel} summary…</span>}
              </p>
              {summarySavedFlash && (
                <span className="text-[10px] text-emerald-500 font-medium flex-shrink-0 mt-0.5">Saved ✓</span>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Chapters grid */}
      <div
        className="p-4 grid gap-4"
        style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))' }}
      >
        {chapters.map((chapter, idx) => {
          const otherActs = allActs.filter((a) => a.id !== act.id).sort((a, b) => a.order - b.order)
          return (
            <div key={chapter.id} className="flex flex-col gap-1.5">
              <ChapterThumbnail
                chapter={chapter}
                chapterIndex={idx}
                onFocus={() => onFocusChapter(chapter.id, act.id)}
                onOpen={() => onOpenChapter(chapter)}
                onDelete={() => onDeleteChapter(chapter.id)}
                onSave={onSaveChapter}
              />
              <select
                onChange={(e) => { if (e.target.value) { onMoveChapter(chapter.id, e.target.value); e.target.value = '' } }}
                defaultValue=""
                className="w-full text-[10px] text-[var(--fg-muted)] bg-[var(--bg-card)] border border-[var(--border)]
                           rounded-lg px-2 py-1 cursor-pointer hover:border-[var(--accent)]/50 transition-colors focus:outline-none"
              >
                <option value="">{`Move to ${structureLabel}…`}</option>
                {otherActs.map((a) => (
                  <option key={a.id} value={a.id}>{structureLabelCap} {allActs.sort((x,y)=>x.order-y.order).indexOf(a) + 1} · {a.title || 'Untitled'}</option>
                ))}
                <option value="new">{`+ Create New ${structureLabelCap}`}</option>
              </select>
            </div>
          )
        })}
        {/* Add chapter ghost card */}
        <button
          onClick={() => onAddChapter(act.id)}
          className="min-h-[200px] rounded-xl border-2 border-dashed border-[var(--border)]
                     flex flex-col items-center justify-center gap-2 text-[var(--fg-faint)] text-xs
                     hover:border-[var(--accent)]/50 hover:text-[var(--accent)] transition-colors cursor-pointer"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10" />
            <path d="M12 8v8M8 12h8" />
          </svg>
          <span>Add Chapter</span>
        </button>
      </div>
    </div>
  )
}

// ── Ungrouped chapters bucket ─────────────────────────────────────────────────

interface UngroupedBucketProps {
  chapters: Chapter[]
  acts: Act[]
  structureLabelCap: string
  onFocusChapter: (chapterId: string) => void
  onOpenChapter: (chapter: Chapter) => void
  onDeleteChapter: (chapterId: string) => void
  onAssignToAct: (chapterId: string, actId: string | 'new') => void
  onSaveChapter: (chapter: Chapter, patch: Partial<Chapter>) => void
}

function UngroupedBucket({ chapters, acts, structureLabelCap, onFocusChapter, onOpenChapter, onDeleteChapter, onAssignToAct, onSaveChapter }: UngroupedBucketProps): React.JSX.Element | null {
  if (chapters.length === 0) return null
  const structureLabel = structureLabelCap.toLowerCase()
  const sortedActs = [...acts].sort((a, b) => a.order - b.order)
  return (
    <div className="rounded-2xl border-2 border-dashed border-[var(--border)] bg-[var(--bg-card)]/50 overflow-hidden">
      <div className="flex items-center gap-2 px-4 py-3 border-b border-dashed border-[var(--border)]">
        <span className="text-xs font-semibold text-[var(--fg-faint)] uppercase tracking-widest">
          Ungrouped Chapters
        </span>
        <span className="text-[10px] text-[var(--fg-faint)] ml-auto">{`Use the dropdown below each chapter to assign it to a ${structureLabel}`}</span>
      </div>
      <div
        className="p-4 grid gap-4"
        style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))' }}
      >
        {chapters.map((chapter, idx) => (
          <div key={chapter.id} className="flex flex-col gap-1.5">
            <ChapterThumbnail
              chapter={chapter}
              chapterIndex={idx}
              onFocus={() => onFocusChapter(chapter.id)}
              onOpen={() => onOpenChapter(chapter)}
              onDelete={() => onDeleteChapter(chapter.id)}
              onSave={onSaveChapter}
            />
            <select
              onChange={(e) => { if (e.target.value) { onAssignToAct(chapter.id, e.target.value); e.target.value = '' } }}
              defaultValue=""
              className="w-full text-[10px] text-[var(--fg-muted)] bg-[var(--bg-card)] border border-[var(--border)]
                         rounded-lg px-2 py-1 cursor-pointer hover:border-[var(--accent)]/50 transition-colors focus:outline-none"
            >
              <option value="">{`Assign to ${structureLabel}…`}</option>
              {sortedActs.map((act, i) => (
                <option key={act.id} value={act.id}>{structureLabelCap} {i + 1} · {act.title || 'Untitled'}</option>
              ))}
              <option value="new">{`+ Create New ${structureLabelCap}`}</option>
            </select>
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Book Synopsis Banner ───────────────────────────────────────────────────────

function BookSynopsisBanner({ book, onSave }: { book: Book, onSave: (b: Book) => void }): React.JSX.Element {
  const [synopsisExpanded, setSynopsisExpanded] = useState(() => {
    const saved = localStorage.getItem('lekhanam_storyboard_synopsis_expanded')
    return saved !== 'false'
  })
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(book.synopsis || '')
  const [savedFlash, setSavedFlash] = useState(false)
  const inputRef = useRef<HTMLTextAreaElement>(null)

  const isDirty = draft !== (book.synopsis || '')

  useEffect(() => {
    setDraft(book.synopsis || '')
  }, [book.synopsis])

  useEffect(() => {
    localStorage.setItem('lekhanam_storyboard_synopsis_expanded', String(synopsisExpanded))
  }, [synopsisExpanded])

  useEffect(() => {
    if (editing && inputRef.current) {
      inputRef.current.focus()
    }
  }, [editing])

  const handleSave = (): void => {
    setEditing(false)
    if (isDirty) {
      onSave({ ...book, synopsis: draft, updatedAt: new Date().toISOString() })
      setSavedFlash(true)
      setTimeout(() => setSavedFlash(false), 1500)
    }
  }

  const handleCancel = (): void => {
    setDraft(book.synopsis || '')
    setEditing(false)
  }

  return (
    <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] shadow-[var(--shadow-card-md)] overflow-hidden mb-8 transition-all duration-300">
      <div className="flex items-center gap-2 px-4 py-2 bg-[var(--bg-card)] border-b border-[var(--border)]/50">
        <div className="w-5 h-5 flex items-center justify-center rounded-md bg-[var(--accent)]/10 text-[var(--accent)]">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1 0-5H20"/>
          </svg>
        </div>
        <span className="text-sm font-semibold text-[var(--fg)] select-none">Book Synopsis</span>
        <div className="flex-1" />
        <button
          onClick={() => setSynopsisExpanded((v) => !v)}
          title={synopsisExpanded ? 'Collapse synopsis' : 'Expand synopsis'}
          className="p-1.5 rounded-lg text-[var(--fg-faint)] hover:text-[var(--fg)] hover:bg-[var(--bg-subtle)] transition-colors"
        >
          <svg
            width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor"
            strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
            style={{ transform: synopsisExpanded ? 'rotate(0deg)' : 'rotate(-90deg)', transition: 'transform 0.2s ease' }}
          >
            <path d="M6 9l6 6 6-6" />
          </svg>
        </button>
      </div>

      <div
        style={{
          maxHeight: synopsisExpanded ? (editing ? '300px' : '800px') : '0px',
          overflow: 'hidden',
          transition: 'max-height 0.3s ease-in-out',
        }}
      >
        <div className="px-4 py-3 bg-[var(--bg-surround)]/30">
          {editing ? (
             <div className="flex flex-col gap-2">
               <textarea
                 ref={inputRef}
                 value={draft}
                 onChange={(e) => setDraft(e.target.value)}
                 placeholder="Click to add book synopsis..."
                 rows={4}
                 className="w-full text-sm text-[var(--fg)] bg-[var(--bg)] border border-[var(--accent)] rounded-xl
                            px-3 py-2 resize-none focus:outline-none focus:ring-2 focus:ring-[var(--focus-ring)] leading-relaxed"
               />
               <div className="flex items-center gap-2 justify-end">
                 <button
                   onMouseDown={(e) => e.preventDefault()}
                   onClick={handleCancel}
                   className="px-3 py-1 rounded-lg text-xs text-[var(--fg-muted)] hover:bg-[var(--bg-subtle)] transition-colors"
                 >
                   Cancel
                 </button>
                 <button
                   onMouseDown={(e) => e.preventDefault()}
                   onClick={handleSave}
                   disabled={!isDirty}
                   className={`px-3 py-1 rounded-lg text-xs font-semibold transition-colors
                     ${isDirty
                       ? 'bg-[var(--accent)] text-white hover:bg-[var(--accent-hover)]'
                       : 'text-[var(--fg-faint)] cursor-default'
                     }`}
                 >
                   Save
                 </button>
               </div>
             </div>
          ) : (
            <div className="flex items-start gap-2">
              <p
                onClick={() => setEditing(true)}
                className="flex-1 text-sm text-[var(--fg-muted)] leading-relaxed cursor-text min-h-[3rem]
                           hover:text-[var(--fg)] transition-colors whitespace-pre-wrap"
              >
                {book.synopsis || <span className="italic text-[var(--fg-faint)]">Click to add book synopsis...</span>}
              </p>
              {savedFlash && (
                <span className="text-[10px] text-emerald-500 font-medium flex-shrink-0 mt-0.5">Saved ✓</span>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ── Main Storyboard tab ───────────────────────────────────────────────────────

interface FocusContext {
  chapterIds: string[]  // ordered chapter IDs in scope (within one act, or ungrouped)
  actId: string | null  // null = ungrouped
  currentIdx: number
}

export default function StoryboardTab(): React.JSX.Element {
  const { chapters, acts, saveChapter, saveAct, saveManyActs, deleteAct, deleteChapter, currentBook, saveBook } = useBookStore()
  const autoSave = currentBook?.style?.autoSave ?? true
  const { setBookTab, setActiveChapter } = useUIStore()

  const structureLabel = (currentBook?.style?.structureLabel ?? 'act') as 'act' | 'section'
  const structureLabelCap = structureLabel === 'section' ? 'Section' : 'Act'

  const handleStructureLabel = useCallback((val: 'act' | 'section'): void => {
    if (!currentBook) return
    const merged = { ...(currentBook.style ?? DEFAULT_BOOK_STYLE), structureLabel: val }
    saveBook({ ...currentBook, style: merged })
  }, [currentBook, saveBook])

  const [viewMode, setViewMode] = useState<'acts' | 'focus'>('acts')
  const [focusCtx, setFocusCtx] = useState<FocusContext | null>(null)
  const [savedFlash, setSavedFlash] = useState(false)
  const [autoSaved, setAutoSaved] = useState(false)
  const [newActId, setNewActId] = useState<string | null>(null)

  const sorted = [...chapters].sort((a, b) => a.order - b.order)
  const bodyMatter = sorted.filter((c) => getSection(c.kind) === 1)
  const sortedActs = [...acts].sort((a, b) => a.order - b.order)

  // Chapters grouped by act
  const actChapters = useCallback((actId: string): Chapter[] =>
    bodyMatter.filter((c) => c.actId === actId),
  [bodyMatter])

  const ungroupedChapters = bodyMatter.filter(
    (c) => !c.actId || !acts.find((a) => a.id === c.actId)
  )

  const handleSaveChapter = useCallback((chapter: Chapter, patch: Partial<Chapter>): void => {
    saveChapter({ ...chapter, ...patch, updatedAt: new Date().toISOString() })
    setAutoSaved(true)
    setTimeout(() => setAutoSaved(false), 1500)
  }, [saveChapter])

  const handleOpenChapter = (chapter: Chapter): void => {
    setActiveChapter(chapter.id)
    setBookTab('chapters')
  }

  const handleAddAct = async (): Promise<void> => {
    if (!currentBook) return
    const now = new Date().toISOString()
    const newAct: Act = {
      id: nanoid(),
      bookId: currentBook.id,
      title: `${structureLabelCap} ${sortedActs.length + 1}`,
      summary: '',
      order: sortedActs.length,
      createdAt: now,
      updatedAt: now,
    }
    await saveAct(newAct)
    setNewActId(newAct.id)
  }

  const handleAddChapter = async (actId: string): Promise<void> => {
    if (!currentBook) return
    const maxOrder = bodyMatter.reduce((max, c) => Math.max(max, c.order), -1)
    const now = new Date().toISOString()
    const n = bodyMatter.filter((c) => !c.kind || c.kind === 'chapter').length + 1
    const newChapter: Chapter = {
      id: nanoid(),
      bookId: currentBook.id,
      title: `Chapter ${n}`,
      order: maxOrder + 1,
      kind: 'chapter',
      actId,
      summary: '',
      content: { type: 'doc', content: [] },
      wordCount: 0,
      createdAt: now,
      updatedAt: now,
    }
    await saveChapter(newChapter)
  }

  const handleDeleteChapter = async (chapterId: string): Promise<void> => {
    const canAuth = await window.electron.auth.canTouchId()
    if (canAuth) {
      try {
        await window.electron.auth.promptTouchId('Delete Chapter')
      } catch {
        return
      }
    }
    if (!window.confirm('Delete this chapter? It will be moved to Trash.')) return
    await deleteChapter(chapterId)
  }

  const handleDeleteAct = async (actId: string): Promise<void> => {
    const canAuth = await window.electron.auth.canTouchId()
    if (canAuth) {
      try {
        await window.electron.auth.promptTouchId(`Delete ${structureLabelCap}`)
      } catch {
        return
      }
    }
    if (!window.confirm(`Delete this ${structureLabel}? Its chapters will become ungrouped.`)) return
    const remaining = sortedActs
      .filter((a) => a.id !== actId)
      .map((a, i) => ({ ...a, order: i, updatedAt: new Date().toISOString() }))
    await deleteAct(actId)
    if (remaining.length > 0) await saveManyActs(remaining)
  }

  const handleAssignToAct = async (chapterId: string, actId: string | 'new'): Promise<void> => {
    const chapter = chapters.find((c) => c.id === chapterId)
    if (!chapter || !currentBook) return
    let targetActId = actId
    if (actId === 'new') {
      const now = new Date().toISOString()
      const newAct: Act = {
        id: nanoid(),
        bookId: currentBook.id,
        title: `${structureLabelCap} ${sortedActs.length + 1}`,
        summary: '',
        order: sortedActs.length,
        createdAt: now,
        updatedAt: now,
      }
      await saveAct(newAct)
      targetActId = newAct.id
      setNewActId(newAct.id)
    }
    await saveChapter({ ...chapter, actId: targetActId, updatedAt: new Date().toISOString() })
  }

  const handleMoveChapter = handleAssignToAct

  const handleSaveAll = async (): Promise<void> => {
    if (acts.length > 0) await saveManyActs(acts.map((a) => ({ ...a, updatedAt: new Date().toISOString() })))
    setSavedFlash(true)
    setTimeout(() => setSavedFlash(false), 1500)
  }

  const handleFocusChapter = (chapterId: string, actId: string | null): void => {
    const scope = actId
      ? actChapters(actId)
      : ungroupedChapters
    const idx = scope.findIndex((c) => c.id === chapterId)
    setFocusCtx({ chapterIds: scope.map((c) => c.id), actId, currentIdx: Math.max(0, idx) })
    setViewMode('focus')
  }

  // Current focus chapter
  const focusChapter = focusCtx
    ? chapters.find((c) => c.id === focusCtx.chapterIds[focusCtx.currentIdx])
    : null

  const focusActTitle = focusCtx?.actId
    ? `← ${sortedActs.find((a) => a.id === focusCtx.actId)?.title || structureLabelCap}`
    : '← Ungrouped'

  if (viewMode === 'focus' && focusCtx && focusChapter) {
    return (
      <div className="h-full flex flex-col bg-[var(--bg-surround)]">
        <div className="flex-1 overflow-y-auto">
          <FocusView
            key={focusChapter.id}
            chapter={focusChapter}
            index={focusCtx.currentIdx}
            total={focusCtx.chapterIds.length}
            actTitle={focusActTitle}
            autoSave={autoSave}
            onBack={() => setViewMode('acts')}
            onPrev={() => setFocusCtx((ctx) => ctx ? { ...ctx, currentIdx: Math.max(0, ctx.currentIdx - 1) } : ctx)}
            onNext={() => setFocusCtx((ctx) => ctx ? { ...ctx, currentIdx: Math.min(ctx.chapterIds.length - 1, ctx.currentIdx + 1) } : ctx)}
            onOpen={() => handleOpenChapter(focusChapter)}
            onSave={handleSaveChapter}
          />
        </div>
      </div>
    )
  }

  return (
    <div className="h-full flex flex-col bg-[var(--bg-surround)]">
      {/* Header */}
      <div className="flex-shrink-0 flex items-center gap-2 px-6 pt-4 pb-3 border-b border-[var(--border)]/40 bg-[var(--bg-surround)]">
        {/* Title */}
        <h2 className="text-base font-semibold text-[var(--fg)] mr-1">Storyboard</h2>

        {/* Add button */}
        <button
          onClick={handleAddAct}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium
                     bg-[var(--accent)] text-white hover:bg-[var(--accent-hover)] transition-colors shadow-sm"
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10" /><path d="M12 8v8M8 12h8" />
          </svg>
          Add {structureLabelCap}
        </button>

        {/* Saved flash + Save button */}
        <div className="flex items-center gap-2">
          <span
            className="text-[11px] font-medium text-[var(--color-success)] pointer-events-none transition-opacity duration-300"
            style={{ opacity: (autoSaved || savedFlash) ? 1 : 0 }}
          >
            Saved
          </span>
          <button
            onClick={handleSaveAll}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border border-[var(--border)] text-[var(--fg-muted)] hover:text-[var(--fg)] hover:bg-[var(--bg-subtle)] transition-colors"
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/>
              <polyline points="17 21 17 13 7 13 7 21"/>
              <polyline points="7 3 7 8 15 8"/>
            </svg>
            Save
          </button>
        </div>

        {/* Spacer */}
        <div className="flex-1" />

        {/* Structure Label — Apple-style segmented control */}
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-medium text-[var(--fg-faint)] uppercase tracking-wide select-none">
            Structure
          </span>
          <div className="flex items-center p-0.5 rounded-lg bg-[var(--bg-subtle)] border border-[var(--border)]">
            {(['act', 'section'] as const).map((opt) => (
              <button
                key={opt}
                onClick={() => handleStructureLabel(opt)}
                className={`px-3 py-1 rounded-md text-xs font-medium transition-all duration-150 ${
                  structureLabel === opt
                    ? 'bg-[var(--accent)] text-white shadow-sm'
                    : 'text-[var(--fg-muted)] hover:text-[var(--fg)]'
                }`}
              >
                {opt === 'act' ? 'Act' : 'Section'}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Acts timeline */}
      <div className="flex-1 overflow-y-auto">
        <div className="w-full px-6 py-8 flex flex-col">

          {/* Book Synopsis Banner */}
          {currentBook && <BookSynopsisBanner book={currentBook} onSave={saveBook} />}

          {/* Empty state */}
          {sortedActs.length === 0 && (
            <div className="flex flex-col items-center justify-center py-20 gap-4 text-center">
              <div className="w-12 h-12 rounded-2xl bg-[var(--accent)]/10 flex items-center justify-center">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/>
                </svg>
              </div>
              <div>
                <p className="text-sm font-semibold text-[var(--fg)] mb-1">No {structureLabel}s yet</p>
                <p className="text-xs text-[var(--fg-faint)] max-w-xs">
                  Organise your story into {structureLabel}s — each {structureLabel} is a container for related chapters.
                </p>
              </div>
              <button
                onClick={handleAddAct}
                className="mt-2 px-5 py-2.5 rounded-xl text-sm font-semibold bg-[var(--accent)] text-white
                           hover:bg-[var(--accent-hover)] transition-colors shadow-md"
              >
                Create First {structureLabelCap}
              </button>
              {ungroupedChapters.length > 0 && (
                <div className="mt-8 w-full">
                  <UngroupedBucket
                    chapters={ungroupedChapters}
                    acts={acts}
                    structureLabelCap={structureLabelCap}
                    onFocusChapter={(id) => handleFocusChapter(id, null)}
                    onOpenChapter={handleOpenChapter}
                    onDeleteChapter={handleDeleteChapter}
                    onAssignToAct={handleAssignToAct}
                    onSaveChapter={handleSaveChapter}
                  />
                </div>
              )}
            </div>
          )}

          {/* Act cards with connector lines */}
          {sortedActs.map((act, idx) => (
            <React.Fragment key={act.id}>
              <ActCard
                act={act}
                actIndex={idx}
                allActs={sortedActs}
                chapters={actChapters(act.id)}
                structureLabelCap={structureLabelCap}
                isNew={act.id === newActId}
                onCreated={() => setNewActId(null)}
                onSaveAct={saveAct}
                onDeleteAct={handleDeleteAct}
                onAddChapter={handleAddChapter}
                onFocusChapter={(chapterId, actId) => handleFocusChapter(chapterId, actId)}
                onOpenChapter={handleOpenChapter}
                onDeleteChapter={handleDeleteChapter}
                onMoveChapter={handleMoveChapter}
                onSaveChapter={handleSaveChapter}
              />
              {/* Connector line between acts */}
              {idx < sortedActs.length - 1 && (
                <div className="w-px h-6 bg-[var(--accent)]/30 mx-auto flex-shrink-0" />
              )}
            </React.Fragment>
          ))}

          {/* Add act button (bottom) */}
          {sortedActs.length > 0 && (
            <>
              <div className="w-px h-6 bg-[var(--accent)]/30 mx-auto flex-shrink-0" />
              <button
                onClick={handleAddAct}
                className="self-center flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-medium
                           border-2 border-dashed border-[var(--accent)]/40 text-[var(--accent)]
                           hover:border-[var(--accent)] hover:bg-[var(--accent)]/5 transition-colors"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="10" /><path d="M12 8v8M8 12h8" />
                </svg>
                Add {structureLabelCap}
              </button>
            </>
          )}

          {/* Ungrouped bucket (when acts exist) */}
          {sortedActs.length > 0 && ungroupedChapters.length > 0 && (
            <div className="mt-8">
              <UngroupedBucket
                chapters={ungroupedChapters}
                acts={acts}
                structureLabelCap={structureLabelCap}
                onFocusChapter={(id) => handleFocusChapter(id, null)}
                onOpenChapter={handleOpenChapter}
                onDeleteChapter={handleDeleteChapter}
                onAssignToAct={handleAssignToAct}
                onSaveChapter={handleSaveChapter}
              />
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
