import { Mark, mergeAttributes } from '@tiptap/core'

// Inline footnote mark.
// A single placeholder character (*) is inserted at the cursor and wrapped with this mark.
// Stored as: <sup class="footnote-ref" data-footnote-id="..." data-footnote-content="...">*</sup>
// DOCX export converts to proper Word footnotes; EPUB renders as superscript.
export const FootnoteMark = Mark.create({
  name: 'footnote',

  addAttributes() {
    return {
      id: {
        default: null,
        parseHTML: (el) => (el as HTMLElement).getAttribute('data-footnote-id'),
        renderHTML: (attrs) => ({ 'data-footnote-id': attrs.id }),
      },
      content: {
        default: '',
        parseHTML: (el) => (el as HTMLElement).getAttribute('data-footnote-content') ?? '',
        renderHTML: (attrs) => ({ 'data-footnote-content': attrs.content }),
      },
    }
  },

  parseHTML() {
    return [{ tag: 'sup[data-footnote-id]' }]
  },

  renderHTML({ HTMLAttributes }) {
    return ['sup', mergeAttributes(
      {
        class: 'footnote-ref',
        title: `Footnote: ${HTMLAttributes['data-footnote-content'] ?? ''}`,
      },
      HTMLAttributes
    ), 0]
  },
})
