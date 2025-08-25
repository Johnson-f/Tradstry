/**
 * Frontend types for Notes API
 * Matches the backend models from backend/models/notes.py
 */

// ==================== FOLDERS ====================

export interface FolderBase {
  name: string;
  slug: string;
  description?: string | null;
  is_system: boolean;
}

export interface FolderCreate extends FolderBase {}

export interface FolderUpdate {
  name?: string;
  description?: string | null;
}

export interface Folder extends FolderBase {
  id: string;
  user_id?: string | null;
  created_at: string;
  updated_at: string;
  total_count?: number | null;
}

// ==================== NOTES ====================

export interface NoteBase {
  folder_id: string;
  title: string;
  content: Record<string, any>;
  is_pinned: boolean;
  is_favorite: boolean;
  is_archived: boolean;
  metadata?: Record<string, any> | null;
}

export interface NoteCreate extends NoteBase {}

export interface NoteUpdate {
  folder_id?: string;
  title?: string;
  content?: Record<string, any>;
  is_pinned?: boolean;
  is_favorite?: boolean;
  is_archived?: boolean;
  metadata?: Record<string, any> | null;
}

export interface Note extends NoteBase {
  id: string;
  user_id: string;
  is_deleted: boolean;
  deleted_at?: string | null;
  created_at: string;
  updated_at: string;
  version: number;
  content_preview?: string | null;
  total_count?: number | null;
}

export interface NoteUpsertResponse {
  note_id: string;
  was_created: boolean;
}

export interface DeleteResponse {
  success: boolean;
  message: string;
}

export interface RestoreNoteRequest {
  note_id: string;
}

// ==================== TAGS ====================

export interface TagBase {
  name: string;
  color?: string | null;
}

export interface TagCreate extends TagBase {}

export interface TagUpdate {
  name?: string;
  color?: string | null;
}

export interface Tag extends TagBase {
  id: string;
  user_id: string;
  created_at: string;
  updated_at: string;
  note_count?: number;
}

export interface TagNoteRequest {
  note_id: string;
  tag_name: string;
  tag_color?: string | null;
}

export interface UntagNoteRequest {
  note_id: string;
  tag_id: string;
}

// ==================== TEMPLATES ====================

export interface Template {
  id: string;
  user_id?: string;
  name: string;
  description?: string;
  content: any;
  is_system: boolean;
  created_at: string;
  updated_at: string;
}

export interface TemplateCreate {
  name: string;
  description?: string;
  content?: any;
}

export interface TemplateUpdate {
  name?: string;
  description?: string;
  content?: any;
}

// ==================== QUERY PARAMETERS ====================

export interface GetFoldersParams {
  search_term?: string;
  is_system?: boolean;
  limit?: number;
  offset?: number;
  sort_by?: 'name' | 'slug' | 'created_at' | 'updated_at';
  sort_order?: 'ASC' | 'DESC';
}

export interface GetNotesParams {
  note_id?: string;
  folder_slug?: string;
  search_term?: string;
  is_favorite?: boolean;
  is_pinned?: boolean;
  is_archived?: boolean;
  include_deleted?: boolean;
  limit?: number;
  offset?: number;
  sort_by?: 'title' | 'created_at' | 'updated_at' | 'is_pinned' | 'is_favorite';
  sort_order?: 'ASC' | 'DESC';
}

export interface SearchTagsParams {
  search_term: string;
  limit?: number;
}

// ==================== RESPONSE TYPES ====================

export interface ApiSuccessResponse {
  success: boolean;
  message?: string;
}

export interface CreateResponse {
  id: string;
  success: boolean;
}

export interface ToggleFavoriteResponse {
  is_favorite: boolean;
}
