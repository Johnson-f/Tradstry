import { useNavigate } from '@tanstack/react-router'
import { LoaderCircle } from 'lucide-react'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { useFinalizeAccounts } from '@/lib/client/brokerage'
import {
  type AccountChoice,
  type ImportMode,
  IMPORT_MODE_LABELS,
  brokerageErrorMessage,
  selectionInput,
} from '@/lib/client/brokerage-model'
import { localToday } from '@/lib/format'

interface Pick {
  selected: boolean
  importMode: ImportMode
  customStartDate: string
}

const choiceKey = (choice: AccountChoice) => `${choice.connectionId}:${choice.snaptradeAccountId}`

export function AccountPicker({ choices }: { choices: AccountChoice[] }) {
  const navigate = useNavigate()
  const finalize = useFinalizeAccounts()
  const importable = choices.filter((choice) => !choice.linkedWorkspaceId)
  const [picks, setPicks] = useState<Record<string, Pick>>(() =>
    Object.fromEntries(
      importable.map((choice) => [
        choiceKey(choice),
        { selected: !choice.isPaper, importMode: 'ONE_YEAR', customStartDate: '' },
      ]),
    ),
  )
  const [problem, setProblem] = useState<string | null>(null)
  const today = localToday()

  const update = (key: string, change: Partial<Pick>) =>
    setPicks((current) => ({ ...current, [key]: { ...current[key], ...change } }))

  const submit = () => {
    const result = selectionInput(
      importable
        .filter((choice) => picks[choiceKey(choice)]?.selected)
        .map((choice) => {
          const pick = picks[choiceKey(choice)]
          return {
            connectionId: choice.connectionId,
            snaptradeAccountId: choice.snaptradeAccountId,
            importMode: pick.importMode,
            customStartDate: pick.customStartDate || null,
          }
        }),
      today,
    )
    if (!result.ok) {
      setProblem(result.message)
      return
    }
    setProblem(null)
    finalize.mutate(result.accounts, {
      onSuccess: (accounts) => {
        const [first] = accounts
        void (first?.workspaceId
          ? navigate({ to: '/w/$workspaceId', params: { workspaceId: first.workspaceId } })
          : navigate({ to: '/brokerage' }))
      },
    })
  }

  if (importable.length === 0) {
    return (
      <div className="rounded-2xl border border-neutral-200/60 bg-card px-5 py-4 text-sm shadow-xs dark:border-white/10">
        Every account in this connection is already in Tradstry.
      </div>
    )
  }

  const error = problem ?? (finalize.isError ? brokerageErrorMessage(finalize.error, 'Could not import those accounts. Try again.') : null)

  return (
    <form
      className="space-y-4"
      onSubmit={(event) => {
        event.preventDefault()
        submit()
      }}
    >
      <fieldset className="divide-y divide-neutral-200/60 overflow-hidden rounded-2xl border border-neutral-200/60 bg-card shadow-xs dark:divide-white/10 dark:border-white/10">
        <legend className="sr-only">Accounts to import</legend>
        {importable.map((choice) => {
          const key = choiceKey(choice)
          const pick = picks[key]
          return (
            <div key={key} className="flex flex-wrap items-center gap-x-4 gap-y-2 px-5 py-3.5">
              <label className="flex min-w-0 flex-1 cursor-pointer items-start gap-3">
                <input
                  type="checkbox"
                  checked={pick.selected}
                  onChange={(event) => update(key, { selected: event.target.checked })}
                  className="mt-0.5 size-4 accent-neutral-900 dark:accent-neutral-100"
                />
                <span className="min-w-0">
                  <span className="block text-sm font-medium break-words">
                    {choice.name}
                    {choice.maskedNumber && <span className="ml-1.5 text-muted-foreground">{choice.maskedNumber}</span>}
                  </span>
                  <span className="mt-0.5 block text-[13px] text-muted-foreground">
                    {[choice.institutionName, choice.rawType, choice.isPaper ? 'Paper' : null, choice.previouslyLinked ? 'Imported before' : null]
                      .filter(Boolean)
                      .join(' · ')}
                  </span>
                </span>
              </label>
              {pick.selected && (
                <div className="flex items-center gap-2">
                  <label className="sr-only" htmlFor={`${key}-range`}>
                    History to import for {choice.name}
                  </label>
                  <select
                    id={`${key}-range`}
                    value={pick.importMode}
                    onChange={(event) => update(key, { importMode: event.target.value as ImportMode })}
                    className="h-7.5 rounded-lg border border-border bg-background px-2 text-[13px] dark:bg-input/30"
                  >
                    {(Object.keys(IMPORT_MODE_LABELS) as ImportMode[]).map((mode) => (
                      <option key={mode} value={mode}>
                        {IMPORT_MODE_LABELS[mode]}
                      </option>
                    ))}
                  </select>
                  {pick.importMode === 'CUSTOM' && (
                    <>
                      <label className="sr-only" htmlFor={`${key}-start`}>
                        Import {choice.name} from
                      </label>
                      <input
                        id={`${key}-start`}
                        type="date"
                        max={today}
                        value={pick.customStartDate}
                        onChange={(event) => update(key, { customStartDate: event.target.value })}
                        className="h-7.5 rounded-lg border border-border bg-background px-2 text-[13px] dark:bg-input/30"
                      />
                    </>
                  )}
                </div>
              )}
            </div>
          )
        })}
      </fieldset>
      <p className="text-[13px] text-muted-foreground">
        Each account gets its own workspace. You can import further back later, but not less.
      </p>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      <Button type="submit" disabled={finalize.isPending}>
        {finalize.isPending && <LoaderCircle className="animate-spin" aria-hidden />}
        Import accounts
      </Button>
    </form>
  )
}
