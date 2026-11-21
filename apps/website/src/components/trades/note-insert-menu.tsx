import { autoUpdate, flip, offset, shift, useFloating } from '@floating-ui/react-dom'
import { INSERT_ORDERED_LIST_COMMAND, INSERT_UNORDERED_LIST_COMMAND } from '@lexical/list'
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext'
import { LexicalTypeaheadMenuPlugin, MenuOption, useBasicTypeaheadTriggerMatch } from '@lexical/react/LexicalTypeaheadMenuPlugin'
import { $findTableNode, INSERT_TABLE_COMMAND } from '@lexical/table'
import { $addUpdateTag, $getSelection, $isRangeSelection, COMMAND_PRIORITY_HIGH, HISTORY_PUSH_TAG, KEY_ESCAPE_COMMAND, type LexicalEditor } from 'lexical'
import { Heading2, Heading3, List, ListOrdered, Quote, Table2, Type, type LucideIcon } from 'lucide-react'
import { Fragment, useCallback, useMemo, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { ScrollArea } from '@/components/ui/scroll-area'
import { $setNoteBlock } from '@/components/trades/note-editor-config'
import { $insertFillMention, describeFill } from '@/components/trades/note-fill-mention'
import type { TradeFill } from '@/lib/client/trades/trades'

class BlockOption extends MenuOption {
  readonly Icon: LucideIcon
  readonly apply: (editor: LexicalEditor) => void

  constructor(label: string, Icon: LucideIcon, apply: (editor: LexicalEditor) => void) {
    super(label)
    this.Icon = Icon
    this.apply = apply
  }
}

class FillOption extends MenuOption {
  readonly fillKey: string
  readonly number: number
  readonly label: string
  readonly amount: string
  readonly when: string

  constructor(fill: TradeFill, number: number) {
    super(`${number}:${fill.key}`)
    this.fillKey = fill.key
    this.number = number
    const { label, amount, when } = describeFill(fill, number)
    this.label = label
    this.amount = amount
    this.when = when
  }

  get text() {
    return `${this.label} · ${this.amount} · ${this.when}`
  }
}

function CaretMenu({ editor, children }: { editor: LexicalEditor; children: ReactNode }) {
  const caret = useMemo(() => {
    const root = editor.getRootElement()
    if (!root) return null
    return {
      contextElement: root,
      getBoundingClientRect: () => {
        const selection = root.ownerDocument.getSelection()
        return selection?.rangeCount ? selection.getRangeAt(0).getBoundingClientRect() : root.getBoundingClientRect()
      },
    }
  }, [editor])
  const { refs: { setFloating }, floatingStyles, isPositioned } = useFloating({
    elements: { reference: caret },
    strategy: 'fixed',
    placement: 'bottom-start',
    middleware: [offset(4), flip({ padding: 8 }), shift({ padding: 8, crossAxis: true })],
    whileElementsMounted: (reference, floating, update) => autoUpdate(reference, floating, update, { animationFrame: true }),
  })
  return (
    <div
      ref={setFloating}
      style={{ ...floatingStyles, visibility: isPositioned ? 'visible' : 'hidden' }}
      className="flex max-h-[min(22rem,48dvh)] w-60 max-w-[calc(100vw-2rem)] flex-col overflow-hidden rounded-xl border bg-popover font-sans text-sm text-popover-foreground shadow-lg"
    >
      {children}
    </div>
  )
}

export function NoteInsertMenu({ tradeId, fills }: { tradeId: string; fills: TradeFill[] }) {
  const [editor] = useLexicalComposerContext()
  const [query, setQuery] = useState<string | null>(null)
  const [inTable, setInTable] = useState(false)
  const [showFills, setShowFills] = useState(false)
  const matchBlock = useBasicTypeaheadTriggerMatch('/', { minLength: 0 })
  const matchFill = useBasicTypeaheadTriggerMatch('@', { minLength: 0, allowWhitespace: true, punctuation: '/\n\r' })
  const trigger = useCallback((text: string, editor: LexicalEditor) => {
    const fill = matchFill(text, editor)
    setShowFills(fill !== null)
    return fill ?? matchBlock(text, editor)
  }, [matchBlock, matchFill])
  const commands = useMemo(() => [
    new BlockOption('Table', Table2, (editor) => editor.dispatchCommand(INSERT_TABLE_COMMAND, {
      rows: '3', columns: '3', includeHeaders: { rows: true, columns: false },
    })),
    new BlockOption('Text', Type, (editor) => $setNoteBlock(editor, 'paragraph')),
    new BlockOption('Heading', Heading2, (editor) => $setNoteBlock(editor, 'h2')),
    new BlockOption('Subheading', Heading3, (editor) => $setNoteBlock(editor, 'h3')),
    new BlockOption('Bulleted list', List, (editor) => editor.dispatchCommand(INSERT_UNORDERED_LIST_COMMAND, undefined)),
    new BlockOption('Numbered list', ListOrdered, (editor) => editor.dispatchCommand(INSERT_ORDERED_LIST_COMMAND, undefined)),
    new BlockOption('Quote', Quote, (editor) => $setNoteBlock(editor, 'quote')),
  ], [])
  const fillOptions = useMemo(() => showFills ? fills.map((fill, i) => new FillOption(fill, i + 1)) : [], [showFills, fills])
  const options = useMemo(() => {
    const search = query?.trim().toLowerCase() ?? ''
    if (showFills) {
      const terms = search.split(/\s+/)
      return fillOptions.filter((option) => terms.every((term) => option.text.toLowerCase().includes(term)))
    }
    return commands.filter((command) =>
      !(inTable && command.key === 'Table') && command.key.toLowerCase().includes(search))
  }, [commands, inTable, query, showFills, fillOptions])
  const onQueryChange = useCallback((query: string | null) => {
    setQuery(query)
    const selection = $getSelection()
    setInTable($isRangeSelection(selection) && $findTableNode(selection.anchor.getNode()) !== null)
  }, [])

  return (
    <LexicalTypeaheadMenuPlugin<BlockOption | FillOption>
      triggerFn={trigger}
      options={options}
      onQueryChange={onQueryChange}
      commandPriority={COMMAND_PRIORITY_HIGH}
      anchorClassName="z-50"
      onSelectOption={(option, queryNode, closeMenu) => {
        if (queryNode) {
          $addUpdateTag(HISTORY_PUSH_TAG)
          if (option instanceof FillOption) {
            $insertFillMention(queryNode, `@${option.text}`, { tradeId, fillKey: option.fillKey, fillNumber: option.number })
          } else {
            queryNode.select(0, queryNode.getTextContentSize()).removeText()
            option.apply(editor)
          }
        }
        closeMenu()
      }}
      menuRenderFn={(anchor, { selectedIndex, setHighlightedIndex, selectOptionAndCleanUp }) =>
        anchor.current && createPortal(
          <CaretMenu editor={editor}>
            <ScrollArea className="flex min-h-0 flex-col overflow-hidden data-has-overflow-y:pr-1 [&>[data-slot=scroll-area-viewport]]:min-h-0 [&>[data-slot=scroll-area-viewport]]:overscroll-contain [&>[data-slot=scroll-area-viewport]]:p-1.5">
              {showFills && <div className="px-2 pt-2 pb-1 text-xs font-medium text-muted-foreground">Fills in this trade</div>}
              {options.map((option, index) => (
                <Fragment key={option.key}>
                  {!showFills && !query && (index === 0 || option.key === 'Text') && (
                    <div className="px-2 pt-2 pb-1 text-xs font-medium text-muted-foreground">
                      {option.key === 'Table' ? 'Suggested' : 'Basic blocks'}
                    </div>
                  )}
                  <div
                    ref={option.setRefElement}
                    id={`typeahead-item-${index}`}
                    role="option"
                    aria-selected={index === selectedIndex}
                    className="flex cursor-pointer items-center gap-2.5 rounded-md px-2 py-1.5 aria-selected:bg-accent aria-selected:text-accent-foreground"
                    onMouseMove={(event) => {
                      if (event.movementX || event.movementY) setHighlightedIndex(index)
                    }}
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={() => selectOptionAndCleanUp(option)}
                  >
                    {option instanceof FillOption ? (
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap justify-between gap-x-2 text-xs">
                          <span className="font-medium">{option.label}</span>
                          <span className="tabular-nums">{option.amount}</span>
                        </div>
                        <div className="mt-0.5 text-xs text-muted-foreground">{option.when}</div>
                      </div>
                    ) : (
                      <>
                        <option.Icon className="size-4" aria-hidden />
                        {option.key}
                      </>
                    )}
                  </div>
                </Fragment>
              ))}
              {options.length === 0 && (
                <p className="px-2 py-3 text-muted-foreground">
                  {showFills ? (fills.length ? 'No matching fills' : 'No fills recorded for this trade.') : 'No matching blocks'}
                </p>
              )}
            </ScrollArea>
            <button
              type="button"
              tabIndex={-1}
              className="flex shrink-0 items-center justify-between border-t px-3 py-2 text-xs text-muted-foreground hover:bg-accent"
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => editor.dispatchCommand(KEY_ESCAPE_COMMAND, new KeyboardEvent('keydown', { key: 'Escape' }))}
            >
              Close menu <kbd>esc</kbd>
            </button>
          </CaretMenu>,
          anchor.current,
        )
      }
    />
  )
}
