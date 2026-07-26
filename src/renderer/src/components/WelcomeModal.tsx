import React, { useState, useEffect } from 'react'
import { useAiStore, AiStyle } from '../store/aiStore'
import { useBookStore } from '../store/bookStore'
import { useUIStore } from '../store/uiStore'
import appIcon from '../assets/icon.png'

// ── Writer types mapped to aiStyle ───────────────────────────────────────────
const WRITER_TYPES: {
  id: AiStyle
  label: string
  subtitle: string
  icon: React.ReactNode
}[] = [
  {
    id: 'cinematic',
    label: 'Novelist',
    subtitle: 'Story-driven fiction, plot & action',
    icon: (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
        <rect x="2" y="2" width="20" height="20" rx="2.5" />
        <path d="M7 2v20M17 2v20M2 12h5M17 12h5M2 7h5M17 7h5M2 17h5M17 17h5" />
      </svg>
    )
  },
  {
    id: 'introspective',
    label: 'Literary Writer',
    subtitle: 'Character psychology, inner worlds',
    icon: (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
        <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
      </svg>
    )
  },
  {
    id: 'minimalist',
    label: 'Minimalist',
    subtitle: 'Sharp, direct, no-nonsense prose',
    icon: (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
        <line x1="4" y1="6" x2="20" y2="6" />
        <line x1="4" y1="12" x2="14" y2="12" />
        <line x1="4" y1="18" x2="10" y2="18" />
      </svg>
    )
  },
  {
    id: 'poetic',
    label: 'Lyrical Writer',
    subtitle: 'Rich imagery, metaphor, cadence',
    icon: (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10c.926 0 1.648-.746 1.648-1.688 0-.437-.18-.835-.437-1.125-.29-.289-.438-.652-.438-1.125a1.64 1.64 0 0 1 1.668-1.668h1.996c3.051 0 5.555-2.503 5.555-5.554C21.965 6.012 17.461 2 12 2z" />
        <circle cx="8.5" cy="11.5" r="1.5" fill="currentColor" stroke="none" />
        <circle cx="12.5" cy="8.5" r="1.5" fill="currentColor" stroke="none" />
        <circle cx="16.5" cy="11.5" r="1.5" fill="currentColor" stroke="none" />
      </svg>
    )
  }
]

// ── Feature highlights shown on step 1 ───────────────────────────────────────
const FEATURES = [
  {
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 2a10 10 0 1 0 10 10A10 10 0 0 0 12 2z" />
        <path d="M12 8v4l3 3" />
      </svg>
    ),
    title: 'AI Writing Assistant',
    desc: 'Lekha AI & Qwen models — fully on-device, no internet needed'
  },
  {
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
        <path d="M19 10v2a7 7 0 0 1-14 0v-2M12 19v4M8 23h8" />
      </svg>
    ),
    title: 'Speech to Text',
    desc: 'Dictate chapters hands-free with Vosk + Whisper real-time transcription'
  },
  {
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="3" width="7" height="7" rx="1" />
        <rect x="14" y="3" width="7" height="7" rx="1" />
        <rect x="3" y="14" width="7" height="7" rx="1" />
        <rect x="14" y="14" width="7" height="7" rx="1" />
      </svg>
    ),
    title: 'Story Board',
    desc: 'Plan chapters, track beats, build characters — all in one workspace'
  },
  {
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="11" width="18" height="11" rx="2" />
        <path d="M7 11V7a5 5 0 0 1 10 0v4" />
      </svg>
    ),
    title: 'Private & Local',
    desc: 'Everything stays on your Mac — no cloud, no sync, no tracking ever'
  }
]

// ── Component ─────────────────────────────────────────────────────────────────
export function WelcomeModal(): React.JSX.Element | null {
  const { setAiStyle } = useAiStore()
  const { loadBooks } = useBookStore()
  const { isMas, iCloudAccountSignedIn, iCloudSyncEnabled, setICloudSync } = useUIStore()
  const [visible, setVisible] = useState(false)
  const [step, setStep] = useState<1 | 2 | 3 | 4>(1)
  const [selected, setSelected] = useState<AiStyle>('cinematic')
  const [leaving, setLeaving] = useState(false)

  useEffect(() => {
    window.electron.app.isWelcomed().then((welcomed) => {
      if (!welcomed) {
        const t = setTimeout(() => setVisible(true), 600)
        return () => clearTimeout(t)
      }
    })
  }, [])

  // Dev shortcut — Cmd+Shift+W replays the onboarding flow regardless of
  // the .welcomed sentinel. Capture-phase listener so it fires before any
  // menu accelerator can swallow it. Resets step/selected so the flow
  // restarts from the top.
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.metaKey && e.shiftKey && (e.key === 'w' || e.key === 'W')) {
        e.preventDefault()
        e.stopPropagation()
        setStep(1)
        setSelected('cinematic')
        setLeaving(false)
        setVisible(true)
      }
    }
    window.addEventListener('keydown', onKey, { capture: true })
    return () => window.removeEventListener('keydown', onKey, { capture: true })
  }, [])

  // All handlers defined BEFORE the early return to satisfy Rules of Hooks
  const goToStep = (next: 1 | 2 | 3 | 4): void => {
    setLeaving(true)
    setTimeout(() => { setStep(next); setLeaving(false) }, 200)
  }

  const dismiss = (): void => {
    setLeaving(true)
    setTimeout(() => setVisible(false), 300)
  }

  const handleWriterNext = (): void => {
    setAiStyle(selected)
    window.electron.app.setWelcomed()
    goToStep(isMas && iCloudAccountSignedIn ? 3 : 4)
  }

  const handleDemoYes = async (): Promise<void> => {
    dismiss()
    await window.electron.app.createDemoBook()
    await loadBooks()
  }

  const handleDemoNo = (): void => {
    dismiss()
  }

  if (!visible) return null

  return (
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center"
      style={{
        background: 'rgba(10,8,6,0.72)',
        backdropFilter: 'blur(18px)',
        WebkitBackdropFilter: 'blur(18px)',
        animation: leaving ? 'fadeOut 0.3s ease forwards' : 'fadeIn 0.4s ease forwards'
      }}
    >
      <style>{`
        @keyframes fadeIn  { from { opacity: 0 } to { opacity: 1 } }
        @keyframes fadeOut { from { opacity: 1 } to { opacity: 0 } }
        @keyframes slideUp { from { opacity: 0; transform: translateY(24px) } to { opacity: 1; transform: translateY(0) } }
        @keyframes slideOut { from { opacity: 1; transform: translateY(0) } to { opacity: 0; transform: translateY(-16px) } }
      `}</style>

      {/* Card */}
      <div
        className="relative w-[560px] max-w-[92vw] rounded-3xl shadow-2xl overflow-hidden"
        style={{
          background: 'var(--bg-card)',
          border: '1px solid var(--border)',
          animation: leaving
            ? 'slideOut 0.2s ease forwards'
            : 'slideUp 0.45s cubic-bezier(0.16,1,0.3,1) forwards'
        }}
      >
        {/* Amber top accent bar */}
        <div style={{ height: 3, background: 'linear-gradient(90deg, var(--accent), #f59e0b, var(--accent))' }} />

        <div className="px-10 py-9">

          {/* ── Step 1: Welcome ── */}
          {step === 1 && (
            <>
              {/* Logo + name */}
              <div className="flex flex-col items-center text-center mb-8">
                <img src={appIcon} alt="Lekhanam" className="w-16 h-16 mb-4 drop-shadow-lg" />
                <h1 className="text-2xl font-serif font-bold text-[var(--fg)] tracking-tight">
                  Welcome to Lekhanam
                </h1>
                <p className="text-sm text-[var(--fg-muted)] mt-1.5 leading-relaxed">
                  Your private AI writing studio — everything on your Mac.
                </p>
              </div>

              {/* Feature grid */}
              <div className="grid grid-cols-2 gap-3 mb-8">
                {FEATURES.map((f) => (
                  <div
                    key={f.title}
                    className="flex items-start gap-3 p-3.5 rounded-2xl"
                    style={{ background: 'var(--bg-subtle)', border: '1px solid var(--border)' }}
                  >
                    <div
                      className="flex-shrink-0 w-9 h-9 rounded-xl flex items-center justify-center"
                      style={{ background: 'var(--bg-amber)', color: 'var(--accent)' }}
                    >
                      {f.icon}
                    </div>
                    <div>
                      <p className="text-xs font-semibold text-[var(--fg)]">{f.title}</p>
                      <p className="text-[11px] text-[var(--fg-muted)] leading-snug mt-0.5">{f.desc}</p>
                    </div>
                  </div>
                ))}
              </div>

              <button
                onClick={() => goToStep(2)}
                className="w-full py-3 rounded-xl text-white text-sm font-semibold transition-all active:scale-[0.98]"
                style={{ background: 'linear-gradient(135deg, var(--accent), var(--accent-hover))', boxShadow: '0 2px 12px rgba(217,119,6,0.35)' }}
              >
                Get Started →
              </button>

              <p className="text-center text-[10px] text-[var(--fg-faint)] mt-4">
                No account needed · No internet required · Your writing stays on your Mac
              </p>
            </>
          )}

          {/* ── Step 2: Writer type ── */}
          {step === 2 && (
            <>
              <div className="text-center mb-7">
                <h2 className="text-xl font-serif font-bold text-[var(--fg)]">
                  What kind of writer are you?
                </h2>
                <p className="text-sm text-[var(--fg-muted)] mt-1.5">
                  This sets your default AI writing style. You can change it anytime.
                </p>
              </div>

              <div className="grid grid-cols-2 gap-3 mb-8">
                {WRITER_TYPES.map((w) => {
                  const isSelected = selected === w.id
                  return (
                    <button
                      key={w.id}
                      onClick={() => setSelected(w.id)}
                      className="flex items-start gap-3 p-4 rounded-2xl text-left transition-all"
                      style={{
                        background: isSelected ? 'var(--bg-amber)' : 'var(--bg-subtle)',
                        border: isSelected ? '1.5px solid var(--accent)' : '1.5px solid var(--border)',
                        boxShadow: isSelected ? '0 0 0 3px rgba(217,119,6,0.12)' : 'none'
                      }}
                    >
                      <div
                        className="flex-shrink-0 w-9 h-9 rounded-xl flex items-center justify-center"
                        style={{
                          background: isSelected ? 'var(--accent)' : 'var(--bg-card)',
                          color: isSelected ? 'white' : 'var(--fg-muted)',
                          border: '1px solid var(--border)'
                        }}
                      >
                        {w.icon}
                      </div>
                      <div>
                        <p className="text-xs font-semibold text-[var(--fg)]">{w.label}</p>
                        <p className="text-[11px] text-[var(--fg-muted)] leading-snug mt-0.5">{w.subtitle}</p>
                      </div>
                    </button>
                  )
                })}
              </div>

              <button
                onClick={handleWriterNext}
                className="w-full py-3 rounded-xl text-white text-sm font-semibold transition-all active:scale-[0.98]"
                style={{ background: 'linear-gradient(135deg, var(--accent), var(--accent-hover))', boxShadow: '0 2px 12px rgba(217,119,6,0.35)' }}
              >
                Continue →
              </button>

              {/* Step indicator */}
              <div className="flex items-center justify-center gap-2 mt-5">
                <div className="w-5 h-1.5 rounded-full" style={{ background: 'var(--fg-faint)' }} />
                <div className="w-5 h-1.5 rounded-full" style={{ background: 'var(--accent)' }} />
                <div className="w-5 h-1.5 rounded-full" style={{ background: 'var(--fg-faint)' }} />
              </div>
            </>
          )}

          {/* ── Step 3: iCloud Sync ── */}
          {step === 3 && (
            <div className={`transition-opacity duration-200 ${leaving ? 'opacity-0' : 'opacity-100'}`}>
              <div className="text-center mb-6">
                <div className="w-14 h-14 rounded-2xl bg-blue-50 flex items-center justify-center mx-auto mb-4">
                  <svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24"
                    fill="none" stroke="#3b82f6" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M18 10h-1.26A8 8 0 1 0 9 20h9a5 5 0 0 0 0-10z"/>
                  </svg>
                </div>
                <h2 className="text-xl font-semibold text-[var(--fg)] mb-2">Sync with iCloud</h2>
                <p className="text-sm text-[var(--fg-muted)] leading-relaxed max-w-xs mx-auto">
                  Keep your books available on all your Macs. Private — only you can see them.
                </p>
              </div>

              <div
                className="flex items-center justify-between px-4 py-3 rounded-xl mb-3"
                style={{ background: 'var(--bg-subtle)', border: '1px solid var(--border)' }}
              >
                <div>
                  <p className="text-sm font-medium text-[var(--fg)]">iCloud Sync</p>
                  <p className="text-xs text-[var(--fg-muted)]">Store books in iCloud Drive</p>
                </div>
                <button
                  role="switch"
                  aria-checked={iCloudSyncEnabled}
                  onClick={async () => {
                    const result = await setICloudSync(!iCloudSyncEnabled)
                    if (!result.ok) alert(`Could not ${iCloudSyncEnabled ? 'disable' : 'enable'} iCloud sync:\n${result.error ?? 'Unknown error'}`)
                  }}
                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                    iCloudSyncEnabled ? 'bg-blue-500' : 'bg-[var(--border)]'
                  }`}
                >
                  <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
                    iCloudSyncEnabled ? 'translate-x-6' : 'translate-x-1'
                  }`} />
                </button>
              </div>

              {iCloudSyncEnabled && (
                <p className="text-xs text-[var(--fg-muted)] text-center mb-3">
                  ✓ Books will sync to iCloud when connected.
                </p>
              )}

              <p className="text-xs text-[var(--fg-faint)] text-center mb-5">
                You can change this anytime in Settings ⚙
              </p>

              <button
                onClick={() => goToStep(4)}
                className="w-full py-3 rounded-xl bg-[var(--accent)] text-white font-semibold text-sm hover:bg-[var(--accent-hover)] transition-colors"
              >
                Continue
              </button>
            </div>
          )}

          {/* ── Step 4: Demo book offer ── */}
          {step === 4 && (
            <>
              <div className="flex flex-col items-center text-center mb-7">
                <div
                  className="w-14 h-14 rounded-2xl flex items-center justify-center mb-4"
                  style={{ background: 'var(--bg-amber)' }}
                >
                  <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
                    <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
                    <line x1="12" y1="6" x2="12" y2="14" />
                    <line x1="8" y1="10" x2="16" y2="10" />
                  </svg>
                </div>
                <h2 className="text-xl font-serif font-bold text-[var(--fg)]">
                  Load a sample book?
                </h2>
                <p className="text-sm text-[var(--fg-muted)] mt-2 leading-relaxed max-w-sm">
                  We've prepared a short mystery called <span className="font-semibold text-[var(--fg)]">"The Last Letter"</span> — with chapters, characters, and story notes — so you can explore every feature right away.
                </p>
                <p className="text-[11px] text-[var(--fg-faint)] mt-2">You can delete it from your library at any time.</p>
              </div>

              <div className="flex flex-col gap-3">
                <button
                  onClick={handleDemoYes}
                  className="w-full py-3 rounded-xl text-white text-sm font-semibold transition-all active:scale-[0.98]"
                  style={{ background: 'linear-gradient(135deg, var(--accent), var(--accent-hover))', boxShadow: '0 2px 12px rgba(217,119,6,0.35)' }}
                >
                  Yes, load the sample book
                </button>
                <button
                  onClick={handleDemoNo}
                  className="w-full py-2.5 rounded-xl text-sm font-medium transition-colors"
                  style={{ color: 'var(--fg-muted)', background: 'var(--bg-subtle)', border: '1px solid var(--border)' }}
                >
                  No thanks, I'll start fresh
                </button>
              </div>

              {/* Step indicator */}
              <div className="flex items-center justify-center gap-2 mt-6">
                <div className="w-5 h-1.5 rounded-full" style={{ background: 'var(--fg-faint)' }} />
                <div className="w-5 h-1.5 rounded-full" style={{ background: 'var(--fg-faint)' }} />
                <div className="w-5 h-1.5 rounded-full" style={{ background: 'var(--accent)' }} />
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
