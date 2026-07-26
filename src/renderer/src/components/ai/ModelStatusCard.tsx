import React from 'react'
import { useAiStore, type CatalogModelStatus } from '../../store/aiStore'
import { useModelActions } from './useModelActions'

function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = React.useState<boolean>(
    typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
  )
  React.useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)')
    const onChange = (e: MediaQueryListEvent): void => setReduced(e.matches)
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [])
  return reduced
}

function lookupModelMeta(
  catalog: CatalogModelStatus[] | null,
  id: string | null
): { name: string; ramGb: number } {
  const lookupId = id ?? 'lekha-2b'
  const entry = catalog?.find((m) => m.id === lookupId)
  if (entry) return { name: entry.label, ramGb: entry.requiredFreeGb }
  // Catalog not loaded yet (first render before syncDownloaded resolves) or unknown id.
  return { name: id ?? 'Lekha AI 2B', ramGb: 0 }
}

interface StatusSpec {
  dotColor: string
  pulse: boolean
  label: string
  sublabel?: string
  actions?: React.ReactNode
  trailing?: React.ReactNode
}

function HardwareRow(): React.JSX.Element {
  const { freeRamGb, totalRamGb, freeDiskGb, memoryHealth } = useAiStore()
  const ramKnown = totalRamGb > 0
  const diskKnown = freeDiskGb > 0 && freeDiskGb < 9999

  const ramColor =
    memoryHealth === 'red' ? '#b91c1c' :
    memoryHealth === 'yellow' ? '#b45309' : 'var(--fg)'

  return (
    <div className="grid grid-cols-2 gap-1.5 mb-2">
      <div className="rounded-[8px] px-2 py-1.5"
        style={{ background: 'var(--bg-card)', border: '1px solid var(--divider)' }}>
        <p className="text-[9px] uppercase tracking-wider text-[var(--fg-faint)] mb-0.5">Free RAM</p>
        <p className="text-[11px] font-medium tabular-nums" style={{ color: ramColor }}>
          {ramKnown ? `${freeRamGb.toFixed(1)} GB` : '—'}
          {ramKnown && (
            <span className="text-[var(--fg-muted)] font-normal">
              {' / '}{totalRamGb.toFixed(0)} GB
            </span>
          )}
        </p>
      </div>
      <div className="rounded-[8px] px-2 py-1.5"
        style={{ background: 'var(--bg-card)', border: '1px solid var(--divider)' }}>
        <p className="text-[9px] uppercase tracking-wider text-[var(--fg-faint)] mb-0.5">Free Disk</p>
        <p className="text-[11px] font-medium tabular-nums text-[var(--fg)]">
          {diskKnown ? `${freeDiskGb.toFixed(0)} GB` : '—'}
        </p>
      </div>
    </div>
  )
}

export function ModelStatusCard(): React.JSX.Element {
  const {
    loadedModelId,
    loadingId,
    downloadingId,
    lastLoadedModelId,
    downloadedIds,
    errorMessage,
    aiStyle,
    setPanelTab,
    catalogStatuses,
  } = useAiStore()
  const { loadModel, unloadModel } = useModelActions()
  const reducedMotion = usePrefersReducedMotion()
  const pulseClass = reducedMotion ? '' : 'animate-pulse'

  // Collapsible — opens by default every new app launch, remembered per session.
  // sessionStorage (not localStorage) so the expanded default returns on relaunch.
  const [expanded, setExpanded] = React.useState<boolean>(() => {
    if (typeof sessionStorage === 'undefined') return true
    const v = sessionStorage.getItem('lekhanam_model_status_expanded')
    return v === null ? true : v === 'true'
  })
  const toggleExpanded = (): void => {
    setExpanded((prev) => {
      const next = !prev
      try { sessionStorage.setItem('lekhanam_model_status_expanded', String(next)) } catch { /* no-op */ }
      return next
    })
  }

  // Compute status spec from state machine
  let spec: StatusSpec

  if (errorMessage && !loadingId) {
    const name = lookupModelMeta(catalogStatuses,loadedModelId ?? lastLoadedModelId).name
    spec = {
      dotColor: '#ef4444',
      pulse: false,
      label: `Couldn't load ${name}`,
      sublabel: errorMessage,
      actions: (
        <div className="flex gap-1.5">
          <button onClick={() => lastLoadedModelId && loadModel(lastLoadedModelId)}
            className="flex-1 py-1.5 rounded-[8px] text-[11px] font-semibold text-white active:scale-[0.97] transition-transform duration-[160ms] ease-out"
            style={{ background: 'var(--accent)' }}>
            Retry
          </button>
          <button onClick={() => setPanelTab('models')}
            className="flex-1 py-1.5 rounded-[8px] text-[11px] font-medium active:scale-[0.97] transition-transform duration-[160ms] ease-out"
            style={{ color: 'var(--fg-muted)', background: 'var(--bg-subtle)', border: '1px solid var(--border)' }}>
            Choose another
          </button>
        </div>
      ),
    }
  } else if (loadingId) {
    const meta = lookupModelMeta(catalogStatuses,loadingId)
    spec = {
      dotColor: '#f59e0b',
      pulse: true,
      label: `Loading ${meta.name}…`,
      sublabel: `Allocating ${meta.ramGb} GB in memory`,
    }
  } else if (loadedModelId) {
    const meta = lookupModelMeta(catalogStatuses,loadedModelId)
    spec = {
      dotColor: '#22c55e',
      pulse: true,
      label: meta.name,
      sublabel: `${meta.ramGb} GB in memory · ${aiStyle} style`,
      trailing: (
        <button onClick={unloadModel}
          className="px-2.5 py-1 rounded-[8px] text-[11px] font-medium active:scale-[0.97] transition-transform duration-[160ms] ease-out"
          style={{ color: 'var(--fg-muted)', border: '1px solid var(--divider)' }}>
          Unload
        </button>
      ),
    }
  } else {
    const ctaId = lastLoadedModelId ?? 'lekha-2b'
    const ctaMeta = lookupModelMeta(catalogStatuses,ctaId)
    const ctaDownloaded = downloadedIds.includes(ctaId)
    spec = {
      dotColor: '#ef4444',
      pulse: false,
      label: 'No model loaded',
      actions: (
        <>
          <button
            onClick={() => ctaDownloaded ? loadModel(ctaId) : setPanelTab('models')}
            className="w-full py-1.5 rounded-[8px] text-[11px] font-semibold text-white active:scale-[0.97] transition-transform duration-[160ms] ease-out"
            style={{ background: 'var(--accent)' }}>
            {ctaDownloaded ? `Load ${ctaMeta.name}` : `Download ${ctaMeta.name}`}
          </button>
          <button onClick={() => setPanelTab('models')}
            className="w-full mt-1 text-[10px] text-[var(--fg-muted)] hover:text-[var(--fg)] transition-colors">
            or choose a different model →
          </button>
        </>
      ),
    }
  }

  return (
    <div className="rounded-[10px] p-2.5 mb-2"
      style={{ background: 'var(--surface-raised)', border: '1px solid var(--divider)' }}
      role="status" aria-live="polite">
      {/* Status line — always visible, also the toggle trigger */}
      <div className={`flex items-center justify-between gap-2 ${expanded ? 'mb-2' : ''}`}>
        <div className="flex items-center gap-2 min-w-0 flex-1">
          <span
            className={`w-2 h-2 rounded-full flex-shrink-0 ${spec.pulse ? pulseClass : ''}`}
            style={{ background: spec.dotColor, animationDuration: '1.6s' }}
          />
          <span className="text-xs font-semibold text-[var(--fg)] truncate">{spec.label}</span>
        </div>
        <div className="flex items-center gap-1 flex-shrink-0">
          {spec.trailing}
          <button
            onClick={toggleExpanded}
            aria-expanded={expanded}
            aria-label={expanded ? 'Collapse status card' : 'Expand status card'}
            className="p-1 rounded-[6px] text-[var(--fg-muted)] hover:text-[var(--fg)] hover:bg-[var(--bg-subtle)] transition-colors"
          >
            <svg
              width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor"
              strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
              style={{ transform: expanded ? 'rotate(0deg)' : 'rotate(180deg)', transition: reducedMotion ? 'none' : 'transform 160ms ease-out' }}
              aria-hidden="true"
            >
              <polyline points="18 15 12 9 6 15" />
            </svg>
          </button>
        </div>
      </div>

      {expanded && (
        <>
          {/* Always-visible hardware readout */}
          <HardwareRow />

          {/* Sublabel (error message, loading detail, etc.) */}
          {spec.sublabel && (
            <p className="text-[11px] text-[var(--fg-muted)] mb-2 leading-snug">{spec.sublabel}</p>
          )}

          {/* Actions */}
          {spec.actions}

          {/* Download overlay (appears regardless of main state) */}
          {downloadingId && <DownloadOverlayRow />}
        </>
      )}
    </div>
  )
}

function DownloadOverlayRow(): React.JSX.Element {
  const { downloadingId, downloadPercent, setPanelTab, catalogStatuses } = useAiStore()
  if (!downloadingId) return <></>
  const meta = lookupModelMeta(catalogStatuses, downloadingId)
  return (
    <div className="mt-2 pt-2 border-t flex items-center justify-between gap-2"
      style={{ borderColor: 'var(--divider)' }}>
      <span className="text-[11px] text-[var(--fg-muted)] flex-1 flex items-center gap-1.5">
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3"/>
        </svg>
        Downloading {meta.name} · {Math.round(downloadPercent)}%
      </span>
      <button onClick={() => setPanelTab('models')}
        className="text-[11px] font-medium" style={{ color: 'var(--accent)' }}>
        View →
      </button>
    </div>
  )
}
