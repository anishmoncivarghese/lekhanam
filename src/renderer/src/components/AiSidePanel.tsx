import React, { useEffect, useRef, useState } from 'react'
import {
  useAiStore, AiMode, AiStyle, buildSystemPrompt, MAGIC_WAND_PROMPTS
} from '../store/aiStore'
import { useUIStore } from '../store/uiStore'
import GhostwriterPanel from './GhostwriterPanel'
import CharacterInterviewPanel from './CharacterInterviewPanel'
import { Editor } from '@tiptap/react'
import { AiAssistantTab } from './ai/AiAssistantTab'
import { ModelsTab } from './ai/ModelsTab'

// Lekha AI prompts (shorter than Qwen — model already understands book structure)
function buildLekhaSystemPrompt(style: AiStyle): string {
  const LEKHA_BASE = `You are Lekha, a creative writing assistant built for novelists. You understand story structure, character arcs, and the craft of prose.

Rules:
1. Show, don't tell — express emotion through action, body language, and subtext.
2. Active voice with strong verbs. No filtering ("he felt", "she noticed").
3. Vary sentence rhythm — short for impact, long for flow.`

  const LEKHA_STYLE: Record<AiStyle, string> = {
    cinematic: 'Write with visual precision. Action beats, sharp dialogue, clear blocking. Each paragraph plays like a film shot.',
    introspective: "Explore the character's psychology. The gap between what they say and feel. Let past wounds distort the present.",
    minimalist: 'Short, declarative sentences. No adverbs. Trust the reader. Show only the surface — let depth be felt.',
    poetic: 'Rich metaphor, layered sensory imagery, rhythmic cadence. Every word earns its place.'
  }

  return `${LEKHA_BASE}\n\nStyle: ${LEKHA_STYLE[style]}`
}

const LEKHA_WAND_PROMPTS = {
  expand: (text: string): string => `Expand this with more sensory detail and emotional depth, same voice:\n\n"${text}"\n\nExpanded:`,
  shorten: (text: string): string => `Tighten to essential meaning, cut every unnecessary word:\n\n"${text}"\n\nTightened:`,
  sensory: (text: string): string => `Rewrite with vivid sensory detail — sight, sound, smell, texture, temperature:\n\n"${text}"\n\nSensory version:`
}

interface Props {
  editor: React.RefObject<Editor | null>
  pendingWandAction: { action: 'expand' | 'shorten' | 'sensory'; selectedText: string } | null
  onWandActionConsumed: () => void
}

const MODE_TABS: { id: AiMode; label: string }[] = [
  { id: 'assist', label: 'Assist' },
  { id: 'ghostwriter', label: 'Ghostwriter' },
  { id: 'interview', label: 'Interview' }
]

const STYLE_OPTIONS: { value: AiStyle; label: string }[] = [
  { value: 'cinematic', label: 'Cinematic' },
  { value: 'introspective', label: 'Introspective' },
  { value: 'minimalist', label: 'Minimalist' },
  { value: 'poetic', label: 'Poetic' }
]

const PIPELINE_LABELS: Record<string, string> = {
  architect: 'Architect reviewing story…',
  ghostwriter: 'Ghostwriter writing prose…',
  editor: 'Editor reviewing passage…'
}

export default function AiSidePanel({ editor, pendingWandAction, onWandActionConsumed }: Props): React.JSX.Element {
  const {
    memoryHealth, activeMode, aiStyle, streamingText,
    assistText, ghostwriterText, generatingMode,
    isGenerating, errorMessage, pipelineStage,
    setModelStatus, setDownloadProgress, setInitStage, setHardware, setMemoryHealth,
    setActiveMode, setAiStyle, appendToken, setIsGenerating,
    appendAssistToken, clearAssistText, appendGhostwriterToken, setGeneratingMode,
    setPipelineStage, setCatalogStatuses, setError, clearError,
    assistiveWriting, setAssistiveWriting,
    panelTab, setPanelTab,
    loadedModelId,
  } = useAiStore()
  const { setBusyTask } = useUIStore()

  const [, setDownloadedBytes] = useState(0)
  const [, setDownloadingId] = useState<string | null>(null)

  // ── Boot: hardware detection + model status + provider restore ────────────
  const booted = useRef(false)
  useEffect(() => {
    if (booted.current) return
    booted.current = true
    ;(async () => {
      const hw = await window.electron.llama.hardware()
      setHardware(hw.totalGb, hw.freeGb, hw.recommended, hw.contextSize, hw.freeDiskGb ?? 999)
      const statuses = await window.electron.llama.modelStatuses()
      setCatalogStatuses(statuses)

      if (useAiStore.getState().modelStatus === 'unchecked') {
        const downloaded = await window.electron.llama.isDownloaded()
        setModelStatus(downloaded ? 'loading' : 'missing')
      }
    })()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ── IPC event subscriptions ──────────────────────────────────────────────
  useEffect(() => {
    const unsubProgress = window.electron.llama.onProgress((p) => {
      setDownloadProgress(p.percent)
      setDownloadedBytes(p.downloaded)
    })
    const unsubToken = window.electron.llama.onToken((t) => {
      if (t.done) {
        setIsGenerating(false)
        setGeneratingMode(null)
        return
      }
      if (useAiStore.getState().generatingMode === 'chapter-draft') return
      const mode = useAiStore.getState().generatingMode
      if (mode === 'assist') appendAssistToken(t.token)
      else if (mode === 'ghostwriter') appendGhostwriterToken(t.token)
      else appendToken(t.token)
    })
    const unsubReady = window.electron.llama.onReady(() => {
      setModelStatus('ready')
      setInitStage('')
      setBusyTask(null)
    })
    const unsubError = window.electron.llama.onError((e) => {
      setError(e.message)
      setIsGenerating(false)
      if (useAiStore.getState().modelStatus === 'downloading') {
        setModelStatus('error')
        setDownloadingId(null)
      }
      setBusyTask(null)
    })
    const unsubInitProgress = window.electron.llama.onInitProgress((p) => {
      setInitStage(p.stage)
    })
    const unsubDownloadComplete = window.electron.llama.onDownloadComplete(() => {
      setDownloadingId(null)
      // Refresh catalog to show updated downloaded state
      window.electron.llama.modelStatuses().then(setCatalogStatuses)
      if (useAiStore.getState().modelStatus === 'downloading') {
        setModelStatus('loading')
        setInitStage('')
      }
    })
    const unsubPipeline = window.electron.llama.onPipelineStage((p) => {
      if (useAiStore.getState().generatingMode === 'chapter-draft') return
      if (p.done) {
        // Don't reset to idle until all done (token done=true handles final cleanup)
      } else {
        setPipelineStage(p.stage as 'architect' | 'ghostwriter' | 'editor')
      }
    })

    // Poll memory health every 30s; also refresh on window focus so the user
    // gets instant feedback after closing apps in another window (the common
    // "free up RAM" flow). Focus listener is debounced by 1s to coalesce
    // rapid focus/blur thrash.
    const pollMemory = async (): Promise<void> => {
      const status = await window.electron.llama.memoryCheck()
      setMemoryHealth(status)
      // Also update free RAM
      const hw = await window.electron.llama.hardware()
      setHardware(hw.totalGb, hw.freeGb, hw.recommended, hw.contextSize, hw.freeDiskGb ?? 999)
    }
    pollMemory()
    const memInterval = setInterval(pollMemory, 30000)

    let focusDebounce: ReturnType<typeof setTimeout> | null = null
    const onFocus = (): void => {
      if (focusDebounce) clearTimeout(focusDebounce)
      focusDebounce = setTimeout(() => { pollMemory() }, 1000)
    }
    window.addEventListener('focus', onFocus)

    return () => {
      unsubProgress()
      unsubToken()
      unsubReady()
      unsubError()
      unsubInitProgress()
      unsubDownloadComplete()
      unsubPipeline()
      clearInterval(memInterval)
      window.removeEventListener('focus', onFocus)
      if (focusDebounce) clearTimeout(focusDebounce)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [setBusyTask])

  // Reset pipeline stage when generation ends
  useEffect(() => {
    if (!isGenerating) {
      setPipelineStage('idle')
    }
  }, [isGenerating, setPipelineStage])

  // ── Handle pending Magic Wand action ────────────────────────────────────
  useEffect(() => {
    const aiReady = useAiStore.getState().loadedModelId !== null && memoryHealth !== 'red'
    if (!pendingWandAction || !aiReady) return
    clearAssistText()
    clearError()
    setGeneratingMode('assist')
    setIsGenerating(true)
    setActiveMode('assist')
    const isLekha = useAiStore.getState().loadedModelId === 'lekha-2b'
    const sys = isLekha ? buildLekhaSystemPrompt(aiStyle) : buildSystemPrompt(aiStyle)
    const wandPrompts = isLekha ? LEKHA_WAND_PROMPTS : MAGIC_WAND_PROMPTS
    const user = wandPrompts[pendingWandAction.action](pendingWandAction.selectedText)
    window.electron.llama.generate(sys, user)
    onWandActionConsumed()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingWandAction])

  // ── Generation timeout watchdog ──────────────────────────────────────────
  // If isGenerating is true for 30s with no token arriving, auto-cancel and show error.
  const watchdogRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Reset the watchdog timer each time new text arrives while generating
  useEffect(() => {
    if (!isGenerating) return
    if (watchdogRef.current) clearTimeout(watchdogRef.current)
    watchdogRef.current = setTimeout(() => {
      window.electron.llama.cancel()
      setIsGenerating(false)
      setGeneratingMode(null)
      setError('Generation timed out — the AI took too long to respond. Close other apps to free memory, then try again.')
    }, 30000)
    return () => {
      if (watchdogRef.current) clearTimeout(watchdogRef.current)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isGenerating, assistText, streamingText, ghostwriterText])

  // ── Replace selected text in editor with AI output ───────────────────────
  const handleReplaceSelection = (): void => {
    const ed = editor.current
    if (!ed || !assistText) return
    const { from, to } = ed.state.selection
    if (from === to) {
      ed.chain().focus().insertContent(assistText).run()
    } else {
      ed.chain().focus().deleteRange({ from, to }).insertContentAt(from, assistText).run()
    }
    clearAssistText()
  }

  const handleInsertAtCursor = (): void => {
    const ed = editor.current
    if (!ed || !assistText) return
    ed.chain().focus().insertContent(assistText).run()
    clearAssistText()
  }

  // ── Tools content (passed into AiAssistantTab > ToolsRegion) ────────────
  const toolsContent = (
    <>
      {/* Assistive Writing toggle */}
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-[var(--border)] flex-shrink-0">
        <div>
          <p className="text-xs font-semibold text-[var(--fg)]">Assistive Writing</p>
          <p className="text-[11px] text-[var(--fg-muted)]">Show floating menu on text selection</p>
        </div>
        <button
          onClick={() => setAssistiveWriting(!assistiveWriting)}
          className={`relative w-10 h-5 rounded-full transition-colors flex-shrink-0 ${assistiveWriting ? 'bg-[var(--accent)]' : 'bg-[#d4cdc7]'}`}
        >
          <span className={`absolute top-0.5 left-0.5 w-4 h-4 bg-[var(--bg-card)] rounded-full shadow transition-transform ${assistiveWriting ? 'translate-x-5' : 'translate-x-0'}`} />
        </button>
      </div>

      {/* Mode tabs */}
      <div className="flex items-center gap-0 border-b border-[var(--border)] flex-shrink-0">
        {MODE_TABS.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveMode(tab.id)}
            className={`flex-1 py-2 text-xs font-medium transition-colors ${
              activeMode === tab.id
                ? 'text-[var(--accent)] border-b-2 border-[var(--accent)]'
                : 'text-[var(--fg-muted)] hover:text-[var(--fg)]'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Style preset (Assist + Ghostwriter only) */}
      {activeMode !== 'interview' && (
        <div className="flex items-center gap-2 px-3 py-2 border-b border-[var(--border)] flex-shrink-0">
          <span className="text-[10px] text-[var(--fg-faint)] uppercase tracking-wide whitespace-nowrap">Style</span>
          <select
            value={aiStyle}
            onChange={(e) => setAiStyle(e.target.value as AiStyle)}
            className="flex-1 h-7 text-xs border border-[var(--border)] rounded-md px-1.5 bg-[var(--bg-card)] text-[var(--fg)] focus:outline-none focus:border-[var(--accent)]"
          >
            {STYLE_OPTIONS.map((s) => (
              <option key={s.value} value={s.value}>{s.label}</option>
            ))}
          </select>
        </div>
      )}

      {/* Pipeline stage badge */}
      {pipelineStage !== 'idle' && isGenerating && (
        <div className="mx-3 mt-2 flex items-center gap-2 flex-shrink-0">
          <svg className="animate-spin w-3.5 h-3.5 text-[var(--accent)] shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M21 12a9 9 0 1 1-6.219-8.56" />
          </svg>
          <span className="text-[10px] text-[var(--accent)] font-medium">
            {PIPELINE_LABELS[pipelineStage] ?? 'Processing…'}
          </span>
        </div>
      )}

      {/* Mode panels — show helper if no model is loaded, panels otherwise */}
      <div className="flex-1 min-h-0 overflow-hidden">
        {!loadedModelId ? (
          <div className="flex items-center justify-center h-full px-6">
            <p className="text-[11px] text-[var(--fg-muted)] text-center">
              Load a model to continue
            </p>
          </div>
        ) : (
          <>
            {activeMode === 'assist' && (
              <AssistPanel
                streamingText={assistText}
                isGenerating={isGenerating && generatingMode === 'assist'}
                errorMessage={errorMessage}
                onReplace={handleReplaceSelection}
                onInsert={handleInsertAtCursor}
                onDiscard={clearAssistText}
                onCancel={() => window.electron.llama.cancel()}
                onClearError={clearError}
              />
            )}
            {activeMode === 'ghostwriter' && <GhostwriterPanel />}
            {activeMode === 'interview' && <CharacterInterviewPanel />}
          </>
        )}
      </div>
    </>
  )

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col h-full border-l border-[var(--border)] bg-[var(--bg)] overflow-hidden panel-slide-in">
      {/* Tab switcher (replaces 'AI Writing' header to reclaim vertical space) */}
      <div className="flex-shrink-0 px-3 py-2 border-b" style={{ borderColor: 'var(--divider)' }}>
        <div className="flex gap-1 p-0.5 rounded-[8px]" style={{ background: 'var(--bg-subtle)' }}>
          <button
            onClick={() => setPanelTab('assistant')}
            className="flex-1 py-1 rounded-[6px] text-[11px] font-medium transition-colors inline-flex items-center justify-center gap-1.5"
            style={{
              background: panelTab === 'assistant' ? 'var(--bg-card)' : 'transparent',
              color: panelTab === 'assistant' ? 'var(--fg)' : 'var(--fg-muted)',
              boxShadow: panelTab === 'assistant' ? '0 1px 2px rgba(0,0,0,0.06)' : 'none',
            }}>
            {/* Sparkle / AI glyph */}
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor"
              strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M5.6 18.4l2.1-2.1M16.3 7.7l2.1-2.1" />
              <circle cx="12" cy="12" r="3" />
            </svg>
            AI Assistant
          </button>
          <button
            onClick={() => setPanelTab('models')}
            className="flex-1 py-1 rounded-[6px] text-[11px] font-medium transition-colors inline-flex items-center justify-center gap-1.5"
            style={{
              background: panelTab === 'models' ? 'var(--bg-card)' : 'transparent',
              color: panelTab === 'models' ? 'var(--fg)' : 'var(--fg-muted)',
              boxShadow: panelTab === 'models' ? '0 1px 2px rgba(0,0,0,0.06)' : 'none',
            }}>
            {/* Chip / model glyph */}
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor"
              strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <rect x="7" y="7" width="10" height="10" rx="1.5" />
              <path d="M4 10h3M4 14h3M17 10h3M17 14h3M10 4v3M14 4v3M10 17v3M14 17v3" />
            </svg>
            Models
          </button>
        </div>
      </div>

      {panelTab === 'assistant' ? (
        <AiAssistantTab>{toolsContent}</AiAssistantTab>
      ) : (
        <ModelsTab />
      )}
    </div>
  )
}

// ── Assist Mode ───────────────────────────────────────────────────────────────
function AssistPanel({
  streamingText,
  isGenerating,
  errorMessage,
  onReplace,
  onInsert,
  onDiscard,
  onCancel,
  onClearError
}: {
  streamingText: string
  isGenerating: boolean
  errorMessage?: string | null
  onReplace: () => void
  onInsert: () => void
  onDiscard: () => void
  onCancel: () => void
  onClearError: () => void
}): React.JSX.Element {
  const outputRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (outputRef.current) outputRef.current.scrollTop = outputRef.current.scrollHeight
  }, [streamingText])

  if (!streamingText && !isGenerating) {
    if (errorMessage) {
      return (
        <div className="flex flex-col gap-3 mx-3 mt-3">
          <div className="w-full rounded-xl border border-red-200 bg-red-50 p-3">
            <div className="flex items-start gap-2">
              <svg width="14" height="14" className="shrink-0 mt-0.5" viewBox="0 0 24 24" fill="none"
                stroke="#ef4444" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10"/>
                <line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
              </svg>
              <div>
                <p className="text-xs font-semibold text-red-800 mb-0.5">Generation Failed</p>
                <p className="text-[11px] text-red-700 leading-relaxed">{errorMessage}</p>
              </div>
            </div>
          </div>
          <button
            onClick={onClearError}
            className="text-[11px] text-[var(--fg-faint)] hover:text-[var(--fg-muted)] transition-colors text-left"
          >
            Dismiss
          </button>
        </div>
      )
    }
    return (
      <div className="flex flex-col items-center justify-center h-full px-6 py-8 text-center gap-3">
        <div className="w-12 h-12 rounded-2xl bg-[var(--bg-subtle)] flex items-center justify-center">
          <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z" />
          </svg>
        </div>
        <p className="text-xs text-[var(--fg-muted)] leading-relaxed">
          Select text in the editor and choose <strong>Expand</strong>, <strong>Shorten</strong>, or <strong>Sensory Boost</strong> from the floating menu.
        </p>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full p-3 gap-3 overflow-hidden">
      <div
        ref={outputRef}
        className="flex-1 min-h-0 overflow-y-auto rounded-[10px] border border-[var(--border)] bg-[var(--bg-card)] px-3 py-2.5 text-sm text-[var(--fg)] leading-relaxed whitespace-pre-wrap"
      >
        {streamingText}
        {isGenerating && (
          <span className="inline-block w-0.5 h-4 bg-[var(--accent)] animate-pulse ml-0.5 align-text-bottom" />
        )}
      </div>

      {!isGenerating && streamingText && (
        <div className="flex flex-col gap-1.5 flex-shrink-0">
          <button
            onClick={onReplace}
            className="w-full py-2 rounded-[10px] bg-[var(--accent)] text-white text-xs font-medium hover:bg-[var(--accent-hover)] transition-colors"
          >
            Replace Selection
          </button>
          <button
            onClick={onInsert}
            className="w-full py-2 rounded-[10px] border border-[var(--border)] text-xs font-medium text-[var(--fg-muted)] hover:bg-[var(--bg-subtle)] transition-colors"
          >
            Insert at Cursor
          </button>
          <button
            onClick={onDiscard}
            className="w-full py-2 rounded-lg text-xs text-[var(--fg-faint)] hover:text-[var(--fg-muted)] transition-colors"
          >
            Discard
          </button>
        </div>
      )}

      {isGenerating && (
        <button
          onClick={onCancel}
          className="w-full py-2 rounded-lg bg-[#1c1917] text-white text-xs font-medium hover:bg-[#292524] transition-colors flex-shrink-0"
        >
          Stop Generation
        </button>
      )}
    </div>
  )
}

