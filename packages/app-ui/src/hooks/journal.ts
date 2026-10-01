"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useGraphQL } from "@tradstry/app-ui/lib/client";
import * as journalService from "@tradstry/app-ui/lib/service/journal";
import type {
  CreateJournalEntryInput,
  JournalEntry,
  PublishBrokerageEpisodeReviewInput,
  UpdateJournalEntryInput,
} from "@tradstry/app-ui/lib/types/journal";
import { useAuth } from "@tradstry/app-ui/platform";
import { optimisticRemove, optimisticUpdate } from "./optimistic";

const JOURNAL_KEY = ["journal"] as const;

export function useJournalEntries() {
  const { isLoaded, isSignedIn } = useAuth();
  const fetcher = useGraphQL();

  return useQuery<JournalEntry[]>({
    queryKey: JOURNAL_KEY,
    queryFn: () => journalService.fetchJournalEntries(fetcher),
    enabled: isLoaded && isSignedIn,
  });
}

export function useJournalEntriesForWorkspace(workspaceId: string | null) {
  const { isLoaded, isSignedIn } = useAuth();
  const fetcher = useGraphQL();

  return useQuery<JournalEntry[]>({
    queryKey: [...JOURNAL_KEY, "workspace", workspaceId],
    queryFn: async () => {
      if (!workspaceId) {
        return [];
      }
      return journalService.fetchJournalEntries(fetcher, workspaceId);
    },
    enabled: isLoaded && isSignedIn,
  });
}

export function useJournalEntry(id: string | null) {
  const { isLoaded, isSignedIn } = useAuth();
  const fetcher = useGraphQL();

  return useQuery<JournalEntry | null>({
    queryKey: [...JOURNAL_KEY, id],
    queryFn: () => {
      if (!id) {
        throw new Error("journal entry id is required");
      }
      return journalService.fetchJournalEntry(fetcher, id);
    },
    enabled: isLoaded && isSignedIn && !!id,
  });
}

export function useCreateJournalEntry() {
  const fetcher = useGraphQL();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: CreateJournalEntryInput) =>
      journalService.createJournalEntry(fetcher, input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: JOURNAL_KEY });
    },
  });
}

export function usePublishBrokerageEpisodeReview() {
  const fetcher = useGraphQL();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: PublishBrokerageEpisodeReviewInput) =>
      journalService.publishBrokerageEpisodeReview(fetcher, input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: JOURNAL_KEY });
      queryClient.invalidateQueries({ queryKey: ["pending-trades"] });
      queryClient.invalidateQueries({ queryKey: ["linked-brokerage-tx-ids"] });
      queryClient.invalidateQueries({ queryKey: ["trade-review-inbox"] });
    },
  });
}

export function useUpdateJournalEntry() {
  const fetcher = useGraphQL();
  const queryClient = useQueryClient();

  type UpdateVars = { id: string; input: UpdateJournalEntryInput };
  // Merge the changed scalar fields for instant feedback; tags, violations and playbook
  // are relational and get their exact state from the background settle refetch.
  const optimistic = optimisticUpdate<UpdateVars, JournalEntry>(
    queryClient,
    JOURNAL_KEY,
    (vars) => vars.id,
    (entity, { input }) => ({ ...entity, ...input }) as JournalEntry,
  );

  return useMutation({
    mutationFn: ({ id, input }: UpdateVars) =>
      journalService.updateJournalEntry(fetcher, id, input),
    ...optimistic,
  });
}

export function useDeleteJournalEntry() {
  const fetcher = useGraphQL();
  const queryClient = useQueryClient();

  const optimistic = optimisticRemove<string>(
    queryClient,
    JOURNAL_KEY,
    (id) => id,
  );

  return useMutation({
    mutationFn: (id: string) => journalService.deleteJournalEntry(fetcher, id),
    ...optimistic,
  });
}
