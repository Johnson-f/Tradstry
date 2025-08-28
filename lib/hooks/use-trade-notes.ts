import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { 
  tradeNotesService, 
  TradeNoteCreate, 
  TradeNoteUpdate, 
  TradeNoteInDB, 
  TradeNoteFilters,
  TradeNoteResponse 
} from '../services/trade-notes-service';

// Query keys
export const tradeNotesKeys = {
  all: ['trade-notes'] as const,
  lists: () => [...tradeNotesKeys.all, 'list'] as const,
  list: (filters?: TradeNoteFilters) => [...tradeNotesKeys.lists(), filters] as const,
  details: () => [...tradeNotesKeys.all, 'detail'] as const,
  detail: (id: number) => [...tradeNotesKeys.details(), id] as const,
  byTrade: (tradeId: number, tradeType: 'stock' | 'option') => 
    [...tradeNotesKeys.all, 'by-trade', tradeId, tradeType] as const,
  byPhase: (phase: 'planning' | 'execution' | 'reflection') => 
    [...tradeNotesKeys.all, 'by-phase', phase] as const,
  byRating: (rating: number) => 
    [...tradeNotesKeys.all, 'by-rating', rating] as const,
  byTags: (tags: string[]) => 
    [...tradeNotesKeys.all, 'by-tags', tags] as const,
};

// Hook to get all trade notes with optional filters
export function useTradeNotes(filters?: TradeNoteFilters) {
  return useQuery({
    queryKey: tradeNotesKeys.list(filters),
    queryFn: () => tradeNotesService.getTradeNotes(filters),
    staleTime: 5 * 60 * 1000, // 5 minutes
  });
}

// Hook to get trade notes for a specific trade
export function useTradeNotesByTrade(tradeId: number, tradeType: 'stock' | 'option') {
  return useQuery({
    queryKey: tradeNotesKeys.byTrade(tradeId, tradeType),
    queryFn: () => tradeNotesService.getTradeNotesByTradeId(tradeId, tradeType),
    staleTime: 5 * 60 * 1000,
  });
}

// Hook to get trade notes by phase
export function useTradeNotesByPhase(phase: 'planning' | 'execution' | 'reflection') {
  return useQuery({
    queryKey: tradeNotesKeys.byPhase(phase),
    queryFn: () => tradeNotesService.getTradeNotesByPhase(phase),
    staleTime: 5 * 60 * 1000,
  });
}

// Hook to get trade notes by rating
export function useTradeNotesByRating(rating: number) {
  return useQuery({
    queryKey: tradeNotesKeys.byRating(rating),
    queryFn: () => tradeNotesService.getTradeNotesByRating(rating),
    staleTime: 5 * 60 * 1000,
  });
}

// Hook to get trade notes by tags
export function useTradeNotesByTags(tags: string[]) {
  return useQuery({
    queryKey: tradeNotesKeys.byTags(tags),
    queryFn: () => tradeNotesService.getTradeNotesByTags(tags),
    staleTime: 5 * 60 * 1000,
    enabled: tags.length > 0,
  });
}

// Hook to create a trade note
export function useCreateTradeNote() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (note: TradeNoteCreate) => tradeNotesService.createTradeNote(note),
    onSuccess: (data: TradeNoteResponse, variables: TradeNoteCreate) => {
      // Invalidate and refetch trade notes queries
      queryClient.invalidateQueries({ queryKey: tradeNotesKeys.all });
      
      // Specifically invalidate queries for this trade
      queryClient.invalidateQueries({ 
        queryKey: tradeNotesKeys.byTrade(variables.trade_id, variables.trade_type) 
      });
      
      // Invalidate phase-specific queries if phase is provided
      if (variables.phase) {
        queryClient.invalidateQueries({ 
          queryKey: tradeNotesKeys.byPhase(variables.phase) 
        });
      }
      
      // Invalidate rating-specific queries if rating is provided
      if (variables.rating) {
        queryClient.invalidateQueries({ 
          queryKey: tradeNotesKeys.byRating(variables.rating) 
        });
      }
      
      // Invalidate tag-specific queries if tags are provided
      if (variables.tags && variables.tags.length > 0) {
        queryClient.invalidateQueries({ 
          queryKey: tradeNotesKeys.byTags(variables.tags) 
        });
      }
    },
  });
}

// Hook to update a trade note
export function useUpdateTradeNote() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ noteId, note }: { noteId: number; note: TradeNoteUpdate }) => 
      tradeNotesService.updateTradeNote(noteId, note),
    onSuccess: (data: TradeNoteResponse, variables) => {
      // Invalidate all trade notes queries
      queryClient.invalidateQueries({ queryKey: tradeNotesKeys.all });
    },
  });
}

// Hook to delete a trade note
export function useDeleteTradeNote() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (noteId: number) => tradeNotesService.deleteTradeNote(noteId),
    onSuccess: () => {
      // Invalidate all trade notes queries
      queryClient.invalidateQueries({ queryKey: tradeNotesKeys.all });
    },
  });
}

// Hook for optimistic updates when creating a note
export function useOptimisticCreateTradeNote() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (note: TradeNoteCreate) => tradeNotesService.createTradeNote(note),
    onMutate: async (newNote: TradeNoteCreate) => {
      // Cancel any outgoing refetches
      await queryClient.cancelQueries({ queryKey: tradeNotesKeys.all });

      // Snapshot the previous value
      const previousNotes = queryClient.getQueryData<TradeNoteInDB[]>(
        tradeNotesKeys.byTrade(newNote.trade_id, newNote.trade_type)
      );

      // Optimistically update to the new value
      const optimisticNote: TradeNoteInDB = {
        ...newNote,
        id: Date.now(), // Temporary ID
        user_id: 'temp-user-id',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      queryClient.setQueryData<TradeNoteInDB[]>(
        tradeNotesKeys.byTrade(newNote.trade_id, newNote.trade_type),
        (old) => [...(old || []), optimisticNote]
      );

      return { previousNotes };
    },
    onError: (err, newNote, context) => {
      // If the mutation fails, use the context returned from onMutate to roll back
      if (context?.previousNotes) {
        queryClient.setQueryData(
          tradeNotesKeys.byTrade(newNote.trade_id, newNote.trade_type),
          context.previousNotes
        );
      }
    },
    onSettled: (data, error, variables) => {
      // Always refetch after error or success
      queryClient.invalidateQueries({ 
        queryKey: tradeNotesKeys.byTrade(variables.trade_id, variables.trade_type) 
      });
    },
  });
}

// Composite hook for trade notes management (used by TradeNotesHistoryModal)
export function useTradeNotesManagement() {
  const queryClient = useQueryClient();
  
  const { data: notes = [], isLoading, error, refetch } = useTradeNotes();
  
  const updateMutation = useMutation({
    mutationFn: ({ noteId, note }: { noteId: number; note: TradeNoteUpdate }) => 
      tradeNotesService.updateTradeNote(noteId, note),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: tradeNotesKeys.all });
    },
  });
  
  const deleteMutation = useMutation({
    mutationFn: (noteId: number) => tradeNotesService.deleteTradeNote(noteId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: tradeNotesKeys.all });
    },
  });
  
  return {
    notes,
    isLoading,
    error,
    refetch,
    updateNote: (noteId: number, note: TradeNoteUpdate) => 
      updateMutation.mutateAsync({ noteId, note }),
    deleteNote: (noteId: number) => deleteMutation.mutateAsync(noteId),
    isUpdating: updateMutation.isPending,
    isDeleting: deleteMutation.isPending,
  };
}
