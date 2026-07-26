import React, { useState } from 'react'
import { useBookStore } from '../store/bookStore'
import { useCoverStore } from '../store/coverStore'
import { BOOK_FORMATS } from '../constants/bookFormats'
import { Chapter, Act, BookStyle, DEFAULT_BOOK_STYLE } from '../types'
import { chapterToHtml, getSection } from '../utils/pdfExport'

const SECTION_LABELS: Record<0 | 1 | 2, string> = {
  0: 'Front Matter',
  1: 'Body',
  2: 'Back Matter',
}

// ─── Roman numerals ───────────────────────────────────────────────────────────
function toRoman(n: number): string {
  if (n <= 0) return ''
  const vals = [1000,900,500,400,100,90,50,40,10,9,5,4,1]
  const syms = ['m','cm','d','cd','c','xc','l','xl','x','ix','v','iv','i']
  let result = ''
  for (let i = 0; i < vals.length; i++) {
    while (n >= vals[i]) { result += syms[i]; n -= vals[i] }
  }
  return result
}

// ─── Constants ────────────────────────────────────────────────────────────────
const THUMB_SCALE   = 0.22
const PREVIEW_SCALE = 0.45

// ─── ExportOptions type ───────────────────────────────────────────────────────
interface ExportOptions {
  includePageNumbers: boolean
}

// ─── PageCard (thumbnail strip) ───────────────────────────────────────────────
function PageCard({
  label,
  badge,
  subLabel,
  kindLabel,
  children,
  w,
  h,
  onMoveUp,
  onMoveDown,
  canMoveUp,
  canMoveDown,
}: {
  label: string
  badge?: string
  subLabel?: string
  kindLabel?: string
  children: React.ReactNode
  w: number
  h: number
  onMoveUp?: () => void
  onMoveDown?: () => void
  canMoveUp?: boolean
  canMoveDown?: boolean
}): React.JSX.Element {
  const hasArrows = onMoveUp !== undefined || onMoveDown !== undefined
  return (
    <div className="flex flex-col items-center gap-1" style={{ width: w }}>
      {/* Page thumbnail */}
      <div
        className="flex-shrink-0 bg-white rounded overflow-hidden relative"
        style={{
          width: w,
          height: h,
          boxShadow: 'var(--shadow-card-md)'
        }}
      >
        {children}
        {badge && (
          <div
            className="absolute bottom-1 right-1 bg-black/40 text-white rounded px-1"
            style={{ fontSize: 6, lineHeight: '11px' }}
          >
            {badge}
          </div>
        )}
      </div>

      {/* Controls row: label + arrows */}
      {hasArrows ? (
        <div className="flex items-center justify-between w-full px-0.5" style={{ minHeight: 18 }}>
          <div className="flex flex-col flex-1 mr-1 min-w-0">
            <span className="text-[9px] text-[var(--fg-faint)] truncate" title={label}>
              {label}
            </span>
            {kindLabel && (
              <span className="text-[8px] text-[var(--fg-faint)] italic opacity-70 truncate">{kindLabel}</span>
            )}
            {subLabel && (
              <span className="text-[8px] text-[var(--fg-faint)] opacity-60 truncate">{subLabel}</span>
            )}
          </div>
          <div className="flex gap-0.5 flex-shrink-0">
            <button
              onClick={onMoveUp}
              disabled={!canMoveUp}
              title="Move left"
              className="w-5 h-5 flex items-center justify-center rounded bg-[var(--bg-card)] border border-[var(--border)] text-[var(--fg-muted)] hover:bg-[var(--bg-subtle)] disabled:opacity-20 disabled:cursor-not-allowed text-[10px] leading-none shadow-sm transition-colors"
            >
              ←
            </button>
            <button
              onClick={onMoveDown}
              disabled={!canMoveDown}
              title="Move right"
              className="w-5 h-5 flex items-center justify-center rounded bg-[var(--bg-card)] border border-[var(--border)] text-[var(--fg-muted)] hover:bg-[var(--bg-subtle)] disabled:opacity-20 disabled:cursor-not-allowed text-[10px] leading-none shadow-sm transition-colors"
            >
              →
            </button>
          </div>
        </div>
      ) : (
        <div className="flex flex-col items-center w-full px-0.5">
          <span className="text-[9px] text-[var(--fg-faint)] truncate w-full text-center">{label}</span>
          {kindLabel && (
            <span className="text-[8px] text-[var(--fg-faint)] italic opacity-70">{kindLabel}</span>
          )}
          {subLabel && (
            <span className="text-[8px] text-[var(--fg-faint)] opacity-60">{subLabel}</span>
          )}
        </div>
      )}
    </div>
  )
}

// ─── ChapterPageContent ───────────────────────────────────────────────────────
function ChapterPageContent({
  chapter,
  scale,
  pageW,
  bookStyle,
  pw,
  ph,
}: {
  chapter: Chapter
  scale: number
  pageW: number
  bookStyle: BookStyle
  pw: number
  ph: number
}): React.JSX.Element {
  const html = chapterToHtml(chapter.content as object)
  const isFrontMatter = getSection(chapter.kind) === 0

  const mTop    = bookStyle.marginTop    * 72
  const mBottom = bookStyle.marginBottom * 72
  const mInner  = bookStyle.marginInner  * 72
  const mOuter  = bookStyle.marginOuter  * 72
  const fullW   = pageW * 72

  // Half-title: just book title centered in full-scale wrapper
  if (chapter.kind === 'half-title') {
    return (
      <div style={{ width: pw, height: ph, overflow: 'hidden', position: 'relative', background: '#ffffff' }}>
        <div style={{
          position: 'absolute', top: 0, left: 0,
          width: fullW, height: ph / scale,
          transform: `scale(${scale})`, transformOrigin: 'top left',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontFamily: `${bookStyle.fontFamily}, Georgia, serif`, color: '#1c1917',
        }}>
          <div style={{ textAlign: 'center', fontSize: 13, fontWeight: 700, letterSpacing: '-0.01em' }}>
            {chapter.title}
          </div>
        </div>
      </div>
    )
  }

  // All chapter types: single full-scale wrapper so title + content transform together
  return (
    <div style={{ width: pw, height: ph, overflow: 'hidden', position: 'relative', background: '#ffffff' }}>
      <div style={{
        position: 'absolute', top: 0, left: 0,
        width: fullW,
        transform: `scale(${scale})`, transformOrigin: 'top left',
        fontFamily: `${bookStyle.fontFamily}, Georgia, serif`, color: '#1c1917',
      }}>
        {/* Chapter title header — uses full-size book margins so it aligns with body text */}
        {chapter.title && !isFrontMatter && (
          <div style={{
            paddingTop: Math.round(mTop * 0.4),
            paddingBottom: 10,
            paddingLeft: mInner,
            paddingRight: mOuter,
            fontSize: 14, fontWeight: 700,
            textAlign: 'center',
            borderBottom: '1px solid #f0ebe5',
            background: '#ffffff',
          }}>
            {chapter.title}
          </div>
        )}
        {/* Page content */}
        <div
          style={{
            padding: isFrontMatter
              ? `${mTop * 0.5}px ${mOuter}px ${mBottom * 0.5}px ${mInner}px`
              : `16px ${mOuter}px ${mBottom * 0.5}px ${mInner}px`,
            fontSize: bookStyle.fontSize, lineHeight: bookStyle.lineSpacing,
            overflow: 'hidden',
          }}
          dangerouslySetInnerHTML={{ __html: html }}
        />
      </div>
    </div>
  )
}

// ─── ActSeparatorPageContent (thumbnail + preview) ────────────────────────────
function ActSeparatorPageContent({
  actNumber,
  actTitle,
  scale,
  pw,
  ph,
  bookStyle,
}: {
  actNumber: number
  actTitle: string
  scale: number
  pw: number
  ph: number
  bookStyle: BookStyle
}): React.JSX.Element {
  const ROMAN_WORDS = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten']
  const eyebrow = `ACT ${(ROMAN_WORDS[actNumber] ?? String(actNumber)).toUpperCase()}`
  const fullW = pw / scale
  const fullH = ph / scale
  return (
    <div style={{ width: pw, height: ph, overflow: 'hidden', position: 'relative', background: '#ffffff' }}>
      <div style={{
        position: 'absolute', top: 0, left: 0,
        width: fullW, height: fullH,
        transform: `scale(${scale})`, transformOrigin: 'top left',
        display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center', gap: 10,
        fontFamily: `${bookStyle.fontFamily}, Georgia, serif`,
      }}>
        <div style={{ fontSize: 9, letterSpacing: '0.2em', textTransform: 'uppercase', color: '#888' }}>
          {eyebrow}
        </div>
        {actTitle && (
          <div style={{ fontSize: 22, fontWeight: 600, color: '#1c1917', textAlign: 'center' }}>
            {actTitle}
          </div>
        )}
      </div>
    </div>
  )
}

// ─── PreviewPageCard ──────────────────────────────────────────────────────────
function PreviewPageCard({
  label,
  pageNum,
  previewW,
  previewH,
  children,
}: {
  label: string
  pageNum: string
  previewW: number
  previewH: number
  children: React.ReactNode
}): React.JSX.Element {
  return (
    <div className="flex flex-col items-center gap-2">
      <div className="flex items-center gap-3">
        <span className="text-xs font-medium text-[var(--fg-muted)]">{label}</span>
        {pageNum && (
          <span className="text-[10px] text-[var(--fg-faint)] bg-[var(--bg-subtle)] px-1.5 py-0.5 rounded">
            p. {pageNum}
          </span>
        )}
      </div>
      <div
        className="relative bg-white overflow-hidden"
        style={{
          width: previewW,
          height: previewH,
          boxShadow: '0 4px 24px rgba(0,0,0,0.18), 0 1px 6px rgba(0,0,0,0.10)',
          borderRadius: 2,
        }}
      >
        {children}
      </div>
    </div>
  )
}

// ─── ExportTab ───────────────────────────────────────────────────────────────
export default function ExportTab(): React.JSX.Element {
  const { currentBook, chapters, acts, saveManyChapters } = useBookStore()
  const { frontDataUrl, backDataUrl } = useCoverStore()
  const [showPreviewModal, setShowPreviewModal] = useState(false)
  const [exportOptions, setExportOptions] = useState<ExportOptions>({
    includePageNumbers: true,
  })


  if (!currentBook) return <></>

  const style: BookStyle = currentBook.style ?? DEFAULT_BOOK_STYLE

  const fmt =
    (currentBook.format ? BOOK_FORMATS[currentBook.format] : undefined) ??
    BOOK_FORMATS['trade-paperback']
  const pageW = fmt.widthIn
  const pageH = fmt.heightIn

  const thumbW = Math.round(pageW * 72 * THUMB_SCALE)
  const thumbH = Math.round(pageH * 72 * THUMB_SCALE)
  const previewW = Math.round(pageW * 72 * PREVIEW_SCALE)
  const previewH = Math.round(pageH * 72 * PREVIEW_SCALE)

  // ── Section-aware sort: Front → Body → Back, then by order within section ──
  const sortedChapters = [...chapters].sort((a, b) => {
    const secA = getSection(a.kind)
    const secB = getSection(b.kind)
    if (secA !== secB) return secA - secB
    return (a.order ?? 0) - (b.order ?? 0)
  })

  // ── Build section groups (used by both thumbnail strip and modal) ───────────
  const sections: Array<{ label: string; sec: 0 | 1 | 2; items: Array<{ chapter: Chapter; globalIdx: number }> }> = []
  const sectionMap: Record<number, typeof sections[0]> = {}
  sortedChapters.forEach((chapter, globalIdx) => {
    const sec = getSection(chapter.kind)
    if (!sectionMap[sec]) {
      sectionMap[sec] = { label: SECTION_LABELS[sec], sec, items: [] }
      sections.push(sectionMap[sec])
    }
    sectionMap[sec].items.push({ chapter, globalIdx })
  })

  // ── Page number helpers ─────────────────────────────────────────────────────
  const frontPages = sortedChapters.filter((c) => getSection(c.kind) === 0)
  const bodyPages  = sortedChapters.filter((c) => getSection(c.kind) !== 0)

  function getKindLabel(kind?: string): string {
    if (!kind || kind === 'chapter') return ''
    const labels: Record<string, string> = {
      'half-title': 'Half Title', 'title-page': 'Title Page', 'copyright': 'Copyright',
      'dedication': 'Dedication', 'toc': 'Table of Contents', 'part-break': 'Part Break',
      'appendix': 'Appendix', 'glossary': 'Glossary', 'bibliography': 'Bibliography',
      'index': 'Index', 'author-bio': 'Author Bio',
    }
    return labels[kind] ? `(${labels[kind]})` : `(${kind})`
  }

  function getSubLabel(chapter: Chapter): string {
    const wc = chapter.wordCount
    if (!wc) return ''
    const pages = Math.max(1, Math.ceil(wc / 250))
    return `~${wc.toLocaleString()} words · ~${pages} ${pages === 1 ? 'page' : 'pages'}`
  }

  function getPageBadge(chapter: Chapter): string {
    if (!exportOptions.includePageNumbers) return ''
    const isFront = getSection(chapter.kind) === 0
    if (isFront) {
      const idx = frontPages.findIndex((c) => c.id === chapter.id)
      return idx >= 0 ? toRoman(idx + 1) : ''
    }
    const idx = bodyPages.findIndex((c) => c.id === chapter.id)
    return idx >= 0 ? String(idx + 1) : ''
  }

  // ── Move chapter: swap two explicit globalIdx positions ─────────────────────
  const moveChapter = async (idxA: number, idxB: number): Promise<void> => {
    const a = sortedChapters[idxA]
    const b = sortedChapters[idxB]
    if (!a || !b || getSection(a.kind) !== getSection(b.kind)) return
    // Normalize all orders to guaranteed unique sequential values, then swap
    const withOrders = sortedChapters.map((c, i) => ({ ...c, order: i * 10 }))
    const updated = withOrders.map((c, i) =>
      i === idxA ? { ...c, order: idxB * 10 }
        : i === idxB ? { ...c, order: idxA * 10 }
          : c
    )
    await saveManyChapters(updated)
  }


  const coverHint = !frontDataUrl && !backDataUrl
    ? 'Tip: Visit Cover Design tab to design front and back covers before exporting.'
    : !frontDataUrl
      ? 'Tip: Front cover not yet designed — visit Cover Design tab.'
      : !backDataUrl
        ? 'Tip: Back cover not yet designed — visit Cover Design tab and switch to Back Cover.'
        : null

  // ── Section counts for sidebar ──────────────────────────────────────────────
  const sectionCounts = {
    front: frontPages.length,
    body: bodyPages.length,
    back: sortedChapters.filter((c) => getSection(c.kind) === 2).length,
  }

  return (
    <div className="flex flex-col h-full bg-[var(--bg)]">
      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div className="flex-shrink-0 flex items-center justify-between px-6 py-4 border-b border-[var(--border)]">
        <div>
          <h2 className="text-base font-semibold text-[var(--fg)]">Book Export</h2>
          <p className="text-xs text-[var(--fg-muted)] mt-0.5">
            {fmt.name} · {fmt.widthIn}" × {fmt.heightIn}" · {sortedChapters.length} section
            {sortedChapters.length !== 1 ? 's' : ''}
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowPreviewModal(true)}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold shadow-sm transition-colors bg-[var(--accent)] text-white hover:bg-[var(--accent-hover)]"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24"
              fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/>
              <line x1="3" y1="9" x2="21" y2="9"/>
              <line x1="9" y1="21" x2="9" y2="9"/>
            </svg>
            Preview &amp; Export
          </button>
        </div>
      </div>

      {coverHint && (
        <div className="flex-shrink-0 mx-6 mt-4 px-4 py-3 rounded-xl bg-amber-50 border border-amber-200 text-xs text-amber-800">
          {coverHint}
        </div>
      )}

      {/* ── Print Preview (thumbnails) ─────────────────────────────────────── */}
      <div className="flex-1 overflow-auto p-6">
        <div className="flex items-center justify-between mb-5">
          <div className="text-[11px] font-semibold text-[var(--fg-faint)] uppercase tracking-widerr">
            Print Preview
          </div>
          <div className="text-[10px] text-[var(--fg-faint)]">
            Use ← → to reorder pages within each section
          </div>
        </div>

        {sortedChapters.length === 0 && !frontDataUrl && !backDataUrl ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <svg xmlns="http://www.w3.org/2000/svg" width="40" height="40" viewBox="0 0 24 24"
              fill="none" stroke="#d8d2ca" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="mb-4">
              <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z" />
              <polyline points="14 2 14 8 20 8" />
            </svg>
            <p className="text-sm text-[var(--fg-faint)]">No content yet</p>
            <p className="text-xs text-[var(--fg-faint)] mt-1">
              Add chapters in the Content tab and design covers in Cover Design.
            </p>
          </div>
        ) : (
          <div className="space-y-8">
            {/* Covers row */}
            <div>
              <div className="text-[9px] uppercase tracking-widest text-[var(--fg-faint)] font-semibold mb-3">Covers</div>
              <div className="flex flex-wrap gap-4">
                <PageCard label="Front Cover" w={thumbW} h={thumbH}>
                  {frontDataUrl ? (
                    <img src={frontDataUrl} className="w-full h-full object-cover" alt="Front cover" />
                  ) : (
                    <div className="w-full h-full flex flex-col items-center justify-center bg-[#f0ece4] gap-1">
                      <span className="text-[11px] font-medium text-[var(--accent)]">{currentBook.name.charAt(0)}</span>
                      <span className="text-[8px] text-[#a8a29e]">Not designed</span>
                    </div>
                  )}
                </PageCard>
                <PageCard label="Back Cover" w={thumbW} h={thumbH}>
                  {backDataUrl ? (
                    <img src={backDataUrl} className="w-full h-full object-cover" alt="Back cover" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center bg-[#f0ece4]">
                      <span className="text-[8px] text-[#a8a29e]">Not designed</span>
                    </div>
                  )}
                </PageCard>
              </div>
            </div>

            {/* Chapters grouped by section — same order as modal */}
            {sections.map((section) => {
              const sortedActs: Act[] = [...acts].sort((a, b) => a.order - b.order)
              const hasActs = sortedActs.length > 0 && section.sec === 1

              // For body matter with acts: insert act separator thumbnails
              if (hasActs) {
                return (
                  <div key={section.label}>
                    <div className="text-[9px] uppercase tracking-widest text-[var(--fg-faint)] font-semibold mb-3">
                      {section.label}
                      <span className="ml-2 normal-case font-normal opacity-60">
                        {section.items.length} {section.items.length === 1 ? 'page' : 'pages'}
                      </span>
                    </div>
                    <div className="space-y-5">
                      {sortedActs.map((act, idx) => {
                        const actItems = section.items.filter(({ chapter }) => chapter.actId === act.id)
                        if (actItems.length === 0) return null
                        return (
                          <div key={act.id}>
                            <div className="text-[9px] text-[var(--accent)]/80 font-medium mb-2 italic">Act {idx + 1} · {act.title || 'Untitled'}</div>
                            <div className="flex flex-wrap gap-4 items-end">
                              <PageCard label={`Act ${idx + 1}`} kindLabel="Act Page" w={thumbW} h={thumbH}>
                                <ActSeparatorPageContent actNumber={idx + 1} actTitle={act.title} scale={THUMB_SCALE} pw={thumbW} ph={thumbH} bookStyle={style} />
                              </PageCard>
                              {actItems.map(({ chapter, globalIdx }) => {
                                const sectionPos = section.items.findIndex((it) => it.globalIdx === globalIdx)
                                return (
                                  <PageCard
                                    key={chapter.id}
                                    label={chapter.title || 'Untitled'}
                                    badge={getPageBadge(chapter) || undefined}
                                    kindLabel={getKindLabel(chapter.kind) || undefined}
                                    subLabel={getSubLabel(chapter) || undefined}
                                    w={thumbW} h={thumbH}
                                    onMoveUp={() => moveChapter(globalIdx, section.items[sectionPos - 1].globalIdx)}
                                    onMoveDown={() => moveChapter(globalIdx, section.items[sectionPos + 1].globalIdx)}
                                    canMoveUp={sectionPos > 0}
                                    canMoveDown={sectionPos < section.items.length - 1}
                                  >
                                    <ChapterPageContent chapter={chapter} scale={THUMB_SCALE} pageW={pageW} bookStyle={style} pw={thumbW} ph={thumbH} />
                                  </PageCard>
                                )
                              })}
                            </div>
                          </div>
                        )
                      })}
                      {(() => {
                        const ungrouped = section.items.filter(({ chapter }) => !chapter.actId || !acts.find((a) => a.id === chapter.actId))
                        if (ungrouped.length === 0) return null
                        return (
                          <div key="ungrouped">
                            <div className="text-[9px] text-[var(--fg-faint)] font-medium mb-2 italic">Ungrouped</div>
                            <div className="flex flex-wrap gap-4">
                              {ungrouped.map(({ chapter, globalIdx }) => {
                                const sectionPos = section.items.findIndex((it) => it.globalIdx === globalIdx)
                                return (
                                  <PageCard
                                    key={chapter.id}
                                    label={chapter.title || 'Untitled'}
                                    badge={getPageBadge(chapter) || undefined}
                                    kindLabel={getKindLabel(chapter.kind) || undefined}
                                    subLabel={getSubLabel(chapter) || undefined}
                                    w={thumbW} h={thumbH}
                                    onMoveUp={() => moveChapter(globalIdx, section.items[sectionPos - 1].globalIdx)}
                                    onMoveDown={() => moveChapter(globalIdx, section.items[sectionPos + 1].globalIdx)}
                                    canMoveUp={sectionPos > 0}
                                    canMoveDown={sectionPos < section.items.length - 1}
                                  >
                                    <ChapterPageContent chapter={chapter} scale={THUMB_SCALE} pageW={pageW} bookStyle={style} pw={thumbW} ph={thumbH} />
                                  </PageCard>
                                )
                              })}
                            </div>
                          </div>
                        )
                      })()}
                    </div>
                  </div>
                )
              }

              return (
              <div key={section.label}>
                <div className="text-[9px] uppercase tracking-widest text-[var(--fg-faint)] font-semibold mb-3">
                  {section.label}
                  <span className="ml-2 normal-case font-normal opacity-60">
                    {section.items.length} {section.items.length === 1 ? 'page' : 'pages'}
                  </span>
                </div>
                <div className="flex flex-wrap gap-4">
                  {section.items.map(({ chapter, globalIdx }) => {
                    const sectionItems = section.items
                    const sectionPos = sectionItems.findIndex((it) => it.globalIdx === globalIdx)
                    const badge = getPageBadge(chapter)
                    const kindLabel = getKindLabel(chapter.kind)
                    const subLabel = getSubLabel(chapter)
                    return (
                      <PageCard
                        key={chapter.id}
                        label={chapter.title || 'Untitled'}
                        badge={badge || undefined}
                        kindLabel={kindLabel || undefined}
                        subLabel={subLabel || undefined}
                        w={thumbW}
                        h={thumbH}
                        onMoveUp={() => moveChapter(globalIdx, sectionItems[sectionPos - 1].globalIdx)}
                        onMoveDown={() => moveChapter(globalIdx, sectionItems[sectionPos + 1].globalIdx)}
                        canMoveUp={sectionPos > 0}
                        canMoveDown={sectionPos < sectionItems.length - 1}
                      >
                        <ChapterPageContent
                          chapter={chapter}
                          scale={THUMB_SCALE}
                          pageW={pageW}
                          bookStyle={style}
                          pw={thumbW}
                          ph={thumbH}
                        />
                      </PageCard>
                    )
                  })}
                </div>
              </div>
            )
            })}
          </div>
        )}
      </div>

      {/* ── Full Preview Modal ─────────────────────────────────────────────── */}
      {showPreviewModal && (
        <div
          className="fixed inset-0 bg-black/60 z-50 flex items-stretch"
          onClick={(e) => { if (e.target === e.currentTarget) setShowPreviewModal(false) }}
        >
          <div className="flex flex-col w-full h-full bg-[var(--bg)] overflow-hidden">
            {/* Modal header */}
            <div className="flex-shrink-0 flex items-center justify-between px-6 py-3 border-b border-[var(--border)] bg-[var(--bg-card)]">
              <div>
                <h3 className="text-sm font-semibold text-[var(--fg)]">{currentBook.name} — Preview</h3>
                <p className="text-xs text-[var(--fg-muted)]">{fmt.name} · {pageW}" × {pageH}"</p>
              </div>

              <button
                onClick={() => setShowPreviewModal(false)}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-medium border border-[var(--border)] text-[var(--fg-muted)] hover:bg-[var(--bg-subtle)] transition-colors"
              >
                Close Preview
              </button>
            </div>

            {/* Modal body: options sidebar + page scroll */}
            <div className="flex flex-1 overflow-hidden">
              {/* Options sidebar */}
              <div className="w-56 flex-shrink-0 border-r border-[var(--border)] bg-[var(--bg-card)] overflow-y-auto p-4 space-y-5">
                <div>
                  <div className="text-[9px] uppercase tracking-widest font-semibold text-[var(--fg-faint)] mb-3">Include</div>
                  {(
                    [
                      ['includePageNumbers', 'Page numbers'],
                    ] as [keyof ExportOptions, string][]
                  ).map(([key, label]) => (
                    <label key={key} className="flex items-center gap-2.5 py-1.5 cursor-pointer">
                      <div
                        onClick={() => setExportOptions((o) => ({ ...o, [key]: !o[key] }))}
                        className={`w-4 h-4 rounded border flex items-center justify-center flex-shrink-0 transition-colors ${
                          exportOptions[key]
                            ? 'bg-[var(--accent)] border-[var(--accent)]'
                            : 'border-[var(--border)] bg-[var(--bg)]'
                        }`}
                      >
                        {exportOptions[key] && (
                          <svg width="10" height="10" viewBox="0 0 12 12" fill="none">
                            <path d="M2 6l3 3 5-5" stroke="white" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
                          </svg>
                        )}
                      </div>
                      <span className="text-xs text-[var(--fg)]">{label}</span>
                    </label>
                  ))}
                </div>

                <div>
                  <div className="text-[9px] uppercase tracking-widest font-semibold text-[var(--fg-faint)] mb-2">Margins</div>
                  <div className="flex flex-col gap-0.5">
                    <div className="flex justify-between text-xs">
                      <span className="text-[var(--fg-muted)]">Gutter (inner)</span>
                      <span className="text-[var(--fg)] font-medium">{style.marginInner.toFixed(2)}"</span>
                    </div>
                    <div className="flex justify-between text-xs">
                      <span className="text-[var(--fg-muted)]">Outer</span>
                      <span className="text-[var(--fg)] font-medium">{style.marginOuter.toFixed(2)}"</span>
                    </div>
                    <div className="flex justify-between text-xs">
                      <span className="text-[var(--fg-muted)]">Top / Bottom</span>
                      <span className="text-[var(--fg)] font-medium">{style.marginTop.toFixed(2)}"</span>
                    </div>
                  </div>
                  <p className="text-[10px] text-[var(--fg-faint)] mt-1.5">Edit margins in the chapter editor toolbar.</p>
                </div>

                <div className="pt-2 border-t border-[var(--border)]">
                  <div className="text-[9px] uppercase tracking-widest font-semibold text-[var(--fg-faint)] mb-2">Format</div>
                  <p className="text-xs text-[var(--fg)]">{fmt.name}</p>
                  <p className="text-xs text-[var(--fg-muted)]">{pageW}" × {pageH}"</p>
                </div>

                <div className="pt-2 border-t border-[var(--border)]">
                  <div className="text-[9px] uppercase tracking-widest font-semibold text-[var(--fg-faint)] mb-2">Contents</div>
                  {sectionCounts.front > 0 && (
                    <p className="text-xs text-[var(--fg-muted)]">{sectionCounts.front} Front Matter</p>
                  )}
                  {sectionCounts.body > 0 && (
                    <p className="text-xs text-[var(--fg-muted)]">{sectionCounts.body} Body</p>
                  )}
                  {sectionCounts.back > 0 && (
                    <p className="text-xs text-[var(--fg-muted)]">{sectionCounts.back} Back Matter</p>
                  )}
                  <p className="text-[10px] text-[var(--fg-faint)] mt-1">Covers exported separately via Cover Design tab.</p>
                </div>
              </div>

              {/* Scrollable page preview — same section order as thumbnail strip */}
              <div className="flex-1 overflow-y-auto bg-[var(--bg-surround)] py-8 px-6">
                <div className="flex flex-col items-center gap-8">

                  {/* Chapter sections — mirrors thumbnail strip grouping */}
                  {sections.map((section) => (
                    <div key={section.label} className="flex flex-col items-center gap-6 w-full">
                      <div className="self-start text-[10px] uppercase tracking-widest text-[var(--fg-faint)] font-semibold pl-2 flex items-center gap-2">
                        {section.label}
                        <span className="normal-case font-normal opacity-60">
                          · {section.items.length} {section.items.length === 1 ? 'page' : 'pages'}
                        </span>
                      </div>
                      {section.items.map(({ chapter }) => {
                        const pageNum = getPageBadge(chapter)
                        return (
                          <PreviewPageCard
                            key={chapter.id}
                            label={chapter.title || 'Untitled'}
                            pageNum={pageNum}
                            previewW={previewW}
                            previewH={previewH}
                          >
                            <ChapterPageContent
                              chapter={chapter}
                              scale={PREVIEW_SCALE}
                              pageW={pageW}
                              bookStyle={style}
                              pw={previewW}
                              ph={previewH}
                            />
                          </PreviewPageCard>
                        )
                      })}
                    </div>
                  ))}

                </div>
              </div>
            </div>
          </div>
        </div>
      )}

    </div>
  )
}
