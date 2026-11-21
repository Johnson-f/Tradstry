import { autoUpdate, offset, size, useFloating } from '@floating-ui/react-dom'
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext'
import {
  $insertTableColumnAtNode,
  $insertTableRowAtNode,
  $isTableCellNode,
  $isTableNode,
  $isTableRowNode,
  TableNode,
} from '@lexical/table'
import { $getNodeByKey, $getRoot, HISTORY_PUSH_TAG, setDOMUnmanaged, type NodeKey } from 'lexical'
import { Plus } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { ScrollArea } from '@/components/ui/scroll-area'
import { NoteTableResizers } from '@/components/trades/note-table-resizers'

function markScrollArea(element: HTMLDivElement | null) {
  if (element) setDOMUnmanaged(element)
}

function TableEdges({ tableKey, disabled }: { tableKey: NodeKey; disabled: boolean }) {
  const [editor] = useLexicalComposerContext()
  const wrapper = editor.getElementByKey(tableKey)
  const [viewport, setViewport] = useState<HTMLDivElement | null>(null)
  const mountTable = useCallback((content: HTMLDivElement | null) => {
    const table = wrapper?.querySelector(':scope > table')
    if (!wrapper || !content || !table) return
    // Lexical owns the table and its editable cells. Move that same DOM into the scroll area.
    if (content.moveBefore && content.isConnected && table.isConnected) content.moveBefore(table, null)
    else content.appendChild(table)
    return () => {
      if (table.parentElement === content) wrapper.prepend(table)
    }
  }, [wrapper])
  const { refs: { setFloating }, floatingStyles, isPositioned } = useFloating({
    elements: { reference: wrapper },
    placement: 'bottom-start',
    middleware: [
      offset(({ rects }) => -rects.reference.height),
      size({
        apply({ rects, elements }) {
          Object.assign(elements.floating.style, {
            width: `${rects.reference.width}px`,
            height: `${rects.reference.height}px`,
          })
        },
      }),
    ],
    whileElementsMounted: autoUpdate,
  })

  function append(axis: 'row' | 'column') {
    if (!editor.isEditable()) return
    editor.update(() => {
      const table = $getNodeByKey(tableKey)
      if (!$isTableNode(table) || !table.isAttached()) return
      const row = axis === 'row' ? table.getLastChild() : table.getFirstChild()
      if (!$isTableRowNode(row)) return
      const cell = axis === 'row' ? row.getFirstChild() : row.getLastChild()
      if (!$isTableCellNode(cell)) return
      if (axis === 'row') $insertTableRowAtNode(cell)?.getFirstChild()?.selectStart()
      else $insertTableColumnAtNode(cell)
    }, { tag: HISTORY_PUSH_TAG })
  }

  const edgeClass = 'pointer-events-auto absolute flex cursor-pointer items-center justify-center rounded-sm bg-accent text-accent-foreground opacity-0 hover:opacity-100 focus-visible:opacity-100 focus-visible:outline-2 focus-visible:outline-ring [@media(hover:none)]:opacity-100'
  return (
    <>
      {wrapper instanceof HTMLDivElement && createPortal(
        <ScrollArea
          ref={markScrollArea}
          orientation="horizontal"
          viewportRef={setViewport}
          contentRef={mountTable}
          className="min-w-0 max-w-full data-has-overflow-x:pb-2.5 [&>[data-slot=scroll-area-viewport]]:overscroll-x-contain"
        />,
        wrapper,
      )}
      {!disabled && (
        <div
          ref={setFloating}
          style={{ ...floatingStyles, visibility: isPositioned ? 'visible' : 'hidden' }}
          className="pointer-events-none z-[1] [&:has([data-last-row-handle]:hover)>[data-add-row]]:opacity-100"
        >
          {viewport && <NoteTableResizers tableKey={tableKey} wrapper={viewport} />}
          <button
            type="button"
            aria-label="Add row at bottom"
            title="Add row at bottom"
            data-add-row=""
            className={`${edgeClass} top-full left-0 h-5 w-full`}
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => append('row')}
          >
            <Plus className="size-3.5" aria-hidden />
          </button>
          <button
            type="button"
            aria-label="Add column at right"
            title="Add column at right"
            className={`${edgeClass} top-0 left-full -ml-1 h-full w-5`}
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => append('column')}
          >
            <Plus className="size-3.5" aria-hidden />
          </button>
        </div>
      )}
    </>
  )
}

export function NoteTableEdges({ disabled }: { disabled: boolean }) {
  const [editor] = useLexicalComposerContext()
  const [tables, setTables] = useState<NodeKey[]>([])
  useEffect(() => editor.registerMutationListener(TableNode, () => {
    setTables(editor.getEditorState().read(() => $getRoot().getChildren().filter($isTableNode).map((table) => table.getKey())))
  }, { skipInitialization: false }), [editor])

  return tables.map((key) => <TableEdges key={key} tableKey={key} disabled={disabled} />)
}
