import React, { useEffect, useRef, useState } from 'react'
import { useAiStore } from '../store/aiStore'

interface Props {
  chapterTitle: string
  chapterWordCount: number
  onInsert: (prose: string) => void
  onDiscard: () => void
}

type DraftStage = 'architect' | 'ghostwriter' | 'editor' | 'done'

const STAGE_LABELS: Record<string, string> = {
  architect: 'Reviewing Story',
  ghostwriter: 'Writing Prose',
  editor: 'Editing',
}

const PIPELINE_STAGES: DraftStage[] = ['architect', 'ghostwriter', 'editor']

export default function ChapterDraftModal({
  chapterTitle,
  chapterWordCount,
  onInsert,
  onDiscard,
}: Props): React.JSX.Element {
  const { isGenerating } = useAiStore()

  const [proseText, setProseText] = useState('')
  const [architectNotes, setArchitectNotes] = useState('')
  const [editorFeedback, setEditorFeedback] = useState('')
  const [localStage, setLocalStage] = useState<DraftStage>('architect')
  const [showNotes, setShowNotes] = useState(true)
  const [showFeedback, setShowFeedback] = useState(true)
  const [confirmInsert, setConfirmInsert] = useState(false)

  const proseRef = useRef<HTMLDivElement>(null)
  const localStageRef = useRef<DraftStage>('architect')

  // Keep ref in sync for use inside IPC callbacks (avoids stale closure)
  useEffect(() => {
    localStageRef.current = localStage
  }, [localStage])

  // Set up IPC listeners to route tokens to the right bucket
  useEffect(() => {
    const unsubToken = window.electron.llama.onToken((t: { token: string; done: boolean }) => {
      if (t.done) {
        setLocalStage('done')
        return
      }
      const stage = localStageRef.current
      if (stage === 'architect') setArchitectNotes((n) => n + t.token)
      else if (stage === 'ghostwriter') setProseText((p) => p + t.token)
      else if (stage === 'editor') setEditorFeedback((f) => f + t.token)
    })

    const unsubPipeline = window.electron.llama.onPipelineStage((p: { stage: string; done: boolean }) => {
      if (!p.done) {
        const s = p.stage as DraftStage
        setLocalStage(s)
        localStageRef.current = s
      }
    })

    return () => {
      unsubToken()
      unsubPipeline()
    }
  }, [])

  // Auto-scroll prose area while it streams
  useEffect(() => {
    if (proseRef.current && localStage === 'ghostwriter') {
      proseRef.current.scrollTop = proseRef.current.scrollHeight
    }
  }, [proseText, localStage])

  const wordCount = proseText.trim().split(/\s+/).filter(Boolean).length
  const stagesDone = localStage === 'done'

  const stageIndex = (s: DraftStage): number => PIPELINE_STAGES.indexOf(s)
  const currentIdx = stagesDone ? 3 : stageIndex(localStage)

  return (
    <div className="fixed inset-0 z-[2000] bg-[var(--bg)] flex flex-col">

      {/* ── Header ──────────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between px-6 py-3 border-b border-[var(--border)] flex-shrink-0 bg-[var(--bg-card)]">
        <div className="flex items-center gap-2">
          <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z"/>
          </svg>
          <h2 className="text-sm font-semibold text-[var(--fg)]">
            Chapter Draft
            {chapterTitle && (
              <span className="text-[var(--fg-muted)] font-normal ml-1.5">— {chapterTitle}</span>
            )}
          </h2>
        </div>
        <button
          onClick={onDiscard}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-[var(--fg-muted)] hover:text-[var(--fg)] hover:bg-[var(--bg-subtle)] rounded-lg transition-colors"
        >
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M18 6 6 18M6 6l12 12"/>
          </svg>
          Discard
        </button>
      </div>

      {/* ── Pipeline progress ────────────────────────────────────────────────── */}
      <div className="flex items-center px-6 py-2.5 border-b border-[var(--border)] flex-shrink-0 bg-[var(--bg-card)] gap-0">
        {PIPELINE_STAGES.map((s, i) => {
          const done = currentIdx > i
          const active = !stagesDone && localStage === s
          return (
            <React.Fragment key={s}>
              <div className="flex items-center gap-1.5">
                <div className={`w-2 h-2 rounded-full transition-colors ${
                  done ? 'bg-[var(--accent)]'
                  : active ? 'bg-[var(--accent)] animate-pulse'
                  : 'bg-[var(--border)]'
                }`} />
                <span className={`text-[11px] transition-colors ${
                  active ? 'text-[var(--fg)] font-semibold'
                  : done ? 'text-[var(--accent)]'
                  : 'text-[var(--fg-faint)]'
                }`}>
                  {STAGE_LABELS[s]}
                </span>
              </div>
              {i < 2 && <div className="flex-1 h-px bg-[var(--border)] mx-3 min-w-[24px]" />}
            </React.Fragment>
          )
        })}
        {stagesDone && (
          <span className="ml-auto text-[11px] text-[var(--accent)] font-medium">Complete ✓</span>
        )}
      </div>

      {/* ── Main content ────────────────────────────────────────────────────── */}
      <div className="flex flex-1 min-h-0 overflow-hidden">

        {/* Prose panel */}
        <div ref={proseRef} className="flex-1 overflow-y-auto px-8 py-8">
          {localStage === 'architect' && !proseText && (
            <p className="text-sm text-[var(--fg-faint)] italic animate-pulse mt-8 text-center">
              Reviewing story continuity and character arcs…
            </p>
          )}
          {localStage === 'ghostwriter' && !proseText && (
            <p className="text-sm text-[var(--fg-faint)] italic animate-pulse mt-8 text-center">
              Writing chapter prose…
            </p>
          )}
          {proseText && (
            <div
              className="max-w-[680px] mx-auto text-[var(--fg)]"
              style={{ fontFamily: 'Georgia, "Times New Roman", serif', fontSize: 15, lineHeight: 1.8 }}
            >
              {proseText.split('\n\n').map((para, i) => (
                <p key={i} style={{ marginBottom: '1em', textIndent: i === 0 ? 0 : '1.5em' }}>
                  {para.replace(/\n/g, ' ')}
                </p>
              ))}
              {isGenerating && localStage === 'ghostwriter' && (
                <span className="inline-block w-0.5 h-4 bg-[var(--accent)] animate-pulse ml-0.5 align-middle" />
              )}
            </div>
          )}
        </div>

        {/* Sidebar — architect notes + editor feedback */}
        {(architectNotes || editorFeedback) && (
          <div className="w-64 flex-shrink-0 border-l border-[var(--border)] overflow-y-auto flex flex-col bg-[var(--bg-card)]">

            {/* Architect notes */}
            {architectNotes && (
              <div className="border-b border-[var(--border)]">
                <button
                  onClick={() => setShowNotes(!showNotes)}
                  className="w-full flex items-center justify-between px-3 py-2.5 text-[11px] font-semibold text-[var(--fg-muted)] hover:bg-[var(--bg-subtle)] transition-colors"
                >
                  <span className="flex items-center gap-1.5">
                    <span>📋</span> Story Notes
                  </span>
                  <span className="text-[var(--fg-faint)]">{showNotes ? '▾' : '▸'}</span>
                </button>
                {showNotes && (
                  <div className="px-3 pb-3 text-[11px] text-[var(--fg)] leading-relaxed whitespace-pre-wrap">
                    {architectNotes}
                  </div>
                )}
              </div>
            )}

            {/* Editor feedback */}
            {editorFeedback && (
              <div>
                <button
                  onClick={() => setShowFeedback(!showFeedback)}
                  className="w-full flex items-center justify-between px-3 py-2.5 text-[11px] font-semibold text-[var(--fg-muted)] hover:bg-[var(--bg-subtle)] transition-colors"
                >
                  <span className="flex items-center gap-1.5">
                    <span>✏️</span> Editor Feedback
                  </span>
                  <span className="text-[var(--fg-faint)]">{showFeedback ? '▾' : '▸'}</span>
                </button>
                {showFeedback && (
                  <div className="px-3 pb-3 text-[11px] text-[var(--fg)] leading-relaxed whitespace-pre-wrap">
                    {editorFeedback}
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── Footer ──────────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between px-6 py-3 border-t border-[var(--border)] flex-shrink-0 bg-[var(--bg-card)]">
        <span className="text-[11px] text-[var(--fg-faint)]">
          {wordCount > 0 && `${wordCount.toLocaleString()} words`}
          {isGenerating && wordCount > 0 && ' · '}
          {isGenerating && <span className="animate-pulse">Generating…</span>}
        </span>

        <div className="flex items-center gap-2">
          <button
            onClick={onDiscard}
            className="px-3 py-1.5 text-xs rounded-[10px] border border-[var(--border)] text-[var(--fg-muted)] hover:bg-[var(--bg-subtle)] transition-colors"
          >
            Discard
          </button>

          {!confirmInsert ? (
            <button
              onClick={() => {
                if (chapterWordCount > 50) {
                  setConfirmInsert(true)
                } else {
                  onInsert(proseText)
                }
              }}
              disabled={!proseText || isGenerating}
              className="px-3 py-1.5 text-xs rounded-[10px] bg-[var(--accent)] text-white font-medium hover:bg-[var(--accent-hover)] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              Insert Draft
            </button>
          ) : (
            <div className="flex items-center gap-1.5">
              <span className="text-[11px] text-[var(--fg-muted)]">Replace existing content?</span>
              <button
                onClick={() => onInsert(proseText)}
                className="px-2.5 py-1 text-[11px] rounded-lg bg-red-600 text-white hover:bg-red-700 transition-colors font-medium"
              >
                Replace
              </button>
              <button
                onClick={() => setConfirmInsert(false)}
                className="px-2.5 py-1 text-[11px] rounded-lg border border-[var(--border)] text-[var(--fg-muted)] hover:bg-[var(--bg-subtle)] transition-colors"
              >
                Cancel
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
