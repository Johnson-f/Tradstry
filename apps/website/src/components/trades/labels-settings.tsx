import {
  Archive,
  ArchiveRestore,
  ArrowDown,
  ArrowUp,
  Combine,
  CircleAlert,
  LoaderCircle,
  MoreHorizontal,
  MousePointer2,
  Pencil,
  Plus,
  Search,
  Tag,
  Target,
  Trash2,
  type LucideIcon,
} from 'lucide-react'
import { useId, useRef, useState } from 'react'
import { LabelDot } from '@/components/trades/label-picker'
import { ChoiceField } from '@/components/trades/trade-bits'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Skeleton } from '@/components/ui/skeleton'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  type JournalLabel,
  labelsOf,
  useArchiveLabel,
  useCreateLabel,
  useDeleteLabel,
  useJournalLabels,
  useMergeLabels,
  useUpdateLabel,
} from '@/lib/client/trades/labels'
import { LABEL_COLORS, type LabelKind, tradeErrorMessage } from '@/lib/client/trades/trades-model'

const KINDS: Array<{
  kind: LabelKind
  title: string
  singular: string
  description: string
  summary: string
  example: string
  examples: string[]
  icon: LucideIcon
}> = [
  {
    kind: 'EDGE',
    title: 'Edges',
    singular: 'edge',
    description: 'What gave the trade an advantage. Any number per trade.',
    example: 'Strong relative volume',
    summary: 'What gave the trade an advantage.',
    examples: ['Strong relative volume', 'Clean break of resistance', 'Sector strength'],
    icon: Target,
  },
  {
    kind: 'ENTRY_TACTIC',
    title: 'Entry tactics',
    singular: 'entry tactic',
    description: 'What triggered your entry. Any number per trade.',
    example: 'Breakout retest',
    summary: 'What triggered your entry.',
    examples: ['Breakout retest', 'Pullback to VWAP', 'Limit at support'],
    icon: MousePointer2,
  },
  {
    kind: 'TAG',
    title: 'Tags',
    singular: 'tag',
    description: 'Market context worth comparing, such as a catalyst or conditions. Any number per trade.',
    example: 'Earnings',
    summary: 'Market context you want to find and compare later.',
    examples: ['Earnings', 'Low float', 'Market open'],
    icon: Tag,
  },
  {
    kind: 'MISTAKE',
    title: 'Mistakes',
    singular: 'mistake',
    description: 'What went wrong in execution. Insights show what each one cost.',
    example: 'Chased the entry',
    summary: 'Habits you want to notice and improve.',
    examples: ['Chased the entry', 'Moved my stop', 'Oversized'],
    icon: CircleAlert,
  },
]

const menuClass = 'w-52 font-[Arial,Helvetica,sans-serif] data-open:animate-none data-closed:animate-none'
const dialogClass =
  'max-h-[calc(100dvh-2rem)] w-[calc(100vw-2rem)] overflow-y-auto font-[Arial,Helvetica,sans-serif] data-open:animate-none data-closed:animate-none'

export function JournalLabelsSettings({
  showHeading = true,
  layout = 'stacked',
}: {
  showHeading?: boolean
  layout?: 'stacked' | 'tabs'
}) {
  const labels = useJournalLabels()
  const [showArchived, setShowArchived] = useState(false)
  const archivedCount = (labels.data ?? []).filter((l) => l.archived).length

  if (layout === 'tabs') return <TabbedLabelsManager catalog={labels} />

  return (
    <section
      aria-labelledby={showHeading ? 'labels-heading' : undefined}
      aria-label={showHeading ? undefined : 'Journal labels'}
      className="space-y-5"
    >
      {(showHeading || archivedCount > 0) && (
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          {showHeading && (
            <div className="space-y-2">
              <h2 id="labels-heading" className="text-lg font-semibold tracking-tight">
                Journal labels
              </h2>
              <p className="max-w-110 text-sm leading-relaxed text-muted-foreground">
                Labels are shared by all your workspaces. Renaming one updates every trade that uses it.
              </p>
            </div>
          )}
          {archivedCount > 0 && (
            <label className="flex shrink-0 cursor-pointer items-center gap-2 text-sm text-muted-foreground">
              <Checkbox checked={showArchived} onCheckedChange={(checked) => setShowArchived(checked === true)} />
              Show archived ({archivedCount})
            </label>
          )}
        </div>
      )}

      {labels.isPending ? (
        <Card className="gap-0 py-0">
          <CardContent role="status" className="space-y-3 p-5">
            <span className="sr-only">Loading labels…</span>
            <Skeleton className="h-4 w-40" />
            <Skeleton className="h-4 w-56" />
          </CardContent>
        </Card>
      ) : labels.isError ? (
        <Card>
          <CardContent role="alert" className="space-y-3">
            <p className="text-sm text-muted-foreground">Couldn’t load your labels. Please try again.</p>
            <Button variant="outline" disabled={labels.isFetching} onClick={() => void labels.refetch()}>
              Try again
            </Button>
          </CardContent>
        </Card>
      ) : (
        KINDS.map((kind) => (
          <KindSection
            key={kind.kind}
            {...kind}
            labels={labelsOf(labels.data, kind.kind).filter((l) => showArchived || !l.archived)}
            active={labelsOf(labels.data, kind.kind).filter((l) => !l.archived)}
          />
        ))
      )}
    </section>
  )
}

function TabbedLabelsManager({ catalog }: { catalog: ReturnType<typeof useJournalLabels> }) {
  return (
    <Tabs defaultValue="EDGE" className="min-h-0 flex-1 gap-0">
      <div className="shrink-0 overflow-x-auto px-5 pb-1 sm:px-6">
        <TabsList aria-label="Label categories" className="w-full min-w-max">
          {KINDS.map(({ kind, title }) => (
            <TabsTrigger key={kind} value={kind} className="gap-2 px-3 text-[13px]">
              {title}
              {!catalog.isPending && !catalog.isError && (
                <span className="text-[11px] text-muted-foreground tabular-nums">
                  {labelsOf(catalog.data, kind).filter((label) => !label.archived).length}
                </span>
              )}
            </TabsTrigger>
          ))}
        </TabsList>
      </div>
      {KINDS.map((category) => (
        <TabsContent
          key={category.kind}
          value={category.kind}
          keepMounted
          className="flex min-h-0 flex-col"
        >
          <LabelCategoryPanel category={category} catalog={catalog} />
        </TabsContent>
      ))}
    </Tabs>
  )
}

function LabelCategoryPanel({
  category,
  catalog,
}: {
  category: (typeof KINDS)[number]
  catalog: ReturnType<typeof useJournalLabels>
}) {
  const { kind, title, singular, summary, examples, icon: Icon } = category
  const id = useId()
  const input = useRef<HTMLInputElement>(null)
  const create = useCreateLabel()
  const [name, setName] = useState('')
  const [search, setSearch] = useState('')
  const [showArchived, setShowArchived] = useState(false)
  const labels = labelsOf(catalog.data, kind)
  const active = labels.filter((label) => !label.archived)
  const archived = labels.length - active.length
  const visible = labels.filter(
    (label) =>
      (showArchived || !label.archived) && label.name.toLocaleLowerCase().includes(search.trim().toLocaleLowerCase()),
  )
  const unavailable = catalog.isPending || catalog.isError

  return (
    <>
      <ScrollArea className="min-h-0 flex-1 overflow-hidden [&>[data-slot=scroll-area-viewport]]:overscroll-contain">
        <div className="space-y-4 px-5 pt-5 pb-3 sm:px-6">
          <div>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-base font-semibold">{title}</h3>
              <span className="text-xs text-muted-foreground">Multiple per trade</span>
            </div>
            <p className="mt-1 text-[13px] leading-5 text-muted-foreground">{summary}</p>
          </div>
          {!unavailable && labels.length > 0 && (
            <div className="flex flex-wrap items-center gap-2">
              <div className="relative min-w-32 flex-1">
                <Search
                  className="pointer-events-none absolute top-2.5 left-3 size-3.5 text-muted-foreground"
                  aria-hidden
                />
                <Input
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  aria-label={`Search ${title.toLowerCase()}`}
                  placeholder={`Search ${title.toLowerCase()}…`}
                  className="h-9 border-border/60 pl-8 text-[13px]"
                />
              </div>
              {archived > 0 && (
                <Button
                  type="button"
                  variant={showArchived ? 'secondary' : 'ghost'}
                  size="sm"
                  className="h-9 gap-1.5 text-xs"
                  aria-pressed={showArchived}
                  onClick={() => setShowArchived(!showArchived)}
                >
                  <Archive className="size-3.5" aria-hidden />
                  {showArchived ? 'Hide archived' : 'Show archived'} ({archived})
                </Button>
              )}
            </div>
          )}
        </div>
        <div className="px-5 pt-1 pb-5 sm:px-6">
          {catalog.isPending ? (
            <div role="status" className="space-y-3 py-3">
              <span className="sr-only">Loading {title.toLowerCase()}…</span>
              {[0, 1, 2].map((row) => (
                <Skeleton key={row} className="h-12 rounded-lg" />
              ))}
            </div>
          ) : catalog.isError ? (
            <div className="flex min-h-48 flex-col items-center justify-center gap-3 text-center">
              <CircleAlert className="size-7 text-muted-foreground" strokeWidth={1.5} aria-hidden />
              <p role="alert" className="text-sm font-medium">
                Unable to load your labels
              </p>
              <Button variant="outline" size="sm" disabled={catalog.isFetching} onClick={() => void catalog.refetch()}>
                {catalog.isFetching ? 'Trying again…' : 'Try again'}
              </Button>
            </div>
          ) : visible.length > 0 ? (
            <ul
              aria-label={title}
              className="divide-y divide-border/60 overflow-hidden rounded-xl border border-border/60"
            >
              {visible.map((label) => (
                <LabelRow key={label.id} label={label} singular={singular} active={active} icon={Icon} />
              ))}
            </ul>
          ) : (
            <div className="flex min-h-52 flex-col items-center justify-center py-5 text-center">
              <div className="mb-4 flex size-12 items-center justify-center rounded-2xl border border-border/70 bg-muted/30">
                <Icon className="size-5 text-muted-foreground" strokeWidth={1.5} aria-hidden />
              </div>
              <h4 className="text-sm font-medium">
                {search.trim()
                  ? 'No matching labels'
                  : `No ${archived > 0 && !showArchived ? 'active ' : ''}${title.toLowerCase()} yet`}
              </h4>
              <p className="mt-1.5 max-w-72 text-[13px] leading-5 text-muted-foreground">
                {search.trim()
                  ? 'Try a different name, or clear your search.'
                  : archived > 0
                    ? 'Show archived labels to restore one, or add a new one below.'
                    : `Add your first ${singular} below, or start with an example.`}
              </p>
              {search.trim() ? (
                <Button type="button" variant="ghost" size="sm" className="mt-3" onClick={() => setSearch('')}>
                  Clear search
                </Button>
              ) : (
                archived === 0 && (
                  <div className="mt-4 flex flex-wrap justify-center gap-2">
                    {examples.map((example) => (
                      <Button
                        key={example}
                        type="button"
                        variant="outline"
                        size="sm"
                        className="h-7 rounded-full px-2.5 text-xs font-normal text-muted-foreground shadow-none"
                        onClick={() => {
                          setName(example)
                          create.reset()
                          input.current?.focus()
                        }}
                      >
                        {example}
                      </Button>
                    ))}
                  </div>
                )
              )}
            </div>
          )}
        </div>
      </ScrollArea>
      <form
        className="shrink-0 space-y-2 border-t border-border/60 px-5 py-4 sm:px-6"
        onSubmit={(event) => {
          event.preventDefault()
          if (!name.trim() || create.isPending || unavailable) return
          create.mutate(
            { kind, input: { name }, reuse: false },
            {
              onSuccess: () => {
                setName('')
                setSearch('')
              },
            },
          )
        }}
      >
        <div className="flex gap-2">
          <Label htmlFor={`${id}-new`} className="sr-only">
            New {singular}
          </Label>
          <Input
            ref={input}
            id={`${id}-new`}
            value={name}
            maxLength={60}
            placeholder={`Name your ${singular}…`}
            disabled={create.isPending || unavailable}
            onChange={(event) => {
              setName(event.target.value)
              if (create.isError) create.reset()
            }}
            className="h-9 min-w-0 flex-1 border-border/70 text-[13px]"
          />
          <Button
            type="submit"
            size="sm"
            className="h-9 gap-1.5 px-3"
            disabled={!name.trim() || create.isPending || unavailable}
          >
            {create.isPending ? (
              <LoaderCircle className="size-3.5 animate-spin motion-reduce:animate-none" aria-hidden />
            ) : (
              <Plus className="size-3.5" aria-hidden />
            )}
            Add {singular}
          </Button>
        </div>
        {create.isError && (
          <p role="alert" className="text-xs text-destructive">
            {tradeErrorMessage(create.error, `Could not add that ${singular}.`)}
          </p>
        )}
        <span role="status" className="sr-only">
          {create.isSuccess ? 'Label added.' : ''}
        </span>
      </form>
    </>
  )
}

function KindSection({
  kind,
  title,
  singular,
  description,
  example,
  labels,
  active,
}: (typeof KINDS)[number] & { labels: JournalLabel[]; active: JournalLabel[] }) {
  const id = useId()
  const create = useCreateLabel()
  const [name, setName] = useState('')

  return (
    <section aria-labelledby={`${id}-heading`} className="space-y-2">
      <div>
        <h3 id={`${id}-heading`} className="text-[13px] font-medium">
          {title}
        </h3>
        <p className="mt-0.5 text-[13px] text-muted-foreground">{description}</p>
      </div>
      <Card className="gap-0 py-0">
        <CardContent className="p-0">
          {labels.length > 0 && (
            <ul aria-label={title} className="divide-y divide-border/70 border-b border-border/70">
              {labels.map((label) => (
                <LabelRow key={label.id} label={label} singular={singular} active={active} />
              ))}
            </ul>
          )}
          <form
            className="flex gap-2 px-4 py-3 sm:px-5"
            onSubmit={(event) => {
              event.preventDefault()
              if (!name.trim() || create.isPending) return
              create.mutate({ kind, input: { name }, reuse: false }, { onSuccess: () => setName('') })
            }}
          >
            <Label htmlFor={`${id}-new`} className="sr-only">
              New {singular}
            </Label>
            <Input
              id={`${id}-new`}
              value={name}
              maxLength={60}
              placeholder={labels.length ? `New ${singular}` : example}
              disabled={create.isPending}
              onChange={(event) => {
                setName(event.target.value)
                if (create.isError) create.reset()
              }}
              className="h-8 min-w-0 flex-1"
            />
            <Button
              type="submit"
              variant="secondary"
              size="sm"
              className="h-8"
              disabled={!name.trim() || create.isPending}
            >
              {create.isPending ? <LoaderCircle className="animate-spin" aria-hidden /> : <Plus aria-hidden />}
              Add
            </Button>
          </form>
          {create.isError && (
            <p role="alert" className="px-5 pb-3 text-sm text-destructive">
              {tradeErrorMessage(create.error, `Could not add that ${singular}.`)}
            </p>
          )}
        </CardContent>
      </Card>
    </section>
  )
}

function LabelRow({
  label,
  singular,
  active,
  icon: Icon,
}: {
  label: JournalLabel
  singular: string
  active: JournalLabel[]
  icon?: LucideIcon
}) {
  const archive = useArchiveLabel()
  const update = useUpdateLabel()
  const [dialog, setDialog] = useState<'edit' | 'merge' | 'delete' | null>(null)
  const index = active.findIndex((l) => l.id === label.id)
  const move = (offset: number) => {
    const other = active[index + offset]
    if (!other) return
    const input = (l: JournalLabel, position: number) => ({
      name: l.name,
      description: l.description,
      color: l.color,
      position,
    })
    void Promise.all([
      update.mutateAsync({ id: label.id, input: input(label, other.position) }),
      update.mutateAsync({ id: other.id, input: input(other, label.position) }),
    ])
  }
  const error = archive.error ?? update.error

  return (
    <li className="px-4 py-3 sm:px-5">
      <div className="flex items-center gap-3">
        {Icon ? (
          <Icon className="size-4 shrink-0 text-muted-foreground" strokeWidth={1.5} aria-hidden />
        ) : (
          <LabelDot color={label.color} />
        )}
        <div className="min-w-0 flex-1">
          <p className="flex items-center gap-2 text-sm font-medium">
            <span className="truncate">{label.name}</span>
            {label.archived && (
              <Badge variant="outline" className="font-normal">
                Archived
              </Badge>
            )}
          </p>
          {label.description && <p className="mt-0.5 truncate text-xs text-muted-foreground">{label.description}</p>}
        </div>
        <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
          {label.tradeCount} {label.tradeCount === 1 ? 'trade' : 'trades'}
        </span>
        <DropdownMenu>
          <DropdownMenuTrigger
            aria-label={`Actions for ${label.name}`}
            render={<Button variant="ghost" size="icon-sm" />}
            className="shrink-0 text-muted-foreground"
          >
            <MoreHorizontal className="size-4" aria-hidden />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className={menuClass}>
            <DropdownMenuGroup>
              <DropdownMenuItem className="min-h-9 gap-2.5 px-2" onClick={() => setDialog('edit')}>
                <Pencil className="size-4" aria-hidden />
                Edit
              </DropdownMenuItem>
              {!label.archived && (
                <>
                  <DropdownMenuItem className="min-h-9 gap-2.5 px-2" disabled={index <= 0} onClick={() => move(-1)}>
                    <ArrowUp className="size-4" aria-hidden />
                    Move up
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    className="min-h-9 gap-2.5 px-2"
                    disabled={index < 0 || index >= active.length - 1}
                    onClick={() => move(1)}
                  >
                    <ArrowDown className="size-4" aria-hidden />
                    Move down
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    className="min-h-9 gap-2.5 px-2"
                    disabled={active.length < 2}
                    onClick={() => setDialog('merge')}
                  >
                    <Combine className="size-4" aria-hidden />
                    Merge into…
                  </DropdownMenuItem>
                </>
              )}
              <DropdownMenuItem
                className="min-h-9 gap-2.5 px-2"
                disabled={archive.isPending}
                onClick={() => archive.mutate({ id: label.id, archived: !label.archived })}
              >
                {label.archived ? (
                  <ArchiveRestore className="size-4" aria-hidden />
                ) : (
                  <Archive className="size-4" aria-hidden />
                )}
                {label.archived ? 'Unarchive' : 'Archive'}
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                variant="destructive"
                disabled={label.tradeCount > 0}
                className="min-h-9 gap-2.5 px-2"
                onClick={() => setDialog('delete')}
              >
                <Trash2 className="size-4" aria-hidden />
                <span>
                  Delete
                  {label.tradeCount > 0 && (
                    <span className="block text-xs font-normal">In use; archive or merge it instead</span>
                  )}
                </span>
              </DropdownMenuItem>
            </DropdownMenuGroup>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      {error && (
        <p role="alert" className="mt-2 text-sm text-destructive">
          {tradeErrorMessage(error, 'Could not change that label.')}
        </p>
      )}
      {dialog === 'edit' && <EditDialog label={label} onClose={() => setDialog(null)} />}
      {dialog === 'merge' && (
        <MergeDialog
          label={label}
          singular={singular}
          targets={active.filter((l) => l.id !== label.id)}
          onClose={() => setDialog(null)}
        />
      )}
      {dialog === 'delete' && <DeleteDialog label={label} onClose={() => setDialog(null)} />}
    </li>
  )
}

function EditDialog({ label, onClose }: { label: JournalLabel; onClose: () => void }) {
  const id = useId()
  const update = useUpdateLabel()
  const [name, setName] = useState(label.name)
  const [description, setDescription] = useState(label.description)
  const [color, setColor] = useState(label.color)

  return (
    <Dialog open onOpenChange={(open) => !open && !update.isPending && onClose()}>
      <DialogContent className={`${dialogClass} sm:max-w-md`}>
        <DialogHeader>
          <DialogTitle>Edit label</DialogTitle>
          <DialogDescription>Changes show on every trade with this label.</DialogDescription>
        </DialogHeader>
        <form
          className="space-y-4"
          onSubmit={(event) => {
            event.preventDefault()
            if (!name.trim() || update.isPending) return
            update.mutate(
              { id: label.id, input: { name, description, color, position: label.position } },
              { onSuccess: onClose },
            )
          }}
        >
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={`${id}-name`}>Name</Label>
            <Input
              id={`${id}-name`}
              value={name}
              maxLength={60}
              required
              onChange={(e) => setName(e.target.value)}
              className="h-9"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={`${id}-description`}>Description</Label>
            <textarea
              id={`${id}-description`}
              value={description}
              maxLength={2000}
              rows={3}
              placeholder="What it is and when it applies"
              onChange={(e) => setDescription(e.target.value)}
              className="w-full rounded-lg border border-input bg-transparent px-2.5 py-2 text-sm outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30"
            />
          </div>
          <fieldset className="space-y-2">
            <legend className="text-sm font-medium">Colour</legend>
            <div className="flex flex-wrap gap-2">
              {[null, ...LABEL_COLORS].map((swatch) => (
                <button
                  key={swatch ?? 'none'}
                  type="button"
                  aria-label={swatch ?? 'No colour'}
                  aria-pressed={color === swatch}
                  onClick={() => setColor(swatch)}
                  className="flex size-7 items-center justify-center rounded-full ring-offset-2 ring-offset-background outline-none focus-visible:ring-2 focus-visible:ring-ring aria-pressed:ring-2 aria-pressed:ring-foreground"
                >
                  <span
                    className="size-5 rounded-full border border-border bg-muted"
                    style={swatch ? { backgroundColor: swatch, borderColor: swatch } : undefined}
                  />
                </button>
              ))}
            </div>
          </fieldset>
          {update.isError && (
            <p role="alert" className="text-sm text-destructive">
              {tradeErrorMessage(update.error, 'Could not save the label.')}
            </p>
          )}
          <DialogFooter>
            <Button type="button" variant="outline" disabled={update.isPending} onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={!name.trim() || update.isPending}>
              {update.isPending && <LoaderCircle className="animate-spin" aria-hidden />}
              Save
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

function MergeDialog({
  label,
  singular,
  targets,
  onClose,
}: {
  label: JournalLabel
  singular: string
  targets: JournalLabel[]
  onClose: () => void
}) {
  const id = useId()
  const merge = useMergeLabels()
  const [into, setInto] = useState(targets[0]?.id ?? '')
  const target = targets.find((t) => t.id === into)

  return (
    <AlertDialog open onOpenChange={(open) => !open && !merge.isPending && onClose()}>
      <AlertDialogContent className={dialogClass}>
        <AlertDialogHeader>
          <AlertDialogTitle className="font-[Arial,Helvetica,sans-serif]">Merge “{label.name}”</AlertDialogTitle>
          <AlertDialogDescription className="leading-relaxed break-words">
            Every trade with “{label.name}” moves to the {singular} you choose, and “{label.name}” is deleted. This
            cannot be undone.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <ChoiceField
          id={`${id}-into`}
          label="Merge into"
          className="h-9 w-full bg-background text-sm"
          value={into}
          onChange={setInto}
          choices={targets.map((t) => ({ value: t.id, label: t.name }))}
        />
        {merge.isError && (
          <p role="alert" className="text-sm text-destructive">
            {tradeErrorMessage(merge.error, 'Could not merge those labels.')}
          </p>
        )}
        <AlertDialogFooter>
          <AlertDialogCancel disabled={merge.isPending}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            disabled={!target || merge.isPending}
            onClick={() => {
              if (target) merge.mutate({ fromId: label.id, intoId: target.id }, { onSuccess: onClose })
            }}
          >
            {merge.isPending && <LoaderCircle className="size-4 animate-spin" aria-hidden />}
            {target ? `Merge into “${target.name}”` : 'Merge'}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}

function DeleteDialog({ label, onClose }: { label: JournalLabel; onClose: () => void }) {
  const remove = useDeleteLabel()
  return (
    <AlertDialog open onOpenChange={(open) => !open && !remove.isPending && onClose()}>
      <AlertDialogContent className={dialogClass}>
        <AlertDialogHeader>
          <AlertDialogTitle className="font-[Arial,Helvetica,sans-serif]">Delete “{label.name}”?</AlertDialogTitle>
          <AlertDialogDescription>No trade uses it. This cannot be undone.</AlertDialogDescription>
        </AlertDialogHeader>
        {remove.isError && (
          <p role="alert" className="text-sm text-destructive">
            {tradeErrorMessage(remove.error, 'Could not delete the label.')}
          </p>
        )}
        <AlertDialogFooter>
          <AlertDialogCancel disabled={remove.isPending}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            variant="destructive"
            disabled={remove.isPending}
            onClick={() => remove.mutate(label.id, { onSuccess: onClose })}
          >
            {remove.isPending && <LoaderCircle className="size-4 animate-spin" aria-hidden />}
            Delete
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
