import { LoaderCircle } from 'lucide-react'
import { useId, useState } from 'react'
import { InstrumentFields } from '@/components/trades/instrument-fields'
import { ChoiceField } from '@/components/trades/trade-bits'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
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
import {
  type ManualFill,
  useAddManualFill,
  useDeleteManualFill,
  useUpdateManualFill,
} from '@/lib/client/trades/trades'
import { type FillForm, fillInput, toLocalInput, tradeErrorMessage } from '@/lib/client/trades/trades-model'

function initialForm(fill?: ManualFill): FillForm {
  if (!fill) {
    return {
      assetClass: 'STOCK',
      symbol: '',
      expiry: '',
      right: 'CALL',
      strike: '',
      side: 'BUY',
      quantity: '',
      price: '',
      fee: '',
      executedAt: toLocalInput(new Date().toISOString()),
      closing: false,
    }
  }
  return {
    assetClass: fill.assetClass === 'option' ? 'OPTION' : fill.assetClass === 'crypto' ? 'CRYPTO' : 'STOCK',
    symbol: fill.symbol,
    expiry: fill.option?.expiry ?? '',
    right: fill.option?.right === 'put' ? 'PUT' : 'CALL',
    strike: fill.option?.strike ?? '',
    side: fill.side === 'sell' ? 'SELL' : 'BUY',
    quantity: fill.quantity,
    price: fill.price,
    fee: fill.fee === '0' ? '' : fill.fee,
    executedAt: toLocalInput(fill.executedAt),
    closing: fill.intent === 'close',
  }
}

/** Adds a fill to a manual workspace, or edits or deletes one. */
export function FillDialog({ workspaceId, fill, onClose }: { workspaceId: string; fill?: ManualFill; onClose: () => void }) {
  const id = useId()
  const [form, setForm] = useState<FillForm>(() => initialForm(fill))
  const [problem, setProblem] = useState<string | null>(null)
  const add = useAddManualFill(workspaceId)
  const update = useUpdateManualFill()
  const remove = useDeleteManualFill()
  const pending = add.isPending || update.isPending || remove.isPending
  const error = add.error ?? update.error ?? remove.error
  const set = (change: Partial<FillForm>) => setForm((current) => ({ ...current, ...change }))

  const submit = () => {
    const result = fillInput(form)
    if (!result.ok) {
      setProblem(result.message)
      return
    }
    setProblem(null)
    const done = { onSuccess: onClose }
    if (fill) update.mutate({ id: fill.id, version: fill.version, input: result.input }, done)
    else add.mutate(result.input, done)
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-[calc(100vw-2rem)] rounded-2xl font-[Arial,Helvetica,sans-serif] sm:max-w-md data-open:animate-none data-closed:animate-none">
        <DialogHeader>
          <DialogTitle className="font-[inherit] text-lg font-semibold">{fill ? 'Edit fill' : 'Add a fill'}</DialogTitle>
          <DialogDescription className="text-xs leading-5">
            Each buy or sell you enter is matched into trades the same way imported fills are.
          </DialogDescription>
        </DialogHeader>
        <form
          className="space-y-4"
          onSubmit={(event) => {
            event.preventDefault()
            submit()
          }}
        >
          <InstrumentFields id={id} value={form} onChange={set} autoFocus={!fill} />
          <div className="grid grid-cols-2 gap-3">
            <ChoiceField
              id={`${id}-side`}
              label="Side"
              value={form.side}
              onChange={(side) => set({ side })}
              className="h-9 w-full bg-background text-sm"
              choices={[
                { value: 'BUY', label: 'Buy' },
                { value: 'SELL', label: 'Sell' },
              ]}
            />
            <div className="flex flex-col gap-1.5">
              <Label htmlFor={`${id}-at`} className="text-xs font-normal text-muted-foreground">
                When
              </Label>
              <Input
                id={`${id}-at`}
                type="datetime-local"
                value={form.executedAt}
                onChange={(event) => set({ executedAt: event.target.value })}
                className="h-9 bg-background"
              />
            </div>
          </div>
          <div className="grid grid-cols-3 gap-3">
            {(
              [
                ['quantity', form.assetClass === 'OPTION' ? 'Contracts' : 'Quantity'],
                ['price', form.assetClass === 'OPTION' ? 'Price per share' : 'Price'],
                ['fee', 'Fees'],
              ] as const
            ).map(([field, label]) => (
              <div key={field} className="flex flex-col gap-1.5">
                <Label htmlFor={`${id}-${field}`} className="text-xs font-normal text-muted-foreground">
                  {label}
                </Label>
                <Input
                  id={`${id}-${field}`}
                  inputMode="decimal"
                  value={form[field]}
                  placeholder={field === 'fee' ? '0' : undefined}
                  onChange={(event) => set({ [field]: event.target.value })}
                  className="h-9 bg-background tabular-nums"
                />
              </div>
            ))}
          </div>
          <div className="flex items-start gap-2.5">
            <Checkbox
              id={`${id}-closing`}
              checked={form.closing}
              onCheckedChange={(checked) => set({ closing: checked === true })}
              className="mt-0.5"
            />
            <Label htmlFor={`${id}-closing`} className="text-xs leading-5 font-normal text-muted-foreground">
              This closes a position opened before what you have entered
            </Label>
          </div>
          {(problem || error) && (
            <p role="alert" className="text-sm text-destructive">
              {problem ?? tradeErrorMessage(error, 'Could not save the fill. Try again.')}
            </p>
          )}
          <DialogFooter className="flex-row items-center gap-2 sm:justify-between">
            {fill ? (
              <Button
                type="button"
                variant="destructive"
                size="sm"
                disabled={pending}
                onClick={() => {
                  if (window.confirm('Delete this fill? Its trade is recalculated.')) remove.mutate(fill.id, { onSuccess: onClose })
                }}
              >
                Delete
              </Button>
            ) : (
              <span />
            )}
            <div className="flex gap-2">
              <Button type="button" variant="ghost" size="sm" onClick={onClose}>
                Cancel
              </Button>
              <Button type="submit" size="sm" disabled={pending}>
                {(add.isPending || update.isPending) && <LoaderCircle className="animate-spin" aria-hidden />}
                {fill ? 'Save' : 'Add fill'}
              </Button>
            </div>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
