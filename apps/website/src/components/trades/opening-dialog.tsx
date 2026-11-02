import { History, LoaderCircle } from 'lucide-react'
import { useId, useState } from 'react'
import { fieldControlClass, fieldLabelClass, fieldSelectClass } from '@/components/trades/form-styles'
import { FormField, InstrumentFields, MoneyInput } from '@/components/trades/instrument-fields'
import { DateField } from '@/components/trades/date-field'
import { ChoiceField } from '@/components/trades/trade-bits'
import { Button } from '@/components/ui/button'
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
  const set = (change: Partial<OpeningForm>) => {
    setForm((current) => ({ ...current, ...change }))
    if (problem) setProblem(null)
    if (save.isError) save.reset()
  }
  const error = problem ?? (save.error ? tradeErrorMessage(save.error, 'Could not save the position. Try again.') : null)

  return (
    <Dialog open onOpenChange={(open) => !open && !save.isPending && onClose()}>
      <DialogContent
        showCloseButton={!save.isPending}
        className="max-h-[calc(100dvh-2rem)] gap-5 overflow-y-auto p-6 font-[Arial,Helvetica,sans-serif] sm:max-w-lg data-open:animate-none data-closed:animate-none"
      >
        <DialogHeader className="gap-3">
          <div className="flex size-10 items-center justify-center rounded-xl border border-border bg-muted/40">
            <History className="size-5 text-muted-foreground" aria-hidden />
          </div>
          <div className="space-y-2">
            <DialogTitle className="font-[Arial,Helvetica,sans-serif] text-lg leading-6 font-semibold">
              Add an opening position
            </DialogTitle>
            <DialogDescription className="leading-relaxed">
              Record a position you already held before your trade history starts, so its later sells match against
              it.
            </DialogDescription>
          </div>
        </DialogHeader>

        <form
          className="space-y-6"
          aria-describedby={error ? `${id}-error` : undefined}
          onSubmit={(event) => {
            event.preventDefault()
            if (save.isPending) return
            const result = openingInput(form)
            if (!result.ok) {
              setProblem(result.message)
              return
            }
            save.mutate(result.input, { onSuccess: onClose })
          }}
        >
          <fieldset disabled={save.isPending} className="min-w-0 space-y-4">
            <InstrumentFields id={id} value={form} onChange={set} autoFocus={!symbol} />
            <div className="grid gap-4 sm:grid-cols-3">
              <ChoiceField
                id={`${id}-direction`}
                label="Position"
                value={form.direction}
                onChange={(direction) => set({ direction })}
                className={fieldSelectClass}
                labelClassName={fieldLabelClass}
                choices={[
                  { value: 'LONG', label: 'Long' },
                  { value: 'SHORT', label: 'Short' },
                ]}
              />
              <FormField id={`${id}-quantity`} label={form.assetClass === 'OPTION' ? 'Contracts' : 'Quantity'}>
                <Input
                  id={`${id}-quantity`}
                  inputMode="decimal"
                  autoFocus={Boolean(symbol)}
                  autoComplete="off"
                  placeholder="0"
                  value={form.quantity}
                  onChange={(event) => set({ quantity: event.target.value })}
                  className={`${fieldControlClass} tabular-nums`}
                />
              </FormField>
              <FormField id={`${id}-cost`} label="Average cost">
                <MoneyInput
                  id={`${id}-cost`}
                  autoComplete="off"
                  placeholder="0.00"
                  value={form.costPerUnit}
                  onChange={(event) => set({ costPerUnit: event.target.value })}
                />
              </FormField>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <FormField
                id={`${id}-acquired`}
                label="Acquired on"
                hint="Your earliest purchase. It starts the holding period for taxes."
              >
                <DateField
                  id={`${id}-acquired`}
                  value={form.acquiredOn}
                  max={localToday()}
                  describedBy={`${id}-acquired-hint`}
                  onChange={(acquiredOn) => set({ acquiredOn })}
                />
              </FormField>
              <FormField
                id={`${id}-as-of`}
                label="Held as of"
                hint="Fills before this date are left out; this position already includes them."
              >
                <DateField
                  id={`${id}-as-of`}
                  value={form.asOf}
                  max={localToday()}
                  describedBy={`${id}-as-of-hint`}
                  onChange={(asOf) => set({ asOf })}
                />
              </FormField>
            </div>
          </fieldset>

          {error && (
            <p id={`${id}-error`} role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}

          <DialogFooter className="-mx-6 -mb-6 px-6 py-4">
            <DialogClose
              disabled={save.isPending}
              render={<Button type="button" variant="outline" className="h-9 px-4" />}
            >
              Cancel
            </DialogClose>
            <Button type="submit" className="h-9 min-w-36 px-4" disabled={save.isPending} aria-busy={save.isPending}>
              {save.isPending && <LoaderCircle className="size-4 animate-spin motion-reduce:animate-none" aria-hidden />}
              {save.isPending ? 'Saving…' : 'Save position'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
