# Notes API Documentation

This document provides comprehensive documentation for all Notes API endpoints, their purposes, parameters, and responses.

## Base URL
All endpoints are prefixed with `/api/notes`

## Authentication
All endpoints require Bearer token authentication via the `Authorization` header.

---

## 📁 FOLDERS ENDPOINTS

### GET `/api/notes/folders`
**Purpose:** Retrieve folders with optional filtering and sorting.

**Query Parameters:**
- `search_term` (string, optional): Search in folder name and description
- `is_system` (boolean, optional): Filter by system folders (true) or user folders (false)
- `limit` (integer, default: 100, max: 1000): Number of folders to return
- `offset` (integer, default: 0): Number of folders to skip for pagination
- `sort_by` (string, default: 'name'): Field to sort by (name, slug, created_at, updated_at)
- `sort_order` (string, default: 'ASC'): Sort order (ASC or DESC)

**Response:** Array of Folder objects

### GET `/api/notes/folders/slug/{folder_slug}`
**Purpose:** Get a specific folder by its unique slug identifier.

**Path Parameters:**
- `folder_slug` (string, required): The unique slug of the folder

**Response:** Single Folder object

---

## 📝 NOTES ENDPOINTS

### POST `/api/notes/`
**Purpose:** Create a new note in a specific folder.

**Request Body:**
```json
{
  "folder_id": "uuid",
  "title": "string",
  "content": {},
  "is_pinned": false,
  "is_favorite": false,
  "is_archived": false,
  "metadata": {}
}
```

**Response:** `{ "note_id": "uuid", "was_created": true }`

### PUT `/api/notes/{note_id}`
**Purpose:** Update an existing note. Only provided fields will be updated.

**Path Parameters:**
- `note_id` (UUID, required): The ID of the note to update

**Request Body:** Partial note data (all fields optional)

**Response:** `{ "note_id": "uuid", "was_created": false }`

### GET `/api/notes/`
**Purpose:** Retrieve notes with comprehensive filtering and sorting options.

**Query Parameters:**
- `note_id` (UUID, optional): Get a specific note by ID
- `folder_slug` (string, optional): Filter by folder slug
- `search_term` (string, optional): Search in note title and content
- `is_favorite` (boolean, optional): Filter by favorite status
- `is_pinned` (boolean, optional): Filter by pinned status
- `is_archived` (boolean, default: false): Filter by archived status
- `include_deleted` (boolean, default: false): Include soft-deleted notes
- `limit` (integer, default: 50, max: 1000): Number of notes to return
- `offset` (integer, default: 0): Number of notes to skip
- `sort_by` (string, default: 'updated_at'): Field to sort by
- `sort_order` (string, default: 'DESC'): Sort order

**Response:** Array of Note objects

### GET `/api/notes/{note_id}`
**Purpose:** Get a specific note by its ID.

**Path Parameters:**
- `note_id` (UUID, required): The ID of the note

**Response:** Single Note object

### DELETE `/api/notes/{note_id}`
**Purpose:** Delete a note (soft delete by default, permanent if specified).

**Path Parameters:**
- `note_id` (UUID, required): The ID of the note to delete

**Query Parameters:**
- `permanent` (boolean, default: false): If true, permanently delete (only works if note is already in trash)

**Response:** `{ "success": true, "message": "string" }`

### POST `/api/notes/folders/{folder_id}/restore`
**Purpose:** Restore a soft-deleted note from trash to a specific folder.

**Path Parameters:**
- `folder_id` (UUID, required): The target folder ID

**Request Body:**
```json
{
  "note_id": "uuid"
}
```

**Response:** `{ "success": true, "message": "string" }`

---

## 🏷️ TAGS ENDPOINTS

### GET `/api/notes/tags/all`
**Purpose:** Get all tags with their associated note counts.

**Response:** Array of Tag objects with `note_count` field

### GET `/api/notes/tags/search`
**Purpose:** Search for tags by name with autocomplete support.

**Query Parameters:**
- `search_term` (string, required): Search term for tags
- `limit` (integer, default: 10): Maximum number of results

**Response:** Array of matching Tag objects

### PUT `/api/notes/tags/{tag_id}/rename`
**Purpose:** Rename an existing tag.

**Path Parameters:**
- `tag_id` (UUID, required): The ID of the tag to rename

**Query Parameters:**
- `new_name` (string, required): New name for the tag

**Response:** `{ "success": true, "message": "string" }`

### POST `/api/notes/tags/tag-note`
**Purpose:** Add a tag to a note. Creates the tag if it doesn't exist.

**Request Body:**
```json
{
  "note_id": "uuid",
  "tag_name": "string",
  "tag_color": "#hex_color" // optional
}
```

**Response:** `{ "success": true }`

### DELETE `/api/notes/tags/untag-note`
**Purpose:** Remove a tag from a note.

**Request Body:**
```json
{
  "note_id": "uuid",
  "tag_id": "uuid"
}
```

**Response:** `{ "success": true }`

### GET `/api/notes/tags/{tag_id}/notes`
**Purpose:** Get all notes that have a specific tag.

**Path Parameters:**
- `tag_id` (UUID, required): The ID of the tag

**Response:** Array of Note objects

### GET `/api/notes/notes/{note_id}/tags`
**Purpose:** Get all tags associated with a specific note.

**Path Parameters:**
- `note_id` (UUID, required): The ID of the note

**Response:** Array of Tag objects

### POST `/api/notes/tags/get-or-create`
**Purpose:** Get an existing tag or create it if it doesn't exist.

**Query Parameters:**
- `name` (string, required): Tag name

**Response:** Tag object

---

## 📋 TEMPLATES ENDPOINTS

### GET `/api/notes/templates`
**Purpose:** Get all available templates (user's templates + system templates).

**Response:** Array of Template objects

### GET `/api/notes/templates/{template_id}`
**Purpose:** Get a specific template by ID.

**Path Parameters:**
- `template_id` (UUID, required): The ID of the template

**Response:** Single Template object

### POST `/api/notes/templates`
**Purpose:** Create a new user template.

**Request Body:**
```json
{
  "name": "string",
  "description": "string",
  "content": {}
}
```

**Response:** `{ "id": "uuid", "success": true }`

### PUT `/api/notes/templates/{template_id}`
**Purpose:** Update an existing template.

**Path Parameters:**
- `template_id` (UUID, required): The ID of the template to update

**Request Body:** Partial template data (all fields optional)

**Response:** `{ "success": true }`

### DELETE `/api/notes/templates/{template_id}`
**Purpose:** Delete a template.

**Path Parameters:**
- `template_id` (UUID, required): The ID of the template to delete

**Response:** `{ "success": true }`

---

## ⭐ FAVORITES ENDPOINTS

### POST `/api/notes/notes/{note_id}/favorite`
**Purpose:** Toggle the favorite status of a note.

**Path Parameters:**
- `note_id` (UUID, required): The ID of the note

**Response:** `{ "is_favorite": boolean }`

### GET `/api/notes/notes/favorites`
**Purpose:** Get all notes marked as favorites by the current user.

**Response:** Array of Note objects

---

## 🗑️ TRASH OPERATIONS

### POST `/api/notes/notes/{note_id}/trash`
**Purpose:** Move a note to trash (soft delete).

**Path Parameters:**
- `note_id` (UUID, required): The ID of the note

**Response:** `{ "success": true }`

### POST `/api/notes/notes/{note_id}/restore-from-trash`
**Purpose:** Restore a note from trash to a specific folder.

**Path Parameters:**
- `note_id` (UUID, required): The ID of the note to restore

**Query Parameters:**
- `target_folder_id` (UUID, optional): Target folder ID for restoration

**Response:** `{ "success": true }`

---

## 🔒 ADMIN OPERATIONS

### POST `/api/notes/admin/folders/system`
**Purpose:** Create a system-wide folder (admin only).

**Query Parameters:**
- `folder_name` (string, required): Name of the system folder
- `folder_slug` (string, required): Unique slug for the system folder
- `folder_description` (string, optional): Description of the system folder

**Response:** `{ "id": "uuid", "success": true }`

### POST `/api/notes/admin/templates/system`
**Purpose:** Create a system-wide template (admin only).

**Query Parameters:**
- `name` (string, required): Name of the system template
- `description` (string, required): Description of the system template
- `content` (object, optional): Template content structure

**Response:** `{ "id": "uuid", "success": true }`

---

## Error Responses

All endpoints may return the following error responses:

- **401 Unauthorized**: Invalid or missing authentication token
- **403 Forbidden**: User doesn't have permission for the requested operation
- **404 Not Found**: Requested resource doesn't exist
- **400 Bad Request**: Invalid request parameters or body
- **500 Internal Server Error**: Server-side error

Error response format:
```json
{
  "detail": "Error message describing what went wrong"
}
```

---

## Frontend Integration

The frontend integration is available through:

1. **Types**: `/types/notes.ts` - TypeScript interfaces for all data models
2. **Service**: `/lib/services/notes-service.ts` - API client service with all endpoint methods
3. **Hooks**: `/lib/hooks/use-notes.ts` - React Query hooks for data fetching and mutations

### Example Usage:

```typescript
import { useNotes, useCreateNote } from '@/lib/hooks/use-notes';

// Fetch notes
const { data: notes, isLoading } = useNotes({ 
  folder_slug: 'my-notes',
  is_favorite: true 
});

// Create a note
const createNoteMutation = useCreateNote();
await createNoteMutation.mutateAsync({
  folder_id: 'folder-uuid',
  title: 'My New Note',
  content: { /* editor content */ }
});
```
