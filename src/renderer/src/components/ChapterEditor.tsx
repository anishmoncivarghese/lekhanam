import React, { useState, useCallback, useRef, useEffect } from 'react'
import { Editor } from '@tiptap/react'
import { Chapter } from '../types'
import { useBookStore } from '../store/bookStore'
import { useAiStore, buildSystemPrompt, ARCHITECT_SYSTEM, EDITOR_SYSTEM, DRAFT_LENGTH_PRESETS } from '../store/aiStore'
import RichTextEditor from './RichTextEditor'
import MicButton from './MicButton'
import VoskLanguageSelector from './VoskLanguageSelector'
import AiSidePanel from './AiSidePanel'
import ChapterNotesPanel from './ChapterNotesPanel'
import ChapterDraftModal from './ChapterDraftModal'
import { useSpeech } from '../hooks/useSpeech'
import { useUIStore } from '../store/uiStore'
import { VOSK_MODELS } from '../utils/voskModels'

interface Props {
  chapter: Chapter
}

interface PendingInsert {
  text: string
  tab: 'write' | 'plan'
  from: number // ProseMirror anchor before insert (0 for non-write tabs)
  to: number   // ProseMirror anchor after insert (0 for non-write tabs)
}

type WandAction = { action: 'expand' | 'shorten' | 'sensory'; selectedText: string }

// ── Markdown helpers for Scene Beats preview ─────────────────────────────────

function inlineMarkdown(s: string): string {
  return s
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

export default function ChapterEditor({ chapter }: Props): React.JSX.Element {
  const isChapter = !chapter.kind || chapter.kind === 'chapter'
  const [view, setView] = useState<'write' | 'plan'>('write')
  const [showNotesPanel, setShowNotesPanel] = useState(false)
  const [planGoal,  setPlanGoal]  = useState(chapter.planGoal  ?? '')
  const [planPov,   setPlanPov]   = useState(chapter.planPov   ?? '')
  const [planBeats, setPlanBeats] = useState(chapter.planBeats ?? '')
  const [beatsPreview, setBeatsPreview] = useState(false)
  const [pendingInsert, setPendingInsert] = useState<PendingInsert | null>(null)
  const [showAiPanel, setShowAiPanel] = useState(false)
  const [panelExpanded, setPanelExpanded] = useState(false)
  const [showDraftModal, setShowDraftModal] = useState(false)
  const [pendingWandAction, setPendingWandAction] = useState<WandAction | null>(null)
  const [showTargetInput, setShowTargetInput] = useState(false)
  const [showShortcuts, setShowShortcuts] = useState(false)
  const shortcutsRef = useRef<HTMLDivElement>(null)
  const [targetDraft, setTargetDraft] = useState(String(chapter.wordTarget ?? ''))

  // ── Auto-save state ───────────────────────────────────────────────────────
  type SaveStatus = 'idle' | 'unsaved' | 'saving' | 'saved'
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('idle')
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const pendingContentRef = useRef<{ content: object; wordCount: number; chapter: Chapter } | null>(null)

  // ── Spell check state ─────────────────────────────────────────────────────
  const [spellCheckActive, setSpellCheckActive] = useState(false)

  const { saveChapter, currentBook, characters, chapters } = useBookStore()
  const { modelStatus, aiStyle, memoryHealth, loadedModelId, isGenerating, clearStream, setIsGenerating, setActiveMode, setPipelineStage, setGeneratingMode, assistiveWriting } = useAiStore()
  const { speechLanguage, focusMode, exitFocusMode } = useUIStore()
  const aiReady = loadedModelId === 'lekha-2b' || (modelStatus === 'ready' && memoryHealth !== 'red')

  const activeVoskModel = VOSK_MODELS.find((m) => m.id === speechLanguage) ?? VOSK_MODELS[0]

  const editorRef = useRef<Editor | null>(null)
  const planSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const viewRef = useRef(view)
  viewRef.current = view

  // Close shortcuts popover on click-outside or Escape
  useEffect(() => {
    if (!showShortcuts) return
    const onKey = (e: KeyboardEvent): void => { if (e.key === 'Escape') setShowShortcuts(false) }
    const onMouse = (e: MouseEvent): void => {
      if (shortcutsRef.current && !shortcutsRef.current.contains(e.target as Node)) setShowShortcuts(false)
    }
    document.addEventListener('keydown', onKey)
    document.addEventListener('mousedown', onMouse)
    return () => { document.removeEventListener('keydown', onKey); document.removeEventListener('mousedown', onMouse) }
  }, [showShortcuts])

  // Reset to write tab when switching to non-chapter content
  useEffect(() => {
    if (!isChapter) setView('write')
  }, [isChapter])

  // On chapter switch: flush any pending save for the PREVIOUS chapter, then reset all state
  useEffect(() => {
    // Cancel the debounce timer and immediately save pending content
    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current)
      saveTimerRef.current = null
    }
    if (pendingContentRef.current) {
      const { content, wordCount, chapter: prevChapter } = pendingContentRef.current
      saveChapter({ ...prevChapter, content, wordCount, updatedAt: new Date().toISOString() })
      pendingContentRef.current = null
    }
    setSaveStatus('idle')
    // Reset plan state to the new chapter's data
    setPlanGoal(chapter.planGoal   ?? '')
    setPlanPov(chapter.planPov    ?? '')
    setPlanBeats(chapter.planBeats ?? '')
    setBeatsPreview(false)
    setShowTargetInput(false)
    setTargetDraft(String(chapter.wordTarget ?? ''))
    setPanelExpanded(false)
  }, [chapter.id]) // eslint-disable-line react-hooks/exhaustive-deps

  const scheduleplanSave = useCallback((patch: Partial<Chapter>) => {
    if (planSaveTimerRef.current) clearTimeout(planSaveTimerRef.current)
    planSaveTimerRef.current = setTimeout(() => {
      saveChapter({ ...chapter, ...patch, updatedAt: new Date().toISOString() })
    }, 1000)
  }, [chapter, saveChapter])


  const handleSaveTarget = useCallback(() => {
    const num = parseInt(targetDraft)
    if (!isNaN(num) && num > 0) {
      saveChapter({ ...chapter, wordTarget: num, updatedAt: new Date().toISOString() })
    }
    setShowTargetInput(false)
  }, [chapter, targetDraft, saveChapter])

  const handleClearTarget = useCallback(() => {
    saveChapter({ ...chapter, wordTarget: undefined, updatedAt: new Date().toISOString() })
    setTargetDraft('')
    setShowTargetInput(false)
  }, [chapter, saveChapter])

  const handleContentChange = useCallback(
    (content: object, wordCount: number) => {
      // Capture latest content + the chapter snapshot so a pending save
      // always goes to the correct chapter even after navigation.
      pendingContentRef.current = { content, wordCount, chapter }
      setSaveStatus('unsaved')
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
      saveTimerRef.current = setTimeout(async () => {
        const pending = pendingContentRef.current
        if (!pending) return
        setSaveStatus('saving')
        pendingContentRef.current = null
        await saveChapter({
          ...pending.chapter,
          content: pending.content,
          wordCount: pending.wordCount,
          updatedAt: new Date().toISOString(),
        })
        setSaveStatus('saved')
        // Fade back to idle; guard against being clobbered by a new 'saving' state
        setTimeout(() => setSaveStatus((s) => (s === 'saved' ? 'idle' : s)), 3000)
      }, 3000)
    },
    [chapter, saveChapter]
  )

  // Called when Whisper delivers final transcript
  const handleFinalTranscript = useCallback((text: string) => {
    const editor = editorRef.current
    if (!editor) return
    const from = editor.state.selection.anchor
    editor.commands.insertContent(`<mark>${text}</mark> `)
    const to = editor.state.selection.anchor
    setPendingInsert({ text, tab: 'write', from, to })
  }, [])

  const { state: speechState, interimText, startRecording, stopRecording } = useSpeech({
    sessionId: chapter.id,
    onFinal: handleFinalTranscript,
    onError: (msg) => alert(`Dictation error:\n\n${msg}`),
    voskModelFilename: activeVoskModel.filename,
  })

  const handleStartRecording = useCallback(() => {
    setPendingInsert(null)
    startRecording()
  }, [startRecording])

  const handleKeep = useCallback(() => {
    if (!pendingInsert) return
    const editor = editorRef.current
    if (editor) {
      editor
        .chain()
        .setTextSelection({ from: pendingInsert.from, to: pendingInsert.to - 1 })
        .unsetHighlight()
        .setTextSelection(pendingInsert.to)
        .run()
    }
    setPendingInsert(null)
  }, [pendingInsert])

  const handleRemove = useCallback(() => {
    if (!pendingInsert) return
    if (pendingInsert.tab === 'write') {
      const editor = editorRef.current
      if (editor) {
        editor.chain().deleteRange({ from: pendingInsert.from, to: pendingInsert.to }).run()
      }
    }
    setPendingInsert(null)
  }, [pendingInsert])

  // ── Magic Wand BubbleMenu handler ─────────────────────────────────────────
  const handleMagicWandAction = useCallback(
    (action: 'expand' | 'shorten' | 'sensory', selectedText: string) => {
      if (!aiReady) return
      setShowAiPanel(true)
      setActiveMode('assist')
      setPendingWandAction({ action, selectedText })
    },
    [aiReady, setActiveMode]
  )

  // ── Generate Chapter from Summary ─────────────────────────────────────────
  const handleGenerateChapter = useCallback(async (summaryText: string) => {
    // Only works with local model (Lekha AI or Qwen)
    if (modelStatus !== 'ready' || memoryHealth === 'red' || !summaryText.trim()) return

    // Sort chapters by order to find the previous one
    const orderedChapters = [...chapters].sort((a, b) => a.order - b.order)
    const currentIdx = orderedChapters.findIndex((c) => c.id === chapter.id)
    const prevChapter = currentIdx > 0 ? orderedChapters[currentIdx - 1] : null

    // Characters mentioned by name in the summary
    const mentionedChars = characters.filter((c) =>
      summaryText.toLowerCase().includes(c.name.toLowerCase())
    )

    // Rolling context: budget = 50% of contextSize tokens → approx chars (1 token ≈ 4 chars)
    const contextBudget = ((useAiStore.getState()?.contextSize ?? 4096) / 2) * 4
    let prevContext = ''
    if (prevChapter?.summary) {
      const prevText = `Previous chapter (${prevChapter.title}): ${prevChapter.summary}`
      prevContext = prevText.slice(0, contextBudget)
    }

    const charContext = mentionedChars
      .map((c) => {
        const parts = [
          c.age && `Age: ${c.age}`,
          c.gender && `Gender: ${c.gender}`,
          c.ghost && `Ghost: ${c.ghost}`,
          c.lie && `Lie: ${c.lie}`,
          c.voiceProfile && `Voice: ${c.voiceProfile}`
        ].filter(Boolean)
        return `${c.name}${c.role ? ` (${c.role})` : ''}: ${parts.join('; ')}`
      })
      .join('\n')

    const userPrompt = [
      prevContext,
      charContext ? `Characters in this chapter:\n${charContext}` : '',
      `Scene outline — expand into full chapter prose:\n${summaryText}`
    ]
      .filter(Boolean)
      .join('\n\n')

    const architectPrompt = { sys: ARCHITECT_SYSTEM, user: userPrompt }
    const ghostwriterSys = buildSystemPrompt(aiStyle)
    const targetWords = DRAFT_LENGTH_PRESETS[useAiStore.getState().draftLength].words

    clearStream()
    setIsGenerating(true)
    setGeneratingMode('chapter-draft')
    setPipelineStage('architect')
    setShowDraftModal(true)
    await window.electron.llama.generatePipelined(architectPrompt, ghostwriterSys, true, EDITOR_SYSTEM, targetWords)
  }, [modelStatus, memoryHealth, chapter, chapters, characters, aiStyle, clearStream,
      setIsGenerating, setGeneratingMode, setPipelineStage])

  // ── Insert draft from Chapter Draft Modal ─────────────────────────────────
  const handleInsertDraft = useCallback((prose: string) => {
    const editor = editorRef.current
    if (!editor || !prose) return
    const paragraphs = prose.split('\n\n').filter(Boolean)
    editor.commands.setContent(
      paragraphs.map((p) => `<p>${p.replace(/\n/g, '<br/>')}</p>`).join('')
    )
    setShowDraftModal(false)
    clearStream()
    setIsGenerating(false)
    setGeneratingMode(null)
  }, [editorRef, clearStream, setIsGenerating, setGeneratingMode])

  const showSpeechPanel = speechState !== 'idle' || pendingInsert !== null
  const showRightPanel = showSpeechPanel || showAiPanel || showNotesPanel

  return (
    <div className="flex flex-col h-full">
      {/* Sub-tab bar — hidden in focus mode */}
      <div className={`transition-all duration-300 ease-in-out flex-shrink-0 ${focusMode ? 'overflow-hidden max-h-0' : 'overflow-visible max-h-[56px]'}`}>
      <div className="flex items-center gap-1 px-4 pt-3 pb-0 border-b border-[var(--border)] bg-[var(--bg-card)]">
        <SubTabBtn active={view === 'write'} onClick={() => setView('write')}>
          Write
        </SubTabBtn>
        {isChapter && (
          <SubTabBtn active={view === 'plan'} onClick={() => setView('plan')}>
            Plan
          </SubTabBtn>
        )}
        <div className="ml-auto flex items-center gap-2 pr-2">
          {/* Word count + optional target — leftmost in the right group */}
          <div className="relative flex items-center gap-1">
            {chapter.wordTarget ? (
              <span
                onClick={() => { setTargetDraft(String(chapter.wordTarget ?? '')); setShowTargetInput((v) => !v) }}
                title="Click to edit word target"
                className={`px-2 py-0.5 rounded-md text-xs font-medium border cursor-pointer transition-colors ${
                  (chapter.wordCount ?? 0) >= chapter.wordTarget
                    ? 'border-green-500/40 bg-green-500/10 text-green-600 dark:text-green-400'
                    : 'border-[var(--border-amber)] bg-[var(--bg-amber)] text-[var(--today-title)]'
                }`}
              >
                {(chapter.wordCount ?? 0).toLocaleString()} / {chapter.wordTarget.toLocaleString()}
              </span>
            ) : (
              <span className="text-xs text-[var(--fg-faint)]">{(chapter.wordCount ?? 0).toLocaleString()} words</span>
            )}
            <button
              onClick={() => { setTargetDraft(String(chapter.wordTarget ?? '')); setShowTargetInput((v) => !v) }}
              title={chapter.wordTarget ? 'Edit word target' : 'Set word target'}
              className={`flex items-center justify-center w-5 h-5 rounded transition-colors ${showTargetInput ? 'text-[var(--accent)]' : 'text-[var(--fg-faint)] hover:text-[var(--fg)] hover:bg-[var(--bg-subtle)]'}`}
            >
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/>
              </svg>
            </button>
            {showTargetInput && (
              <div className="absolute left-0 top-full mt-1.5 z-20 bg-[var(--bg-card)] border border-[var(--border)] rounded-xl shadow-lg p-3 flex flex-col gap-2 min-w-[176px]">
                <p className="text-xs font-semibold text-[var(--fg-muted)]">Word target</p>
                <div className="flex gap-2 items-center">
                  <input
                    type="number"
                    min="1"
                    value={targetDraft}
                    onChange={(e) => setTargetDraft(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') handleSaveTarget()
                      if (e.key === 'Escape') setShowTargetInput(false)
                    }}
                    autoFocus
                    placeholder="e.g. 3000"
                    className="w-24 px-2 py-1.5 rounded-[10px] border border-[var(--border)] bg-[var(--bg)] text-[var(--fg)] text-xs focus:outline-none focus:ring-2 focus:ring-[var(--focus-ring)] focus:border-[var(--accent)]"
                  />
                  <button
                    onClick={handleSaveTarget}
                    className="px-2.5 py-1.5 rounded-[10px] bg-[var(--accent)] text-white text-xs font-medium hover:bg-[var(--accent-hover)] transition-colors"
                  >
                    Set
                  </button>
                </div>
                {chapter.wordTarget && (
                  <button
                    onClick={handleClearTarget}
                    className="text-xs text-[var(--fg-faint)] hover:text-red-500 transition-colors text-left"
                  >
                    Clear target
                  </button>
                )}
              </div>
            )}
          </div>

          {/* Divider */}
          <div className="w-px h-4 bg-[var(--border)]" />

          {/* Spell check button */}
          {view === 'write' && (
            <button
              onClick={() => setSpellCheckActive((v) => !v)}
              title={spellCheckActive ? 'Spell Check ON — click to disable' : 'Spell Check OFF — click to enable'}
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium transition-colors border ${
                spellCheckActive
                  ? 'border-red-500/60 bg-red-500/10 text-red-500'
                  : 'border-[var(--border)] text-[var(--fg-muted)] hover:bg-[var(--bg-subtle)]'
              }`}
            >
              <span style={{
                textDecoration: 'underline',
                textDecorationStyle: 'wavy',
                textDecorationColor: '#ef4444',
              }}>ABC</span>
            </button>
          )}
          {/* Auto-save status */}
          {saveStatus === 'saving' && (
            <span className="flex items-center gap-1 text-xs text-[var(--fg-faint)]">
              <svg className="animate-spin w-3 h-3 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M21 12a9 9 0 1 1-6.219-8.56" />
              </svg>
              Saving…
            </span>
          )}
          {saveStatus === 'saved' && (
            <span className="flex items-center gap-1 text-xs text-[var(--color-success)] transition-colors duration-300">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M20 6 9 17l-5-5" />
              </svg>
              Saved
            </span>
          )}
          <MicButton state={speechState} onStart={handleStartRecording} onStop={stopRecording} />
          <VoskLanguageSelector />
          {/* AI toggle */}
          <button
            onClick={() => { setShowAiPanel((v) => !v); setShowNotesPanel(false); setPanelExpanded(false) }}
            title="AI Writing Assistant"
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium transition-colors ${
              showAiPanel
                ? 'bg-[var(--accent)] text-white'
                : 'border border-[var(--border)] text-[var(--fg-muted)] hover:bg-[var(--bg-subtle)]'
            }`}
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z" />
            </svg>
            AI
          </button>
          {/* Notes toggle */}
          {isChapter && (
            <button
              onClick={() => { setShowNotesPanel((v) => !v); setShowAiPanel(false); setPanelExpanded(false) }}
              title="Notes & Annotations"
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium transition-colors ${
                showNotesPanel
                  ? 'bg-[var(--accent)] text-white'
                  : 'border border-[var(--border)] text-[var(--fg-muted)] hover:bg-[var(--bg-subtle)]'
              }`}
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" /><line x1="16" y1="13" x2="8" y2="13" /><line x1="16" y1="17" x2="8" y2="17" /><polyline points="10 9 9 9 8 9" />
              </svg>
              Notes
            </button>
          )}

          {/* ℹ Keyboard shortcuts */}
          <div className="relative" ref={shortcutsRef}>
            <button
              onClick={() => setShowShortcuts((v) => !v)}
              title="Keyboard shortcuts"
              className={`flex items-center justify-center w-5 h-5 rounded transition-colors ${
                showShortcuts ? 'text-[var(--accent)]' : 'text-[var(--fg-faint)] hover:text-[var(--fg)] hover:bg-[var(--bg-subtle)]'
              }`}
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/>
              </svg>
            </button>
            {showShortcuts && (
              <div className="absolute right-0 top-full mt-1.5 z-30 bg-[var(--bg-card)] border border-[var(--border)] rounded-xl shadow-lg p-3 w-60 select-none">
                <p className="text-[10px] font-semibold text-[var(--fg-faint)] uppercase tracking-wider mb-2.5">Keyboard Shortcuts</p>
                {([
                  { section: 'Formatting' },
                  { key: '⌘B',   label: 'Bold' },
                  { key: '⌘I',   label: 'Italic' },
                  { key: '⌘U',   label: 'Underline' },
                  { key: '⌘Z',   label: 'Undo' },
                  { key: '⌘⇧Z',  label: 'Redo' },
                  { section: 'Find' },
                  { key: '⌘F',   label: 'Find & Replace' },
                  { section: 'View' },
                  { key: '⌥⌘F',  label: 'Focus / Composition Mode' },
                  { key: 'Esc',  label: 'Exit Focus / Close panels' },
                ] as Array<{ section?: string; key?: string; label?: string }>).map((row, i) =>
                  row.section ? (
                    <p key={i} className="text-[9px] font-semibold text-[var(--fg-faint)] uppercase tracking-wider mt-2 mb-1 first:mt-0">{row.section}</p>
                  ) : (
                    <div key={i} className="flex items-center justify-between py-0.5">
                      <span className="text-xs text-[var(--fg-muted)]">{row.label}</span>
                      <kbd className="px-1.5 py-0.5 rounded text-[10px] font-mono bg-[var(--bg-subtle)] border border-[var(--border)] text-[var(--fg-muted)] leading-none">{row.key}</kbd>
                    </div>
                  )
                )}
              </div>
            )}
          </div>
        </div>
      </div>
      </div>{/* end focus-mode collapsible toolbar */}

      {/* Focus mode exit pill */}
      {focusMode && (
        <button
          onClick={exitFocusMode}
          className="fixed top-4 right-4 z-50 px-3 py-1.5 rounded-full text-xs font-medium bg-[var(--bg-card)] border border-[var(--border)] shadow-lg text-[var(--fg-muted)] opacity-25 hover:opacity-100 transition-opacity duration-200"
          title="Exit focus mode"
        >
          Exit Focus &nbsp;⌥⌘F
        </button>
      )}

      {/* Content + optional right panel */}
      <div className="flex-1 min-w-0 overflow-hidden flex">
        {/* ── Main content (write or summary) ── */}
        <div className="flex-1 min-w-0 overflow-hidden flex flex-col">
          {view === 'write' && (
            <div className="flex-1 min-w-0 overflow-hidden">
              {currentBook && (
                <RichTextEditor
                  content={chapter.content}
                  bookId={currentBook.id}
                  formatKey={currentBook.format}
                  onChange={handleContentChange}
                  onEditorReady={(editor) => { editorRef.current = editor }}
                  onMagicWandAction={handleMagicWandAction}
                  spellCheckEnabled={spellCheckActive}
                  aiReady={aiReady}
                  assistiveWriting={assistiveWriting}
                  chapterTitle={chapter.title}
                  chapterKind={chapter.kind}
                  focusMode={focusMode}
                  onExitFocusMode={exitFocusMode}
                />
              )}
            </div>
          )}

          {/* ── Plan tab ── */}
          {view === 'plan' && (
            <div className="flex-1 overflow-y-auto p-8 max-w-2xl">
              <p className="text-xs uppercase tracking-widest text-[var(--fg-faint)] mb-6">Chapter Micro-Plan</p>

              {/* Goal */}
              <div className="mb-5">
                <label className="text-[11px] font-semibold text-[var(--fg-faint)] uppercase tracking-wider block mb-1.5">
                  Chapter Goal
                </label>
                <input
                  type="text"
                  value={planGoal}
                  onChange={(e) => { setPlanGoal(e.target.value); scheduleplanSave({ planGoal: e.target.value }) }}
                  placeholder="What must happen by the end of this chapter?"
                  className="w-full px-4 py-2.5 rounded-xl border border-[var(--border)] bg-[var(--bg-card)] text-[var(--fg)] placeholder-[var(--fg-faint)] text-sm focus:outline-none focus:ring-2 focus:ring-[var(--focus-ring)] focus:border-[var(--accent)]"
                />
              </div>

              {/* POV */}
              <div className="mb-5">
                <label className="text-[11px] font-semibold text-[var(--fg-faint)] uppercase tracking-wider block mb-1.5">
                  POV Character
                </label>
                <input
                  type="text"
                  value={planPov}
                  onChange={(e) => { setPlanPov(e.target.value); scheduleplanSave({ planPov: e.target.value }) }}
                  placeholder="Whose eyes do we see through?"
                  className="w-full px-4 py-2.5 rounded-xl border border-[var(--border)] bg-[var(--bg-card)] text-[var(--fg)] placeholder-[var(--fg-faint)] text-sm focus:outline-none focus:ring-2 focus:ring-[var(--focus-ring)] focus:border-[var(--accent)]"
                />
              </div>

              {/* Scene Beats */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-[11px] font-semibold text-[var(--fg-faint)] uppercase tracking-wider">
                    Scene Beats
                  </label>
                  <button
                    onClick={() => setBeatsPreview((v) => !v)}
                    className="text-xs text-[var(--fg-faint)] hover:text-[var(--fg)] px-2 py-0.5 rounded border border-[var(--border)] transition-colors"
                  >
                    {beatsPreview ? 'Edit' : 'Preview'}
                  </button>
                </div>

                {beatsPreview ? (
                  <div
                    className="min-h-[220px] px-4 py-3 rounded-xl border border-[var(--border)] bg-[var(--bg-card)] text-[var(--fg)] text-sm leading-relaxed"
                    dangerouslySetInnerHTML={{ __html: renderBeats(planBeats) }}
                    onClick={(e) => {
                      const cb = (e.target as HTMLElement).closest('input[type="checkbox"]') as HTMLInputElement | null
                      if (!cb) return
                      const idx = Number(cb.dataset.idx)
                      const toggled = toggleBeat(planBeats, idx)
                      setPlanBeats(toggled)
                      scheduleplanSave({ planBeats: toggled })
                    }}
                  />
                ) : (
                  <textarea
                    value={planBeats}
                    onChange={(e) => { setPlanBeats(e.target.value); scheduleplanSave({ planBeats: e.target.value }) }}
                    placeholder={'Use markdown:\n- [ ] Scene beat to write\n- [x] Beat already done\n# Act break\n**key moment**'}
                    className="w-full min-h-[220px] px-4 py-3 rounded-xl border border-[var(--border)] bg-[var(--bg-card)] text-[var(--fg)] placeholder-[var(--fg-faint)] text-sm leading-relaxed font-mono resize-none focus:outline-none focus:ring-2 focus:ring-[var(--focus-ring)] focus:border-[var(--accent)]"
                  />
                )}
                <p className="mt-1.5 text-[10px] text-[var(--fg-faint)]">
                  Supports markdown — use <code className="bg-[var(--bg-subtle)] px-1 rounded">- [ ]</code> for checkboxes. Auto-saved.
                </p>
              </div>
            </div>
          )}

        </div>

        {/* ── Right panel: Speech (priority) ── */}
        {showSpeechPanel && (
          <div
            className="relative flex-shrink-0 border-l border-[var(--border)] bg-[var(--bg)] flex flex-col"
            style={{ width: panelExpanded ? 520 : 300, transition: 'width 250ms ease-in-out' }}
          >
            {/* Expand / collapse handle on the left border */}
            <button
              onClick={() => setPanelExpanded(v => !v)}
              title={panelExpanded ? 'Collapse panel' : 'Expand panel'}
              className="absolute top-1/2 -translate-y-1/2 opacity-40 hover:opacity-100 transition-all duration-150 group"
              style={{ left: -10, zIndex: 20 }}
            >
              <div className="flex items-center justify-center w-[18px] h-9 rounded-full bg-[var(--bg-card)] border border-[var(--border)] shadow-sm group-hover:border-[var(--accent)]/60 group-hover:shadow-md transition-all duration-150">
                <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="text-[var(--fg-muted)] group-hover:text-[var(--accent)] transition-colors">
                  {panelExpanded ? <path d="m9 18 6-6-6-6" /> : <path d="m15 18-6-6 6-6" />}
                </svg>
              </div>
            </button>

            {/* Header */}
            <div className="px-4 py-3 border-b border-[var(--border)]">
              <p className="text-xs font-semibold uppercase tracking-wide text-[var(--fg-muted)]">
                {pendingInsert
                  ? 'Review'
                  : speechState === 'processing'
                    ? 'Transcribing'
                    : 'Listening'}
              </p>
            </div>

            {/* Body */}
            <div className="flex-1 overflow-y-auto px-4 py-4">
              {pendingInsert ? (
                <div>
                  <p className="text-xs text-[var(--fg-muted)] mb-2">
                    {pendingInsert.tab === 'write'
                      ? 'Added to chapter (highlighted):'
                      : 'Ready to insert:'}
                  </p>
                  <div className="text-sm text-[var(--fg)] leading-relaxed bg-yellow-50 border border-yellow-200 rounded-lg px-3 py-2">
                    {pendingInsert.text}
                  </div>
                </div>
              ) : speechState === 'processing' ? (
                <div className="flex items-center gap-2 text-sm text-[var(--fg-muted)]">
                  <svg className="animate-spin w-4 h-4 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M21 12a9 9 0 1 1-6.219-8.56" />
                  </svg>
                  Converting speech to text…
                </div>
              ) : interimText ? (
                <p className="text-sm text-[var(--fg)] leading-relaxed italic">{interimText}</p>
              ) : (
                <p className="text-sm text-[var(--fg-faint)] italic">Start speaking…</p>
              )}
            </div>

            {/* Footer */}
            <div className="px-4 py-4 border-t border-[var(--border)] flex flex-col gap-2">
              {pendingInsert ? (
                <>
                  <button onClick={handleKeep} className="w-full py-2 rounded-[10px] bg-[var(--accent)] text-white text-sm font-medium hover:bg-[var(--accent-hover)] transition-colors">
                    Keep
                  </button>
                  <button onClick={handleRemove} className="w-full py-2 rounded-[10px] border border-[var(--border)] text-[var(--fg-muted)] text-sm font-medium hover:bg-[var(--bg-subtle)] transition-colors">
                    Remove
                  </button>
                </>
              ) : (
                <button
                  onClick={stopRecording}
                  disabled={speechState !== 'recording'}
                  className={`w-full py-2 rounded-lg text-sm font-medium transition-colors ${
                    speechState === 'recording'
                      ? 'bg-[#1c1917] text-white hover:bg-[#292524]'
                      : 'bg-[var(--bg-subtle)] text-[var(--fg-faint)] cursor-not-allowed'
                  }`}
                >
                  {speechState === 'processing' ? 'Converting…' : 'Convert & Send'}
                </button>
              )}
            </div>
          </div>
        )}

        {/* AI Panel (shown when no speech panel active) */}
        {showAiPanel && !showSpeechPanel && (
          <div
            className="relative flex-shrink-0"
            style={{ width: panelExpanded ? 520 : 360, transition: 'width 250ms ease-in-out' }}
          >
            {/* Expand / collapse handle on the left border */}
            <button
              onClick={() => setPanelExpanded(v => !v)}
              title={panelExpanded ? 'Collapse panel' : 'Expand panel'}
              className="absolute top-1/2 -translate-y-1/2 opacity-40 hover:opacity-100 transition-all duration-150 group"
              style={{ left: -10, zIndex: 20 }}
            >
              <div className="flex items-center justify-center w-[18px] h-9 rounded-full bg-[var(--bg-card)] border border-[var(--border)] shadow-sm group-hover:border-[var(--accent)]/60 group-hover:shadow-md transition-all duration-150">
                <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="text-[var(--fg-muted)] group-hover:text-[var(--accent)] transition-colors">
                  {panelExpanded ? <path d="m9 18 6-6-6-6" /> : <path d="m15 18-6-6 6-6" />}
                </svg>
              </div>
            </button>
            <AiSidePanel
              editor={editorRef}
              pendingWandAction={pendingWandAction}
              onWandActionConsumed={() => setPendingWandAction(null)}
            />
          </div>
        )}

        {/* Notes Panel (shown when no speech or AI panel active) */}
        {showNotesPanel && !showSpeechPanel && !showAiPanel && (
          <div
            className="relative flex-shrink-0"
            style={{ width: panelExpanded ? 520 : 360, transition: 'width 250ms ease-in-out' }}
          >
            {/* Expand / collapse handle on the left border */}
            <button
              onClick={() => setPanelExpanded(v => !v)}
              title={panelExpanded ? 'Collapse panel' : 'Expand panel'}
              className="absolute top-1/2 -translate-y-1/2 opacity-40 hover:opacity-100 transition-all duration-150 group"
              style={{ left: -10, zIndex: 20 }}
            >
              <div className="flex items-center justify-center w-[18px] h-9 rounded-full bg-[var(--bg-card)] border border-[var(--border)] shadow-sm group-hover:border-[var(--accent)]/60 group-hover:shadow-md transition-all duration-150">
                <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="text-[var(--fg-muted)] group-hover:text-[var(--accent)] transition-colors">
                  {panelExpanded ? <path d="m9 18 6-6-6-6" /> : <path d="m15 18-6-6 6-6" />}
                </svg>
              </div>
            </button>
            <ChapterNotesPanel
              chapter={chapter}
              editorRef={editorRef}
              onSave={(patch) => saveChapter({ ...chapter, ...patch, updatedAt: new Date().toISOString() })}
              localAiReady={modelStatus === 'ready' && memoryHealth !== 'red'}
              isGenerating={isGenerating}
              onGenerateChapter={handleGenerateChapter}
            />
          </div>
        )}
      </div>

      {/* Chapter Draft Modal */}
      {showDraftModal && (
        <ChapterDraftModal
          chapterTitle={chapter.title}
          chapterWordCount={chapter.wordCount ?? 0}
          onInsert={handleInsertDraft}
          onDiscard={() => {
            setShowDraftModal(false)
            clearStream()
            setIsGenerating(false)
            setGeneratingMode(null)
            window.electron.llama.cancel()
          }}
        />
      )}
    </div>
  )
}

// ── Sub-tab button ────────────────────────────────────────────────────────────
function SubTabBtn({
  children,
  active,
  onClick
}: {
  children: React.ReactNode
  active: boolean
  onClick: () => void
}): React.JSX.Element {
  return (
    <button
      onClick={onClick}
      className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors -mb-px ${
        active
          ? 'border-[var(--accent)] text-[var(--accent)]'
          : 'border-transparent text-[var(--fg-muted)] hover:text-[var(--fg)]'
      }`}
    >
      {children}
    </button>
  )
}
