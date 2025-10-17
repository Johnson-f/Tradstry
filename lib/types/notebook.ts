export interface NotebookNote {
  id: string;
  parent_id: string | null;
  title: string;
  content: string;
  position: number;
  is_deleted: boolean;
  created_at: string;
  updated_at: string;
}

export interface CreateNoteRequest {
  parent_id?: string | null;
  title: string;
  content?: string;
  position?: number;
}

export interface UpdateNoteRequest {
  title?: string;
  content?: string;
  parent_id?: string | null;
  position?: number;
  is_deleted?: boolean;
}

export interface NotebookTag {
  id: string;
  name: string;
  color: string;
  created_at: string;
  updated_at: string;
}

export interface CreateTagRequest {
  name: string;
  color?: string;
}

export interface UpdateTagRequest {
  name?: string;
  color?: string;
}

export interface NotebookTemplate {
  id: string;
  name: string;
  content: string;
  description?: string | null;
  created_at: string;
  updated_at: string;
}

export interface CreateTemplateRequest {
  name: string;
  content: string;
  description?: string | null;
}

export interface UpdateTemplateRequest {
  name?: string;
  content?: string;
  description?: string | null;
}

export interface NotebookReminder {
  id: string;
  note_id: string;
  title: string;
  description?: string | null;
  reminder_time: string;
  is_completed: boolean;
  created_at: string;
  updated_at: string;
}

export interface CreateReminderRequest {
  note_id: string;
  title: string;
  description?: string | null;
  reminder_time: string; // ISO string
}

export interface UpdateReminderRequest {
  title?: string;
  description?: string | null;
  reminder_time?: string;
  is_completed?: boolean;
}

export interface CalendarEvent {
  id: string;
  reminder_id: string;
  event_title: string;
  event_description?: string | null;
  event_time: string;
  is_synced: boolean;
  created_at: string;
  updated_at: string;
}

export interface ApiItem<T> {
  success: boolean;
  message: string;
  data: T | null;
}

export interface ApiList<T> {
  success: boolean;
  message: string;
  data: T[] | null;
}

export interface NotebookImage {
  id: string;
  note_id: string;
  user_id: string;
  file_path: string;
  filename: string;
  mime_type: string;
  file_size: number;
  alt_text?: string | null;
  caption?: string | null;
  is_deleted: boolean;
  created_at: string;
  updated_at: string;
}

export interface NotebookImageUploadParams {
  file: File;
  note_id: string;
  alt_text?: string;
  caption?: string;
}
