import React, { useState, useRef, useEffect } from 'react'
import { useAiStore, buildSystemPrompt } from '../store/aiStore'

export default function GhostwriterPanel(): React.JSX.Element {
  const {
    aiStyle, ghostwriterText, isGenerating, generatingMode, memoryHealth, modelStatus, loadedModelId,
    clearGhostwriterText, setGeneratingMode, setIsGenerating
  } = useAiStore()
  const aiReady = loadedModelId === 'lekha-2b' || (modelStatus === 'ready' && memoryHealth !== 'red')
  const [beats, setBeats] = useState('')
  const proseRef = useRef<HTMLDivElement>(null)

  const isMyGenerating = isGenerating && generatingMode === 'ghostwriter'

  // Auto-scroll prose as tokens arrive
  useEffect(() => {
    if (proseRef.current) {
      proseRef.current.scrollTop = proseRef.current.scrollHeight
    }
  }, [ghostwriterText])

  const handleGenerate = async (): Promise<void> => {
    if (!beats.trim() || isGenerating || memoryHealth === 'red') return
    clearGhostwriterText()
    setGeneratingMode('ghostwriter')
    setIsGenerating(true)
    const sys = buildSystemPrompt(aiStyle)
    const user = `Turn these story beats into polished, vivid prose. Write continuously without headings or bullet points:\n\n${beats}`
    await window.electron.llama.generate(sys, user)
  }

  const handleCancel = (): void => {
    window.electron.llama.cancel()
  }

  const handleInsert = (): void => {
    navigator.clipboard.writeText(ghostwriterText).catch(() => {})
  }

  const canGenerate = aiReady && beats.trim().length > 0 && !isGenerating

  return (
    <div className="flex flex-col h-full gap-3 p-4 overflow-hidden">
      {/* Top: beats input */}
      <div className="flex flex-col gap-1.5 flex-shrink-0">
        <label className="text-[11px] font-semibold text-[var(--fg-faint)] uppercase tracking-wider">
          Story Beats
        </label>
        <textarea
          value={beats}
          onChange={(e) => setBeats(e.target.value)}
          placeholder={"• Sarah opens the letter\n• Her hands shake\n• She realizes the truth about her father"}
          className="h-36 px-3 py-2.5 rounded-[10px] border border-[var(--border)] bg-[var(--bg-card)] text-sm text-[var(--fg)] placeholder-[var(--fg-faint)] resize-none focus:outline-none focus:ring-2 focus:ring-[var(--focus-ring)] focus:border-[var(--accent)] leading-relaxed"
        />
        <div className="flex gap-2">
          {isMyGenerating ? (
            <button
              onClick={handleCancel}
              className="flex-1 py-2 rounded-lg bg-[#1c1917] text-white text-sm font-medium hover:bg-[#292524] transition-colors"
            >
              Stop
            </button>
          ) : (
            <button
              onClick={handleGenerate}
              disabled={!canGenerate}
              className="flex-1 py-2 rounded-[10px] bg-[var(--accent)] text-white text-sm font-medium hover:bg-[var(--accent-hover)] transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Generate Prose
            </button>
          )}
          {ghostwriterText && !isMyGenerating && (
            <button
              onClick={handleInsert}
              title="Copy prose to clipboard"
              className="px-3 py-2 rounded-[10px] border border-[var(--border)] text-xs text-[var(--fg-muted)] hover:bg-[var(--bg-subtle)] transition-colors"
            >
              Copy
            </button>
          )}
        </div>
      </div>

      {/* Bottom: generated prose */}
      <div className="flex flex-col gap-1.5 flex-1 min-h-0">
        <label className="text-[11px] font-semibold text-[var(--fg-faint)] uppercase tracking-wider flex-shrink-0">
          Generated Prose
          {isMyGenerating && (
            <span className="ml-2 text-[var(--accent)] normal-case font-normal">Writing…</span>
          )}
        </label>
        <div
          ref={proseRef}
          className="flex-1 rounded-[10px] border border-[var(--border)] bg-[var(--bg)] px-3 py-2.5 overflow-y-auto text-sm text-[var(--fg)] leading-relaxed whitespace-pre-wrap"
        >
          {ghostwriterText || (
            <span className="text-[var(--fg-faint)] italic">
              {!aiReady
                ? 'AI model not loaded'
                : 'Your prose will appear here…'}
            </span>
          )}
          {isMyGenerating && (
            <span className="inline-block w-0.5 h-4 bg-[var(--accent)] animate-pulse ml-0.5 align-text-bottom" />
          )}
        </div>
      </div>
    </div>
  )
}
