import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext'
import { $isTableNode, $isTableRowNode } from '@lexical/table'
import { $getNearestNodeFromDOMNode, $getNodeByKey, HISTORY_PUSH_TAG, SKIP_DOM_SELECTION_TAG, type NodeKey } from 'lexical'
import { useLayoutEffect, useRef, useState, type PointerEvent } from 'react'

type Axis = 'column' | 'row'
const MIN_SIZE = { column: 80, row: 24 }

interface Resize {
  initial: number
  preview: (size: number) => void
  restore: () => void
  save: (size: number) => void
}

interface Drag extends Resize {
  pointerId: number
  axis: Axis
  start: number
}

export function NoteTableResizers({ tableKey, wrapper }: { tableKey: NodeKey; wrapper: HTMLElement }) {
  const [editor] = useLexicalComposerContext()
  const table = wrapper instanceof HTMLTableElement ? wrapper : wrapper.querySelector('table')
  const firstRow = table?.rows[0]
  const columnCount = firstRow?.cells.length ?? 0
  const rowCount = table?.rows.length ?? 0
  const [columns, setColumns] = useState<{ edge: number; size: number }[]>([])
  const [rows, setRows] = useState<{ edge: number; size: number }[]>([])
  const drag = useRef<Drag | null>(null)

  useLayoutEffect(() => {
    if (!table || !firstRow) return
    const measure = () => {
      const origin = wrapper.getBoundingClientRect()
      setColumns(Array.from(firstRow.cells, (cell) => {
        const rect = cell.getBoundingClientRect()
        return { edge: rect.right - origin.left, size: Math.round(rect.width) }
      }))
      setRows(Array.from(table.rows, (row) => {
        const rect = row.getBoundingClientRect()
        return { edge: rect.bottom - origin.top, size: Math.round(rect.height) }
      }))
    }
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(wrapper)
    Array.from(table.rows).forEach((row) => observer.observe(row))
    Array.from(firstRow.cells).forEach((cell) => observer.observe(cell))
    wrapper.addEventListener('scroll', measure)
    return () => {
      observer.disconnect()
      wrapper.removeEventListener('scroll', measure)
      drag.current?.restore()
      drag.current = null
    }
  }, [wrapper, table, firstRow, rowCount, columnCount])

  function columnResize(index: number): Resize | null {
    if (!table || !firstRow?.cells[index]) return null
    const cells = Array.from(firstRow.cells)
    const widths = cells.map((cell) => Math.round(cell.getBoundingClientRect().width))
    // Automatic tables use the first row for sizing. Saved widths live in a colgroup.
    const cols = Array.from(table.querySelectorAll<HTMLTableColElement>(':scope > colgroup > col'))
    const targets = cols.length === widths.length ? cols : cells
    const original = targets.map((element) => element.style.width)
    return {
      initial: widths[index],
      preview: (width) => {
        if (!table.hasAttribute('data-note-resizing')) {
          table.setAttribute('data-note-resizing', '')
          targets.forEach((element, i) => { element.style.width = `${widths[i]}px` })
        }
        targets[index].style.width = `${width}px`
      },
      restore: () => {
        table.removeAttribute('data-note-resizing')
        targets.forEach((element, i) => { element.style.width = original[i] })
      },
      save: (width) => editor.update(() => {
        const node = $getNodeByKey(tableKey)
        if ($isTableNode(node) && node.isAttached() && node.getColumnCount() === widths.length) {
          node.setColWidths(widths.map((current, i) => i === index ? width : current))
        }
      }, { tag: [HISTORY_PUSH_TAG, SKIP_DOM_SELECTION_TAG], discrete: true }),
    }
  }

  function rowResize(index: number): Resize | null {
    const element = table?.rows[index]
    if (!element) return null
    const key = editor.read(() => $getNearestNodeFromDOMNode(element)?.getKey())
    if (!key) return null
    const original = element.style.height
    return {
      initial: Math.round(element.getBoundingClientRect().height),
      preview: (height) => { element.style.height = `${height}px` },
      restore: () => { element.style.height = original },
      save: (height) => editor.update(() => {
        const row = $getNodeByKey(key)
        if ($isTableRowNode(row) && row.isAttached()) row.setHeight(height)
      }, { tag: [HISTORY_PUSH_TAG, SKIP_DOM_SELECTION_TAG], discrete: true }),
    }
  }

  function startDrag(event: PointerEvent<HTMLDivElement>, axis: Axis, index: number) {
    if (!editor.isEditable() || !event.isPrimary || event.button !== 0 || drag.current) return
    const resize = axis === 'row' ? rowResize(index) : columnResize(index)
    if (!resize) return
    event.preventDefault()
    event.currentTarget.setPointerCapture(event.pointerId)
    drag.current = { ...resize, pointerId: event.pointerId, axis, start: axis === 'row' ? event.clientY : event.clientX }
  }

  function moveDrag(event: PointerEvent<HTMLDivElement>, finish: boolean) {
    const current = drag.current
    if (!current || event.pointerId !== current.pointerId) return
    const position = current.axis === 'row' ? event.clientY : event.clientX
    const delta = Math.round(position - current.start)
    const size = delta === 0 ? current.initial : Math.max(MIN_SIZE[current.axis], current.initial + delta)
    if (!finish) {
      current.preview(size)
      return
    }
    current.restore()
    drag.current = null
    if (size !== current.initial && editor.isEditable()) current.save(size)
  }

  function handle(axis: Axis, index: number, edge: number, size: number) {
    const horizontal = axis === 'row'
    const label = `Resize ${axis} ${index + 1}`
    return (
      <div
        key={`${axis}-${index}`}
        role="separator"
        tabIndex={0}
        aria-label={label}
        aria-orientation={horizontal ? 'horizontal' : 'vertical'}
        aria-valuemin={Math.min(size, MIN_SIZE[axis])}
        aria-valuenow={size}
        aria-valuetext={`${size} pixels`}
        title={label}
        data-last-row-handle={horizontal && index === rowCount - 1 ? '' : undefined}
        style={horizontal ? { top: edge - 4 } : { left: edge - (index === columnCount - 1 ? 12 : 4) }}
        className={`group pointer-events-auto absolute touch-none select-none outline-none ${horizontal ? 'inset-x-0 h-2 cursor-row-resize' : 'inset-y-0 w-2 cursor-col-resize'}`}
        onPointerDown={(event) => startDrag(event, axis, index)}
        onPointerMove={(event) => moveDrag(event, false)}
        onPointerUp={(event) => moveDrag(event, true)}
        onLostPointerCapture={(event) => {
          if (drag.current?.pointerId === event.pointerId) {
            drag.current.restore()
            drag.current = null
          }
        }}
        onKeyDown={(event) => {
          const decrease = horizontal ? 'ArrowUp' : 'ArrowLeft'
          const increase = horizontal ? 'ArrowDown' : 'ArrowRight'
          if (!editor.isEditable() || (event.key !== decrease && event.key !== increase)) return
          event.preventDefault()
          const resize = horizontal ? rowResize(index) : columnResize(index)
          if (!resize) return
          const next = Math.max(MIN_SIZE[axis], resize.initial + (event.key === decrease ? -10 : 10))
          if (next !== resize.initial) resize.save(next)
        }}
      >
        <span className={`pointer-events-none absolute bg-primary opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100 group-active:opacity-100 ${horizontal ? 'inset-x-0 top-1/2 h-0.5 -translate-y-1/2' : 'inset-y-0 left-1/2 w-0.5 -translate-x-1/2'}`} />
      </div>
    )
  }

  return (
    <div className="pointer-events-none absolute inset-x-0 top-0 overflow-hidden" style={{ height: rows.at(-1)?.edge ?? 0 }}>
      {columns.map(({ edge, size }, i) => handle('column', i, edge, size))}
      {rows.map(({ edge, size }, i) => handle('row', i, edge, size))}
    </div>
  )
}
