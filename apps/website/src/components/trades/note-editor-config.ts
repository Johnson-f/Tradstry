import { LinkNode } from '@lexical/link'
import { ListItemNode, ListNode } from '@lexical/list'
import { HeadingNode, QuoteNode } from '@lexical/rich-text'
import type { EditorThemeClasses } from 'lexical'

export const NOTE_NODES = [HeadingNode, QuoteNode, ListNode, ListItemNode, LinkNode]

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
