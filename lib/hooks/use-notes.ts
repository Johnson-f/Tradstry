/**
 * React Query hooks for Notes API
 * Provides data fetching, caching, and mutation hooks for all notes operations
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { notesService } from '@/lib/services/notes-service';
import {
  // Folders
  Folder,
  GetFoldersParams,
  // Notes
  Note,
  NoteCreate,
  NoteUpdate,
  GetNotesParams,
  RestoreNoteRequest,
  // Tags
  Tag,
  TagNoteRequest,
  UntagNoteRequest,
  SearchTagsParams,
  // Templates
  Template,
  TemplateCreate,
  TemplateUpdate,
} from '@/lib/types/notes';

// ==================== QUERY KEYS ====================

export const notesKeys = {
  all: ['notes'] as const,
  folders: (params?: GetFoldersParams) => ['notes', 'folders', params ? JSON.stringify(params) : null] as const,
  folderBySlug: (slug: string) => ['notes', 'folders', 'slug', slug] as const,
  notes: (params?: GetNotesParams) => ['notes', 'list', params] as const,
  note: (id: string) => ['notes', 'detail', id] as const,
  favoriteNotes: () => ['notes', 'favorites'] as const,
  tags: () => ['notes', 'tags', 'all'] as const,
  tagSearch: (params: SearchTagsParams) => ['notes', 'tags', 'search', params] as const,
  notesByTag: (tagId: string) => ['notes', 'tags', tagId, 'notes'] as const,
  noteTags: (noteId: string) => ['notes', 'notes', noteId, 'tags'] as const,
  templates: () => ['notes', 'templates', 'all'] as const,
  template: (id: string) => ['notes', 'templates', id] as const,
  trash: () => ['notes', 'trash'] as const,
};

// ==================== FOLDER HOOKS ====================

/**
 * Hook to fetch folders with optional filtering
 */
export function useFolders(params?: GetFoldersParams) {
  return useQuery({
    queryKey: notesKeys.folders(params),
    queryFn: () => notesService.getFolders(params),
  });
}

/**
 * Hook to fetch a folder by slug
 */
export function useFolderBySlug(slug: string) {
  return useQuery({
    queryKey: notesKeys.folderBySlug(slug),
    queryFn: () => notesService.getFolderBySlug(slug),
    enabled: !!slug,
  });
}

// ==================== NOTE HOOKS ====================

/**
 * Hook to fetch notes with optional filtering
 */
export function useNotes(params?: GetNotesParams) {
  return useQuery({
    queryKey: notesKeys.notes(params),
    queryFn: () => notesService.getNotes(params),
  });
}

/**
 * Hook to fetch a single note by ID
 */
export function useNote(noteId: string) {
  return useQuery({
    queryKey: notesKeys.note(noteId),
    queryFn: () => notesService.getNote(noteId),
    enabled: !!noteId,
  });
}

/**
 * Hook to fetch favorite notes
 */
export function useFavorites() {
  return useQuery({
    queryKey: notesKeys.favoriteNotes(),
    queryFn: () => notesService.getFavoriteNotes(),
  });
}

/**
 * Hook to fetch trashed notes
 */
export function useTrash() {
  return useQuery({
    queryKey: notesKeys.trash(),
    queryFn: () => notesService.getTrash(),
  });
}

/**
 * Hook to create a new note
 */
export function useCreateNote() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (note: NoteCreate) => notesService.createNote(note),
    onSuccess: () => {
      // Invalidate notes list to refresh
      queryClient.invalidateQueries({ queryKey: notesKeys.all });
    },
  });
}

/**
 * Hook to update an existing note
 */
export function useUpdateNote() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ noteId, note }: { noteId: string; note: NoteUpdate }) =>
      notesService.updateNote(noteId, note),
    onSuccess: (_, { noteId }) => {
      // Invalidate specific note and notes list
      queryClient.invalidateQueries({ queryKey: notesKeys.note(noteId) });
      queryClient.invalidateQueries({ queryKey: notesKeys.all });
    },
  });
}

/**
 * Hook to delete a note (soft or permanent)
 */
export function useDeleteNote() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ noteId, permanent = false }: { noteId: string; permanent?: boolean }) =>
      notesService.deleteNote(noteId, permanent),
    onSuccess: () => {
      // Invalidate notes list
      queryClient.invalidateQueries({ queryKey: notesKeys.all });
    },
  });
}

/**
 * Hook to restore a note from trash
 */
export function useRestoreNote() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ folderId, noteId }: { folderId: string; noteId: string }) =>
      notesService.restoreNote(folderId, noteId),
    onSuccess: () => {
      // Invalidate notes list
      queryClient.invalidateQueries({ queryKey: notesKeys.all });
    },
  });
}

/**
 * Hook to move note to trash
 */
export function useMoveNoteToTrash() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (noteId: string) => notesService.moveNoteToTrash(noteId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: notesKeys.all });
    },
  });
}

/**
 * Hook to restore note from trash
 */
export function useRestoreNoteFromTrash() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ noteId, targetFolderId }: { noteId: string; targetFolderId?: string }) =>
      notesService.restoreNoteFromTrash(noteId, targetFolderId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: notesKeys.all });
    },
  });
}

/**
 * Hook to toggle note favorite status
 */
export function useToggleNoteFavorite() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (noteId: string) => notesService.toggleNoteFavorite(noteId),
    onSuccess: (_, noteId) => {
      // Invalidate specific note and favorites list
      queryClient.invalidateQueries({ queryKey: notesKeys.note(noteId) });
      queryClient.invalidateQueries({ queryKey: notesKeys.favoriteNotes() });
    },
  });
}

// ==================== TAG HOOKS ====================

/**
 * Hook to fetch all tags with counts
 */
export function useTagsWithCounts() {
  return useQuery({
    queryKey: notesKeys.tags(),
    queryFn: () => notesService.getTagsWithCounts(),
  });
}

/**
 * Hook to search tags
 */
export function useSearchTags(params: SearchTagsParams) {
  return useQuery({
    queryKey: notesKeys.tagSearch(params),
    queryFn: () => notesService.searchTags(params),
    enabled: !!params.search_term,
  });
}

/**
 * Hook to get notes by tag
 */
export function useNotesByTag(tagId: string) {
  return useQuery({
    queryKey: notesKeys.notesByTag(tagId),
    queryFn: () => notesService.getNotesByTag(tagId),
    enabled: !!tagId,
  });
}

/**
 * Hook to get tags for a note
 */
export function useNoteTags(noteId: string) {
  return useQuery({
    queryKey: notesKeys.noteTags(noteId),
    queryFn: () => notesService.getNoteTags(noteId),
    enabled: !!noteId,
  });
}

/**
 * Hook to rename a tag
 */
export function useRenameTag() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ tagId, newName }: { tagId: string; newName: string }) =>
      notesService.renameTag(tagId, newName),
    onSuccess: () => {
      // Invalidate tags list
      queryClient.invalidateQueries({ queryKey: notesKeys.tags() });
    },
  });
}

/**
 * Hook to add a tag to a note
 */
export function useTagNote() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (request: TagNoteRequest) => notesService.tagNote(request),
    onSuccess: (_, { note_id }) => {
      // Invalidate note tags and tags list
      queryClient.invalidateQueries({ queryKey: notesKeys.noteTags(note_id) });
      queryClient.invalidateQueries({ queryKey: notesKeys.tags() });
    },
  });
}

/**
 * Hook to remove a tag from a note
 */
export function useUntagNote() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (request: UntagNoteRequest) => notesService.untagNote(request),
    onSuccess: (_, { note_id, tag_id }) => {
      // Invalidate note tags and notes by tag
      queryClient.invalidateQueries({ queryKey: notesKeys.noteTags(note_id) });
      queryClient.invalidateQueries({ queryKey: notesKeys.notesByTag(tag_id) });
    },
  });
}

/**
 * Hook to get or create a tag
 */
export function useGetOrCreateTag() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (name: string) => notesService.getOrCreateTag(name),
    onSuccess: () => {
      // Invalidate tags list
      queryClient.invalidateQueries({ queryKey: notesKeys.tags() });
    },
  });
}

/**
 * Hook to delete a tag
 */
export function useDeleteTag() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (tagId: string) => notesService.deleteTag(tagId),
    onSuccess: () => {
      // Invalidate tags list
      queryClient.invalidateQueries({ queryKey: notesKeys.tags() });
    },
  });
}

// ==================== TEMPLATE HOOKS ====================

/**
 * Hook to fetch all templates
 */
export function useTemplates() {
  return useQuery({
    queryKey: notesKeys.templates(),
    queryFn: () => notesService.getTemplates(),
  });
}

/**
 * Hook to fetch a single template
 */
export function useTemplate(templateId: string) {
  return useQuery({
    queryKey: notesKeys.template(templateId),
    queryFn: () => notesService.getTemplate(templateId),
    enabled: !!templateId,
  });
}

/**
 * Hook to create a template
 */
export function useCreateTemplate() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (template: TemplateCreate) => notesService.createTemplate(template),
    onSuccess: () => {
      // Invalidate templates list
      queryClient.invalidateQueries({ queryKey: notesKeys.templates() });
    },
  });
}

/**
 * Hook to update a template
 */
export function useUpdateTemplate() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ templateId, template }: { templateId: string; template: TemplateUpdate }) =>
      notesService.updateTemplate(templateId, template),
    onSuccess: (_, { templateId }) => {
      // Invalidate specific template and templates list
      queryClient.invalidateQueries({ queryKey: notesKeys.template(templateId) });
      queryClient.invalidateQueries({ queryKey: notesKeys.templates() });
    },
  });
}

/**
 * Hook to delete a template
 */
export function useDeleteTemplate() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (templateId: string) => notesService.deleteTemplate(templateId),
    onSuccess: () => {
      // Invalidate templates list
      queryClient.invalidateQueries({ queryKey: notesKeys.templates() });
    },
  });
}

// ==================== ADMIN HOOKS ====================

/**
 * Hook to create a system folder (admin only)
 */
export function useCreateSystemFolder() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      folderName,
      folderSlug,
      folderDescription,
    }: {
      folderName: string;
      folderSlug: string;
      folderDescription?: string;
    }) => notesService.createSystemFolder(folderName, folderSlug, folderDescription),
    onSuccess: () => {
      // Invalidate folders list
      queryClient.invalidateQueries({ queryKey: notesKeys.folders() });
    },
  });
}

/**
 * Hook to create a system template (admin only)
 */
export function useCreateSystemTemplate() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      name,
      description,
      content,
    }: {
      name: string;
      description: string;
      content?: Record<string, any>;
    }) => notesService.createSystemTemplate(name, description, content),
    onSuccess: () => {
      // Invalidate templates list
      queryClient.invalidateQueries({ queryKey: notesKeys.templates() });
    },
  });
}
