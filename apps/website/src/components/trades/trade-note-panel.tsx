import { NotebookPen, X } from 'lucide-react'
import { useEffect, useRef } from 'react'
import { AnnotationEditor } from '@/components/trades/annotation-editor'
import { DirectionBadge } from '@/components/trades/trade-bits'
import { Button } from '@/components/ui/button'
import type { SuggestedStop } from '@/lib/client/trades/trades'
import { type TradeAnnotation, type TradeSummary, instrumentLabel } from '@/lib/client/trades/trades-model'
import { formatDateTime } from '@/lib/format'

export function TradeNotePanel({
  id,
  workspaceId,
  trade,
  suggestedStop,
  onClose,
  onFlushChange,
  reloadAnnotation,
}: {
  id: string
  workspaceId: string
  trade: TradeSummary
  suggestedStop: SuggestedStop | null
  onClose: () => void
  onFlushChange: (flush: (() => Promise<boolean>) | null) => void
  reloadAnnotation: () => Promise<TradeAnnotation | null>
}) {
  const heading = useRef<HTMLHeadingElement>(null)

  useEffect(() => {
    heading.current?.focus()
  }, [])

  return (
    <aside
      id={id}
      aria-labelledby={`${id}-heading`}
      className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden rounded-2xl bg-white dark:bg-neutral-900"
      onKeyDown={(event) => {
        if (
          event.key === 'Escape' &&
          !event.defaultPrevented &&
          !event.nativeEvent.isComposing &&
          event.target instanceof Node &&
          event.currentTarget.contains(event.target)
        ) {
          event.stopPropagation()
          onClose()
        }
      }}
    >
      <header className="flex h-11 shrink-0 items-center justify-between gap-3 border-b border-border/50 px-6">
        <h2
          ref={heading}
          id={`${id}-heading`}
          tabIndex={-1}
          className="flex items-center gap-2 text-[13px] font-medium outline-none"
        >
          <NotebookPen className="size-3.5 text-muted-foreground" aria-hidden />
          Trade note
        </h2>
        <Button variant="ghost" size="icon-sm" aria-label="Close trade note" onClick={onClose}>
          <X aria-hidden />
        </Button>
      </header>
      <AnnotationEditor
        key={trade.id}
        workspaceId={workspaceId}
        trade={trade}
        suggestedStop={suggestedStop}
        onFlushChange={onFlushChange}
        reloadAnnotation={reloadAnnotation}
        context={
          <div className="flex flex-wrap items-center gap-x-2 gap-y-2 text-xs text-muted-foreground">
            <span className="break-words text-[13px] font-medium text-foreground">{instrumentLabel(trade)}</span>
            <DirectionBadge direction={trade.direction} />
            <span className="basis-full @sm/note-editor:basis-auto">Opened {formatDateTime(trade.openedAt)}</span>
          </div>
        }
      />
    </aside>
  )
}
