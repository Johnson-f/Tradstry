import { Download, LoaderCircle, Monitor, Moon, Sun } from 'lucide-react'
import { useId, useState } from 'react'
import { MoneyInput } from '@/components/trades/instrument-fields'
import { ChoiceField } from '@/components/trades/trade-bits'
import { Button } from '@/components/ui/button'
import { downloadText, exportRows, tradesCsv } from '@/lib/client/export'
import { PERIODS } from '@/lib/client/home/home-model'
import { DEFAULT_SETTINGS, type UserSettings, useSettings, useUpdateSettings } from '@/lib/client/settings'
import { tradeErrorMessage } from '@/lib/client/trades/trades-model'
import { useWorkspaces } from '@/lib/client/workspaces'
import { localToday } from '@/lib/format'
import { type Theme, applyTheme, storedTheme } from '@/lib/theme'

const cardClass =
  'divide-y divide-neutral-200/60 overflow-hidden rounded-2xl border border-neutral-200/60 bg-card shadow-xs dark:divide-white/10 dark:border-white/10'
const selectClass = 'h-9 w-52 bg-background text-[13px]'

const THEMES: Array<{ value: Theme; label: string; icon: typeof Sun }> = [
  { value: 'light', label: 'Light', icon: Sun },
  { value: 'dark', label: 'Dark', icon: Moon },
  { value: 'system', label: 'System', icon: Monitor },
]

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  const id = useId()
  return (
    <section aria-labelledby={id} className="space-y-2">
      <h2 id={id} className="text-[13px] font-medium">
        {title}
      </h2>
      <div className={cardClass}>{children}</div>
    </section>
  )
}

function Row({
  title,
  description,
  htmlFor,
  children,
}: {
  title: string
  description: React.ReactNode
  htmlFor?: string
  children: React.ReactNode
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3 px-5 py-3.5">
      <div className="min-w-0 flex-1 basis-60">
        {htmlFor ? (
          <label htmlFor={htmlFor} className="text-sm font-medium">
            {title}
          </label>
        ) : (
          <p className="text-sm font-medium">{title}</p>
        )}
        <p className="mt-0.5 text-[13px] leading-5 text-muted-foreground">{description}</p>
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  )
}

/** A dollar amount saved when the field is left; empty means `empty`. */
function AmountSetting({
  id,
  value,
  empty,
  placeholder,
  disabled,
  onSave,
}: {
  id: string
  value: string | null
  empty: string | null
  placeholder: string
  disabled: boolean
  onSave: (value: string | null) => void
}) {
  const [draft, setDraft] = useState<string | null>(null)
  const shown = draft ?? (value === null || value === empty ? '' : value)
  const commit = () => {
    if (draft === null) return
    const cleaned = draft.replace(/[$,\s]/g, '')
    setDraft(null)
    const next = cleaned === '' ? empty : cleaned
    if (next !== value) onSave(next)
  }
  return (
    <MoneyInput
      id={id}
      value={shown}
      placeholder={placeholder}
      disabled={disabled}
      autoComplete="off"
      onChange={(event) => setDraft(event.target.value)}
      onBlur={commit}
      onKeyDown={(event) => {
        if (event.key === 'Enter') commit()
      }}
      className="h-9 w-36"
    />
  )
}

function ExportRow() {
  const workspaces = useWorkspaces()
  const [state, setState] = useState<{ status: 'idle' | 'working' | 'done' | 'failed'; count?: number }>({
    status: 'idle',
  })
  const run = async () => {
    setState({ status: 'working' })
    try {
      const rows = await exportRows(workspaces.data ?? [])
      downloadText(`tradstry-trades-${localToday()}.csv`, tradesCsv(rows), 'text/csv;charset=utf-8')
      setState({ status: 'done', count: rows.length })
    } catch {
      setState({ status: 'failed' })
    }
  }
  return (
    <Row
      title="Export trades and journal"
      description={
        state.status === 'done'
          ? `Downloaded ${state.count} ${state.count === 1 ? 'trade' : 'trades'}.`
          : state.status === 'failed'
            ? 'Could not prepare the export. Try again.'
            : 'A CSV of every trade in every workspace, with its labels, stop, risk and notes.'
      }
    >
      <Button
        variant="outline"
        size="sm"
        className="h-9 px-3"
        disabled={state.status === 'working' || !workspaces.data}
        aria-busy={state.status === 'working'}
        onClick={() => void run()}
      >
        {state.status === 'working' ? (
          <LoaderCircle className="size-4 animate-spin motion-reduce:animate-none" aria-hidden />
        ) : (
          <Download className="size-4" aria-hidden />
        )}
        {state.status === 'working' ? 'Preparing…' : 'Export CSV'}
      </Button>
    </Row>
  )
}

/** Appearance, times, how results are measured, the dashboard's opening period, and data export. */
export function GeneralSettings() {
  const id = useId()
  const settings = useSettings()
  const update = useUpdateSettings()
  const [theme, setTheme] = useState(storedTheme)
  const current = settings.data ?? DEFAULT_SETTINGS
  const loading = settings.isPending
  const save = (change: Partial<UserSettings>) => update.mutate({ ...current, ...change })
  const localZone = Intl.DateTimeFormat().resolvedOptions().timeZone.replace(/_/g, ' ')

  return (
    <div className="space-y-7">
      {(update.isError || settings.isError) && (
        <p role="alert" className="text-sm text-destructive">
          {tradeErrorMessage(update.error ?? settings.error, 'Could not save your settings. Try again.')}
        </p>
      )}

      <Section title="Appearance">
        <Row title="Theme" description="System follows your device’s light or dark setting.">
          <div role="radiogroup" aria-label="Theme" className="flex rounded-lg bg-muted/70 p-0.5 dark:bg-white/8">
            {THEMES.map(({ value, label, icon: Icon }) => (
              <button
                key={value}
                type="button"
                role="radio"
                aria-checked={theme === value}
                onClick={() => {
                  setTheme(value)
                  applyTheme(value)
                }}
                className="flex h-8 items-center gap-1.5 rounded-md px-3 text-[13px] text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50 aria-checked:bg-background aria-checked:font-medium aria-checked:text-foreground aria-checked:shadow-xs dark:aria-checked:bg-white/12"
              >
                <Icon className="size-3.5" aria-hidden />
                {label}
              </button>
            ))}
          </div>
        </Row>
      </Section>

      <Section title="Time and dates">
        <Row
          title="Show times in"
          description="Statistics always use New York trading days; this only changes how times are shown."
        >
          <ChoiceField
            id={`${id}-zone`}
            label="Show times in"
            hideLabel
            className={selectClass}
            value={current.timeZone}
            onChange={(timeZone) => save({ timeZone })}
            choices={[
              { value: 'LOCAL', label: `Your time zone (${localZone})` },
              { value: 'MARKET', label: 'New York (market time)' },
            ]}
          />
        </Row>
        <Row title="Weeks start on" description="The first day of each week in the trading calendar.">
          <ChoiceField
            id={`${id}-week`}
            label="Weeks start on"
            hideLabel
            className={selectClass}
            value={current.weekStart}
            onChange={(weekStart) => save({ weekStart })}
            choices={[
              { value: 'SUNDAY', label: 'Sunday' },
              { value: 'MONDAY', label: 'Monday' },
            ]}
          />
        </Row>
      </Section>

      <Section title="Trading">
        <Row
          title="Default risk per trade"
          htmlFor={`${id}-risk`}
          description="Used for R when a trade has no initial stop or planned risk. Leave empty to show no R for those trades."
        >
          <AmountSetting
            key={`risk-${current.defaultRisk}`}
            id={`${id}-risk`}
            value={current.defaultRisk}
            empty={null}
            placeholder="None"
            disabled={loading || update.isPending}
            onSave={(defaultRisk) => save({ defaultRisk })}
          />
        </Row>
        <Row
          title="Breakeven band"
          htmlFor={`${id}-band`}
          description="Trades that made or lost no more than this count as breakeven, not wins or losses. Totals don’t change."
        >
          <AmountSetting
            key={`band-${current.breakevenBand}`}
            id={`${id}-band`}
            value={current.breakevenBand}
            empty="0"
            placeholder="0.00"
            disabled={loading || update.isPending}
            onSave={(breakevenBand) => save({ breakevenBand: breakevenBand ?? '0' })}
          />
        </Row>
      </Section>

      <Section title="Dashboard">
        <Row title="Opening period" description="The period the dashboard and analytics show when you open them.">
          <ChoiceField
            id={`${id}-period`}
            label="Opening period"
            hideLabel
            className={selectClass}
            value={current.defaultPeriod}
            onChange={(defaultPeriod) => save({ defaultPeriod })}
            choices={PERIODS.map((period) => ({ value: period.value, label: period.label }))}
          />
        </Row>
      </Section>

      <Section title="Your data">
        <ExportRow />
      </Section>
    </div>
  )
}
