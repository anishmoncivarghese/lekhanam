import React from 'react'
import { SpeechState } from '../types'

interface Props {
  state: SpeechState
  onStart: () => void
  onStop: () => void
}

export default function MicButton({ state, onStart, onStop }: Props): React.JSX.Element {
  const isRecording = state === 'recording'
  const isProcessing = state === 'processing'

  return (
    <button
      onClick={isRecording ? onStop : isProcessing ? undefined : onStart}
      disabled={isProcessing}
      title={
        isRecording
          ? 'Stop dictation'
          : isProcessing
            ? 'Transcribing…'
            : 'Start dictation (Vosk + Whisper)'
      }
      className={`w-8 h-8 flex items-center justify-center rounded-md transition-colors ${
        isRecording
          ? 'bg-red-500 text-white hover:bg-red-600 animate-pulse'
          : isProcessing
            ? 'bg-[var(--bg-subtle)] text-[var(--fg-faint)] cursor-not-allowed'
            : 'text-[var(--fg-muted)] hover:bg-[var(--bg-subtle)] hover:text-[var(--accent)]'
      }`}
    >
      {isProcessing ? (
        // Spinner while whisper is transcribing
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="animate-spin"
        >
          <path d="M21 12a9 9 0 1 1-6.219-8.56" />
        </svg>
      ) : (
        // Mic icon
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z" />
          <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
          <line x1="12" x2="12" y1="19" y2="22" />
        </svg>
      )}
    </button>
  )
}
