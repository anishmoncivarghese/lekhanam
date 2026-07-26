import React, { useState, useRef, useEffect } from 'react'
import { useBookStore } from '../store/bookStore'
import { useAiStore } from '../store/aiStore'
import { Character } from '../types'

interface Message {
  role: 'user' | 'character'
  content: string
}

function buildCharacterSystemPrompt(char: Character): string {
  const lines = [
    `You are a creative writing assistant helping an author develop a fictional character named ${char.name} for their novel.`,
    `When the author asks questions, write ${char.name}'s responses based on the character profile below — staying true to their personality, background, and way of speaking.`,
    '',
    `Character profile for ${char.name}:`
  ]
  if (char.age) lines.push(`Age: ${char.age}`)
  if (char.gender) lines.push(`Gender: ${char.gender}`)
  if (char.hairColor || char.eyeColor || char.skinColor || char.build) {
    const phys = [char.hairColor, char.eyeColor, char.skinColor, char.build].filter(Boolean).join(', ')
    lines.push(`Physical appearance: ${phys}`)
  }
  if (char.ghost) lines.push(`\nCore wound (their Ghost): ${char.ghost}`)
  if (char.lie) lines.push(`The lie they believe about themselves: ${char.lie}`)
  if (char.truth) lines.push(`The truth they are slowly moving toward: ${char.truth}`)
  if (char.motivation) lines.push(`What drives them: ${char.motivation}`)
  if (char.stakes) lines.push(`What they stand to lose: ${char.stakes}`)
  if (char.voiceProfile) lines.push(`\nVoice and manner of speaking: ${char.voiceProfile}`)
  if (char.mannerisms) lines.push(`Mannerisms and habits: ${char.mannerisms}`)
  if (char.behaviour) lines.push(`Behavioural traits: ${char.behaviour}`)
  if (char.role) lines.push(`\nRole in the story: ${char.role}`)
  lines.push(
    `\nWrite responses that authentically reflect ${char.name}'s character, drawing on their background and personality as described above. This is a fiction writing exercise.`
  )
  return lines.join('\n')
}

export default function CharacterInterviewPanel(): React.JSX.Element {
  const { characters } = useBookStore()
  const { isGenerating, streamingText, modelStatus, memoryHealth, loadedModelId,
          generatingMode, clearStream, setIsGenerating, setGeneratingMode } =
    useAiStore()
  const aiReady = loadedModelId === 'lekha-2b' || (modelStatus === 'ready' && memoryHealth !== 'red')

  const [selectedCharId, setSelectedCharId] = useState<string>('')
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [sessionStarted, setSessionStarted] = useState(false)
  const [startError, setStartError] = useState<string | null>(null)
  const [streamBuffer, setStreamBuffer] = useState('')
  const chatEndRef = useRef<HTMLDivElement>(null)

  const selectedChar = characters.find((c) => c.id === selectedCharId) ?? null

  // Auto-scroll chat
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, streamBuffer])

  // Sync streaming token into streamBuffer — only when interview is generating
  useEffect(() => {
    if (generatingMode === 'interview') {
      setStreamBuffer(streamingText)
    }
  }, [streamingText, generatingMode])

  // When generation finishes, commit the streamed text as a message
  const prevGenerating = useRef(isGenerating)
  const prevMode = useRef(generatingMode)
  useEffect(() => {
    if (prevGenerating.current && !isGenerating && prevMode.current === 'interview' && streamBuffer) {
      setMessages((prev) => [...prev, { role: 'character', content: streamBuffer }])
      setStreamBuffer('')
      clearStream()
    }
    prevGenerating.current = isGenerating
    prevMode.current = generatingMode
  }, [isGenerating, generatingMode, streamBuffer, clearStream])

  const handleStartSession = async (): Promise<void> => {
    if (!selectedChar) return
    setStartError(null)
    const sys = buildCharacterSystemPrompt(selectedChar)
    const result = await window.electron.llama.startInterview(sys)
    if (result.ok) {
      setMessages([])
      setSessionStarted(true)
    } else {
      setStartError(result.message ?? 'Failed to start interview session')
    }
  }

  const handleSend = async (): Promise<void> => {
    if (!input.trim() || isGenerating || !sessionStarted || (loadedModelId !== 'lekha-2b' && memoryHealth === 'red')) return
    const userMsg = input.trim()
    setInput('')
    setMessages((prev) => [...prev, { role: 'user', content: userMsg }])
    clearStream()
    setGeneratingMode('interview')
    setIsGenerating(true)
    await window.electron.llama.sendInterviewMessage(userMsg)
  }

  const handleKeyDown = (e: React.KeyboardEvent): void => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  const handleReset = async (): Promise<void> => {
    await window.electron.llama.resetInterview()
    setMessages([])
    setSessionStarted(false)
    setStreamBuffer('')
    clearStream()
  }

  const handleClearChat = (): void => {
    setMessages([])
    setStreamBuffer('')
  }

  const canSend = sessionStarted && input.trim().length > 0 && !isGenerating && (loadedModelId === 'lekha-2b' || memoryHealth !== 'red')

  if (!aiReady) {
    return (
      <div className="flex items-center justify-center h-full p-6 text-center">
        <p className="text-sm text-[var(--fg-faint)] italic">Load the AI model to start a Character Interview.</p>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Character selector */}
      <div className="flex flex-col gap-1.5 p-3 border-b border-[var(--border)] flex-shrink-0">
        {/* Row 1: select + Start button */}
        <div className="flex items-center gap-2">
          <select
            value={selectedCharId}
            onChange={(e) => {
              setSelectedCharId(e.target.value)
              setSessionStarted(false)
              setMessages([])
              setStartError(null)
            }}
            className="flex-1 min-w-0 h-8 text-xs border border-[var(--border)] rounded-lg px-2 bg-[var(--bg-card)] text-[var(--fg)] focus:outline-none focus:border-[var(--accent)]"
          >
            <option value="">Select a character…</option>
            {characters.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}{c.role ? ` — ${c.role}` : ''}
              </option>
            ))}
          </select>
          {!sessionStarted && (
            <button
              onClick={handleStartSession}
              disabled={!selectedCharId}
              className="px-3 py-1.5 rounded-[10px] bg-[var(--accent)] text-white text-xs font-medium hover:bg-[var(--accent-hover)] transition-colors disabled:opacity-40 disabled:cursor-not-allowed whitespace-nowrap"
            >
              Start
            </button>
          )}
        </div>
        {/* Row 2: session controls — only when active */}
        {sessionStarted && (
          <div className="flex items-center gap-2 justify-end">
            <button
              onClick={handleClearChat}
              disabled={isGenerating}
              className="px-3 py-1.5 rounded-[10px] border border-[var(--border)] text-xs text-[var(--fg-muted)] hover:bg-[var(--bg-subtle)] transition-colors whitespace-nowrap disabled:opacity-40"
            >
              Clear Chat
            </button>
            <button
              onClick={handleReset}
              className="px-3 py-1.5 rounded-[10px] border border-[var(--border)] text-xs text-[var(--fg-muted)] hover:bg-[var(--bg-subtle)] transition-colors whitespace-nowrap"
            >
              Reset
            </button>
          </div>
        )}
      </div>

      {/* Start error */}
      {startError && (
        <div className="mx-3 mt-2 p-2 rounded-lg bg-red-50 border border-red-200 flex-shrink-0">
          <p className="text-[10px] text-red-700">{startError}</p>
        </div>
      )}

      {/* Chat messages */}
      <div className="flex-1 overflow-y-auto p-3 flex flex-col gap-2 min-h-0">
        {!sessionStarted && (
          <div className="text-center text-sm text-[var(--fg-faint)] italic mt-4 px-4">
            {selectedChar
              ? `Select "${selectedChar.name}" and click Start to begin the interview.`
              : 'Select a character to begin.'}
          </div>
        )}
        {messages.map((msg, i) => (
          <div
            key={i}
            className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
          >
            <div
              className={`max-w-[85%] rounded-xl px-3 py-2 text-sm leading-relaxed ${
                msg.role === 'user'
                  ? 'bg-[var(--accent)] text-white rounded-br-sm'
                  : 'bg-[var(--bg-card)] border border-[var(--border)] text-[var(--fg)] rounded-bl-sm'
              }`}
            >
              {msg.role === 'character' && selectedChar && (
                <p className="text-[10px] font-semibold text-[var(--fg-faint)] mb-1 uppercase tracking-wide">
                  {selectedChar.name}
                </p>
              )}
              {msg.content}
            </div>
          </div>
        ))}
        {/* Streaming response */}
        {isGenerating && generatingMode === 'interview' && streamBuffer && (
          <div className="flex justify-start">
            <div className="max-w-[85%] rounded-xl rounded-bl-sm px-3 py-2 text-sm leading-relaxed bg-[var(--bg-card)] border border-[var(--border)] text-[var(--fg)]">
              {selectedChar && (
                <p className="text-[10px] font-semibold text-[var(--fg-faint)] mb-1 uppercase tracking-wide">
                  {selectedChar.name}
                </p>
              )}
              {streamBuffer}
              <span className="inline-block w-0.5 h-4 bg-[var(--accent)] animate-pulse ml-0.5 align-text-bottom" />
            </div>
          </div>
        )}
        {isGenerating && generatingMode === 'interview' && !streamBuffer && (
          <div className="flex justify-start">
            <div className="bg-[var(--bg-card)] border border-[var(--border)] rounded-xl rounded-bl-sm px-3 py-2 flex gap-1 items-center">
              <span className="w-1.5 h-1.5 rounded-full bg-[var(--accent)] animate-bounce [animation-delay:0ms]" />
              <span className="w-1.5 h-1.5 rounded-full bg-[var(--accent)] animate-bounce [animation-delay:150ms]" />
              <span className="w-1.5 h-1.5 rounded-full bg-[var(--accent)] animate-bounce [animation-delay:300ms]" />
            </div>
          </div>
        )}
        <div ref={chatEndRef} />
      </div>

      {/* Input */}
      {sessionStarted && (
        <div className="flex gap-2 p-3 border-t border-[var(--border)] flex-shrink-0">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask something…"
            rows={2}
            className="flex-1 px-3 py-2 text-sm rounded-[10px] border border-[var(--border)] bg-[var(--bg-card)] text-[var(--fg)] placeholder-[var(--fg-faint)] resize-none focus:outline-none focus:ring-2 focus:ring-[var(--focus-ring)] focus:border-[var(--accent)]"
          />
          <button
            onClick={handleSend}
            disabled={!canSend}
            className="w-9 h-9 flex items-center justify-center rounded-[10px] bg-[var(--accent)] text-white hover:bg-[var(--accent-hover)] transition-colors disabled:opacity-40 disabled:cursor-not-allowed self-end"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M22 2 11 13" /><path d="M22 2 15 22 11 13 2 9l20-7z" />
            </svg>
          </button>
        </div>
      )}
    </div>
  )
}
