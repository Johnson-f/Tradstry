import { LinkNode } from '@lexical/link'
import { $isListNode, ListItemNode, ListNode, REMOVE_LIST_COMMAND } from '@lexical/list'
import { $createHeadingNode, $createQuoteNode, HeadingNode, QuoteNode } from '@lexical/rich-text'
import { $setBlocksType } from '@lexical/selection'
import { TableCellNode, TableNode, TableRowNode } from '@lexical/table'
import { $createParagraphNode, $getSelection, $isRangeSelection, type EditorThemeClasses, type LexicalEditor } from 'lexical'
import { NoteImageNode } from '@/components/trades/note-image-node'

export const NOTE_NODES = [HeadingNode, QuoteNode, ListNode, ListItemNode, LinkNode, TableNode, TableRowNode, TableCellNode, NoteImageNode]

export function $setNoteBlock(editor: LexicalEditor, block: 'paragraph' | 'h2' | 'h3' | 'quote') {
  const selection = $getSelection()
  if (!$isRangeSelection(selection)) return
  if (selection.anchor.getNode().getParents().some($isListNode)) editor.dispatchCommand(REMOVE_LIST_COMMAND, undefined)
  const current = $getSelection()
  if ($isRangeSelection(current)) {
    $setBlocksType(current, () => {
      if (block === 'paragraph') return $createParagraphNode()
      if (block === 'quote') return $createQuoteNode()
      return $createHeadingNode(block)
    })
  }
}

export const NOTE_THEME: EditorThemeClasses = {
  paragraph: 'mb-3 last:mb-0',
  heading: {
    h1: 'mb-3 mt-6 text-2xl font-semibold tracking-tight first:mt-0',
    h2: 'mb-3 mt-5 text-xl font-semibold tracking-tight first:mt-0',
    h3: 'mb-2 mt-4 text-lg font-semibold first:mt-0',
    h4: 'mb-2 mt-4 text-base font-semibold first:mt-0',
    h5: 'mb-2 mt-4 text-base font-semibold first:mt-0',
    h6: 'mb-2 mt-4 text-base font-semibold first:mt-0',
  },
  quote: 'my-4 border-l-2 border-border pl-4 text-muted-foreground',
  table: 'w-full table-fixed border-collapse text-left text-sm has-[>colgroup]:w-px data-[note-resizing]:w-px',
  tableScrollableWrapper: 'my-4 max-w-full has-[table>colgroup]:w-fit has-[table[data-note-resizing]]:w-fit',
  tableCell: 'min-w-20 border border-border px-3 py-2 align-top [overflow-wrap:anywhere]',
  tableCellHeader: 'bg-muted/60 font-semibold',
  tableCellSelected: 'outline outline-2 -outline-offset-2 outline-ring',
  list: {
    ul: 'my-3 list-disc pl-6',
    ol: 'my-3 list-decimal pl-6',
    listitem: 'my-1',
    nested: { listitem: 'list-none' },
  },
  link: 'cursor-text underline decoration-muted-foreground underline-offset-4',
  text: {
    bold: 'font-semibold',
    italic: 'italic',
    underline: 'underline',
    strikethrough: 'line-through',
    underlineStrikethrough: 'underline line-through',
    code: 'rounded bg-muted px-1 py-0.5 font-mono text-[0.9em]',
  },
}
