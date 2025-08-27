"use client";

import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import { $getRoot, EditorState } from "lexical";
import { useEffect, useCallback } from "react";
import { debounce } from "lodash";

interface LocalStoragePluginProps {
  noteId?: string;
  enabled?: boolean;
  debounceMs?: number;
}

const LOCAL_STORAGE_KEY_PREFIX = "tradistry_note_draft_";

export default function LocalStoragePlugin({ 
  noteId = "default", 
  enabled = true,
  debounceMs = 500 
}: LocalStoragePluginProps) {
  const [editor] = useLexicalComposerContext();

  // Generate unique key for this note
  const storageKey = `${LOCAL_STORAGE_KEY_PREFIX}${noteId}`;

  // Debounced save function to prevent excessive localStorage writes
  const debouncedSave = useCallback(
    debounce((editorState: EditorState) => {
      if (!enabled) return;
      
      try {
        const serializedState = JSON.stringify(editorState.toJSON());
        localStorage.setItem(storageKey, serializedState);
        localStorage.setItem(`${storageKey}_timestamp`, Date.now().toString());
        
        // Optional: Log for debugging
        console.log(`Auto-saved draft for note ${noteId} to localStorage`);
      } catch (error) {
        console.warn("Failed to save draft to localStorage:", error);
      }
    }, debounceMs),
    [storageKey, enabled, noteId, debounceMs]
  );

  // Set up the editor state listener
  useEffect(() => {
    if (!enabled) return;

    const removeListener = editor.registerUpdateListener(({ editorState }) => {
      // Only save if the editor has content
      editor.read(() => {
        const root = $getRoot();
        const textContent = root.getTextContent().trim();
        
        // Save even empty content to track user interaction
        debouncedSave(editorState);
      });
    });

    return () => {
      removeListener();
      debouncedSave.cancel();
    };
  }, [editor, debouncedSave, enabled]);

  // Clean up localStorage when component unmounts or noteId changes
  useEffect(() => {
    return () => {
      // Cancel any pending saves
      debouncedSave.cancel();
    };
  }, [debouncedSave, noteId]);

  return null; // This plugin doesn't render anything
}

// Utility functions for managing localStorage drafts
export const LocalStorageUtils = {
  // Get draft content from localStorage
  getDraft: (noteId: string): EditorState | null => {
    try {
      const storageKey = `${LOCAL_STORAGE_KEY_PREFIX}${noteId}`;
      const savedContent = localStorage.getItem(storageKey);
      
      if (!savedContent) return null;
      
      return JSON.parse(savedContent);
    } catch (error) {
      console.warn("Failed to retrieve draft from localStorage:", error);
      return null;
    }
  },

  // Check if a draft exists and when it was last saved
  getDraftInfo: (noteId: string): { exists: boolean; timestamp?: number } => {
    try {
      const storageKey = `${LOCAL_STORAGE_KEY_PREFIX}${noteId}`;
      const savedContent = localStorage.getItem(storageKey);
      const timestamp = localStorage.getItem(`${storageKey}_timestamp`);
      
      return {
        exists: !!savedContent,
        timestamp: timestamp ? parseInt(timestamp, 10) : undefined
      };
    } catch (error) {
      console.warn("Failed to get draft info from localStorage:", error);
      return { exists: false };
    }
  },

  // Clear draft from localStorage
  clearDraft: (noteId: string): void => {
    try {
      const storageKey = `${LOCAL_STORAGE_KEY_PREFIX}${noteId}`;
      localStorage.removeItem(storageKey);
      localStorage.removeItem(`${storageKey}_timestamp`);
      console.log(`Cleared draft for note ${noteId}`);
    } catch (error) {
      console.warn("Failed to clear draft from localStorage:", error);
    }
  },

  // Get all draft note IDs
  getAllDraftIds: (): string[] => {
    try {
      const draftIds: string[] = [];
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key?.startsWith(LOCAL_STORAGE_KEY_PREFIX) && !key.endsWith('_timestamp')) {
          const noteId = key.replace(LOCAL_STORAGE_KEY_PREFIX, '');
          draftIds.push(noteId);
        }
      }
      return draftIds;
    } catch (error) {
      console.warn("Failed to get all draft IDs:", error);
      return [];
    }
  },

  // Clean up old drafts (older than specified days)
  cleanupOldDrafts: (olderThanDays: number = 7): void => {
    try {
      const cutoffTime = Date.now() - (olderThanDays * 24 * 60 * 60 * 1000);
      const draftIds = LocalStorageUtils.getAllDraftIds();
      
      draftIds.forEach(noteId => {
        const { timestamp } = LocalStorageUtils.getDraftInfo(noteId);
        if (timestamp && timestamp < cutoffTime) {
          LocalStorageUtils.clearDraft(noteId);
        }
      });
    } catch (error) {
      console.warn("Failed to cleanup old drafts:", error);
    }
  }
};
