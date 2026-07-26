import { Mark, mergeAttributes } from '@tiptap/core'

// Inline annotation (comment) mark.
// Stored as: <span class="annotation-mark" data-annotation-id="..." data-annotation-comment="...">
// Excluded from PDF/DOCX/EPUB export — the span renders plain text in export pipelines.
export const AnnotationMark = Mark.create({
  name: 'annotation',

  addAttributes() {
    return {
      id: {
        default: null,
        parseHTML: (el) => (el as HTMLElement).getAttribute('data-annotation-id'),
        renderHTML: (attrs) => ({ 'data-annotation-id': attrs.id }),
      },
      comment: {
        default: '',
        parseHTML: (el) => (el as HTMLElement).getAttribute('data-annotation-comment') ?? '',
        renderHTML: (attrs) => ({ 'data-annotation-comment': attrs.comment }),
      },
    }
  },

  parseHTML() {
    return [{ tag: 'span[data-annotation-id]' }]
  },

  renderHTML({ HTMLAttributes }) {
    const comment = HTMLAttributes['data-annotation-comment'] ?? ''
    return ['span', mergeAttributes(
      {
        class: 'annotation-mark',
        title: `💬 ${comment}\n\n(Editor-only — not included in export)`,
      },
      HTMLAttributes
    ), 0]
  },
})
