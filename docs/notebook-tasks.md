# Notebook Feature: Tasks and Implementation Plan

This document outlines the features and tasks required to complete the notebook functionality in Tradistry.

## Existing Features

*   **Backend (Python/FastAPI):**
    *   Full CRUD for notes, folders, tags, and templates.
    *   Soft-delete and permanent deletion of notes.
    *   Favorites and robust search/filtering APIs.
    *   User authentication and authorization.

*   **Frontend (Next.js/React):**
    *   Dynamic notebook navigation bar.
    *   Collapsible sidebar with static data.

## Next Steps & Features to Implement

### High Priority (Core Functionality)

1.  **Note Editor:**
    *   **Task:** Implement a rich-text editor for creating and editing notes.
    *   **Suggested Library:** [Lexical](https://lexical.dev/),
    *   **Location:** `components/notebook/note-editor.tsx`

2.  **Note List View:**
    *   **Task:** Display a list of notes for the selected folder.
    *   **Location:** `components/notebook/note-list.tsx`

3.  **Connect Sidebar to API:**
    *   **Task:** Fetch and display user's folders and notes from the backend. Implement "New Note" functionality.
    *   **Location:** `components/notebook/notebook-sidebar.tsx`

4.  **Implement Search:**
    *   **Task:** Connect the search bar to the backend search endpoint.
    *   **Location:** `components/notebook/notebook-sidebar.tsx`

### Medium Priority (Enhancements)

5.  **Folder and Tag Management:**
    *   **Task:** Create UI for creating, renaming, and deleting folders and tags.

6.  **Note Actions:**
    *   **Task:** Add UI for favoriting, archiving, and deleting notes from the list view.

7.  **Template Management:**
    *   **Task:** Build a UI to create, view, and manage note templates.
