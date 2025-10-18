import { apiClient } from '@/lib/services/api-client';
import { apiConfig } from '@/lib/config/api';
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
  ApiItem,
  ApiList,
} from '@/lib/types/notebook';

class NotebookService {
  // Notes
  async createNote(payload: CreateNoteRequest): Promise<ApiItem<NotebookNote>> {
    return apiClient.post(apiConfig.endpoints.notebook.notes.base, payload);
  }

  async listNotes(parentId?: string): Promise<ApiList<NotebookNote>> {
    const params = parentId ? { parent_id: parentId } : undefined;
    return apiClient.get(apiConfig.endpoints.notebook.notes.base, { params });
  }

  async getNote(noteId: string): Promise<ApiItem<NotebookNote>> {
    return apiClient.get(apiConfig.endpoints.notebook.notes.byId(noteId));
  }

  async getNoteTree(noteId: string): Promise<{ success: boolean; message: string; data: { root: NotebookNote; children: NotebookNote[] } }> {
    return apiClient.get(apiConfig.endpoints.notebook.notes.tree(noteId));
  }

  async updateNote(noteId: string, payload: UpdateNoteRequest): Promise<ApiItem<NotebookNote>> {
    return apiClient.put(apiConfig.endpoints.notebook.notes.byId(noteId), payload);
  }

  async deleteNote(noteId: string): Promise<{ success: boolean; message: string }> {
    return apiClient.delete(apiConfig.endpoints.notebook.notes.byId(noteId));
  }

  async reorderNote(noteId: string, position: number): Promise<ApiItem<NotebookNote>> {
    return apiClient.post(apiConfig.endpoints.notebook.notes.reorder(noteId), { position });
  }

  async tagNote(noteId: string, tagId: string): Promise<{ success: boolean; message: string }> {
    return apiClient.post(apiConfig.endpoints.notebook.notes.tag(noteId, tagId));
  }

  async untagNote(noteId: string, tagId: string): Promise<{ success: boolean; message: string }> {
    return apiClient.delete(apiConfig.endpoints.notebook.notes.untag(noteId, tagId));
  }

  // Tags
  async createTag(payload: CreateTagRequest): Promise<ApiItem<NotebookTag>> {
    return apiClient.post(apiConfig.endpoints.notebook.tags.base, payload);
  }

  async listTags(): Promise<ApiList<NotebookTag>> {
    return apiClient.get(apiConfig.endpoints.notebook.tags.base);
  }

  async getTag(tagId: string): Promise<ApiItem<NotebookTag>> {
    return apiClient.get(apiConfig.endpoints.notebook.tags.byId(tagId));
  }

  async updateTag(tagId: string, payload: UpdateTagRequest): Promise<ApiItem<NotebookTag>> {
    return apiClient.put(apiConfig.endpoints.notebook.tags.byId(tagId), payload);
  }

  async deleteTag(tagId: string): Promise<{ success: boolean; message: string }> {
    return apiClient.delete(apiConfig.endpoints.notebook.tags.byId(tagId));
  }

  // Templates
  async createTemplate(payload: CreateTemplateRequest): Promise<ApiItem<NotebookTemplate>> {
    return apiClient.post(apiConfig.endpoints.notebook.templates.base, payload);
  }

  async listTemplates(): Promise<ApiList<NotebookTemplate>> {
    return apiClient.get(apiConfig.endpoints.notebook.templates.base);
  }

  async getTemplate(id: string): Promise<ApiItem<NotebookTemplate>> {
    return apiClient.get(apiConfig.endpoints.notebook.templates.byId(id));
  }

  async updateTemplate(id: string, payload: UpdateTemplateRequest): Promise<ApiItem<NotebookTemplate>> {
    return apiClient.put(apiConfig.endpoints.notebook.templates.byId(id), payload);
  }

  async deleteTemplate(id: string): Promise<{ success: boolean; message: string }> {
    return apiClient.delete(apiConfig.endpoints.notebook.templates.byId(id));
  }

  // Reminders
  async createReminder(payload: CreateReminderRequest): Promise<ApiItem<NotebookReminder>> {
    return apiClient.post(apiConfig.endpoints.notebook.reminders.base, payload);
  }

  async listReminders(): Promise<ApiList<NotebookReminder>> {
    return apiClient.get(apiConfig.endpoints.notebook.reminders.base);
  }

  async getReminder(id: string): Promise<ApiItem<NotebookReminder>> {
    return apiClient.get(apiConfig.endpoints.notebook.reminders.byId(id));
  }

  async updateReminder(id: string, payload: UpdateReminderRequest): Promise<ApiItem<NotebookReminder>> {
    return apiClient.put(apiConfig.endpoints.notebook.reminders.byId(id), payload);
  }

  async deleteReminder(id: string): Promise<{ success: boolean; message: string }> {
    return apiClient.delete(apiConfig.endpoints.notebook.reminders.byId(id));
  }

  async completeReminder(id: string): Promise<ApiItem<NotebookReminder>> {
    return apiClient.post(apiConfig.endpoints.notebook.reminders.complete(id));
  }

  // Calendar
  async listCalendarEvents(startDate?: string, endDate?: string): Promise<ApiList<CalendarEvent>> {
    const params: Record<string, string> = {};
    if (startDate) params.start = startDate;
    if (endDate) params.end = endDate;
    return apiClient.get(apiConfig.endpoints.notebook.calendar.events, { params });
  }

  async connectCalendar(provider: 'google' | 'microsoft', payload: { access_token: string; refresh_token: string; token_expiry: string; calendar_id?: string }): Promise<{ success: boolean; connection_id: string }> {
    return apiClient.post(apiConfig.endpoints.notebook.calendar.connect(provider), payload);
  }

  async disconnectCalendar(connectionId: string): Promise<{ success: boolean }> {
    return apiClient.delete(apiConfig.endpoints.notebook.calendar.disconnect(connectionId));
  }

  async syncCalendar(connectionId: string): Promise<{ success: boolean; synced: number }> {
    return apiClient.post(apiConfig.endpoints.notebook.calendar.sync(connectionId));
  }

  async googleOAuthExchange(payload: { code: string; redirect_uri: string; client_id: string; client_secret: string }): Promise<{ success: boolean; connection_id: string }> {
    return apiClient.post(apiConfig.endpoints.notebook.calendar.oauthGoogle, payload);
    }

  async microsoftOAuthExchange(payload: { code: string; redirect_uri: string; client_id: string; client_secret: string; tenant?: string }): Promise<{ success: boolean; connection_id: string }> {
    return apiClient.post(apiConfig.endpoints.notebook.calendar.oauthMicrosoft, payload);
  }
}

export const notebookService = new NotebookService();
export default notebookService;
