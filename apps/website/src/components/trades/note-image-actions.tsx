import { autoUpdate, flip, offset, shift, useFloating } from '@floating-ui/react-dom'
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext'
import { Maximize2, Trash2 } from 'lucide-react'
import type { NodeKey } from 'lexical'
import { Dialog, DialogContent, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { removeNoteImage } from './note-image-node'

const buttonClass = 'inline-flex size-7 items-center justify-center rounded-md text-neutral-300 hover:bg-white/10 hover:text-white focus-visible:outline-2 focus-visible:outline-white [@media(hover:none)]:size-9'

export function NoteImageActions({ nodeKey, src, anchor, editable }: {
  nodeKey: NodeKey
  src: string
  anchor: HTMLElement
  editable: boolean
}) {
  const { refs: { setFloating }, floatingStyles, isPositioned } = useFloating({
    elements: { reference: anchor },
    placement: 'top-end',
    strategy: 'fixed',
    middleware: [
      offset(({ rects }) => {
        // Leave the top-right resize handle free. Put the toolbar above small images.
        const fits = rects.reference.width >= rects.floating.width + 44 && rects.reference.height >= rects.floating.height + 24
        return fits
          ? { mainAxis: -rects.floating.height - 5, crossAxis: -22 }
          : { mainAxis: -1, crossAxis: Math.max(0, rects.floating.width - rects.reference.width) }
      }),
      flip({ padding: 4 }),
      shift({ padding: 4 }),
    ],
    whileElementsMounted: autoUpdate,
  })
  const [editor] = useLexicalComposerContext()

  return (
    <Dialog>
      <span
        ref={setFloating}
        role="group"
        aria-label="Image actions"
        style={{ ...floatingStyles, visibility: isPositioned ? 'visible' : 'hidden' }}
        className="pointer-events-none z-20 inline-flex items-center gap-0.5 rounded-lg border border-white/15 bg-neutral-900 p-0.5 opacity-0 shadow-md group-hover/image:pointer-events-auto group-hover/image:opacity-100 group-focus-within/image:pointer-events-auto group-focus-within/image:opacity-100"
      >
        <DialogTrigger type="button" aria-label="Expand image" title="Expand image" className={buttonClass}>
          <Maximize2 className="size-4" aria-hidden />
        </DialogTrigger>
        <button
          type="button"
          aria-label="Delete image"
          title="Delete image"
          disabled={!editable}
          className={`${buttonClass} hover:text-red-300 disabled:opacity-40`}
          onClick={() => removeNoteImage(editor, nodeKey)}
        >
          <Trash2 className="size-4" aria-hidden />
        </button>
      </span>
      <DialogContent
        aria-describedby={undefined}
        overlayClassName="bg-black/85"
        className="flex h-[calc(100dvh-2rem)] w-[calc(100vw-2rem)] max-w-none items-center justify-center rounded-none bg-transparent p-8 text-white ring-0 sm:max-w-none [&>[data-slot=dialog-close]]:bg-neutral-800 [&>[data-slot=dialog-close]]:text-white"
      >
        <DialogTitle className="sr-only">Expanded image</DialogTitle>
        <img src={src} alt="Expanded trade note image" draggable={false} className="h-full w-full object-contain" />
      </DialogContent>
    </Dialog>
  )
}
