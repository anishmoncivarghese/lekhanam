import React, { useState, useEffect, useRef, useCallback } from 'react'
import { Stage, Layer, Rect, Text, Image as KonvaImageEl, Transformer } from 'react-konva'
import Konva from 'konva'
import { v4 as uuidv4 } from 'uuid'
import jsPDF from 'jspdf'
import { useBookStore } from '../store/bookStore'
import { useCoverStore } from '../store/coverStore'
import { CoverLayer, TextLayer, ImageLayer } from '../types'
import { BOOK_FORMATS } from '../constants/bookFormats'

// ─── Constants ─────────────────────────────────────────────────────────────────
const PX_PER_IN = 72
const BLEED_IN = 0.125
const SAFE_ZONE_IN = 0.25
const HIGH_RES_RATIO = 300 / 72  // ≈4.167 for 300 DPI export
const ZOOM_STEP = 0.1
const ZOOM_MIN  = 0.25
const ZOOM_MAX  = 2.0
const FONT_FAMILIES = [
  'EB Garamond',
  'Georgia',
  'Times New Roman',
  'Arial',
  'Helvetica',
  'Verdana',
  'Courier New',
  'Impact',
]

// ─── Snap helper ───────────────────────────────────────────────────────────────
function snapPos(
  pos: { x: number; y: number },
  layerW: number,
  layerH: number,
  stageW: number,
  stageH: number
): { x: number; y: number } {
  const THRESH = 8
  let { x, y } = pos
  if (Math.abs(x + layerW / 2 - stageW / 2) < THRESH) x = stageW / 2 - layerW / 2
  if (Math.abs(y + layerH / 2 - stageH / 2) < THRESH) y = stageH / 2 - layerH / 2
  return { x, y }
}

// ─── Text style helpers ────────────────────────────────────────────────────────
function toggleBoldStyle(layer: TextLayer): Partial<TextLayer> {
  const cur = layer.fontStyle ?? ''
  const wasBold = cur.includes('bold')
  const isItalic = cur.includes('italic')
  const next = wasBold ? (isItalic ? 'italic' : '') : isItalic ? 'bold italic' : 'bold'
  return { fontStyle: next }
}

function toggleItalicStyle(layer: TextLayer): Partial<TextLayer> {
  const cur = layer.fontStyle ?? ''
  const wasItalic = cur.includes('italic')
  const isBold = cur.includes('bold')
  const next = wasItalic ? (isBold ? 'bold' : '') : isBold ? 'bold italic' : 'italic'
  return { fontStyle: next }
}

function toggleUnderlineStyle(layer: TextLayer): Partial<TextLayer> {
  return { textDecoration: layer.textDecoration === 'underline' ? '' : 'underline' }
}

// ─── LayerList ──────────────────────────────────────────────────────────────────
interface LayerListProps {
  activeLayers: CoverLayer[]
  activeSetLayers: React.Dispatch<React.SetStateAction<CoverLayer[]>>
  selectedId: string | null
  setSelectedId: (id: string | null) => void
}

function LayerList({ activeLayers, activeSetLayers, selectedId, setSelectedId }: LayerListProps): React.JSX.Element {
  const [dragId, setDragId] = useState<string | null>(null)
  const [dropOverId, setDropOverId] = useState<string | null>(null)

  // Display order: reversed (top of list = frontmost = highest array index)
  const displayed = [...activeLayers].reverse()

  const moveLayer = (id: string, dir: 1 | -1): void => {
    activeSetLayers((prev) => {
      const idx = prev.findIndex((l) => l.id === id)
      if (idx < 0) return prev
      const next = [...prev]
      const swapIdx = idx + dir
      if (swapIdx < 0 || swapIdx >= next.length) return prev
      ;[next[idx], next[swapIdx]] = [next[swapIdx], next[idx]]
      return next
    })
  }

  const toggleVisibility = (id: string): void => {
    activeSetLayers((prev) =>
      prev.map((l) => (l.id === id ? { ...l, visible: !l.visible } : l))
    )
  }

  const deleteLayer = (id: string): void => {
    activeSetLayers((prev) => prev.filter((l) => l.id !== id))
    if (selectedId === id) setSelectedId(null)
  }

  const handleDragStart = (id: string): void => {
    setDragId(id)
  }

  const handleDragOver = (e: React.DragEvent, id: string): void => {
    e.preventDefault()
    setDropOverId(id)
  }

  const handleDrop = (targetId: string): void => {
    if (!dragId || dragId === targetId) {
      setDragId(null)
      setDropOverId(null)
      return
    }
    activeSetLayers((prev) => {
      const fromIdx = prev.findIndex((l) => l.id === dragId)
      const toIdx = prev.findIndex((l) => l.id === targetId)
      if (fromIdx < 0 || toIdx < 0) return prev
      const next = [...prev]
      const [removed] = next.splice(fromIdx, 1)
      next.splice(toIdx, 0, removed)
      return next
    })
    setDragId(null)
    setDropOverId(null)
  }

  const handleDragEnd = (): void => {
    setDragId(null)
    setDropOverId(null)
  }

  return (
    <div className="flex flex-col gap-0.5 mt-1">
      {displayed.map((layer) => {
        const arrIdx = activeLayers.findIndex((l) => l.id === layer.id)
        const isSelected = selectedId === layer.id
        const isDragging = dragId === layer.id
        const isDropTarget = dropOverId === layer.id && dragId !== layer.id
        const label = layer.type === 'text' ? (layer as TextLayer).text?.slice(0, 20) || 'Text' : 'Image'

        return (
          <div
            key={layer.id}
            draggable
            onDragStart={() => handleDragStart(layer.id)}
            onDragOver={(e) => handleDragOver(e, layer.id)}
            onDrop={() => handleDrop(layer.id)}
            onDragEnd={handleDragEnd}
            onClick={() => setSelectedId(layer.id)}
            className={`group flex items-center gap-1 px-2 py-1.5 rounded cursor-pointer select-none transition-colors text-xs ${
              isSelected
                ? 'bg-[var(--accent)]/15 text-[var(--fg)]'
                : 'hover:bg-[var(--bg-subtle)] text-[var(--fg-muted)]'
            } ${isDragging ? 'opacity-40' : ''} ${isDropTarget ? 'ring-1 ring-[var(--accent)]' : ''}`}
          >
            {/* Drag handle */}
            <span className="text-[var(--fg-faint)] cursor-grab opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
              <svg width="10" height="10" viewBox="0 0 10 10" fill="currentColor">
                <circle cx="3" cy="2.5" r="1"/><circle cx="7" cy="2.5" r="1"/>
                <circle cx="3" cy="5" r="1"/><circle cx="7" cy="5" r="1"/>
                <circle cx="3" cy="7.5" r="1"/><circle cx="7" cy="7.5" r="1"/>
              </svg>
            </span>

            {/* Type icon */}
            <span className="flex-shrink-0 text-[var(--fg-faint)]">
              {layer.type === 'text' ? (
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="4 7 4 4 20 4 20 7"/><line x1="9" y1="20" x2="15" y2="20"/><line x1="12" y1="4" x2="12" y2="20"/></svg>
              ) : (
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>
              )}
            </span>

            {/* Label */}
            <span className="flex-1 truncate">{label}</span>

            {/* Controls — show on hover or selected */}
            <span className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
              {/* Move up (toward front) */}
              <button
                onClick={(e) => { e.stopPropagation(); moveLayer(layer.id, 1) }}
                disabled={arrIdx === activeLayers.length - 1}
                className="p-0.5 rounded hover:bg-[var(--border)] disabled:opacity-30 disabled:cursor-not-allowed"
                title="Move forward"
              >
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="18 15 12 9 6 15"/></svg>
              </button>
              {/* Move down (toward back) */}
              <button
                onClick={(e) => { e.stopPropagation(); moveLayer(layer.id, -1) }}
                disabled={arrIdx === 0}
                className="p-0.5 rounded hover:bg-[var(--border)] disabled:opacity-30 disabled:cursor-not-allowed"
                title="Move backward"
              >
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="6 9 12 15 18 9"/></svg>
              </button>
              {/* Visibility toggle */}
              <button
                onClick={(e) => { e.stopPropagation(); toggleVisibility(layer.id) }}
                className="p-0.5 rounded hover:bg-[var(--border)]"
                title={layer.visible ? 'Hide layer' : 'Show layer'}
              >
                {!layer.visible ? (
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/><path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/><line x1="1" y1="1" x2="23" y2="23"/></svg>
                ) : (
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                )}
              </button>
              {/* Delete */}
              <button
                onClick={(e) => { e.stopPropagation(); deleteLayer(layer.id) }}
                className="p-0.5 rounded hover:bg-red-500/20 text-red-400"
                title="Delete layer"
              >
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
              </button>
            </span>
          </div>
        )
      })}
    </div>
  )
}

// ─── KonvaImageNode ─────────────────────────────────────────────────────────────
interface KonvaImageNodeProps {
  layer: ImageLayer
  stageW: number
  stageH: number
  onSelect: () => void
  onDragEnd: (x: number, y: number) => void
  onTransformEnd: (patch: Partial<ImageLayer>) => void
}

function KonvaImageNode({
  layer,
  stageW,
  stageH,
  onSelect,
  onDragEnd,
  onTransformEnd,
}: KonvaImageNodeProps): React.JSX.Element | null {
  const [htmlImg, setHtmlImg] = useState<HTMLImageElement | null>(null)
  const nodeRef = useRef<Konva.Image>(null)

  useEffect(() => {
    const img = new window.Image() as HTMLImageElement
    img.onload = () => setHtmlImg(img)
    img.src = layer.src
  }, [layer.src])

  useEffect(() => {
    const node = nodeRef.current
    if (!node || !htmlImg) return
    const filters: ((imageData: ImageData) => void)[] = []
    if (layer.brightness !== 0)
      filters.push(Konva.Filters.Brighten as (imageData: ImageData) => void)
    if (layer.contrast !== 0)
      filters.push(Konva.Filters.Contrast as (imageData: ImageData) => void)
    if (layer.grayscale)
      filters.push(Konva.Filters.Grayscale as (imageData: ImageData) => void)
    node.filters(filters)
    ;(node as Konva.Image & { brightness(v: number): void }).brightness(layer.brightness)
    ;(node as Konva.Image & { contrast(v: number): void }).contrast(layer.contrast)
    // Only cache when filters are active — caching without filters freezes the
    // bitmap at its original size and breaks resize / Fit to Page.
    if (filters.length > 0) {
      node.cache()
    } else {
      node.clearCache()
    }
    node.getLayer()?.batchDraw()
  // layer.width / layer.height in deps so cache is refreshed after a resize.
  }, [htmlImg, layer.brightness, layer.contrast, layer.grayscale, layer.width, layer.height])

  if (!htmlImg) return null

  return (
    <KonvaImageEl
      ref={nodeRef}
      id={layer.id}
      image={htmlImg}
      x={layer.x}
      y={layer.y}
      width={layer.width}
      height={layer.height}
      rotation={layer.rotation}
      opacity={layer.opacity ?? 1}
      draggable
      onClick={onSelect}
      dragBoundFunc={(pos) => snapPos(pos, layer.width, layer.height, stageW, stageH)}
      onDragEnd={(e) => onDragEnd(e.target.x(), e.target.y())}
      onTransformEnd={(e) => {
        const node = e.target
        const newW = Math.round(node.width() * node.scaleX())
        const newH = Math.round(node.height() * node.scaleY())
        node.scaleX(1)
        node.scaleY(1)
        onTransformEnd({ x: node.x(), y: node.y(), rotation: node.rotation(), width: newW, height: newH })
      }}
    />
  )
}

// ─── SpreadSection ───────────────────────────────────────────────────────────
// A single section of the full-spread view (Back, Spine, or Front).
interface SpreadSectionProps {
  stageRef: React.RefObject<Konva.Stage>
  layers: CoverLayer[]
  setLayers: React.Dispatch<React.SetStateAction<CoverLayer[]>>
  bgColor: string
  width: number
  height: number
  label: string
  showBleed: boolean
  bleedPx: number
  selectedId: string | null
  setSelectedId: (id: string | null) => void
  onFocusSection: () => void
}

function SpreadSection({
  stageRef,
  layers,
  setLayers,
  bgColor,
  width,
  height,
  label,
  showBleed,
  bleedPx,
  selectedId,
  setSelectedId,
  onFocusSection,
}: SpreadSectionProps): React.JSX.Element {
  const transformerRef = useRef<Konva.Transformer>(null)

  useEffect(() => {
    const tr = transformerRef.current
    if (!tr) return
    if (!selectedId) { tr.nodes([]); return }
    const node = stageRef.current?.findOne('#' + selectedId)
    if (node) { tr.nodes([node]); tr.getLayer()?.batchDraw() }
    else tr.nodes([])
  }, [selectedId, layers, stageRef])

  const updateLayer = (id: string, patch: Partial<CoverLayer>): void => {
    setLayers((prev) => prev.map((l) => (l.id === id ? ({ ...l, ...patch } as CoverLayer) : l)))
  }

  const selectedLayer = layers.find((l) => l.id === selectedId) ?? null

  return (
    <div className="flex flex-col items-center">
      <span className="text-[10px] text-[var(--fg-faint)] mb-1 font-medium uppercase tracking-wider">{label}</span>
      <div
        className="relative"
        style={{ width, height }}
        onClick={onFocusSection}
      >
        <Stage
          ref={stageRef}
          width={width}
          height={height}
          style={{ boxShadow: '0 2px 12px rgba(0,0,0,0.18)' }}
          onClick={() => setSelectedId(null)}
        >
          <Layer>
            <Rect x={0} y={0} width={width} height={height} fill={bgColor} onClick={() => setSelectedId(null)} />
            {layers.filter((l) => l.visible).map((layer) =>
              layer.type === 'image' ? (
                <KonvaImageNode
                  key={layer.id}
                  layer={layer}
                  stageW={width}
                  stageH={height}
                  onSelect={() => { onFocusSection(); setSelectedId(layer.id) }}
                  onDragEnd={(x, y) => updateLayer(layer.id, { x, y })}
                  onTransformEnd={(patch) => updateLayer(layer.id, patch)}
                />
              ) : (
                <Text
                  key={layer.id}
                  id={layer.id}
                  x={layer.x}
                  y={layer.y}
                  width={layer.width}
                  text={layer.text}
                  fontSize={layer.fontSize}
                  fontFamily={layer.fontFamily}
                  fill={layer.fill}
                  letterSpacing={layer.letterSpacing}
                  lineHeight={layer.lineHeight}
                  rotation={layer.rotation}
                  fontStyle={layer.fontStyle ?? ''}
                  textDecoration={layer.textDecoration ?? ''}
                  align={layer.align ?? 'left'}
                  opacity={layer.opacity ?? 1}
                  wrap="word"
                  draggable
                  dragBoundFunc={(pos) =>
                    snapPos(pos, layer.width, layer.fontSize * 1.2, width, height)
                  }
                  onClick={() => { onFocusSection(); setSelectedId(layer.id) }}
                  onDragEnd={(e) => updateLayer(layer.id, { x: e.target.x(), y: e.target.y() })}
                  onTransformEnd={(e) => {
                    const node = e.target as Konva.Text
                    const newWidth = Math.max(Math.round(node.width() * node.scaleX()), 20)
                    node.setAttrs({ width: newWidth, scaleX: 1, scaleY: 1 })
                    updateLayer(layer.id, { x: node.x(), y: node.y(), rotation: node.rotation(), width: newWidth })
                  }}
                />
              )
            )}
            <Transformer
              ref={transformerRef}
              enabledAnchors={
                selectedLayer?.type === 'text'
                  ? ['middle-left', 'middle-right']
                  : ['top-left','top-center','top-right','middle-right','middle-left','bottom-left','bottom-center','bottom-right']
              }
              boundBoxFunc={(oldBox, newBox) => (newBox.width < 10 || newBox.height < 10 ? oldBox : newBox)}
            />
          </Layer>
        </Stage>
        {showBleed && (
          <div className="absolute inset-0 pointer-events-none">
            <div style={{ position: 'absolute', inset: `${bleedPx}px`, border: '1px dashed rgba(239,68,68,0.75)' }} />
            <span style={{
              position: 'absolute', top: bleedPx + 3, left: bleedPx + 4,
              fontSize: 8, color: 'rgba(239,68,68,0.85)', userSelect: 'none', fontFamily: 'monospace'
            }}>Bleed</span>
          </div>
        )}
      </div>
    </div>
  )
}

// ─── CoverDesignTab ─────────────────────────────────────────────────────────────
export default function CoverDesignTab(): React.JSX.Element {
  const { currentBook } = useBookStore()
  const { setFront, setBack, setSpread } = useCoverStore()

  // View
  const [view, setView] = useState<'front' | 'back' | 'spread'>('front')

  // Layers
  const [frontLayers, setFrontLayers] = useState<CoverLayer[]>([])
  const [backLayers, setBackLayers] = useState<CoverLayer[]>([])
  const [spineLayers, setSpineLayers] = useState<CoverLayer[]>([])

  // Selection
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [spreadFocus, setSpreadFocus] = useState<'front' | 'back' | 'spine'>('front')

  // Spine
  const [totalPages, setTotalPages] = useState(200)

  // Background colours
  const [frontBgColor, setFrontBgColor] = useState('#ffffff')
  const [backBgColor, setBackBgColor] = useState('#ffffff')
  const [spineBgColor, setSpineBgColor] = useState('#ffffff')

  // Guides
  const [showGuides, setShowGuides] = useState(true)

  // Save state
  const [autoSave, setAutoSave] = useState(false)
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved'>('idle')
  const autoSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const savedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Zoom
  const [zoom, setZoom] = useState(1.0)
  const zoomIn    = (): void => setZoom(z => Math.min(ZOOM_MAX, Math.round((z + ZOOM_STEP) * 10) / 10))
  const zoomOut   = (): void => setZoom(z => Math.max(ZOOM_MIN, Math.round((z - ZOOM_STEP) * 10) / 10))
  const zoomReset = (): void => setZoom(1.0)

  // Export dropdown
  const [exportMenuOpen, setExportMenuOpen] = useState(false)

  // Init flag
  const [initialized, setInitialized] = useState(false)

  // Stage refs (single-view)
  const stageRef = useRef<Konva.Stage>(null)
  const transformerRef = useRef<Konva.Transformer>(null)

  // Stage refs (spread view)
  const frontSpreadRef = useRef<Konva.Stage>(null)
  const backSpreadRef = useRef<Konva.Stage>(null)
  const spineSpreadRef = useRef<Konva.Stage>(null)

  // ── Derived values ──────────────────────────────────────────────────────────
  const fmt =
    (currentBook?.format ? BOOK_FORMATS[currentBook.format] : undefined) ??
    BOOK_FORMATS['trade-paperback']
  const canvasW = Math.round(fmt.widthIn * PX_PER_IN)
  const canvasH = Math.round(fmt.heightIn * PX_PER_IN)

  const spineWidthIn = totalPages * 0.00225
  const spineWidthPx = Math.max(4, Math.round(spineWidthIn * PX_PER_IN))

  const bleedPx = Math.round(BLEED_IN * PX_PER_IN)
  const safeZonePx = Math.round(SAFE_ZONE_IN * PX_PER_IN)

  // Active side layers (for non-spread editing)
  const layers = view === 'back' ? backLayers : frontLayers
  const setLayers = view === 'back' ? setBackLayers : setFrontLayers
  const bgColor = view === 'back' ? backBgColor : frontBgColor
  const setBgColor = view === 'back' ? setBackBgColor : setFrontBgColor

  const selectedLayer = layers.find((l) => l.id === selectedId) ?? null

  // ── Initialize default layers (or restore saved design) ─────────────────────
  useEffect(() => {
    if (initialized || !currentBook) return
    const title = currentBook.name
    const author = currentBook.author ?? '[Author Name]'

    window.electron.cover.loadDesign(currentBook.id).then(async (saved: unknown) => {
      type Design = {
        frontLayers: CoverLayer[]; backLayers: CoverLayer[]; spineLayers: CoverLayer[]
        frontBgColor: string; backBgColor: string; spineBgColor: string
      }
      if (saved && typeof saved === 'object') {
        const d = saved as Design
        setFrontLayers(d.frontLayers ?? [])
        setBackLayers(d.backLayers ?? [])
        setSpineLayers(d.spineLayers ?? [])
        if (d.frontBgColor) setFrontBgColor(d.frontBgColor)
        if (d.backBgColor) setBackBgColor(d.backBgColor)
        if (d.spineBgColor) setSpineBgColor(d.spineBgColor)
        // Restore rendered previews into coverStore
        const [frontUrl, backUrl, spreadUrl] = await Promise.all([
          window.electron.cover.loadRendered(currentBook.id, 'front'),
          window.electron.cover.loadRendered(currentBook.id, 'back'),
          window.electron.cover.loadRendered(currentBook.id, 'spread'),
        ])
        if (frontUrl) setFront(frontUrl as string)
        if (backUrl) setBack(backUrl as string)
        if (spreadUrl) setSpread(spreadUrl as string)
      } else {
        // No saved design — create defaults
        setFrontLayers([
          {
            id: uuidv4(), type: 'text', x: 20, y: Math.round(canvasH * 0.2),
            rotation: 0, visible: true, text: title,
            fontSize: 36, fontFamily: 'EB Garamond', fill: '#1c1917',
            letterSpacing: 0, lineHeight: 1.2, width: canvasW - 40,
            locked: true, metadataKey: 'title',
          },
          {
            id: uuidv4(), type: 'text', x: 20, y: Math.round(canvasH * 0.35),
            rotation: 0, visible: true, text: `by ${author}`,
            fontSize: 20, fontFamily: 'EB Garamond', fill: '#78716c',
            letterSpacing: 0, lineHeight: 1.2, width: canvasW - 40,
            locked: true, metadataKey: 'author',
          },
        ])
        setBackLayers([
          {
            id: uuidv4(), type: 'text', x: 20, y: 40,
            rotation: 0, visible: true, text: currentBook.synopsis || '[Book synopsis goes here…]',
            fontSize: 13, fontFamily: 'EB Garamond', fill: '#1c1917',
            letterSpacing: 0, lineHeight: 1.5, width: canvasW - 40,
          },
        ])
        setSpineLayers([
          {
            id: uuidv4(), type: 'text',
            x: Math.round(spineWidthPx / 2),
            y: canvasH - bleedPx - 20,
            rotation: -90, visible: true,
            text: title,
            fontSize: Math.min(Math.floor(spineWidthPx * 0.55), 16),
            fontFamily: 'EB Garamond', fill: '#1c1917',
            letterSpacing: 1, lineHeight: 1.0,
            width: canvasH - (bleedPx + 20) * 2,
            locked: true, metadataKey: 'title',
          },
        ])
      }
      setInitialized(true)
    })
  }, [currentBook, initialized, canvasW, canvasH, spineWidthPx, bleedPx, setFront, setBack, setSpread])

  // ── Metadata sync for locked layers ─────────────────────────────────────────
  useEffect(() => {
    if (!currentBook || !initialized) return
    const sync = (setFn: React.Dispatch<React.SetStateAction<CoverLayer[]>>): void => {
      setFn((prev) =>
        prev.map((l) => {
          if (l.type !== 'text' || !l.locked) return l
          if (l.metadataKey === 'title') return { ...l, text: currentBook.name }
          if (l.metadataKey === 'author')
            return { ...l, text: `by ${currentBook.author ?? '[Author Name]'}` }
          return l
        })
      )
    }
    sync(setFrontLayers)
    sync(setBackLayers)
    sync(setSpineLayers)
  }, [currentBook?.name, currentBook?.author, initialized])

  // ── Attach transformer ───────────────────────────────────────────────────────
  useEffect(() => {
    const tr = transformerRef.current
    if (!tr) return
    if (!selectedId) { tr.nodes([]); return }
    const node = stageRef.current?.findOne('#' + selectedId)
    if (node) { tr.nodes([node]); tr.getLayer()?.batchDraw() }
    else tr.nodes([])
  }, [selectedId, layers])

  // ── Sync to coverStore ───────────────────────────────────────────────────────
  useEffect(() => {
    if (!initialized) return
    const timer = setTimeout(() => {
      if (!stageRef.current) return
      const dataUrl = stageRef.current.toDataURL({ pixelRatio: 2 })
      if (view === 'front') setFront(dataUrl)
      else if (view === 'back') setBack(dataUrl)
    }, 400)
    return () => clearTimeout(timer)
  }, [layers, view, canvasW, canvasH, initialized, setFront, setBack])

  // ── Layer manipulation ───────────────────────────────────────────────────────
  const updateLayer = useCallback((id: string, patch: Partial<CoverLayer>): void => {
    setLayers((prev) => prev.map((l) => (l.id === id ? ({ ...l, ...patch } as CoverLayer) : l)))
  }, [setLayers])

  const deleteLayer = (id: string): void => {
    setLayers((prev) => prev.filter((l) => l.id !== id))
    if (selectedId === id) setSelectedId(null)
  }

  const toggleVisible = (id: string): void => {
    setLayers((prev) => prev.map((l) => (l.id === id ? { ...l, visible: !l.visible } : l)))
  }

  // ── Spread: determine which setter to use for the focused section ────────────
  const spreadLayers = spreadFocus === 'back' ? backLayers : spreadFocus === 'spine' ? spineLayers : frontLayers
  const setSpreadLayers = spreadFocus === 'back' ? setBackLayers : spreadFocus === 'spine' ? setSpineLayers : setFrontLayers
  const spreadBgColor = spreadFocus === 'back' ? backBgColor : spreadFocus === 'spine' ? spineBgColor : frontBgColor
  const setSpreadBgColor = spreadFocus === 'back' ? setBackBgColor : spreadFocus === 'spine' ? setSpineBgColor : setFrontBgColor
  const spreadSelectedLayer = spreadLayers.find((l) => l.id === selectedId) ?? null

  // ── Add actions ──────────────────────────────────────────────────────────────
  const addTextLayer = (): void => {
    const targetSetLayers = view === 'spread' ? setSpreadLayers : setLayers
    const targetCanvasW = view === 'spread' && spreadFocus === 'spine' ? spineWidthPx : canvasW
    const layer: TextLayer = {
      id: uuidv4(), type: 'text', x: 40, y: 40, rotation: 0, visible: true,
      text: 'New Text', fontSize: 24, fontFamily: 'EB Garamond', fill: '#1c1917',
      letterSpacing: 0, lineHeight: 1.2, width: Math.round(targetCanvasW * 0.7),
    }
    targetSetLayers((prev) => [...prev, layer])
    setSelectedId(layer.id)
  }

  const addImageLayer = async (): Promise<void> => {
    const targetSetLayers = view === 'spread' ? setSpreadLayers : (view === 'front' ? setFrontLayers : setBackLayers)
    const dataUrl = await window.electron.image.openDialog()
    if (!dataUrl) return
    const img = new window.Image() as HTMLImageElement
    img.src = dataUrl
    await new Promise<void>((resolve) => { img.onload = () => resolve() })
    const aspect = img.naturalHeight / img.naturalWidth
    const w = Math.min(canvasW * 0.8, img.naturalWidth)
    const layer: ImageLayer = {
      id: uuidv4(), type: 'image', x: 20, y: 20, rotation: 0, visible: true,
      src: dataUrl, width: Math.round(w), height: Math.round(w * aspect),
      brightness: 0, contrast: 0, grayscale: false,
    }
    targetSetLayers((prev) => [layer, ...prev])
    setSelectedId(layer.id)
  }

  // ── Export functions ─────────────────────────────────────────────────────────
  const exportSidePng = async (): Promise<void> => {
    if (!stageRef.current || !currentBook) return
    const dataUrl = stageRef.current.toDataURL({ pixelRatio: HIGH_RES_RATIO })
    await window.electron.cover.savePng(currentBook.id, dataUrl, view === 'back' ? 'back' : 'front')
  }

  const exportSpreadPng = async (): Promise<void> => {
    if (!backSpreadRef.current || !spineSpreadRef.current || !frontSpreadRef.current || !currentBook) return
    const ratio = HIGH_RES_RATIO
    const backCanvas = backSpreadRef.current.toCanvas({ pixelRatio: ratio }) as HTMLCanvasElement
    const spineCanvas = spineSpreadRef.current.toCanvas({ pixelRatio: ratio }) as HTMLCanvasElement
    const frontCanvas = frontSpreadRef.current.toCanvas({ pixelRatio: ratio }) as HTMLCanvasElement
    const totalW = backCanvas.width + spineCanvas.width + frontCanvas.width
    const h = backCanvas.height
    const offscreen = document.createElement('canvas')
    offscreen.width = totalW
    offscreen.height = h
    const ctx = offscreen.getContext('2d')!
    ctx.drawImage(backCanvas, 0, 0)
    ctx.drawImage(spineCanvas, backCanvas.width, 0)
    ctx.drawImage(frontCanvas, backCanvas.width + spineCanvas.width, 0)
    const dataUrl = offscreen.toDataURL('image/png')
    setSpread(dataUrl)
    await window.electron.cover.savePng(currentBook.id, dataUrl, 'spread')
  }

  const exportSpreadPdf = async (): Promise<void> => {
    if (!backSpreadRef.current || !spineSpreadRef.current || !frontSpreadRef.current || !currentBook) return
    const ratio = HIGH_RES_RATIO
    const backCanvas = backSpreadRef.current.toCanvas({ pixelRatio: ratio }) as HTMLCanvasElement
    const spineCanvas = spineSpreadRef.current.toCanvas({ pixelRatio: ratio }) as HTMLCanvasElement
    const frontCanvas = frontSpreadRef.current.toCanvas({ pixelRatio: ratio }) as HTMLCanvasElement
    const totalW = backCanvas.width + spineCanvas.width + frontCanvas.width
    const h = backCanvas.height
    const offscreen = document.createElement('canvas')
    offscreen.width = totalW
    offscreen.height = h
    const ctx = offscreen.getContext('2d')!
    ctx.drawImage(backCanvas, 0, 0)
    ctx.drawImage(spineCanvas, backCanvas.width, 0)
    ctx.drawImage(frontCanvas, backCanvas.width + spineCanvas.width, 0)
    const dataUrl = offscreen.toDataURL('image/png')
    const spreadWidthIn = fmt.widthIn * 2 + spineWidthIn
    const pdf = new jsPDF({ orientation: 'landscape', unit: 'in', format: [spreadWidthIn, fmt.heightIn] })
    pdf.addImage(dataUrl, 'PNG', 0, 0, spreadWidthIn, fmt.heightIn)
    const base64 = pdf.output('datauristring').split(',')[1]
    await window.electron.export.savePdf(currentBook.name + ' Cover', base64)
  }

  // ── Resync locked layer helper ────────────────────────────────────────────────
  const resyncLayer = (id: string, layer: TextLayer): void => {
    if (!currentBook) return
    const text =
      layer.metadataKey === 'title' ? currentBook.name
      : layer.metadataKey === 'author' ? `by ${currentBook.author ?? '[Author Name]'}`
      : layer.text
    updateLayer(id, { locked: true, text })
  }

  // ── Save cover to disk ───────────────────────────────────────────────────────
  const saveCover = useCallback(async (): Promise<void> => {
    if (!currentBook) return
    setSaveStatus('saving')
    try {
      const ratio = 2
      let frontDataUrl: string | null = null
      let backDataUrl: string | null = null
      let spreadDataUrl: string | null = null

      if (view === 'spread') {
        if (!backSpreadRef.current || !spineSpreadRef.current || !frontSpreadRef.current) return
        const backCanvas = backSpreadRef.current.toCanvas({ pixelRatio: ratio }) as HTMLCanvasElement
        const spineCanvas = spineSpreadRef.current.toCanvas({ pixelRatio: ratio }) as HTMLCanvasElement
        const frontCanvas = frontSpreadRef.current.toCanvas({ pixelRatio: ratio }) as HTMLCanvasElement
        const totalW = backCanvas.width + spineCanvas.width + frontCanvas.width
        const offscreen = document.createElement('canvas')
        offscreen.width = totalW
        offscreen.height = backCanvas.height
        const ctx = offscreen.getContext('2d')!
        ctx.drawImage(backCanvas, 0, 0)
        ctx.drawImage(spineCanvas, backCanvas.width, 0)
        ctx.drawImage(frontCanvas, backCanvas.width + spineCanvas.width, 0)
        spreadDataUrl = offscreen.toDataURL('image/png')
        frontDataUrl = frontSpreadRef.current.toDataURL({ pixelRatio: ratio })
        backDataUrl = backSpreadRef.current.toDataURL({ pixelRatio: ratio })
        setSpread(spreadDataUrl)
        setFront(frontDataUrl)
        setBack(backDataUrl)
      } else {
        if (!stageRef.current) return
        const dataUrl = stageRef.current.toDataURL({ pixelRatio: ratio })
        if (view === 'front') { frontDataUrl = dataUrl; setFront(dataUrl) }
        else { backDataUrl = dataUrl; setBack(dataUrl) }
      }

      // Save design JSON (full layer state, always)
      const design = { frontLayers, backLayers, spineLayers, frontBgColor, backBgColor, spineBgColor }
      await window.electron.cover.saveDesign(currentBook.id, design)

      // Save rendered PNGs to book dir (no dialog)
      if (frontDataUrl) await window.electron.cover.saveRendered(currentBook.id, frontDataUrl, 'front')
      if (backDataUrl) await window.electron.cover.saveRendered(currentBook.id, backDataUrl, 'back')
      if (spreadDataUrl) await window.electron.cover.saveRendered(currentBook.id, spreadDataUrl, 'spread')

      setSaveStatus('saved')
      if (savedTimerRef.current) clearTimeout(savedTimerRef.current)
      savedTimerRef.current = setTimeout(() => setSaveStatus('idle'), 2000)
    } catch {
      setSaveStatus('idle')
    }
  }, [currentBook, view, frontLayers, backLayers, spineLayers, frontBgColor, backBgColor, spineBgColor,
      setFront, setBack, setSpread, stageRef, backSpreadRef, spineSpreadRef, frontSpreadRef])

  // ── Auto-save: trigger saveCover 3 s after last change ───────────────────────
  useEffect(() => {
    if (!autoSave || !initialized) return
    if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current)
    autoSaveTimerRef.current = setTimeout(() => { saveCover() }, 3000)
    return () => {
      if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current)
    }
  }, [frontLayers, backLayers, spineLayers, frontBgColor, backBgColor, spineBgColor, autoSave, initialized, saveCover])

  if (!currentBook) return <></>

  // ── Export helpers ───────────────────────────────────────────────────────────
  const canExportFront  = view === 'front' || view === 'spread'
  const canExportBack   = view === 'back'  || view === 'spread'
  const canExportSpread = view === 'spread'

  const exportFrontPng = async (): Promise<void> => {
    const dataUrl =
      view === 'front' && stageRef.current
        ? stageRef.current.toDataURL({ pixelRatio: HIGH_RES_RATIO })
        : view === 'spread' && frontSpreadRef.current
          ? frontSpreadRef.current.toDataURL({ pixelRatio: HIGH_RES_RATIO })
          : null
    if (!dataUrl) return
    await window.electron.cover.savePng(currentBook.id, dataUrl, 'front')
    setExportMenuOpen(false)
  }

  const exportBackPng = async (): Promise<void> => {
    const dataUrl =
      view === 'back' && stageRef.current
        ? stageRef.current.toDataURL({ pixelRatio: HIGH_RES_RATIO })
        : view === 'spread' && backSpreadRef.current
          ? backSpreadRef.current.toDataURL({ pixelRatio: HIGH_RES_RATIO })
          : null
    if (!dataUrl) return
    await window.electron.cover.savePng(currentBook.id, dataUrl, 'back')
    setExportMenuOpen(false)
  }

  const doExportSpreadPng = async (): Promise<void> => {
    await exportSpreadPng()
    setExportMenuOpen(false)
  }

  // ── Active properties layer (spread or single) ──────────────────────────────
  const activePropLayer = view === 'spread' ? spreadSelectedLayer : selectedLayer
  const updateActivePropLayer = view === 'spread'
    ? (id: string, patch: Partial<CoverLayer>) =>
        setSpreadLayers((prev) => prev.map((l) => (l.id === id ? ({ ...l, ...patch } as CoverLayer) : l)))
    : updateLayer
  const activeCanvasW = view === 'spread' && spreadFocus === 'spine' ? spineWidthPx : canvasW
  const activeCanvasH = canvasH

  return (
    <div className="flex h-full w-full">
      {/* ── Main area ─────────────────────────────────────────────────────────── */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Toolbar */}
        <div className="flex-shrink-0 flex items-center gap-2 px-4 py-2 border-b border-[var(--border)] bg-[var(--bg)] flex-wrap">
          {/* View toggle */}
          <div className="flex gap-1">
            {(['front', 'back', 'spread'] as const).map((v) => (
              <button
                key={v}
                onClick={() => { setView(v); setSelectedId(null) }}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                  view === v
                    ? 'bg-[var(--accent)] text-white shadow-sm'
                    : 'text-[var(--fg-muted)] hover:bg-[var(--bg-subtle)] hover:text-[var(--fg)]'
                }`}
              >
                {v === 'front' ? 'Front Cover' : v === 'back' ? 'Back Cover' : 'Full Spread'}
              </button>
            ))}
          </div>

          {/* Pages count (spread only) */}
          {view === 'spread' && (
            <div className="flex items-center gap-1.5 border-l border-[var(--border)] pl-3">
              <label className="text-xs text-[var(--fg-muted)]">Pages</label>
              <input
                type="number"
                min={50}
                max={1200}
                value={totalPages}
                onChange={(e) => setTotalPages(Number(e.target.value))}
                className="w-16 px-1.5 py-1 text-xs rounded border border-[var(--border)] bg-[var(--bg)] text-[var(--fg)] focus:outline-none focus:border-[var(--accent)]"
              />
              <span className="text-xs text-[var(--fg-faint)]">
                Spine: {spineWidthIn.toFixed(3)}&quot;
              </span>
            </div>
          )}

          <div className="flex-1" />

          {/* Add Text */}
          <button
            onClick={addTextLayer}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium border border-[var(--border)] bg-[var(--bg)] text-[var(--fg)] hover:bg-[var(--bg-subtle)] transition-colors"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M4 7V4h16v3" /><path d="M9 20h6" /><path d="M12 4v16" />
            </svg>
            Add Text
          </button>

          {/* Add Image */}
          <button
            onClick={addImageLayer}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium border border-[var(--border)] bg-[var(--bg)] text-[var(--fg)] hover:bg-[var(--bg-subtle)] transition-colors"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect width="18" height="18" x="3" y="3" rx="2" /><circle cx="9" cy="9" r="2" /><path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21" />
            </svg>
            Add Image
          </button>

          {/* Save button */}
          <div className="flex items-center gap-1 border-r border-[var(--border)] pr-2">
            <button
              onClick={saveCover}
              disabled={saveStatus === 'saving'}
              title="Save cover to disk"
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium border transition-colors ${
                saveStatus === 'saved'
                  ? 'border-green-500 bg-green-500/10 text-green-500'
                  : 'border-[var(--border)] bg-[var(--bg)] text-[var(--fg)] hover:bg-[var(--bg-subtle)]'
              } disabled:opacity-50 disabled:cursor-not-allowed`}
            >
              {saveStatus === 'saving' ? (
                <>
                  <svg className="animate-spin w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M21 12a9 9 0 1 1-6.219-8.56" />
                  </svg>
                  Saving…
                </>
              ) : saveStatus === 'saved' ? (
                <>
                  <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M20 6 9 17l-5-5" />
                  </svg>
                  Saved
                </>
              ) : (
                <>
                  <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M15.2 3a2 2 0 0 1 1.4.6l3.8 3.8a2 2 0 0 1 .6 1.4V19a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z" />
                    <path d="M17 21v-7a1 1 0 0 0-1-1H8a1 1 0 0 0-1 1v7" />
                    <path d="M7 3v4a1 1 0 0 0 1 1h7" />
                  </svg>
                  Save
                </>
              )}
            </button>

            {/* Auto-save toggle */}
            <button
              onClick={() => setAutoSave((v) => !v)}
              title={autoSave ? 'Auto-save ON — saves 3 s after changes' : 'Auto-save OFF — click to enable'}
              className={`inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                autoSave
                  ? 'border-green-500 bg-green-500/10 text-green-500'
                  : 'border-[var(--border)] bg-[var(--bg)] text-[var(--fg-muted)] hover:bg-[var(--bg-subtle)]'
              }`}
            >
              <span className={`w-1.5 h-1.5 rounded-full ${autoSave ? 'bg-green-500 animate-pulse' : 'bg-[var(--fg-faint)]'}`} />
              Auto
            </button>
          </div>

          {/* Guides toggle */}
          <button
            onClick={() => setShowGuides((v) => !v)}
            title={showGuides ? 'Hide print guides' : 'Show print guides'}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium border transition-colors ${
              showGuides
                ? 'bg-[var(--bg-amber)] border-[var(--accent)] text-[var(--accent)]'
                : 'border-[var(--border)] bg-[var(--bg)] text-[var(--fg-muted)] hover:bg-[var(--bg-subtle)]'
            }`}
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M3 3v18h18" /><path d="M7 16l4-4 4 4 5-5" />
            </svg>
            Guides
          </button>

          {/* Zoom controls */}
          <div className="flex items-center border border-[var(--border)] rounded-lg overflow-hidden bg-[var(--bg)]">
            <button
              onClick={zoomOut}
              disabled={zoom <= ZOOM_MIN}
              className="px-2.5 py-1.5 text-sm text-[var(--fg-muted)] hover:bg-[var(--bg-subtle)] transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >−</button>
            <button
              onClick={zoomReset}
              title="Reset to 100%"
              className="px-2 py-1.5 text-xs font-mono text-[var(--fg)] min-w-[3.2rem] text-center hover:bg-[var(--bg-subtle)] transition-colors border-x border-[var(--border)]"
            >{Math.round(zoom * 100)}%</button>
            <button
              onClick={zoomIn}
              disabled={zoom >= ZOOM_MAX}
              className="px-2.5 py-1.5 text-sm text-[var(--fg-muted)] hover:bg-[var(--bg-subtle)] transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >+</button>
          </div>

        </div>

        {/* Canvas scroll area */}
        <div
          className="flex-1 overflow-auto bg-[var(--bg-surround)] flex items-start justify-center p-8"
          onClick={() => setSelectedId(null)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{ transform: `scale(${zoom})`, transformOrigin: 'top center' }}
          >
            {view === 'spread' ? (
              /* ── Spread view: Back | Spine | Front ── */
              <div className="flex items-start gap-0">
                <SpreadSection
                  stageRef={backSpreadRef}
                  layers={backLayers}
                  setLayers={setBackLayers}
                  bgColor={backBgColor}
                  width={canvasW}
                  height={canvasH}
                  label="Back Cover"
                  showBleed={showGuides}
                  bleedPx={bleedPx}
                  selectedId={selectedId}
                  setSelectedId={setSelectedId}
                  onFocusSection={() => setSpreadFocus('back')}
                />
                <SpreadSection
                  stageRef={spineSpreadRef}
                  layers={spineLayers}
                  setLayers={setSpineLayers}
                  bgColor={spineBgColor}
                  width={spineWidthPx}
                  height={canvasH}
                  label="Spine"
                  showBleed={false}
                  bleedPx={bleedPx}
                  selectedId={selectedId}
                  setSelectedId={setSelectedId}
                  onFocusSection={() => setSpreadFocus('spine')}
                />
                <SpreadSection
                  stageRef={frontSpreadRef}
                  layers={frontLayers}
                  setLayers={setFrontLayers}
                  bgColor={frontBgColor}
                  width={canvasW}
                  height={canvasH}
                  label="Front Cover"
                  showBleed={showGuides}
                  bleedPx={bleedPx}
                  selectedId={selectedId}
                  setSelectedId={setSelectedId}
                  onFocusSection={() => setSpreadFocus('front')}
                />
              </div>
            ) : (
              /* ── Single side view ── */
              <div
                className="relative"
                style={{ width: canvasW, height: canvasH }}
              >
                <Stage
                  ref={stageRef}
                  width={canvasW}
                  height={canvasH}
                  style={{ boxShadow: '0 4px 24px rgba(0,0,0,0.22), 0 1px 6px rgba(0,0,0,0.12)' }}
                >
                  <Layer>
                    <Rect
                      x={0} y={0} width={canvasW} height={canvasH}
                      fill={bgColor}
                      onClick={() => setSelectedId(null)}
                    />
                    {layers.filter((l) => l.visible).map((layer) =>
                      layer.type === 'image' ? (
                        <KonvaImageNode
                          key={layer.id}
                          layer={layer}
                          stageW={canvasW}
                          stageH={canvasH}
                          onSelect={() => setSelectedId(layer.id)}
                          onDragEnd={(x, y) => updateLayer(layer.id, { x, y })}
                          onTransformEnd={(patch) => updateLayer(layer.id, patch)}
                        />
                      ) : (
                        <Text
                          key={layer.id}
                          id={layer.id}
                          x={layer.x}
                          y={layer.y}
                          width={layer.width}
                          text={layer.text}
                          fontSize={layer.fontSize}
                          fontFamily={layer.fontFamily}
                          fill={layer.fill}
                          letterSpacing={layer.letterSpacing}
                          lineHeight={layer.lineHeight}
                          rotation={layer.rotation}
                          fontStyle={layer.fontStyle ?? ''}
                          textDecoration={layer.textDecoration ?? ''}
                          align={layer.align ?? 'left'}
                          opacity={layer.opacity ?? 1}
                          wrap="word"
                          draggable
                          dragBoundFunc={(pos) =>
                            snapPos(pos, layer.width, layer.fontSize * 1.2, canvasW, canvasH)
                          }
                          onClick={() => setSelectedId(layer.id)}
                          onDragEnd={(e) =>
                            updateLayer(layer.id, { x: e.target.x(), y: e.target.y() })
                          }
                          onTransformEnd={(e) => {
                            const node = e.target as Konva.Text
                            const newWidth = Math.max(Math.round(node.width() * node.scaleX()), 20)
                            node.setAttrs({ width: newWidth, scaleX: 1, scaleY: 1 })
                            updateLayer(layer.id, {
                              x: node.x(), y: node.y(), rotation: node.rotation(), width: newWidth,
                            })
                          }}
                        />
                      )
                    )}
                    <Transformer
                      ref={transformerRef}
                      enabledAnchors={
                        selectedLayer?.type === 'text'
                          ? ['middle-left', 'middle-right']
                          : ['top-left','top-center','top-right','middle-right','middle-left','bottom-left','bottom-center','bottom-right']
                      }
                      boundBoxFunc={(oldBox, newBox) =>
                        newBox.width < 10 || newBox.height < 10 ? oldBox : newBox
                      }
                    />
                  </Layer>
                </Stage>

                {/* Print guides overlay */}
                {showGuides && (
                  <div className="absolute inset-0 pointer-events-none">
                    {/* Bleed zone */}
                    <div
                      title="Bleed zone — keep important content inside this line to avoid being cut off during printing"
                      style={{
                        position: 'absolute',
                        inset: `${bleedPx}px`,
                        border: '1px dashed rgba(239,68,68,0.75)',
                      }}
                    />
                    <span style={{
                      position: 'absolute', top: bleedPx + 3, left: bleedPx + 4,
                      fontSize: 8, color: 'rgba(239,68,68,0.85)', userSelect: 'none', fontFamily: 'monospace',
                    }}>Bleed (0.125&quot;)</span>

                    {/* Safe zone — near spine fold */}
                    {view === 'front' && (
                      <>
                        <div
                          title="Safe zone — keep text 0.25&quot; from spine to prevent it from disappearing into the crease"
                          style={{
                            position: 'absolute', top: 0, bottom: 0,
                            left: `${safeZonePx}px`, width: 0,
                            borderLeft: '1px dashed rgba(59,130,246,0.7)',
                          }}
                        />
                        <span style={{
                          position: 'absolute', top: 4, left: safeZonePx + 3,
                          fontSize: 8, color: 'rgba(59,130,246,0.85)', userSelect: 'none', fontFamily: 'monospace',
                        }}>Safe</span>
                      </>
                    )}
                    {view === 'back' && (
                      <>
                        <div
                          title="Safe zone — keep text 0.25&quot; from spine to prevent it from disappearing into the crease"
                          style={{
                            position: 'absolute', top: 0, bottom: 0,
                            right: `${safeZonePx}px`, width: 0,
                            borderRight: '1px dashed rgba(59,130,246,0.7)',
                          }}
                        />
                        <span style={{
                          position: 'absolute', top: 4, right: safeZonePx + 3,
                          fontSize: 8, color: 'rgba(59,130,246,0.85)', userSelect: 'none', fontFamily: 'monospace',
                        }}>Safe</span>
                      </>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── Right sidebar ─────────────────────────────────────────────────────── */}
      <div className="w-64 flex-shrink-0 flex flex-col border-l border-[var(--border)] bg-[var(--bg)] overflow-hidden">
        {/* Layers list */}
        <div className="flex-1 overflow-y-auto p-3 min-h-0">
          <div className="text-[11px] font-semibold text-[var(--fg-faint)] uppercase tracking-widerr mb-2">
            Layers
            {view === 'spread' && (
              <span className="ml-1.5 text-[var(--accent)] capitalize normal-case font-normal">({spreadFocus})</span>
            )}
          </div>

          {(view === 'spread' ? spreadLayers : layers).length === 0 ? (
            <p className="text-xs text-[var(--fg-faint)] italic mt-1">
              No layers yet. Add text or an image using the toolbar.
            </p>
          ) : (
            <LayerList
              activeLayers={view === 'spread' ? spreadLayers : layers}
              activeSetLayers={view === 'spread' ? setSpreadLayers : setLayers}
              selectedId={selectedId}
              setSelectedId={setSelectedId}
            />
          )}
        </div>

        {/* Properties panel */}
        {activePropLayer && (
          <div className="border-t border-[var(--border)] p-3 flex-shrink-0 overflow-y-auto max-h-[60vh]">
            <div className="text-[11px] font-semibold text-[var(--fg-faint)] uppercase tracking-widerr mb-3">
              Properties
            </div>

            {/* Opacity — both types */}
            <div className="mb-3">
              <label className="block text-xs text-[var(--fg-muted)] mb-1">
                Opacity <span className="text-[var(--fg-faint)]">{Math.round((activePropLayer.opacity ?? 1) * 100)}%</span>
              </label>
              <input
                type="range" min={0} max={1} step={0.01}
                value={activePropLayer.opacity ?? 1}
                onChange={(e) => updateActivePropLayer(activePropLayer.id, { opacity: Number(e.target.value) })}
                className="w-full accent-[var(--accent)]"
              />
            </div>

            {activePropLayer.type === 'text' ? (
              <div className="space-y-3">
                {/* Metadata sync indicator */}
                {activePropLayer.metadataKey && (
                  <div className="flex items-center justify-between py-1.5 px-2 bg-amber-50 rounded-lg border border-amber-100">
                    <span className="text-xs text-[var(--fg-muted)]">
                      {activePropLayer.locked ? 'Synced with metadata' : 'Custom text'}
                    </span>
                    <button
                      onClick={() => {
                        if (activePropLayer.locked) {
                          updateActivePropLayer(activePropLayer.id, { locked: false })
                        } else {
                          resyncLayer(activePropLayer.id, activePropLayer)
                        }
                      }}
                      className="text-xs text-[var(--accent)] font-medium"
                    >
                      {activePropLayer.locked ? 'Unlock' : 'Re-sync'}
                    </button>
                  </div>
                )}

                {/* Content */}
                <div>
                  <label className="block text-xs text-[var(--fg-muted)] mb-1">Content</label>
                  <textarea
                    value={activePropLayer.text}
                    disabled={activePropLayer.locked}
                    onChange={(e) => updateActivePropLayer(activePropLayer.id, { text: e.target.value })}
                    rows={3}
                    className="w-full px-2 py-1.5 text-xs rounded-[10px] border border-[var(--border)] bg-[var(--bg)] text-[var(--fg)] focus:outline-none focus:border-[var(--accent)] resize-none leading-relaxed disabled:bg-[var(--bg)] disabled:text-[var(--fg-faint)] disabled:cursor-not-allowed"
                  />
                </div>

                {/* Bold / Italic / Underline */}
                <div>
                  <label className="block text-xs text-[var(--fg-muted)] mb-1.5">Style</label>
                  <div className="flex gap-1">
                    {([
                      { label: 'B', className: 'font-bold', key: 'bold', isActive: (activePropLayer.fontStyle ?? '').includes('bold') },
                      { label: 'I', className: 'italic', key: 'italic', isActive: (activePropLayer.fontStyle ?? '').includes('italic') },
                      { label: 'U', className: 'underline', key: 'underline', isActive: activePropLayer.textDecoration === 'underline' },
                    ] as const).map(({ label, className, key, isActive }) => (
                      <button
                        key={key}
                        onClick={() => {
                          const patch =
                            key === 'bold' ? toggleBoldStyle(activePropLayer)
                            : key === 'italic' ? toggleItalicStyle(activePropLayer)
                            : toggleUnderlineStyle(activePropLayer)
                          updateActivePropLayer(activePropLayer.id, patch)
                        }}
                        className={`w-8 h-8 text-xs rounded border transition-colors ${
                          isActive
                            ? 'bg-[var(--accent)] text-white border-[var(--accent)]'
                            : 'border-[var(--border)] text-[var(--fg-muted)] bg-[var(--bg)] hover:bg-[var(--bg-subtle)]'
                        }`}
                      >
                        <span className={className}>{label}</span>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Alignment */}
                <div>
                  <label className="block text-xs text-[var(--fg-muted)] mb-1.5">Alignment</label>
                  <div className="flex gap-1">
                    {(['left', 'center', 'right'] as const).map((a) => (
                      <button
                        key={a}
                        onClick={() => updateActivePropLayer(activePropLayer.id, { align: a })}
                        title={a}
                        className={`flex-1 py-1.5 text-xs rounded border transition-colors ${
                          (activePropLayer.align ?? 'left') === a
                            ? 'bg-[var(--accent)] text-white border-[var(--accent)]'
                            : 'border-[var(--border)] text-[var(--fg-muted)] bg-[var(--bg)] hover:bg-[var(--bg-subtle)]'
                        }`}
                      >
                        {a === 'left' ? (
                          <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="mx-auto">
                            <line x1="21" x2="3" y1="6" y2="6" /><line x1="15" x2="3" y1="12" y2="12" /><line x1="17" x2="3" y1="18" y2="18" />
                          </svg>
                        ) : a === 'center' ? (
                          <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="mx-auto">
                            <line x1="21" x2="3" y1="6" y2="6" /><line x1="17" x2="7" y1="12" y2="12" /><line x1="19" x2="5" y1="18" y2="18" />
                          </svg>
                        ) : (
                          <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="mx-auto">
                            <line x1="21" x2="3" y1="6" y2="6" /><line x1="21" x2="9" y1="12" y2="12" /><line x1="21" x2="7" y1="18" y2="18" />
                          </svg>
                        )}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Font family */}
                <div>
                  <label className="block text-xs text-[var(--fg-muted)] mb-1">Font Family</label>
                  <select
                    value={activePropLayer.fontFamily}
                    onChange={(e) => updateActivePropLayer(activePropLayer.id, { fontFamily: e.target.value })}
                    className="w-full px-2 py-1.5 text-xs rounded-[10px] border border-[var(--border)] bg-[var(--bg)] text-[var(--fg)] focus:outline-none focus:border-[var(--accent)]"
                  >
                    {FONT_FAMILIES.map((f) => <option key={f} value={f}>{f}</option>)}
                  </select>
                </div>

                {/* Font size + color */}
                <div className="flex gap-2">
                  <div className="flex-1">
                    <label className="block text-xs text-[var(--fg-muted)] mb-1">Size (pt)</label>
                    <input
                      type="number" min={6} max={200}
                      value={activePropLayer.fontSize}
                      onChange={(e) => updateActivePropLayer(activePropLayer.id, { fontSize: Number(e.target.value) })}
                      className="w-full px-2 py-1.5 text-xs rounded-[10px] border border-[var(--border)] bg-[var(--bg)] text-[var(--fg)] focus:outline-none focus:border-[var(--accent)]"
                    />
                  </div>
                  <div className="flex-shrink-0">
                    <label className="block text-xs text-[var(--fg-muted)] mb-1">Color</label>
                    <input
                      type="color" value={activePropLayer.fill}
                      onChange={(e) => updateActivePropLayer(activePropLayer.id, { fill: e.target.value })}
                      className="h-[30px] w-10 rounded-[10px] border border-[var(--border)] cursor-pointer bg-[var(--bg)] p-0.5"
                    />
                  </div>
                </div>

                {/* Letter spacing */}
                <div>
                  <label className="block text-xs text-[var(--fg-muted)] mb-1">
                    Letter Spacing <span className="text-[var(--fg-faint)]">{activePropLayer.letterSpacing} px</span>
                  </label>
                  <input
                    type="range" min={-5} max={20} step={0.5}
                    value={activePropLayer.letterSpacing}
                    onChange={(e) => updateActivePropLayer(activePropLayer.id, { letterSpacing: Number(e.target.value) })}
                    className="w-full accent-[var(--accent)]"
                  />
                </div>

                {/* Line height */}
                <div>
                  <label className="block text-xs text-[var(--fg-muted)] mb-1">
                    Line Height <span className="text-[var(--fg-faint)]">{activePropLayer.lineHeight.toFixed(1)}</span>
                  </label>
                  <input
                    type="range" min={0.8} max={3} step={0.1}
                    value={activePropLayer.lineHeight}
                    onChange={(e) => updateActivePropLayer(activePropLayer.id, { lineHeight: Number(e.target.value) })}
                    className="w-full accent-[var(--accent)]"
                  />
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                {/* Fit to page */}
                <button
                  onClick={() => updateActivePropLayer(activePropLayer.id, { x: 0, y: 0, width: activeCanvasW, height: activeCanvasH })}
                  className="w-full py-1.5 text-xs rounded-[10px] border border-[var(--border)] text-[var(--fg)] hover:bg-[var(--bg-subtle)] transition-colors"
                >
                  Fit to Page
                </button>

                {/* Brightness */}
                <div>
                  <label className="block text-xs text-[var(--fg-muted)] mb-1">
                    Brightness <span className="text-[var(--fg-faint)]">{activePropLayer.brightness.toFixed(2)}</span>
                  </label>
                  <input
                    type="range" min={-1} max={1} step={0.05}
                    value={activePropLayer.brightness}
                    onChange={(e) => updateActivePropLayer(activePropLayer.id, { brightness: Number(e.target.value) })}
                    className="w-full accent-[var(--accent)]"
                  />
                </div>

                {/* Contrast */}
                <div>
                  <label className="block text-xs text-[var(--fg-muted)] mb-1">
                    Contrast <span className="text-[var(--fg-faint)]">{activePropLayer.contrast}</span>
                  </label>
                  <input
                    type="range" min={-100} max={100} step={1}
                    value={activePropLayer.contrast}
                    onChange={(e) => updateActivePropLayer(activePropLayer.id, { contrast: Number(e.target.value) })}
                    className="w-full accent-[var(--accent)]"
                  />
                </div>

                {/* Grayscale */}
                <div className="flex items-center gap-2">
                  <input
                    id="grayscale-toggle" type="checkbox"
                    checked={activePropLayer.grayscale}
                    onChange={(e) => updateActivePropLayer(activePropLayer.id, { grayscale: e.target.checked })}
                    className="accent-[var(--accent)] cursor-pointer"
                  />
                  <label htmlFor="grayscale-toggle" className="text-xs text-[var(--fg)] cursor-pointer">Grayscale</label>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Background color + Export — always shown at bottom */}
        <div className="border-t border-[var(--border)] p-3 flex-shrink-0">
          <div className="flex items-center justify-between mb-1.5">
            <label className="text-xs text-[var(--fg-muted)]">Background Color</label>

            {/* Export dropdown */}
            <div className="relative">
              <button
                onClick={() => setExportMenuOpen((v) => !v)}
                className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-xs font-medium border border-[var(--border)] bg-[var(--bg)] text-[var(--fg)] hover:bg-[var(--bg-subtle)] transition-colors"
                title="Export cover images"
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>
                </svg>
                Export
              </button>

              {exportMenuOpen && (
                <>
                  {/* Click-outside backdrop */}
                  <div className="fixed inset-0 z-10" onClick={() => setExportMenuOpen(false)} />

                  {/* Menu — floats UP from button */}
                  <div className="absolute bottom-full right-0 mb-1.5 w-48 bg-[var(--bg-card)] border border-[var(--border)] rounded-lg shadow-xl overflow-hidden z-20">
                    {([
                      { label: 'Front Cover', fn: exportFrontPng,    enabled: canExportFront,  hint: 'Switch to Front Cover or Full Spread view' },
                      { label: 'Back Cover',  fn: exportBackPng,     enabled: canExportBack,   hint: 'Switch to Back Cover or Full Spread view' },
                      { label: 'Full Spread', fn: doExportSpreadPng, enabled: canExportSpread, hint: 'Switch to Full Spread view' },
                    ] as { label: string; fn: () => Promise<void>; enabled: boolean; hint: string }[]).map(({ label, fn, enabled, hint }) => (
                      <button
                        key={label}
                        onClick={enabled ? fn : undefined}
                        disabled={!enabled}
                        title={enabled ? `Export ${label} as PNG (300 DPI)` : hint}
                        className={`w-full flex items-center gap-2 px-3 py-2 text-xs text-left transition-colors ${
                          enabled
                            ? 'text-[var(--fg)] hover:bg-[var(--bg-subtle)] cursor-pointer'
                            : 'text-[var(--fg-faint)] cursor-not-allowed'
                        }`}
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>
                        </svg>
                        {label} PNG
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2">
            <input
              type="color"
              value={view === 'spread' ? spreadBgColor : bgColor}
              onChange={(e) => (view === 'spread' ? setSpreadBgColor : setBgColor)(e.target.value)}
              className="w-9 h-9 rounded-[10px] border border-[var(--border)] cursor-pointer p-0.5 bg-[var(--bg)]"
            />
            <span className="text-xs text-[var(--fg-muted)] font-mono">
              {(view === 'spread' ? spreadBgColor : bgColor).toUpperCase()}
            </span>
          </div>
          {view === 'spread' && (
            <p className="text-[10px] text-[var(--fg-faint)] mt-1 capitalize">Editing: {spreadFocus}</p>
          )}
        </div>
      </div>
    </div>
  )
}
