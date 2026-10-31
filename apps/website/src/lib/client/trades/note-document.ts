import type { SerializedEditorState } from 'lexical'

export type NoteDocument = SerializedEditorState
export const MAX_NOTE_CHARACTERS = 20_000
export const MAX_NOTE_BYTES = 256_000

/** Canonical empty document; text is also useful for migrations and fixtures. */
export function createNoteDocument(text = ''): NoteDocument {
  const children = text
    .split('\n')
    .flatMap((line, index) => [
      ...(index ? [{ type: 'linebreak', version: 1 }] : []),
      ...(line ? [{ type: 'text', version: 1, text: line, format: 0, detail: 0, mode: 'normal', style: '' }] : []),
    ])
  const paragraph = {
    type: 'paragraph',
    version: 1,
    direction: null,
    format: '',
    indent: 0,
    textFormat: 0,
    textStyle: '',
    children,
  }
  return { root: { type: 'root', version: 1, direction: null, format: '', indent: 0, children: [paragraph] } }
}

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

const NODE_TYPES = new Set([
  'root',
  'paragraph',
  'heading',
  'quote',
  'list',
  'listitem',
  'link',
  'text',
  'tab',
  'linebreak',
])

export function isNoteDocument(value: unknown): value is NoteDocument {
  let count = 0
  const valid = (node: unknown, depth: number): boolean => {
    if (!record(node) || depth > 32 || ++count > 5_000 || node.version !== 1 || !NODE_TYPES.has(String(node.type)))
      return false
    if (node.type === 'text' || node.type === 'tab') return typeof node.text === 'string'
    if (node.type === 'linebreak') return true
    return Array.isArray(node.children) && node.children.every((child) => valid(child, depth + 1))
  }
  return (
    record(value) &&
    record(value.root) &&
    value.root.type === 'root' &&
    Array.isArray(value.root.children) &&
    value.root.children.length > 0 &&
    valid(value.root, 0)
  )
}

/** Readable previews and limits, derived from the single stored document. */
export function noteText(document: NoteDocument): string {
  const text = (node: unknown, depth = 0): string => {
    if (!record(node) || depth > 32) return ''
    if (node.type === 'text' || node.type === 'tab') return typeof node.text === 'string' ? node.text : ''
    if (node.type === 'linebreak') return '\n'
    if (!Array.isArray(node.children)) return ''
    return node.children
      .map((child) => {
        const prefix = node.type === 'listitem' && record(child) && child.type === 'list' ? '\n' : ''
        return prefix + text(child, depth + 1)
      })
      .join(node.type === 'root' ? '\n\n' : node.type === 'list' ? '\n' : '')
  }
  return text(document?.root)
}

/** JSONB reorders object keys; that must not make an unchanged note dirty. */
export function noteKey(document: NoteDocument): string {
  const sorted = (value: unknown): unknown =>
    Array.isArray(value)
      ? value.map(sorted)
      : record(value)
        ? Object.fromEntries(
            Object.keys(value)
              .sort()
              .map((key) => [key, sorted(value[key])]),
          )
        : value
  return JSON.stringify(sorted(document))
}

export function noteDocumentError(document: NoteDocument): string | null {
  if (!isNoteDocument(document)) return 'This note could not be opened. Reload the page before editing it.'
  if (Array.from(noteText(document)).length > MAX_NOTE_CHARACTERS) return 'Notes can contain up to 20,000 characters.'
  if (new TextEncoder().encode(JSON.stringify(document)).length > MAX_NOTE_BYTES) {
    return 'This note has too much formatting. Simplify it before saving.'
  }
  return null
}

export function safeNoteUrl(value: string): string | null {
  const trimmed = value.trim()
  if (
    !trimmed ||
    trimmed.startsWith('/') ||
    Array.from(trimmed).some((character) => character.charCodeAt(0) <= 32 || character.charCodeAt(0) === 127)
  )
    return null
  const address = /^[a-z][a-z\d+.-]*:/i.test(trimmed) ? trimmed : `https://${trimmed}`
  try {
    const url = new URL(address)
    return ['https:', 'http:', 'mailto:'].includes(url.protocol) ? url.href : null
  } catch {
    return null
  }
}
