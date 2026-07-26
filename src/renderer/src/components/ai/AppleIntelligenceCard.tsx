import React from 'react'
import { useAiStore } from '../../store/aiStore'
import { useModelActions } from './useModelActions'

interface Props {
  unavailableReason?: string
}

export function AppleIntelligenceCard({ unavailableReason }: Props): React.JSX.Element {
  const { loadedModelId, loadingId } = useAiStore()
  const { loadModel, unloadModel } = useModelActions()

  const isLoaded = loadedModelId === 'apple-intelligence'
  const isLoading = loadingId === 'apple-intelligence'
  const unavailable = !!unavailableReason

  const dot =
    isLoaded ? { bg: '#22c55e', label: 'Loaded' } :
    isLoading ? { bg: '#f59e0b', label: 'Loading' } :
    unavailable ? { bg: '#94a3b8', label: 'Unavailable' } :
    { bg: 'transparent', ring: true, label: 'Ready' }

  function renderButton(): React.JSX.Element {
    if (unavailable) {
      return (
        <button
          onClick={() => window.electron.shell.openExternal('x-apple.systempreferences:com.apple.preference.security')}
          className="px-3 py-1.5 rounded-[10px] text-xs font-medium active:scale-[0.97] transition-transform duration-[160ms] ease-out"
          style={{ color: 'var(--fg-muted)', border: '1px solid var(--divider)' }}>
          Open System Settings →
        </button>
      )
    }
    if (isLoaded) {
      return (
        <button onClick={unloadModel}
          className="px-3 py-1.5 rounded-[10px] text-xs font-medium active:scale-[0.97] transition-transform duration-[160ms] ease-out"
          style={{ color: 'var(--fg-muted)', border: '1px solid var(--divider)' }}>
          Unload
        </button>
      )
    }
    if (isLoading) {
      return (
        <button disabled className="px-3 py-1.5 rounded-[10px] text-xs font-medium opacity-50"
          style={{ background: 'var(--bg-subtle)', border: '1px solid var(--divider)' }}>
          Loading…
        </button>
      )
    }
    const label = loadedModelId ? 'Replace loaded model →' : 'Use Apple Intelligence'
    return (
      <button onClick={() => loadModel('apple-intelligence')}
        className="px-3 py-1.5 rounded-[10px] text-xs font-semibold text-white active:scale-[0.97] transition-transform duration-[160ms] ease-out"
        style={{ background: 'var(--accent)' }}>
        {label}
      </button>
    )
  }

  return (
    <div className="rounded-[10px] p-3 mb-2"
      style={{
        background: 'var(--bg-subtle)',
        border: '1px solid var(--border)',
        opacity: unavailable ? 0.6 : 1,
      }}>
      <div className="flex items-center justify-between mb-1">
        <div className="flex items-center gap-2 min-w-0">
          <span
            className="w-2 h-2 rounded-full flex-shrink-0"
            style={{
              background: dot.bg,
              border: (dot as { ring?: boolean }).ring ? '1.5px solid var(--fg-muted)' : 'none',
            }}
            aria-label={dot.label}
          />
          <span className="text-xs font-semibold text-[var(--fg)] truncate">Apple Intelligence</span>
        </div>
        <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-[10px]"
          style={{ background: 'rgba(0,122,255,0.12)', color: '#007AFF' }}>
          Built-in · macOS 26+
        </span>
      </div>

      <p className="text-[11px] text-[var(--fg-muted)] mb-2 leading-snug">
        {unavailable
          ? unavailableReason
          : 'Apple\'s on-device AI. No download, no RAM cost — works even when memory is low.'}
      </p>

      <div className="flex">{renderButton()}</div>
    </div>
  )
}
