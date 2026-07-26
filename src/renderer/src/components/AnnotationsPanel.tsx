import React, { useEffect, useState } from 'react'
import { Editor } from '@tiptap/react'

interface Annotation {
  id: string
  comment: string
  text: string
  from: number
  to: number
}

function getAnnotations(editor: Editor): Annotation[] {
  const results: Annotation[] = []
  editor.state.doc.descendants((node, pos) => {
    if (node.isText) {
      const mark = node.marks.find((m) => m.type.name === 'annotation')
      if (mark) {
        results.push({
          id: mark.attrs.id as string,
          comment: mark.attrs.comment as string,
          text: node.text ?? '',
          from: pos,
          to: pos + node.nodeSize,
        })
      }
    }
  })
  return results
}

interface Props {
  editor: Editor
  onClose: () => void
}

export default function AnnotationsPanel({ editor, onClose }: Props): React.JSX.Element {
  const [annotations, setAnnotations] = useState<Annotation[]>(() => getAnnotations(editor))

  // Re-scan whenever the document changes
  useEffect(() => {
    const handler = () => setAnnotations(getAnnotations(editor))
    editor.on('update', handler)
    return () => { editor.off('update', handler) }
  }, [editor])

  // Escape closes
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  const goTo = (ann: Annotation) => {
    editor.chain().setTextSelection({ from: ann.from, to: ann.to }).scrollIntoView().run()
    editor.commands.focus()
  }

  const remove = (ann: Annotation) => {
    editor.chain()
      .setTextSelection({ from: ann.from, to: ann.to })
      .unsetMark('annotation')
      .run()
  }

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 z-[800]" onClick={onClose} />

      {/* Panel */}
      <div
        className="fixed top-0 right-0 bottom-0 z-[801] flex flex-col bg-[var(--bg-card)] border-l border-[var(--border)] shadow-2xl panel-slide-in"
        style={{ width: 360 }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 pt-10 pb-3 border-b border-[var(--border)] flex-shrink-0">
          <div className="flex items-center gap-2">
            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--fg-muted)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
            </svg>
            <h2 className="text-sm font-semibold text-[var(--fg)]">
              Comments
              {annotations.length > 0 && (
                <span className="ml-1.5 text-[10px] font-normal text-[var(--fg-faint)]">
                  {annotations.length}
                </span>
              )}
            </h2>
          </div>
          <button
            onClick={onClose}
            className="w-6 h-6 flex items-center justify-center rounded-md text-[var(--fg-muted)] hover:bg-[var(--bg-subtle)] hover:text-[var(--fg)] transition-colors"
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M18 6 6 18M6 6l12 12"/>
            </svg>
          </button>
        </div>

        {/* List */}
        <div className="flex-1 overflow-y-auto">
          {annotations.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-center px-6 gap-2">
              <svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="var(--fg-faint)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
              </svg>
              <p className="text-xs text-[var(--fg-faint)]">No comments yet</p>
              <p className="text-[11px] text-[var(--fg-faint)]">Select text and click 💬 to add one</p>
            </div>
          ) : (
            <div className="divide-y divide-[var(--border)]">
              {annotations.map((ann) => (
                <div
                  key={ann.id}
                  className="px-4 py-3 hover:bg-[var(--bg-subtle)] transition-colors group cursor-pointer"
                  onClick={() => goTo(ann)}
                >
                  {/* Annotated text */}
                  <p className="text-[11px] font-medium text-[var(--accent)] line-clamp-1 mb-1">
                    "{ann.text}"
                  </p>
                  {/* Comment */}
                  <p className="text-xs text-[var(--fg)] leading-snug">{ann.comment}</p>
                  {/* Delete */}
                  <button
                    onClick={(e) => { e.stopPropagation(); remove(ann) }}
                    className="mt-1.5 text-[10px] text-[var(--fg-faint)] hover:text-red-500 transition-colors opacity-0 group-hover:opacity-100"
                  >
                    Remove
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-4 py-2 border-t border-[var(--border)] flex-shrink-0">
          <p className="text-[10px] text-[var(--fg-faint)]">Highlights are editor-only — not included in PDF, DOCX, or EPUB export · Esc to close</p>
        </div>
      </div>
    </>
  )
}
