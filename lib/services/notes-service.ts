/**
 * Notes Service - Frontend API integration for Notes endpoints
 * Connects to backend routes defined in backend/routers/notes.py
 */

import apiClient from './api-client';
import {
  // Folders
  Folder,
  FolderCreate,
  FolderUpdate,
  GetFoldersParams,
  // Notes
  Note,
  NoteCreate,
  NoteUpdate,
  NoteUpsertResponse,
  GetNotesParams,
  DeleteResponse,
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
  // Response types
  ApiSuccessResponse,
  CreateResponse,
  ToggleFavoriteResponse,
} from '@/lib/types/notes';

class NotesService {
  // ==================== FOLDERS ====================

  /**
   * Get folders with optional filtering and sorting
   * @route GET /api/notes/folders
   * @param params - Query parameters for filtering and sorting
   * @returns List of folders
   */
  async getFolders(params?: GetFoldersParams): Promise<Folder[]> {
    return apiClient.get<Folder[]>('/notes/folders', { params });
  }

  /**
   * Get a folder by its slug
   * @route GET /api/notes/folders/slug/{folder_slug}
   * @param folderSlug - The unique slug of the folder
   * @returns The folder matching the slug
   */
  async getFolderBySlug(folderSlug: string): Promise<Folder> {
    return apiClient.get<Folder>(`/notes/folders/slug/${folderSlug}`);
  }

  // ==================== NOTES ====================

  /**
   * Create a new note
   * @route POST /api/notes/
   * @param note - The note data to create
   * @returns Response with note_id and was_created flag
   */
  async createNote(note: NoteCreate): Promise<NoteUpsertResponse> {
    return apiClient.post<NoteUpsertResponse>('/notes/', note);
  }

  /**
   * Update an existing note
   * @route PUT /api/notes/{note_id}
   * @param noteId - The ID of the note to update
   * @param note - The partial note data to update
   * @returns Response with note_id and was_created flag
   */
  async updateNote(noteId: string, note: NoteUpdate): Promise<NoteUpsertResponse> {
    return apiClient.put<NoteUpsertResponse>(`/notes/${noteId}`, note);
  }

  /**
   * Get notes with optional filtering and sorting
   * @route GET /api/notes/
   * @param params - Query parameters for filtering and sorting
   * @returns List of notes matching the criteria
   */
  async getNotes(params?: GetNotesParams): Promise<Note[]> {
    return apiClient.get<Note[]>('/notes/', { params });
  }

  /**
   * Get a specific note by ID
   * @route GET /api/notes/{note_id}
   * @param noteId - The ID of the note to retrieve
   * @returns The note with the specified ID
   */
  async getNote(noteId: string): Promise<Note> {
    return apiClient.get<Note>(`/notes/${noteId}`);
  }

  /**
   * Delete a note (soft delete by default, permanent if specified)
   * @route DELETE /api/notes/{note_id}
   * @param noteId - The ID of the note to delete
   * @param permanent - If true, permanently delete the note (only works if note is in trash)
   * @returns Response indicating success or failure
   */
  async deleteNote(noteId: string, permanent: boolean = false): Promise<DeleteResponse> {
    return apiClient.delete<DeleteResponse>(`/notes/${noteId}`, {
      params: { permanent },
    });
  }

  /**
   * Restore a note from trash
   * @route POST /api/notes/folders/{folder_id}/restore
   * @param folderId - The target folder ID
   * @param noteId - The ID of the note to restore
   * @returns Response indicating success or failure
   */
  async restoreNote(folderId: string, noteId: string): Promise<DeleteResponse> {
    const request: RestoreNoteRequest = { note_id: noteId };
    return apiClient.post<DeleteResponse>(`/notes/folders/${folderId}/restore`, request);
  }

  // ==================== TAGS ====================

  /**
   * Get all tags with note counts
   * @route GET /api/notes/tags/all
   * @returns List of all tags with their note counts
   */
  async getTagsWithCounts(): Promise<Tag[]> {
    return apiClient.get<Tag[]>('/notes/tags/all');
  }

  /**
   * Search tags by name
   * @route GET /api/notes/tags/search
   * @param params - Search parameters including search term and limit
   * @returns List of tags matching the search term
   */
  async searchTags(params: SearchTagsParams): Promise<Tag[]> {
    return apiClient.get<Tag[]>('/notes/tags/search', { params });
  }

  /**
   * Rename a tag
   * @route PUT /api/notes/tags/{tag_id}/rename
   * @param tagId - The ID of the tag to rename
   * @param newName - The new name for the tag
   * @returns Response indicating success or failure
   */
  async renameTag(tagId: string, newName: string): Promise<ApiSuccessResponse> {
    return apiClient.put<ApiSuccessResponse>(`/notes/tags/${tagId}/rename`, null, {
      params: { new_name: newName },
    });
  }

  /**
   * Add a tag to a note
   * @route POST /api/notes/tags/tag-note
   * @param request - Request containing note_id, tag_name, and optional tag_color
   * @returns Response indicating success or failure
   */
  async tagNote(request: TagNoteRequest): Promise<ApiSuccessResponse> {
    return apiClient.post<ApiSuccessResponse>('/notes/tags/tag-note', request);
  }

  /**
   * Remove a tag from a note
   * @route DELETE /api/notes/tags/untag-note
   * @param request - Request containing note_id and tag_id
   * @returns Response indicating success or failure
   */
  async untagNote(request: UntagNoteRequest): Promise<ApiSuccessResponse> {
    return apiClient.delete<ApiSuccessResponse>('/notes/tags/untag-note', {
      data: request,
    });
  }

  /**
   * Get all notes with a specific tag
   * @route GET /api/notes/tags/{tag_id}/notes
   * @param tagId - The ID of the tag
   * @returns List of notes that have the specified tag
   */
  async getNotesByTag(tagId: string): Promise<Note[]> {
    return apiClient.get<Note[]>(`/notes/tags/${tagId}/notes`);
  }

  /**
   * Get all tags for a specific note
   * @route GET /api/notes/notes/{note_id}/tags
   * @param noteId - The ID of the note
   * @returns List of tags associated with the note
   */
  async getNoteTags(noteId: string): Promise<Tag[]> {
    return apiClient.get<Tag[]>(`/notes/notes/${noteId}/tags`);
  }

  /**
   * Get or create a tag
   * @route POST /api/notes/tags/get-or-create
   * @param name - The name of the tag to get or create
   * @returns The existing or newly created tag
   */
  async getOrCreateTag(name: string): Promise<Tag> {
    return apiClient.post<Tag>('/notes/tags/get-or-create', null, {
      params: { name },
    });
  }

  // ==================== TEMPLATES ====================

  /**
   * Get all templates (user's + system templates)
   * @route GET /api/notes/templates
   * @returns List of all available templates
   */
  async getTemplates(): Promise<Template[]> {
    return apiClient.get<Template[]>('/notes/templates');
  }

  /**
   * Get a single template by ID
   * @route GET /api/notes/templates/{template_id}
   * @param templateId - The ID of the template to retrieve
   * @returns The template with the specified ID
   */
  async getTemplate(templateId: string): Promise<Template> {
    return apiClient.get<Template>(`/notes/templates/${templateId}`);
  }

  /**
   * Create a new template
   * @route POST /api/notes/templates
   * @param template - The template data to create
   * @returns Response with template ID and success flag
   */
  async createTemplate(template: TemplateCreate): Promise<CreateResponse> {
    return apiClient.post<CreateResponse>('/notes/templates', template);
  }

  /**
   * Update a template
   * @route PUT /api/notes/templates/{template_id}
   * @param templateId - The ID of the template to update
   * @param template - The partial template data to update
   * @returns Response indicating success or failure
   */
  async updateTemplate(
    templateId: string,
    template: TemplateUpdate
  ): Promise<ApiSuccessResponse> {
    return apiClient.put<ApiSuccessResponse>(`/notes/templates/${templateId}`, template);
  }

  /**
   * Delete a template
   * @route DELETE /api/notes/templates/{template_id}
   * @param templateId - The ID of the template to delete
   * @returns Response indicating success or failure
   */
  async deleteTemplate(templateId: string): Promise<ApiSuccessResponse> {
    return apiClient.delete<ApiSuccessResponse>(`/notes/templates/${templateId}`);
  }

  // ==================== FAVORITES ====================

  /**
   * Toggle favorite status of a note
   * @route POST /api/notes/notes/{note_id}/favorite
   * @param noteId - The ID of the note to toggle favorite status
   * @returns The new favorite status
   */
  async toggleNoteFavorite(noteId: string): Promise<ToggleFavoriteResponse> {
    return apiClient.post<ToggleFavoriteResponse>(`/notes/notes/${noteId}/favorite`);
  }

  /**
   * Get all favorite notes for the current user
   * @route GET /api/notes/notes/favorites
   * @returns List of all favorite notes
   */
  async getFavoriteNotes(): Promise<Note[]> {
    return apiClient.get<Note[]>('/notes/notes/favorites');
  }

  // ==================== TRASH OPERATIONS ====================

  /**
   * Move a note to trash
   * @route POST /api/notes/notes/{note_id}/trash
   * @param noteId - The ID of the note to move to trash
   * @returns Response indicating success or failure
   */
  async moveNoteToTrash(noteId: string): Promise<ApiSuccessResponse> {
    return apiClient.post<ApiSuccessResponse>(`/notes/notes/${noteId}/trash`);
  }

  /**
   * Restore a note from trash
   * @route POST /api/notes/notes/{note_id}/restore-from-trash
   * @param noteId - The ID of the note to restore
   * @param targetFolderId - Optional target folder ID for restoration
   * @returns Response indicating success or failure
   */
  async restoreNoteFromTrash(
    noteId: string,
    targetFolderId?: string
  ): Promise<ApiSuccessResponse> {
    return apiClient.post<ApiSuccessResponse>(
      `/notes/notes/${noteId}/restore-from-trash`,
      null,
      {
        params: targetFolderId ? { target_folder_id: targetFolderId } : undefined,
      }
    );
  }

  // ==================== ADMIN OPERATIONS ====================

  /**
   * Create a system folder (admin only)
   * @route POST /api/notes/admin/folders/system
   * @param folderName - Name of the system folder
   * @param folderSlug - Unique slug for the system folder
   * @param folderDescription - Optional description of the system folder
   * @returns Response with folder ID and success flag
   */
  async createSystemFolder(
    folderName: string,
    folderSlug: string,
    folderDescription?: string
  ): Promise<CreateResponse> {
    return apiClient.post<CreateResponse>('/notes/admin/folders/system', null, {
      params: {
        folder_name: folderName,
        folder_slug: folderSlug,
        folder_description: folderDescription,
      },
    });
  }

  /**
   * Create a system template (admin only)
   * @route POST /api/notes/admin/templates/system
   * @param name - Name of the system template
   * @param description - Description of the system template
   * @param content - Optional content for the template
   * @returns Response with template ID and success flag
   */
  async createSystemTemplate(
    name: string,
    description: string,
    content?: Record<string, any>
  ): Promise<CreateResponse> {
    return apiClient.post<CreateResponse>('/notes/admin/templates/system', null, {
      params: {
        name,
        description,
        content,
      },
    });
  }
}

// Export singleton instance
export const notesService = new NotesService();
export default notesService;
