import { Combobox } from '@base-ui/react/combobox'
import { Check, CircleAlert, LoaderCircle, MousePointer2, Plus, Tag, Target, X } from 'lucide-react'
import { useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { type JournalLabel, labelsOf, useCreateLabel, useJournalLabels } from '@/lib/client/trades/labels'
import { type LabelKind, type LabelRef, tradeErrorMessage } from '@/lib/client/trades/trades-model'

interface Option {
  id: string
  label: string
  color: string | null
  archived: boolean
  create?: boolean
}

const CREATE_ID = 'create'
const LABEL_ICONS = { EDGE: Target, ENTRY_TACTIC: MousePointer2, TAG: Tag, MISTAKE: CircleAlert }
const LABEL_NAMES = { EDGE: 'edge', ENTRY_TACTIC: 'entry tactic', TAG: 'tag', MISTAKE: 'mistake' }

const sameName = (a: string, b: string) =>
  a.trim().replace(/\s+/g, ' ').toLocaleLowerCase() === b.trim().replace(/\s+/g, ' ').toLocaleLowerCase()

/** Active labels of a kind, plus any archived ones already chosen, plus "Create …" for a new name. */
function useOptions(kind: LabelKind, chosen: LabelRef[], query: string) {
  const labels = useJournalLabels()
  const catalog: JournalLabel[] = labelsOf(labels.data, kind)
  const options: Option[] = catalog
    .filter((label) => !label.archived)
    .map((label) => ({ id: label.id, label: label.name, color: label.color, archived: false }))
  for (const label of chosen) {
    if (!options.some((option) => option.id === label.id))
      options.push({ id: label.id, label: label.name, color: label.color, archived: label.archived })
  }
  const byId = (id: string) => options.find((option) => option.id === id)
  const name = query.trim()
  const exists = options.some((option) => !option.archived && sameName(option.label, name))
  const items =
    name && !exists ? [...options, { id: CREATE_ID, label: name, color: null, archived: false, create: true }] : options
  return { items, byId, loading: labels.isPending }
}

export function LabelDot({ color }: { color: string | null }) {
  return (
    <span
      aria-hidden
      className="size-2 shrink-0 rounded-full bg-muted-foreground/40"
      style={color ? { backgroundColor: color } : undefined}
    />
  )
}

const groupClass =
  'flex min-h-9 w-full cursor-text flex-wrap items-center gap-1 rounded-lg border border-transparent bg-muted/60 px-2 py-1 text-sm focus-within:border-ring focus-within:bg-transparent focus-within:ring-3 focus-within:ring-ring/50 has-disabled:opacity-60 dark:bg-white/5'
const inputClass =
  'h-7 min-w-16 flex-1 border-0 bg-transparent p-0 text-sm outline-none placeholder:text-muted-foreground/70'

function Options({ empty, kind }: { empty: string; kind: LabelKind }) {
  const Icon = LABEL_ICONS[kind]

  return (
    <Combobox.Portal>
      <Combobox.Positioner className="isolate z-50 outline-none" sideOffset={4}>
        <Combobox.Popup className="max-h-[min(var(--available-height),18rem)] w-(--anchor-width) max-w-(--available-width) overflow-y-auto overscroll-contain rounded-lg bg-popover p-1 text-popover-foreground shadow-md ring-1 ring-foreground/10">
          <Combobox.Empty>
            <p className="px-2 py-2 text-[13px] text-muted-foreground">{empty}</p>
          </Combobox.Empty>
          <Combobox.List>
            {(option: Option) => (
              <Combobox.Item
                key={option.id}
                value={option}
                className="flex cursor-default items-center gap-2 rounded-md px-2 py-1.5 text-sm outline-none select-none data-highlighted:bg-accent data-highlighted:text-accent-foreground"
              >
                {option.create ? (
                  <>
                    <Plus className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />
                    <span className="min-w-0 truncate">Create “{option.label}”</span>
                  </>
                ) : (
                  <>
                    <Icon className="size-3.5 shrink-0 text-muted-foreground" strokeWidth={1.5} aria-hidden />
                    <span className="min-w-0 flex-1 truncate">{option.label}</span>
                    {option.archived && <span className="text-xs text-muted-foreground">Archived</span>}
                    <Combobox.ItemIndicator>
                      <Check className="size-3.5" aria-hidden />
                    </Combobox.ItemIndicator>
                  </>
                )}
              </Combobox.Item>
            )}
          </Combobox.List>
        </Combobox.Popup>
      </Combobox.Positioner>
    </Combobox.Portal>
  )
}

interface PickerProps {
  id: string
  kind: LabelKind
  chosen: LabelRef[]
  placeholder: string
  disabled?: boolean
  onError: (message: string | null) => void
}

function useCreate(kind: LabelKind, onError: PickerProps['onError']) {
  const create = useCreateLabel()
  return {
    pending: create.isPending,
    run: async (name: string, reportError = onError) => {
      reportError(null)
      try {
        return await create.mutateAsync({ kind, input: { name } })
      } catch (error) {
        reportError(tradeErrorMessage(error, 'Could not create that label.'))
        return null
      }
    },
  }
}

/** Any number of labels of a kind, created on the fly when new. */
export function LabelMultiSelect({
  value,
  onChange,
  ...props
}: PickerProps & { value: string[]; onChange: (ids: string[]) => void }) {
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const [creating, setCreating] = useState(false)
  const [name, setName] = useState('')
  const [newProblem, setNewProblem] = useState<string | null>(null)
  const pickerInput = useRef<HTMLInputElement>(null)
  const newInput = useRef<HTMLInputElement>(null)
  const Icon = LABEL_ICONS[props.kind]
  const singular = LABEL_NAMES[props.kind]
  const { items, byId } = useOptions(props.kind, props.chosen, query)
  const create = useCreate(props.kind, props.onError)
  const selected = value.map((id) => byId(id)).filter((option): option is Option => Boolean(option))

  const closeCreate = () => {
    setCreating(false)
    setName('')
    setNewProblem(null)
    requestAnimationFrame(() => pickerInput.current?.focus())
  }
  const addNew = async () => {
    const trimmed = name.trim()
    if (!trimmed || create.pending || props.disabled) return
    const id = await create.run(trimmed, setNewProblem)
    if (!id) return
    if (!value.includes(id)) onChange([...value, id])
    setQuery('')
    setOpen(false)
    closeCreate()
  }

  return (
    <div className="min-w-0 space-y-2">
      <div className="flex min-w-0 items-start gap-2">
        <div className="min-w-0 flex-1">
          <Combobox.Root<Option, true>
            multiple
            open={open}
            onOpenChange={setOpen}
            items={items}
            value={selected}
            inputValue={query}
            autoHighlight
            disabled={props.disabled || create.pending}
            itemToStringLabel={(option) => option.label}
            isItemEqualToValue={(a, b) => a.id === b.id}
            onInputValueChange={setQuery}
            onValueChange={async (next) => {
              const added = next.find((option) => option.create)
              setQuery('')
              if (added) {
                const id = await create.run(added.label)
                if (id && !value.includes(id)) onChange([...value, id])
                return
              }
              onChange(next.map((option) => option.id))
            }}
          >
            <Combobox.InputGroup className={groupClass}>
              <Combobox.Chips className="contents">
                {selected.map((option) => (
                  <Combobox.Chip
                    key={option.id}
                    aria-label={option.label}
                    className="flex h-6 items-center gap-1.5 rounded-md bg-background px-1.5 text-[13px] ring-1 ring-foreground/10 outline-none focus-within:ring-ring data-highlighted:ring-ring dark:bg-white/10"
                  >
                    <Icon className="size-3.5 shrink-0 text-muted-foreground" strokeWidth={1.5} aria-hidden />
                    {option.label}
                    <Combobox.ChipRemove
                      aria-label={`Remove ${option.label}`}
                      className="flex size-4 items-center justify-center rounded-sm text-muted-foreground hover:text-foreground"
                    >
                      <X className="size-3" aria-hidden />
                    </Combobox.ChipRemove>
                  </Combobox.Chip>
                ))}
                <Combobox.Input
                  ref={pickerInput}
                  id={props.id}
                  placeholder={selected.length ? '' : props.placeholder}
                  className={inputClass}
                />
              </Combobox.Chips>
            </Combobox.InputGroup>
            <Options kind={props.kind} empty="Type a name to create one." />
          </Combobox.Root>
        </div>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-9 gap-1 text-xs text-muted-foreground"
          aria-label={`New ${singular}`}
          aria-expanded={creating}
          aria-controls={creating ? `${props.id}-new-panel` : undefined}
          disabled={props.disabled || create.pending}
          onClick={() => {
            setOpen(false)
            if (creating) {
              closeCreate()
            } else {
              setName(query.trim())
              setNewProblem(null)
              setCreating(true)
              requestAnimationFrame(() => newInput.current?.focus())
            }
          }}
        >
          <Plus className="size-3.5" aria-hidden />
          New
        </Button>
      </div>
      {creating && (
        <div
          id={`${props.id}-new-panel`}
          role="group"
          aria-labelledby={`${props.id}-new-heading`}
          className="space-y-2 rounded-lg border border-border/70 bg-muted/20 p-3"
          onKeyDown={(event) => {
            if (event.key === 'Escape' && !event.nativeEvent.isComposing) {
              event.preventDefault()
              event.stopPropagation()
              if (!create.pending) closeCreate()
            }
          }}
        >
          <Label id={`${props.id}-new-heading`} htmlFor={`${props.id}-new-name`} className="text-xs font-medium">
            New {singular}
          </Label>
          <div className="flex items-center gap-2">
            <Input
              ref={newInput}
              id={`${props.id}-new-name`}
              value={name}
              maxLength={60}
              placeholder={`Name your ${singular}…`}
              disabled={props.disabled || create.pending}
              aria-invalid={Boolean(newProblem)}
              aria-describedby={newProblem ? `${props.id}-new-error` : undefined}
              onChange={(event) => {
                setName(event.target.value)
                setNewProblem(null)
              }}
              onKeyDown={(event) => {
                if (event.key === 'Enter' && !event.nativeEvent.isComposing) {
                  event.preventDefault()
                  event.stopPropagation()
                  void addNew()
                }
              }}
              className="h-8 min-w-0 flex-1 bg-background text-[13px]"
            />
            <Button
              type="button"
              size="sm"
              className="h-8"
              disabled={!name.trim() || props.disabled || create.pending}
              onClick={() => void addNew()}
            >
              {create.pending && (
                <LoaderCircle className="size-3.5 animate-spin motion-reduce:animate-none" aria-hidden />
              )}
              Add
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              aria-label={`Cancel new ${singular}`}
              disabled={create.pending}
              onClick={closeCreate}
            >
              <X className="size-3.5" aria-hidden />
            </Button>
          </div>
          {newProblem && (
            <p id={`${props.id}-new-error`} role="alert" className="text-xs text-destructive">
              {newProblem}
            </p>
          )}
        </div>
      )}
    </div>
  )
}
