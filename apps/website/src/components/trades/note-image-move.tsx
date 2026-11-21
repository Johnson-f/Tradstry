import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext'
import { useLexicalEditable } from '@lexical/react/useLexicalEditable'
import { $isTableCellNode } from '@lexical/table'
import {
  $createParagraphNode, $getNearestNodeFromDOMNode, $getNodeByKey, $getRoot,
  $isParagraphNode, $isRootNode, HISTORY_PUSH_TAG, SKIP_DOM_SELECTION_TAG,
  type ElementNode, type LexicalEditor, type LexicalNode, type NodeKey,
} from 'lexical'
import { GripVertical } from 'lucide-react'
import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import { createPortal } from 'react-dom'
import { NoteImageNode } from './note-image-node'

type Point = { x: number; y: number }
type Destination = { key: NodeKey; before: boolean }
type DropLine = Destination & { x: number; y: number; width: number }
type Preview = { src: string; left: number; top: number; width: number; height: number; line: DropLine | null }

function $containingBlock(node: LexicalNode) {
  let block = node
  for (let parent = block.getParent(); parent && !$isRootNode(parent) && !$isTableCellNode(parent); parent = block.getParent()) {
    block = parent
  }
  return block
}

function $standaloneParagraph(image: NoteImageNode) {
  const parent = image.getParent()
  return $isParagraphNode(parent) && parent.getChildrenSize() === 1 &&
    ($isRootNode(parent.getParent()) || $isTableCellNode(parent.getParent())) ? parent : null
}

function $moveImage(key: NodeKey, destination: Destination) {
  const image = $getNodeByKey(key)
  const target = $getNodeByKey(destination.key)
  if (!(image instanceof NoteImageNode) || !image.isAttached() || !target?.isAttached()) return
  const container = target.getParent()
  if (!$isRootNode(container) && !$isTableCellNode(container)) return
  const paragraph = $standaloneParagraph(image)
  if (paragraph && (paragraph.is(target) || paragraph.is(destination.before ? target.getPreviousSibling() : target.getNextSibling()))) return

  // An inline paste may share its paragraph with text. Only lift the image in that case.
  const block = paragraph ?? $createParagraphNode().append(image)
  if ($isParagraphNode(target) && target.isEmpty()) target.replace(block)
  else if (destination.before) target.insertBefore(block)
  else target.insertAfter(block)
}

function dropLine(editor: LexicalEditor, point: Point, viewport: HTMLElement): DropLine | null {
  const root = editor.getRootElement()
  if (!root) return null
  const bounds = root.getBoundingClientRect()
  const visible = viewport.getBoundingClientRect()
  if (point.x < Math.max(bounds.left - 28, visible.left) || point.x > Math.min(bounds.right, visible.right) ||
      point.y < Math.max(bounds.top, visible.top) || point.y > Math.min(bounds.bottom, visible.bottom)) return null

  const hit = root.ownerDocument.elementFromPoint(point.x, point.y)
  const cell = hit?.closest('td,th')
  return editor.read(() => {
    let container: ElementNode = $getRoot()
    if (cell && root.contains(cell)) {
      const tableRect = cell.closest('table')?.getBoundingClientRect()
      // At the table's outer borders, allow dropping before or after the whole table.
      if (tableRect && point.y > tableRect.top + 5 && point.y < tableRect.bottom - 5) {
        const cellNode = $getNearestNodeFromDOMNode(cell)
        if ($isTableCellNode(cellNode)) container = cellNode
      }
    }
    let line: DropLine | null = null
    for (const block of container.getChildren()) {
      const element = editor.getElementByKey(block.getKey())
      if (!element) continue
      const rect = element.getBoundingClientRect()
      const before = point.y < rect.top + rect.height / 2
      const x = Math.max(rect.left, bounds.left, visible.left)
      const right = Math.min(rect.right, bounds.right, visible.right)
      const y = Math.max(visible.top + 1, Math.min(visible.bottom - 1, before ? rect.top : rect.bottom))
      line = { key: block.getKey(), before, x, width: Math.max(0, right - x), y }
      if (before || point.y <= rect.bottom) break
    }
    return line
  })
}

export function NoteImageMoveHandle({ nodeKey }: { nodeKey: NodeKey }) {
  const [editor] = useLexicalComposerContext()
  const editable = useLexicalEditable()
  const cancelDrag = useRef<(() => void) | null>(null)
  const [preview, setPreview] = useState<Preview | null>(null)
  useEffect(() => () => cancelDrag.current?.(), [editable, editor])

  function start(event: ReactPointerEvent<HTMLButtonElement>) {
    if (!event.isPrimary || event.button !== 0 || !editor.isEditable() || cancelDrag.current) return
    const handle: HTMLButtonElement = event.currentTarget
    const root = editor.getRootElement()
    const image = editor.getElementByKey(nodeKey)?.querySelector('img')
    if (!root || !image) return
    const viewport = root.closest<HTMLElement>('[data-slot="scroll-area-viewport"]') ?? root
    const doc = root.ownerDocument
    const win = doc.defaultView
    if (!win) return
    event.preventDefault()
    const id = event.pointerId
    const origin = { x: event.clientX, y: event.clientY }
    const rect = image.getBoundingClientRect()
    const src = image.currentSrc || image.src
    let point = origin
    let dragging = false
    let frame = 0
    let lastFrame = 0
    const listeners = new AbortController()
    handle.setPointerCapture(id)

    const draw = (time: number) => {
      frame = 0
      const visible = viewport.getBoundingClientRect()
      let speed = 0
      if (point.x >= visible.left && point.x <= visible.right && point.y >= visible.top && point.y <= visible.bottom) {
        const band = Math.min(48, visible.height / 4)
        if (point.y < visible.top + band) speed = -(visible.top + band - point.y) / band
        else if (point.y > visible.bottom - band) speed = (point.y - visible.bottom + band) / band
      }
      const oldScroll = viewport.scrollTop
      if (speed) viewport.scrollTop += speed * Math.min(32, time - lastFrame || 16) * 0.8
      lastFrame = time
      setPreview({ src, width: rect.width, height: rect.height,
        left: rect.left + point.x - origin.x, top: rect.top + point.y - origin.y,
        line: dropLine(editor, point, viewport) })
      if (viewport.scrollTop !== oldScroll) frame = win.requestAnimationFrame(draw)
    }
    const redraw = () => { if (dragging && !frame) frame = win.requestAnimationFrame(draw) }
    const end = () => {
      listeners.abort()
      win.cancelAnimationFrame(frame)
      cancelDrag.current = null
      if (handle.hasPointerCapture(id)) handle.releasePointerCapture(id)
      setPreview(null)
    }
    cancelDrag.current = end
    const options = { signal: listeners.signal }
    handle.addEventListener('pointermove', (e) => {
      if (e.pointerId !== id) return
      point = { x: e.clientX, y: e.clientY }
      dragging ||= Math.hypot(point.x - origin.x, point.y - origin.y) >= 4
      redraw()
    }, options)
    handle.addEventListener('pointerup', (e) => {
      if (e.pointerId !== id) return
      const destination = dragging && dropLine(editor, { x: e.clientX, y: e.clientY }, viewport)
      end()
      if (destination && editor.isEditable()) {
        editor.update(() => $moveImage(nodeKey, destination),
          { tag: [HISTORY_PUSH_TAG, SKIP_DOM_SELECTION_TAG], discrete: true })
        editor.getElementByKey(nodeKey)?.querySelector<HTMLButtonElement>('[data-note-image-handle]')?.focus({ preventScroll: true })
      } else if (!dragging) {
        handle.focus({ preventScroll: true })
      }
    }, options)
    handle.addEventListener('pointercancel', end, options)
    handle.addEventListener('lostpointercapture', end, options)
    viewport.addEventListener('scroll', redraw, options)
    win.addEventListener('blur', end, options)
    doc.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); end() }
    }, { ...options, capture: true })
  }

  if (!editable) return null
  return (
    <>
      <button
        type="button"
        aria-label="Move image"
        aria-keyshortcuts="ArrowUp ArrowDown"
        title="Drag to move image, or focus and use the up and down arrows"
        data-note-image-handle=""
        data-dragging={preview ? '' : undefined}
        className="absolute top-0 right-full z-10 flex h-7 w-6 touch-none cursor-grab items-center justify-center rounded text-muted-foreground opacity-0 hover:bg-accent focus-visible:opacity-100 focus-visible:outline-2 focus-visible:outline-ring active:cursor-grabbing group-hover/image:opacity-100 data-dragging:opacity-100 [@media(hover:none)]:opacity-100 [td_&]:top-1/2 [td_&]:right-auto [td_&]:left-0 [td_&]:-translate-y-1/2 [th_&]:top-1/2 [th_&]:right-auto [th_&]:left-0 [th_&]:-translate-y-1/2"
        onPointerDown={start}
        onKeyDown={(e) => {
          if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return
          e.preventDefault()
          const up = e.key === 'ArrowUp'
          editor.update(() => {
            const image = $getNodeByKey(nodeKey)
            if (!(image instanceof NoteImageNode)) return
            const block = $containingBlock(image)
            const target = $standaloneParagraph(image) ? (up ? block.getPreviousSibling() : block.getNextSibling()) : block
            if (target) $moveImage(nodeKey, { key: target.getKey(), before: up })
          }, { tag: [HISTORY_PUSH_TAG, SKIP_DOM_SELECTION_TAG], discrete: true })
          editor.getElementByKey(nodeKey)?.querySelector<HTMLButtonElement>('[data-note-image-handle]')?.focus()
        }}
      >
        <GripVertical className="size-4" aria-hidden />
      </button>
      {preview && createPortal(
        <div aria-hidden className="pointer-events-none fixed inset-0 z-50 overflow-hidden">
          <img
            src={preview.src}
            alt=""
            draggable={false}
            className="absolute max-w-none rounded-lg opacity-45 shadow-lg"
            style={{ left: preview.left, top: preview.top, width: preview.width, height: preview.height }}
          />
          {preview.line && (
            <div data-note-image-drop-line="" className="absolute h-0.5 -translate-y-1/2 bg-blue-500"
              style={{ left: preview.line.x, top: preview.line.y, width: preview.line.width }} />
          )}
        </div>,
        editor.getRootElement()?.ownerDocument.body ?? document.body,
      )}
    </>
  )
}
