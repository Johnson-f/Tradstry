import { Check, ListChecks, LoaderCircle, PencilLine, Shield, SlidersHorizontal, Tags } from 'lucide-react'
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
import { GraphQLRequestError } from '@/lib/client/api'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { PlanLink } from '@/components/plans/plan-link'
import { BehaviorFields } from '@/components/trades/behavior-fields'
import { FormField, MoneyInput } from '@/components/trades/instrument-fields'
import { LabelDot, LabelMultiSelect } from '@/components/trades/label-picker'
import { ManageLabelsDialog } from '@/components/trades/manage-labels-dialog'
import { TradeNoteEditor } from '@/components/trades/trade-note-editor'
import { noteDocumentError, noteKey, PENDING_IMAGE_MESSAGE } from '@/lib/client/trades/note-document'
import { useJournalLabels } from '@/lib/client/trades/labels'
import { type SuggestedStop, type TradeFill, useSaveAnnotation } from '@/lib/client/trades/trades'
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


const ORDER_TYPE: Record<string, string> = {
  stop: 'stop',
  stoplimit: 'stop-limit',
  trailingstop: 'trailing stop',
  stoploss: 'stop-loss',
}

function orderTypeLabel(type: string): string {
  return ORDER_TYPE[type.toLowerCase().replace(/[\s_-]/g, '')] ?? type.toLowerCase()
}

function DetailTab({
  value,
  disabled,
  children,
}: {
  value: string
  disabled: boolean
  children: React.ReactNode
}) {
  return (
    <TabsContent value={value} className="min-h-0">
      <ScrollArea className="h-full overflow-hidden [&>[data-slot=scroll-area-viewport]]:overscroll-contain">
        <fieldset disabled={disabled} className="min-w-0 space-y-4 px-5 py-5 sm:px-6">
          {children}
        </fieldset>
      </ScrollArea>
    </TabsContent>
  )
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
  fills: TradeFill[]
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
  fills,
  suggestedStop,
  context,
  onFlushChange,
  reloadAnnotation,
}: EditorProps) {
  const id = useId()
  const annotation: TradeAnnotation | null = trade.annotation
  const [detailsOpen, setDetailsOpen] = useState(false)
  const labelsTab = useRef<HTMLButtonElement>(null)
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
  const imageFlushRef = useRef<(() => Promise<boolean>) | null>(null)
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
          const documentError = noteDocumentError(current.draft.notes)
          if (current.conflict || (current.invalid && current.invalid !== PENDING_IMAGE_MESSAGE)) return false
          if (documentError === PENDING_IMAGE_MESSAGE) {
            if (!(await imageFlushRef.current?.()) || noteDocumentError(latest.current.draft.notes) === PENDING_IMAGE_MESSAGE) return false
            continue
          }
          if (documentError || !nextInput.ok) return false
          const sentKey = current.key
          setFailedKey(null)
          try {
            const result = await save.mutateAsync({ version: current.base.version, input: nextInput.input })
            const nextBase = { key: sentKey, version: result.version, savedAt: result.updatedAt }
            latest.current.base = nextBase
            setBase(nextBase)
          } catch (error) {
            // An unsaved image can be discarded while an older draft is in flight.
            if (error instanceof GraphQLRequestError && error.code === 'INVALID_NOTE_IMAGE' && sentKey !== latest.current.key) continue
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

  const validationError = invalid === PENDING_IMAGE_MESSAGE ? null : invalid
  const saveFeedback = (
    <>
      {(validationError || problem || save.error || remoteChanged) && (
        <div role="alert" className="mb-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-destructive">
          <span>
            {validationError ??
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
            {invalid === PENDING_IMAGE_MESSAGE ? 'Waiting for image upload…' : invalid || save.error ? 'Not saved' : 'Editing…'}
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
    </>
  )

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
              <TradeNoteEditor
                key={editorRevision}
                workspaceId={workspaceId}
                imageFlushRef={imageFlushRef}
                tradeId={trade.id}
                fills={fills}
                initialValue={initialNotes}
                disabled={reloading}
                onChange={(notes) => set({ notes })}
                onError={setEditorProblem}
              />
            </div>
          </fieldset>
        </ScrollArea>
        <footer className="shrink-0 border-t border-border/60 px-6 py-3">
          {saveFeedback}
        </footer>
      </div>
      <DialogContent
        initialFocus={labelsTab}
        overlayClassName="bg-black/25 data-open:animate-none data-closed:animate-none"
        className="@container/note-editor flex h-[min(38rem,calc(100dvh-2rem))] w-[calc(100%-2rem)] flex-col gap-0 overflow-hidden rounded-2xl p-0 font-sans shadow-xl sm:max-w-3xl data-open:animate-none data-closed:animate-none [&>[data-slot=dialog-close]]:top-4 [&>[data-slot=dialog-close]]:right-4"
      >
        <DialogHeader className="shrink-0 gap-1.5 px-5 pt-5 pb-3 pr-14 sm:px-6 sm:pr-14">
          <DialogTitle className="text-xl leading-7 font-semibold tracking-tight">Trade Detail</DialogTitle>
          <DialogDescription render={<div />} className="min-w-0">
            {context}
          </DialogDescription>
        </DialogHeader>
        <form
          className="flex min-h-0 flex-1 flex-col"
          onSubmit={(event) => {
            event.preventDefault()
            if (input.ok) {
              setDetailsOpen(false)
              void persist.current()
            }
          }}
        >
          <Tabs defaultValue="labels" className="min-h-0 flex-1 gap-0">
            <div className="shrink-0 border-b px-5 sm:px-6">
              <TabsList variant="line" aria-label="Trade detail sections" className="gap-2 p-0 group-data-horizontal/tabs:h-10">
                <TabsTrigger ref={labelsTab} value="labels" className="px-2.5 group-data-horizontal/tabs:after:-bottom-px">
                  <Tags aria-hidden /> Labels
                </TabsTrigger>
                <TabsTrigger value="risk" className="px-2.5 group-data-horizontal/tabs:after:-bottom-px">
                  <Shield aria-hidden /> Risk
                </TabsTrigger>
                <TabsTrigger value="review" className="px-2.5 group-data-horizontal/tabs:after:-bottom-px">
                  <ListChecks aria-hidden /> Review
                </TabsTrigger>
              </TabsList>
            </div>
            <DetailTab value="labels" disabled={reloading}>
              <div className="grid gap-x-5 gap-y-4 sm:grid-cols-2">
                <FormField id={`${id}-edge`} label="Edges">
                  <LabelMultiSelect
                    id={`${id}-edge`}
                    kind="EDGE"
                    value={draft.edgeIds}
                    chosen={chosen(saved.edgeIds)}
                    placeholder="Add an edge…"
                    onChange={(edgeIds) => set({ edgeIds })}
                    onError={setProblem}
                  />
                </FormField>
                <FormField id={`${id}-tactic`} label="Entry tactics">
                  <LabelMultiSelect
                    id={`${id}-tactic`}
                    kind="ENTRY_TACTIC"
                    value={draft.entryTacticIds}
                    chosen={chosen(saved.entryTacticIds)}
                    placeholder="Add an entry tactic…"
                    onChange={(entryTacticIds) => set({ entryTacticIds })}
                    onError={setProblem}
                  />
                </FormField>
                <FormField id={`${id}-tags`} label="Tags">
                  <LabelMultiSelect
                    id={`${id}-tags`}
                    kind="TAG"
                    value={draft.tagIds}
                    chosen={chosen(saved.tagIds)}
                    placeholder="Add a tag…"
                    onChange={(tagIds) => set({ tagIds })}
                    onError={setProblem}
                  />
                </FormField>
                <FormField id={`${id}-mistakes`} label="Mistakes">
                  <LabelMultiSelect
                    id={`${id}-mistakes`}
                    kind="MISTAKE"
                    value={draft.mistakeIds}
                    chosen={chosen(saved.mistakeIds)}
                    placeholder="Add a mistake…"
                    onChange={(mistakeIds) => set({ mistakeIds })}
                    onError={setProblem}
                  />
                </FormField>
              </div>
              <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 text-xs leading-5 text-muted-foreground">
                <span>Type to find or create a label.</span>
                <ManageLabelsDialog triggerStyle="link" />
              </div>
            </DetailTab>
            <DetailTab value="risk" disabled={reloading}>
              <div className="grid gap-4 sm:grid-cols-2">
                <FormField id={`${id}-stop`} label="Initial stop">
                  <MoneyInput
                    id={`${id}-stop`}
                    value={draft.initialStop}
                    placeholder="0.00"
                    aria-describedby={`${id}-risk-hint`}
                    onChange={(event) => set({ initialStop: event.target.value })}
                  />
                </FormField>
                <FormField id={`${id}-risk`} label="Planned risk">
                  <MoneyInput
                    id={`${id}-risk`}
                    value={draft.plannedRisk}
                    placeholder="Optional"
                    aria-describedby={`${id}-risk-hint`}
                    onChange={(event) => set({ plannedRisk: event.target.value })}
                  />
                </FormField>
              </div>
              <div id={`${id}-risk-hint`} className="space-y-1.5 text-xs leading-5 text-muted-foreground">
                {suggestedStop && draft.initialStop.trim() === '' && (
                  <p>
                    Your {orderTypeLabel(suggestedStop.orderType)} order on {formatDate(suggestedStop.placedAt)} put
                    the stop at <span className="text-foreground tabular-nums">{price(suggestedStop.price)}</span>.{' '}
                    <button
                      type="button"
                      className="font-medium text-foreground underline underline-offset-4"
                      onClick={() => set({ initialStop: suggestedStop.price })}
                    >
                      Use it
                    </button>
                  </p>
                )}
                <p>Planned risk overrides the amount calculated from your stop.</p>
              </div>
              <dl className="grid grid-cols-2 divide-x rounded-lg bg-muted/50 py-3">
                <div className="px-4">
                  <dt className="text-xs text-muted-foreground">Risk at entry</dt>
                  <dd className="mt-1 text-base font-semibold tabular-nums">{money(risk?.toString() ?? null)}</dd>
                </div>
                <div className="px-4">
                  <dt className="text-xs text-muted-foreground">R-multiple</dt>
                  <dd className="mt-1 text-base font-semibold tabular-nums">{rMultiple(r?.toString() ?? null)}</dd>
                </div>
              </dl>
            </DetailTab>
            <DetailTab value="review" disabled={reloading}>
              <BehaviorFields
                value={draft.behavior}
                onChange={(change) => set({ behavior: { ...latest.current.draft.behavior, ...change } })}
              />
              <p className="text-xs text-muted-foreground">Select an answer again to clear it.</p>
            </DetailTab>
          </Tabs>
          <DialogFooter className="m-0 shrink-0 flex-row items-center justify-between gap-3 rounded-b-2xl bg-muted/20 px-5 py-3 sm:justify-between sm:px-6">
            <div className="min-w-0">{saveFeedback}</div>
            <Button type="submit" className="shrink-0 px-5">
              Done
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
