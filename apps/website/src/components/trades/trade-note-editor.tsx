import { $isLinkNode, LinkNode } from '@lexical/link'
import { HEADING, LINK, ORDERED_LIST, QUOTE, TEXT_FORMAT_TRANSFORMERS, UNORDERED_LIST } from '@lexical/markdown'
import { LexicalComposer, type InitialConfigType } from '@lexical/react/LexicalComposer'
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext'
import { ContentEditable } from '@lexical/react/LexicalContentEditable'
import { LexicalErrorBoundary } from '@lexical/react/LexicalErrorBoundary'
import { HistoryPlugin } from '@lexical/react/LexicalHistoryPlugin'
import { LinkPlugin } from '@lexical/react/LexicalLinkPlugin'
import { ListPlugin } from '@lexical/react/LexicalListPlugin'
import { MarkdownShortcutPlugin } from '@lexical/react/LexicalMarkdownShortcutPlugin'
import { OnChangePlugin } from '@lexical/react/LexicalOnChangePlugin'
import { RichTextPlugin } from '@lexical/react/LexicalRichTextPlugin'
import { TablePlugin } from '@lexical/react/LexicalTablePlugin'
import { useLexicalSubscription } from '@lexical/react/useLexicalSubscription'
import { $unwrapNode, mergeRegister } from '@lexical/utils'
import { $getRoot, $getState, $setState, createState, SKIP_DOM_SELECTION_TAG, TextNode, type LexicalEditor } from 'lexical'
import { useEffect, useRef, useState } from 'react'
import { NOTE_NODES, NOTE_THEME } from '@/components/trades/note-editor-config'
import { NoteEditorToolbar } from '@/components/trades/note-editor-toolbar'
import { NoteInsertMenu } from '@/components/trades/note-insert-menu'
import { NoteImageScope } from '@/components/trades/note-image-node'
import { PasteNoteImagePlugin, type ImageFlushRef } from '@/components/trades/note-image'
import { registerFillMentions } from '@/components/trades/note-fill-mention'
import type { TradeFill } from '@/lib/client/trades/trades'
import { NoteTableActions } from '@/components/trades/note-table-actions'
import { NoteTableEdges } from '@/components/trades/note-table-edges'
import {
  isNoteDocument,
  MAX_NOTE_CHARACTERS,
  noteKey,
  noteText,
  safeNoteUrl,
  type NoteDocument,
} from '@/lib/client/trades/note-document'

const SHORTCUTS = [HEADING, QUOTE, UNORDERED_LIST, ORDERED_LIST, ...TEXT_FORMAT_TRANSFORMERS, LINK]

const titleState = createState('title', { parse: (value) => typeof value === 'string' ? value : '' })
const $readTitle = () => $getState($getRoot(), titleState)

function titleSubscription(editor: LexicalEditor) {
  return {
    initialValueFn: () => editor.getEditorState().read($readTitle),
    subscribe: (update: (title: string) => void) => editor.registerUpdateListener(({ editorState }) => {
      update(editorState.read($readTitle))
    }),
  }
}

function NoteTitle({ disabled }: { disabled: boolean }) {
  const [editor] = useLexicalComposerContext()
  const title = useLexicalSubscription(titleSubscription)
  const setTitle = (value: string) => editor.update(() => {
    $setState($getRoot(), titleState, value)
  }, { discrete: true, tag: SKIP_DOM_SELECTION_TAG })

  return (
    <h3 aria-label={title || 'Trade Notes'}>
      <input
        aria-label="Trade note title"
        title="Edit note title"
        placeholder="Trade Notes"
        value={title}
        disabled={disabled}
        className="block w-full min-w-0 rounded-sm bg-transparent text-2xl font-semibold tracking-tight text-foreground outline-none placeholder:text-foreground hover:bg-muted/40 focus-visible:ring-2 focus-visible:ring-ring/50"
        onChange={(event) => setTitle(event.target.value)}
        onBlur={(event) => {
          const trimmed = event.target.value.trim()
          if (trimmed !== event.target.value) setTitle(trimmed)
        }}
        onKeyDown={(event) => {
          if (event.key === 'Enter' && !event.nativeEvent.isComposing) {
            event.preventDefault()
            editor.focus(undefined, { defaultSelection: 'rootStart' })
          }
        }}
      />
    </h3>
  )
}

function EditingPlugin({ disabled }: { disabled: boolean }) {
  const [editor] = useLexicalComposerContext()
  useEffect(() => {
    editor.setEditable(!disabled)
  }, [editor, disabled])
  useEffect(
    () =>
      mergeRegister(
        registerFillMentions(editor),
        editor.registerNodeTransform(TextNode, (node) => {
          // Keep semantic formatting from pasted content, not arbitrary inline CSS.
          if (node.getStyle()) node.setStyle('')
        }),
        editor.registerNodeTransform(LinkNode, (node) => {
          if (!$isLinkNode(node)) return
          const url = safeNoteUrl(node.getURL())
          if (!url) {
            $unwrapNode(node)
            return
          }
          if (node.getURL() !== url) node.setURL(url)
          if (node.getTarget() !== '_blank') node.setTarget('_blank')
          if (node.getRel() !== 'noopener noreferrer') node.setRel('noopener noreferrer')
        }),
      ),
    [editor],
  )
  return null
}

export function TradeNoteEditor({
  workspaceId,
  imageFlushRef,
  tradeId,
  fills,
  initialValue,
  disabled,
  onChange,
  onError,
}: {
  workspaceId: string
  imageFlushRef?: ImageFlushRef
  tradeId: string
  fills: TradeFill[]
  initialValue: NoteDocument
  disabled: boolean
  onChange: (document: NoteDocument) => void
  onError: (message: string) => void
}) {
  const callbacks = useRef({ onChange, onError })
  useEffect(() => {
    callbacks.current = { onChange, onError }
  }, [onChange, onError])
  const failed = useRef(false)
  const [failure, setFailure] = useState(false)
  const [characters, setCharacters] = useState(() => Array.from(noteText(initialValue)).length)
  const last = useRef(noteKey(initialValue))
  const [config] = useState<InitialConfigType>(() => ({
    namespace: 'tradstry-trade-note',
    nodes: NOTE_NODES,
    theme: NOTE_THEME,
    editable: !disabled,
    editorState: JSON.stringify(initialValue),
    onError: (_error, editor) => {
      failed.current = true
      editor.setEditable(false)
      queueMicrotask(() => {
        setFailure(true)
        callbacks.current.onError('The note editor could not load safely. Reload the page before saving.')
      })
    },
  }))

  if (failure || !isNoteDocument(initialValue)) {
    return (
      <p role="alert" className="py-8 text-sm text-destructive">
        Unable to open this note. Reload the page to try again.
      </p>
    )
  }

  return (
    <NoteImageScope.Provider value={{ workspaceId, tradeId }}>
      <LexicalComposer initialConfig={config}>
        <NoteTitle disabled={disabled} />
        <div className="mt-4">
          <NoteEditorToolbar disabled={disabled} />
          <div className="relative">
            <RichTextPlugin
              contentEditable={
                <ContentEditable
                  aria-label="Trade notes"
                  aria-multiline="true"
                  spellCheck
                  className="min-h-64 break-words py-4 text-[15px] leading-7 outline-none [&_li::marker]:text-muted-foreground [&_[data-fill-mention]]:cursor-pointer [&_[data-fill-mention]]:box-decoration-clone [&_[data-fill-mention]]:rounded-md [&_[data-fill-mention]]:bg-accent [&_[data-fill-mention]]:px-1 [&_[data-fill-mention]]:font-medium [&_[data-fill-mention]:hover]:underline [&_[data-fill-mention]:focus-visible]:outline-2"
                  onClick={(event) => {
                    if (event.target instanceof Element && event.target.closest('a')) event.preventDefault()
                  }}
                />
              }
              placeholder={
                <div className="pointer-events-none absolute top-4 left-0 text-[15px] leading-7 text-muted-foreground/70">
                  Write about this trade… Type @ for fills or / for blocks.
                </div>
              }
              ErrorBoundary={LexicalErrorBoundary}
            />
            <NoteTableActions disabled={disabled} />
            <NoteTableEdges disabled={disabled} />
          </div>
          {characters > MAX_NOTE_CHARACTERS * 0.9 && (
            <p
              className={`mt-2 text-right text-xs tabular-nums ${characters > MAX_NOTE_CHARACTERS ? 'text-destructive' : 'text-muted-foreground'}`}
            >
              {characters.toLocaleString()} / {MAX_NOTE_CHARACTERS.toLocaleString()}
            </p>
          )}
        </div>
        <HistoryPlugin />
        <ListPlugin />
        <TablePlugin hasCellMerge={false} hasCellBackgroundColor={false} hasHorizontalScroll />
        <NoteInsertMenu tradeId={tradeId} fills={fills} />
        <PasteNoteImagePlugin flushRef={imageFlushRef} />
        <LinkPlugin
          validateUrl={(url) => safeNoteUrl(url) !== null}
          attributes={{ target: '_blank', rel: 'noopener noreferrer' }}
        />
        <MarkdownShortcutPlugin transformers={SHORTCUTS} />
        <EditingPlugin disabled={disabled} />
        <OnChangePlugin
          ignoreSelectionChange
          ignoreHistoryMergeTagChange={false}
          onChange={(state) => {
            if (failed.current) return
            const document = state.toJSON()
            const key = noteKey(document)
            if (key === last.current) return
            last.current = key
            setCharacters(Array.from(noteText(document)).length)
            callbacks.current.onChange(document)
          }}
        />
      </LexicalComposer>
    </NoteImageScope.Provider>
  )
}
