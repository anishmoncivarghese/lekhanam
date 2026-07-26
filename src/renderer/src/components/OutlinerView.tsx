import React, { useState } from 'react'
import { Chapter, Act, ContentKind } from '../types'

// ─── Types ────────────────────────────────────────────────────────────────────

interface Props {
  chapters: Chapter[]
  acts: Act[]
  onChapterClick: (id: string) => void
  onChapterUpdate: (ch: Chapter) => void
}

// ─── Constants ────────────────────────────────────────────────────────────────

const STATUS_CYCLE: (Chapter['status'] | undefined)[] = [undefined, 'draft', 'revised', 'final']
const STATUS_LABELS: Record<string, string> = { draft: 'Draft', revised: 'Revised', final: 'Final' }
const STATUS_COLORS: Record<string, string> = {
  draft:   'bg-amber-400',
  revised: 'bg-blue-400',
  final:   'bg-green-500',
}

const FRONT_KINDS: ContentKind[] = ['half-title', 'title-page', 'copyright', 'dedication', 'toc']
const BACK_KINDS: ContentKind[]  = ['appendix', 'glossary', 'bibliography', 'index', 'author-bio']
const KIND_BADGES: Partial<Record<ContentKind, string>> = {
  'half-title': 'Half Title', 'title-page': 'Title Page', copyright: 'Copyright',
  dedication: 'Dedication', toc: 'ToC', 'part-break': 'Part Break',
  appendix: 'Appendix', glossary: 'Glossary', bibliography: 'Bibliography',
  index: 'Index', 'author-bio': 'Author Bio',
}

function isBodyChapter(ch: Chapter): boolean {
  return !ch.kind || ch.kind === 'chapter' || ch.kind === 'part-break'
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function StatusDot({ status, onClick }: { status: Chapter['status']; onClick: () => void }): React.JSX.Element {
  const color = status ? STATUS_COLORS[status] : undefined
  return (
    <button
      onClick={(e) => { e.stopPropagation(); onClick() }}
      title={status ? STATUS_LABELS[status] : 'No status — click to set'}
      className="flex items-center justify-center w-5 h-5 shrink-0"
    >
      {color ? (
        <span className={`w-2.5 h-2.5 rounded-full ${color}`} />
      ) : (
        <span className="w-2.5 h-2.5 rounded-full border border-[var(--fg-faint)]" />
      )}
    </button>
  )
}

function PovCell({ value, onSave }: { value: string; onSave: (v: string) => void }): React.JSX.Element {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(value)

  if (editing) {
    return (
      <input
        autoFocus
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => { onSave(draft); setEditing(false) }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') { onSave(draft); setEditing(false) }
          if (e.key === 'Escape') { setDraft(value); setEditing(false) }
        }}
        onClick={(e) => e.stopPropagation()}
        className="w-full px-1 py-0 text-xs border-b border-[var(--accent)] bg-transparent text-[var(--fg)] focus:outline-none"
      />
    )
  }
  return (
    <span
      onClick={(e) => { e.stopPropagation(); setEditing(true) }}
      title="Click to edit POV character"
      className="text-xs text-[var(--fg-muted)] cursor-text hover:text-[var(--fg)] truncate"
    >
      {value || <span className="text-[var(--fg-faint)]">—</span>}
    </span>
  )
}

function WordCountCell({ wordCount, wordTarget }: { wordCount: number; wordTarget?: number }): React.JSX.Element {
  if (!wordTarget) {
    return <span className="text-xs text-[var(--fg-muted)] tabular-nums">{wordCount.toLocaleString()}</span>
  }
  const pct = Math.min(100, Math.round((wordCount / wordTarget) * 100))
  const done = wordCount >= wordTarget
  return (
    <div className="flex flex-col gap-0.5 min-w-[80px]">
      <span className={`text-xs tabular-nums font-medium ${done ? 'text-green-600 dark:text-green-400' : 'text-[var(--today-title)]'}`}>
        {wordCount.toLocaleString()} / {wordTarget.toLocaleString()}
      </span>
      <div className="w-full h-1 rounded-full bg-[var(--bg-subtle)] overflow-hidden">
        <div
          className={`h-full rounded-full ${done ? 'bg-green-500' : 'bg-[var(--accent)]'}`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  )
}

// ─── Row ─────────────────────────────────────────────────────────────────────

function ChapterRow({ chapter, onChapterClick, onChapterUpdate }: {
  chapter: Chapter
  onChapterClick: (id: string) => void
  onChapterUpdate: (ch: Chapter) => void
}): React.JSX.Element {
  const cycleStatus = (): void => {
    const cur = STATUS_CYCLE.indexOf(chapter.status)
    const next = STATUS_CYCLE[(cur + 1) % STATUS_CYCLE.length]
    onChapterUpdate({ ...chapter, status: next, updatedAt: new Date().toISOString() })
  }

  const badge = chapter.kind ? KIND_BADGES[chapter.kind] : undefined

  return (
    <div
      onClick={() => onChapterClick(chapter.id)}
      className="flex items-center gap-2 px-3 py-1.5 cursor-pointer hover:bg-[var(--bg-subtle)] transition-colors group border-b border-[var(--border)]/40"
    >
      {/* Indent */}
      <div className="w-4 shrink-0" />

      {/* Title */}
      <div className="flex-1 min-w-0 flex items-center gap-2">
        <span className="text-sm text-[var(--fg)] truncate group-hover:text-[var(--accent)] transition-colors">
          {chapter.title || <span className="text-[var(--fg-faint)] italic">Untitled</span>}
        </span>
        {badge && (
          <span className="px-1.5 py-0.5 rounded text-[9px] font-semibold uppercase tracking-wide bg-[var(--bg-subtle)] text-[var(--fg-faint)] shrink-0">
            {badge}
          </span>
        )}
      </div>

      {/* Status */}
      <div className="w-20 shrink-0 flex items-center gap-1.5">
        <StatusDot status={chapter.status} onClick={cycleStatus} />
        <span className="text-[10px] text-[var(--fg-faint)]">
          {chapter.status ? STATUS_LABELS[chapter.status] : '—'}
        </span>
      </div>

      {/* POV */}
      <div className="w-24 shrink-0 overflow-hidden">
        <PovCell
          value={chapter.planPov ?? ''}
          onSave={(v) => onChapterUpdate({ ...chapter, planPov: v, updatedAt: new Date().toISOString() })}
        />
      </div>

      {/* Word count */}
      <div className="w-28 shrink-0 flex items-center justify-end">
        <WordCountCell wordCount={chapter.wordCount ?? 0} wordTarget={chapter.wordTarget} />
      </div>
    </div>
  )
}

// ─── Act group ───────────────────────────────────────────────────────────────

function ActGroup({ act, actIndex, chapters, structureLabel, onChapterClick, onChapterUpdate }: {
  act: Act | null    // null = "Ungrouped" group
  actIndex: number
  chapters: Chapter[]
  structureLabel: string
  onChapterClick: (id: string) => void
  onChapterUpdate: (ch: Chapter) => void
}): React.JSX.Element {
  const [collapsed, setCollapsed] = useState(false)
  const totalWords = chapters.reduce((s, c) => s + (c.wordCount ?? 0), 0)
  const label = act
    ? `${structureLabel} ${actIndex}${act.title ? ` — ${act.title}` : ''}`
    : 'Ungrouped'

  return (
    <div>
      {/* Act header row */}
      <div
        onClick={() => setCollapsed((v) => !v)}
        className="flex items-center gap-2 px-3 py-2 cursor-pointer select-none bg-[var(--bg-subtle)] hover:bg-[var(--border)] transition-colors border-b border-[var(--border)]"
      >
        <svg
          width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor"
          strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
          className={`shrink-0 text-[var(--fg-faint)] transition-transform ${collapsed ? '-rotate-90' : ''}`}
        >
          <path d="m6 9 6 6 6-6" />
        </svg>
        <span className="text-xs font-semibold text-[var(--fg)] flex-1 truncate">{label}</span>
        {act?.subtitle && (
          <span className="text-[10px] text-[var(--fg-faint)] italic truncate max-w-[140px]">{act.subtitle}</span>
        )}
        <span className="text-[10px] text-[var(--fg-faint)] tabular-nums shrink-0">
          {totalWords.toLocaleString()} words
        </span>
      </div>

      {/* Chapter rows */}
      {!collapsed && (
        chapters.length === 0 ? (
          <div className="px-7 py-2 text-xs text-[var(--fg-faint)] italic border-b border-[var(--border)]/40">
            No chapters yet
          </div>
        ) : (
          chapters.map((ch) => (
            <ChapterRow
              key={ch.id}
              chapter={ch}
              onChapterClick={onChapterClick}
              onChapterUpdate={onChapterUpdate}
            />
          ))
        )
      )}
    </div>
  )
}

// ─── Front / Back matter group ────────────────────────────────────────────────

function MatterGroup({ label, chapters, onChapterClick, onChapterUpdate }: {
  label: string
  chapters: Chapter[]
  onChapterClick: (id: string) => void
  onChapterUpdate: (ch: Chapter) => void
}): React.JSX.Element {
  const [collapsed, setCollapsed] = useState(false)
  if (chapters.length === 0) return <></>

  return (
    <div>
      <div
        onClick={() => setCollapsed((v) => !v)}
        className="flex items-center gap-2 px-3 py-2 cursor-pointer select-none bg-[var(--bg-subtle)] hover:bg-[var(--border)] transition-colors border-b border-[var(--border)]"
      >
        <svg
          width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor"
          strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
          className={`shrink-0 text-[var(--fg-faint)] transition-transform ${collapsed ? '-rotate-90' : ''}`}
        >
          <path d="m6 9 6 6 6-6" />
        </svg>
        <span className="text-xs font-semibold text-[var(--fg-muted)]">{label}</span>
      </div>
      {!collapsed && chapters.map((ch) => (
        <ChapterRow
          key={ch.id}
          chapter={ch}
          onChapterClick={onChapterClick}
          onChapterUpdate={onChapterUpdate}
        />
      ))}
    </div>
  )
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function OutlinerView({ chapters, acts, onChapterClick, onChapterUpdate }: Props): React.JSX.Element {
  const sortedActs = [...acts].sort((a, b) => a.order - b.order)
  const structureLabel = 'Act'  // Could read from bookStyle if desired

  const frontMatter = chapters
    .filter((c) => FRONT_KINDS.includes(c.kind as ContentKind))
    .sort((a, b) => a.order - b.order)

  const backMatter = chapters
    .filter((c) => BACK_KINDS.includes(c.kind as ContentKind))
    .sort((a, b) => a.order - b.order)

  const bodyChapters = chapters
    .filter(isBodyChapter)
    .sort((a, b) => a.order - b.order)

  // Chapters that belong to an act
  const actChapters = (actId: string): Chapter[] =>
    bodyChapters.filter((c) => c.actId === actId)

  // Chapters with no actId and not front/back matter
  const ungrouped = bodyChapters.filter((c) => !c.actId)

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Column header */}
      <div className="flex items-center gap-2 px-3 py-2 border-b border-[var(--border)] bg-[var(--bg-card)] shrink-0">
        <div className="w-4 shrink-0" />
        <div className="flex-1 text-[10px] font-bold uppercase tracking-wider text-[var(--fg-faint)]">Title</div>
        <div className="w-20 shrink-0 text-[10px] font-bold uppercase tracking-wider text-[var(--fg-faint)]">Status</div>
        <div className="w-24 shrink-0 text-[10px] font-bold uppercase tracking-wider text-[var(--fg-faint)]">POV</div>
        <div className="w-28 shrink-0 text-right text-[10px] font-bold uppercase tracking-wider text-[var(--fg-faint)]">Words</div>
      </div>

      {/* Scrollable content */}
      <div className="flex-1 overflow-y-auto">
        <MatterGroup
          label="Front Matter"
          chapters={frontMatter}
          onChapterClick={onChapterClick}
          onChapterUpdate={onChapterUpdate}
        />

        {sortedActs.length > 0 ? (
          sortedActs.map((act, idx) => (
            <ActGroup
              key={act.id}
              act={act}
              actIndex={idx + 1}
              chapters={actChapters(act.id)}
              structureLabel={structureLabel}
              onChapterClick={onChapterClick}
              onChapterUpdate={onChapterUpdate}
            />
          ))
        ) : null}

        {ungrouped.length > 0 && (
          <ActGroup
            act={null}
            actIndex={0}
            chapters={ungrouped}
            structureLabel={structureLabel}
            onChapterClick={onChapterClick}
            onChapterUpdate={onChapterUpdate}
          />
        )}

        <MatterGroup
          label="Back Matter"
          chapters={backMatter}
          onChapterClick={onChapterClick}
          onChapterUpdate={onChapterUpdate}
        />

        {chapters.length === 0 && (
          <div className="flex items-center justify-center h-40 text-sm text-[var(--fg-faint)]">
            No chapters yet
          </div>
        )}
      </div>
    </div>
  )
}
