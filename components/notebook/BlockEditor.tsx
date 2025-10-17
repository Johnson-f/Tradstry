"use client";

import { BlockNoteEditor, PartialBlock } from "@blocknote/core";
import { useCreateBlockNote } from "@blocknote/react";
import { BlockNoteView } from "@blocknote/mantine";
import { useEffect, useRef, useCallback } from "react";
import { useTheme } from "next-themes";
import "@blocknote/core/style.css";
import "@blocknote/mantine/style.css";


interface EditorProps {
  onChange: (value: string) => void;
  onTitleChange?: (title: string) => void;
  initialContent?: string;
  editable?: boolean;
  docId?: string;
}

export default function BlockEditor({ onChange, onTitleChange, initialContent, editable, docId }: EditorProps) {
  const { resolvedTheme } = useTheme();
  const lastSavedRef = useRef<string>("");
  const syncIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const debounceTimerRef = useRef<NodeJS.Timeout | null>(null);

  const editor: BlockNoteEditor = useCreateBlockNote({
    initialContent: initialContent
      ? (JSON.parse(initialContent) as PartialBlock[])
      : undefined,
  });

  // Save to localStorage immediately
  const saveToLocalStorage = useCallback((content: string) => {
    if (docId) {
      localStorage.setItem(`notebook-draft-${docId}`, content);
    }
  }, [docId]);

  // Sync to backend
  const syncToBackend = useCallback((content: string) => {
    if (content !== lastSavedRef.current) {
      onChange(content);
      lastSavedRef.current = content;
    }
  }, [onChange]);

  const extractFirstHeadingText = (doc: any): string | undefined => {
    try {
      const blocks: any[] = Array.isArray(doc) ? doc : doc?.children || [];
      for (const block of blocks) {
        if (block?.type === "heading" && (!block?.props?.level || block?.props?.level === 1)) {
          const spans = Array.isArray(block?.content) ? block.content : [];
          const text = spans.map((s: any) => s?.text ?? "").join("").trim();
          if (text) return text;
        }
        // search nested
        if (block?.children?.length) {
          const nested = extractFirstHeadingText(block.children);
          if (nested) return nested;
        }
      }
    } catch {}
    return undefined;
  };

  const handleEditorChange = useCallback(() => {
    const content = JSON.stringify(editor.document, null, 2);
    
    // Save to localStorage immediately
    saveToLocalStorage(content);
    
    // Debounced backend sync (3 minutes)
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }
    debounceTimerRef.current = setTimeout(() => {
      syncToBackend(content);
    }, 3 * 60 * 1000);

    // Title sync from first H1 heading
    if (onTitleChange) {
      const title = extractFirstHeadingText(editor.document);
      if (title) {
        onTitleChange(title);
      }
    }
  }, [editor, onTitleChange, saveToLocalStorage, syncToBackend]);

  // Set up periodic sync to backend
  useEffect(() => {
    if (!docId) return;

    // Clear existing interval
    if (syncIntervalRef.current) {
      clearInterval(syncIntervalRef.current);
    }

    // Set up new interval for backend sync every 5 minutes
    syncIntervalRef.current = setInterval(() => {
      const content = JSON.stringify(editor.document, null, 2);
      syncToBackend(content);
    }, 5 * 60 * 1000); // 5 minutes

    // Cleanup on unmount
    return () => {
      if (syncIntervalRef.current) {
        clearInterval(syncIntervalRef.current);
      }
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
    };
  }, [docId, editor, syncToBackend]);

  // Load from localStorage on mount
  useEffect(() => {
    if (docId && typeof window !== "undefined") {
      const savedContent = localStorage.getItem(`notebook-draft-${docId}`);
      if (savedContent && savedContent !== initialContent) {
        try {
          const parsedContent = JSON.parse(savedContent);
          editor.replaceBlocks(editor.document, parsedContent);
        } catch (error) {
          console.error("Failed to parse saved content:", error);
        }
      }
    }
  }, [docId, editor, initialContent]);

  return (
    <div>
      <BlockNoteView
        editable={editable}
        editor={editor}
        theme={resolvedTheme === "dark" ? "dark" : "light"}
        onChange={handleEditorChange}
      />
    </div>
  );
}


