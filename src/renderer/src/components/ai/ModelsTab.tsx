import React, { useEffect, useRef, useState } from 'react'
import { useAiStore } from '../../store/aiStore'
import { ModelCard } from './ModelCard'
import { AppleIntelligenceCard } from './AppleIntelligenceCard'

const LEKHA_ID = 'lekha-2b'

export function ModelsTab(): React.JSX.Element {
  const {
    otherModelsExpanded,
    setOtherModelsExpanded,
    syncDownloaded,
    memoryHealth,
    freeDiskGb,
    recommended,
    catalogStatuses,
  } = useAiStore()

  const [appleAIAvailable, setAppleAIAvailable] = useState<boolean | null>(null)
  const [appleAIReason, setAppleAIReason] = useState<string | undefined>(undefined)
  const checkedAppleAI = useRef(false)

  useEffect(() => {
    syncDownloaded()
    // Check once per session — spawning the Swift binary on every mount is wasteful
    if (checkedAppleAI.current) return
    checkedAppleAI.current = true
    window.electron.app.appleIntelligenceAvailable().then((result) => {
      setAppleAIAvailable(result.available)
      if (!result.available) setAppleAIReason(result.reason)
    }).catch(() => {
      setAppleAIAvailable(false)
    })
  }, [syncDownloaded])

  const showWarnings = memoryHealth !== 'green' || freeDiskGb < 5

  const lekha = catalogStatuses?.find((m) => m.id === LEKHA_ID)
  const others = catalogStatuses?.filter((m) => m.id !== LEKHA_ID) ?? []

  return (
    <div className="flex-1 overflow-y-auto px-3 py-3">
      {showWarnings && (
        <div className="rounded-[10px] p-2.5 mb-3 text-[11px]"
          style={{
            background: memoryHealth === 'red' ? 'rgba(239,68,68,0.08)' : 'rgba(245,158,11,0.08)',
            border: `1px solid ${memoryHealth === 'red' ? '#ef4444' : '#f59e0b'}`,
            color: 'var(--fg)',
          }}>
          {memoryHealth !== 'green' && <p>Memory is {memoryHealth === 'red' ? 'critically low' : 'low'}. Close other apps before loading a larger model.</p>}
          {freeDiskGb < 5 && <p>Only {freeDiskGb.toFixed(1)} GB free on disk. Clear space before downloading.</p>}
        </div>
      )}

      {/* Apple Intelligence — shown when available (macOS 26+) or when unavailable with reason */}
      {appleAIAvailable !== null && (
        <>
          <p className="text-[10px] uppercase tracking-wider font-semibold text-[var(--fg-muted)] mb-2">Apple Intelligence</p>
          <AppleIntelligenceCard unavailableReason={appleAIAvailable ? undefined : appleAIReason} />
        </>
      )}

      <p className="text-[10px] uppercase tracking-wider font-semibold text-[var(--fg-muted)] mb-2">Recommended</p>
      {lekha && (
        <ModelCard
          id={lekha.id}
          name={lekha.label}
          description={lekha.description}
          sizeGb={lekha.sizeGb}
          ramGb={lekha.requiredFreeGb}
          recommended
        />
      )}

      <button
        onClick={() => setOtherModelsExpanded(!otherModelsExpanded)}
        className="w-full flex items-center justify-between mt-4 mb-2 text-left"
        aria-expanded={otherModelsExpanded}>
        <span className="text-[10px] uppercase tracking-wider font-semibold text-[var(--fg-muted)]">
          Other models ({others.length}) — General-purpose Qwen variants
        </span>
        <span
          className="text-[var(--fg-muted)] transition-transform duration-[160ms] ease-out"
          style={{ transform: otherModelsExpanded ? 'rotate(90deg)' : 'rotate(0deg)' }}>
          ▸
        </span>
      </button>

      {otherModelsExpanded && (
        <div>
          {others.map((m) => (
            <ModelCard
              key={m.id}
              id={m.id}
              name={m.label}
              description={m.description}
              sizeGb={m.sizeGb}
              ramGb={m.requiredFreeGb}
              bestForHardware={recommended === m.id}
            />
          ))}
        </div>
      )}
    </div>
  )
}
