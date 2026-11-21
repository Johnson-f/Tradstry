import { $applyNodeReplacement, $getNodeByKey, $getState, $setState, createState, DecoratorNode, HISTORY_PUSH_TAG, type LexicalEditor, type NodeKey, type SerializedLexicalNode } from 'lexical'
import { createContext, type ReactElement } from 'react'
import { NoteImage } from './note-image'

export const NoteImageScope = createContext({ workspaceId: '', tradeId: '' })

const displayWidth = createState('displayWidth', {
  parse: (value) => typeof value === 'number' && Number.isSafeInteger(value) && value > 0 ? value : null,
})

export interface PastedImage {
  file: File
  requestId: string
}

export function removeNoteImage(editor: LexicalEditor, key: NodeKey) {
  if (!editor.isEditable()) return
  editor.update(() => {
    const node = $getNodeByKey(key)
    if (node instanceof NoteImageNode && node.isAttached()) {
      node.selectPrevious()
      node.remove()
    }
  }, { tag: HISTORY_PUSH_TAG, discrete: true })
  editor.focus()
}

export class NoteImageNode extends DecoratorNode<ReactElement> {
  __imageId: string | null
  __paste: PastedImage | null
  // Clones in Lexical's Undo history share this key; it is never serialized.
  __historyKey: object

  static getType() { return 'note-image' }
  static clone(node: NoteImageNode) { return new NoteImageNode(node.__imageId, node.__paste, node.__key, node.__historyKey) }
  static importJSON(json: SerializedLexicalNode & { imageId: string | null }) {
    return $applyNodeReplacement(new NoteImageNode(json.imageId)).updateFromJSON(json)
  }
  constructor(imageId: string | null = null, paste: PastedImage | null = null, key?: NodeKey, historyKey: object = {}) {
    super(key)
    this.__imageId = imageId
    this.__paste = paste
    this.__historyKey = historyKey
  }
  exportJSON() { return { ...super.exportJSON(), type: 'note-image', version: 1, imageId: this.__imageId } }
  getTextContent() { return '[Image]' }
  createDOM() {
    const host = document.createElement('span')
    host.className = 'inline-block max-w-full align-middle'
    return host
  }
  updateDOM() { return false }
  setUploaded(id: string) {
    const node = this.getWritable()
    node.__imageId = id
    node.__paste = null
  }
  setPaste(paste: PastedImage) {
    const node = this.getWritable()
    node.__imageId = null
    node.__paste = paste
  }
  setDisplayWidth(width: number) { $setState(this, displayWidth, width) }
  decorate() {
    return <NoteImage nodeKey={this.__key} imageId={this.__imageId} paste={this.__paste} historyKey={this.__historyKey} width={$getState(this, displayWidth)} />
  }
}
