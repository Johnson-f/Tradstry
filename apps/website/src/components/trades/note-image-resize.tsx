import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext'
import { useLexicalEditable } from '@lexical/react/useLexicalEditable'
import { $getNodeByKey, HISTORY_PUSH_TAG, SKIP_DOM_SELECTION_TAG, type NodeKey } from 'lexical'
import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import { NoteImageNode } from './note-image-node'
import { NoteImageMoveHandle } from './note-image-move'
import { NoteImageActions } from './note-image-actions'

const corners = [
  { name: 'top left', x: -1, y: -1, position: 'left-0 top-0 items-start justify-start cursor-nwse-resize' },
  { name: 'top right', x: 1, y: -1, position: 'right-0 top-0 items-start justify-end cursor-nesw-resize' },
  { name: 'bottom left', x: -1, y: 1, position: 'left-0 bottom-0 items-end justify-start cursor-nesw-resize' },
  { name: 'bottom right', x: 1, y: 1, position: 'right-0 bottom-0 items-end justify-end cursor-nwse-resize' },
] as const
type Corner = (typeof corners)[number]
type Preview = { start: DOMRect; width: number; left: number; top: number }

function availableWidth(host: HTMLElement, root: HTMLElement) {
  const block = host.closest<HTMLElement>('p,li,blockquote,h1,h2,h3,h4,h5,h6,td,th') ?? root
  const css = getComputedStyle(block)
  return Math.max(1, Math.floor(block.clientWidth - parseFloat(css.paddingLeft) - parseFloat(css.paddingRight)))
}

export function ResizableNoteImage({ nodeKey, src, width }: { nodeKey: NodeKey; src: string; width: number | null }) {
  const [editor] = useLexicalComposerContext()
  const editable = useLexicalEditable()
  const imageRef = useRef<HTMLImageElement>(null)
  const [frame, setFrame] = useState<HTMLSpanElement | null>(null)
  const cancelResize = useRef<(() => void) | null>(null)
  const [preview, setPreview] = useState<Preview | null>(null)
  useEffect(() => () => cancelResize.current?.(), [editable, src])

  function saveWidth(next: number) {
    if (!editor.isEditable()) return
    editor.update(() => {
      const image = $getNodeByKey(nodeKey)
      if (image instanceof NoteImageNode && image.isAttached()) image.setDisplayWidth(next)
    }, { tag: [HISTORY_PUSH_TAG, SKIP_DOM_SELECTION_TAG], discrete: true })
  }

  function startResize(event: ReactPointerEvent<HTMLButtonElement>, corner: Corner) {
    const img = imageRef.current
    const root = editor.getRootElement()
    if (!img?.naturalWidth || !root || !editor.isEditable() || cancelResize.current || !event.isPrimary || event.button !== 0) return
    const start = img.getBoundingClientRect()
    if (!start.width || !start.height) return
    const handle: HTMLButtonElement = event.currentTarget
    const id = event.pointerId
    const x = event.clientX
    const y = event.clientY
    const slope = start.height / start.width
    const max = availableWidth(img, root)
    const min = Math.min(32, start.width, max)
    const listeners = new AbortController()
    const options = { signal: listeners.signal }
    event.preventDefault()
    event.stopPropagation()
    handle.setPointerCapture(id)

    function projectedWidth(e: PointerEvent) {
      // Project the pointer onto this corner's diagonal, so both axes contribute without stretching the image.
      const dx = corner.x * (e.clientX - x)
      const dy = corner.y * (e.clientY - y)
      if (Math.hypot(dx, dy) < 2) return Math.round(start.width)
      return Math.round(Math.min(max, Math.max(min, start.width + (dx + dy * slope) / (1 + slope * slope))))
    }
    const end = () => {
      listeners.abort()
      cancelResize.current = null
      if (handle.hasPointerCapture(id)) handle.releasePointerCapture(id)
      setPreview(null)
    }
    cancelResize.current = end
    handle.addEventListener('pointermove', (e) => {
      if (e.pointerId !== id) return
      const next = projectedWidth(e)
      setPreview({
        start,
        width: next,
        left: corner.x < 0 ? start.width - next : 0,
        top: corner.y < 0 ? start.height - next * slope : 0,
      })
    }, options)
    handle.addEventListener('pointerup', (e) => {
      if (e.pointerId !== id) return
      const next = projectedWidth(e)
      end()
      if (next !== Math.round(start.width)) saveWidth(next)
      handle.focus({ preventScroll: true })
    }, options)
    handle.addEventListener('pointercancel', end, options)
    handle.addEventListener('lostpointercapture', end, options)
    root.ownerDocument.defaultView?.addEventListener('blur', end, options)
    root.ownerDocument.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); end() }
    }, { ...options, capture: true })
  }

  return (
    <span className="relative inline-block max-w-full self-start align-middle"
      style={preview ? { width: preview.start.width, height: preview.start.height } : undefined}>
      <span ref={setFrame} tabIndex={-1} className="group/image relative block max-w-full outline-none"
        style={preview ? { position: 'absolute', zIndex: 10, maxWidth: 'none', width: preview.width, left: preview.left, top: preview.top } : { width: width ?? undefined }}>
        <img ref={imageRef} src={src} alt="Pasted trade note image" draggable={false}
          onClick={() => frame?.focus({ preventScroll: true })}
          style={{ width: preview || width ? '100%' : undefined }}
          className="block h-auto max-w-full rounded-lg group-hover/image:ring-1 group-focus-within/image:ring-2 ring-blue-400/70" />
        <NoteImageMoveHandle nodeKey={nodeKey} />
        {frame && !preview && <NoteImageActions nodeKey={nodeKey} src={src} anchor={frame} editable={editable} />}
        {editable && corners.map((corner) => (
          <button
            key={corner.name}
            type="button"
            aria-label={`Resize image from ${corner.name}`}
            aria-keyshortcuts="ArrowLeft ArrowRight ArrowUp ArrowDown"
            title="Drag to resize image"
            className={`absolute z-10 flex size-4 max-h-[40%] max-w-[40%] touch-none select-none opacity-0 group-hover/image:opacity-100 group-focus-within/image:opacity-100 focus-visible:outline-2 focus-visible:outline-ring [@media(hover:none)]:size-5 [@media(hover:none)]:opacity-100 ${corner.position}`}
            style={preview ? { opacity: 1 } : undefined}
            onPointerDown={(e) => startResize(e, corner)}
            onKeyDown={(e) => {
              const img = imageRef.current
              const root = editor.getRootElement()
              const directions: Record<string, number> = {
                ArrowLeft: -corner.x, ArrowRight: corner.x, ArrowUp: -corner.y, ArrowDown: corner.y,
              }
              if (!img || !root || !directions[e.key] || cancelResize.current) return
              e.preventDefault()
              e.stopPropagation()
              const current = Math.round(img.getBoundingClientRect().width)
              const next = Math.min(availableWidth(img, root), Math.max(Math.min(32, current), current + directions[e.key] * 10))
              if (next !== current) saveWidth(next)
            }}
          >
            <span aria-hidden className="size-2 rounded-[2px] border border-blue-500 bg-white shadow-xs" />
          </button>
        ))}
      </span>
    </span>
  )
}
