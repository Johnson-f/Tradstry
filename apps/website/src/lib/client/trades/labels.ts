import { useMutation, useQuery } from '@tanstack/react-query'
import { GraphQLRequestError } from '@/lib/client/api'
import { graphql } from '@/lib/client/backend'
import type { LabelKind } from './trades-model'
import { TRADES_KEY, useInvalidateTrades } from './trades'

export interface JournalLabel {
  id: string
  kind: LabelKind
  name: string
  description: string
  color: string | null
  position: number
  archived: boolean
  tradeCount: number
}

export interface LabelInput {
  name: string
  description?: string
  color?: string | null
  position?: number | null
}

const LABEL_FIELDS = 'id kind name description color position archived tradeCount'

/** The user's whole catalog, archived labels included; filter by kind on the client. */
export function useJournalLabels() {
  return useQuery({
    queryKey: [...TRADES_KEY, 'labels'],
    queryFn: () =>
      graphql<{ journalLabels: JournalLabel[] }>(
        `query JournalLabels { journalLabels(includeArchived: true) { ${LABEL_FIELDS} } }`,
      ),
    select: (data) => data.journalLabels,
    staleTime: 30_000,
  })
}

export function labelsOf(labels: JournalLabel[] | undefined, kind: LabelKind): JournalLabel[] {
  return (labels ?? []).filter((label) => label.kind === kind)
}

/** Labels refetch before the mutation settles, so a new ID is already in the catalog. */
function useLabelMutation<Variables, Result>(run: (variables: Variables) => Promise<Result>) {
  const invalidate = useInvalidateTrades()
  return useMutation({ mutationFn: run, onSuccess: () => invalidate() })
}

/** Creates the label, or (with `reuse`) returns the active one that already has the name. */
export async function createLabel(kind: LabelKind, input: LabelInput, reuse: boolean): Promise<string> {
  try {
    const data = await graphql<{ createJournalLabel: { id: string } }>(
      'mutation CreateLabel($kind: JournalLabelKind!, $input: JournalLabelInput!) { createJournalLabel(kind: $kind, input: $input) { id } }',
      { kind, input },
    )
    return data.createJournalLabel.id
  } catch (error) {
    const existing = error instanceof GraphQLRequestError ? error.extensions.existingId : undefined
    if (reuse && typeof existing === 'string') return existing
    throw error
  }
}

export function useCreateLabel() {
  return useLabelMutation(({ kind, input, reuse = true }: { kind: LabelKind; input: LabelInput; reuse?: boolean }) =>
    createLabel(kind, input, reuse),
  )
}

export function useUpdateLabel() {
  return useLabelMutation(({ id, input }: { id: string; input: LabelInput }) =>
    graphql(
      `mutation UpdateLabel($id: ID!, $input: JournalLabelInput!) { updateJournalLabel(id: $id, input: $input) { id } }`,
      { id, input },
    ),
  )
}

export function useArchiveLabel() {
  return useLabelMutation(({ id, archived }: { id: string; archived: boolean }) =>
    archived
      ? graphql('mutation ArchiveLabel($id: ID!) { archiveJournalLabel(id: $id) { id } }', { id })
      : graphql('mutation UnarchiveLabel($id: ID!) { unarchiveJournalLabel(id: $id) { id } }', { id }),
  )
}

export function useMergeLabels() {
  return useLabelMutation(({ fromId, intoId }: { fromId: string; intoId: string }) =>
    graphql('mutation MergeLabels($from: ID!, $into: ID!) { mergeJournalLabels(fromId: $from, intoId: $into) { id } }', {
      from: fromId,
      into: intoId,
    }),
  )
}

export function useDeleteLabel() {
  return useLabelMutation((id: string) =>
    graphql('mutation DeleteLabel($id: ID!) { deleteJournalLabel(id: $id) }', { id }),
  )
}
