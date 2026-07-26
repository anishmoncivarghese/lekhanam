import React, { useState, useEffect, useRef, useCallback } from 'react'
import { BOOK_FORMATS, DEFAULT_FORMAT_KEY } from '../constants/bookFormats'
import { useBookStore } from '../store/bookStore'
import type { Act } from '../types'

const ROMAN_WORDS = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten']
const PX_PER_IN = 96

interface ActEditorProps {
  act: Act
  actIndex: number          // 1-based
  structureLabel: 'act' | 'section'
  onSave: (updated: Act) => Promise<void>
}

export default function ActEditor({ act, actIndex, structureLabel, onSave }: ActEditorProps): React.JSX.Element {
  const { currentBook } = useBookStore()
  const format = BOOK_FORMATS[currentBook?.format ?? DEFAULT_FORMAT_KEY] ?? BOOK_FORMATS[DEFAULT_FORMAT_KEY]
  const pgW = Math.round(format.widthIn * PX_PER_IN)
  const pgH = Math.round(format.heightIn * PX_PER_IN)

  const [title, setTitle] = useState(act.title)
  const [subtitle, setSubtitle] = useState(act.subtitle ?? '')
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved'>('idle')
  const [zoom, setZoom] = useState(0.7)

  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const latestAct = useRef(act)
  latestAct.current = act

  const labelCap = structureLabel === 'section' ? 'Section' : 'Act'
  const eyebrow = `${labelCap} ${ROMAN_WORDS[actIndex] ?? String(actIndex)}`

  const save = useCallback(async (patch: Partial<Act>) => {
    if (saveTimer.current) clearTimeout(saveTimer.current)
    setSaveStatus('saving')
    await onSave({ ...latestAct.current, ...patch, updatedAt: new Date().toISOString() })
    setSaveStatus('saved')
    setTimeout(() => setSaveStatus('idle'), 1500)
  }, [onSave])

  const schedSave = useCallback((patch: Partial<Act>) => {
    if (saveTimer.current) clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(() => save(patch), 600)
  }, [save])

  // Cancel pending debounced save on unmount
  useEffect(() => {
    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current)
    }
  }, [])

  // Sync when a different act is selected
  useEffect(() => {
    setTitle(act.title)
    setSubtitle(act.subtitle ?? '')
  }, [act.id]) // eslint-disable-line react-hooks/exhaustive-deps

  const handleTitleChange = (val: string): void => {
    setTitle(val)
    schedSave({ title: val })
  }

  const handleSubtitleChange = (val: string): void => {
    setSubtitle(val)
    schedSave({ subtitle: val })
  }

  // Font sizes scale with page width for any book format
  const titleSize = Math.round(pgW * 0.055)
  const subtitleSize = Math.round(pgW * 0.028)

  return (
    <div className="flex flex-col h-full bg-[var(--bg-surround)]">

      {/* ── Page canvas ─────────────────────────────────────────────────────── */}
      <div className="flex-1 overflow-auto bg-[var(--bg-surround)] flex items-start justify-center py-10">
        {/* Outer div reserves space in the scroll container */}
        <div style={{ width: pgW * zoom, height: pgH * zoom, position: 'relative', flexShrink: 0 }}>
          {/* Inner div is the actual page, scaled via transform */}
          <div style={{
            width: pgW,
            height: pgH,
            transform: `scale(${zoom})`,
            transformOrigin: 'top left',
            position: 'absolute',
            background: 'var(--bg-card)',
            boxShadow: '0 4px 32px rgba(0,0,0,0.18)',
            borderRadius: 2,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            paddingTop: Math.round(pgH * 0.35),
            paddingLeft: Math.round(pgW * 0.12),
            paddingRight: Math.round(pgW * 0.12),
            textAlign: 'center',
            boxSizing: 'border-box',
          }}>

            {/* Eyebrow — non-editable */}
            <p style={{
              fontSize: 11,
              fontWeight: 600,
              letterSpacing: '0.28em',
              textTransform: 'uppercase',
              color: 'var(--fg-faint)',
              marginBottom: 16,
              userSelect: 'none',
            }}>
              {eyebrow}
            </p>

            {/* Decorative rule */}
            <div style={{ width: 40, height: 1, background: 'var(--border)', marginBottom: 20 }} />

            {/* Title input */}
            <input
              type="text"
              value={title}
              onChange={(e) => handleTitleChange(e.target.value)}
              placeholder={`${labelCap} title…`}
              style={{
                width: '100%',
                textAlign: 'center',
                fontSize: titleSize,
                fontWeight: 700,
                background: 'transparent',
                border: 'none',
                outline: 'none',
                color: 'var(--fg)',
                marginBottom: 14,
                lineHeight: 1.2,
              }}
            />

            {/* Subtitle input */}
            <input
              type="text"
              value={subtitle}
              onChange={(e) => handleSubtitleChange(e.target.value)}
              placeholder="Subtitle (optional)…"
              style={{
                width: '100%',
                textAlign: 'center',
                fontSize: subtitleSize,
                fontStyle: 'italic',
                background: 'transparent',
                border: 'none',
                outline: 'none',
                color: 'var(--fg-muted)',
                lineHeight: 1.6,
              }}
            />
          </div>
        </div>
      </div>

      {/* ── Bottom bar ──────────────────────────────────────────────────────── */}
      <div className="flex items-center gap-2 px-4 py-2 bg-[var(--bg-card)] border-t border-[var(--border)] flex-shrink-0">
        <span className="text-[11px] text-[var(--fg-faint)] select-none">
          {labelCap} page · title &amp; subtitle only
        </span>

        {/* Save status */}
        {saveStatus === 'saving' && (
          <span className="text-[11px] text-[var(--fg-faint)] flex items-center gap-1 ml-2">
            <svg className="animate-spin w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg>
            Saving…
          </span>
        )}
        {saveStatus === 'saved' && (
          <span className="text-[11px] text-[var(--fg-faint)] flex items-center gap-1 ml-2">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5"/></svg>
            Saved
          </span>
        )}

        <div className="flex-1" />

        {/* Zoom controls */}
        <button
          onClick={() => setZoom(z => Math.max(0.3, parseFloat((z - 0.1).toFixed(2))))}
          className="w-6 h-6 flex items-center justify-center rounded hover:bg-[var(--bg-subtle)] text-[var(--fg-muted)] text-base leading-none"
          title="Zoom out"
        >−</button>
        <button
          onClick={() => setZoom(0.7)}
          className="w-14 text-center text-[11px] text-[var(--fg-muted)] hover:text-[var(--fg)] tabular-nums transition-colors"
          title="Reset zoom"
        >{Math.round(zoom * 100)}%</button>
        <button
          onClick={() => setZoom(z => Math.min(1.5, parseFloat((z + 0.1).toFixed(2))))}
          className="w-6 h-6 flex items-center justify-center rounded hover:bg-[var(--bg-subtle)] text-[var(--fg-muted)] text-base leading-none"
          title="Zoom in"
        >+</button>
      </div>
    </div>
  )
}
