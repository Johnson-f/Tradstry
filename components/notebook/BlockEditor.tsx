"use client";

import { BlockNoteEditor, PartialBlock } from "@blocknote/core";
import { useCreateBlockNote } from "@blocknote/react";
import { BlockNoteView } from "@blocknote/mantine";
import { useEffect, useRef, useCallback, useState } from "react";
import { useTheme } from "next-themes";
import { notebookImagesService } from '@/lib/services/notebook-images-service';
import { toast } from 'sonner';
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
  const [isDragOver, setIsDragOver] = useState(false);
  const [processedInitialContent, setProcessedInitialContent] = useState<PartialBlock[] | undefined>(undefined);

  // Function to resolve image IDs to fresh signed URLs
  const resolveImageUrl = useCallback(async (imageId: string): Promise<string> => {
    try {
      const url = await notebookImagesService.getImageUrl(imageId);
      return url;
    } catch (error) {
      console.error('Failed to resolve image URL:', error);
      // Return a placeholder or broken image URL
      return 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMjQiIGhlaWdodD0iMjQiIHZpZXdCb3g9IjAgMCAyNCAyNCIgZmlsbD0ibm9uZSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj4KPHJlY3Qgd2lkdGg9IjI0IiBoZWlnaHQ9IjI0IiBmaWxsPSIjZjNmNGY2Ii8+CjxwYXRoIGQ9Ik0xMiA2VjE4TTYgMTJIMTgiIHN0cm9rZT0iIzk5YTNhZiIgc3Ryb2tlLXdpZHRoPSIyIiBzdHJva2UtbGluZWNhcD0icm91bmQiLz4KPC9zdmc+';
    }
  }, []);

  // Function to process content and resolve image URLs
  const processContentWithImageUrls = useCallback(async (content: string): Promise<PartialBlock[]> => {
    try {
      const parsedContent = JSON.parse(content) as PartialBlock[];
      
      // Process each block to resolve image URLs
      const processedContent = await Promise.all(
        parsedContent.map(async (block) => {
          if (block.type === 'image' && block.props?.url?.startsWith('notebook-image://')) {
            const imageId = block.props.url.replace('notebook-image://', '');
            const resolvedUrl = await resolveImageUrl(imageId);
            return {
              ...block,
              props: {
                ...block.props,
                url: resolvedUrl
              }
            };
          }
          return block;
        })
      );
      
      return processedContent;
    } catch (error) {
      console.error("Failed to process content:", error);
      return [];
    }
  }, [resolveImageUrl]);

  // Image upload handler
  const handleUpload = useCallback(async (file: File) => {
    if (!docId) {
      toast.error('Cannot upload image: Note ID missing');
      throw new Error('Note ID is required');
    }

    try {
      const { id, url } = await notebookImagesService.uploadImage({
        file,
        note_id: docId
      });
      
      // Return a special URL format that includes the image ID
      // This allows us to resolve it later when displaying
      return `notebook-image://${id}`;
    } catch (error) {
      console.error('Image upload error:', error);
      toast.error('Failed to upload image');
      throw error;
    }
  }, [docId]);

  // Process initial content when it changes
  useEffect(() => {
    if (initialContent) {
      processContentWithImageUrls(initialContent).then((processed) => {
        setProcessedInitialContent(processed);
      });
    } else {
      setProcessedInitialContent(undefined);
    }
  }, [initialContent, processContentWithImageUrls]);

  const editor: BlockNoteEditor = useCreateBlockNote({
    initialContent: processedInitialContent,
    uploadFile: handleUpload,
  });

  // Handle paste events for images
  const handlePaste = useCallback(async (event: React.ClipboardEvent<HTMLDivElement>) => {
    const items = event.clipboardData?.items;
    if (!items || !docId) return;

    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      if (item.type.startsWith('image/')) {
        event.preventDefault();
        
        const file = item.getAsFile();
        if (!file) continue;

        try {
          toast.loading('Uploading pasted image...');
          const { id } = await notebookImagesService.uploadImage({
            file,
            note_id: docId
          });

          // Insert the image into the editor using BlockNote's API
          editor.insertBlocks(
            [
              {
                type: 'image',
                props: {
                  url: `notebook-image://${id}`,
                  caption: file.name,
                },
              },
            ],
            editor.getTextCursorPosition().block,
            'after'
          );

          toast.success('Image uploaded successfully');
        } catch (error) {
          console.error('Failed to upload pasted image:', error);
          toast.error('Failed to upload pasted image');
        }
        break;
      }
    }
  }, [docId, editor]);

  // Handle drag and drop events for images
  const handleDragOver = useCallback((event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    const hasImage = Array.from(event.dataTransfer?.items || []).some(
      item => item.type.startsWith('image/')
    );
    if (hasImage) {
      setIsDragOver(true);
    }
  }, []);

  const handleDragLeave = useCallback((event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setIsDragOver(false);
  }, []);

  const handleDrop = useCallback(async (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setIsDragOver(false);
    
    const files = event.dataTransfer?.files;
    if (!files || !docId) return;

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      if (file.type.startsWith('image/')) {
        try {
          toast.loading('Uploading dropped image...');
          const { id } = await notebookImagesService.uploadImage({
            file,
            note_id: docId
          });

          // Insert the image into the editor using BlockNote's API
          editor.insertBlocks(
            [
              {
                type: 'image',
                props: {
                  url: `notebook-image://${id}`,
                  caption: file.name,
                },
              },
            ],
            editor.getTextCursorPosition().block,
            'after'
          );

          toast.success('Image uploaded successfully');
        } catch (error) {
          console.error('Failed to upload dropped image:', error);
          toast.error('Failed to upload dropped image');
        }
        break;
      }
    }
  }, [docId, editor]);

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
        processContentWithImageUrls(savedContent).then((processedContent) => {
          if (processedContent.length > 0) {
            editor.replaceBlocks(editor.document, processedContent);
          }
        });
      }
    }
  }, [docId, editor, initialContent, processContentWithImageUrls]);

  return (
    <div 
      onPaste={handlePaste}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      className={`relative ${isDragOver ? 'bg-blue-50 dark:bg-blue-950/20 border-2 border-dashed border-blue-300 dark:border-blue-700' : ''}`}
    >
      {isDragOver && (
        <div className="absolute inset-0 z-10 flex items-center justify-center bg-blue-50/80 dark:bg-blue-950/40 backdrop-blur-sm">
          <div className="text-center">
            <div className="text-2xl mb-2">📷</div>
            <div className="text-blue-600 dark:text-blue-400 font-medium">
              Drop image to upload
            </div>
          </div>
        </div>
      )}
      <BlockNoteView
        editable={editable}
        editor={editor}
        theme={resolvedTheme === "dark" ? "dark" : "light"}
        onChange={handleEditorChange}
      />
    </div>
  );
}


