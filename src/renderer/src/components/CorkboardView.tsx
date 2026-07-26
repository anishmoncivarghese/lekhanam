import React from 'react'
import { Chapter, Act, ContentKind } from '../types'

const BODY_MATTER: ContentKind[] = ['chapter', 'part-break']

// Status colors shared with sidebar + storyboard
const STATUS_COLOR: Record<string, string> = {
  draft: '#94a3b8',
  revised: '#f59e0b',
  final: '#22c55e',
}

interface Props {
  chapters: Chapter[]
  acts: Act[]
  onOpenChapter: (id: string) => void
  onSaveChapter: (ch: Chapter) => Promise<void>
}

function CorkCard({ chapter, actLabel, onOpen, onSaveChapter }: {
  chapter: Chapter
  actLabel: string | null
  onOpen: () => void
  onSaveChapter: (ch: Chapter) => Promise<void>
}): React.JSX.Element {
  const statusColor = chapter.status ? STATUS_COLOR[chapter.status] : 'var(--accent)'
  const synopsis = chapter.summary || chapter.planGoal || ''

  const cycleStatus = (e: React.MouseEvent) => {
    e.stopPropagation()
    const cycle: Record<string, Chapter['status']> = { draft: 'revised', revised: 'final', final: undefined }
    const next = chapter.status ? cycle[chapter.status] : 'draft'
    onSaveChapter({ ...chapter, status: next })
  }

  return (
    <div
      onClick={onOpen}
      title={`Open ${chapter.title}`}
      className="flex flex-col rounded-xl bg-[var(--bg-card)] border border-[var(--border)] shadow-[var(--shadow-card-md)] hover:shadow-[var(--shadow-card-lg)] hover:-translate-y-0.5 transition-all duration-150 cursor-pointer select-none overflow-hidden"
      style={{ width: 280, minHeight: 260, flexShrink: 0 }}
    >
      {/* Colored status strip at top */}
      <div style={{ height: 4, background: statusColor, flexShrink: 0 }} />

      {/* Body */}
      <div className="flex flex-col flex-1 px-3 pt-2.5 pb-2 gap-1.5">
        {/* Chapter number + title */}
        <div className="flex items-start gap-1.5">
          <span className="text-[9px] font-bold text-white bg-[var(--accent)] rounded px-1 py-0.5 leading-tight flex-shrink-0 mt-0.5">
            {chapter.kind === 'chapter' || !chapter.kind
              ? `Ch ${chapter.order + 1}`
              : chapter.kind.replace('-', ' ').replace(/\b\w/g, (c) => c.toUpperCase())}
          </span>
          <p className="text-[12px] font-semibold text-[var(--fg)] leading-tight line-clamp-2 flex-1">
            {chapter.title}
          </p>
        </div>

        {/* Synopsis */}
        {synopsis ? (
          <p className="text-[11px] text-[var(--fg-muted)] leading-snug line-clamp-6 flex-1">{synopsis}</p>
        ) : (
          <p className="text-[11px] text-[var(--fg-faint)] italic flex-1">No synopsis yet</p>
        )}
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between px-3 pb-2">
        <div className="flex items-center gap-1.5">
          {actLabel && (
            <span className="text-[9px] px-1 py-0.5 rounded bg-[var(--bg-subtle)] text-[var(--fg-faint)] leading-none">
              {actLabel}
            </span>
          )}
          <span className="text-[9px] text-[var(--fg-faint)]">
            {chapter.wordCount > 0 ? `${chapter.wordCount.toLocaleString()}w` : '—'}
          </span>
        </div>
        {/* Status dot — click to cycle */}
        <button
          onClick={cycleStatus}
          title={chapter.status ? `Status: ${chapter.status} (click to change)` : 'Set status'}
          className="w-3 h-3 rounded-full border transition-colors flex-shrink-0"
          style={{
            borderColor: chapter.status ? 'transparent' : 'var(--border)',
            background: chapter.status ? STATUS_COLOR[chapter.status] : 'transparent'
          }}
        />
      </div>
    </div>
  )
}

export default function CorkboardView({ chapters, acts, onOpenChapter, onSaveChapter }: Props): React.JSX.Element {
  const bodyChapters = chapters.filter(ch => BODY_MATTER.includes(ch.kind ?? 'chapter'))
  const actNumberMap = new Map(
    [...acts].sort((a, b) => a.order - b.order).map((act, i) => [act.id, i + 1])
  )

  if (bodyChapters.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-center">
        <div className="w-16 h-16 rounded-xl bg-[var(--bg-subtle)] flex items-center justify-center mb-4">
          <svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <rect x="2" y="3" width="7" height="9" rx="1"/><rect x="15" y="3" width="7" height="5" rx="1"/>
            <rect x="15" y="12" width="7" height="9" rx="1"/><rect x="2" y="16" width="7" height="5" rx="1"/>
          </svg>
        </div>
        <p className="text-base font-semibold text-[var(--fg)]">No chapters yet</p>
        <p className="text-sm text-[var(--fg-muted)] mt-1 max-w-xs">Add content from the sidebar to see your corkboard</p>
      </div>
    )
  }

  return (
    <div
      className="h-full overflow-auto"
      style={{ background: 'var(--bg-subtle)' }}
    >
      {/* Cork texture header */}
      <div className="px-6 pt-5 pb-2 flex items-center gap-2">
        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--fg-faint)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="2" y="3" width="7" height="9" rx="1"/><rect x="15" y="3" width="7" height="5" rx="1"/>
          <rect x="15" y="12" width="7" height="9" rx="1"/><rect x="2" y="16" width="7" height="5" rx="1"/>
        </svg>
        <span className="text-[11px] font-medium text-[var(--fg-faint)] select-none">Corkboard — {bodyChapters.length} chapter{bodyChapters.length !== 1 ? 's' : ''}</span>
        <div className="flex-1" />
        <div className="flex items-center gap-3 text-[9px] text-[var(--fg-faint)] select-none">
          {(['draft', 'revised', 'final'] as const).map((s) => (
            <span key={s} className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-full inline-block" style={{ background: STATUS_COLOR[s] }} />
              {s.charAt(0).toUpperCase() + s.slice(1)}
            </span>
          ))}
        </div>
      </div>

      {/* Cards grid */}
      <div className="px-6 pb-8 flex flex-wrap gap-5">
        {bodyChapters.map((ch) => (
          <CorkCard
            key={ch.id}
            chapter={ch}
            actLabel={ch.actId && actNumberMap.has(ch.actId) ? `Act ${actNumberMap.get(ch.actId)}` : null}
            onOpen={() => onOpenChapter(ch.id)}
            onSaveChapter={onSaveChapter}
          />
        ))}
      </div>
    </div>
  )
}
