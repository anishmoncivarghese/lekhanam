import mammoth from 'mammoth'
import { generateJSON } from '@tiptap/core'
import StarterKit from '@tiptap/starter-kit'
import TextStyle from '@tiptap/extension-text-style'
import Underline from '@tiptap/extension-underline'
import TextAlign from '@tiptap/extension-text-align'
import Highlight from '@tiptap/extension-highlight'

// Minimal extension set for HTML → ProseMirror JSON conversion (mirrors the editor)
const IMPORT_EXTENSIONS = [
  StarterKit,
  TextStyle,
  Underline,
  TextAlign.configure({ types: ['heading', 'paragraph'] }),
  Highlight,
]

export interface ImportedChapter {
  title: string
  content: object   // ProseMirror JSON doc
  wordCount: number
}

function stripTags(html: string): string {
  return html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
}

function countWords(html: string): number {
  const text = stripTags(html)
  return text ? text.split(/\s+/).length : 0
}

function htmlToDoc(html: string): object {
  return generateJSON(`<div>${html || '<p></p>'}</div>`, IMPORT_EXTENSIONS)
}

export async function parseDocx(arrayBuffer: ArrayBuffer): Promise<ImportedChapter[]> {
  const result = await mammoth.convertToHtml({ arrayBuffer })
  const html = result.value.trim()
  if (!html) return []

  // Split on every <h1 ...> opening tag — each H1 starts a new chapter
  const rawParts = html.split(/(?=<h1[\s>])/i).filter((p) => p.trim())

  // No H1 headings found → import whole doc as one chapter
  const hasH1 = rawParts.some((p) => /<h1[\s>]/i.test(p))
  if (!hasH1) {
    return [{
      title: 'Imported Document',
      content: htmlToDoc(html),
      wordCount: countWords(html),
    }]
  }

  const chapters: ImportedChapter[] = []

  // Any content before the first H1 becomes a preamble chapter
  const firstH1Index = rawParts.findIndex((p) => /<h1[\s>]/i.test(p))
  if (firstH1Index > 0) {
    const preamble = rawParts.slice(0, firstH1Index).join('')
    if (stripTags(preamble)) {
      chapters.push({
        title: 'Introduction',
        content: htmlToDoc(preamble),
        wordCount: countWords(preamble),
      })
    }
  }

  for (const part of rawParts.slice(firstH1Index)) {
    const h1Match = part.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i)
    const title = h1Match ? stripTags(h1Match[1]) || 'Untitled Chapter' : 'Untitled Chapter'
    // Strip the H1 from the body (it becomes the chapter title in Lekhanam)
    const body = part.replace(/<h1[^>]*>[\s\S]*?<\/h1>/i, '').trim()
    chapters.push({
      title,
      content: htmlToDoc(body),
      wordCount: countWords(body),
    })
  }

  return chapters
}
