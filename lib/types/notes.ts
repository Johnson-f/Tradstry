// Notes System Types for Frontend

export interface Folder {
  id: string;
  name: string;
  slug: string;
  description?: string;
  is_system: boolean;
  created_at: string;
  updated_at: string;
}

export interface FolderCreate {
  name: string;
  slug: string;
  description?: string;
  is_system?: boolean;
}

export interface FolderUpdate {
  name?: string;
  slug?: string;
  description?: string;
}

export interface Note {
  id: string;
  title: string;
  content: Record<string, any>;
  folder_id: string;
  user_id: string;
  is_pinned: boolean;
  is_favorite: boolean;
  is_archived: boolean;
  is_deleted: boolean;
  deleted_at?: string;
  version: number;
  metadata?: Record<string, any>;
  tags: string[];
  template_id?: string;
  created_at: string;
  updated_at: string;
}

export interface NoteWithRelations extends Note {
  folder?: Folder;
  tags: Tag[];
  template?: Template;
}

export interface NoteCreate {
  title: string;
  content: Record<string, any>;
  folder_id: string;
  is_pinned?: boolean;
  is_favorite?: boolean;
  is_archived?: boolean;
  metadata?: Record<string, any>;
  tags?: string[];
  template_id?: string;
}

export interface NoteUpdate {
  title?: string;
  content?: Record<string, any>;
  folder_id?: string;
  is_pinned?: boolean;
  is_favorite?: boolean;
  is_archived?: boolean;
  metadata?: Record<string, any>;
  tags?: string[];
}

export interface Tag {
  id: string;
  name: string;
  color: string;
  user_id: string;
  created_at: string;
  updated_at: string;
  note_count?: number;
}

export interface TagCreate {
  name: string;
  color: string;
}

export interface TagUpdate {
  name?: string;
  color?: string;
}

export interface Template {
  id: string;
  name: string;
  description?: string;
  content: Record<string, any>;
  is_system: boolean;
  user_id?: string;
  created_at: string;
  updated_at: string;
}

export interface TemplateCreate {
  name: string;
  description?: string;
  content: Record<string, any>;
}

export interface TemplateUpdate {
  name?: string;
  description?: string;
  content?: Record<string, any>;
}

// Query Parameters
export interface NotesQuery {
  folder_id?: string;
  search?: string;
  is_favorite?: boolean;
  is_pinned?: boolean;
  is_archived?: boolean;
  include_deleted?: boolean;
  limit?: number;
  offset?: number;
  sort_by?: string;
  sort_order?: 'ASC' | 'DESC';
}

export interface FoldersQuery {
  search?: string;
  is_system?: boolean;
  limit?: number;
  offset?: number;
  sort_by?: string;
  sort_order?: 'ASC' | 'DESC';
}

export interface TagsQuery {
  search?: string;
}

export interface TemplatesQuery {
  search?: string;
}
