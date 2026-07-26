import { Extension, JSONContent } from '@tiptap/core'
import { generateHTML } from '@tiptap/core'
import { FootnoteMark } from '../extensions/FootnoteMark'
import StarterKit from '@tiptap/starter-kit'
import TextStyle from '@tiptap/extension-text-style'
import FontFamily from '@tiptap/extension-font-family'
import Underline from '@tiptap/extension-underline'
import TextAlign from '@tiptap/extension-text-align'
import Highlight from '@tiptap/extension-highlight'
import { ResizableImage } from '../extensions/ResizableImage'
import Table from '@tiptap/extension-table'
import TableRow from '@tiptap/extension-table-row'
import TableHeader from '@tiptap/extension-table-header'
import TableCell from '@tiptap/extension-table-cell'

// ─── TipTap extensions (matches RichTextEditor.tsx) ──────────────────────────

const FontSize = Extension.create({
  name: 'fontSize',
  addGlobalAttributes() {
    return [{
      types: ['textStyle'],
      attributes: {
        fontSize: {
          default: null,
          parseHTML: (el) => (el as HTMLElement).style.fontSize || null,
          renderHTML: (attrs) => attrs.fontSize ? { style: `font-size: ${attrs.fontSize}` } : {}
        }
      }
    }]
  }
})

export const EXTENSIONS = [
  StarterKit,
  TextStyle,
  FontFamily,
  FontSize,
  Underline,
  TextAlign.configure({ types: ['heading', 'paragraph'] }),
  Highlight,
  ResizableImage,
  Table.configure({ resizable: false }),
  TableRow,
  TableHeader,
  TableCell,
  FootnoteMark,
]

function stripEditorOnlyMarks(node: JSONContent): JSONContent {
  const cleaned: JSONContent = { ...node }
  if (cleaned.marks) {
    cleaned.marks = cleaned.marks.filter((m) => m.type !== 'annotation')
    if (cleaned.marks.length === 0) delete cleaned.marks
  }
  if (cleaned.content) {
    cleaned.content = cleaned.content.map(stripEditorOnlyMarks)
  }
  return cleaned
}

export function chapterToHtml(content: object): string {
  try {
    return generateHTML(stripEditorOnlyMarks(content as JSONContent), EXTENSIONS)
  } catch {
    return '<p></p>'
  }
}

// ─── Section helpers ──────────────────────────────────────────────────────────

const FRONT_KINDS = ['half-title', 'title-page', 'copyright', 'dedication', 'toc']
const BACK_KINDS  = ['appendix', 'glossary', 'bibliography', 'index', 'author-bio']

export function getSection(kind?: string): 0 | 1 | 2 {
  if (FRONT_KINDS.includes(kind ?? '')) return 0
  if (BACK_KINDS.includes(kind ?? ''))  return 2
  return 1
}

