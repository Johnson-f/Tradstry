import { apiClient } from "./api-client";
import { apiConfig } from "@/lib/config/api";
import type {
  Folder,
  FolderCreate,
  FolderUpdate,
  FoldersQuery,
  Note,
  NoteWithRelations,
  NoteCreate,
  NoteUpdate,
  NotesQuery,
  Tag,
  TagCreate,
  TagUpdate,
  TagsQuery,
  Template,
  TemplateCreate,
  TemplateUpdate,
  TemplatesQuery,
} from "@/lib/types/notes";

class NotesService {
  // Folder Methods
  async createFolder(folder: FolderCreate): Promise<Folder> {
    return apiClient.post<Folder>(apiConfig.endpoints.notes.folders.base, folder);
  }

  async getFolder(id: string): Promise<Folder> {
    return apiClient.get<Folder>(apiConfig.endpoints.notes.folders.byId(id));
  }

  async getFolderBySlug(slug: string): Promise<Folder> {
    return apiClient.get<Folder>(apiConfig.endpoints.notes.folders.bySlug(slug));
  }

  async listFolders(params?: FoldersQuery): Promise<Folder[]> {
    return apiClient.get<Folder[]>(apiConfig.endpoints.notes.folders.base, { params });
  }

  // Note Methods
  async createNote(note: NoteCreate): Promise<NoteWithRelations> {
    return apiClient.post<NoteWithRelations>(apiConfig.endpoints.notes.notes.base, note);
  }

  async getNote(id: string): Promise<NoteWithRelations> {
    return apiClient.get<NoteWithRelations>(apiConfig.endpoints.notes.notes.byId(id));
  }

  async updateNote(id: string, note: NoteUpdate): Promise<NoteWithRelations> {
    return apiClient.put<NoteWithRelations>(apiConfig.endpoints.notes.notes.byId(id), note);
  }

  async deleteNote(id: string, permanent: boolean = false): Promise<void> {
    return apiClient.delete(apiConfig.endpoints.notes.notes.byId(id), {
      params: { permanent },
    });
  }

  async toggleFavorite(id: string): Promise<boolean> {
    return apiClient.post<boolean>(apiConfig.endpoints.notes.notes.favorite(id));
  }

  async listNotes(params?: NotesQuery): Promise<NoteWithRelations[]> {
    return apiClient.get<NoteWithRelations[]>(apiConfig.endpoints.notes.notes.base, { params });
  }

  // Tag Methods
  async listTags(params?: TagsQuery): Promise<Tag[]> {
    return apiClient.get<Tag[]>(apiConfig.endpoints.notes.tags.base, { params });
  }

  async getNoteTags(noteId: string): Promise<Tag[]> {
    return apiClient.get<Tag[]>(apiConfig.endpoints.notes.tags.byNote(noteId));
  }

  async addNoteTags(noteId: string, tags: string[]): Promise<void> {
    return apiClient.post(apiConfig.endpoints.notes.tags.byNote(noteId), tags);
  }

  async removeNoteTag(noteId: string, tagName: string): Promise<void> {
    return apiClient.delete(apiConfig.endpoints.notes.tags.removeFromNote(noteId, tagName));
  }

  // Template Methods
  async createTemplate(template: TemplateCreate): Promise<Template> {
    return apiClient.post<Template>(apiConfig.endpoints.notes.templates.base, template);
  }

  async getTemplate(id: string): Promise<Template> {
    return apiClient.get<Template>(apiConfig.endpoints.notes.templates.byId(id));
  }

  async updateTemplate(id: string, template: TemplateUpdate): Promise<Template> {
    return apiClient.put<Template>(apiConfig.endpoints.notes.templates.byId(id), template);
  }

  async deleteTemplate(id: string): Promise<void> {
    return apiClient.delete(apiConfig.endpoints.notes.templates.byId(id));
  }

  async listTemplates(params?: TemplatesQuery): Promise<Template[]> {
    return apiClient.get<Template[]>(apiConfig.endpoints.notes.templates.base, { params });
  }

  // Utility Methods
  async searchNotes(query: string): Promise<NoteWithRelations[]> {
    return this.listNotes({ search: query });
  }

  async getArchivedNotes(): Promise<NoteWithRelations[]> {
    return this.listNotes({ is_archived: true });
  }

  async getPinnedNotes(): Promise<NoteWithRelations[]> {
    return this.listNotes({ is_pinned: true });
  }

  async getFavoriteNotes(): Promise<NoteWithRelations[]> {
    return this.listNotes({ is_favorite: true });
  }

  async getDeletedNotes(): Promise<NoteWithRelations[]> {
    return this.listNotes({ include_deleted: true, is_archived: false });
  }

  async getNotesByFolder(folderId: string): Promise<NoteWithRelations[]> {
    return this.listNotes({ folder_id: folderId });
  }

  async restoreNote(id: string): Promise<NoteWithRelations> {
    return this.updateNote(id, { is_deleted: false });
  }

  async archiveNote(id: string): Promise<NoteWithRelations> {
    return this.updateNote(id, { is_archived: true });
  }

  async unarchiveNote(id: string): Promise<NoteWithRelations> {
    return this.updateNote(id, { is_archived: false });
  }

  async pinNote(id: string): Promise<NoteWithRelations> {
    return this.updateNote(id, { is_pinned: true });
  }

  async unpinNote(id: string): Promise<NoteWithRelations> {
    return this.updateNote(id, { is_pinned: false });
  }
}

// Export singleton instance
export const notesService = new NotesService();
export default notesService;
