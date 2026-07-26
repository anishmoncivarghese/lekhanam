import React, { useCallback, useEffect, useRef, useState } from 'react'
import { Editor } from '@tiptap/react'
import { Chapter } from '../types'
import { useAiStore, DRAFT_LENGTH_PRESETS, DraftLength } from '../store/aiStore'

// ─── Annotation helpers (mirrors AnnotationsPanel logic, inline) ──────────────

interface Annotation {
  id: string
  comment: string
  text: string
  from: number
  to: number
}

function getAnnotations(editor: Editor): Annotation[] {
  const results: Annotation[] = []
  editor.state.doc.descendants((node, pos) => {
    if (node.isText) {
      const mark = node.marks.find((m) => m.type.name === 'annotation')
      if (mark) {
        results.push({
          id: mark.attrs.id as string,
          comment: mark.attrs.comment as string,
          text: node.text ?? '',
          from: pos,
          to: pos + node.nodeSize,
        })
      }
    }
  })
  return results
}

// ─── Footnote helpers (mirrors FootnotesPanel logic, inline) ──────────────────

interface Footnote {
  id: string
  content: string
  from: number
  to: number
}

function getFootnotes(editor: Editor): Footnote[] {
  const results: Footnote[] = []
  editor.state.doc.descendants((node, pos) => {
    if (node.isText) {
      const mark = node.marks.find((m) => m.type.name === 'footnote')
      if (mark) {
        results.push({
          id: mark.attrs.id as string,
          content: mark.attrs.content as string,
          from: pos,
          to: pos + node.nodeSize,
        })
      }
    }
  })
  return results
}

// ─── Props ───────────────────────────────────────────────────────────────────

interface Props {
  chapter: Chapter
  editorRef: React.MutableRefObject<Editor | null>
  onSave: (patch: Partial<Chapter>) => void
  localAiReady: boolean
  isGenerating: boolean
  onGenerateChapter: (summaryText: string) => void
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function ChapterNotesPanel({
  chapter,
  editorRef,
  onSave,
  localAiReady,
  isGenerating,
  onGenerateChapter,
}: Props): React.JSX.Element {
  // ── Summary state ────────────────────────────────────────────────────────
  const [summary, setSummary] = useState(chapter.summary ?? '')
  const [summaryDirty, setSummaryDirty] = useState(false)
  const summaryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // ── Notes state ──────────────────────────────────────────────────────────
  const [notes, setNotes] = useState(chapter.notes ?? '')
  const notesTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // ── Tab state ────────────────────────────────────────────────────────────
  const [activeTab, setActiveTab] = useState<'notes' | 'comments' | 'footnotes'>('notes')

  // ── Editor-dependent state ────────────────────────────────────────────────
  const [annotations, setAnnotations] = useState<Annotation[]>([])
  const [footnotes, setFootnotes] = useState<Footnote[]>([])
  const [editingFnId, setEditingFnId] = useState<string | null>(null)
  const [fnDraft, setFnDraft] = useState('')

  // ── Sync on chapter switch ────────────────────────────────────────────────
  useEffect(() => {
    setSummary(chapter.summary ?? '')
    setSummaryDirty(false)
    setNotes(chapter.notes ?? '')
  }, [chapter.id]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Scan editor for annotations + footnotes ───────────────────────────────
  useEffect(() => {
    const editor = editorRef.current
    if (!editor) return
    const refresh = (): void => {
      setAnnotations(getAnnotations(editor))
      setFootnotes(getFootnotes(editor))
    }
    refresh()
    editor.on('update', refresh)
    return () => { editor.off('update', refresh) }
  }, [editorRef, chapter.id])

  // ── Summary save ─────────────────────────────────────────────────────────
  const scheduleSummarySave = useCallback((val: string) => {
    if (summaryTimerRef.current) clearTimeout(summaryTimerRef.current)
    summaryTimerRef.current = setTimeout(() => {
      onSave({ summary: val })
      setSummaryDirty(false)
    }, 600)
  }, [onSave])

  const saveSummaryNow = useCallback(() => {
    if (summaryTimerRef.current) clearTimeout(summaryTimerRef.current)
    onSave({ summary })
    setSummaryDirty(false)
  }, [onSave, summary])

  // ── Notes save ───────────────────────────────────────────────────────────
  const scheduleNotesSave = useCallback((val: string) => {
    if (notesTimerRef.current) clearTimeout(notesTimerRef.current)
    notesTimerRef.current = setTimeout(() => {
      onSave({ notes: val })
    }, 600)
  }, [onSave])

  // ── Editor actions ────────────────────────────────────────────────────────
  const scrollToCenter = (editor: Editor, pos: number): void => {
    try {
      const { node } = editor.view.domAtPos(pos)
      const el = node instanceof Element ? node : node.parentElement
      el?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    } catch { /* ignore */ }
  }

  const goToAnnotation = (ann: Annotation): void => {
    const editor = editorRef.current
    if (!editor) return
    editor.chain().setTextSelection({ from: ann.from, to: ann.to }).run()
    editor.commands.focus()
    scrollToCenter(editor, ann.from)
  }

  const removeAnnotation = (ann: Annotation): void => {
    editorRef.current?.chain()
      .setTextSelection({ from: ann.from, to: ann.to })
      .unsetMark('annotation')
      .run()
  }

  const goToFootnote = (fn: Footnote): void => {
    const editor = editorRef.current
    if (!editor) return
    editor.chain().setTextSelection({ from: fn.from, to: fn.to }).run()
    editor.commands.focus()
    scrollToCenter(editor, fn.from)
  }

  const removeFootnote = (fn: Footnote): void => {
    editorRef.current?.chain()
      .setTextSelection({ from: fn.from, to: fn.to })
      .deleteSelection()
      .run()
  }

  const saveFootnoteEdit = (fn: Footnote): void => {
    editorRef.current?.chain()
      .setTextSelection({ from: fn.from, to: fn.to })
      .setMark('footnote', { id: fn.id, content: fnDraft })
      .run()
    setEditingFnId(null)
  }

  // ─────────────────────────────────────────────────────────────────────────

  return (
    <div className="w-full h-full flex flex-col overflow-hidden border-l border-[var(--border)] bg-[var(--bg)] panel-slide-in">

      {/* ── Summary section ─────────────────────────────────────────────── */}
      <div className="flex flex-col min-h-0 overflow-hidden" style={{ flex: '2' }}>
        {/* Header */}
        <div className="flex items-center gap-1.5 px-3 py-2 border-b border-[var(--border)] flex-shrink-0">
          <svg xmlns="http://www.w3.org/2000/svg" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="var(--fg-faint)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/>
            <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/>
          </svg>
          <span className="text-[9px] font-bold tracking-widest uppercase text-[var(--fg-faint)] select-none">Summary</span>
          <div className="flex-1" />
          {summaryDirty && (
            <button
              onClick={saveSummaryNow}
              className="text-[9px] px-2 py-0.5 rounded-md bg-[var(--accent)] text-white font-medium hover:bg-[var(--accent-hover)] transition-colors"
            >
              Save
            </button>
          )}
        </div>

        {/* Textarea */}
        <div className="flex-1 min-h-0 p-2 overflow-hidden flex flex-col">
          <textarea
            value={summary}
            onChange={(e) => {
              setSummary(e.target.value)
              setSummaryDirty(true)
              scheduleSummarySave(e.target.value)
            }}
            placeholder="Brief summary of what happens in this chapter…"
            className="flex-1 w-full px-3 py-2 rounded-[10px] border border-[var(--border)] bg-[var(--bg-card)] text-[var(--fg)] placeholder-[var(--fg-faint)] text-xs leading-relaxed resize-none focus:outline-none focus:ring-1 focus:ring-[var(--focus-ring)] focus:border-[var(--accent)]"
            style={{ minHeight: 80 }}
          />
        </div>

        {/* Generate Chapter — length preset + button.
            Always visible once the summary has real content; when no model is
            loaded, the controls render in a disabled state so the affordance
            is discoverable and the button copy points the user to the Models tab. */}
        {summary.trim().length > 20 && (
          <div className="px-3 pb-2 flex-shrink-0">
            <DraftLengthPicker disabled={isGenerating || !localAiReady} />
            <button
              onClick={() => onGenerateChapter(summary)}
              disabled={isGenerating || !localAiReady}
              title={!localAiReady ? 'Open the Models tab and load an AI model to enable chapter generation' : undefined}
              className="w-full flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg border border-[var(--accent)] text-[var(--accent)] text-xs font-medium hover:bg-[var(--accent)] hover:text-white transition-colors disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-transparent disabled:hover:text-[var(--accent)]"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z"/>
              </svg>
              {isGenerating ? 'Generating…' : !localAiReady ? 'Load AI model to generate chapter' : 'Generate Chapter'}
            </button>
          </div>
        )}

      </div>

      {/* ── Divider ─────────────────────────────────────────────────────── */}
      <div className="border-t border-[var(--border)] flex-shrink-0" />

      {/* ── Tabbed bottom section ────────────────────────────────────────── */}
      <div className="flex flex-col min-h-0 overflow-hidden" style={{ flex: '3' }}>

        {/* Tab icon bar */}
        <div className="flex items-center gap-0.5 px-2 py-1.5 border-b border-[var(--border)] flex-shrink-0">
          {/* Notes tab */}
          <button
            onClick={() => setActiveTab('notes')}
            title="Notes — private scratch pad"
            className={`w-7 h-7 flex items-center justify-center rounded-md transition-colors ${activeTab === 'notes' ? 'bg-[var(--bg-amber)] text-[var(--accent-hover)]' : 'text-[var(--fg-faint)] hover:bg-[var(--bg-subtle)] hover:text-[var(--fg)]'}`}
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
              <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
              <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
            </svg>
          </button>

          {/* Comments tab */}
          <button
            onClick={() => setActiveTab('comments')}
            title={`Comments${annotations.length > 0 ? ` (${annotations.length})` : ''}`}
            className={`relative w-7 h-7 flex items-center justify-center rounded-md transition-colors ${activeTab === 'comments' ? 'bg-[var(--bg-amber)] text-[var(--accent-hover)]' : 'text-[var(--fg-faint)] hover:bg-[var(--bg-subtle)] hover:text-[var(--fg)]'}`}
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
            </svg>
            {annotations.length > 0 && (
              <span className="absolute -top-0.5 -right-0.5 text-[8px] font-bold bg-[var(--accent)] text-white w-3.5 h-3.5 rounded-full flex items-center justify-center leading-none">
                {annotations.length}
              </span>
            )}
          </button>

          {/* Footnotes tab */}
          <button
            onClick={() => setActiveTab('footnotes')}
            title={`Footnotes${footnotes.length > 0 ? ` (${footnotes.length})` : ''}`}
            className={`relative w-7 h-7 flex items-center justify-center rounded-md transition-colors ${activeTab === 'footnotes' ? 'bg-[var(--bg-amber)] text-[var(--accent-hover)]' : 'text-[var(--fg-faint)] hover:bg-[var(--bg-subtle)] hover:text-[var(--fg)]'}`}
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
              <polyline points="14,2 14,8 20,8"/>
              <line x1="8" y1="13" x2="16" y2="13"/>
              <line x1="8" y1="17" x2="12" y2="17"/>
            </svg>
            {footnotes.length > 0 && (
              <span className="absolute -top-0.5 -right-0.5 text-[8px] font-bold bg-[var(--accent)] text-white w-3.5 h-3.5 rounded-full flex items-center justify-center leading-none">
                {footnotes.length}
              </span>
            )}
          </button>

          <div className="flex-1" />

          {/* Tab label */}
          <span className="text-[9px] font-semibold tracking-widest uppercase text-[var(--fg-faint)] select-none pr-1">
            {activeTab === 'notes' ? 'Notes' : activeTab === 'comments' ? 'Comments' : 'Footnotes'}
          </span>
        </div>

        {/* ── Notes tab ───────────────────────────────────────────────────── */}
        {activeTab === 'notes' && (
          <div className="flex-1 min-h-0 p-2 flex flex-col">
            <textarea
              value={notes}
              onChange={(e) => { setNotes(e.target.value); scheduleNotesSave(e.target.value) }}
              placeholder="Research, reminders, rough ideas — private scratch pad for this chapter…"
              className="flex-1 w-full px-3 py-2 rounded-[10px] border border-[var(--border)] bg-[var(--bg-card)] text-[var(--fg)] placeholder-[var(--fg-faint)] text-xs leading-relaxed resize-none focus:outline-none focus:ring-1 focus:ring-[var(--focus-ring)] focus:border-[var(--accent)]"
            />
            <p className="mt-1 text-[9px] text-[var(--fg-faint)] select-none">Auto-saved.</p>
          </div>
        )}

        {/* ── Comments tab ────────────────────────────────────────────────── */}
        {activeTab === 'comments' && (
          <div className="flex-1 min-h-0 overflow-y-auto">
            {annotations.length === 0 ? (
              <div className="flex flex-col items-center justify-center text-center px-4 py-10 gap-2">
                <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="var(--fg-faint)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
                </svg>
                <p className="text-xs text-[var(--fg-faint)]">No comments yet</p>
                <p className="text-[10px] text-[var(--fg-faint)] leading-relaxed">Select text in the editor and click 💬 in the bubble menu to add a comment</p>
              </div>
            ) : (
              <div className="divide-y divide-[var(--border)]">
                {annotations.map((ann) => (
                  <div
                    key={ann.id}
                    className="px-3 py-2.5 hover:bg-[var(--bg-subtle)] transition-colors group cursor-pointer"
                    onClick={() => goToAnnotation(ann)}
                  >
                    <p className="text-[10px] font-medium text-[var(--accent)] line-clamp-1 mb-0.5">"{ann.text}"</p>
                    <p className="text-xs text-[var(--fg)] leading-snug">{ann.comment}</p>
                    <button
                      onClick={(e) => { e.stopPropagation(); removeAnnotation(ann) }}
                      className="mt-1 text-[9px] text-[var(--fg-faint)] hover:text-red-500 transition-colors opacity-0 group-hover:opacity-100"
                    >
                      Remove
                    </button>
                  </div>
                ))}
              </div>
            )}
            <p className="px-3 py-2 text-[9px] text-[var(--fg-faint)] border-t border-[var(--border)] select-none">
              Comments are editor-only — not included in exports
            </p>
          </div>
        )}

        {/* ── Footnotes tab ───────────────────────────────────────────────── */}
        {activeTab === 'footnotes' && (
          <div className="flex-1 min-h-0 overflow-y-auto">
            {footnotes.length === 0 ? (
              <div className="flex flex-col items-center justify-center text-center px-4 py-10 gap-2">
                <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="var(--fg-faint)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                  <polyline points="14,2 14,8 20,8"/>
                </svg>
                <p className="text-xs text-[var(--fg-faint)]">No footnotes yet</p>
                <p className="text-[10px] text-[var(--fg-faint)] leading-relaxed">Click ¹ in the editor toolbar to insert a footnote at the cursor</p>
              </div>
            ) : (
              <div className="divide-y divide-[var(--border)]">
                {footnotes.map((fn, idx) => (
                  <div key={fn.id} className="px-3 py-2.5 group hover:bg-[var(--bg-subtle)] transition-colors">
                    <div className="flex items-center gap-1.5 mb-1 cursor-pointer" onClick={() => goToFootnote(fn)}>
                      <span className="text-[10px] font-bold text-[var(--accent)] bg-[var(--bg-amber)] px-1.5 py-0.5 rounded leading-none">{idx + 1}</span>
                      <span className="text-[9px] text-[var(--fg-faint)] group-hover:text-[var(--fg-muted)] transition-colors">Go to ↗</span>
                    </div>
                    {editingFnId === fn.id ? (
                      <textarea
                        autoFocus
                        value={fnDraft}
                        onChange={(e) => setFnDraft(e.target.value)}
                        onBlur={() => saveFootnoteEdit(fn)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); saveFootnoteEdit(fn) }
                          if (e.key === 'Escape') setEditingFnId(null)
                        }}
                        rows={3}
                        className="w-full px-2 py-1.5 text-xs border border-[var(--accent)] rounded-lg bg-[var(--bg)] text-[var(--fg)] focus:outline-none resize-none leading-relaxed"
                      />
                    ) : (
                      <p
                        className="text-xs text-[var(--fg)] leading-snug cursor-text hover:text-[var(--accent)] transition-colors"
                        onClick={() => { setEditingFnId(fn.id); setFnDraft(fn.content) }}
                        title="Click to edit footnote text"
                      >
                        {fn.content || <span className="text-[var(--fg-faint)] italic">Empty — click to add text</span>}
                      </p>
                    )}
                    <button
                      onClick={() => removeFootnote(fn)}
                      className="mt-1 text-[9px] text-[var(--fg-faint)] hover:text-red-500 transition-colors opacity-0 group-hover:opacity-100"
                    >
                      Remove
                    </button>
                  </div>
                ))}
              </div>
            )}
            <p className="px-3 py-2 text-[9px] text-[var(--fg-faint)] border-t border-[var(--border)] select-none">
              Footnotes export as proper Word footnotes in DOCX
            </p>
          </div>
        )}

      </div>
    </div>
  )
}

// ─── Draft length preset picker ──────────────────────────────────────────────
function DraftLengthPicker({ disabled }: { disabled: boolean }): React.JSX.Element {
  const { draftLength, setDraftLength } = useAiStore()
  const presets: DraftLength[] = ['flash', 'short', 'standard', 'long']
  return (
    <div className="mb-1.5">
      <div className="flex items-center justify-between mb-1">
        <span className="text-[10px] uppercase tracking-wider text-[var(--fg-faint)]">Target length</span>
        <span className="text-[10px] tabular-nums text-[var(--fg-muted)]">
          ~{DRAFT_LENGTH_PRESETS[draftLength].words.toLocaleString()} words
        </span>
      </div>
      <div className="grid grid-cols-4 gap-1" role="radiogroup" aria-label="Draft length">
        {presets.map((p) => {
          const active = p === draftLength
          return (
            <button
              key={p}
              role="radio"
              aria-checked={active}
              disabled={disabled}
              onClick={() => setDraftLength(p)}
              className="py-1 rounded-[8px] text-[10px] font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              style={{
                background: active ? 'var(--accent)' : 'var(--bg-subtle)',
                color: active ? 'white' : 'var(--fg-muted)',
                border: `1px solid ${active ? 'var(--accent)' : 'var(--divider)'}`,
              }}
            >
              {DRAFT_LENGTH_PRESETS[p].label}
            </button>
          )
        })}
      </div>
    </div>
  )
}
