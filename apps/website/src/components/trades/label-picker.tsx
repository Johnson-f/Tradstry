import { Combobox } from '@base-ui/react/combobox'
import { Check, CircleAlert, MousePointer2, Plus, Tag, Target, X } from 'lucide-react'
import { useState } from 'react'
import { type JournalLabel, labelsOf, useCreateLabel, useJournalLabels } from '@/lib/client/trades/labels'
import { LABEL_KIND_NAMES, type LabelKind, type LabelRef, tradeErrorMessage } from '@/lib/client/trades/trades-model'

interface Option {
  id: string
  label: string
  color: string | null
  archived: boolean
  create?: boolean
}

const CREATE_ID = 'create'
const LABEL_ICONS = { EDGE: Target, ENTRY_TACTIC: MousePointer2, TAG: Tag, MISTAKE: CircleAlert }

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
  'flex min-h-10 w-full cursor-text flex-wrap items-center gap-1 rounded-lg border border-input bg-background px-2 py-1 text-sm transition-colors focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/50 has-disabled:opacity-60 dark:bg-input/30'
const inputClass =
  'h-7 min-w-16 flex-1 border-0 bg-transparent px-1 text-sm outline-none placeholder:text-muted-foreground'

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
    run: async (name: string) => {
      onError(null)
      try {
        return await create.mutateAsync({ kind, input: { name } })
      } catch (error) {
        onError(tradeErrorMessage(error, 'Could not create that label.'))
        return null
      }
    },
  }
}

/** Any number of labels of a kind; typing a new name offers to create it. */
export function LabelMultiSelect({
  value,
  onChange,
  ...props
}: PickerProps & { value: string[]; onChange: (ids: string[]) => void }) {
  const [query, setQuery] = useState('')
  const Icon = LABEL_ICONS[props.kind]
  const { items, byId } = useOptions(props.kind, props.chosen, query)
  const create = useCreate(props.kind, props.onError)
  const selected = value.map((id) => byId(id)).filter((option): option is Option => Boolean(option))

  return (
    <Combobox.Root<Option, true>
      multiple
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
              className="flex h-6 items-center gap-1.5 rounded-md bg-muted px-1.5 text-[13px] outline-none focus-within:ring-2 focus-within:ring-ring data-highlighted:ring-2 data-highlighted:ring-ring dark:bg-white/10"
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
            id={props.id}
            placeholder={selected.length ? '' : props.placeholder}
            className={inputClass}
          />
        </Combobox.Chips>
      </Combobox.InputGroup>
      <Options kind={props.kind} empty={`Type a name to create a ${LABEL_KIND_NAMES[props.kind].toLowerCase()}.`} />
    </Combobox.Root>
  )
}
