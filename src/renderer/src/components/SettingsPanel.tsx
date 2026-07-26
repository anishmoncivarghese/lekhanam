import React, { useEffect, useRef, useState } from 'react'
import { useUIStore } from '../store/uiStore'

interface Props {
  onClose: () => void
}

export default function SettingsPanel({ onClose }: Props): React.JSX.Element {
  const {
    isMas,
    iCloudSyncEnabled,
    iCloudAccountSignedIn,
    setICloudSync,
    isDark,
    toggleTheme,
    speechLanguage,
  } = useUIStore()

  const [migrating, setMigrating] = useState(false)
  const [migrateMsg, setMigrateMsg] = useState<string | null>(null)
  const [appVersion, setAppVersion] = useState('—')
  const panelRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    window.electron.app.getVersion().then(setAppVersion)
  }, [])

  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onClose])

  // Close on outside click
  useEffect(() => {
    const handler = (e: MouseEvent): void => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) onClose()
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [onClose])

  const handleICloudToggle = async (): Promise<void> => {
    if (!isMas) return
    setMigrating(true)
    setMigrateMsg(iCloudSyncEnabled ? 'Moving books to local storage…' : 'Moving books to iCloud…')
    const result = await setICloudSync(!iCloudSyncEnabled)
    setMigrating(false)
    if (!result.ok) {
      setMigrateMsg(`Error: ${result.error ?? 'Unknown error'}`)
    } else {
      if (iCloudSyncEnabled) {
        setMigrateMsg(null)
      } else {
        setMigrateMsg('Upload in progress — may take a few minutes.')
        setTimeout(() => setMigrateMsg(null), 4000)
      }
    }
  }

  const showBooksInFinder = async (): Promise<void> => {
    // Get authoritative path from main process — process.env.HOME is
    // undefined under contextIsolation:true, so never build paths in renderer
    const status = await window.electron.settings.get()
    await window.electron.shell.openFile(status.booksDir).catch(() => {})
  }

  return (
    // Backdrop
    <div className="fixed inset-0 z-50 flex justify-end">
      {/* Semi-transparent backdrop */}
      <div className="absolute inset-0 bg-black/20" onClick={onClose} />

      {/* Panel */}
      <div
        ref={panelRef}
        className="relative w-72 h-full bg-[var(--bg-card)] border-l border-[var(--border)] flex flex-col shadow-xl overflow-y-auto"
        style={{ animation: 'slideInRight 200ms ease-out' }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--border)]">
          <h2 className="text-sm font-semibold text-[var(--fg)]">Settings</h2>
          <button
            onClick={onClose}
            className="w-6 h-6 flex items-center justify-center rounded-md text-[var(--fg-muted)] hover:bg-[var(--bg-subtle)] transition-colors"
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
              <path d="M18 6 6 18M6 6l12 12"/>
            </svg>
          </button>
        </div>

        <div className="flex-1 px-5 py-4 space-y-6">

          {/* STORAGE */}
          <section>
            <p className="text-[9px] uppercase tracking-widest font-semibold text-[var(--fg-faint)] mb-3">Storage</p>

            {/* iCloud Sync row */}
            <div className="flex items-start justify-between gap-3 mb-1">
              <div className="flex-1">
                <p className="text-xs font-medium text-[var(--fg)]">iCloud Sync</p>
                <p className="text-[10px] text-[var(--fg-muted)] mt-0.5 leading-snug">
                  {!isMas
                    ? 'Available in App Store version only'
                    : !iCloudAccountSignedIn
                      ? 'Sign in to iCloud in System Settings first'
                      : 'Keep books on all your Macs'}
                </p>
              </div>
              <button
                role="switch"
                aria-checked={iCloudSyncEnabled}
                disabled={!isMas || !iCloudAccountSignedIn || migrating}
                onClick={handleICloudToggle}
                className={`relative flex-shrink-0 inline-flex h-5 w-9 items-center rounded-full transition-colors mt-0.5 disabled:opacity-40 ${
                  iCloudSyncEnabled ? 'bg-blue-500' : 'bg-[var(--border)]'
                }`}
              >
                <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition-transform ${
                  iCloudSyncEnabled ? 'translate-x-4' : 'translate-x-0.5'
                }`} />
              </button>
            </div>

            {migrating && (
              <div className="flex items-center gap-2 text-[10px] text-[var(--fg-muted)] mt-2">
                <svg className="animate-spin w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M21 12a9 9 0 1 1-6.219-8.56"/>
                </svg>
                {migrateMsg}
              </div>
            )}
            {!migrating && migrateMsg && (
              <p className="text-[10px] text-[var(--fg-muted)] mt-1">{migrateMsg}</p>
            )}

            {/* Show in Finder */}
            <button
              onClick={showBooksInFinder}
              className="mt-3 text-[10px] text-[var(--accent)] hover:underline"
            >
              Show books in Finder ↗
            </button>
          </section>

          {/* EDITOR */}
          <section>
            <p className="text-[9px] uppercase tracking-widest font-semibold text-[var(--fg-faint)] mb-3">Editor</p>
            <div className="flex items-center justify-between">
              <p className="text-xs font-medium text-[var(--fg)]">Dark Mode</p>
              <button
                role="switch"
                aria-checked={isDark}
                onClick={toggleTheme}
                className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${
                  isDark ? 'bg-[var(--accent)]' : 'bg-[var(--border)]'
                }`}
              >
                <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition-transform ${
                  isDark ? 'translate-x-4' : 'translate-x-0.5'
                }`} />
              </button>
            </div>
          </section>

          {/* VOICE */}
          <section>
            <p className="text-[9px] uppercase tracking-widest font-semibold text-[var(--fg-faint)] mb-3">Voice</p>
            <div className="flex items-center justify-between">
              <p className="text-xs font-medium text-[var(--fg)]">Speech Language</p>
              <p className="text-[10px] text-[var(--fg-muted)]">{speechLanguage}</p>
            </div>
            <p className="text-[10px] text-[var(--fg-faint)] mt-1">Change in the menu in the editor toolbar</p>
          </section>

          {/* ABOUT */}
          <section>
            <p className="text-[9px] uppercase tracking-widest font-semibold text-[var(--fg-faint)] mb-3">About</p>
            <div className="flex items-center justify-between">
              <p className="text-xs text-[var(--fg-muted)]">Version</p>
              <p className="text-xs text-[var(--fg-faint)] font-mono">{appVersion}</p>
            </div>
          </section>

        </div>
      </div>

      <style>{`
        @keyframes slideInRight {
          from { transform: translateX(100%); opacity: 0; }
          to   { transform: translateX(0);    opacity: 1; }
        }
      `}</style>
    </div>
  )
}
