import { NotebookImage, NotebookImageUploadParams } from '@/lib/types/notebook';

class NotebookImagesService {
  async uploadImage(params: NotebookImageUploadParams): Promise<{ id: string; url: string }> {
    const formData = new FormData();
    formData.append('file', params.file);
    formData.append('note_id', params.note_id);
    if (params.alt_text) formData.append('alt_text', params.alt_text);
    if (params.caption) formData.append('caption', params.caption);

    const response = await fetch('/api/notebook/images/upload', {
      method: 'POST',
      body: formData,
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Upload failed');
    }

    const data = await response.json();
    return { id: data.id, url: data.url };
  }

  async getImageUrl(imageId: string): Promise<string> {
    const response = await fetch(`/api/notebook/images/${imageId}`);

    if (!response.ok) {
      throw new Error('Failed to get image URL');
    }

    const data = await response.json();
    return data.url;
  }

  async getImagesByNoteId(noteId: string): Promise<NotebookImage[]> {
    const response = await fetch(`/api/notebook/images/note/${noteId}`);

    if (!response.ok) {
      throw new Error('Failed to get images for note');
    }

    const data = await response.json();
    return data.images || [];
  }

  async deleteImage(imageId: string): Promise<void> {
    const response = await fetch(`/api/notebook/images/${imageId}`, {
      method: 'DELETE',
    });

    if (!response.ok) {
      throw new Error('Failed to delete image');
    }
  }

  async deleteImagesByNoteId(noteId: string): Promise<void> {
    const response = await fetch(`/api/notebook/images/note/${noteId}`, {
      method: 'DELETE',
    });

    if (!response.ok) {
      console.error('Failed to delete images for note');
      // Don't throw - allow note deletion to continue
    }
  }
}

export const notebookImagesService = new NotebookImagesService();
