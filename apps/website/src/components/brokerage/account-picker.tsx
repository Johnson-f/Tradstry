import { Link, useNavigate } from '@tanstack/react-router'
import { ArrowRight, Check, Landmark, Layers, LoaderCircle } from 'lucide-react'
import { useId, useState } from 'react'
import { BrokerageError } from '@/components/brokerage/feedback'
import { ImportRangeFields } from '@/components/brokerage/import-range-fields'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { DialogFooter } from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Separator } from '@/components/ui/separator'
import { useFinalizeAccounts } from '@/lib/client/brokerage/brokerage'
import {
  type AccountChoice,
  type ImportMode,
  accountSummary,
  brokerageErrorMessage,
  selectionInput,
} from '@/lib/client/brokerage/brokerage-model'
import { localToday } from '@/lib/format'

interface Pick {
  selected: boolean
  importMode: ImportMode
  customStartDate: string
}
const choiceKey = (choice: AccountChoice) => `${choice.connectionId}:${choice.snaptradeAccountId}`
const defaultPick = (choice: AccountChoice): Pick => ({
  selected: !choice.isPaper,
  importMode: 'ONE_YEAR',
  customStartDate: '',
})

export function AccountPicker({
  choices,
  onPendingChange,
  onCancel,
}: {
  choices: AccountChoice[]
  onPendingChange?: (pending: boolean) => void
  onCancel: () => void
}) {
  const id = useId()
  const navigate = useNavigate()
  const finalize = useFinalizeAccounts()
  const importable = choices.filter((choice) => !choice.linkedWorkspaceId)
  const linked = choices.filter((choice) => choice.linkedWorkspaceId)
  const [picks, setPicks] = useState<Record<string, Pick>>({})
  const [problem, setProblem] = useState<string | null>(null)
  const pickFor = (choice: AccountChoice) => picks[choiceKey(choice)] ?? defaultPick(choice)
  const selected = importable.filter((choice) => pickFor(choice).selected)
  const allSelected = importable.length > 0 && selected.length === importable.length

  const clearError = () => {
    setProblem(null)
    if (finalize.isError) finalize.reset()
  }
  const update = (choice: AccountChoice, change: Partial<Pick>) => {
    setPicks((current) => ({
      ...current,
      [choiceKey(choice)]: { ...(current[choiceKey(choice)] ?? defaultPick(choice)), ...change },
    }))
    clearError()
  }
  const selectAll = (checked: boolean) => {
    setPicks((current) => {
      const next = { ...current }
      for (const choice of importable)
        next[choiceKey(choice)] = {
          ...(current[choiceKey(choice)] ?? defaultPick(choice)),
          selected: checked,
        }
      return next
    })
    clearError()
  }

  const submit = () => {
    if (finalize.isPending) return
    const result = selectionInput(
      selected.map((choice) => ({
        connectionId: choice.connectionId,
        snaptradeAccountId: choice.snaptradeAccountId,
        importMode: pickFor(choice).importMode,
        customStartDate: pickFor(choice).customStartDate || null,
      })),
      localToday(),
    )
    if (!result.ok) {
      setProblem(result.message)
      return
    }
    setProblem(null)
    onPendingChange?.(true)
    finalize.mutate(result.accounts, {
      onSettled: () => onPendingChange?.(false),
      onSuccess: (accounts) => {
        const [first] = accounts
        void (first?.workspaceId
          ? navigate({ to: '/w/$workspaceId', params: { workspaceId: first.workspaceId } })
          : navigate({ to: '/brokerage/connections' }))
      },
    })
  }
  const error =
    problem ??
    (finalize.isError
      ? brokerageErrorMessage(finalize.error, 'Could not import those accounts. Try again.')
      : null)

  return (
    <form
      className="flex min-h-0 flex-1 flex-col"
      aria-busy={finalize.isPending}
      onSubmit={(event) => {
        event.preventDefault()
        submit()
      }}
    >
      {importable.length > 0 && (
        <>
          <div className="flex shrink-0 items-center justify-between gap-3 px-5 py-3 sm:px-6">
            <div className="flex items-center gap-2.5">
              <Checkbox
                id={`${id}-all`}
                checked={allSelected}
                indeterminate={selected.length > 0 && !allSelected}
                disabled={finalize.isPending}
                onCheckedChange={selectAll}
              />
              <Label htmlFor={`${id}-all`} className="cursor-pointer text-xs font-medium">
                Select all
              </Label>
            </div>
            <span role="status" className="text-xs text-muted-foreground">
              {selected.length} of {importable.length} selected
            </span>
          </div>
          <Separator />
        </>
      )}
      <ScrollArea className="min-h-0 flex-1 overflow-hidden [&_[data-slot=scroll-area-viewport]]:overscroll-contain">
        <div className="space-y-5 p-5 sm:p-6">
          {importable.length > 0 ? (
            <fieldset className="min-w-0 space-y-3" disabled={finalize.isPending}>
              <legend className="sr-only">Accounts to import</legend>
              {importable.map((choice) => {
                const key = choiceKey(choice)
                const pick = pickFor(choice)
                return (
                  <Card
                    key={key}
                    role="group"
                    aria-label={choice.name}
                    className={`gap-3 rounded-xl p-4 shadow-none ${pick.selected ? 'ring-foreground/20' : 'bg-muted/20 ring-border'}`}
                  >
                    <div className="flex items-start gap-3">
                      <Checkbox
                        id={`${id}-${key}`}
                        checked={pick.selected}
                        disabled={finalize.isPending}
                        onCheckedChange={(checked) => update(choice, { selected: checked })}
                        className="mt-0.5"
                      />
                      <Label htmlFor={`${id}-${key}`} className="min-w-0 flex-1 cursor-pointer items-start">
                        <span className="min-w-0 space-y-1.5">
                          <span className="block text-sm leading-5 font-medium break-words">
                            {choice.name}
                          </span>
                          <span className="flex flex-wrap gap-x-2 text-xs leading-5 font-normal text-muted-foreground">
                            {choice.maskedNumber && (
                              <span className="tabular-nums">{choice.maskedNumber}</span>
                            )}
                            <span>
                              {[choice.institutionName, accountSummary(choice)].filter(Boolean).join(' · ')}
                            </span>
                          </span>
                        </span>
                      </Label>
                      {choice.isPaper && (
                        <Badge variant="outline" className="text-[10px]">
                          Paper
                        </Badge>
                      )}
                    </div>
                    {pick.selected && (
                      <div className="pl-7">
                        {choice.previouslyLinked ? (
                          <p className="text-xs leading-5 text-muted-foreground">
                            Your existing history and import range will be kept.
                          </p>
                        ) : (
                          <ImportRangeFields
                            compact
                            mode={pick.importMode}
                            date={pick.customStartDate}
                            disabled={finalize.isPending}
                            onModeChange={(importMode) => update(choice, { importMode })}
                            onDateChange={(customStartDate) => update(choice, { customStartDate })}
                          />
                        )}
                      </div>
                    )}
                  </Card>
                )
              })}
            </fieldset>
          ) : (
            <div className="flex flex-col items-center gap-3 px-4 py-8 text-center">
              {linked.length > 0 ? (
                <Check className="size-7 text-muted-foreground" aria-hidden />
              ) : (
                <Landmark className="size-7 text-muted-foreground" aria-hidden />
              )}
              <h3 className="font-medium">
                {linked.length > 0
                  ? 'Your accounts are already imported'
                  : 'No investment accounts available'}
              </h3>
              <p className="max-w-sm text-sm leading-6 text-muted-foreground">
                {linked.length > 0
                  ? 'Open a workspace below to view its holdings and activity.'
                  : 'You can close this window and try another brokerage connection.'}
              </p>
            </div>
          )}
          {linked.length > 0 && (
            <section aria-labelledby={`${id}-linked`} className="space-y-2">
              <h3 id={`${id}-linked`} className="text-xs font-medium text-muted-foreground">
                Already in Tradstry
              </h3>
              {linked.map((choice) => (
                <Button
                  key={choiceKey(choice)}
                  disabled={finalize.isPending}
                  variant="outline"
                  className="h-auto w-full justify-between gap-3 px-4 py-3"
                  nativeButton={false}
                  render={<Link to="/w/$workspaceId" params={{ workspaceId: choice.linkedWorkspaceId! }} />}
                >
                  <span className="truncate">{choice.name}</span>
                  <ArrowRight aria-hidden />
                </Button>
              ))}
            </section>
          )}
        </div>
      </ScrollArea>
      {error && (
        <div className="shrink-0 px-5 pb-4 sm:px-6">
          <BrokerageError message={error} />
        </div>
      )}
      <DialogFooter className="m-0 shrink-0 flex-col gap-3 rounded-b-2xl px-5 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
        <p className="flex items-center gap-2 text-xs leading-5 text-muted-foreground">
          <Layers className="size-4 shrink-0" aria-hidden />
          Each account gets its own workspace.
        </p>
        <div className="flex w-full justify-end gap-2 sm:w-auto">
          <Button
            type="button"
            variant="outline"
            className="h-9 px-4"
            disabled={finalize.isPending}
            onClick={onCancel}
          >
            {importable.length > 0 ? 'Not now' : 'Done'}
          </Button>
          {importable.length > 0 && (
            <Button
              type="submit"
              className="h-9 min-w-36 px-4"
              disabled={selected.length === 0 || finalize.isPending}
            >
              {finalize.isPending && (
                <LoaderCircle className="animate-spin motion-reduce:animate-none" aria-hidden />
              )}
              {finalize.isPending
                ? 'Starting import…'
                : `Import ${selected.length} ${selected.length === 1 ? 'account' : 'accounts'}`}
            </Button>
          )}
        </div>
      </DialogFooter>
    </form>
  )
}
