import { Layers2, Tag } from 'lucide-react'
import { useRef } from 'react'
import { JournalLabelsSettings } from '@/components/trades/labels-settings'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'

export function ManageLabelsDialog({ triggerStyle = 'button' }: { triggerStyle?: 'button' | 'link' }) {
  const heading = useRef<HTMLHeadingElement>(null)

  return (
    <Dialog>
      <DialogTrigger
        title="Manage Labels"
        render={
          triggerStyle === 'link' ? (
            <button
              type="button"
              className="cursor-pointer rounded-sm text-foreground underline underline-offset-4 outline-offset-4 focus-visible:outline-2 focus-visible:outline-ring"
            />
          ) : (
            <Button variant="outline" size="sm" className="h-8 gap-1.5 px-3 max-sm:w-8 max-sm:px-0" />
          )
        }
      >
        {triggerStyle === 'link' ? (
          'Manage labels'
        ) : (
          <>
            <Tag className="size-3.5" strokeWidth={1.5} aria-hidden />
            <span className="max-sm:sr-only">Manage Labels</span>
          </>
        )}
      </DialogTrigger>
      <DialogContent
        initialFocus={heading}
        className="flex h-[min(38rem,calc(100dvh-2rem))] max-w-[calc(100vw-2rem)] flex-col gap-0 overflow-hidden rounded-2xl p-0 font-sans sm:max-w-2xl data-open:animate-none data-closed:animate-none"
      >
        <DialogHeader className="shrink-0 gap-1.5 px-5 pt-6 pb-4 pr-11 sm:px-6 sm:pr-12">
          <DialogTitle
            ref={heading}
            tabIndex={-1}
            className="font-[inherit] text-xl leading-7 font-semibold tracking-tight outline-none"
          >
            Manage Labels
          </DialogTitle>
          <DialogDescription className="text-[13px] leading-5">
            Organize your edges, entry tactics, tags, and mistakes.
          </DialogDescription>
        </DialogHeader>
        <JournalLabelsSettings layout="tabs" />
        <DialogFooter className="m-0 shrink-0 flex-row items-center justify-between gap-3 rounded-b-2xl bg-muted/20 px-5 py-3 sm:justify-between sm:px-6">
          <p className="flex items-center gap-2 text-xs text-muted-foreground">
            <Layers2 className="size-3.5 shrink-0" aria-hidden />
            Shared across workspaces
          </p>
          <DialogClose render={<Button variant="outline" className="h-8 px-4" />}>Done</DialogClose>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
