import React, { useState } from 'react'
import { useSecurityStore } from '../store/securityStore'

export default function LockScreen(): React.JSX.Element {
  const { unlock } = useSecurityStore()
  const [unlocking, setUnlocking] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleUnlock = async (): Promise<void> => {
    setUnlocking(true)
    setError(null)
    try {
      await window.electron.auth.promptTouchId('Unlock Lekhanam')
      unlock()
    } catch {
      setError('Touch ID failed — try again')
      setTimeout(() => setError(null), 2500)
    } finally {
      setUnlocking(false)
    }
  }

  return (
    <div className="fixed inset-0 z-[9999] bg-[var(--bg)] flex flex-col items-center justify-center select-none">
      {/* Lock icon */}
      <div className="mb-6 w-20 h-20 rounded-full bg-[var(--bg-subtle)] flex items-center justify-center">
        <svg
          width="36"
          height="36"
          viewBox="0 0 24 24"
          fill="none"
          stroke="var(--accent)"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
          <path d="M7 11V7a5 5 0 0 1 10 0v4" />
        </svg>
      </div>

      <h1 className="text-2xl font-serif font-bold text-[var(--fg)] mb-1">Lekhanam</h1>
      <p className="text-sm text-[var(--fg-muted)] mb-10">This app is locked</p>

      <button
        onClick={handleUnlock}
        disabled={unlocking}
        className="flex items-center gap-2.5 px-6 py-3 rounded-xl bg-[#1c1917] text-white text-sm font-medium hover:bg-[#292524] transition-colors disabled:opacity-50"
      >
        {/* Fingerprint icon */}
        <svg
          width="18"
          height="18"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M12 10a2 2 0 0 0-2 2c0 1.02-.1 2.51-.26 4" />
          <path d="M14 13.12c0 2.38 0 6.38-1 8.88" />
          <path d="M17.29 21.02c.12-.6.43-2.3.5-3.02" />
          <path d="M2 12a10 10 0 0 1 18-6" />
          <path d="M2 17c1 .5 2.32 1.09 4 1.5" />
          <path d="M21.8 16.5c-.19.77-.4 1.54-.63 2.3" />
          <path d="M5 19.5C5.5 18 6 15 6 12a6 6 0 0 1 .34-2" />
          <path d="M8.65 22c.21-.66.45-1.32.57-2" />
          <path d="M9 6.8a6 6 0 0 1 9 5.2v2" />
        </svg>
        {unlocking ? 'Verifying…' : 'Unlock with Touch ID'}
      </button>

      {error && (
        <p className="mt-4 text-sm text-red-500">{error}</p>
      )}
    </div>
  )
}
