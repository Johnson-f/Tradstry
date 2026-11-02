import { ArrowLeftRight, LoaderCircle } from 'lucide-react'
import { useId, useState } from 'react'
import { fieldControlClass, fieldLabelClass, fieldSelectClass } from '@/components/trades/form-styles'
import { FormField, InstrumentFields, MoneyInput } from '@/components/trades/instrument-fields'
import { DateTimeField } from '@/components/trades/date-field'
import { ChoiceField } from '@/components/trades/trade-bits'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Dialog,
  DialogClose,
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
import { localToday } from '@/lib/format'

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
    <Dialog open onOpenChange={(open) => !open && !pending && onClose()}>
      <DialogContent
        showCloseButton={!pending}
        className="max-h-[calc(100dvh-2rem)] gap-5 overflow-y-auto p-6 font-[Arial,Helvetica,sans-serif] sm:max-w-lg data-open:animate-none data-closed:animate-none"
      >
        <DialogHeader className="gap-3">
          <div className="flex size-10 items-center justify-center rounded-xl border border-border bg-muted/40">
            <ArrowLeftRight className="size-5 text-muted-foreground" aria-hidden />
          </div>
          <div className="space-y-2">
            <DialogTitle className="font-[Arial,Helvetica,sans-serif] text-lg leading-6 font-semibold">
              {fill ? 'Edit fill' : 'Add a fill'}
            </DialogTitle>
            <DialogDescription className="leading-relaxed">
              Each buy or sell you enter is matched into trades the same way imported fills are.
            </DialogDescription>
          </div>
        </DialogHeader>
        <form
          className="space-y-6"
          onSubmit={(event) => {
            event.preventDefault()
            if (!pending) submit()
          }}
        >
          <fieldset disabled={pending} className="min-w-0 space-y-4">
            <InstrumentFields id={id} value={form} onChange={set} autoFocus={!fill} />
            <div className="grid gap-4 sm:grid-cols-2">
              <ChoiceField
                id={`${id}-side`}
                label="Side"
                value={form.side}
                onChange={(side) => set({ side })}
                className={fieldSelectClass}
                labelClassName={fieldLabelClass}
                choices={[
                  { value: 'BUY', label: 'Buy' },
                  { value: 'SELL', label: 'Sell' },
                ]}
              />
              <FormField id={`${id}-at`} label="When">
                <DateTimeField
                  id={`${id}-at`}
                  value={form.executedAt}
                  max={localToday()}
                  onChange={(executedAt) => set({ executedAt })}
                />
              </FormField>
            </div>
            <div className="grid gap-4 sm:grid-cols-3">
              <FormField id={`${id}-quantity`} label={form.assetClass === 'OPTION' ? 'Contracts' : 'Quantity'}>
                <Input
                  id={`${id}-quantity`}
                  inputMode="decimal"
                  autoComplete="off"
                  placeholder="0"
                  value={form.quantity}
                  onChange={(event) => set({ quantity: event.target.value })}
                  className={`${fieldControlClass} tabular-nums`}
                />
              </FormField>
              <FormField id={`${id}-price`} label={form.assetClass === 'OPTION' ? 'Price per share' : 'Price'}>
                <MoneyInput
                  id={`${id}-price`}
                  autoComplete="off"
                  placeholder="0.00"
                  value={form.price}
                  onChange={(event) => set({ price: event.target.value })}
                />
              </FormField>
              <FormField id={`${id}-fee`} label="Fees">
                <MoneyInput
                  id={`${id}-fee`}
                  autoComplete="off"
                  placeholder="0.00"
                  value={form.fee}
                  onChange={(event) => set({ fee: event.target.value })}
                />
              </FormField>
            </div>
            <div className="flex items-start gap-2.5">
              <Checkbox
                id={`${id}-closing`}
                checked={form.closing}
                onCheckedChange={(checked) => set({ closing: checked === true })}
                className="mt-0.5"
              />
              <Label htmlFor={`${id}-closing`} className="text-[13px] leading-5 font-normal text-muted-foreground">
                This closes a position opened before what you have entered
              </Label>
            </div>
          </fieldset>
          {(problem || error) && (
            <p role="alert" className="text-sm text-destructive">
              {problem ?? tradeErrorMessage(error, 'Could not save the fill. Try again.')}
            </p>
          )}
          <DialogFooter className="-mx-6 -mb-6 px-6 py-4 sm:justify-between">
            {fill ? (
              <Button
                type="button"
                variant="destructive"
                className="h-9 px-4"
                disabled={pending}
                onClick={() => {
                  if (window.confirm('Delete this fill? Its trade is recalculated.')) remove.mutate(fill.id, { onSuccess: onClose })
                }}
              >
                {remove.isPending ? 'Deleting…' : 'Delete'}
              </Button>
            ) : (
              <span className="max-sm:hidden" />
            )}
            <div className="flex flex-col-reverse gap-2 sm:flex-row">
              <DialogClose disabled={pending} render={<Button type="button" variant="outline" className="h-9 px-4" />}>
                Cancel
              </DialogClose>
              <Button type="submit" className="h-9 min-w-36 px-4" disabled={pending} aria-busy={add.isPending || update.isPending}>
                {(add.isPending || update.isPending) && (
                  <LoaderCircle className="size-4 animate-spin motion-reduce:animate-none" aria-hidden />
                )}
                {add.isPending || update.isPending ? 'Saving…' : fill ? 'Save changes' : 'Add fill'}
              </Button>
            </div>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
