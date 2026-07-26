import React, { useRef, useCallback } from 'react'
import Image from '@tiptap/extension-image'
import { NodeViewWrapper, ReactNodeViewRenderer } from '@tiptap/react'
import type { NodeViewProps } from '@tiptap/react'

function ResizableImageView({ node, updateAttributes, selected }: NodeViewProps) {
  const imgRef = useRef<HTMLImageElement>(null)

  const startResize = useCallback(
    (e: React.MouseEvent, isLeft: boolean) => {
      e.preventDefault()
      e.stopPropagation()
      const startX = e.clientX
      const startWidth = imgRef.current?.offsetWidth ?? 200

      const onMove = (ev: MouseEvent): void => {
        const delta = isLeft ? startX - ev.clientX : ev.clientX - startX
        updateAttributes({ width: `${Math.max(50, startWidth + delta)}px` })
      }
      const onUp = (): void => {
        document.removeEventListener('mousemove', onMove)
        document.removeEventListener('mouseup', onUp)
      }
      document.addEventListener('mousemove', onMove)
      document.addEventListener('mouseup', onUp)
    },
    [updateAttributes]
  )

  const handle = 'absolute w-3 h-3 bg-white border-2 border-[var(--accent)] rounded-full z-10'

  return (
    <NodeViewWrapper as="div" className="my-4 flex justify-center">
      <div
        className={`relative inline-block select-none ${
          selected ? 'outline outline-2 outline-offset-2 outline-[var(--accent)] rounded' : ''
        }`}
      >
        <img
          ref={imgRef}
          src={node.attrs.src as string}
          alt={(node.attrs.alt as string) ?? ''}
          draggable={false}
          style={{
            width: (node.attrs.width as string) ?? 'auto',
            maxWidth: '100%',
            height: 'auto',
            display: 'block',
            borderRadius: '6px',
          }}
        />
        {selected && (
          <>
            <div onMouseDown={(e) => startResize(e, true)}  className={`${handle} top-1/2 left-0    -translate-x-1/2 -translate-y-1/2 cursor-w-resize`} />
            <div onMouseDown={(e) => startResize(e, false)} className={`${handle} top-1/2 right-0   translate-x-1/2  -translate-y-1/2 cursor-e-resize`} />
            <div onMouseDown={(e) => startResize(e, true)}  className={`${handle} top-0   left-0    -translate-x-1/2 -translate-y-1/2 cursor-nw-resize`} />
            <div onMouseDown={(e) => startResize(e, false)} className={`${handle} top-0   right-0   translate-x-1/2  -translate-y-1/2 cursor-ne-resize`} />
            <div onMouseDown={(e) => startResize(e, true)}  className={`${handle} bottom-0 left-0   -translate-x-1/2 translate-y-1/2  cursor-sw-resize`} />
            <div onMouseDown={(e) => startResize(e, false)} className={`${handle} bottom-0 right-0  translate-x-1/2  translate-y-1/2  cursor-se-resize`} />
          </>
        )}
      </div>
    </NodeViewWrapper>
  )
}

export const ResizableImage = Image.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      width: {
        default: null,
        renderHTML: (attrs) => (attrs.width ? { style: `width: ${attrs.width}` } : {}),
        parseHTML: (el) => (el as HTMLElement).style.width || null,
      },
    }
  },
  addNodeView() {
    return ReactNodeViewRenderer(ResizableImageView)
  },
})
