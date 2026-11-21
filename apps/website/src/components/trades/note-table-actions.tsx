import { autoUpdate, hide, offset, useFloating } from '@floating-ui/react-dom'
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext'
import {
  $deleteTableColumnAtSelection,
  $deleteTableRowAtSelection,
  $findCellNode,
  $insertTableColumnAtNode,
  $insertTableRowAtNode,
  $isTableCellNode,
} from '@lexical/table'
import { mergeRegister } from '@lexical/utils'
import {
  $createParagraphNode,
  $getNodeByKey,
  $getRoot,
  $getSelection,
  $isRangeSelection,
  COMMAND_PRIORITY_HIGH,
  HISTORY_PUSH_TAG,
  KEY_DOWN_COMMAND,
  type NodeKey,
} from 'lexical'
import { ArrowDown, ArrowLeft, ArrowRight, ArrowUp, Ellipsis, Trash2 } from 'lucide-react'
import { useEffect, useState } from 'react'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'

function $activeCell() {
  const selection = $getSelection()
  return $isRangeSelection(selection) && selection.isCollapsed()
    ? $findCellNode(selection.anchor.getNode())
    : null
}

type TableAction = 'above' | 'below' | 'left' | 'right' | 'delete-row' | 'delete-column'

export function NoteTableActions({ disabled }: { disabled: boolean }) {
  const [editor] = useLexicalComposerContext()
  const [selectedKey, setSelectedKey] = useState<NodeKey | null>(null)
  // The menu takes focus from the editor. Keep the cell it opened on until it closes.
  const [menuKey, setMenuKey] = useState<NodeKey | null>(null)
  const cellKey = menuKey ?? selectedKey
  const cellElement = cellKey ? editor.getElementByKey(cellKey) : null
  const { refs: { setFloating }, floatingStyles, middlewareData, isPositioned } = useFloating({
    elements: { reference: cellElement },
    placement: 'top-end',
    middleware: [offset({ mainAxis: -12, crossAxis: -4 }), hide()],
    whileElementsMounted: autoUpdate,
  })

  useEffect(() => mergeRegister(
    editor.registerUpdateListener(({ editorState }) => {
      editorState.read(() => setSelectedKey($activeCell()?.getKey() ?? null))
    }),
    editor.registerCommand(KEY_DOWN_COMMAND, (event) => {
      if (event.key !== 'F10' || !event.shiftKey || !editor.isEditable()) return false
      const cell = $activeCell()
      if (!cell) return false
      event.preventDefault()
      setMenuKey(cell.getKey())
      return true
    }, COMMAND_PRIORITY_HIGH),
  ), [editor])

  function apply(action: TableAction) {
    if (!menuKey || !editor.isEditable()) return
    editor.update(() => {
      const cell = $getNodeByKey(menuKey)
      if (!$isTableCellNode(cell) || !cell.isAttached()) return
      switch (action) {
        case 'above':
        case 'below': {
          const row = $insertTableRowAtNode(cell, action === 'below')
          row?.getChildAtIndex(cell.getIndexWithinParent())?.selectStart()
          break
        }
        case 'left':
        case 'right': {
          const after = action === 'right'
          $insertTableColumnAtNode(cell, after, false)
          const inserted = after ? cell.getNextSibling() : cell.getPreviousSibling()
          inserted?.selectStart()
          break
        }
        case 'delete-row':
        case 'delete-column':
          cell.selectStart()
          if (action === 'delete-row') $deleteTableRowAtSelection()
          else $deleteTableColumnAtSelection()
          if ($getRoot().isEmpty()) $getRoot().append($createParagraphNode()).selectEnd()
          break
      }
    }, { tag: HISTORY_PUSH_TAG })
  }

  if (disabled || !cellElement) return null

  return (
    <DropdownMenu modal={false} open={menuKey !== null} onOpenChange={(open) => setMenuKey(open ? cellKey : null)}>
      <DropdownMenuTrigger
        ref={setFloating}
        aria-label="Table actions"
        aria-keyshortcuts="Shift+F10"
        title="Table actions"
        style={{ ...floatingStyles, visibility: isPositioned && !middlewareData.hide?.referenceHidden ? 'visible' : 'hidden' }}
        className="z-10 inline-flex h-6 w-7 items-center justify-center rounded-md border bg-popover text-muted-foreground shadow-sm hover:bg-accent hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring"
      >
        <Ellipsis className="size-4" aria-hidden />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" finalFocus={() => editor.getRootElement()} className="w-44">
        <DropdownMenuItem onClick={() => apply('above')}><ArrowUp /> Add row above</DropdownMenuItem>
        <DropdownMenuItem onClick={() => apply('below')}><ArrowDown /> Add row below</DropdownMenuItem>
        <DropdownMenuItem variant="destructive" onClick={() => apply('delete-row')}><Trash2 /> Delete row</DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => apply('left')}><ArrowLeft /> Add column left</DropdownMenuItem>
        <DropdownMenuItem onClick={() => apply('right')}><ArrowRight /> Add column right</DropdownMenuItem>
        <DropdownMenuItem variant="destructive" onClick={() => apply('delete-column')}><Trash2 /> Delete column</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
