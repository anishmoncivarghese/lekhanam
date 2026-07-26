import React, { useMemo } from 'react'
import { generateHTML, JSONContent } from '@tiptap/core'
import StarterKit from '@tiptap/starter-kit'
import TextStyle from '@tiptap/extension-text-style'
import Underline from '@tiptap/extension-underline'
import TextAlign from '@tiptap/extension-text-align'
import Highlight from '@tiptap/extension-highlight'
import { Chapter } from '../types'
import { ResizableImage } from '../extensions/ResizableImage'
import Table from '@tiptap/extension-table'
import TableRow from '@tiptap/extension-table-row'
import TableHeader from '@tiptap/extension-table-header'
import TableCell from '@tiptap/extension-table-cell'

// NO AnnotationMark — annotations are editor-only, excluded from reading view
const READ_EXTENSIONS = [
  StarterKit,
  ResizableImage,
  TextStyle,
  Underline,
  TextAlign.configure({ types: ['heading', 'paragraph'] }),
  Highlight,
  Table.configure({ resizable: false }),
  TableRow,
  TableHeader,
  TableCell,
]

function stripAnnotationMarks(node: JSONContent): JSONContent {
  const cleaned: JSONContent = { ...node }
  if (cleaned.marks) {
    cleaned.marks = cleaned.marks.filter((m) => m.type !== 'annotation')
    if (cleaned.marks.length === 0) delete cleaned.marks
  }
  if (cleaned.content) {
    cleaned.content = cleaned.content.map(stripAnnotationMarks)
  }
  return cleaned
}

function safeGenerateHTML(content: object): string {
  try {
    return generateHTML(stripAnnotationMarks(content as JSONContent), READ_EXTENSIONS)
  } catch {
    return '<p></p>'
  }
}

function ChapterDivider(): React.JSX.Element {
  return (
    <div aria-hidden="true" className="flex items-center justify-center my-10 select-none">
      <span className="text-[var(--fg-faint)] tracking-[0.6em] text-sm">· · ·</span>
    </div>
  )
}

interface Props {
  chapters: Chapter[]
  onChapterClick: (id: string) => void
}

export default function LekhanamView({ chapters, onChapterClick }: Props): React.JSX.Element {
  const bodyChapters = useMemo(
    () =>
      chapters
        .filter((c) => !c.kind || c.kind === 'chapter' || c.kind === 'part-break')
        .sort((a, b) => a.order - b.order),
    [chapters]
  )

  const totalWords = useMemo(
    () => bodyChapters.reduce((sum, c) => sum + (c.wordCount ?? 0), 0),
    [bodyChapters]
  )

  if (bodyChapters.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-center px-8">
        <p className="text-[var(--fg-muted)] text-sm">No chapters yet</p>
        <p className="text-[var(--fg-faint)] text-xs mt-1">Add body matter chapters to see them here.</p>
      </div>
    )
  }

  let chapterCounter = 0

  return (
    <div className="lekhanam-view h-full overflow-y-auto bg-[var(--bg)]">
      {/* Header label */}
      <div className="max-w-[680px] mx-auto px-8 pt-12 pb-2">
        <p className="text-xs font-semibold tracking-widest text-[var(--fg-faint)] uppercase select-none">
          Lekhanam View
        </p>
      </div>

      {/* Chapters */}
      {bodyChapters.map((chapter, idx) => {
        if (!chapter.kind || chapter.kind === 'chapter') chapterCounter++
        const isChapter = !chapter.kind || chapter.kind === 'chapter'
        const badgeLabel = isChapter
          ? `Chapter ${chapterCounter}`
          : chapter.kind!.replace('-', ' ').replace(/\b\w/g, (c) => c.toUpperCase())

        return (
          <React.Fragment key={chapter.id}>
            <article className="max-w-[680px] mx-auto px-8 py-6">
              {/* Chapter header row */}
              <div className="flex items-baseline gap-3 mb-6">
                <span className="flex-shrink-0 text-[10px] font-bold text-white bg-[var(--accent)] rounded px-1.5 py-0.5 leading-tight select-none">
                  {badgeLabel}
                </span>
                <button
                  onClick={() => onChapterClick(chapter.id)}
                  title="Click to edit this chapter"
                  className="text-xl font-bold text-[var(--fg)] hover:text-[var(--accent)] transition-colors text-left leading-snug group"
                >
                  {chapter.title}
                  <span className="ml-2 text-[10px] font-normal text-[var(--fg-faint)] opacity-0 group-hover:opacity-100 transition-opacity align-middle">
                    edit ↗
                  </span>
                </button>
                {chapter.wordCount > 0 && (
                  <span className="flex-shrink-0 text-[11px] text-[var(--fg-faint)] ml-auto">
                    {chapter.wordCount.toLocaleString()} words
                  </span>
                )}
              </div>

              {/* Rendered prose content */}
              <div
                className="ProseMirror"
                dangerouslySetInnerHTML={{ __html: safeGenerateHTML(chapter.content) }}
              />
            </article>

            {idx < bodyChapters.length - 1 && <ChapterDivider />}
          </React.Fragment>
        )
      })}

      {/* End of manuscript */}
      <div className="max-w-[680px] mx-auto px-8 pb-16 text-center">
        <ChapterDivider />
        <p className="text-sm text-[var(--fg-faint)] italic select-none">— End of Manuscript —</p>
        <p className="text-xs text-[var(--fg-faint)] mt-1 select-none">
          {totalWords.toLocaleString()} words · {bodyChapters.length} chapter{bodyChapters.length !== 1 ? 's' : ''}
        </p>
      </div>
    </div>
  )
}
