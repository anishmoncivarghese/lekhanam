import { Plugin, PluginKey } from 'prosemirror-state'
import { Decoration, DecorationSet } from 'prosemirror-view'

export interface PageLayout {
  pgH: number
  mTop: number
  mBottom: number
  pageStride: number
  contentH: number
  headerH: number
}

interface PluginState {
  decos: DecorationSet
  margins: Record<number, number>
}

// Per-node geometry collected in Phase 1 of recalc
interface NodeData {
  offset: number
  typeName: string
  headingLevel: number | null
  dom: HTMLElement
  absTop: number
  absBottom: number
  page: number
  cBottom: number
}

const paginationKey = new PluginKey<PluginState>('pagination')

export function createPaginationPlugin(getLayout: () => PageLayout): Plugin {
  return new Plugin<PluginState>({
    key: paginationKey,

    state: {
      init: () => ({ decos: DecorationSet.empty, margins: {} }),
      apply(tr, prev) {
        const meta = tr.getMeta(paginationKey) as PluginState | undefined
        if (meta) return meta
        // Map decoration positions through document changes
        return { decos: prev.decos.map(tr.mapping, tr.doc), margins: prev.margins }
      }
    },

    props: {
      decorations(state) {
        return paginationKey.getState(state)!.decos
      }
    },

    view(view) {
      let prevMargins: Record<number, number> = {}
      let raf: number | null = null

      function recalc(): void {
        const { pgH, mTop, mBottom, pageStride, headerH } = getLayout()
        const contentH = pgH - mTop - mBottom - headerH
        const newMargins: Record<number, number> = {}

        // ── Phase 1: Collect per-node geometry ───────────────────────────────
        //
        // We read each node's rendered position from the DOM (which already
        // reflects any decorations applied in the previous recalc cycle).
        // Using the same margin-collapse-safe naturalY formula as before.
        const nodeList: NodeData[] = []

        view.state.doc.forEach((node, offset) => {
          const dom = view.nodeDOM(offset) as HTMLElement | null
          if (!dom || dom.nodeType !== 1) return

          // naturalY: where the top of this element would be if its margin-top were 0.
          // See inline comments in the original plugin for the two subtleties handled here
          // (stale-offset bug and margin-collapse bug).
          const appliedMargin = parseFloat(getComputedStyle(dom).marginTop) || 0
          const prevSibling = dom.previousElementSibling as HTMLElement | null
          const prevMB = prevSibling ? (parseFloat(getComputedStyle(prevSibling).marginBottom) || 0) : 0
          const naturalY = dom.offsetTop - Math.max(appliedMargin, prevMB)

          const absTop = mTop + naturalY
          const absBottom = absTop + dom.offsetHeight
          const page = Math.floor(absTop / pageStride)
          const cBottom = page * pageStride + pgH - mBottom - headerH

          nodeList.push({
            offset,
            typeName: node.type.name,
            headingLevel: node.type.name === 'heading' ? (node.attrs.level as number) : null,
            dom,
            absTop,
            absBottom,
            page,
            cBottom,
          })
        })

        // ── Phase 2: Apply typography rules ──────────────────────────────────
        //
        // Rule A — Basic overflow: block overflows the page AND fits on one page → push.
        //           IMPORTANT: Do NOT remove this rule. The top/bottom margin overlays use
        //           background: var(--margin-area-bg) and the page-gap band is only 16 px.
        //           Combined hidden area ≈ mBottom + GRAY_BAND + mTop ≈ 160 px (≈ 6 lines
        //           at 12 pt / 1.6× line-height). If a paragraph were allowed to break
        //           across that gap, ~6 lines per page break would be invisible to the
        //           writer. Blank space at the bottom of a page is the correct trade-off
        //           for this overlay-based architecture (same as Scrivener page view).
        //           True cross-page line flow requires per-page container rendering.
        // Rule B — Keep-with-next: h1/h2 at page bottom with next node on the next page → push.
        // Rule C — Orphan (< 2 lines before page break): push even if block is tall.
        // Rule D — Widow (< 2 lines after page break): push, but ONLY for fitsOnePage blocks
        //           to avoid infinite cascades on blocks taller than a page.

        for (let i = 0; i < nodeList.length; i++) {
          const { offset, typeName, headingLevel, dom, absTop, absBottom, page, cBottom } = nodeList[i]
          const next = nodeList[i + 1]

          const overflows = absBottom > cBottom
          const fitsOnePage = dom.offsetHeight < contentH
          const isHeading = typeName === 'heading' && (headingLevel === 1 || headingLevel === 2)

          let push = false

          // Rule A — existing overflow logic
          if (overflows && fitsOnePage) push = true

          // Rule B — Keep-with-next for headings
          if (!push && isHeading && next !== undefined && next.page > page) push = true

          // Rule C — Orphan: fewer than 2 lines fit before the page break
          if (!push && overflows) {
            const lineH = parseFloat(getComputedStyle(dom).lineHeight) || 16
            const linesBeforeBreak = Math.floor((cBottom - absTop) / lineH)
            if (linesBeforeBreak < 2) push = true
          }

          // Rule D — Widow: fewer than 2 lines overflow onto the next page
          //           (only safe for blocks that fit on a single page)
          if (!push && overflows && fitsOnePage) {
            const lineH = parseFloat(getComputedStyle(dom).lineHeight) || 16
            const widowLines = Math.ceil((absBottom - cBottom) / lineH)
            if (widowLines > 0 && widowLines < 2) push = true
          }

          if (push) {
            const margin = Math.ceil((page + 1) * pageStride + mTop - absTop)
            if (margin > 0) newMargins[offset] = margin
          }
        }

        // Skip dispatch if nothing changed — breaks the update cycle
        const unchanged =
          Object.keys(newMargins).length === Object.keys(prevMargins).length &&
          Object.keys(newMargins).every((k) => newMargins[+k] === prevMargins[+k])
        if (unchanged) return

        prevMargins = newMargins

        const decorations = Object.entries(newMargins).map(([posStr, px]) => {
          const pos = Number(posStr)
          const n = view.state.doc.nodeAt(pos)!
          return Decoration.node(pos, pos + n.nodeSize, { style: `margin-top:${px}px` })
        })

        const decos = DecorationSet.create(view.state.doc, decorations)
        view.dispatch(view.state.tr.setMeta(paginationKey, { decos, margins: newMargins }))
      }

      return {
        update() {
          if (raf !== null) cancelAnimationFrame(raf)
          raf = requestAnimationFrame(() => {
            recalc()
            raf = null
          })
        },
        destroy() {
          if (raf !== null) cancelAnimationFrame(raf)
        }
      }
    }
  })
}
