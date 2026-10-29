import { Landmark } from 'lucide-react'
import { useState } from 'react'
import { AccountPicker } from '@/components/brokerage/account-picker'
import { BrokerageError } from '@/components/brokerage/feedback'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Separator } from '@/components/ui/separator'
import { Skeleton } from '@/components/ui/skeleton'
import type { AccountChoice } from '@/lib/client/brokerage/brokerage-model'

export function AccountSelectionDialog({
  open,
  onOpenChange,
  choices,
  loading,
  error,
  onRetry,
  retrying,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  choices?: AccountChoice[]
  loading?: boolean
  error?: string | null
  onRetry?: () => void
  retrying?: boolean
}) {
  const [importing, setImporting] = useState(false)
  const close = () => {
    if (!importing) onOpenChange(false)
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!importing) onOpenChange(next)
      }}
    >
      <DialogContent
        showCloseButton={!importing}
        aria-busy={loading || importing}
        className="flex h-[min(42rem,calc(100dvh-2rem))] max-w-[calc(100vw-2rem)] flex-col gap-0 overflow-hidden rounded-2xl p-0 font-[Arial,Helvetica,sans-serif] sm:max-w-2xl data-open:animate-none data-closed:animate-none"
      >
        <DialogHeader className="shrink-0 px-5 py-5 pr-10 sm:px-6 sm:pr-12">
          <div className="flex items-start gap-3">
            <div className="flex size-10 shrink-0 items-center justify-center rounded-xl border bg-muted/30">
              <Landmark className="size-5 text-muted-foreground" aria-hidden />
            </div>
            <div className="space-y-2">
              <DialogTitle className="font-[inherit] text-lg leading-6 font-semibold">
                Choose your accounts
              </DialogTitle>
              <DialogDescription className="leading-6">
                Select the accounts you want to track and how far back to import.
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>
        <Separator />
        {choices !== undefined ? (
          <AccountPicker choices={choices} onPendingChange={setImporting} onCancel={close} />
        ) : (
          <>
            <div className="min-h-0 flex-1 overflow-y-auto p-5 sm:p-6">
              {error ? (
                <BrokerageError message={error} retry={onRetry} pending={retrying} />
              ) : (
                <div role="status" className="space-y-3">
                  <span className="sr-only">Loading your accounts…</span>
                  {[0, 1, 2, 3].map((row) => (
                    <Skeleton key={row} className="h-24 rounded-xl" />
                  ))}
                </div>
              )}
            </div>
            <DialogFooter className="m-0 shrink-0 rounded-b-2xl px-5 py-4 sm:px-6">
              <Button variant="outline" className="h-9 px-4" onClick={close}>
                Close
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}
