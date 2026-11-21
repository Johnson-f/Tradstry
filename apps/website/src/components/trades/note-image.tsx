import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext'
import {
  $applyNodeReplacement, $getNodeByKey, $getSelection, $isRangeSelection, $nodesOfType,
  COMMAND_PRIORITY_HIGH, HISTORIC_TAG, HISTORY_MERGE_TAG, HISTORY_PUSH_TAG,
  PASTE_COMMAND, SKIP_DOM_SELECTION_TAG, $addUpdateTag,
  type NodeKey,
} from 'lexical'
import { useContext, useEffect, useState, type RefObject } from 'react'
import { Button } from '@/components/ui/button'
import { NoteImageNode, NoteImageScope, removeNoteImage, type PastedImage } from './note-image-node'
import { ResizableNoteImage } from './note-image-resize'

const TYPES = new Set(['image/png', 'image/jpeg', 'image/webp'])
const MAX_BYTES = 8 * 1024 * 1024
const uploads = new WeakMap<PastedImage, Promise<string>>()
const historyImages = new WeakMap<object, Blob>()

async function imageRequest(path: string, init: RequestInit = {}) {
  const { authenticatedFetch } = await import('@/lib/client/backend')
  const response = await authenticatedFetch(path, init)
  if (!response.ok) {
    const body = await response.json().catch(() => null)
    throw new Error(body?.message ?? (response.status === 413 ? 'Images must be 8 MB or smaller.' : 'Could not access this image.'))
  }
  return response
}

function imageCollection(workspaceId: string, tradeId: string) {
  return `/workspaces/${encodeURIComponent(workspaceId)}/trades/${encodeURIComponent(tradeId)}/note-images`
}

async function upload(path: string, paste: PastedImage): Promise<string> {
  const response = await imageRequest(`${path}?requestId=${paste.requestId}`, {
    method: 'POST', headers: { 'Content-Type': paste.file.type }, body: paste.file,
  })
  const data = await response.json()
  if (typeof data.imageId !== 'string') throw new Error('Upload did not return an image ID.')
  return data.imageId
}

function uploadOnce(path: string, paste: PastedImage) {
  const existing = uploads.get(paste)
  if (existing) return existing
  const pending = upload(path, paste)
  uploads.set(paste, pending)
  return pending
}

export function NoteImage({ nodeKey, imageId, paste, historyKey, width }: {
  nodeKey: NodeKey
  imageId: string | null
  paste: PastedImage | null
  historyKey: object
  width: number | null
}) {
  const [editor] = useLexicalComposerContext()
  const { workspaceId, tradeId } = useContext(NoteImageScope)
  const path = imageCollection(workspaceId, tradeId)
  const [attempt, setAttempt] = useState(0)
  const [result, setResult] = useState<{ path: string; id: string | null; attempt: number; url: string; error: string } | null>(null)
  const current = result?.path === path && result.id === imageId && result.attempt === attempt ? result : null
  const url = current?.url
  const error = current?.error
  useEffect(() => {
    let active = true
    let objectUrl = ''
    const controller = new AbortController()
    function show(blob: Blob) {
      if (!active) return
      historyImages.set(historyKey, blob)
      objectUrl = URL.createObjectURL(blob)
      setResult({ path, id: imageId, attempt, url: objectUrl, error: '' })
    }
    async function load() {
      if (paste) {
        show(paste.file)
        // Strict Mode and Undo can mount the same paste more than once.
        const id = await uploadOnce(path, paste)
        if (active) editor.update(() => {
          const node = $getNodeByKey(nodeKey)
          if (node instanceof NoteImageNode && node.isAttached()) node.setUploaded(id)
        }, { tag: [HISTORY_MERGE_TAG, SKIP_DOM_SELECTION_TAG] })
      } else if (imageId) {
        const response = await imageRequest(`${path}/${encodeURIComponent(imageId)}`, { signal: controller.signal })
        show(await response.blob())
      } else {
        throw new Error('The original pasted image is unavailable. Paste it again.')
      }
    }
    void load().catch((reason) => {
      if (active) setResult({ path, id: imageId, attempt, url: objectUrl,
        error: reason instanceof Error ? reason.message : 'Could not load the image.' })
    })
    return () => {
      active = false
      controller.abort()
      if (objectUrl) URL.revokeObjectURL(objectUrl)
    }
  }, [path, paste, imageId, editor, nodeKey, historyKey, attempt])

  return (
    <span className="inline-flex max-w-full flex-col gap-1 align-middle">
      {url && <ResizableNoteImage nodeKey={nodeKey} src={url} width={width} />}
      {error ? (
        <span role="alert" className="flex flex-wrap items-center gap-2 text-xs text-destructive">
          {error}
          {(paste || imageId) && <Button type="button" variant="outline" size="sm" onClick={() => {
            if (paste) uploads.delete(paste)
            setAttempt((n) => n + 1)
          }}>Retry</Button>}
          <Button type="button" variant="ghost" size="sm" onClick={() => removeNoteImage(editor, nodeKey)}>Remove</Button>
        </span>
      ) : (paste || !url) && <span role="status" className="text-xs text-muted-foreground">{paste ? 'Uploading image…' : 'Loading image…'}</span>}
    </span>
  )
}

export type ImageFlushRef = RefObject<(() => Promise<boolean>) | null>

function $imageByKey(key: NodeKey) {
  const node = $getNodeByKey(key)
  return node instanceof NoteImageNode ? node : null
}

export function PasteNoteImagePlugin({ flushRef }: { flushRef?: ImageFlushRef }) {
  const [editor] = useLexicalComposerContext()
  const { workspaceId, tradeId } = useContext(NoteImageScope)
  const [message, setMessage] = useState('')
  useEffect(() => editor.registerMutationListener(NoteImageNode, (mutations, { prevEditorState, updateTags }) => {
    const path = imageCollection(workspaceId, tradeId)
    for (const [key, mutation] of mutations) {
      const previous = prevEditorState.read(() => $imageByKey(key))
      const current = editor.getEditorState().read(() => $imageByKey(key))
      if (mutation === 'destroyed' && previous && !current) {
        // The image might have been removed before the first autosave, even during upload.
        // The endpoint only discards unattached uploads; committed files belong to the note save.
        const paste = previous.__paste
        const imageId = previous.__imageId ? Promise.resolve(previous.__imageId) : paste && uploads.get(paste)
        if (imageId) void imageId.then(async (id) => {
          const inUse = editor.read(() => $nodesOfType(NoteImageNode).some((n) => n.__imageId === id || (paste && n.__paste === paste)))
          if (!inUse) await imageRequest(`${path}/${id}/discard`, { method: 'POST' })
        }).catch(() => { /* The pending-upload sweeper handles interrupted requests. */ })
      } else if (current && updateTags.has(HISTORIC_TAG)) {
        const blob = historyImages.get(current.__historyKey) ?? current.__paste?.file
        if (!blob || (previous && previous.__imageId === current.__imageId && previous.__paste === current.__paste)) continue
        editor.update(() => {
          const node = $getNodeByKey(key)
          if (!(node instanceof NoteImageNode) || !node.isAttached()) return
          // Undoing a layout edit keeps the live file. Restoring a removed node
          // uploads its in-memory bytes again instead of reviving a deleted disk ID.
          if (previous?.__imageId) node.setUploaded(previous.__imageId)
          else node.setPaste(previous?.__paste ?? {
            file: new File([blob], 'restored-image', { type: blob.type }), requestId: crypto.randomUUID(),
          })
        }, { tag: [HISTORY_MERGE_TAG, SKIP_DOM_SELECTION_TAG] })
      }
    }
  }, { skipInitialization: true }), [editor, workspaceId, tradeId])
  useEffect(() => {
    if (!flushRef) return
    flushRef.current = async () => {
      const pending = editor.read(() => $nodesOfType(NoteImageNode).flatMap((node) =>
        node.__paste ? [{ key: node.getKey(), paste: node.__paste }] : []))
      try {
        const uploaded = await Promise.all(pending.map(async ({ key, paste }) => ({
          key, id: await uploadOnce(imageCollection(workspaceId, tradeId), paste),
        })))
        editor.update(() => {
          for (const { key, id } of uploaded) {
            const node = $getNodeByKey(key)
            if (node instanceof NoteImageNode && node.__paste && node.isAttached()) node.setUploaded(id)
          }
        }, { tag: [HISTORY_MERGE_TAG, SKIP_DOM_SELECTION_TAG], discrete: true })
        return true
      } catch { return false }
    }
    return () => { flushRef.current = null }
  }, [editor, flushRef, workspaceId, tradeId])
  useEffect(() => editor.registerCommand(PASTE_COMMAND, (event) => {
    if (!editor.isEditable() || !('clipboardData' in event) || !event.clipboardData) return false
    const clipboard = event.clipboardData
    const available = clipboard.files.length ? Array.from(clipboard.files) :
      Array.from(clipboard.items).flatMap((item) => {
        const file = item.kind === 'file' ? item.getAsFile() : null
        return file ? [file] : []
      })
    const files = available.filter((file) => file.type.startsWith('image/'))
    if (!files.length) return false
    const selection = $getSelection()
    if (!$isRangeSelection(selection)) return false
    event.preventDefault()
    const images = files.filter((file) => TYPES.has(file.type) && file.size > 0 && file.size <= MAX_BYTES)
    setMessage(images.length === files.length ? '' : 'Paste a PNG, JPEG or WebP image up to 8 MB.')
    if (images.length) {
      $addUpdateTag(HISTORY_PUSH_TAG)
      selection.insertNodes(images.map((file) =>
        $applyNodeReplacement(new NoteImageNode(null, { file, requestId: crypto.randomUUID() }))))
    }
    return true
  }, COMMAND_PRIORITY_HIGH), [editor])
  return message ? <p role="alert" className="text-xs text-destructive">{message}</p> : null
}
