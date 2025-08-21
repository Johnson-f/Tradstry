# Notes System Documentation

## Overview
Rich note-taking system with folders, tags, and templates.

## Core Features
- Rich text notes with JSON content
- Folder organization
- Tagging system
- Note templates
- Soft delete (trash)
- Versioning
- Favorites & Pinning

## Database Schema
```sql
CREATE TABLE public.notes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    folder_id UUID NOT NULL REFERENCES public.folders(id),
    user_id UUID NOT NULL REFERENCES auth.users(id),
    title TEXT NOT NULL DEFAULT 'Untitled Note',
    content JSONB NOT NULL DEFAULT '{}'::jsonb,
    is_pinned BOOLEAN DEFAULT false,
    is_favorite BOOLEAN DEFAULT false,
    is_archived BOOLEAN DEFAULT false,
    is_deleted BOOLEAN DEFAULT false,
    deleted_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now(),
    version INTEGER DEFAULT 1
);
```

## API Endpoints

### Notes
- `POST /api/notes/` - Create note
- `GET /api/notes/{id}` - Get note
- `PUT /api/notes/{id}` - Update note
- `DELETE /api/notes/{id}?permanent=false` - Delete note
- `GET /api/notes/` - List notes (with filters)
- `POST /api/notes/{id}/favorite` - Toggle favorite

### Folders
- `GET /api/notes/folders/` - List folders
- `GET /api/notes/folders/{id}` - Get folder
- `GET /api/notes/folders/by-slug/{slug}` - Get folder by slug

### Templates
- `POST /api/notes/templates/` - Create template
- `GET /api/notes/templates/` - List templates
- `GET /api/notes/templates/{id}` - Get template
- `PUT /api/notes/templates/{id}` - Update template
- `DELETE /api/notes/templates/{id}` - Delete template

### Tags
- `GET /api/notes/tags/` - List tags
- `GET /api/notes/{id}/tags` - Get note tags
- `POST /api/notes/{id}/tags` - Add tags
- `DELETE /api/notes/{id}/tags/{tag}` - Remove tag

## Key Database Functions
- `delete_note(note_id)` - Move to trash
- `permanent_delete_note(note_id)` - Hard delete
- `restore_note(note_id, folder_id)` - Restore from trash
- `toggle_note_favorite(note_id)` - Toggle favorite

## Security
- JWT Authentication required
- Row Level Security (RLS)
- Users can only access their own data
- System folders are read-only

## Error Codes
- `401` Unauthorized
- `403` Forbidden
- `404` Not Found
- `400` Bad Request
- `409` Version Conflict

## Best Practices
1. Check `version` field for conflicts
2. Use soft delete by default
3. Use `include_deleted` to manage trash
4. Leverage templates for common formats
5. Use tags for flexible organization
