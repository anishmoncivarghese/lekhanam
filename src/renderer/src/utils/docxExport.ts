import {
  Document,
  Packer,
  Paragraph,
  TextRun,
  AlignmentType,
  convertInchesToTwip,
  UnderlineType,
  Table,
  TableRow,
  TableCell,
  WidthType,
  BorderStyle,
  FootnoteReferenceRun,
  ImageRun,
  Footer,
  PageNumber,
  NumberFormat,
  LineRuleType,
} from 'docx'
import { Book, Chapter, BookStyle, Act } from '../types'
import { getSection } from './pdfExport'

// ─── ProseMirror node type ────────────────────────────────────────────────────

interface PMNode {
  type: string
  text?: string
  content?: PMNode[]
  attrs?: Record<string, unknown>
  marks?: { type: string; attrs?: Record<string, unknown> }[]
}

// ─── Strip editor-only marks before export ───────────────────────────────────
// Annotation marks are editor-only (comments) and must not reach the docx library.
// Mirrors the same stripping done in pdfExport.ts before HTML generation.

function stripAnnotationMarks(node: PMNode): PMNode {
  const cleaned: PMNode = { ...node }
  if (cleaned.marks) {
    cleaned.marks = cleaned.marks.filter((m) => m.type !== 'annotation')
    if (cleaned.marks.length === 0) delete cleaned.marks
  }
  if (cleaned.content) {
    cleaned.content = cleaned.content.map(stripAnnotationMarks)
  }
  return cleaned
}

// ─── Footnote pre-pass — collect all footnote marks across chapters ───────────

// Maps footnote mark UUID → sequential DOCX footnote ID (1-based integer)
function collectFootnoteIds(chapters: PMNode[]): Map<string, number> {
  const map = new Map<string, number>()
  let counter = 1
  for (const doc of chapters) {
    const walk = (node: PMNode): void => {
      const fn = node.marks?.find(m => m.type === 'footnote')
      if (fn && fn.attrs?.id) {
        const id = fn.attrs.id as string
        if (!map.has(id)) map.set(id, counter++)
      }
      node.content?.forEach(walk)
    }
    walk(doc)
  }
  return map
}

// ─── Inline text node → TextRun (or FootnoteReferenceRun) ────────────────────

function toRun(
  node: PMNode,
  font: string,
  sizePt: number,
  fnIds?: Map<string, number>
): TextRun | FootnoteReferenceRun {
  const marks = node.marks ?? []
  const halfPts = sizePt * 2
  const fnMark = marks.find(m => m.type === 'footnote')
  if (fnMark && fnIds) {
    const id = fnIds.get(fnMark.attrs?.id as string)
    if (id !== undefined) return new FootnoteReferenceRun(id)
  }
  return new TextRun({
    text: node.text ?? '',
    font,
    size: halfPts,
    bold:      marks.some(m => m.type === 'bold'),
    italics:   marks.some(m => m.type === 'italic'),
    underline: marks.some(m => m.type === 'underline') ? { type: UnderlineType.SINGLE } : undefined,
    strike:    marks.some(m => m.type === 'strike'),
    highlight: marks.some(m => m.type === 'highlight') ? 'yellow' : undefined,
  })
}

// ─── Collect TextRuns from inline children ────────────────────────────────────

function inlineRuns(
  children: PMNode[],
  font: string,
  sizePt: number,
  prefix?: TextRun,
  fnIds?: Map<string, number>
): (TextRun | FootnoteReferenceRun)[] {
  const runs: (TextRun | FootnoteReferenceRun)[] = prefix ? [prefix] : []
  for (const ch of children) {
    if (ch.type === 'text') runs.push(toRun(ch, font, sizePt, fnIds))
    else if (ch.type === 'hardBreak') runs.push(new TextRun({ break: 1 }))
  }
  return runs.length > 0 ? runs : [new TextRun({ text: '', font, size: sizePt * 2 })]
}

// ─── Alignment helper ─────────────────────────────────────────────────────────

function toAlignment(textAlign?: string): AlignmentType | undefined {
  switch (textAlign) {
    case 'center':  return AlignmentType.CENTER
    case 'right':   return AlignmentType.RIGHT
    case 'justify': return AlignmentType.JUSTIFIED
    default:        return undefined
  }
}

// ─── Image helpers ────────────────────────────────────────────────────────────

function dataUrlToBytes(src: string): Uint8Array {
  const base64 = src.split(',')[1] ?? ''
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return bytes
}

function dataUrlToImageType(src: string): 'png' | 'jpg' | 'gif' | 'bmp' {
  const mime = src.split(';')[0].split(':')[1] ?? ''
  if (mime === 'image/jpeg' || mime === 'image/jpg') return 'jpg'
  if (mime === 'image/gif') return 'gif'
  if (mime === 'image/bmp') return 'bmp'
  return 'png'
}

function getImageDims(src: string): Promise<{ w: number; h: number }> {
  return new Promise((resolve) => {
    const img = new window.Image()
    img.onload = () => resolve({ w: img.naturalWidth, h: img.naturalHeight })
    img.onerror = () => resolve({ w: 400, h: 300 })
    img.src = src
  })
}

function collectImageSrcs(node: PMNode, out: Set<string>): void {
  if (node.type === 'image' && node.attrs?.src) out.add(node.attrs.src as string)
  node.content?.forEach(ch => collectImageSrcs(ch, out))
}

// ─── ProseMirror tree → (Paragraph | Table)[] ────────────────────────────────

function convert(
  node: PMNode,
  font: string,
  sizePt: number,
  lineSpacing: number,
  fnIds?: Map<string, number>,
  imgDims?: Map<string, { w: number; h: number }>,
  contentWPx?: number,
): (Paragraph | Table)[] {
  const line      = Math.round(lineSpacing * 240)         // headings — auto rule
  const lineExact = Math.round(sizePt * lineSpacing * 20) // body — exact twips matches CSS line-height
  const halfPts  = sizePt * 2
  const firstInd = convertInchesToTwip(0.3)
  const listInd  = convertInchesToTwip(0.5)

  switch (node.type) {
    case 'doc':
      return (node.content ?? []).flatMap(ch => convert(ch, font, sizePt, lineSpacing, fnIds, imgDims, contentWPx))

    case 'paragraph': {
      const alignment = toAlignment(node.attrs?.textAlign as string | undefined)
      return [new Paragraph({
        children: inlineRuns(node.content ?? [], font, sizePt, undefined, fnIds),
        spacing: { line: lineExact, lineRule: LineRuleType.EXACT, after: 0 },
        indent: { firstLine: firstInd },
        alignment,
        widowControl: true,
      })]
    }

    case 'heading': {
      const lvl = (node.attrs?.level as number) ?? 1
      const headingSize = lvl === 1 ? Math.round(halfPts * 1.6)
                        : lvl === 2 ? Math.round(halfPts * 1.3)
                        :             Math.round(halfPts * 1.15)
      const runs = (node.content ?? []).flatMap(ch => {
        if (ch.type === 'hardBreak') return [new TextRun({ break: 1 })]
        if (ch.type !== 'text') return []
        const fnMark = ch.marks?.find(m => m.type === 'footnote')
        if (fnMark && fnIds) {
          const id = fnIds.get(fnMark.attrs?.id as string)
          if (id !== undefined) return [new FootnoteReferenceRun(id)]
        }
        return [new TextRun({ text: ch.text ?? '', font, size: headingSize, bold: true })]
      })
      return [new Paragraph({
        children: runs.length > 0 ? runs : [new TextRun({ text: '', font, size: headingSize, bold: true })],
        spacing: { line, before: 240, after: 120 },
        alignment: toAlignment(node.attrs?.textAlign as string | undefined),
        widowControl: true,
        keepNext: true,
      })]
    }

    case 'bulletList':
      return (node.content ?? []).flatMap(item =>
        (item.content ?? []).flatMap((child, idx) => [
          new Paragraph({
            children: inlineRuns(
              child.content ?? [],
              font,
              sizePt,
              idx === 0 ? new TextRun({ text: '\u2022   ', font, size: halfPts }) : undefined,
              fnIds
            ),
            spacing: { line: lineExact, lineRule: LineRuleType.EXACT, after: 0 },
            indent: { left: listInd },
            widowControl: true,
          }),
        ])
      )

    case 'orderedList': {
      let n = (node.attrs?.start as number) ?? 1
      return (node.content ?? []).flatMap(item => {
        const num = n++
        return (item.content ?? []).flatMap((child, idx) => [
          new Paragraph({
            children: inlineRuns(
              child.content ?? [],
              font,
              sizePt,
              idx === 0 ? new TextRun({ text: `${num}.   `, font, size: halfPts }) : undefined,
              fnIds
            ),
            spacing: { line: lineExact, lineRule: LineRuleType.EXACT, after: 0 },
            indent: { left: listInd },
            widowControl: true,
          }),
        ])
      })
    }

    case 'blockquote':
      return (node.content ?? []).flatMap(ch => [
        new Paragraph({
          children: inlineRuns(ch.content ?? [], font, sizePt, undefined, fnIds),
          spacing: { line: lineExact, lineRule: LineRuleType.EXACT, after: 0 },
          indent: { left: convertInchesToTwip(0.5) },
          widowControl: true,
        }),
      ])

    case 'table': {
      const noBorder = { style: BorderStyle.NIL, size: 0, color: 'auto' }
      const cellBorder = { style: BorderStyle.SINGLE, size: 4, color: '999999' }
      const rows = (node.content ?? []).map(rowNode =>
        new TableRow({
          children: (rowNode.content ?? []).map(cellNode => {
            const isHeader = cellNode.type === 'tableHeader'
            const cellParas = (cellNode.content ?? []).flatMap(ch => convert(ch, font, sizePt, lineSpacing, fnIds, imgDims, contentWPx))
            return new TableCell({
              children: cellParas.length > 0 ? cellParas : [new Paragraph({ children: [] })],
              shading: isHeader ? { fill: 'F5F5F5' } : undefined,
              borders: { top: cellBorder, bottom: cellBorder, left: cellBorder, right: cellBorder },
            })
          }),
        })
      )
      return [new Table({
        rows,
        width: { size: 100, type: WidthType.PERCENTAGE },
        borders: { top: noBorder, bottom: noBorder, left: noBorder, right: noBorder, insideH: noBorder, insideV: noBorder },
      })]
    }

    case 'image': {
      const src = node.attrs?.src as string | undefined
      if (!src || !src.startsWith('data:')) return []
      const data = dataUrlToBytes(src)
      const natural = imgDims?.get(src) ?? { w: 400, h: 300 }
      const widthAttr = node.attrs?.width as string | null
      const maxW = contentWPx ?? Math.min(natural.w, 400)
      const targetW = widthAttr
        ? Math.min(parseInt(widthAttr) || natural.w, maxW)
        : Math.min(natural.w, maxW)
      const scale = targetW / natural.w
      const targetH = Math.round(natural.h * scale)
      return [new Paragraph({
        children: [new ImageRun({ data, type: dataUrlToImageType(src), transformation: { width: targetW, height: targetH } })],
        alignment: AlignmentType.CENTER,
        spacing: { before: 120, after: 120 },
      })]
    }

    default:
      return []
  }
}

// ─── Main export function ─────────────────────────────────────────────────────

const ROMAN_WORDS = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten']

export async function buildDocx(
  book: Book,
  sortedChapters: Chapter[],
  style: BookStyle,
  fmt: { widthIn: number; heightIn: number },
  acts?: Act[],
  structureLabel?: 'act' | 'section'
): Promise<string> {
  const {
    fontFamily, fontSize, lineSpacing,
    marginTop, marginBottom, marginInner, marginOuter,
  } = style

  const halfPts = fontSize * 2
  const line    = Math.round(lineSpacing * 240)
  const frontChildren: (Paragraph | Table)[] = []
  const bodyChildren:  (Paragraph | Table)[] = []

  // Pre-load image dimensions (needed by ImageRun which requires explicit w+h)
  const allSrcs = new Set<string>()
  for (const ch of sortedChapters) {
    try { collectImageSrcs(ch.content as PMNode, allSrcs) } catch { /* empty */ }
  }
  const imgDims = new Map<string, { w: number; h: number }>()
  await Promise.all([...allSrcs].map(async (src) => {
    imgDims.set(src, await getImageDims(src))
  }))
  const contentWPx = Math.round((fmt.widthIn - marginInner - marginOuter) * 96)

  // ── Footnote pre-pass: assign sequential DOCX IDs across all chapters ────────
  const chapterDocNodes = sortedChapters.map(ch => {
    try { return stripAnnotationMarks(ch.content as PMNode) } catch { return { type: 'doc', content: [] } as PMNode }
  })
  const fnIds = collectFootnoteIds(chapterDocNodes)

  // Build footnote content map: DOCX id → footnote text
  const fnContentMap = new Map<number, string>()
  for (const ch of sortedChapters) {
    let docNode: PMNode = { type: 'doc', content: [] }
    try { docNode = ch.content as PMNode } catch { /* empty */ }
    const walkFn = (node: PMNode): void => {
      const fn = node.marks?.find(m => m.type === 'footnote')
      if (fn && fn.attrs?.id) {
        const docxId = fnIds.get(fn.attrs.id as string)
        if (docxId !== undefined && !fnContentMap.has(docxId)) {
          fnContentMap.set(docxId, (fn.attrs.content as string) ?? '')
        }
      }
      node.content?.forEach(walkFn)
    }
    walkFn(docNode)
  }

  // Build act separator lookup: actId → act number (1-based) + title
  const sortedActs = acts ? [...acts].sort((a, b) => a.order - b.order) : []
  const actMap = new Map(sortedActs.map((a, i) => [a.id, { num: i + 1, title: a.title, subtitle: a.subtitle }]))
  const insertedActIds = new Set<string>()

  let frontIdx = 0
  let bodyIdx  = 0

  for (let i = 0; i < sortedChapters.length; i++) {
    const ch = sortedChapters[i]
    const section = getSection(ch.kind)
    const isFrontMatter = section === 0
    const isHalfTitle = ch.kind === 'half-title'

    const target = isFrontMatter ? frontChildren : bodyChildren
    const idx    = isFrontMatter ? frontIdx++ : bodyIdx++

    // Page break between chapters within the same section
    // (section boundary in docx handles the break between front and body)
    if (idx > 0) {
      target.push(new Paragraph({
        children: [new TextRun({ text: '' })],
        pageBreakBefore: true,
      }))
    }

    // Insert act separator page before first chapter of each act (body matter only)
    if (!isFrontMatter && ch.actId && actMap.has(ch.actId) && !insertedActIds.has(ch.actId)) {
      insertedActIds.add(ch.actId)
      const act = actMap.get(ch.actId)!
      const actWord = ROMAN_WORDS[act.num] ?? String(act.num)
      const sLabel = (structureLabel ?? 'act') === 'section' ? 'Section' : 'Act'
      // Act separator: eyebrow + act title + optional subtitle — centered, on its own page
      target.push(new Paragraph({
        children: [new TextRun({ text: `${sLabel} ${actWord}`.toUpperCase(), font: fontFamily, size: Math.round(halfPts * 0.85), color: '888888' })],
        alignment: AlignmentType.CENTER,
        spacing: { line, before: convertInchesToTwip(1.5), after: 180 },
      }))
      if (act.title) {
        target.push(new Paragraph({
          children: [new TextRun({ text: act.title, font: fontFamily, size: Math.round(halfPts * 1.8), bold: true })],
          alignment: AlignmentType.CENTER,
          spacing: { line, after: 0 },
        }))
      }
      if (act.subtitle) {
        target.push(new Paragraph({
          children: [new TextRun({ text: act.subtitle, font: fontFamily, size: halfPts, italics: true })],
          alignment: AlignmentType.CENTER,
          spacing: { line, after: 0 },
        }))
      }
      // page break before the first chapter of this act
      target.push(new Paragraph({
        children: [new TextRun({ text: '' })],
        pageBreakBefore: true,
      }))
    }

    if (isHalfTitle) {
      // Half-title: only the book title, large and centered — no ch.title heading
      target.push(new Paragraph({
        children: [new TextRun({ text: book.name, font: fontFamily, size: Math.round(halfPts * 2.2), bold: true })],
        alignment: AlignmentType.CENTER,
        spacing: { line, before: convertInchesToTwip(1.5), after: 360 },
      }))
    } else if (!isFrontMatter && ch.title) {
      // Body / back matter: show chapter title as heading
      target.push(new Paragraph({
        children: [new TextRun({
          text: ch.title,
          font: fontFamily,
          size: Math.round(halfPts * 1.5),
          bold: true,
        })],
        alignment: AlignmentType.CENTER,
        spacing: { line, after: 360 },
      }))
    }
    // Front matter (non-half-title): no title heading — content fills the page

    let docNode: PMNode = { type: 'doc', content: [] }
    try { docNode = stripAnnotationMarks(ch.content as PMNode) } catch { /* empty */ }

    target.push(...convert(docNode, fontFamily, fontSize, lineSpacing, fnIds, imgDims, contentWPx))
  }

  if (frontChildren.length === 0 && bodyChildren.length === 0) {
    bodyChildren.push(new Paragraph({ children: [new TextRun({ text: '' })] }))
  }

  // Build DOCX footnotes dict (only if any footnotes exist)
  const footnoteEntries: Record<string, { children: Paragraph[] }> = {}
  fnContentMap.forEach((content, id) => {
    footnoteEntries[String(id)] = {
      children: [new Paragraph({
        children: [new TextRun({ text: content, font: fontFamily, size: halfPts })],
      })],
    }
  })
  const hasFootnotes = fnContentMap.size > 0

  const pageProps = {
    size: {
      width:  convertInchesToTwip(fmt.widthIn),
      height: convertInchesToTwip(fmt.heightIn),
    },
    margin: {
      top:    convertInchesToTwip(marginTop),
      bottom: convertInchesToTwip(marginBottom),
      left:   convertInchesToTwip(marginInner),
      right:  convertInchesToTwip(marginOuter),
    },
  }

  const pageNumberFooter = new Footer({
    children: [new Paragraph({
      alignment: AlignmentType.CENTER,
      children: [new TextRun({ children: [PageNumber.CURRENT] })],
    })],
  })

  const sections = [
    ...(frontChildren.length > 0
      ? [{ properties: { page: pageProps }, children: frontChildren }]
      : []),
    ...(bodyChildren.length > 0
      ? [{
          properties: {
            page: pageProps,
            pageNumberStart: 1,
            pageNumberFormatType: NumberFormat.DECIMAL,
          },
          footers: { default: pageNumberFooter },
          children: bodyChildren,
        }]
      : []),
  ]

  const doc = new Document({
    ...(hasFootnotes ? { footnotes: footnoteEntries } : {}),
    sections,
  })

  return Packer.toBase64String(doc)
}
