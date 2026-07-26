import React, { useEffect, useState, useCallback } from 'react'
import { Chapter, Act, DEFAULT_BOOK_STYLE } from '../types'
import { useBookStore } from '../store/bookStore'
import { BOOK_FORMATS, DEFAULT_FORMAT_KEY } from '../constants/bookFormats'
import { getSection, chapterToHtml } from '../utils/pdfExport'
import { buildDocx } from '../utils/docxExport'
import { generateEpub } from '../utils/epubExport'
import { useCoverStore } from '../store/coverStore'
import { useBillingStore } from '../store/billingStore'
import PremiumPaywallModal from './PremiumPaywallModal'

const ACT_ROMAN_WORDS = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten']


export function PrintPreviewModal({ onClose }: { onClose: () => void }): React.JSX.Element {
  const { currentBook, chapters, acts } = useBookStore()

  useEffect(() => {
    const handler = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onClose])

  if (!currentBook) return <></>

  const sorted = [...chapters].sort((a, b) => {
    const sd = getSection(a.kind) - getSection(b.kind)
    return sd !== 0 ? sd : (a.order ?? 0) - (b.order ?? 0)
  })

  return (
    <PreviewShell
      onClose={onClose}
      sorted={sorted}
      acts={acts}
      bookName={currentBook.name}
    />
  )
}

// ── Shell ─────────────────────────────────────────────────────────────────────

function PreviewShell({
  onClose, sorted, acts, bookName,
}: {
  onClose: () => void
  sorted: Chapter[]
  acts: Act[]
  bookName: string
}): React.JSX.Element {
  const { currentBook } = useBookStore()
  const { frontDataUrl, backDataUrl } = useCoverStore()
  const { isPremium } = useBillingStore()

  type OverlayStatus = 'idle' | 'processing' | 'done' | 'error'
  const [overlayStatus, setOverlayStatus] = useState<OverlayStatus>('idle')
  const [overlayResult, setOverlayResult] = useState<{ filePath: string; format: 'epub' | 'docx' } | null>(null)
  const [overlayError, setOverlayError] = useState<string | null>(null)
  const isExporting = overlayStatus === 'processing'
  const [showPaywall, setShowPaywall] = useState(false)
  const [paywallIntent, setPaywallIntent] = useState<'word' | 'epub' | null>(null)

  type CoverOption = 'front' | 'both' | 'none'
  const [coverPickerOpen, setCoverPickerOpen] = useState(false)
  const [coverOption, setCoverOption] = useState<CoverOption>(() => frontDataUrl ? 'front' : 'none')

  const structureLabel = (currentBook?.style?.structureLabel ?? 'act') as 'act' | 'section'
  const fmt = BOOK_FORMATS[currentBook?.format ?? DEFAULT_FORMAT_KEY] ?? BOOK_FORMATS[DEFAULT_FORMAT_KEY]

  const handleExportWord = useCallback(async (): Promise<void> => {
    if (!currentBook) return
    if (!isPremium) {
      setPaywallIntent('word')
      setShowPaywall(true)
      return
    }
    setOverlayStatus('processing')
    setOverlayError(null)
    try {
      const bookStyle = currentBook.style ?? DEFAULT_BOOK_STYLE
      const buffer = await buildDocx(currentBook, sorted, bookStyle, fmt, acts, structureLabel)
      const result = await window.electron.export.saveDocx(currentBook.name, buffer)
      if (!result.ok || !result.filePath) { setOverlayStatus('idle'); return }
      setOverlayResult({ filePath: result.filePath, format: 'docx' })
      setOverlayStatus('done')
    } catch (err) {
      setOverlayError(err instanceof Error ? err.message : 'Export failed')
      setOverlayStatus('error')
    }
  }, [currentBook, sorted, fmt, structureLabel, acts, isPremium])

  const handleExportEpub = useCallback(async (opt: CoverOption): Promise<void> => {
    if (!currentBook) return
    if (!isPremium) {
      setPaywallIntent('epub')
      setShowPaywall(true)
      return
    }
    setCoverPickerOpen(false)
    setOverlayStatus('processing')
    setOverlayError(null)
    try {
      const cover = opt === 'none' ? undefined : (frontDataUrl || undefined)
      const backCover = opt === 'both' ? (backDataUrl || undefined) : undefined
      const filePath = await generateEpub(currentBook, sorted, acts, cover, backCover, structureLabel)
      setOverlayResult({ filePath, format: 'epub' })
      setOverlayStatus('done')
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'ePub export failed'
      if (msg === 'Save cancelled') { setOverlayStatus('idle'); return }
      setOverlayError(msg)
      setOverlayStatus('error')
    }
  }, [currentBook, sorted, acts, frontDataUrl, backDataUrl, structureLabel, isPremium])

  if (!currentBook) return <></>

  return (
    <div className="fixed inset-0 z-[9999] bg-white flex flex-col">
      <div className="h-7 flex-shrink-0 bg-[var(--bg)]" />

      {/* Header */}
      <div className="flex items-center px-5 h-[48px] border-b border-[var(--border)] flex-shrink-0 gap-3 bg-[var(--bg)]">
        <div className="flex-1 min-w-0">
          <div className="text-[var(--fg)] text-[14px] font-semibold tracking-tight">
            Read &amp; Export
          </div>
          <div className="text-[var(--fg-muted)] text-[11px] truncate">
            {bookName} &nbsp;·&nbsp; {fmt.widthIn}&quot; × {fmt.heightIn}&quot; &nbsp;·&nbsp; {sorted.length} chapter{sorted.length !== 1 ? 's' : ''}
          </div>
        </div>

        <div className="flex gap-2 flex-shrink-0">
          <button
            onClick={handleExportWord}
            disabled={isExporting}
            className="text-white text-[13px] font-medium bg-[#2563eb] rounded-md px-4 py-1.5 flex items-center gap-1.5 transition-colors hover:bg-[#1d4ed8] disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
              <polyline points="14 2 14 8 20 8"/>
              <line x1="16" y1="13" x2="8" y2="13"/>
              <line x1="16" y1="17" x2="8" y2="17"/>
              <polyline points="10 9 9 9 8 9"/>
            </svg>
            Export Word{!isPremium && <span className="ml-1 text-[10px] bg-white/20 rounded px-1 py-0.5">PRO</span>}
          </button>
          <button
            onClick={() => {
              if (!isPremium) { setPaywallIntent('epub'); setShowPaywall(true); return }
              setCoverPickerOpen(true)
            }}
            disabled={isExporting || coverPickerOpen}
            className="text-white text-[13px] font-medium bg-[#7c3aed] rounded-md px-4 py-1.5 flex items-center gap-1.5 transition-colors hover:bg-[#6d28d9] disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/>
            </svg>
            Export ePub{!isPremium && <span className="ml-1 text-[10px] bg-white/20 rounded px-1 py-0.5">PRO</span>}
          </button>
          <button
            onClick={onClose}
            disabled={isExporting}
            className="text-[var(--fg-muted)] text-[13px] font-medium border border-[var(--border)] rounded-md px-4 py-1.5 transition-colors hover:bg-[var(--bg-subtle)] hover:text-[var(--fg)] disabled:opacity-50"
          >
            Close
          </button>
        </div>
      </div>

      {/* Scrollable preview */}
      <div className="flex-1 overflow-y-auto">
        <BookScrollPreview sorted={sorted} acts={acts} structureLabel={structureLabel} />
      </div>

      {/* Cover picker */}
      {coverPickerOpen && (
        <div className="absolute inset-0 z-50 flex items-center justify-center"
          style={{ background: 'rgba(0,0,0,0.45)', backdropFilter: 'blur(6px)', WebkitBackdropFilter: 'blur(6px)' }}>
          <div className="flex flex-col rounded-3xl shadow-2xl px-8 py-8"
            style={{ width: 340, background: 'var(--bg-card)', border: '1px solid var(--border)', animation: 'pmCardIn 0.22s cubic-bezier(0.34,1.56,0.64,1) both' }}>
            <p className="text-[15px] font-semibold text-[var(--fg)] mb-1">Include cover in ePub?</p>
            <p className="text-[12px] text-[var(--fg-muted)] mb-5">Choose what cover pages to include.</p>
            {(['front', 'both', 'none'] as CoverOption[]).map((opt) => {
              const labels: Record<CoverOption, string> = {
                front: 'Front cover only',
                both: 'Front + Back cover',
                none: 'No cover',
              }
              const disabled = (opt === 'front' || opt === 'both') && !frontDataUrl
              const isSelected = coverOption === opt && !disabled
              return (
                <button key={opt} onClick={() => !disabled && setCoverOption(opt)} disabled={disabled}
                  className={`flex items-center gap-3 px-4 py-3 rounded-xl mb-2 text-left transition-colors ${disabled ? 'opacity-40 cursor-not-allowed' : isSelected ? 'bg-[var(--bg-subtle)]' : 'hover:bg-[var(--bg-subtle)]'}`}>
                  <div className={`w-4 h-4 rounded-full border-2 flex-shrink-0 flex items-center justify-center transition-colors ${isSelected ? 'border-[#7c3aed]' : 'border-[var(--border)]'}`}>
                    {isSelected && <div className="w-2 h-2 rounded-full bg-[#7c3aed]" />}
                  </div>
                  <span className="text-[13px] text-[var(--fg)]">{labels[opt]}</span>
                </button>
              )
            })}
            <div className="flex gap-2.5 mt-3">
              <button onClick={() => setCoverPickerOpen(false)}
                className="flex-1 py-2.5 rounded-xl text-sm font-medium border border-[var(--border)] text-[var(--fg-muted)] hover:bg-[var(--bg-subtle)] transition-colors">
                Cancel
              </button>
              <button onClick={() => handleExportEpub(coverOption)}
                className="flex-1 py-2.5 rounded-xl text-sm font-semibold bg-[#7c3aed] text-white hover:bg-[#6d28d9] transition-colors shadow-sm">
                Export
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Export overlay */}
      {(overlayStatus === 'processing' || overlayStatus === 'done' || overlayStatus === 'error') && (
        <div className="absolute inset-0 z-50 flex items-center justify-center"
          style={{ background: 'rgba(0,0,0,0.45)', backdropFilter: 'blur(6px)', WebkitBackdropFilter: 'blur(6px)' }}>
          <style>{`@keyframes pmCardIn { from { opacity:0; transform:scale(0.9) translateY(8px) } to { opacity:1; transform:scale(1) translateY(0) } } @keyframes pmCheck { from { stroke-dashoffset: 36 } to { stroke-dashoffset: 0 } }`}</style>
          <div className="flex flex-col items-center text-center rounded-3xl shadow-2xl px-10 py-10"
            style={{ width: 340, background: 'var(--bg-card)', border: '1px solid var(--border)', animation: 'pmCardIn 0.22s cubic-bezier(0.34,1.56,0.64,1) both' }}>

            {overlayStatus === 'processing' && (
              <>
                <div className="mb-5">
                  <svg className="animate-spin" width="44" height="44" viewBox="0 0 44 44" fill="none">
                    <circle cx="22" cy="22" r="18" stroke="var(--border)" strokeWidth="3" />
                    <path d="M22 4 A18 18 0 0 1 40 22" stroke="#2563eb" strokeWidth="3" strokeLinecap="round" />
                  </svg>
                </div>
                <p className="text-base font-semibold text-[var(--fg)] mb-1">Compiling your book</p>
                <p className="text-sm text-[var(--fg-muted)]">Saving your book…</p>
              </>
            )}

            {overlayStatus === 'done' && overlayResult && (
              <>
                <div className="mb-5">
                  <svg width="52" height="52" viewBox="0 0 52 52" fill="none">
                    <circle cx="26" cy="26" r="24" fill="#dcfce7" stroke="#22c55e" strokeWidth="2" />
                    <path d="M16 26l8 8 12-14" stroke="#22c55e" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round"
                      style={{ strokeDasharray: 36, strokeDashoffset: 0, animation: 'pmCheck 0.4s 0.1s ease both' }} />
                  </svg>
                </div>
                <p className="text-base font-semibold text-[var(--fg)] mb-1">Export Complete</p>
                <p className="text-xs text-[var(--fg-muted)] mb-6 max-w-[220px] break-all leading-relaxed">
                  {overlayResult.filePath.split('/').pop()}
                </p>
                <div className="flex items-center gap-2.5 w-full">
                  <button onClick={() => window.electron.shell.revealFile(overlayResult.filePath)}
                    className="flex-1 py-2.5 rounded-xl text-sm font-medium border border-[var(--border)] text-[var(--fg-muted)] hover:bg-[var(--bg-subtle)] transition-colors">
                    Show in Finder
                  </button>
                  <button onClick={() => window.electron.shell.openFile(overlayResult.filePath)}
                    className="flex-1 py-2.5 rounded-xl text-sm font-semibold bg-[#2563eb] text-white hover:bg-[#1d4ed8] transition-colors shadow-sm">
                    Open
                  </button>
                </div>
                <button onClick={() => { setOverlayStatus('idle'); setOverlayResult(null) }}
                  className="mt-3 text-xs text-[var(--fg-faint)] hover:text-[var(--fg)] transition-colors">Done</button>
              </>
            )}

            {overlayStatus === 'error' && (
              <>
                <div className="mb-5">
                  <svg width="52" height="52" viewBox="0 0 52 52" fill="none">
                    <circle cx="26" cy="26" r="24" fill="#fef2f2" stroke="#ef4444" strokeWidth="2" />
                    <path d="M18 18l16 16M34 18l-16 16" stroke="#ef4444" strokeWidth="2.8" strokeLinecap="round" />
                  </svg>
                </div>
                <p className="text-base font-semibold text-[var(--fg)] mb-1">Export Failed</p>
                <p className="text-xs text-red-500 mb-6">{overlayError || 'Something went wrong.'}</p>
                <button onClick={() => setOverlayStatus('idle')}
                  className="px-6 py-2.5 rounded-xl text-sm font-medium border border-[var(--border)] text-[var(--fg-muted)] hover:bg-[var(--bg-subtle)] transition-colors">
                  Dismiss
                </button>
              </>
            )}
          </div>
        </div>
      )}

      {/* Paywall */}
      {showPaywall && (
        <PremiumPaywallModal
          onClose={() => { setShowPaywall(false); setPaywallIntent(null) }}
          onUnlocked={() => {
            setShowPaywall(false)
            // Auto-trigger the intended export after unlock
            if (paywallIntent === 'word') handleExportWord()
            else if (paywallIntent === 'epub') setCoverPickerOpen(true)
            setPaywallIntent(null)
          }}
        />
      )}
    </div>
  )
}

// ── Continuous scroll reader preview ─────────────────────────────────────────

function BookScrollPreview({
  sorted, acts, structureLabel,
}: {
  sorted: Chapter[]
  acts: Act[]
  structureLabel: string
}): React.JSX.Element {
  const { currentBook } = useBookStore()
  const bs = currentBook?.style ?? DEFAULT_BOOK_STYLE
  const fontFamily = bs.fontFamily ?? DEFAULT_BOOK_STYLE.fontFamily
  const fontSize   = bs.fontSize   ?? DEFAULT_BOOK_STYLE.fontSize

  const cssVars = {
    '--editor-font-family': fontFamily,
    '--editor-font-size':   `${fontSize}pt`,
    '--editor-line-height': String(bs.lineSpacing ?? DEFAULT_BOOK_STYLE.lineSpacing),
  } as React.CSSProperties

  const labelCap = structureLabel === 'section' ? 'Section' : 'Act'

  const sortedActs = [...acts].sort((a, b) => a.order - b.order)
  const actMap = new Map(sortedActs.map((a, i) => [a.id, { act: a, num: i + 1 }]))

  const bodyChapters  = sorted.filter(c => getSection(c.kind) === 1)
  const totalWords    = bodyChapters.reduce((s, c) => s + (c.wordCount ?? 0), 0)

  type Item =
    | { k: 'act-sep'; act: Act; actNum: number; isFirst: boolean }
    | { k: 'divider' }
    | { k: 'body-ch'; ch: Chapter; chNum: number }

  const items: Item[] = []
  const insertedActIds = new Set<string>()
  let chNum = 0
  bodyChapters.forEach((ch, i) => {
    const needActSep = !!(ch.actId && actMap.has(ch.actId) && !insertedActIds.has(ch.actId))
    if (needActSep) {
      insertedActIds.add(ch.actId!)
      const info = actMap.get(ch.actId!)!
      items.push({ k: 'act-sep', act: info.act, actNum: info.num, isFirst: items.length === 0 })
    } else if (i > 0) {
      items.push({ k: 'divider' })
    }
    if (!ch.kind || ch.kind === 'chapter') chNum++
    items.push({ k: 'body-ch', ch, chNum: (!ch.kind || ch.kind === 'chapter') ? chNum : 0 })
  })

  const W = 680  // max content width

  return (
    <div style={{ background: '#f5f0eb', minHeight: '100%', paddingBottom: 80 }}>
      <style>{`
        .book-reader .ProseMirror p { text-indent: 1.5em; text-align: justify; margin-bottom: 0; }
        .book-reader .ProseMirror p:first-child { text-indent: 0; }
        .book-reader .ProseMirror h1 + p,
        .book-reader .ProseMirror h2 + p,
        .book-reader .ProseMirror h3 + p { text-indent: 0; }
        .book-reader .ProseMirror h1,
        .book-reader .ProseMirror h2,
        .book-reader .ProseMirror h3 { text-indent: 0; margin: 0.8em 0 0.4em; }
        .book-reader table { border-collapse: collapse; width: 100%; margin: 8px 0; }
        .book-reader td, .book-reader th { border: 1px solid #d0cbc5; padding: 6px 10px; font-size: inherit; text-align: left; }
        .book-reader th { font-weight: 600; background: #ece8e3; }
        .book-reader img { max-width: 100%; height: auto; }
        .book-reader .ProseMirror ul, .book-reader .ProseMirror ol { padding-left: 1.6em; margin: 0.5em 0; }
        .book-reader .ProseMirror li { text-indent: 0; margin-bottom: 0.2em; }
        .book-reader .ProseMirror blockquote { border-left: 3px solid #d0cbc5; margin: 0.8em 0; padding-left: 1em; color: #555; }
      `}</style>

      {/* Info banner — always shown: this view renders body chapters only */}
      <div style={{ maxWidth: W, margin: '0 auto', padding: '28px 48px 0' }}>
        <div style={{
          display: 'flex', alignItems: 'flex-start', gap: 12,
          background: 'rgba(139,120,102,0.08)',
          border: '1px solid rgba(139,120,102,0.18)',
          borderRadius: 10, padding: '12px 16px',
        }}>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#8b7866" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, marginTop: 1 }}>
            <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/>
            <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/>
          </svg>
          <div>
            <p style={{ fontSize: 11, fontWeight: 600, color: '#6b5c4e', margin: '0 0 2px', letterSpacing: '0.01em' }}>
              Reading view shows body chapters only
            </p>
            <p style={{ fontSize: 11, color: '#9c8878', margin: 0, lineHeight: 1.5 }}>
              Your front matter and back matter are not shown here, but will be fully included in your Word and ePub exports.
            </p>
          </div>
        </div>
      </div>

      {items.map((item, idx) => {
        if (item.k === 'act-sep') {
          const { act, actNum, isFirst } = item
          const eyebrow = `${labelCap} ${ACT_ROMAN_WORDS[actNum] ?? String(actNum)}`
          return (
            <div key={`act-${act.id}`} style={{
              maxWidth: W, margin: '0 auto', padding: '56px 48px 36px', textAlign: 'center',
              borderTop: isFirst ? 'none' : '1px solid #d5cfc8',
            }}>
              <p style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.3em', textTransform: 'uppercase', color: '#aaa', margin: '0 0 14px' }}>
                {eyebrow}
              </p>
              <div style={{ width: 36, height: 1, background: '#ccc', margin: '0 auto 18px' }} />
              {act.title && (
                <p style={{ fontFamily: `${fontFamily}, Georgia, serif`, fontSize: fontSize * 1.8 + 'pt', fontWeight: 700, color: '#1a1a1a', lineHeight: 1.2, margin: '0 0 10px' }}>
                  {act.title}
                </p>
              )}
              {act.subtitle && (
                <p style={{ fontFamily: `${fontFamily}, Georgia, serif`, fontSize: fontSize + 'pt', fontStyle: 'italic', color: '#666', lineHeight: 1.6, margin: 0 }}>
                  {act.subtitle}
                </p>
              )}
            </div>
          )
        }

        if (item.k === 'divider') {
          return (
            <div key={`div-${idx}`} style={{ maxWidth: W, margin: '0 auto', padding: '4px 48px 4px', textAlign: 'center' }}>
              <span style={{ color: '#c5bdb6', letterSpacing: '0.6em', fontSize: 12 }}>· · ·</span>
            </div>
          )
        }

        if (item.k === 'body-ch') {
          const { ch, chNum } = item
          const html = chapterToHtml(ch.content as object)

          if (ch.kind === 'part-break') {
            return (
              <div key={ch.id} style={{ maxWidth: W, margin: '0 auto', padding: '48px 48px 40px', textAlign: 'center' }}>
                <div style={{ width: 48, height: 1, background: '#ccc', margin: '0 auto 20px' }} />
                {ch.title && (
                  <p style={{ fontFamily: `${fontFamily}, Georgia, serif`, fontSize: fontSize * 1.4 + 'pt', fontWeight: 700, color: '#1a1a1a', margin: '0 0 8px', lineHeight: 1.25 }}>
                    {ch.title}
                  </p>
                )}
                <div style={{ width: 48, height: 1, background: '#ccc', margin: '12px auto 0' }} />
              </div>
            )
          }

          const badge = chNum > 0
            ? `Chapter ${chNum}`
            : (ch.kind?.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase()) ?? 'Chapter')

          return (
            <article key={ch.id} style={{ maxWidth: W, margin: '0 auto', padding: '40px 48px 48px' }}>
              <div style={{ marginBottom: 28, textAlign: 'center' }}>
                <p style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.16em', textTransform: 'uppercase', color: '#8c7e72', margin: '0 0 10px' }}>
                  {badge}
                </p>
                {ch.title && (
                  <p style={{ fontFamily: `${fontFamily}, Georgia, serif`, fontSize: fontSize * 1.6 + 'pt', fontWeight: 700, color: '#1a1a1a', lineHeight: 1.25, margin: '0 0 16px' }}>
                    {ch.title}
                  </p>
                )}
                <div style={{ width: 32, height: 1, background: '#ccc', margin: '0 auto' }} />
              </div>
              <div className="tiptap-editor book-reader" style={cssVars}>
                <div className="ProseMirror" style={{ color: '#1c1917' }}
                  dangerouslySetInnerHTML={{ __html: html }} />
              </div>
            </article>
          )
        }

        return null
      })}

      {/* Footer */}
      <div style={{ maxWidth: W, margin: '0 auto', padding: '48px 48px 0', textAlign: 'center', borderTop: '1px solid #d5cfc8' }}>
        <span style={{ color: '#c5bdb6', letterSpacing: '0.6em', fontSize: 12 }}>· · ·</span>
        <p style={{ fontSize: 13, color: '#b0a89e', fontStyle: 'italic', margin: '12px 0 4px' }}>— End of Manuscript —</p>
        <p style={{ fontSize: 11, color: '#c5bdb6', margin: 0 }}>
          {totalWords.toLocaleString()} words &nbsp;·&nbsp; {bodyChapters.length} chapter{bodyChapters.length !== 1 ? 's' : ''}
        </p>
      </div>
    </div>
  )
}
