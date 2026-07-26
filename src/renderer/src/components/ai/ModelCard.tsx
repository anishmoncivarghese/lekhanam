import React from 'react'
import { useAiStore } from '../../store/aiStore'
import { useModelActions } from './useModelActions'

export interface ModelCardProps {
  id: string
  name: string
  description: string
  sizeGb: number
  ramGb: number
  recommended?: boolean
  bestForHardware?: boolean
}

export function ModelCard(props: ModelCardProps): React.JSX.Element {
  const {
    loadedModelId, statusOf, downloadPercent,
    freeRamGb, totalRamGb, freeDiskGb,
  } = useAiStore()
  const { loadModel, unloadModel, downloadModel, cancelDownload } = useModelActions()
  const status = statusOf(props.id)

  const diskKnown = freeDiskGb > 0 && freeDiskGb < 9999
  const ramKnown = totalRamGb > 0
  const diskFits = !diskKnown || props.sizeGb <= freeDiskGb
  const ramFits = !ramKnown || props.ramGb <= freeRamGb

  const dot =
    status === 'loaded' ? { bg: '#22c55e', ring: false, label: 'Loaded' } :
    status === 'loading' ? { bg: '#f59e0b', ring: false, label: 'Loading' } :
    status === 'downloading' ? { bg: '#f59e0b', ring: true, label: 'Downloading' } :
    status === 'downloaded' ? { bg: 'transparent', ring: true, label: 'Downloaded' } :
    { bg: '#94a3b8', ring: false, label: 'Not downloaded' }

  function renderButton(): React.JSX.Element {
    if (status === 'loaded') {
      return (
        <button onClick={unloadModel}
          className="px-3 py-1.5 rounded-[10px] text-xs font-medium active:scale-[0.97] transition-transform duration-[160ms] ease-out"
          style={{ color: 'var(--fg-muted)', border: '1px solid var(--divider)' }}>
          Unload
        </button>
      )
    }
    if (status === 'loading') {
      return (
        <button disabled className="px-3 py-1.5 rounded-[10px] text-xs font-medium opacity-50"
          style={{ background: 'var(--bg-subtle)', border: '1px solid var(--divider)' }}>
          Loading…
        </button>
      )
    }
    if (status === 'downloading') {
      return (
        <div className="flex items-center gap-2 flex-1">
          <div className="flex-1 h-1.5 rounded-full overflow-hidden" style={{ background: 'var(--bg-subtle)' }}>
            <div className="h-full transition-transform duration-[120ms] ease-linear"
              style={{ background: 'var(--accent)', width: `${Math.round(downloadPercent)}%` }} />
          </div>
          <span className="text-[11px] text-[var(--fg-muted)] tabular-nums">{Math.round(downloadPercent)}%</span>
          <button onClick={cancelDownload}
            className="px-2.5 py-1 rounded-[10px] text-[11px] font-medium active:scale-[0.97] transition-transform duration-[160ms] ease-out"
            style={{ color: 'var(--fg-muted)', border: '1px solid var(--divider)' }}>
            Cancel
          </button>
        </div>
      )
    }
    if (status === 'downloaded') {
      const label = loadedModelId && loadedModelId !== props.id ? 'Replace loaded model →' : 'Load to memory'
      return (
        <button onClick={() => loadModel(props.id)}
          disabled={!ramFits}
          className="px-3 py-1.5 rounded-[10px] text-xs font-semibold text-white active:scale-[0.97] transition-transform duration-[160ms] ease-out disabled:opacity-50 disabled:cursor-not-allowed"
          style={{ background: 'var(--accent)' }}>
          {label}
        </button>
      )
    }
    return (
      <button onClick={() => downloadModel(props.id)}
        disabled={!diskFits}
        className="px-3 py-1.5 rounded-[10px] text-xs font-semibold text-white active:scale-[0.97] transition-transform duration-[160ms] ease-out disabled:opacity-50 disabled:cursor-not-allowed"
        style={{ background: 'var(--accent)' }}>
        Download {props.sizeGb} GB
      </button>
    )
  }

  const fitPillStyle = (fits: boolean): React.CSSProperties => ({
    color: fits ? 'var(--fg)' : '#b91c1c',
  })

  return (
    <div className="rounded-[10px] p-3 mb-2"
      style={{
        background: props.recommended ? 'var(--bg-amber)' : 'var(--bg-subtle)',
        border: `1px solid ${props.recommended ? 'var(--accent)' : 'var(--border)'}`,
      }}>
      {/* Row 1: name + badges */}
      <div className="flex items-center justify-between mb-1">
        <div className="flex items-center gap-2 min-w-0">
          <span
            className="w-2 h-2 rounded-full flex-shrink-0"
            style={{
              background: dot.bg,
              border: dot.ring ? '1.5px solid var(--fg-muted)' : 'none',
            }}
            aria-label={dot.label}
          />
          <span className="text-xs font-semibold text-[var(--fg)] truncate">{props.name}</span>
        </div>
        <div className="flex items-center gap-1 flex-shrink-0">
          {props.recommended && (
            <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-[10px]"
              style={{ background: 'var(--accent)', color: 'white' }}>
              Recommended
            </span>
          )}
          {props.bestForHardware && (
            <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-[10px]"
              style={{ background: 'var(--bg-amber)', color: 'var(--accent)' }}>
              Best for your Mac
            </span>
          )}
        </div>
      </div>

      {/* Description */}
      <p className="text-[11px] text-[var(--fg-muted)] mb-2 leading-snug">{props.description}</p>

      {/* Hardware fit readout — two columns: disk + RAM */}
      <div className="grid grid-cols-2 gap-1.5 mb-2">
        <div className="rounded-[8px] px-2 py-1.5"
          style={{ background: 'var(--bg-card)', border: '1px solid var(--divider)' }}>
          <p className="text-[9px] uppercase tracking-wider text-[var(--fg-faint)] mb-0.5">Disk</p>
          <p className="text-[11px] font-medium tabular-nums" style={fitPillStyle(diskFits)}>
            {props.sizeGb} GB
            <span className="text-[var(--fg-muted)] font-normal">
              {' / '}{diskKnown ? `${freeDiskGb.toFixed(0)} GB free` : '— free'}
            </span>
          </p>
        </div>
        <div className="rounded-[8px] px-2 py-1.5"
          style={{ background: 'var(--bg-card)', border: '1px solid var(--divider)' }}>
          <p className="text-[9px] uppercase tracking-wider text-[var(--fg-faint)] mb-0.5">RAM</p>
          <p className="text-[11px] font-medium tabular-nums" style={fitPillStyle(ramFits)}>
            {props.ramGb} GB
            <span className="text-[var(--fg-muted)] font-normal">
              {' / '}{ramKnown ? `${freeRamGb.toFixed(1)} of ${totalRamGb.toFixed(0)} GB` : '—'}
            </span>
          </p>
        </div>
      </div>

      {/* Action */}
      <div className="flex">{renderButton()}</div>

      {/* Fit warning */}
      {status === 'not_downloaded' && !diskFits && (
        <p className="text-[10px] text-red-700 mt-1.5">
          Not enough disk space. Free up {(props.sizeGb - freeDiskGb).toFixed(1)} GB before downloading.
        </p>
      )}
      {(status === 'downloaded' || status === 'not_downloaded') && diskFits && !ramFits && (
        <p className="text-[10px] text-red-700 mt-1.5">
          Needs {props.ramGb} GB RAM but only {freeRamGb.toFixed(1)} GB free. Close other apps first.
        </p>
      )}
    </div>
  )
}
