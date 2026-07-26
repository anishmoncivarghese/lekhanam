import epub from 'epub-gen-memory/bundle'
import { chapterToHtml, getSection } from './pdfExport'
import type { Book, Chapter, Act } from '../types'

// ─── Roman numerals (for act numbers in prose) ────────────────────────────────
const ROMAN = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten']
function actWordNumber(n: number): string {
  return ROMAN[n] ?? String(n)
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const EPUB_CSS = `
  body { font-family: Georgia, "Times New Roman", serif; font-size: 1em; line-height: 1.65; margin: 0; padding: 0; }

  /* Regular chapter content */
  .chapter-content { margin: 2em 2.5em; }
  .chapter-title { font-size: 1.4em; font-weight: 600; margin: 0 0 1.5em 0; text-align: center; }

  /* Front matter pages — Kindle-safe centering (no flexbox) */
  .front-matter-page { text-align: center; padding-top: 35%; padding-bottom: 10%; padding-left: 2em; padding-right: 2em; }
  .front-matter-page h1 { font-size: 2em; font-weight: 700; margin: 0 0 0.4em 0; }
  .front-matter-page h2 { font-size: 1.1em; font-weight: 400; font-style: italic; margin: 0 0 0.8em 0; }
  .front-matter-page p  { font-size: 0.9em; margin: 0.3em 0; text-indent: 0; }

  /* Half-title page — Kindle-safe centering */
  .half-title-page { text-align: center; padding-top: 38%; padding-bottom: 10%; }
  .half-title-page .ht-title { font-size: 2.4em; font-weight: 700; letter-spacing: -0.01em; }

  /* Act separator page — Kindle-safe centering */
  .act-page { text-align: center; padding-top: 38%; padding-bottom: 10%; page-break-before: always; break-before: page; }
  .act-page .act-eyebrow { font-size: 0.7em; letter-spacing: 0.25em; text-transform: uppercase; color: #888; margin-bottom: 0.8em; display: block; }
  .act-page .act-name { font-size: 2em; font-weight: 600; margin: 0; display: block; }
  .act-subtitle { font-size: 1em; font-style: italic; font-weight: 400; margin: 0.5em 0 0; display: block; }
  .act-body { margin-top: 2em; font-size: 0.9em; text-align: center; }
  .act-body p { text-indent: 0; }

  /* Back cover page */
  .back-cover-page { text-align: center; padding: 0; margin: 0; page-break-before: always; break-before: page; }
  .back-cover-page img { width: 100%; height: auto; display: block; }

  p { margin: 0 0 0.8em 0; text-indent: 1.5em; }
  p:first-of-type { text-indent: 0; }
  em { font-style: italic; }
  strong { font-weight: bold; }
  u { text-decoration: underline; }
  mark { background: #ffe066; }
  blockquote { margin: 1em 2em; padding: 0.5em 1em; border-left: 3px solid #ccc; }
  img { max-width: 90%; height: auto; display: block; margin: 1em auto; page-break-before: avoid; break-before: avoid; page-break-inside: avoid; break-inside: avoid; }
`

// ─── Content HTML builders ────────────────────────────────────────────────────

function halfTitleHtml(bookTitle: string): string {
  return `<div class="half-title-page"><div class="ht-title">${escHtml(bookTitle)}</div></div>`
}

function frontMatterHtml(ch: Chapter): string {
  const content = chapterToHtml(ch.content as object)
  return `<div class="front-matter-page">${content || '<p>&nbsp;</p>'}</div>`
}

function actSeparatorHtml(actNumber: number, act: Act, structureLabel: 'act' | 'section' = 'act'): string {
  const label = structureLabel === 'section' ? 'Section' : 'Act'
  const eyebrow = `${label} ${actWordNumber(actNumber)}`
  const name = act.title ? escHtml(act.title) : ''
  const subtitle = act.subtitle ? `<div class="act-subtitle">${escHtml(act.subtitle)}</div>` : ''
  const body = act.content ? `<div class="act-body">${chapterToHtml(act.content as object)}</div>` : ''
  return `<div class="act-page"><div class="act-eyebrow">${eyebrow}</div>${name ? `<div class="act-name">${name}</div>` : ''}${subtitle}${body}</div>`
}

function bodyChapterHtml(ch: Chapter): string {
  const title = ch.title ? `<h2 class="chapter-title">${escHtml(ch.title)}</h2>` : ''
  const content = chapterToHtml(ch.content as object)
  return `<div class="chapter-content">${title}${content}</div>`
}

function escHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

// ─── ArrayBuffer → base64 (renderer-safe) ────────────────────────────────────
function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer)
  let binary = ''
  for (let i = 0; i < bytes.byteLength; i++) binary += String.fromCharCode(bytes[i])
  return btoa(binary)
}

function dataUrlToFile(dataUrl: string, filename: string): File {
  const [header, data] = dataUrl.split(',')
  const mime = header.match(/:(.*?);/)?.[1] ?? 'image/jpeg'
  const binary = atob(data)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return new File([bytes], filename, { type: mime })
}

// ─── Main export function ─────────────────────────────────────────────────────

export async function generateEpub(
  book: Book,
  chapters: Chapter[],
  acts: Act[],
  coverDataUrl?: string,
  backCoverDataUrl?: string,
  structureLabel?: 'act' | 'section'
): Promise<string> {
  // Sort chapters: front matter → body → back matter, then by order
  const sorted = [...chapters].sort((a, b) => {
    const secA = getSection(a.kind)
    const secB = getSection(b.kind)
    if (secA !== secB) return secA - secB
    return (a.order ?? 0) - (b.order ?? 0)
  })

  const sortedActs = [...acts].sort((a, b) => a.order - b.order)
  const hasActs = sortedActs.length > 0

  const epubChapters: Array<{ title: string; content: string; excludeFromToc?: boolean; beforeToc?: boolean }> = []

  // ── Front matter ──────────────────────────────────────────────────────────
  const frontChapters = sorted.filter((c) => getSection(c.kind) === 0)
  for (const ch of frontChapters) {
    const content = ch.kind === 'half-title'
      ? halfTitleHtml(book.name)
      : frontMatterHtml(ch)
    epubChapters.push({
      title: ch.title || '',
      content,
      excludeFromToc: true,
      beforeToc: true,
    })
  }

  // ── Body matter ────────────────────────────────────────────────────────────
  const bodyChapters = sorted.filter((c) => getSection(c.kind) === 1)

  if (hasActs) {
    // Group by act, inserting act separator pages
    for (let i = 0; i < sortedActs.length; i++) {
      const act = sortedActs[i]
      const actChapters = bodyChapters.filter((c) => c.actId === act.id)
      if (actChapters.length === 0) continue

      // Act separator page
      epubChapters.push({
        title: '',
        content: actSeparatorHtml(i + 1, act, structureLabel ?? 'act'),
        excludeFromToc: true,
      })

      // Chapters in this act
      for (const ch of actChapters) {
        epubChapters.push({
          title: ch.title || 'Untitled',
          content: bodyChapterHtml(ch),
        })
      }
    }

    // Ungrouped body chapters (no actId or stale actId)
    const actIds = new Set(sortedActs.map((a) => a.id))
    const ungrouped = bodyChapters.filter((c) => !c.actId || !actIds.has(c.actId))
    for (const ch of ungrouped) {
      epubChapters.push({
        title: ch.title || 'Untitled',
        content: bodyChapterHtml(ch),
      })
    }
  } else {
    for (const ch of bodyChapters) {
      epubChapters.push({
        title: ch.title || 'Untitled',
        content: bodyChapterHtml(ch),
      })
    }
  }

  // ── Back matter ────────────────────────────────────────────────────────────
  const backChapters = sorted.filter((c) => getSection(c.kind) === 2)
  for (const ch of backChapters) {
    epubChapters.push({
      title: ch.title || 'Untitled',
      content: `<div class="chapter-content">${chapterToHtml(ch.content as object)}</div>`,
      excludeFromToc: true,
    })
  }

  // ── Back cover page (optional) ─────────────────────────────────────────────
  if (backCoverDataUrl) {
    epubChapters.push({
      title: '',
      content: `<div class="back-cover-page"><img src="${backCoverDataUrl}" alt="Back cover" /></div>`,
      excludeFromToc: true,
    })
  }

  const options = {
    title: book.name,
    author: book.author || 'Unknown Author',
    description: book.synopsis || '',
    css: EPUB_CSS,
    ignoreFailedDownloads: true,
    prependChapterTitles: false,
    ...(coverDataUrl ? { cover: dataUrlToFile(coverDataUrl, 'cover.jpg') } : {}),
  }

  const result = await epub(options, epubChapters)
  const arrayBuffer = result instanceof Blob
    ? await (result as Blob).arrayBuffer()
    : (result as ArrayBuffer)

  const base64 = arrayBufferToBase64(arrayBuffer)
  const { ok, filePath } = await window.electron.export.saveEpub(book.name, base64)
  if (!ok || !filePath) throw new Error('Save cancelled')
  return filePath
}
