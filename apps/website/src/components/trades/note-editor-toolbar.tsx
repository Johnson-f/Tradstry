import { $isLinkNode, $toggleLink } from '@lexical/link'
import {
  $isListNode,
  INSERT_ORDERED_LIST_COMMAND,
  INSERT_UNORDERED_LIST_COMMAND,
  REMOVE_LIST_COMMAND,
} from '@lexical/list'
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext'
import { $createHeadingNode, $createQuoteNode, $isHeadingNode, $isQuoteNode } from '@lexical/rich-text'
import { $setBlocksType } from '@lexical/selection'
import { mergeRegister } from '@lexical/utils'
import {
  $createParagraphNode,
  $getRoot,
  $getSelection,
  $isRangeSelection,
  $setSelection,
  CAN_REDO_COMMAND,
  CAN_UNDO_COMMAND,
  COMMAND_PRIORITY_LOW,
  SET_TEXT_FORMAT_COMMAND,
  REDO_COMMAND,
  SELECTION_CHANGE_COMMAND,
  UNDO_COMMAND,
  type RangeSelection,
  type TextFormatType,
} from 'lexical'
import {
  Bold,
  Code,
  Italic,
  Link2,
  List,
  ListOrdered,
  Quote,
  Redo2,
  Strikethrough,
  Underline,
  Undo2,
  type LucideIcon,
} from 'lucide-react'
import { useEffect, useId, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { safeNoteUrl } from '@/lib/client/trades/note-document'

type Block = 'paragraph' | 'h2' | 'h3' | 'quote' | 'bullet' | 'number'
const FORMATS: Array<{ format: TextFormatType; label: string; icon: LucideIcon }> = [
  { format: 'bold', label: 'Bold', icon: Bold },
  { format: 'italic', label: 'Italic', icon: Italic },
  { format: 'underline', label: 'Underline', icon: Underline },
  { format: 'strikethrough', label: 'Strikethrough', icon: Strikethrough },
  { format: 'code', label: 'Inline code', icon: Code },
]

function Tool({
  label,
  icon: Icon,
  active,
  hint,
  disabled,
  onClick,
}: {
  label: string
  icon: LucideIcon
  active?: boolean
  hint?: string
  disabled: boolean
  onClick: () => void
}) {
  return (
    <Button
      type="button"
      variant={active ? 'default' : 'ghost'}
      size="icon-sm"
      title={hint ?? label}
      aria-label={label}
      aria-pressed={active}
      disabled={disabled}
      className={`size-8 rounded-md ${active ? '' : 'text-muted-foreground'}`}
      onMouseDown={(event) => event.preventDefault()}
      onClick={onClick}
    >
      <Icon className="size-3.5" aria-hidden />
    </Button>
  )
}

export function NoteEditorToolbar({ disabled }: { disabled: boolean }) {
  const [editor] = useLexicalComposerContext()
  const id = useId()
  const selection = useRef<RangeSelection | null>(null)
  const [block, setBlock] = useState<Block>('paragraph')
  const [formats, setFormats] = useState<TextFormatType[]>([])
  const [canUndo, setCanUndo] = useState(false)
  const [canRedo, setCanRedo] = useState(false)
  const [linkUrl, setLinkUrl] = useState('')
  const [hasSelection, setHasSelection] = useState(false)
  const [linkOpen, setLinkOpen] = useState(false)
  const [address, setAddress] = useState('')
  const [linkError, setLinkError] = useState<string | null>(null)

  useEffect(() => {
    const update = () => {
      const current = $getSelection()
      if (!$isRangeSelection(current)) return
      selection.current = current.clone()
      const node = current.anchor.getNode()
      const ancestors = [node, ...node.getParents()]
      const list = ancestors.find($isListNode)
      const heading = ancestors.find($isHeadingNode)
      const quote = ancestors.find($isQuoteNode)
      const link = ancestors.find($isLinkNode)
      setBlock(
        list
          ? list.getListType() === 'number'
            ? 'number'
            : 'bullet'
          : heading
            ? heading.getTag() === 'h3'
              ? 'h3'
              : 'h2'
            : quote
              ? 'quote'
              : 'paragraph',
      )
      setFormats(FORMATS.filter(({ format }) => current.hasFormat(format)).map(({ format }) => format))
      setLinkUrl(link?.getURL() ?? '')
      setHasSelection(!current.isCollapsed() || Boolean(link))
    }
    return mergeRegister(
      editor.registerUpdateListener(({ editorState }) => editorState.read(update)),
      editor.registerCommand(
        SELECTION_CHANGE_COMMAND,
        () => {
          update()
          return false
        },
        COMMAND_PRIORITY_LOW,
      ),
      editor.registerCommand(
        CAN_UNDO_COMMAND,
        (value) => {
          setCanUndo(value)
          return false
        },
        COMMAND_PRIORITY_LOW,
      ),
      editor.registerCommand(
        CAN_REDO_COMMAND,
        (value) => {
          setCanRedo(value)
          return false
        },
        COMMAND_PRIORITY_LOW,
      ),
    )
  }, [editor])

  const withSelection = (action: () => void) => {
    editor.update(() => {
      if (!$isRangeSelection($getSelection())) {
        if (selection.current) $setSelection(selection.current.clone())
        else $getRoot().selectEnd()
      }
      action()
    })
    editor.focus()
  }
  const setParagraph = (next: 'paragraph' | 'h2' | 'h3' | 'quote') =>
    withSelection(() => {
      if (block === 'bullet' || block === 'number') editor.dispatchCommand(REMOVE_LIST_COMMAND, undefined)
      const current = $getSelection()
      if (!$isRangeSelection(current)) return
      $setBlocksType(current, () =>
        next === 'paragraph'
          ? $createParagraphNode()
          : next === 'quote'
            ? $createQuoteNode()
            : $createHeadingNode(next),
      )
    })
  const applyLink = (url: string | null) => {
    editor.update(() => {
      if (selection.current) $setSelection(selection.current.clone())
      $toggleLink(url, { target: '_blank', rel: 'noopener noreferrer' })
    })
    setLinkOpen(false)
  }

  return (
    <Dialog open={linkOpen} onOpenChange={setLinkOpen}>
      <div
        role="toolbar"
        aria-label="Note formatting"
        className="flex flex-wrap items-center gap-0.5 border-y border-border/60 py-1.5"
        onKeyDown={(event) => {
          if (event.defaultPrevented || !['ArrowLeft', 'ArrowRight'].includes(event.key)) return
          const controls = Array.from(event.currentTarget.querySelectorAll<HTMLElement>('button:not(:disabled)'))
          const index = controls.indexOf(event.target as HTMLElement)
          if (index < 0) return
          event.preventDefault()
          controls[(index + (event.key === 'ArrowRight' ? 1 : controls.length - 1)) % controls.length]?.focus()
        }}
      >
        <Select
          disabled={disabled}
          value={block === 'h2' || block === 'h3' ? block : 'paragraph'}
          onValueChange={(value) => {
            if (value === 'paragraph' || value === 'h2' || value === 'h3') setParagraph(value)
          }}
        >
          <SelectTrigger
            aria-label="Text style"
            className="mr-1 h-8 w-28 border-transparent px-2 text-xs shadow-none hover:bg-muted"
          >
            <SelectValue>{block === 'h2' ? 'Heading' : block === 'h3' ? 'Subheading' : 'Normal text'}</SelectValue>
          </SelectTrigger>
          <SelectContent
            align="start"
            alignItemWithTrigger={false}
            finalFocus={() => editor.getRootElement()}
            className="p-1 data-open:animate-none data-closed:animate-none"
          >
            <SelectItem value="paragraph" className="py-2">
              Normal text
            </SelectItem>
            <SelectItem value="h2" className="py-2">
              Heading
            </SelectItem>
            <SelectItem value="h3" className="py-2">
              Subheading
            </SelectItem>
          </SelectContent>
        </Select>
        {FORMATS.map(({ format, label, icon }) => (
          <Tool
            key={format}
            label={label}
            icon={icon}
            active={formats.includes(format)}
            hint={`Turn ${label.toLowerCase()} ${formats.includes(format) ? 'off' : 'on'}`}
            disabled={disabled}
            onClick={() =>
              withSelection(() =>
                editor.dispatchCommand(SET_TEXT_FORMAT_COMMAND, { [format]: !formats.includes(format) }),
              )
            }
          />
        ))}
        <span className="mx-1 h-4 w-px bg-border" aria-hidden />
        <Tool
          label="Bulleted list"
          icon={List}
          active={block === 'bullet'}
          disabled={disabled}
          onClick={() =>
            withSelection(() =>
              editor.dispatchCommand(
                block === 'bullet' ? REMOVE_LIST_COMMAND : INSERT_UNORDERED_LIST_COMMAND,
                undefined,
              ),
            )
          }
        />
        <Tool
          label="Numbered list"
          icon={ListOrdered}
          active={block === 'number'}
          disabled={disabled}
          onClick={() =>
            withSelection(() =>
              editor.dispatchCommand(block === 'number' ? REMOVE_LIST_COMMAND : INSERT_ORDERED_LIST_COMMAND, undefined),
            )
          }
        />
        <Tool
          label="Quote"
          icon={Quote}
          active={block === 'quote'}
          disabled={disabled}
          onClick={() => setParagraph(block === 'quote' ? 'paragraph' : 'quote')}
        />
        <Tool
          label="Add or edit link"
          icon={Link2}
          active={Boolean(linkUrl)}
          disabled={disabled || !hasSelection}
          onClick={() => {
            setAddress(linkUrl)
            setLinkError(null)
            setLinkOpen(true)
          }}
        />
        <span className="mx-1 h-4 w-px bg-border" aria-hidden />
        <Tool
          label="Undo"
          icon={Undo2}
          disabled={disabled || !canUndo}
          onClick={() => editor.dispatchCommand(UNDO_COMMAND, undefined)}
        />
        <Tool
          label="Redo"
          icon={Redo2}
          disabled={disabled || !canRedo}
          onClick={() => editor.dispatchCommand(REDO_COMMAND, undefined)}
        />
      </div>
      <DialogContent
        finalFocus={() => editor.getRootElement()}
        className="rounded-2xl font-sans data-open:animate-none data-closed:animate-none"
      >
        <DialogHeader>
          <DialogTitle>{linkUrl ? 'Edit link' : 'Add link'}</DialogTitle>
          <DialogDescription className="text-xs">
            Link the selected text to a web page or email address.
          </DialogDescription>
        </DialogHeader>
        <form
          className="space-y-4"
          onSubmit={(event) => {
            event.preventDefault()
            event.stopPropagation()
            const url = safeNoteUrl(address)
            if (!url) {
              setLinkError('Enter a valid website or mailto address.')
              return
            }
            applyLink(url)
          }}
        >
          <div className="space-y-2">
            <Label htmlFor={`${id}-link`}>Link address</Label>
            <Input
              id={`${id}-link`}
              value={address}
              placeholder="https://example.com"
              onChange={(event) => {
                setAddress(event.target.value)
                setLinkError(null)
              }}
              aria-invalid={Boolean(linkError)}
            />
            {linkError && (
              <p role="alert" className="text-xs text-destructive">
                {linkError}
              </p>
            )}
          </div>
          <DialogFooter className="flex-row">
            {linkUrl && (
              <Button type="button" variant="ghost" className="mr-auto" onClick={() => applyLink(null)}>
                Remove link
              </Button>
            )}
            <Button type="button" variant="outline" onClick={() => setLinkOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={!address.trim()}>
              Apply
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
