import { LoaderCircle } from 'lucide-react'
import { useId, useState } from 'react'
import { InstrumentFields } from '@/components/trades/instrument-fields'
import { ChoiceField } from '@/components/trades/trade-bits'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useSetOpeningPosition } from '@/lib/client/trades/trades'
import { type OpeningForm, openingInput, tradeErrorMessage } from '@/lib/client/trades/trades-model'
import { localToday } from '@/lib/format'

/** Records a position held before the imported history begins. */
export function OpeningDialog({
  workspaceId,
  symbol = '',
  onClose,
}: {
  workspaceId: string
  symbol?: string
  onClose: () => void
}) {
  const id = useId()
  const save = useSetOpeningPosition(workspaceId)
  const [problem, setProblem] = useState<string | null>(null)
  const [form, setForm] = useState<OpeningForm>({
    assetClass: 'STOCK',
    symbol,
    expiry: '',
    right: 'CALL',
    strike: '',
    direction: 'LONG',
    quantity: '',
    costPerUnit: '',
    acquiredOn: '',
    asOf: '',
  })
  const set = (change: Partial<OpeningForm>) => setForm((current) => ({ ...current, ...change }))

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-[calc(100vw-2rem)] rounded-2xl font-[Arial,Helvetica,sans-serif] sm:max-w-md data-open:animate-none data-closed:animate-none">
        <DialogHeader>
          <DialogTitle className="font-[inherit] text-lg font-semibold">Add an opening position</DialogTitle>
          <DialogDescription className="text-xs leading-5">
            For a position you already held before your history starts. Fills before the “held as of” date are left out,
            because this position already includes them.
          </DialogDescription>
        </DialogHeader>
        <form
          className="space-y-4"
          onSubmit={(event) => {
            event.preventDefault()
            const result = openingInput(form)
            if (!result.ok) {
              setProblem(result.message)
              return
            }
            setProblem(null)
            save.mutate(result.input, { onSuccess: onClose })
          }}
        >
          <InstrumentFields id={id} value={form} onChange={set} autoFocus={!symbol} />
          <div className="grid grid-cols-3 gap-3">
            <ChoiceField
              id={`${id}-direction`}
              label="Position"
              value={form.direction}
              onChange={(direction) => set({ direction })}
              className="h-9 w-full bg-background text-sm"
              choices={[
                { value: 'LONG', label: 'Long' },
                { value: 'SHORT', label: 'Short' },
              ]}
            />
            <div className="flex flex-col gap-1.5">
              <Label htmlFor={`${id}-quantity`} className="text-xs font-normal text-muted-foreground">
                Quantity
              </Label>
              <Input
                id={`${id}-quantity`}
                inputMode="decimal"
                autoFocus={Boolean(symbol)}
                value={form.quantity}
                onChange={(event) => set({ quantity: event.target.value })}
                className="h-9 bg-background tabular-nums"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor={`${id}-cost`} className="text-xs font-normal text-muted-foreground">
                Average cost
              </Label>
              <Input
                id={`${id}-cost`}
                inputMode="decimal"
                value={form.costPerUnit}
                onChange={(event) => set({ costPerUnit: event.target.value })}
                className="h-9 bg-background tabular-nums"
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor={`${id}-acquired`} className="text-xs font-normal text-muted-foreground">
                Acquired on
              </Label>
              <Input
                id={`${id}-acquired`}
                type="date"
                max={localToday()}
                value={form.acquiredOn}
                onChange={(event) => set({ acquiredOn: event.target.value })}
                className="h-9 bg-background"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor={`${id}-as-of`} className="text-xs font-normal text-muted-foreground">
                Held as of
              </Label>
              <Input
                id={`${id}-as-of`}
                type="date"
                max={localToday()}
                value={form.asOf}
                onChange={(event) => set({ asOf: event.target.value })}
                className="h-9 bg-background"
              />
            </div>
          </div>
          <p className="text-xs leading-5 text-muted-foreground">
            The acquired date sets the holding period for taxes; use your earliest purchase.
          </p>
          {(problem || save.error) && (
            <p role="alert" className="text-sm text-destructive">
              {problem ?? tradeErrorMessage(save.error, 'Could not save the position. Try again.')}
            </p>
          )}
          <DialogFooter className="flex-row justify-end gap-2">
            <Button type="button" variant="ghost" size="sm" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" size="sm" disabled={save.isPending}>
              {save.isPending && <LoaderCircle className="animate-spin" aria-hidden />}
              Save position
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
