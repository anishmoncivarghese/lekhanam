import React, { useEffect, useMemo, useRef, useState, useCallback } from 'react'
import { useEditor, EditorContent, Editor } from '@tiptap/react'
import { Extension } from '@tiptap/core'

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    fontSize: {
      setFontSize: (size: string) => ReturnType
      unsetFontSize: () => ReturnType
    }
  }
}
import { v4 as uuidv4 } from 'uuid'
import { Plugin } from 'prosemirror-state'
import { Decoration, DecorationSet } from 'prosemirror-view'
import { createPaginationPlugin, PageLayout } from '../plugins/paginationPlugin'
import StarterKit from '@tiptap/starter-kit'
import TextStyle from '@tiptap/extension-text-style'
import FontFamily from '@tiptap/extension-font-family'
import { ResizableImage } from '../extensions/ResizableImage'
import { AnnotationMark } from '../extensions/AnnotationMark'
import Table from '@tiptap/extension-table'
import TableRow from '@tiptap/extension-table-row'
import TableHeader from '@tiptap/extension-table-header'
import TableCell from '@tiptap/extension-table-cell'
import { FootnoteMark } from '../extensions/FootnoteMark'
import CharacterCount from '@tiptap/extension-character-count'
import Underline from '@tiptap/extension-underline'
import TextAlign from '@tiptap/extension-text-align'
import Highlight from '@tiptap/extension-highlight'
import Placeholder from '@tiptap/extension-placeholder'
import { BOOK_FORMATS, DEFAULT_FORMAT_KEY } from '../constants/bookFormats'
import FormatSelector from './FormatSelector'
import { useAiStore } from '../store/aiStore'
import { useBookStore } from '../store/bookStore'
import { BookStyle, DEFAULT_BOOK_STYLE } from '../types'

// Standard screen DPI
const PX_PER_IN = 96

// Robust word counter — walks ProseMirror doc directly, ignoring all mark types
// (avoids CharacterCount's textBetween, which can return wrong values when
// custom marks like AnnotationMark are present)
function countWords(doc: { descendants: (fn: (node: { isText: boolean; text?: string }) => void) => void }): number {
  let n = 0
  doc.descendants((node) => {
    if (node.isText && node.text) {
      n += node.text.split(/\s+/).filter(Boolean).length
    }
  })
  return n
}
// Clean gap between pages
const GRAY_BAND = 16

// Inline FontSize extension — extends TextStyle with a fontSize attribute
const FontSize = Extension.create({
  name: 'fontSize',
  addGlobalAttributes() {
    return [
      {
        types: ['textStyle'],
        attributes: {
          fontSize: {
            default: null,
            parseHTML: (el) => (el as HTMLElement).style.fontSize || null,
            renderHTML: (attrs) =>
              attrs.fontSize ? { style: `font-size: ${attrs.fontSize}` } : {}
          }
        }
      }
    ]
  },
  addCommands() {
    return {
      setFontSize: (size: string) => ({ chain }) =>
        chain().setMark('textStyle', { fontSize: size }).run(),
      unsetFontSize: () => ({ chain }) =>
        chain().setMark('textStyle', { fontSize: null }).removeEmptyTextStyle().run(),
    }
  },
})


// Roman numeral formatter for front-matter page numbers (i, ii, iii…)
function toRoman(n: number): string {
  const vals = [1000,900,500,400,100,90,50,40,10,9,5,4,1]
  const syms = ['M','CM','D','CD','C','XC','L','XL','X','IX','V','IV','I']
  let result = ''
  for (let i = 0; i < vals.length; i++) {
    while (n >= vals[i]) { result += syms[i]; n -= vals[i] }
  }
  return result.toLowerCase()
}

type ViewMode = 'single' | 'double' | 'thumbs'

interface Props {
  content: object
  bookId: string
  formatKey?: string
  readOnly?: boolean
  onChange: (content: object, wordCount: number) => void
  onEditorReady?: (editor: Editor) => void
  onMagicWandAction?: (action: 'expand' | 'shorten' | 'sensory', selectedText: string) => void
  spellCheckEnabled?: boolean
  aiReady?: boolean
  assistiveWriting?: boolean
  chapterTitle?: string
  chapterKind?: string
  focusMode?: boolean          // externally controlled (uiStore) — synced into local state
  onExitFocusMode?: () => void // called when user exits via Esc or exit button
}

const FONT_OPTIONS = [
  { label: 'Palatino',    value: "'Palatino Linotype', Palatino, 'Book Antiqua', serif" },
  { label: 'EB Garamond', value: "'EB Garamond', Garamond, serif" },
  { label: 'Baskerville', value: "Baskerville, 'Baskerville Old Face', serif" },
  { label: 'Georgia',     value: 'Georgia, serif' },
  { label: 'Caslon',      value: "'Big Caslon', Caslon, serif" },
]

const FONT_SIZES = [9, 10, 11, 12, 13, 14, 16, 18]

const LINE_SPACINGS = [
  { label: '1.0',        value: 1.0 },
  { label: '1.15',       value: 1.15 },
  { label: '1.3',        value: 1.3 },
  { label: '1.6 (Book)', value: 1.6 },
  { label: '2.0',        value: 2.0 },
]

export default function RichTextEditor({
  content,
  bookId,
  formatKey,
  readOnly = false,
  onChange,
  onEditorReady,
  onMagicWandAction,
  spellCheckEnabled = false,
  aiReady = false,
  assistiveWriting = false,
  chapterTitle,
  chapterKind,
  focusMode: focusModeExternal,
  onExitFocusMode,
}: Props): React.JSX.Element {
  const format = BOOK_FORMATS[formatKey ?? DEFAULT_FORMAT_KEY] ?? BOOK_FORMATS[DEFAULT_FORMAT_KEY]
  const { currentBook, saveBook, chapters, sessionStartTotal } = useBookStore()

  // Formatting state — initialized from persisted book.style (lazy initializer, runs once on mount)
  const [marginTop,    setMarginTop]    = useState(() => currentBook?.style?.marginTop    ?? DEFAULT_BOOK_STYLE.marginTop)
  const [marginBottom, setMarginBottom] = useState(() => currentBook?.style?.marginBottom ?? DEFAULT_BOOK_STYLE.marginBottom)
  const [marginInner,  setMarginInner]  = useState(() => currentBook?.style?.marginInner  ?? DEFAULT_BOOK_STYLE.marginInner)
  const [marginOuter,  setMarginOuter]  = useState(() => currentBook?.style?.marginOuter  ?? DEFAULT_BOOK_STYLE.marginOuter)
  const [fontFamily,   setFontFamily]   = useState(() => currentBook?.style?.fontFamily   ?? DEFAULT_BOOK_STYLE.fontFamily)
  const [fontSize,     setFontSize]     = useState(() => currentBook?.style?.fontSize     ?? DEFAULT_BOOK_STYLE.fontSize)
  const [lineSpacing,  setLineSpacing]  = useState(() => currentBook?.style?.lineSpacing  ?? DEFAULT_BOOK_STYLE.lineSpacing)
  const [structureLabel, setStructureLabel] = useState<'act' | 'section'>(() => currentBook?.style?.structureLabel ?? 'act')

  // Zoom (1.0 = 100%) — page Fit is always the startup default so each
  // chapter opens with the full page framed in the viewport. Saved numeric
  // preferences are ignored on open; the user can still tweak zoom in-session.
  const [zoom, setZoom] = useState(1.0)
  const [fitToWidth, setFitToWidth] = useState(true)
  const [zoomSaved, setZoomSaved] = useState(false)
  const [pageSetupOpen, setPageSetupOpen] = useState(false)
  const [focusMode, setFocusMode] = useState(false)
  const [typewriterMode, setTypewriterMode] = useState(false)

  // Sync external focus mode (from uiStore via ChapterEditor) into local state
  useEffect(() => {
    if (focusModeExternal !== undefined) setFocusMode(focusModeExternal)
  }, [focusModeExternal])
  const [focusParagraph, setFocusParagraph] = useState(false)
  const [pendingAnnotation, setPendingAnnotation] = useState<{ from: number; to: number } | null>(null)
  const [commentDraft, setCommentDraft] = useState('')
  const [pendingFootnote, setPendingFootnote] = useState(false)
  const [footnoteDraft, setFootnoteDraft] = useState('')
  // Refs mirror state to avoid stale closures inside useEditor callbacks
  const typewriterModeRef = useRef(false)
  const focusParagraphRef = useRef(false)
  const savedWandSelection = useRef<{ from: number; to: number } | null>(null)
  const [wandPos, setWandPos] = useState<{ top: number; left: number } | null>(null)

  // Escape exits focus mode
  useEffect(() => {
    if (!focusMode) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { setFocusMode(false); onExitFocusMode?.() }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [focusMode])

  // On book switch, always snap back to Fit so each chapter opens framed.
  useEffect(() => {
    setFitToWidth(true)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentBook?.id])

  // Save current zoom as the default for this book
  const saveZoomPreference = useCallback((): void => {
    if (!currentBook) return
    const pref: number | 'fit' = fitToWidth ? 'fit' : zoom
    const newStyle: BookStyle = { ...(currentBook.style ?? DEFAULT_BOOK_STYLE), editorZoom: pref }
    saveBook({ ...currentBook, style: newStyle, updatedAt: new Date().toISOString() })
    setZoomSaved(true)
    setTimeout(() => setZoomSaved(false), 1500)
  }, [currentBook, fitToWidth, zoom, saveBook])

  // Debounced style persistence — writes to book.style on disk 800ms after last change
  const persistTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const persistStyle = useCallback((patch: Partial<BookStyle>): void => {
    if (!currentBook) return
    if (persistTimerRef.current) clearTimeout(persistTimerRef.current)
    persistTimerRef.current = setTimeout(() => {
      const merged: BookStyle = { ...(currentBook.style ?? DEFAULT_BOOK_STYLE), ...patch }
      saveBook({ ...currentBook, style: merged })
    }, 800)
  }, [currentBook, saveBook])


  // Undo / redo availability
  const [canUndo, setCanUndo] = useState(false)
  const [canRedo, setCanRedo] = useState(false)

  // Page / nav state
  const [viewMode,     setViewMode]     = useState<ViewMode>('single')
  const [currentPage,  setCurrentPage]  = useState(1)
  const [totalPages,   setTotalPages]   = useState(1)
  const scrollRef       = useRef<HTMLDivElement>(null)
  const doubleScrollRef = useRef<HTMLDivElement>(null)
  const thumbsScrollRef = useRef<HTMLDivElement>(null)

  // Derived pixel dimensions — always at zoom=1.0 so TipTap never reflows on zoom
  const pgW     = Math.round(format.widthIn  * PX_PER_IN)
  const pgH     = Math.round(format.heightIn * PX_PER_IN)
  const mTop    = Math.round(marginTop    * PX_PER_IN)
  const mBottom = Math.round(marginBottom * PX_PER_IN)
  const mInner  = Math.round(marginInner  * PX_PER_IN)
  const mOuter  = Math.round(marginOuter  * PX_PER_IN)
  const headerH = 0
  const contentH = pgH - mTop - mBottom
  // Stride in pixels between the top of two consecutive pages (includes the gray separator)
  const pageStride = pgH + GRAY_BAND

  // Layout ref keeps the pagination plugin up-to-date without recreating it
  const layoutRef = useRef<PageLayout>({ pgH, mTop, mBottom, contentH, pageStride, headerH })

  // Stable pagination extension — created once, reads from layoutRef at call time
  const PaginationExt = useMemo(() =>
    Extension.create({
      name: 'pagination',
      addProseMirrorPlugins() {
        return [createPaginationPlugin(() => layoutRef.current)]
      }
    }), [])

  // Focus-paragraph extension — reads focusParagraphRef.current directly in decorations()
  // so every ProseMirror transaction re-evaluates without needing a meta dispatch.
  const FocusParagraphExt = useMemo(() => {
    const activeRef = focusParagraphRef   // stable ref captured once
    return Extension.create({
      name: 'focusParagraphPlugin',
      addProseMirrorPlugins() {
        return [new Plugin({
          props: {
            decorations(state) {
              if (!activeRef.current) return DecorationSet.empty
              const { $head } = state.selection
              if ($head.depth === 0) return DecorationSet.empty
              const start = $head.before(1)
              const node = state.doc.nodeAt(start)
              if (!node) return DecorationSet.empty
              return DecorationSet.create(state.doc, [
                Decoration.node(start, start + node.nodeSize, { class: 'is-fp-active' }),
              ])
            },
          },
        })]
      },
    })
  }, [])

  const [thumbHtml, setThumbHtml] = useState('')

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        history: { depth: 10, newGroupDelay: 1000 },
      }),
      TextStyle,
      FontFamily,
      FontSize,
      Underline,
      Highlight.configure({ multicolor: false }),
      TextAlign.configure({ types: ['heading', 'paragraph'] }),
      ResizableImage.configure({ inline: false, allowBase64: true }),
      CharacterCount,
      Table.configure({ resizable: false }),
      TableRow,
      TableHeader,
      TableCell,
      Placeholder.configure({ placeholder: 'Start writing your chapter here…' }),
      PaginationExt,
      FocusParagraphExt,
      AnnotationMark,
      FootnoteMark,
    ],
    editable: !readOnly,
    content: !content || Object.keys(content).length === 0 ? '' : content,
    onCreate: ({ editor }) => {
      onEditorReady?.(editor)
    },
    onUpdate: ({ editor }) => {
      if (readOnly) return
      const words = countWords(editor.state.doc)
      onChange(editor.getJSON(), words)
    },
    onTransaction: ({ editor: ed }) => {
      setCanUndo(ed.can().undo())
      setCanRedo(ed.can().redo())
    },
  })

  // Sync content when switching chapters
  useEffect(() => {
    if (!editor) return
    const current = editor.getJSON()
    if (JSON.stringify(current) !== JSON.stringify(content) && content && Object.keys(content).length > 0) {
      editor.commands.setContent(content)
    }
  }, [content, editor])

  // Toggle browser native spellcheck on/off
  useEffect(() => {
    if (!editor) return
    ;(editor.view.dom as HTMLElement).setAttribute('spellcheck', spellCheckEnabled ? 'true' : 'false')
  }, [editor, spellCheckEnabled])

  // Typewriter scroll — fires on cursor move and typing
  // Focus paragraph is handled by the FocusParagraphPlugin (ProseMirror decoration)
  useEffect(() => {
    if (!editor) return
    const applyTypewriter = () => {
      if (!typewriterModeRef.current || !scrollRef.current) return
      const { head } = editor.state.selection
      const coords = editor.view.coordsAtPos(head)
      const scrollEl = scrollRef.current
      const rect = scrollEl.getBoundingClientRect()
      scrollEl.scrollTop += coords.top - (rect.top + scrollEl.clientHeight * 0.40)
    }
    editor.on('selectionUpdate', applyTypewriter)
    editor.on('update', applyTypewriter)
    return () => {
      editor.off('selectionUpdate', applyTypewriter)
      editor.off('update', applyTypewriter)
    }
  }, [editor])

  // ResizeObserver: track ProseMirror height → total pages + thumbnail HTML
  // Using ResizeObserver (not editor.on('update')) ensures we capture innerHTML
  // AFTER the pagination plugin's requestAnimationFrame has added margin-top overrides
  useEffect(() => {
    if (!editor) return
    const pm = editor.view.dom as HTMLElement
    let roTimer: ReturnType<typeof setTimeout> | null = null
    const obs = new ResizeObserver(() => {
      if (roTimer) clearTimeout(roTimer)
      roTimer = setTimeout(() => {
        setTotalPages(Math.max(1, Math.ceil(pm.scrollHeight / pageStride)))
        setThumbHtml(pm.innerHTML)
      }, 50)
    })
    obs.observe(pm)
    return () => { obs.disconnect(); if (roTimer) clearTimeout(roTimer) }
  }, [editor, pageStride])

  // Reset to page 1 when format, zoom, or margins change; also nudge pagination plugin
  useEffect(() => {
    layoutRef.current = { pgH, mTop, mBottom, contentH, pageStride, headerH }
    setCurrentPage(1)
    scrollRef.current?.scrollTo({ top: 0 })
    // Dispatch empty transaction so the pagination plugin recalculates for the new layout
    if (editor) editor.view.dispatch(editor.state.tr)
  }, [pgH, mTop, mBottom, contentH, pageStride, headerH, editor])

  // Auto-enable fit when entering double spread (pages almost never fit at default zoom)
  useEffect(() => {
    if (viewMode === 'double') setFitToWidth(true)
  }, [viewMode])

  // Auto fit-to-width: keep the page(s) filling the scroll container
  // viewMode + focusMode are deps so the effect re-runs when the scroll element changes
  useEffect(() => {
    const el = viewMode === 'double' ? doubleScrollRef.current : scrollRef.current
    if (!el) return
    let debounceTimer: ReturnType<typeof setTimeout> | null = null

    const compute = (): void => {
      if (!fitToWidth) return
      const w = el.clientWidth
      if (w < 200) return // ignore zero-size frames during layout transitions
      // double: 40px padding each side + 12px gap between pages = 92px reserved
      // single: 48px padding each side = 96px reserved
      const effectivePageW = viewMode === 'double' ? 2 * pgW + 12 : pgW
      const reserved       = viewMode === 'double' ? 92 : 96
      const next = Math.max(0.5, Math.min(2.0, parseFloat(((w - reserved) / effectivePageW).toFixed(2))))
      setZoom(next)
    }
    
    compute() // Initial sync calculation

    const handleResize = () => {
      if (debounceTimer) clearTimeout(debounceTimer)
      debounceTimer = setTimeout(compute, 60)
    }

    const ro = new ResizeObserver(handleResize)
    ro.observe(el)
    return () => {
      ro.disconnect()
      if (debounceTimer) clearTimeout(debounceTimer)
    }
  }, [fitToWidth, pgW, focusMode, viewMode])

  const handleScroll = useCallback((): void => {
    const el = scrollRef.current
    if (!el) return
    const pg = Math.min(Math.floor(el.scrollTop / zoom / pageStride) + 1, totalPages)
    setCurrentPage(pg)
  }, [pageStride, totalPages, zoom])

  const handleDoubleScroll = useCallback((): void => {
    const el = doubleScrollRef.current
    if (!el) return
    const rowH = Math.round(pgH * zoom) + GRAY_BAND
    const spreadIndex = Math.max(0, Math.floor(Math.max(0, el.scrollTop - 48) / rowH))
    setCurrentPage(Math.min(spreadIndex * 2 + 1, totalPages))
  }, [pgH, zoom, totalPages])

  const goToPage = useCallback((p: number): void => {
    const clamped = Math.max(1, Math.min(p, totalPages))
    if (viewMode === 'double') {
      const spreadIndex = Math.floor((clamped - 1) / 2)
      setCurrentPage(spreadIndex * 2 + 1)
      const rowH = Math.round(pgH * zoom) + GRAY_BAND
      doubleScrollRef.current?.scrollTo({ top: 48 + spreadIndex * rowH, behavior: 'smooth' })
    } else {
      setCurrentPage(clamped)
      scrollRef.current?.scrollTo({ top: (clamped - 1) * pageStride * zoom, behavior: 'smooth' })
    }
  }, [totalPages, pageStride, pgH, viewMode, zoom])

  // Track text selection → show/hide custom wand toolbar
  useEffect(() => {
    if (!editor) return
    const updateWand = () => {
      const { selection } = editor.state
      if (!editor.isFocused || selection.empty || selection.from === selection.to) {
        setWandPos(null)
        return
      }
      savedWandSelection.current = { from: selection.from, to: selection.to }
      const nativeSel = window.getSelection()
      if (!nativeSel || nativeSel.rangeCount === 0) { setWandPos(null); return }
      const rect = nativeSel.getRangeAt(0).getBoundingClientRect()
      if (rect.width === 0 && rect.height === 0) { setWandPos(null); return }
      setWandPos({ top: rect.top - 44, left: rect.left + rect.width / 2 })
    }
    const hideWand = () => setWandPos(null)
    editor.on('selectionUpdate', updateWand)
    editor.on('blur', hideWand)
    return () => {
      editor.off('selectionUpdate', updateWand)
      editor.off('blur', hideWand)
    }
  }, [editor])

  const insertImage = async (): Promise<void> => {
    if (!editor) return
    const dataUrl = await window.electron.image.openDialog()
    if (!dataUrl) return
    await window.electron.image.save(
      bookId,
      'chapter',
      dataUrl,
      dataUrl.split(';')[0].split('/')[1] ?? 'jpg'
    )
    editor.chain().focus().setImage({ src: dataUrl }).run()
  }

  const isInTable = editor?.isActive('table') ?? false
  const insertTable = (): void => {
    editor?.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()
  }

  const getParagraphStyle = (): string => {
    if (!editor) return 'paragraph'
    if (editor.isActive('heading', { level: 1 })) return 'h1'
    if (editor.isActive('heading', { level: 2 })) return 'h2'
    if (editor.isActive('heading', { level: 3 })) return 'h3'
    return 'paragraph'
  }

  const setParagraphStyle = (val: string): void => {
    if (!editor) return
    if (val === 'paragraph') {
      editor.chain().focus().setParagraph().run()
    } else {
      const level = parseInt(val.replace('h', '')) as 1 | 2 | 3
      editor.chain().focus().toggleHeading({ level }).run()
    }
  }

  if (!editor) return <></>

  // Inline font-size on the current selection, or null if none is set
  const selectionFontSize: number | null = (() => {
    const raw = editor.getAttributes('textStyle').fontSize as string | undefined
    if (!raw) return null
    return parseInt(raw, 10) || null
  })()

  // Pixel offset of the top of page i within the page sheet div
  const pageTop = (i: number): number => i * pageStride

  // Total base-dimension content height (used to size the zoom spacer)
  const contentBaseH = totalPages * pgH + Math.max(0, totalPages - 1) * GRAY_BAND

  // Chapter kind — determines Arabic vs roman page numbers
  const FRONT_MATTER_KINDS = ['half-title', 'title-page', 'copyright', 'dedication', 'toc']
  const isFrontMatter = FRONT_MATTER_KINDS.includes(chapterKind ?? '')

  // Unified page overlays:
  //   • Subtle warm tint on all four margin areas (shows the print-safe zone)
  //   • Running header in top margin (book/chapter titles, thin hairline)
  //   • Page number in bottom margin (centered, hairline above)
  //   • Clean page-break gap between pages (no text labels)
  const pageOverlays = Array.from({ length: totalPages }, (_, i) => {
    const pageNum = i + 1
    const mLeft  = mInner
    const mRight = mOuter
    const pt     = pageTop(i)
    const label  = isFrontMatter ? toRoman(pageNum) : String(pageNum)

    return (
      <React.Fragment key={i}>

        {/* ── Top margin area ────────────────────────────── */}
        <div style={{
          position: 'absolute', top: pt, left: 0, right: 0, height: mTop,
          background: 'var(--margin-area-bg)',
          pointerEvents: 'none', zIndex: 2,
        }}>
        </div>

        {/* ── Bottom margin area ─────────────────────────── */}
        <div style={{
          position: 'absolute', top: pt + pgH - mBottom, left: 0, right: 0, height: mBottom,
          background: 'var(--margin-area-bg)',
          pointerEvents: 'none', zIndex: 2,
        }}>
          <div style={{
            position: 'absolute',
            top: Math.round(mBottom * 0.16),
            left: mLeft, right: mRight,
            display: 'flex', alignItems: 'flex-start', justifyContent: 'center',
            paddingTop: 3,
            borderTop: '0.5px solid var(--border)',
          }}>
            <span style={{ fontSize: 8, color: 'var(--fg-faint)', letterSpacing: '0.1em', lineHeight: 1 }}>
              {label}
            </span>
          </div>
        </div>

        {/* ── Left margin area ───────────────────────────── */}
        <div style={{
          position: 'absolute', top: pt, left: 0, width: mLeft, height: pgH,
          background: 'var(--margin-area-bg)',
          pointerEvents: 'none', zIndex: 2,
        }} />

        {/* ── Right margin area ──────────────────────────── */}
        <div style={{
          position: 'absolute', top: pt, right: 0, width: mRight, height: pgH,
          background: 'var(--margin-area-bg)',
          pointerEvents: 'none', zIndex: 2,
        }} />

        {/* ── Bottom-of-content fade ─────────────────────── */}
        <div style={{
          position: 'absolute',
          top: pt + pgH - mBottom - 20,
          left: mLeft, right: mRight, height: 20,
          background: 'linear-gradient(to bottom, transparent, var(--bg-card))',
          pointerEvents: 'none', zIndex: 1,
        }} />

        {/* ── Page break gap ─────────────────────────────── */}
        {i < totalPages - 1 && (
          <div style={{
            position: 'absolute', top: pt + pgH, left: 0, right: 0, height: GRAY_BAND,
            background: 'var(--bg-surround)',
            pointerEvents: 'none', zIndex: 3,
          }} />
        )}

      </React.Fragment>
    )
  })

  // Page sheet — exact book-format dimensions, margin areas handled by overlays
  const pageSheet = (
    <div
      className="bg-[var(--bg-card)] shrink-0 print-page"
      style={{
        position: 'relative',
        width: `${pgW}px`,
        minHeight: `${totalPages * pgH + (totalPages - 1) * GRAY_BAND}px`,
        paddingTop:    `${mTop}px`,
        paddingBottom: `${mBottom}px`,
        paddingLeft:   `${mInner}px`,
        paddingRight:  `${mOuter}px`,
        boxShadow: '0 1px 3px rgba(0,0,0,0.06), 0 4px 16px rgba(0,0,0,0.09), 0 20px 60px rgba(0,0,0,0.07)',
        borderRadius: '1px',
        cursor: 'text',
      }}
    >
      <div
        className={`tiptap-editor${focusParagraph ? ' fp-active' : ''}`}
        style={{
          '--editor-font-family': fontFamily,
          '--editor-font-size': `${fontSize}pt`,
          '--editor-line-height': lineSpacing,
        } as React.CSSProperties}
      >
        <EditorContent editor={editor} />
      </div>
      {pageOverlays}
    </div>
  )


  // Spread page clip — thumbnail-style: outer at zoomed size, inner scale wrapper at full page size
  const spreadClip = (pg: number): React.ReactNode => {
    const w = Math.round(pgW * zoom)
    const h = Math.round(pgH * zoom)
    return (
      <div style={{ position: 'relative', width: w, height: h, overflow: 'hidden', flexShrink: 0, background: 'var(--bg-card)', boxShadow: '0 1px 3px rgba(0,0,0,0.06), 0 4px 16px rgba(0,0,0,0.09), 0 20px 60px rgba(0,0,0,0.07)', borderRadius: '1px' }}>
        {!!thumbHtml && (
          <div style={{ position: 'absolute', top: 0, left: 0, width: pgW, height: pgH, transform: `scale(${zoom})`, transformOrigin: 'top left', overflow: 'hidden' }}>
            <div style={{ position: 'absolute', top: -(pg - 1) * pageStride, left: 0, width: pgW, paddingTop: mTop, paddingBottom: mBottom, paddingLeft: mInner, paddingRight: mOuter }}>
              <div className="tiptap-editor" style={{ '--editor-font-family': fontFamily, '--editor-font-size': `${fontSize}pt`, '--editor-line-height': String(lineSpacing) } as React.CSSProperties}>
                <div className="ProseMirror" style={{ pointerEvents: 'none', userSelect: 'none', color: '#1c1917' }} dangerouslySetInnerHTML={{ __html: thumbHtml }} />
              </div>
            </div>
          </div>
        )}
      </div>
    )
  }

  const selectCls = "h-7 text-xs border border-[var(--border)] rounded-md px-1.5 bg-[var(--bg-card)] text-[var(--fg)] focus:outline-none focus:border-[var(--accent)] cursor-pointer"
  const sepCls = "w-px h-5 bg-[var(--border)] mx-0.5 shrink-0"

  return (
    <div className={focusMode
      ? 'fixed inset-0 z-[9999] flex flex-col bg-[var(--bg-surround)]'
      : 'flex flex-col h-full'
    }>

      {/* ── Toolbar Row 1: Primary formatting ── */}
      {!readOnly && !focusMode && <div className="relative flex flex-wrap items-center gap-0.5 px-2 py-1.5 border-b border-[var(--border)] bg-[var(--bg-card)] min-h-[40px]">

        {/* Undo */}
        <ToolbarBtn
          onClick={() => editor.chain().focus().undo().run()}
          active={false}
          disabled={!canUndo}
          title="Undo (⌘Z)"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M3 7v6h6"/><path d="M3 13C5.33 7.87 9.5 5 14 5c4 0 7.4 2.4 9 6"/>
          </svg>
        </ToolbarBtn>

        {/* Redo */}
        <ToolbarBtn
          onClick={() => editor.chain().focus().redo().run()}
          active={false}
          disabled={!canRedo}
          title="Redo (⌘⇧Z)"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 7v6h-6"/><path d="M21 13C18.67 7.87 14.5 5 10 5c-4 0-7.4 2.4-9 6"/>
          </svg>
        </ToolbarBtn>

        <div className={sepCls} />

        {/* Paragraph style */}
        <select
          value={getParagraphStyle()}
          onChange={(e) => setParagraphStyle(e.target.value)}
          className={`${selectCls} w-28`}
          title="Paragraph style"
        >
          <option value="paragraph">Normal</option>
          <option value="h1">Heading 1</option>
          <option value="h2">Heading 2</option>
          <option value="h3">Heading 3</option>
        </select>

        <div className={sepCls} />

        {/* Font family */}
        <select
          value={fontFamily}
          onChange={(e) => { setFontFamily(e.target.value); persistStyle({ fontFamily: e.target.value }) }}
          className={`${selectCls} w-32`}
          title="Font family"
          style={{ fontFamily }}
        >
          {FONT_OPTIONS.map((f) => (
            <option key={f.label} value={f.value} style={{ fontFamily: f.value }}>
              {f.label}
            </option>
          ))}
        </select>

        {/* Font size */}
        <select
          value={selectionFontSize ?? fontSize}
          onChange={(e) => {
            const v = Number(e.target.value)
            if (!editor.state.selection.empty) {
              editor.chain().focus().setFontSize(`${v}pt`).run()
            } else {
              setFontSize(v)
              persistStyle({ fontSize: v })
            }
          }}
          className={`${selectCls} w-14`}
          title="Font size"
        >
          {FONT_SIZES.map((pt) => (
            <option key={pt} value={pt}>{pt}</option>
          ))}
        </select>
        {selectionFontSize !== null && (
          <button
            onClick={() => editor.chain().focus().unsetFontSize().run()}
            title="Remove inline size — revert to document default"
            className="w-5 h-5 flex items-center justify-center rounded text-[var(--fg-faint)] hover:text-[var(--fg)] hover:bg-[var(--bg-subtle)] text-xs leading-none"
          >✕</button>
        )}

        <div className={sepCls} />

        {/* Bold */}
        <ToolbarBtn
          onClick={() => editor.chain().focus().toggleBold().run()}
          active={editor.isActive('bold')}
          title="Bold (⌘B)"
        >
          <b className="text-sm font-bold">B</b>
        </ToolbarBtn>
        {/* Italic */}
        <ToolbarBtn
          onClick={() => editor.chain().focus().toggleItalic().run()}
          active={editor.isActive('italic')}
          title="Italic (⌘I)"
        >
          <i className="text-sm italic">I</i>
        </ToolbarBtn>
        {/* Underline */}
        <ToolbarBtn
          onClick={() => editor.chain().focus().toggleUnderline().run()}
          active={editor.isActive('underline')}
          title="Underline (⌘U)"
        >
          <u className="text-sm">U</u>
        </ToolbarBtn>
        {/* Strikethrough */}
        <ToolbarBtn
          onClick={() => editor.chain().focus().toggleStrike().run()}
          active={editor.isActive('strike')}
          title="Strikethrough"
        >
          <s className="text-sm">S</s>
        </ToolbarBtn>

        <div className={sepCls} />

        {/* Align Left */}
        <ToolbarBtn
          onClick={() => editor.chain().focus().setTextAlign('left').run()}
          active={editor.isActive({ textAlign: 'left' })}
          title="Align left"
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="21" x2="3" y1="6" y2="6" /><line x1="15" x2="3" y1="12" y2="12" /><line x1="17" x2="3" y1="18" y2="18" />
          </svg>
        </ToolbarBtn>
        {/* Align Center */}
        <ToolbarBtn
          onClick={() => editor.chain().focus().setTextAlign('center').run()}
          active={editor.isActive({ textAlign: 'center' })}
          title="Align center"
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="21" x2="3" y1="6" y2="6" /><line x1="17" x2="7" y1="12" y2="12" /><line x1="19" x2="5" y1="18" y2="18" />
          </svg>
        </ToolbarBtn>
        {/* Align Right */}
        <ToolbarBtn
          onClick={() => editor.chain().focus().setTextAlign('right').run()}
          active={editor.isActive({ textAlign: 'right' })}
          title="Align right"
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="21" x2="3" y1="6" y2="6" /><line x1="21" x2="9" y1="12" y2="12" /><line x1="21" x2="7" y1="18" y2="18" />
          </svg>
        </ToolbarBtn>
        {/* Justify */}
        <ToolbarBtn
          onClick={() => editor.chain().focus().setTextAlign('justify').run()}
          active={editor.isActive({ textAlign: 'justify' })}
          title="Justify"
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="21" x2="3" y1="6" y2="6" /><line x1="21" x2="3" y1="12" y2="12" /><line x1="21" x2="3" y1="18" y2="18" />
          </svg>
        </ToolbarBtn>

        <div className={sepCls} />

        {/* Bullet list */}
        <ToolbarBtn
          onClick={() => editor.chain().focus().toggleBulletList().run()}
          active={editor.isActive('bulletList')}
          title="Bullet list"
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="8" x2="21" y1="6" y2="6" /><line x1="8" x2="21" y1="12" y2="12" /><line x1="8" x2="21" y1="18" y2="18" />
            <line x1="3" x2="3.01" y1="6" y2="6" /><line x1="3" x2="3.01" y1="12" y2="12" /><line x1="3" x2="3.01" y1="18" y2="18" />
          </svg>
        </ToolbarBtn>
        {/* Numbered list */}
        <ToolbarBtn
          onClick={() => editor.chain().focus().toggleOrderedList().run()}
          active={editor.isActive('orderedList')}
          title="Numbered list"
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="10" x2="21" y1="6" y2="6" /><line x1="10" x2="21" y1="12" y2="12" /><line x1="10" x2="21" y1="18" y2="18" />
            <path d="M4 6h1v4" /><path d="M4 10h2" /><path d="M6 18H4c0-1 2-2 2-3s-1-1.5-2-1" />
          </svg>
        </ToolbarBtn>

        <div className={sepCls} />

        {/* Line spacing dropdown */}
        <select
          value={lineSpacing}
          onChange={(e) => { setLineSpacing(Number(e.target.value)); persistStyle({ lineSpacing: Number(e.target.value) }) }}
          className={`${selectCls} w-28`}
          title="Line spacing"
        >
          {LINE_SPACINGS.map((s) => (
            <option key={s.value} value={s.value}>{s.label}</option>
          ))}
        </select>

        <div className={sepCls} />

        {/* Highlight */}
        <ToolbarBtn
          onClick={() => editor.chain().focus().toggleHighlight().run()}
          active={editor.isActive('highlight')}
          title="Highlight"
        >
          <span className="text-[11px] font-semibold bg-yellow-200 px-0.5 rounded leading-none">H</span>
        </ToolbarBtn>

        {/* Insert image */}
        <ToolbarBtn onClick={insertImage} active={false} title="Insert image">
          <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect width="18" height="18" x="3" y="3" rx="2" ry="2" />
            <circle cx="9" cy="9" r="2" />
            <path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21" />
          </svg>
        </ToolbarBtn>

        {/* Table controls — insert when not in table, cell/row/col ops when inside */}
        {!isInTable ? (
          <ToolbarBtn onClick={insertTable} active={false} title="Insert 3×3 table">
            <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M3 3h18v18H3z"/><path d="M3 9h18M3 15h18M9 3v18M15 3v18"/>
            </svg>
          </ToolbarBtn>
        ) : (
          <>
            <div className={sepCls} />
            <ToolbarBtn onClick={() => editor?.chain().focus().addRowAfter().run()} active={false} title="Add row below">
              <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M3 3h18v10H3z"/><path d="M12 17v4M10 19h4"/>
              </svg>
            </ToolbarBtn>
            <ToolbarBtn onClick={() => editor?.chain().focus().addColumnAfter().run()} active={false} title="Add column after">
              <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M3 3h10v18H3z"/><path d="M17 12h4M19 10v4"/>
              </svg>
            </ToolbarBtn>
            <ToolbarBtn onClick={() => editor?.chain().focus().deleteRow().run()} active={false} title="Delete row">
              <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M3 3h18v10H3z"/><path d="M10 19h4"/>
              </svg>
            </ToolbarBtn>
            <ToolbarBtn onClick={() => editor?.chain().focus().deleteColumn().run()} active={false} title="Delete column">
              <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M3 3h10v18H3z"/><path d="M19 10v4"/>
              </svg>
            </ToolbarBtn>
            <ToolbarBtn onClick={() => editor?.chain().focus().deleteTable().run()} active={false} title="Delete table">
              <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M3 3h18v18H3z"/><path d="m15 9-6 6M9 9l6 6"/>
              </svg>
            </ToolbarBtn>
            <div className={sepCls} />
          </>
        )}

        {/* Right side */}
        <div className="ml-auto flex items-center gap-1.5">
          <FormatSelector />

          <div className={sepCls} />

          {/* Page Setup button */}
          <button
            onClick={() => setPageSetupOpen(v => !v)}
            title="Page Setup — margins, font, format"
            className={`flex items-center gap-1 px-2 py-1 rounded-md text-xs border transition-colors ${
              pageSetupOpen
                ? 'bg-[var(--bg-subtle)] border-[var(--border)] text-[var(--fg)]'
                : 'border-transparent text-[var(--fg-muted)] hover:text-[var(--fg)] hover:bg-[var(--bg-subtle)]'
            }`}
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="3"/>
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>
            </svg>
            Page Setup
          </button>
        </div>

        {/* ── Page Setup Popover ── */}
        {pageSetupOpen && (
          <>
            <div className="fixed inset-0 z-30" onClick={() => setPageSetupOpen(false)} />
            <div className="absolute top-full right-0 mt-1 z-40 w-80 bg-[var(--bg-card)] border border-[var(--border)] rounded-xl shadow-2xl p-4 space-y-4">
              <h3 className="text-sm font-semibold text-[var(--fg)]">Page Setup</h3>

              {/* Margins — 2×2 grid */}
              <div>
                <label className="text-xs font-medium text-[var(--fg-muted)] mb-2 block uppercase tracking-wide">Margins (inches)</label>
                <div className="grid grid-cols-2 gap-2">
                  {([
                    ['Top',           marginTop,    setMarginTop,    'marginTop'    as keyof BookStyle],
                    ['Bottom',        marginBottom, setMarginBottom, 'marginBottom' as keyof BookStyle],
                    ['Inner (Gutter)',marginInner,  setMarginInner,  'marginInner'  as keyof BookStyle],
                    ['Outer',         marginOuter,  setMarginOuter,  'marginOuter'  as keyof BookStyle],
                  ] as [string, number, React.Dispatch<React.SetStateAction<number>>, keyof BookStyle][]).map(([label, val, setter, key]) => (
                    <div key={label as string}>
                      <label className="text-[10px] text-[var(--fg-faint)] block mb-0.5">{label as string}</label>
                      <input
                        type="number"
                        step={0.05} min={0.25} max={3}
                        value={val as number}
                        onChange={(e) => {
                          const v = Math.max(0.25, Math.min(3, Number(e.target.value)))
                          ;(setter as React.Dispatch<React.SetStateAction<number>>)(v)
                          persistStyle({ [key]: v })
                        }}
                        className="w-full px-2 py-1 text-xs rounded-md border border-[var(--border)] bg-[var(--bg)] text-[var(--fg)] focus:outline-none focus:border-[var(--accent)]"
                      />
                    </div>
                  ))}
                </div>
              </div>

              {/* Typography */}
              <div>
                <label className="text-xs font-medium text-[var(--fg-muted)] mb-2 block uppercase tracking-wide">Typography</label>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-[10px] text-[var(--fg-faint)] block mb-0.5">Font</label>
                    <select
                      value={fontFamily}
                      onChange={(e) => { setFontFamily(e.target.value); persistStyle({ fontFamily: e.target.value }) }}
                      className="w-full px-2 py-1 text-xs rounded-md border border-[var(--border)] bg-[var(--bg)] text-[var(--fg)] focus:outline-none focus:border-[var(--accent)]"
                    >
                      {FONT_OPTIONS.map((f) => (
                        <option key={f.label} value={f.value}>{f.label}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="text-[10px] text-[var(--fg-faint)] block mb-0.5">Size (pt)</label>
                    <select
                      value={fontSize}
                      onChange={(e) => { setFontSize(Number(e.target.value)); persistStyle({ fontSize: Number(e.target.value) }) }}
                      className="w-full px-2 py-1 text-xs rounded-md border border-[var(--border)] bg-[var(--bg)] text-[var(--fg)] focus:outline-none focus:border-[var(--accent)]"
                    >
                      {FONT_SIZES.map((pt) => (
                        <option key={pt} value={pt}>{pt} pt</option>
                      ))}
                    </select>
                  </div>
                  <div className="col-span-2">
                    <label className="text-[10px] text-[var(--fg-faint)] block mb-0.5">Line Spacing</label>
                    <select
                      value={lineSpacing}
                      onChange={(e) => { setLineSpacing(Number(e.target.value)); persistStyle({ lineSpacing: Number(e.target.value) }) }}
                      className="w-full px-2 py-1 text-xs rounded-md border border-[var(--border)] bg-[var(--bg)] text-[var(--fg)] focus:outline-none focus:border-[var(--accent)]"
                    >
                      {LINE_SPACINGS.map((s) => (
                        <option key={s.value} value={s.value}>{s.label}</option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>

              {/* Structure label — Act vs Section */}
              <div>
                <label className="text-xs font-medium text-[var(--fg-muted)] mb-2 block uppercase tracking-wide">Structure Label</label>
                <div className="flex rounded-[10px] border border-[var(--border)] overflow-hidden text-xs">
                  {(['act', 'section'] as const).map((opt) => (
                    <button
                      key={opt}
                      onClick={() => { setStructureLabel(opt); persistStyle({ structureLabel: opt }) }}
                      className={`flex-1 py-1.5 capitalize transition-colors ${
                        structureLabel === opt
                          ? 'bg-[var(--accent)] text-white font-semibold'
                          : 'text-[var(--fg-muted)] hover:bg-[var(--bg-subtle)]'
                      }`}
                    >
                      {opt === 'act' ? 'Act' : 'Section'}
                    </button>
                  ))}
                </div>
                <p className="text-[10px] text-[var(--fg-faint)] mt-1">
                  Changes "Act" to "Section" everywhere in the book
                </p>
              </div>
            </div>
          </>
        )}
      </div>}


      {/* ── Page preview area ── */}
      {focusMode ? (
        <div ref={scrollRef} onScroll={handleScroll} className="flex-1 overflow-auto bg-[var(--bg-surround)]">
          <div style={{ minHeight: contentBaseH * zoom + 96, display: 'flex', justifyContent: 'center', paddingTop: 48, paddingBottom: 48, alignItems: 'flex-start', boxSizing: 'border-box' }}>
            <div style={{ transform: `scale(${zoom})`, transformOrigin: 'top center', flexShrink: 0 }}>
              {pageSheet}
            </div>
          </div>
        </div>
      ) : viewMode === 'thumbs' ? (
        <div className="flex flex-1 overflow-hidden">
          {/* Thumbnail sidebar */}
          <div
            ref={thumbsScrollRef}
            className="w-[108px] shrink-0 overflow-y-auto bg-[var(--bg-surround)] py-4 flex flex-col items-center gap-3 border-r border-[var(--border)]"
          >
            {Array.from({ length: totalPages }, (_, i) => i + 1).map((pg) => {
              const thumbW = 72
              const thumbH = Math.round(thumbW * format.heightIn / format.widthIn)
              const thumbScale = thumbW / pgW
              return (
                <button
                  key={pg}
                  onClick={() => goToPage(pg)}
                  className="flex flex-col items-center gap-1"
                >
                  <div
                    className={`rounded-sm shadow-sm border-2 transition-colors overflow-hidden relative ${
                      pg === currentPage ? 'border-[var(--accent)]' : 'border-[var(--border)] hover:border-[var(--fg-faint)]'
                    }`}
                    style={{ width: thumbW, height: thumbH, background: 'white' }}
                  >
                    {thumbHtml && (
                      <div  // scale wrapper: pgW×pgH scaled to thumbW×thumbH
                        style={{
                          position: 'absolute', top: 0, left: 0,
                          width: pgW, height: pgH,
                          transform: `scale(${thumbScale})`,
                          transformOrigin: 'top left',
                          overflow: 'hidden',
                        }}
                      >
                        <div  // page-offset: position:absolute shifts page N to y=0
                          style={{
                            position: 'absolute',
                            top: -(pg - 1) * pageStride,
                            left: 0,
                            width: pgW,
                            paddingTop: mTop, paddingBottom: mBottom,
                            paddingLeft: mInner, paddingRight: mOuter,
                          }}
                        >
                          <div
                            className="tiptap-editor"
                            style={{
                              '--editor-font-family': fontFamily,
                              '--editor-font-size': `${fontSize}pt`,
                              '--editor-line-height': String(lineSpacing),
                            } as React.CSSProperties}
                          >
                            <div
                              className="ProseMirror"
                              style={{ pointerEvents: 'none', userSelect: 'none', color: '#1c1917' }}
                              dangerouslySetInnerHTML={{ __html: thumbHtml }}
                            />
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                  <span className={`text-[10px] ${pg === currentPage ? 'text-[var(--accent)] font-semibold' : 'text-[var(--fg-muted)]'}`}>
                    {pg}
                  </span>
                </button>
              )
            })}
          </div>

          {/* Editor pane */}
          <div
            ref={scrollRef}
            onScroll={handleScroll}
            className="flex-1 overflow-auto bg-[var(--bg-surround)]"
          >
            <div style={{
              minHeight: contentBaseH * zoom + 96,
              display: 'flex', justifyContent: 'center',
              paddingTop: 48, paddingBottom: 48,
              alignItems: 'flex-start', boxSizing: 'border-box',
            }}>
              <div style={{ transform: `scale(${zoom})`, transformOrigin: 'top center', flexShrink: 0 }}>
                {pageSheet}
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div className="flex-1 overflow-hidden relative">
          {/* Double spread overlay — absolute, only shown in double mode; editor stays mounted below */}
          {viewMode === 'double' && (
            <div
              ref={doubleScrollRef}
              onScroll={handleDoubleScroll}
              className="absolute inset-0 overflow-auto bg-[var(--bg-surround)] z-10"
            >
              <div style={{ padding: '48px 40px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: GRAY_BAND }}>
                {Array.from({ length: Math.ceil(totalPages / 2) }, (_, i) => (
                  <div key={i} style={{ display: 'flex', gap: 12, flexShrink: 0 }}>
                    {spreadClip(i * 2 + 1)}
                    {spreadClip(i * 2 + 2)}
                  </div>
                ))}
              </div>
            </div>
          )}
          {/* Single view editor — always mounted so ResizeObserver keeps thumbHtml/totalPages current */}
          <div ref={scrollRef} onScroll={handleScroll} className="h-full overflow-auto bg-[var(--bg-surround)]">
            <div style={{
              minHeight: contentBaseH * zoom + 96,
              display: 'flex', justifyContent: 'center',
              paddingTop: 48, paddingBottom: 48,
              alignItems: 'flex-start', boxSizing: 'border-box',
            }}>
              <div style={{ transform: `scale(${zoom})`, transformOrigin: 'top center', flexShrink: 0 }}>
                {pageSheet}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Focus mode exit button ── */}
      {!readOnly && focusMode && (
        <button
          onClick={() => { setFocusMode(false); onExitFocusMode?.() }}
          title="Exit focus mode (Esc)"
          style={{ position: 'absolute', top: 12, right: 16, zIndex: 10 }}
          className="px-2.5 py-1 text-[11px] text-[var(--fg-muted)] bg-[var(--bg-card)] border border-[var(--border)] rounded-md hover:text-[var(--fg)] opacity-50 hover:opacity-100 transition-opacity"
        >
          Esc
        </button>
      )}

      {/* ── Bottom status bar: nav + words + preview + view + zoom ── */}
      {!readOnly && !focusMode && <div className="flex flex-wrap justify-center items-center gap-y-2 gap-x-2 px-3 py-1 border-t border-[var(--border)] bg-[var(--bg-card)] text-xs text-[var(--fg-muted)] select-none shrink-0 min-h-[30px] overflow-hidden min-w-0">
        
        {/* ── Left Group ── */}
        <div className="flex items-center gap-2 shrink-0">
        <button
          onClick={() => goToPage(viewMode === 'double' ? currentPage - 2 : currentPage - 1)}
          disabled={currentPage <= 1}
          className="w-5 h-5 flex items-center justify-center rounded hover:bg-[var(--bg-subtle)] disabled:opacity-30 text-base leading-none"
          title="Previous page"
        >‹</button>
        <span className="whitespace-nowrap">p.</span>
        <input
          type="number"
          min={1} max={totalPages}
          value={currentPage}
          onChange={(e) => goToPage(Number(e.target.value))}
          className="w-8 text-center border border-[var(--border)] rounded py-0 text-xs focus:outline-none focus:border-[var(--accent)] bg-[var(--bg-card)]"
        />
        <span className="whitespace-nowrap text-[var(--fg-faint)]">/ {totalPages}</span>
        <button
          onClick={() => goToPage(viewMode === 'double' ? currentPage + 2 : currentPage + 1)}
          disabled={viewMode === 'double' ? currentPage + 2 > totalPages : currentPage >= totalPages}
          className="w-5 h-5 flex items-center justify-center rounded hover:bg-[var(--bg-subtle)] disabled:opacity-30 text-base leading-none"
          title="Next page"
        >›</button>

        <div className="w-px h-4 bg-[var(--border)] mx-0.5 shrink-0" />

        {/* Word count + session */}
        <span className="whitespace-nowrap text-[var(--fg-faint)]">
          {countWords(editor.state.doc).toLocaleString()} words
        </span>
        {(() => {
          const total = chapters.reduce((s, c) => s + (c.wordCount || 0), 0)
          const session = Math.max(0, total - sessionStartTotal)
          return session > 0 ? (
            <span className="whitespace-nowrap text-[var(--fg-faint)]">
              · +{session.toLocaleString()} session
            </span>
          ) : null
        })()}


        </div>

        {/* ── Right Group ── */}
        <div className="flex items-center gap-2 shrink-0">
        
        {/* Typewriter scroll toggle */}
        <button
          onClick={() => {
            const next = !typewriterMode
            setTypewriterMode(next)
            typewriterModeRef.current = next
            if (next && editor && scrollRef.current) {
              // Restore editor focus first (button click stole it, hiding the caret)
              // then scroll cursor to 40% after the focus re-render
              editor.commands.focus()
              requestAnimationFrame(() => {
                if (!scrollRef.current) return
                const { head } = editor.state.selection
                const coords = editor.view.coordsAtPos(head)
                const scrollEl = scrollRef.current
                const rect = scrollEl.getBoundingClientRect()
                scrollEl.scrollTop += coords.top - (rect.top + scrollEl.clientHeight * 0.40)
              })
            }
          }}
          title={typewriterMode ? 'Typewriter scroll: on (click to turn off)' : 'Typewriter scroll — keeps cursor at mid-screen'}
          className={`w-7 h-7 flex items-center justify-center rounded-md transition-colors ${typewriterMode ? 'bg-[var(--bg-amber)] text-[var(--accent-hover)]' : 'text-[var(--fg-muted)] hover:bg-[var(--bg-subtle)] hover:text-[var(--fg)]'}`}
        >
          {/* Typewriter / cursor-line icon */}
          <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="3" y1="12" x2="21" y2="12"/>
            <polyline points="8 8 12 4 16 8"/>
            <polyline points="16 16 12 20 8 16"/>
          </svg>
        </button>

        {/* Focus paragraph toggle */}
        <button
          onClick={() => {
            const next = !focusParagraph
            setFocusParagraph(next)
            focusParagraphRef.current = next   // update ref BEFORE focus() triggers decorations()
            editor?.commands.focus()            // restores caret AND triggers decoration re-evaluation
          }}
          title={focusParagraph ? 'Focus paragraph: on (click to turn off)' : 'Focus paragraph — dims surrounding text'}
          className={`w-7 h-7 flex items-center justify-center rounded-md transition-colors ${focusParagraph ? 'bg-[var(--bg-amber)] text-[var(--accent-hover)]' : 'text-[var(--fg-muted)] hover:bg-[var(--bg-subtle)] hover:text-[var(--fg)]'}`}
        >
          {/* Horizontal-lines with center highlighted icon */}
          <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="3" y1="6" x2="21" y2="6" strokeOpacity="0.35"/>
            <line x1="3" y1="10" x2="21" y2="10"/>
            <line x1="3" y1="14" x2="21" y2="14"/>
            <line x1="3" y1="18" x2="21" y2="18" strokeOpacity="0.35"/>
          </svg>
        </button>

        <div className="w-px h-4 bg-[var(--border)] mx-0.5 shrink-0" />

        {/* Footnote insert button */}
        <button
          onClick={() => { setPendingFootnote(true); setFootnoteDraft('') }}
          title="Insert footnote at cursor position"
          className="w-7 h-7 flex items-center justify-center rounded-md text-[var(--fg-muted)] hover:bg-[var(--bg-subtle)] hover:text-[var(--fg)] transition-colors font-serif text-[13px] font-semibold leading-none"
        >
          ¹
        </button>

        <div className="w-px h-4 bg-[var(--border)] mx-0.5 shrink-0" />

        {/* Focus mode button */}
        <button
          onClick={() => setFocusMode(true)}
          title="Focus mode — distraction-free writing (Esc to exit)"
          className="w-7 h-7 flex items-center justify-center rounded-md text-[var(--fg-muted)] hover:bg-[var(--bg-subtle)] hover:text-[var(--fg)]"
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M8 3H5a2 2 0 0 0-2 2v3"/><path d="M21 8V5a2 2 0 0 0-2-2h-3"/>
            <path d="M3 16v3a2 2 0 0 0 2 2h3"/><path d="M16 21h3a2 2 0 0 0 2-2v-3"/>
          </svg>
        </button>
        <div className="w-px h-4 bg-[var(--border)] mx-0.5 shrink-0" />

        {/* View mode buttons */}
        <div className="flex items-center gap-0.5">
          <ViewModeBtn mode="single" current={viewMode} onSelect={setViewMode} title="Single page">
            <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="5" y="2" width="14" height="20" rx="2" />
            </svg>
          </ViewModeBtn>
          <ViewModeBtn mode="double" current={viewMode} onSelect={setViewMode} title="Two-page spread">
            <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="1" y="3" width="10" height="18" rx="1.5" />
              <rect x="13" y="3" width="10" height="18" rx="1.5" />
            </svg>
          </ViewModeBtn>
          <ViewModeBtn mode="thumbs" current={viewMode} onSelect={setViewMode} title="Thumbnail view">
            <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="2" y="2" width="9" height="9" rx="1" />
              <rect x="13" y="2" width="9" height="9" rx="1" />
              <rect x="2" y="13" width="9" height="9" rx="1" />
              <rect x="13" y="13" width="9" height="9" rx="1" />
            </svg>
          </ViewModeBtn>
        </div>

        <div className="w-px h-4 bg-[var(--border)] mx-0.5 shrink-0" />

        {/* Zoom control */}
        <div className="flex items-center gap-1">
          <button
            onClick={() => { setFitToWidth(false); setZoom((z) => Math.max(0.5, parseFloat((z - 0.1).toFixed(1)))) }}
            className="w-5 h-5 flex items-center justify-center rounded hover:bg-[var(--bg-subtle)] font-medium text-base leading-none"
            title="Zoom out"
          >−</button>
          <input
            type="range" min={50} max={200} step={5}
            value={Math.round(zoom * 100)}
            onChange={(e) => { setFitToWidth(false); setZoom(Number(e.target.value) / 100) }}
            className="w-20 accent-[var(--accent)]"
          />
          <button
            onClick={() => { setFitToWidth(false); setZoom((z) => Math.min(2.0, parseFloat((z + 0.1).toFixed(1)))) }}
            className="w-5 h-5 flex items-center justify-center rounded hover:bg-[var(--bg-subtle)] font-medium text-base leading-none"
            title="Zoom in"
          >+</button>
          <button
            onClick={() => setFitToWidth((v) => !v)}
            title={fitToWidth ? 'Fit to width ON — click for manual zoom' : 'Fit page to window width'}
            className={`px-1.5 h-5 rounded text-[10px] font-medium transition-colors ${
              fitToWidth
                ? 'bg-[var(--accent)] text-white'
                : 'text-[var(--fg-faint)] hover:text-[var(--fg)] hover:bg-[var(--bg-subtle)]'
            }`}
          >Fit</button>
          <button
            onClick={saveZoomPreference}
            title={fitToWidth ? 'Save Fit as default zoom for this book' : `Save ${Math.round(zoom * 100)}% as default zoom for this book`}
            className={`px-1.5 h-5 rounded text-[10px] font-medium transition-colors ${
              zoomSaved
                ? 'bg-[var(--color-success)] text-white'
                : 'text-[var(--fg-faint)] hover:text-[var(--fg)] hover:bg-[var(--bg-subtle)]'
            }`}
          >{zoomSaved ? '✓' : 'Set'}</button>
          <button
            onClick={() => { setFitToWidth(false); setZoom(1.0) }}
            title="Reset to 100%"
            className="w-9 text-right text-[var(--fg-muted)] hover:text-[var(--fg)] tabular-nums text-[10px]"
          >{Math.round(zoom * 100)}%</button>
        </div>
      </div>
    </div>}

      {/* Insert footnote modal */}
      {pendingFootnote && editor && (
        <div
          className="fixed inset-0 z-[900] flex items-center justify-center bg-black/30"
          onClick={() => setPendingFootnote(false)}
        >
          <div
            className="bg-[var(--bg-card)] border border-[var(--border)] rounded-xl shadow-2xl w-80 p-4"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-sm font-semibold text-[var(--fg)] mb-1">Add Footnote</h3>
            <p className="text-[11px] text-[var(--fg-faint)] mb-3">A ¹ marker will be inserted at the cursor. The footnote text appears in the footnotes panel and in DOCX export.</p>
            <textarea
              autoFocus
              value={footnoteDraft}
              onChange={(e) => setFootnoteDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Escape') { setPendingFootnote(false); return }
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault()
                  editor.chain().focus().insertContent({
                    type: 'text',
                    text: '*',
                    marks: [{ type: 'footnote', attrs: { id: uuidv4(), content: footnoteDraft.trim() } }],
                  }).run()
                  setPendingFootnote(false)
                  setFootnoteDraft('')
                }
              }}
              placeholder="Footnote text… (Enter to insert)"
              rows={3}
              className="w-full px-3 py-2 text-sm border border-[var(--border)] rounded-lg bg-[var(--bg)] text-[var(--fg)] placeholder:text-[var(--fg-faint)] focus:outline-none focus:border-[var(--accent)] resize-none leading-relaxed"
            />
            <div className="flex justify-end gap-2 mt-3">
              <button
                onClick={() => setPendingFootnote(false)}
                className="px-3 py-1.5 text-xs rounded-[10px] border border-[var(--border)] text-[var(--fg-muted)] hover:bg-[var(--bg-subtle)] transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  editor.chain().focus().insertContent({
                    type: 'text',
                    text: '*',
                    marks: [{ type: 'footnote', attrs: { id: uuidv4(), content: footnoteDraft.trim() } }],
                  }).run()
                  setPendingFootnote(false)
                  setFootnoteDraft('')
                }}
                className="px-3 py-1.5 text-xs rounded-[10px] bg-[var(--accent)] text-white font-medium hover:bg-[var(--accent-hover)] transition-colors"
              >
                Insert Footnote
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add comment modal */}
      {pendingAnnotation && (
        <div
          className="fixed inset-0 z-[900] flex items-center justify-center bg-black/30"
          onClick={() => setPendingAnnotation(null)}
        >
          <div
            className="bg-[var(--bg-card)] border border-[var(--border)] rounded-xl shadow-2xl w-80 p-4"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-sm font-semibold text-[var(--fg)] mb-3">Add Comment</h3>
            <textarea
              autoFocus
              value={commentDraft}
              onChange={(e) => setCommentDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Escape') { setPendingAnnotation(null); return }
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault()
                  if (!commentDraft.trim()) return
                  editor.chain()
                    .setTextSelection({ from: pendingAnnotation.from, to: pendingAnnotation.to })
                    .setMark('annotation', { id: uuidv4(), comment: commentDraft.trim() })
                    .run()
                  setPendingAnnotation(null)
                  setCommentDraft('')
                }
              }}
              placeholder="Type your comment… (Enter to save)"
              rows={3}
              className="w-full px-3 py-2 text-sm border border-[var(--border)] rounded-lg bg-[var(--bg)] text-[var(--fg)] placeholder:text-[var(--fg-faint)] focus:outline-none focus:border-[var(--accent)] resize-none leading-relaxed"
            />
            <div className="flex justify-end gap-2 mt-3">
              <button
                onClick={() => setPendingAnnotation(null)}
                className="px-3 py-1.5 text-xs rounded-[10px] border border-[var(--border)] text-[var(--fg-muted)] hover:bg-[var(--bg-subtle)] transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  if (!commentDraft.trim()) return
                  editor.chain()
                    .setTextSelection({ from: pendingAnnotation.from, to: pendingAnnotation.to })
                    .setMark('annotation', { id: uuidv4(), comment: commentDraft.trim() })
                    .run()
                  setPendingAnnotation(null)
                  setCommentDraft('')
                }}
                disabled={!commentDraft.trim()}
                className="px-3 py-1.5 text-xs rounded-[10px] bg-[var(--accent)] text-white font-medium hover:bg-[var(--accent-hover)] disabled:opacity-40 transition-colors"
              >
                Add Comment
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Custom floating wand toolbar — replaces TipTap BubbleMenu */}
      {!readOnly && wandPos && (
        <div
          style={{
            position: 'fixed',
            top: Math.max(8, wandPos.top),
            left: wandPos.left,
            transform: 'translateX(-50%)',
            zIndex: 10000,
            pointerEvents: 'auto',
          }}
          className="flex items-center gap-0 bg-[#1c1917] rounded-lg shadow-xl overflow-hidden border border-white/10"
        >
          <WandBtn onClick={() => {
            const sel = savedWandSelection.current
            if (!sel || sel.from === sel.to) return
            setPendingAnnotation(sel)
            setCommentDraft('')
          }}>💬 Comment</WandBtn>
          {onMagicWandAction && assistiveWriting && aiReady && (
            <>
              <div className="w-px h-5 bg-white/10 flex-shrink-0" />
              <WandBtn onClick={() => {
                const sel = savedWandSelection.current
                if (!sel) return
                const text = editor.state.doc.textBetween(sel.from, sel.to, ' ')
                if (text) onMagicWandAction('expand', text)
              }}>Expand</WandBtn>
              <WandBtn onClick={() => {
                const sel = savedWandSelection.current
                if (!sel) return
                const text = editor.state.doc.textBetween(sel.from, sel.to, ' ')
                if (text) onMagicWandAction('shorten', text)
              }}>Shorten</WandBtn>
              <WandBtn onClick={() => {
                const sel = savedWandSelection.current
                if (!sel) return
                const text = editor.state.doc.textBetween(sel.from, sel.to, ' ')
                if (text) onMagicWandAction('sensory', text)
              }}>✨ Sensory</WandBtn>
            </>
          )}
        </div>
      )}
    </div>
  )
}

function ToolbarBtn({
  children,
  onClick,
  active,
  disabled,
  title
}: {
  children: React.ReactNode
  onClick: () => void
  active: boolean
  disabled?: boolean
  title: string
}): React.JSX.Element {
  return (
    <button
      onClick={onClick}
      title={title}
      disabled={disabled}
      className={`w-7 h-7 flex items-center justify-center rounded-md transition-colors disabled:opacity-30 disabled:cursor-not-allowed ${
        active
          ? 'bg-[var(--accent)] text-white'
          : 'text-[var(--fg-muted)] hover:bg-[var(--bg-subtle)] hover:text-[var(--fg)]'
      }`}
    >
      {children}
    </button>
  )
}

function ViewModeBtn({
  mode,
  current,
  onSelect,
  title,
  children
}: {
  mode: ViewMode
  current: ViewMode
  onSelect: (m: ViewMode) => void
  title: string
  children: React.ReactNode
}): React.JSX.Element {
  return (
    <button
      onClick={() => onSelect(mode)}
      title={title}
      className={`w-7 h-7 flex items-center justify-center rounded-md transition-colors ${
        mode === current
          ? 'bg-[var(--accent)] text-white'
          : 'text-[var(--fg-muted)] hover:bg-[var(--bg-subtle)]'
      }`}
    >
      {children}
    </button>
  )
}

function WandBtn({ children, onClick }: { children: React.ReactNode; onClick: () => void }): React.JSX.Element {
  return (
    <button
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
      className="px-3 py-1.5 text-xs text-white/90 hover:bg-white/10 transition-colors font-medium"
    >
      {children}
    </button>
  )
}
