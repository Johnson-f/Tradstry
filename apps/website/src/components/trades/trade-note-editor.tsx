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
import { $unwrapNode, mergeRegister } from '@lexical/utils'
import { TextNode } from 'lexical'
import { useEffect, useRef, useState } from 'react'
import { NOTE_NODES, NOTE_THEME } from '@/components/trades/note-editor-config'
import { NoteEditorToolbar } from '@/components/trades/note-editor-toolbar'
import {
  isNoteDocument,
  MAX_NOTE_CHARACTERS,
  noteKey,
  noteText,
  safeNoteUrl,
  type NoteDocument,
} from '@/lib/client/trades/note-document'

const SHORTCUTS = [HEADING, QUOTE, UNORDERED_LIST, ORDERED_LIST, ...TEXT_FORMAT_TRANSFORMERS, LINK]

function EditingPlugin({ disabled }: { disabled: boolean }) {
  const [editor] = useLexicalComposerContext()
  useEffect(() => {
    editor.setEditable(!disabled)
  }, [editor, disabled])
  useEffect(
    () =>
      mergeRegister(
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
  initialValue,
  disabled,
  onChange,
  onError,
}: {
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
    <LexicalComposer initialConfig={config}>
      <div className="mt-4">
        <NoteEditorToolbar disabled={disabled} />
        <div className="relative">
          <RichTextPlugin
            contentEditable={
              <ContentEditable
                aria-label="Trade notes"
                aria-multiline="true"
                spellCheck
                className="min-h-64 break-words py-4 text-[15px] leading-7 outline-none [&_li::marker]:text-muted-foreground"
                onClick={(event) => {
                  if (event.target instanceof Element && event.target.closest('a')) event.preventDefault()
                }}
              />
            }
            placeholder={
              <div className="pointer-events-none absolute top-4 left-0 text-[15px] leading-7 text-muted-foreground/70">
                Write about this trade…
              </div>
            }
            ErrorBoundary={LexicalErrorBoundary}
          />
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
  )
}
