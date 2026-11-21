import { expect, test } from 'bun:test'
import { createHeadlessEditor } from '@lexical/headless'
import { createEmptyHistoryState, registerHistory } from '@lexical/history'
import { registerRichText } from '@lexical/rich-text'
import { $getRoot, $isTextNode, FORMAT_TEXT_COMMAND, HISTORY_PUSH_TAG, REDO_COMMAND, UNDO_COMMAND } from 'lexical'
import { NOTE_NODES } from '@/components/trades/note-editor-config'
import { NoteImageNode } from '@/components/trades/note-image-node'
import {
  createNoteDocument,
  isNoteDocument,
  MAX_NOTE_CHARACTERS,
  noteDocumentError,
  noteKey,
  noteText,
  safeNoteUrl,
} from './note-document'

function editor() {
  return createHeadlessEditor({
    nodes: NOTE_NODES,
    onError(error) {
      throw error
    },
  })
}

test('converted text preserves blank lines, tabs and Unicode in Lexical', () => {
  for (const text of ['', 'plain note', 'first\n\nlast\n', 'risk\t$50 🚀']) {
    const document = createNoteDocument(text)
    const restored = editor().parseEditorState(JSON.stringify(document)).toJSON()
    expect(noteKey(restored)).toBe(noteKey(document))
    expect(noteText(restored)).toBe(text)
    expect(noteDocumentError(restored)).toBeNull()
  }
})

test('the shared API fixture retains the title, fill references, tables, headings, lists, links and inline formatting', async () => {
  const document = await Bun.file(
    new URL('../../../../../../backend/tests/fixtures/rich_trade_note.json', import.meta.url),
  ).json()
  const restored = editor().parseEditorState(JSON.stringify(document)).toJSON()
  expect(noteKey(restored)).toBe(noteKey(document))
  expect(noteText(restored)).toBe(
    'Breakout review\n\nTrade plan\n\nWaited for the retest\nrisk\treduced Chart\n\nFollow the plan. @Fill #1 · Open · 5 at $100.00 · Nov 3, 12:04 PM\n\nEntry\nExit\n\nReview\n\nSetup\tResult',
  )
  expect(noteDocumentError(restored)).toBeNull()
})

test('image-only notes keep the disk ID through Lexical reload and pending pastes block autosave', () => {
  const document = createNoteDocument()
  const image = { type: 'note-image', version: 1, imageId: null as string | null }
  Object.assign(document.root.children[0], { children: [image] })
  expect(noteDocumentError(document)).toContain('uploading')
  image.imageId = crypto.randomUUID()
  expect(noteDocumentError(document)).toBeNull()
  expect(noteText(document)).toBe('[Image]')
  expect(noteKey(editor().parseEditorState(JSON.stringify(document)).toJSON())).toBe(noteKey(document))

  const instance = editor()
  instance.setEditorState(instance.parseEditorState(JSON.stringify(document)))
  instance.update(() => {
    const node = $getRoot().getFirstDescendant()
    if (!(node instanceof NoteImageNode)) throw new Error('Expected the saved image')
    node.setDisplayWidth(320)
  }, { discrete: true })
  const resized = instance.getEditorState().toJSON()
  expect(resized.root.children[0]).toMatchObject({ children: [{ imageId: image.imageId, $: { displayWidth: 320 } }] })
  expect(noteKey(editor().parseEditorState(JSON.stringify(resized)).toJSON())).toBe(noteKey(resized))
})

test('formatting-only changes are dirty and undo/redo restores them', async () => {
  const instance = editor()
  const initial = createNoteDocument('Retest')
  instance.setEditorState(instance.parseEditorState(JSON.stringify(initial)))
  await Promise.resolve()
  const stopRichText = registerRichText(instance)
  const stopHistory = registerHistory(instance, createEmptyHistoryState(), 0)
  instance.update(
    () => {
      const text = $getRoot().getFirstDescendant()
      if (!$isTextNode(text)) throw new Error('Expected note text')
      text.select(0, text.getTextContentSize())
    },
    { discrete: true },
  )
  instance.update(
    () => {
      instance.dispatchCommand(FORMAT_TEXT_COMMAND, 'bold')
    },
    { discrete: true, tag: HISTORY_PUSH_TAG },
  )
  const formatted = instance.getEditorState().toJSON()
  expect(noteText(formatted)).toBe('Retest')
  expect(noteKey(formatted)).not.toBe(noteKey(initial))
  instance.dispatchCommand(UNDO_COMMAND, undefined)
  await Promise.resolve()
  expect(noteKey(instance.getEditorState().toJSON())).toBe(noteKey(initial))
  instance.dispatchCommand(REDO_COMMAND, undefined)
  await Promise.resolve()
  expect(noteKey(instance.getEditorState().toJSON())).toBe(noteKey(formatted))
  stopHistory()
  stopRichText()
})

test('database key ordering does not make saved notes dirty', () => {
  const document = createNoteDocument('same')
  const reordered = { root: { ...document.root, children: document.root.children, type: document.root.type } }
  const reverse = (value: unknown): unknown =>
    Array.isArray(value)
      ? value.map(reverse)
      : value && typeof value === 'object'
        ? Object.fromEntries(
            Object.entries(value)
              .reverse()
              .map(([key, item]) => [key, reverse(item)]),
          )
        : value
  expect(noteKey(JSON.parse(JSON.stringify(reverse(reordered))))).toBe(noteKey(document))
})

test('invalid formats and oversized text are not silently saved', () => {
  expect(isNoteDocument('old plain text')).toBe(false)
  expect(isNoteDocument({ root: { type: 'root', version: 1, children: [] } })).toBe(false)
  const unsupported = createNoteDocument()
  unsupported.root.children = [{ type: 'image', version: 1 }]
  expect(isNoteDocument(unsupported)).toBe(false)
  expect(noteDocumentError(createNoteDocument('😀'.repeat(MAX_NOTE_CHARACTERS)))).toBeNull()
  expect(noteDocumentError(createNoteDocument('x'.repeat(MAX_NOTE_CHARACTERS + 1)))).toContain('20,000')
})

test('links accept normal addresses and reject executable URLs', () => {
  expect(safeNoteUrl('example.com/chart')).toBe('https://example.com/chart')
  expect(safeNoteUrl('https://example.com/chart')).toBe('https://example.com/chart')
  expect(safeNoteUrl('mailto:trader@example.com')).toBe('mailto:trader@example.com')
  for (const value of [
    'javascript:alert(1)',
    'JaVaScRiPt:alert(1)',
    'data:text/html,x',
    'file:///tmp/test',
    '/relative-page',
    'https://example.com\nfoo',
    '',
  ]) {
    expect(safeNoteUrl(value)).toBeNull()
  }
})
