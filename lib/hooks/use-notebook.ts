"use client";

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { notebookService } from '@/lib/services/notebook-service';
import type {
  NotebookNote,
  CreateNoteRequest,
  UpdateNoteRequest,
  NotebookTag,
  CreateTagRequest,
  UpdateTagRequest,
  NotebookTemplate,
  CreateTemplateRequest,
  UpdateTemplateRequest,
  NotebookReminder,
  CreateReminderRequest,
  UpdateReminderRequest,
  CalendarEvent,
} from '@/lib/types/notebook';

// Notes
export function useNotes(parentId?: string) {
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['notebook', 'notes', parentId ?? 'root'],
    queryFn: () => notebookService.listNotes(parentId),
  });
  return { notes: data?.data ?? [], isLoading, error: error as Error | null, refetch };
}

export function useNote(noteId: string) {
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['notebook', 'note', noteId],
    queryFn: () => notebookService.getNote(noteId),
    enabled: !!noteId,
  });
  return { note: data?.data ?? null, isLoading, error: error as Error | null, refetch };
}

export function useNoteTree(noteId: string) {
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['notebook', 'note-tree', noteId],
    queryFn: () => notebookService.getNoteTree(noteId),
    enabled: !!noteId,
  });
  return { tree: data?.data ?? null, isLoading, error: error as Error | null, refetch };
}

export function useCreateNote() {
  const queryClient = useQueryClient();
  const mutation = useMutation({
    mutationFn: (payload: CreateNoteRequest) => notebookService.createNote(payload),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['notebook', 'notes', variables.parent_id ?? 'root'] });
    },
  });
  return { createNote: mutation.mutateAsync, isLoading: mutation.isPending, error: mutation.error as Error | null };
}

export function useUpdateNote() {
  const queryClient = useQueryClient();
  const mutation = useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: UpdateNoteRequest }) => notebookService.updateNote(id, payload),
    onSuccess: (res) => {
      const note = res.data as NotebookNote | null;
      if (note) {
        queryClient.invalidateQueries({ queryKey: ['notebook', 'note', note.id] });
        queryClient.invalidateQueries({ queryKey: ['notebook', 'notes', note.parent_id ?? 'root'] });
      }
    },
  });
  return { updateNote: mutation.mutateAsync, isLoading: mutation.isPending, error: mutation.error as Error | null };
}

export function useDeleteNote() {
  const queryClient = useQueryClient();
  const mutation = useMutation({
    mutationFn: ({ id }: { id: string }) => notebookService.deleteNote(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notebook', 'notes'] });
    },
  });
  return { deleteNote: mutation.mutateAsync, isLoading: mutation.isPending, error: mutation.error as Error | null };
}

export function useReorderNote() {
  const queryClient = useQueryClient();
  const mutation = useMutation({
    mutationFn: ({ id, position }: { id: string; position: number }) => notebookService.reorderNote(id, position),
    onSuccess: (res) => {
      const note = res.data as NotebookNote | null;
      if (note) {
        queryClient.invalidateQueries({ queryKey: ['notebook', 'notes', note.parent_id ?? 'root'] });
      }
    },
  });
  return { reorderNote: mutation.mutateAsync, isLoading: mutation.isPending, error: mutation.error as Error | null };
}

export function useTagNote() {
  const queryClient = useQueryClient();
  const mutation = useMutation({
    mutationFn: ({ noteId, tagId }: { noteId: string; tagId: string }) => notebookService.tagNote(noteId, tagId),
    onSuccess: (_, vars) => {
      queryClient.invalidateQueries({ queryKey: ['notebook', 'note', vars.noteId] });
    },
  });
  return { tagNote: mutation.mutateAsync, isLoading: mutation.isPending, error: mutation.error as Error | null };
}

export function useUntagNote() {
  const queryClient = useQueryClient();
  const mutation = useMutation({
    mutationFn: ({ noteId, tagId }: { noteId: string; tagId: string }) => notebookService.untagNote(noteId, tagId),
    onSuccess: (_, vars) => {
      queryClient.invalidateQueries({ queryKey: ['notebook', 'note', vars.noteId] });
    },
  });
  return { untagNote: mutation.mutateAsync, isLoading: mutation.isPending, error: mutation.error as Error | null };
}

// Tags
export function useTags() {
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['notebook', 'tags'],
    queryFn: () => notebookService.listTags(),
  });
  return { tags: data?.data ?? [], isLoading, error: error as Error | null, refetch };
}

export function useCreateTag() {
  const queryClient = useQueryClient();
  const mutation = useMutation({
    mutationFn: (payload: CreateTagRequest) => notebookService.createTag(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notebook', 'tags'] });
    },
  });
  return { createTag: mutation.mutateAsync, isLoading: mutation.isPending, error: mutation.error as Error | null };
}

export function useUpdateTag() {
  const queryClient = useQueryClient();
  const mutation = useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: UpdateTagRequest }) => notebookService.updateTag(id, payload),
    onSuccess: (_, vars) => {
      queryClient.invalidateQueries({ queryKey: ['notebook', 'tags'] });
      queryClient.invalidateQueries({ queryKey: ['notebook', 'tag', vars.id] });
    },
  });
  return { updateTag: mutation.mutateAsync, isLoading: mutation.isPending, error: mutation.error as Error | null };
}

export function useDeleteTag() {
  const queryClient = useQueryClient();
  const mutation = useMutation({
    mutationFn: (id: string) => notebookService.deleteTag(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notebook', 'tags'] });
    },
  });
  return { deleteTag: mutation.mutateAsync, isLoading: mutation.isPending, error: mutation.error as Error | null };
}

// Templates
export function useTemplates() {
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['notebook', 'templates'],
    queryFn: () => notebookService.listTemplates(),
  });
  return { templates: data?.data ?? [], isLoading, error: error as Error | null, refetch };
}

export function useCreateTemplate() {
  const queryClient = useQueryClient();
  const mutation = useMutation({
    mutationFn: (payload: CreateTemplateRequest) => notebookService.createTemplate(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notebook', 'templates'] });
    },
  });
  return { createTemplate: mutation.mutateAsync, isLoading: mutation.isPending, error: mutation.error as Error | null };
}

export function useUpdateTemplate() {
  const queryClient = useQueryClient();
  const mutation = useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: UpdateTemplateRequest }) => notebookService.updateTemplate(id, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notebook', 'templates'] });
    },
  });
  return { updateTemplate: mutation.mutateAsync, isLoading: mutation.isPending, error: mutation.error as Error | null };
}

export function useDeleteTemplate() {
  const queryClient = useQueryClient();
  const mutation = useMutation({
    mutationFn: (id: string) => notebookService.deleteTemplate(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notebook', 'templates'] });
    },
  });
  return { deleteTemplate: mutation.mutateAsync, isLoading: mutation.isPending, error: mutation.error as Error | null };
}

// Reminders
export function useReminders() {
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['notebook', 'reminders'],
    queryFn: () => notebookService.listReminders(),
  });
  return { reminders: data?.data ?? [], isLoading, error: error as Error | null, refetch };
}

export function useCreateReminder() {
  const queryClient = useQueryClient();
  const mutation = useMutation({
    mutationFn: (payload: CreateReminderRequest) => notebookService.createReminder(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notebook', 'reminders'] });
      queryClient.invalidateQueries({ queryKey: ['notebook', 'calendar', 'events'] });
    },
  });
  return { createReminder: mutation.mutateAsync, isLoading: mutation.isPending, error: mutation.error as Error | null };
}

export function useUpdateReminder() {
  const queryClient = useQueryClient();
  const mutation = useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: UpdateReminderRequest }) => notebookService.updateReminder(id, payload),
    onSuccess: (_, vars) => {
      queryClient.invalidateQueries({ queryKey: ['notebook', 'reminders'] });
      queryClient.invalidateQueries({ queryKey: ['notebook', 'reminder', vars.id] });
      queryClient.invalidateQueries({ queryKey: ['notebook', 'calendar', 'events'] });
    },
  });
  return { updateReminder: mutation.mutateAsync, isLoading: mutation.isPending, error: mutation.error as Error | null };
}

export function useDeleteReminder() {
  const queryClient = useQueryClient();
  const mutation = useMutation({
    mutationFn: (id: string) => notebookService.deleteReminder(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notebook', 'reminders'] });
      queryClient.invalidateQueries({ queryKey: ['notebook', 'calendar', 'events'] });
    },
  });
  return { deleteReminder: mutation.mutateAsync, isLoading: mutation.isPending, error: mutation.error as Error | null };
}

export function useCompleteReminder() {
  const queryClient = useQueryClient();
  const mutation = useMutation({
    mutationFn: (id: string) => notebookService.completeReminder(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notebook', 'reminders'] });
      queryClient.invalidateQueries({ queryKey: ['notebook', 'calendar', 'events'] });
    },
  });
  return { completeReminder: mutation.mutateAsync, isLoading: mutation.isPending, error: mutation.error as Error | null };
}

// Calendar
export function useCalendarEvents() {
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['notebook', 'calendar', 'events'],
    queryFn: () => notebookService.listCalendarEvents(),
  });
  return { events: data?.data ?? [], isLoading, error: error as Error | null, refetch };
}

export function useConnectCalendar() {
  const queryClient = useQueryClient();
  const mutation = useMutation({
    mutationFn: ({ provider, payload }: { provider: 'google' | 'microsoft'; payload: { access_token: string; refresh_token: string; token_expiry: string; calendar_id?: string } }) =>
      notebookService.connectCalendar(provider, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notebook', 'calendar', 'events'] });
    },
  });
  return { connectCalendar: mutation.mutateAsync, isLoading: mutation.isPending, error: mutation.error as Error | null };
}

export function useDisconnectCalendar() {
  const queryClient = useQueryClient();
  const mutation = useMutation({
    mutationFn: (connectionId: string) => notebookService.disconnectCalendar(connectionId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notebook', 'calendar', 'events'] });
    },
  });
  return { disconnectCalendar: mutation.mutateAsync, isLoading: mutation.isPending, error: mutation.error as Error | null };
}

export function useSyncCalendar() {
  const queryClient = useQueryClient();
  const mutation = useMutation({
    mutationFn: (connectionId: string) => notebookService.syncCalendar(connectionId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notebook', 'calendar', 'events'] });
    },
  });
  return { syncCalendar: mutation.mutateAsync, isLoading: mutation.isPending, error: mutation.error as Error | null };
}
