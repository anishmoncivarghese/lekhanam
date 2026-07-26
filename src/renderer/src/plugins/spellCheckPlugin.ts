import { Extension } from '@tiptap/core'
import { Plugin, PluginKey } from '@tiptap/pm/state'
import { Decoration, DecorationSet } from '@tiptap/pm/view'

// ─── TipTap command type augmentation ────────────────────────────────────────
declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    spellCheck: {
      setSpellCheckErrors: (errors: SpellError[]) => ReturnType
      clearSpellCheckErrors: () => ReturnType
      removeSpellCheckError: (from: number, to: number) => ReturnType
    }
  }
}

// ─── Types ────────────────────────────────────────────────────────────────────

export interface SpellError {
  from: number
  to: number
  message: string
  suggestions: string[]
  type: 'spell' | 'grammar'
  originalText: string
}

interface PluginState {
  decorations: DecorationSet
  errors: SpellError[]
}

// ─── Plugin key ───────────────────────────────────────────────────────────────

export const spellCheckKey = new PluginKey<PluginState>('spellCheck')

// ─── Helper: rebuild decorations from errors ─────────────────────────────────

function makeDecorations(doc: Parameters<typeof DecorationSet.create>[0], errors: SpellError[]): DecorationSet {
  const decos = errors.map((err) =>
    Decoration.inline(err.from, err.to, {
      class: `spell-error spell-error-${err.type}`,
      'data-spell-from': String(err.from),
      'data-spell-to': String(err.to),
      'data-spell-msg': err.message,
      'data-spell-sug': JSON.stringify(err.suggestions),
      'data-spell-orig': err.originalText,
      'data-spell-type': err.type,
    })
  )
  return DecorationSet.create(doc, decos)
}

// ─── TipTap Extension ─────────────────────────────────────────────────────────

export const SpellCheckExtension = Extension.create({
  name: 'spellCheck',

  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: spellCheckKey,

        state: {
          init: (): PluginState => ({ decorations: DecorationSet.empty, errors: [] }),

          apply(tr, old): PluginState {
            const meta = tr.getMeta(spellCheckKey) as { type: string; errors?: SpellError[]; from?: number; to?: number } | undefined

            if (meta?.type === 'set' && meta.errors) {
              return { decorations: makeDecorations(tr.doc, meta.errors), errors: meta.errors }
            }

            if (meta?.type === 'clear') {
              return { decorations: DecorationSet.empty, errors: [] }
            }

            if (meta?.type === 'remove' && meta.from !== undefined && meta.to !== undefined) {
              const filtered = old.errors.filter(
                (e) => e.from !== meta.from || e.to !== meta.to
              )
              return { decorations: makeDecorations(tr.doc, filtered), errors: filtered }
            }

            // Auto-remove errors whose ranges overlap with any edited region
            if (tr.docChanged && old.errors.length > 0) {
              const changedRanges: Array<{ from: number; to: number }> = []
              tr.steps.forEach((step) => {
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                ;(step as any).getMap().forEach((oldFrom: number, oldTo: number) => {
                  // Extend pure insertions (oldFrom === oldTo) by 1 so they
                  // clear any error that contains the insertion point.
                  changedRanges.push({ from: oldFrom, to: Math.max(oldTo, oldFrom + 1) })
                })
              })
              if (changedRanges.length > 0) {
                const kept = old.errors.filter(
                  (err) => !changedRanges.some((r) => err.from < r.to && err.to > r.from)
                )
                if (kept.length !== old.errors.length) {
                  return { decorations: makeDecorations(tr.doc, kept), errors: kept }
                }
              }
            }

            // Map decorations through document changes (e.g. typing)
            return {
              decorations: old.decorations.map(tr.mapping, tr.doc),
              errors: old.errors,
            }
          },
        },

        props: {
          decorations(state) {
            return spellCheckKey.getState(state)?.decorations
          },
        },
      }),
    ]
  },

  addCommands() {
    return {
      setSpellCheckErrors:
        (errors: SpellError[]) =>
        ({ tr, dispatch }) => {
          if (dispatch) {
            tr.setMeta(spellCheckKey, { type: 'set', errors })
            dispatch(tr)
          }
          return true
        },

      clearSpellCheckErrors:
        () =>
        ({ tr, dispatch }) => {
          if (dispatch) {
            tr.setMeta(spellCheckKey, { type: 'clear' })
            dispatch(tr)
          }
          return true
        },

      removeSpellCheckError:
        (from: number, to: number) =>
        ({ tr, dispatch }) => {
          if (dispatch) {
            tr.setMeta(spellCheckKey, { type: 'remove', from, to })
            dispatch(tr)
          }
          return true
        },
    } as any // eslint-disable-line @typescript-eslint/no-explicit-any
  },
})

// ─── Position mapper ──────────────────────────────────────────────────────────
//
// Maps Harper's character offsets (in the string returned by editor.getText('\n'))
// to ProseMirror document positions.
//
// Mirrors exactly what ProseMirror's textBetween(0, size, '\n') does:
//   – text node chars → consecutive PM positions
//   – block-separator '\n' → inserted BEFORE the 2nd+ block node (not the 1st)

export function buildTextOffsetMapper(doc: Parameters<typeof DecorationSet.create>[0]): (offset: number) => number {
  const pmPositions: number[] = []
  let separated = true // mirrors textBetween's initial state

  ;(doc as any).nodesBetween(0, (doc as any).content.size, (node: any, pos: number) => {
    if (node.isText) {
      const text: string = node.text
      for (let i = 0; i < text.length; i++) {
        pmPositions.push(pos + i)
      }
      separated = false
    } else if (!node.isLeaf && !separated) {
      // This block node gets a '\n' separator before it in the plain text
      pmPositions.push(pos)
      separated = true
    }
  })

  return (offset: number): number => {
    if (offset < pmPositions.length) return pmPositions[offset]
    // Clamp to last known position + 1
    return (pmPositions[pmPositions.length - 1] ?? 0) + 1
  }
}
