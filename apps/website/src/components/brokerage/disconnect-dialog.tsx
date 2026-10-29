import { LoaderCircle, Unplug } from 'lucide-react'
import { BrokerageError } from '@/components/brokerage/feedback'
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'

export function DisconnectDialog({
  open,
  onOpenChange,
  name,
  description,
  pending,
  error,
  onConfirm,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  name: string
  description: string
  pending: boolean
  error: string | null
  onConfirm: () => void
}) {
  return (
    <AlertDialog
      open={open}
      onOpenChange={(next) => {
        if (!pending) onOpenChange(next)
      }}
    >
      <AlertDialogContent className="w-[calc(100vw-2rem)] max-h-[calc(100dvh-2rem)] overflow-y-auto font-[Arial,Helvetica,sans-serif] data-open:animate-none data-closed:animate-none">
        <AlertDialogHeader className="gap-3">
          <div className="flex size-10 items-center justify-center rounded-xl bg-muted">
            <Unplug className="size-5" aria-hidden />
          </div>
          <AlertDialogTitle className="font-[inherit] text-lg">Disconnect {name}?</AlertDialogTitle>
          <AlertDialogDescription className="leading-relaxed">
            {description} Your workspaces and imported history stay in Tradstry.
          </AlertDialogDescription>
        </AlertDialogHeader>
        {error && <BrokerageError message={error} />}
        <AlertDialogFooter>
          <AlertDialogCancel disabled={pending} className="h-9 px-4">
            Cancel
          </AlertDialogCancel>
          <Button variant="destructive" className="h-9 px-4" disabled={pending} onClick={onConfirm}>
            {pending && <LoaderCircle className="animate-spin motion-reduce:animate-none" aria-hidden />}
            {pending ? 'Disconnecting…' : 'Disconnect'}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
