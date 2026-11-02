import { Check, LoaderCircle, PencilLine, SlidersHorizontal } from 'lucide-react'
import { useBlocker } from '@tanstack/react-router'
import { useEffect, useEffectEvent, useId, useLayoutEffect, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { GraphQLRequestError } from '@/lib/client/api'
import { Label } from '@/components/ui/label'
import { ScrollArea } from '@/components/ui/scroll-area'
import { PlanLink } from '@/components/plans/plan-link'
import { BehaviorFields } from '@/components/trades/behavior-fields'
import { LabelDot, LabelMultiSelect } from '@/components/trades/label-picker'
import { ManageLabelsDialog } from '@/components/trades/manage-labels-dialog'
import { TradeNoteEditor } from '@/components/trades/trade-note-editor'
import { noteDocumentError, noteKey } from '@/lib/client/trades/note-document'
import { useJournalLabels } from '@/lib/client/trades/labels'
import { type SuggestedStop, useSaveAnnotation } from '@/lib/client/trades/trades'
import {
  type AnnotationDraft,
  type LabelRef,
  type TradeAnnotation,
  type TradeSummary,
  annotationDraft,
  annotationInput,
  behaviorChips,
  money,
  previewR,
  price,
  rMultiple,
  riskDollars,
  tradeErrorMessage,
} from '@/lib/client/trades/trades-model'
import { formatDate, formatDateTime } from '@/lib/format'

const detailInputClass = 'h-9 border-transparent bg-muted/60 shadow-none focus-visible:bg-transparent dark:bg-white/5'
const fieldLabelClass = 'text-xs font-normal text-muted-foreground'

const ORDER_TYPE: Record<string, string> = {
  stop: 'stop',
  stoplimit: 'stop-limit',
  trailingstop: 'trailing stop',
  stoploss: 'stop-loss',
}

function orderTypeLabel(type: string): string {
  return ORDER_TYPE[type.toLowerCase().replace(/[\s_-]/g, '')] ?? type.toLowerCase()
}

function LabelChips({ labels, prefix }: { labels: LabelRef[]; prefix?: string }) {
  return labels.map((label) => (
    <span
      key={label.id}
      className="inline-flex h-6 items-center gap-1.5 rounded-md bg-muted/70 px-2 text-xs text-foreground dark:bg-white/8"
    >
      <LabelDot color={label.color} />
      {prefix && <span className="text-muted-foreground">{prefix}</span>}
      {label.name}
    </span>
  ))
}

const AUTOSAVE_DELAY_MS = 800

function draftKey(draft: AnnotationDraft): string {
  return JSON.stringify({ ...draft, notes: noteKey(draft.notes) })
}

interface EditorProps {
  workspaceId: string
  trade: TradeSummary
  suggestedStop: SuggestedStop | null
  context?: React.ReactNode
  onFlushChange: (flush: (() => Promise<boolean>) | null) => void
  reloadAnnotation: () => Promise<TradeAnnotation | null>
}

/**
 * The trader's context on a trade: notes, edges, entry tactics, tags, mistakes
 * and the initial risk. Changes save on their own; key it by trade.
 */
export function AnnotationEditor({
  workspaceId,
  trade,
  suggestedStop,
  context,
  onFlushChange,
  reloadAnnotation,
}: EditorProps) {
  const id = useId()
  const annotation: TradeAnnotation | null = trade.annotation
  const [detailsOpen, setDetailsOpen] = useState(false)
  const save = useSaveAnnotation(workspaceId, trade.id)
  const [draft, setDraft] = useState<AnnotationDraft>(() => annotationDraft(annotation))
  const [initialNotes, setInitialNotes] = useState(() => draft.notes)
  const [editorRevision, setEditorRevision] = useState(0)
  const [base, setBase] = useState(() => ({
    key: draftKey(draft),
    version: annotation?.version ?? null,
    savedAt: annotation?.updatedAt ?? null,
  }))
  const [problem, setProblem] = useState<string | null>(null)
  const [editorProblem, setEditorProblem] = useState<string | null>(null)
  const [failedKey, setFailedKey] = useState<string | null>(null)
  const [reloading, setReloading] = useState(false)
  const [remoteChanged, setRemoteChanged] = useState(false)
  const catalog = useJournalLabels()
  const saved = annotationDraft(annotation)
  const key = draftKey(draft)
  const dirty = key !== base.key
  const input = annotationInput(draft)
  const invalid = editorProblem ?? noteDocumentError(draft.notes) ?? (input.ok ? null : input.message)
  const saveConflict = save.error instanceof GraphQLRequestError && save.error.code === 'CONFLICT'
  // Another device saved a newer version: stop autosaving over it until it is loaded.
  const conflict = saveConflict || remoteChanged
  const risk = riskDollars(trade, draft)
  const r = previewR(trade.net, risk)
  const savedLabels: LabelRef[] = annotation
    ? [...annotation.edges, ...annotation.entryTactics, ...annotation.tags, ...annotation.mistakes]
    : []
  const chosen = (ids: string[]) => savedLabels.filter((label) => ids.includes(label.id))

  const latest = useRef({ draft, key, base, invalid, conflict })
  useLayoutEffect(() => {
    latest.current = { draft, key, base, invalid, conflict }
  })
  const pending = useRef<Promise<boolean> | null>(null)
  const persist = useRef<() => Promise<boolean>>(() => Promise.resolve(true))

  const set = (change: Partial<AnnotationDraft>) => {
    const next = { ...latest.current.draft, ...change }
    latest.current.draft = next
    latest.current.key = draftKey(next)
    setDraft(next)
  }

  useEffect(() => {
    persist.current = () => {
      if (pending.current) return pending.current
      // One request at a time. Keep edits made during the request and save
      // them next, using the version returned by the preceding write.
      pending.current = Promise.resolve().then(async () => {
        while (latest.current.key !== latest.current.base.key) {
          const current = latest.current
          const nextInput = annotationInput(current.draft)
          if (current.invalid || current.conflict || noteDocumentError(current.draft.notes) || !nextInput.ok) return false
          const sentKey = current.key
          setFailedKey(null)
          try {
            const result = await save.mutateAsync({ version: current.base.version, input: nextInput.input })
            const nextBase = { key: sentKey, version: result.version, savedAt: result.updatedAt }
            latest.current.base = nextBase
            setBase(nextBase)
          } catch (error) {
            latest.current.conflict = error instanceof GraphQLRequestError && error.code === 'CONFLICT'
            setFailedKey(latest.current.key)
            return false
          }
        }
        return true
      }).finally(() => {
        pending.current = null
      })
      return pending.current
    }
  })

  useEffect(() => {
    if (!dirty || invalid || conflict || save.isPending || key === failedKey) return
    const timer = setTimeout(() => {
      void persist.current()
    }, AUTOSAVE_DELAY_MS)
    return () => clearTimeout(timer)
  }, [key, dirty, invalid, conflict, save.isPending, failedKey])

  useEffect(() => {
    onFlushChange(() => persist.current())
    return () => {
      onFlushChange(null)
      void persist.current()
    }
  }, [onFlushChange])

  useBlocker({
    shouldBlockFn: async () => reloading || !(await persist.current()),
    enableBeforeUnload: dirty || save.isPending || reloading,
  })

  const applyAnnotation = (fresh: TradeAnnotation | null) => {
    const next = annotationDraft(fresh)
    const nextBase = { key: draftKey(next), version: fresh?.version ?? null, savedAt: fresh?.updatedAt ?? null }
    latest.current.draft = next
    latest.current.key = nextBase.key
    latest.current.base = nextBase
    latest.current.conflict = false
    setDraft(next)
    setInitialNotes(next.notes)
    setEditorRevision((revision) => revision + 1)
    setBase(nextBase)
    setFailedKey(null)
    setEditorProblem(null)
    setProblem(null)
    setRemoteChanged(false)
    save.reset()
  }

  // Live updates refetch the trade when another device saves this entry. With
  // no local edits, show theirs at once; otherwise offer it instead of
  // overwriting either side. An older version arriving late is ignored.
  const remoteVersion = annotation?.version ?? null
  const onSavedVersion = useEffectEvent(() => {
    if (remoteVersion === null || remoteVersion <= (base.version ?? 0) || pending.current || reloading) return
    if (latest.current.key === latest.current.base.key) applyAnnotation(annotation)
    else setRemoteChanged(true)
  })
  useEffect(() => onSavedVersion(), [remoteVersion, base.version])

  const reload = async () => {
    setReloading(true)
    try {
      applyAnnotation(await reloadAnnotation())
    } catch {
      setProblem('Could not load the latest note. Your changes are still here. Try loading it again.')
    } finally {
      setReloading(false)
    }
  }

  const draftLabels = (ids: string[]): LabelRef[] =>
    ids.flatMap((labelId) => {
      const label = catalog.data?.find((l) => l.id === labelId) ?? savedLabels.find((l) => l.id === labelId)
      return label
        ? [{ id: label.id, kind: label.kind, name: label.name, color: label.color, archived: label.archived }]
        : []
    })
  const chips = behaviorChips(draft.behavior)
  const hasDetails =
    draft.edgeIds.length ||
    draft.entryTacticIds.length ||
    draft.tagIds.length ||
    draft.mistakeIds.length ||
    risk !== null ||
    chips.length

  return (
    <Dialog open={detailsOpen} onOpenChange={setDetailsOpen}>
      <div className="@container/note-editor flex min-h-0 flex-1 flex-col">
        <ScrollArea className="min-h-0 flex-1 overflow-hidden [&>[data-slot=scroll-area-viewport]]:overscroll-contain">
          <fieldset
            disabled={reloading}
            className="mx-auto min-w-0 max-w-2xl px-6 py-7 @lg/note-editor:px-10 @lg/note-editor:py-9"
          >
            <div className="flex flex-wrap items-center gap-3">
              <div className="min-w-0 flex-1">{context}</div>
              <DialogTrigger
                render={<Button type="button" variant="outline" size="sm" className="ml-auto" />}
              >
                <SlidersHorizontal aria-hidden />
                Trade Detail
              </DialogTrigger>
            </div>
            {hasDetails ? (
              <ul aria-label="Trade Detail" className="mt-4 flex flex-wrap gap-1.5">
                {draftLabels(draft.edgeIds).map((label) => (
                  <li key={label.id} className="contents">
                    <LabelChips labels={[label]} prefix="Edge" />
                  </li>
                ))}
                {draftLabels(draft.entryTacticIds).map((label) => (
                  <li key={label.id} className="contents">
                    <LabelChips labels={[label]} prefix="Entry" />
                  </li>
                ))}
                {draftLabels(draft.tagIds).map((label) => (
                  <li key={label.id} className="contents">
                    <LabelChips labels={[label]} />
                  </li>
                ))}
                {draftLabels(draft.mistakeIds).map((label) => (
                  <li key={label.id} className="contents">
                    <LabelChips labels={[label]} prefix="Mistake" />
                  </li>
                ))}
                {risk !== null && (
                  <li className="inline-flex h-6 items-center rounded-md bg-muted/70 px-2 text-xs tabular-nums dark:bg-white/8">
                    <span className="mr-1.5 text-muted-foreground">Risk</span>
                    {money(String(risk))}
                    {r !== null && <span className="ml-1.5 text-muted-foreground">· {rMultiple(String(r))}</span>}
                  </li>
                )}
                {chips.map((chip) => (
                  <li
                    key={chip}
                    className="inline-flex h-6 items-center rounded-md bg-muted/70 px-2 text-xs tabular-nums dark:bg-white/8"
                  >
                    {chip}
                  </li>
                ))}
              </ul>
            ) : (
              suggestedStop && (
                <p className="mt-4 text-xs text-muted-foreground">
                  Your {orderTypeLabel(suggestedStop.orderType)} order put the stop at {price(suggestedStop.price)}.{' '}
                  <button
                    type="button"
                    className="font-medium text-foreground underline underline-offset-4"
                    onClick={() => set({ initialStop: suggestedStop.price })}
                  >
                    Use it as the initial stop
                  </button>
                </p>
              )
            )}
            <PlanLink
              workspaceId={workspaceId}
              trade={trade}
              onLink={(plan) => set({ initialStop: plan.stop, plannedRisk: plan.risk })}
            />
            <div className="mt-6">
              <h3 className="text-2xl font-semibold tracking-tight">Trade Notes</h3>
              <TradeNoteEditor
                key={editorRevision}
                initialValue={initialNotes}
                disabled={reloading}
                onChange={(notes) => set({ notes })}
                onError={setEditorProblem}
              />
            </div>
          </fieldset>
        </ScrollArea>
        <footer className="shrink-0 border-t border-border/60 px-6 py-3">
          {(invalid || problem || save.error || remoteChanged) && (
            <div role="alert" className="mb-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-destructive">
              <span>
                {invalid ??
                  problem ??
                  (saveConflict
                    ? 'This note changed on another device, so your latest changes were not saved.'
                    : remoteChanged
                      ? 'This note changed on another device. Your edits here are paused until you load it.'
                      : tradeErrorMessage(save.error, 'Could not save your changes.'))}
              </span>
              {!invalid && (!problem || conflict) && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-7 px-2.5 text-xs"
                  disabled={save.isPending || reloading}
                  onClick={() => {
                    if (conflict) void reload()
                    else void persist.current()
                  }}
                >
                  {conflict ? 'Load latest version' : 'Try again'}
                </Button>
              )}
            </div>
          )}
          <p role="status" className="flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground">
            {save.isPending || reloading ? (
              <>
                <LoaderCircle className="size-3.5 shrink-0 animate-spin" aria-hidden />
                {reloading ? 'Loading latest note…' : 'Saving…'}
              </>
            ) : dirty ? (
              <>
                <PencilLine className="size-3.5 shrink-0" aria-hidden />
                {invalid || save.error ? 'Not saved' : 'Editing…'}
              </>
            ) : base.savedAt ? (
              <>
                <Check className="size-3.5 shrink-0" aria-hidden />
                Saved {formatDateTime(base.savedAt)}
              </>
            ) : (
              'Changes save automatically'
            )}
          </p>
        </footer>
      </div>
      <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto rounded-2xl p-6 font-sans sm:max-w-lg data-open:animate-none data-closed:animate-none">
        <DialogHeader className="pr-6">
          <DialogTitle className="text-lg font-semibold">Trade Detail</DialogTitle>
          <DialogDescription className="text-xs leading-5">
            Label the trade, set its initial risk and note how you traded it. Changes save automatically.{' '}
            <ManageLabelsDialog triggerStyle="link" />
          </DialogDescription>
        </DialogHeader>
        <form
          className="space-y-5"
          onSubmit={(event) => {
            event.preventDefault()
            if (input.ok) {
              setDetailsOpen(false)
              void persist.current()
            }
          }}
        >
          <fieldset disabled={reloading} className="grid min-w-0 gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5 sm:col-span-2">
              <Label htmlFor={`${id}-edge`} className={fieldLabelClass}>
                Edges · what gave this trade an advantage?
              </Label>
              <LabelMultiSelect
                id={`${id}-edge`}
                kind="EDGE"
                value={draft.edgeIds}
                chosen={chosen(saved.edgeIds)}
                placeholder="Strong relative volume"
                onChange={(edgeIds) => set({ edgeIds })}
                onError={setProblem}
              />
            </div>
            <div className="flex flex-col gap-1.5 sm:col-span-2">
              <Label htmlFor={`${id}-tactic`} className={fieldLabelClass}>
                Entry tactics · what triggered your entry?
              </Label>
              <LabelMultiSelect
                id={`${id}-tactic`}
                kind="ENTRY_TACTIC"
                value={draft.entryTacticIds}
                chosen={chosen(saved.entryTacticIds)}
                placeholder="Breakout retest"
                onChange={(entryTacticIds) => set({ entryTacticIds })}
                onError={setProblem}
              />
            </div>
            <div className="flex flex-col gap-1.5 sm:col-span-2">
              <Label htmlFor={`${id}-tags`} className={fieldLabelClass}>
                Tags
              </Label>
              <LabelMultiSelect
                id={`${id}-tags`}
                kind="TAG"
                value={draft.tagIds}
                chosen={chosen(saved.tagIds)}
                placeholder="Gap up, earnings"
                onChange={(tagIds) => set({ tagIds })}
                onError={setProblem}
              />
            </div>
            <div className="flex flex-col gap-1.5 sm:col-span-2">
              <Label htmlFor={`${id}-mistakes`} className={fieldLabelClass}>
                Mistakes
              </Label>
              <LabelMultiSelect
                id={`${id}-mistakes`}
                kind="MISTAKE"
                value={draft.mistakeIds}
                chosen={chosen(saved.mistakeIds)}
                placeholder="Chased the entry"
                onChange={(mistakeIds) => set({ mistakeIds })}
                onError={setProblem}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor={`${id}-stop`} className={fieldLabelClass}>
                Initial stop<span className="sr-only"> (dollars)</span>
              </Label>
              <div className="relative">
                <span
                  className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-sm text-muted-foreground"
                  aria-hidden
                >
                  $
                </span>
                <Input
                  id={`${id}-stop`}
                  inputMode="decimal"
                  value={draft.initialStop}
                  placeholder="0.00"
                  aria-describedby={`${id}-risk-hint`}
                  onChange={(event) => set({ initialStop: event.target.value })}
                  className={`${detailInputClass} pl-7 tabular-nums`}
                />
              </div>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor={`${id}-risk`} className={fieldLabelClass}>
                Planned risk ($)
              </Label>
              <div className="relative">
                <span
                  className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-sm text-muted-foreground"
                  aria-hidden
                >
                  $
                </span>
                <Input
                  id={`${id}-risk`}
                  inputMode="decimal"
                  value={draft.plannedRisk}
                  placeholder="Optional"
                  aria-describedby={`${id}-risk-hint`}
                  onChange={(event) => set({ plannedRisk: event.target.value })}
                  className={`${detailInputClass} pl-7 tabular-nums`}
                />
              </div>
            </div>
            <div id={`${id}-risk-hint`} className="space-y-1.5 text-xs leading-5 text-muted-foreground sm:col-span-2">
              {suggestedStop && draft.initialStop.trim() === '' && (
                <p>
                  Your {orderTypeLabel(suggestedStop.orderType)} order on {formatDate(suggestedStop.placedAt)} put the
                  stop at <span className="text-foreground tabular-nums">{price(suggestedStop.price)}</span>.{' '}
                  <button
                    type="button"
                    className="font-medium text-foreground underline underline-offset-4"
                    onClick={() => set({ initialStop: suggestedStop.price })}
                  >
                    Use it
                  </button>
                </p>
              )}
              <p>
                {risk === null
                  ? 'R is measured against the stop you planned at entry. A planned risk in dollars takes its place.'
                  : `Risk ${money(String(risk))}${r === null ? '' : ` · ${rMultiple(String(r))}`}${
                      draft.plannedRisk.trim() ? ', from your planned risk.' : ', from the initial stop.'
                    }`}
              </p>
            </div>
            <section aria-labelledby={`${id}-behavior`} className="space-y-3 border-t pt-4 sm:col-span-2">
              <div>
                <h3 id={`${id}-behavior`} className="text-sm font-medium">
                  How you traded it
                </h3>
                <p className="text-xs leading-5 text-muted-foreground">
                  Optional. Analytics compares your results by each answer. Pick an answer again to clear it.
                </p>
              </div>
              <BehaviorFields
                value={draft.behavior}
                onChange={(change) => set({ behavior: { ...latest.current.draft.behavior, ...change } })}
              />
            </section>
          </fieldset>
          {(problem || !input.ok) && (
            <p role="alert" className="text-xs text-destructive">
              {problem ?? (input.ok ? null : input.message)}
            </p>
          )}
          <DialogFooter className="-mx-6 -mb-6 px-6 py-4">
            <Button type="submit" variant="outline" className="h-8 px-4">
              Done
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
