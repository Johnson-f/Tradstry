import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { notesService } from "@/lib/services/notes-service";
import type {
  Folder,
  FolderCreate,
  FoldersQuery,
  Note,
  NoteWithRelations,
  NoteCreate,
  NoteUpdate,
  NotesQuery,
  Tag,
  TagsQuery,
  Template,
  TemplateCreate,
  TemplateUpdate,
  TemplatesQuery,
} from "@/lib/types/notes";

// Query Keys
export const notesKeys = {
  all: ["notes"] as const,
  folders: {
    all: ["notes", "folders"] as const,
    list: (params?: FoldersQuery) => ["notes", "folders", "list", params] as const,
    detail: (id: string) => ["notes", "folders", "detail", id] as const,
    bySlug: (slug: string) => ["notes", "folders", "slug", slug] as const,
  },
  notes: {
    all: ["notes", "notes"] as const,
    list: (params?: NotesQuery) => ["notes", "notes", "list", params] as const,
    detail: (id: string) => ["notes", "notes", "detail", id] as const,
    byFolder: (folderId: string) => ["notes", "notes", "folder", folderId] as const,
    archived: ["notes", "notes", "archived"] as const,
    pinned: ["notes", "notes", "pinned"] as const,
    favorites: ["notes", "notes", "favorites"] as const,
    deleted: ["notes", "notes", "deleted"] as const,
  },
  tags: {
    all: ["notes", "tags"] as const,
    list: (params?: TagsQuery) => ["notes", "tags", "list", params] as const,
    byNote: (noteId: string) => ["notes", "tags", "note", noteId] as const,
  },
  templates: {
    all: ["notes", "templates"] as const,
    list: (params?: TemplatesQuery) => ["notes", "templates", "list", params] as const,
    detail: (id: string) => ["notes", "templates", "detail", id] as const,
  },
};

// Folder Hooks
export function useFolders(params?: FoldersQuery) {
  return useQuery({
    queryKey: notesKeys.folders.list(params),
    queryFn: () => notesService.listFolders(params),
  });
}

export function useFolder(id: string) {
  return useQuery({
    queryKey: notesKeys.folders.detail(id),
    queryFn: () => notesService.getFolder(id),
    enabled: !!id,
  });
}

export function useFolderBySlug(slug: string) {
  return useQuery({
    queryKey: notesKeys.folders.bySlug(slug),
    queryFn: () => notesService.getFolderBySlug(slug),
    enabled: !!slug,
  });
}

export function useCreateFolder() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: (folder: FolderCreate) => notesService.createFolder(folder),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: notesKeys.folders.all });
    },
  });
}

// Note Hooks
export function useNotes(params?: NotesQuery) {
  return useQuery({
    queryKey: notesKeys.notes.list(params),
    queryFn: () => notesService.listNotes(params),
  });
}

export function useNote(id: string) {
  return useQuery({
    queryKey: notesKeys.notes.detail(id),
    queryFn: () => notesService.getNote(id),
    enabled: !!id,
  });
}

export function useNotesByFolder(folderId: string) {
  return useQuery({
    queryKey: notesKeys.notes.byFolder(folderId),
    queryFn: () => notesService.getNotesByFolder(folderId),
    enabled: !!folderId,
  });
}

export function useArchivedNotes() {
  return useQuery({
    queryKey: notesKeys.notes.archived,
    queryFn: () => notesService.getArchivedNotes(),
  });
}

export function usePinnedNotes() {
  return useQuery({
    queryKey: notesKeys.notes.pinned,
    queryFn: () => notesService.getPinnedNotes(),
  });
}

export function useFavoriteNotes() {
  return useQuery({
    queryKey: notesKeys.notes.favorites,
    queryFn: () => notesService.getFavoriteNotes(),
  });
}

export function useDeletedNotes() {
  return useQuery({
    queryKey: notesKeys.notes.deleted,
    queryFn: () => notesService.getDeletedNotes(),
  });
}

export function useCreateNote() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: (note: NoteCreate) => notesService.createNote(note),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: notesKeys.notes.all });
      queryClient.setQueryData(notesKeys.notes.detail(data.id), data);
    },
  });
}

export function useUpdateNote() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: ({ id, note }: { id: string; note: NoteUpdate }) => 
      notesService.updateNote(id, note),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: notesKeys.notes.all });
      queryClient.setQueryData(notesKeys.notes.detail(data.id), data);
    },
  });
}

export function useDeleteNote() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: ({ id, permanent = false }: { id: string; permanent?: boolean }) => 
      notesService.deleteNote(id, permanent),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: notesKeys.notes.all });
      queryClient.removeQueries({ queryKey: notesKeys.notes.detail(variables.id) });
    },
  });
}

export function useToggleFavorite() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: (id: string) => notesService.toggleFavorite(id),
    onSuccess: (_, id) => {
      queryClient.invalidateQueries({ queryKey: notesKeys.notes.all });
      queryClient.invalidateQueries({ queryKey: notesKeys.notes.detail(id) });
    },
  });
}

export function useArchiveNote() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: (id: string) => notesService.archiveNote(id),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: notesKeys.notes.all });
      queryClient.setQueryData(notesKeys.notes.detail(data.id), data);
    },
  });
}

export function useUnarchiveNote() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: (id: string) => notesService.unarchiveNote(id),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: notesKeys.notes.all });
      queryClient.setQueryData(notesKeys.notes.detail(data.id), data);
    },
  });
}

export function usePinNote() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: (id: string) => notesService.pinNote(id),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: notesKeys.notes.all });
      queryClient.setQueryData(notesKeys.notes.detail(data.id), data);
    },
  });
}

export function useUnpinNote() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: (id: string) => notesService.unpinNote(id),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: notesKeys.notes.all });
      queryClient.setQueryData(notesKeys.notes.detail(data.id), data);
    },
  });
}

export function useRestoreNote() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: (id: string) => notesService.restoreNote(id),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: notesKeys.notes.all });
      queryClient.setQueryData(notesKeys.notes.detail(data.id), data);
    },
  });
}

// Tag Hooks
export function useTags(params?: TagsQuery) {
  return useQuery({
    queryKey: notesKeys.tags.list(params),
    queryFn: () => notesService.listTags(params),
  });
}

export function useNoteTags(noteId: string) {
  return useQuery({
    queryKey: notesKeys.tags.byNote(noteId),
    queryFn: () => notesService.getNoteTags(noteId),
    enabled: !!noteId,
  });
}

export function useAddNoteTags() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: ({ noteId, tags }: { noteId: string; tags: string[] }) => 
      notesService.addNoteTags(noteId, tags),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: notesKeys.tags.all });
      queryClient.invalidateQueries({ queryKey: notesKeys.tags.byNote(variables.noteId) });
      queryClient.invalidateQueries({ queryKey: notesKeys.notes.detail(variables.noteId) });
    },
  });
}

export function useRemoveNoteTag() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: ({ noteId, tagName }: { noteId: string; tagName: string }) => 
      notesService.removeNoteTag(noteId, tagName),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: notesKeys.tags.all });
      queryClient.invalidateQueries({ queryKey: notesKeys.tags.byNote(variables.noteId) });
      queryClient.invalidateQueries({ queryKey: notesKeys.notes.detail(variables.noteId) });
    },
  });
}

// Template Hooks
export function useTemplates(params?: TemplatesQuery) {
  return useQuery({
    queryKey: notesKeys.templates.list(params),
    queryFn: () => notesService.listTemplates(params),
  });
}

export function useTemplate(id: string) {
  return useQuery({
    queryKey: notesKeys.templates.detail(id),
    queryFn: () => notesService.getTemplate(id),
    enabled: !!id,
  });
}

export function useCreateTemplate() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: (template: TemplateCreate) => notesService.createTemplate(template),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: notesKeys.templates.all });
      queryClient.setQueryData(notesKeys.templates.detail(data.id), data);
    },
  });
}

export function useUpdateTemplate() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: ({ id, template }: { id: string; template: TemplateUpdate }) => 
      notesService.updateTemplate(id, template),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: notesKeys.templates.all });
      queryClient.setQueryData(notesKeys.templates.detail(data.id), data);
    },
  });
}

export function useDeleteTemplate() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: (id: string) => notesService.deleteTemplate(id),
    onSuccess: (_, id) => {
      queryClient.invalidateQueries({ queryKey: notesKeys.templates.all });
      queryClient.removeQueries({ queryKey: notesKeys.templates.detail(id) });
    },
  });
}

// Search Hook
export function useSearchNotes(query: string, enabled: boolean = true) {
  return useQuery({
    queryKey: ["notes", "search", query] as const,
    queryFn: () => notesService.searchNotes(query),
    enabled: enabled && !!query,
  });
}
