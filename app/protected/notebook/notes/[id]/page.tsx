"use client";

import { useState, useEffect, use, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { ArrowLeft, MoreVertical, Heart, Pin, Save } from "lucide-react";
import { NotebookNavigation } from "@/components/notebook/notebook-navigation";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { notesService } from "@/lib/services/notes-service";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useDebouncedCallback } from "use-debounce";
import { LexicalComposer } from '@lexical/react/LexicalComposer';
import { SettingsContext } from '@/components/notebook/rich-editor/context/SettingsContext';
import { SharedHistoryContext } from '@/components/notebook/rich-editor/context/SharedHistoryContext';
import { TableContext } from '@/components/notebook/rich-editor/plugins/TablePlugin';
import { ToolbarContext } from '@/components/notebook/rich-editor/context/ToolbarContext';
import { FlashMessageContext } from '@/components/notebook/rich-editor/context/FlashMessageContext';
import Editor from '@/components/notebook/rich-editor/Editor';
import PlaygroundNodes from '@/components/notebook/rich-editor/nodes/PlaygroundNodes';
import PlaygroundEditorTheme from '@/components/notebook/rich-editor/themes/PlaygroundEditorTheme';
import { OnChangePlugin } from '@lexical/react/LexicalOnChangePlugin';
import { $getRoot, $createParagraphNode, $createTextNode } from 'lexical';
import { $generateNodesFromDOM } from '@lexical/html';
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';

interface NotePageProps {
  params: Promise<{
    id: string;
  }>;
}

interface Note {
  id: string;
  title: string;
  content: Record<string, any>;
  folder_id: string;
  is_pinned: boolean;
  is_favorite: boolean;
  is_archived: boolean;
  created_at: string;
  updated_at: string;
}

const formatDate = (dateString: string) => {
  const date = new Date(dateString);
  const now = new Date();
  const diffInDays = Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24));
  
  if (diffInDays === 0) return 'Today';
  if (diffInDays === 1) return 'Yesterday';
  if (diffInDays < 7) return `${diffInDays} days ago`;
  
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
};

// Component to handle initial content loading
function InitialContentLoader({ content }: { content?: Record<string, any> | string }) {
  const [editor] = useLexicalComposerContext();

  useEffect(() => {
    if (content) {
      if (typeof content === 'object' && content.root) {
        try {
          const editorState = editor.parseEditorState(content);
          if (!editorState.isEmpty()) {
            editor.setEditorState(editorState);
          } else {
            // Content is an empty lexical state, so we just clear the editor
            // and ensure it has a paragraph.
            editor.update(() => {
              const root = $getRoot();
              root.clear();
              root.append($createParagraphNode());
            });
          }
        } catch (e) {
          console.error("Error parsing editor state:", e);
          // Fallback for corrupted content
          editor.update(() => {
            const root = $getRoot();
            root.clear();
            root.append($createParagraphNode().append($createTextNode("Could not load content.")));
          });
        }
      } else {
        editor.update(() => {
          const root = $getRoot();
          root.clear();

          if (typeof content === 'string' && content.includes('<')) {
            // Handle HTML content
            const parser = new DOMParser();
            const dom = parser.parseFromString(content, 'text/html');
            const nodes = $generateNodesFromDOM(editor, dom);
            root.append(...nodes);
          } else if (typeof content === 'string') {
            // Handle plain text content
            const paragraphNode = $createParagraphNode();
            if (content) {
              paragraphNode.append($createTextNode(content));
            }
            root.append(paragraphNode);
          }
        });
      }
    } else {
      // Handle null/undefined content (e.g. for a new note)
      editor.update(() => {
        const root = $getRoot();
        root.clear();
        root.append($createParagraphNode());
      });
    }
  }, [content, editor]);

  return null;
}

export default function NotePage({ params }: NotePageProps) {
  const { id } = use(params);
  const router = useRouter();
  const queryClient = useQueryClient();
  const [title, setTitle] = useState('');
  const [content, setContent] = useState<Record<string, any> | string>('');
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  
  // Fetch note data
  const { data: note, isLoading, error } = useQuery({
    queryKey: ['note', id],
    queryFn: async () => {
      const response = await notesService.getNote(id);
      return response;
    },
  });

  // Update local state when note data is loaded
  useEffect(() => {
    if (note) {
      setTitle(note.title || 'Untitled');
      setContent(note.content || '');
      setHasUnsavedChanges(false);
    }
  }, [note]);

  const handleSave = async () => {
    if (!note || isSaving) return;
    
    setIsSaving(true);
    try {
      await notesService.updateNote(id, {
        title: title,
        content: content,
      });
      
      // Invalidate notes list to reflect changes, but not the current note
      // to prevent re-render loops while the user is editing.
      queryClient.invalidateQueries({ queryKey: ['notes'] });
      setHasUnsavedChanges(false);
      toast.success('Note saved successfully');
    } catch (error) {
      console.error('Error saving note:', error);
      toast.error('Failed to save note');
    } finally {
      setIsSaving(false);
    }
  };

  // Auto-save functionality with debouncing
  const debouncedAutoSave = useDebouncedCallback(
    async () => {
      if (!note || !hasUnsavedChanges) return;
      
      try {
        await notesService.updateNote(id, {
          title: title,
          content: content,
        });
        
        // Invalidate the notes list, but not the current note to avoid loops.
        queryClient.invalidateQueries({ queryKey: ['notes'] });
        setHasUnsavedChanges(false);
      } catch (error) {
        console.error('Auto-save failed:', error);
      }
    },
    2000 // Auto-save after 2 seconds of inactivity
  );

  // Trigger auto-save when content changes
  useEffect(() => {
    if (hasUnsavedChanges) {
      debouncedAutoSave();
    }
  }, [content, title, hasUnsavedChanges, debouncedAutoSave]);

  const handleContentChange = useCallback((editorState: any) => {
    setContent(editorState.toJSON());
    setHasUnsavedChanges(true);
  }, []);

  const handleTitleChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setTitle(e.target.value);
    setHasUnsavedChanges(true);
  }, []);

  const handleToggleFavorite = async () => {
    if (!note) return;
    
    try {
      await notesService.toggleNoteFavorite(id);
      // Invalidate the notes list to update favorite status in other views.
      // Don't invalidate the current note query to prevent re-renders.
      queryClient.invalidateQueries({ queryKey: ['notes'] });
      queryClient.invalidateQueries({ queryKey: ['notes', 'favorites'] });
    } catch (error) {
      console.error('Error toggling favorite:', error);
    }
  };

  const initialConfig = {
    namespace: 'NotebookEditor',
    theme: PlaygroundEditorTheme,
    nodes: [...PlaygroundNodes],
    onError: (error: Error) => {
      console.error('Lexical error:', error);
    },
    editable: true,
  };

  if (isLoading) {
    return (
      <div className="flex h-screen bg-background">
        <NotebookNavigation />
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center">
            <div className="h-8 w-8 animate-spin rounded-full border-b-2 border-primary mx-auto mb-4" />
            <p className="text-muted-foreground">Loading note...</p>
          </div>
        </div>
      </div>
    );
  }

  if (error || !note) {
    return (
      <div className="flex h-screen bg-background">
        <NotebookNavigation />
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center space-y-4">
            <div className="text-6xl">📄</div>
            <h3 className="text-xl font-medium">Note not found</h3>
            <p className="text-muted-foreground">
              The note could not be found or may have been deleted.
            </p>
            <Button asChild>
              <Link href="/protected/notebook">
                <ArrowLeft className="mr-2 h-4 w-4" />
                Back to Notebook
              </Link>
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen bg-background">
      <NotebookNavigation />
      
      <div className="flex-1 flex flex-col">
        {/* Header */}
        <div className="border-b p-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="icon" asChild>
              <Link href="/protected/notebook">
                <ArrowLeft className="h-4 w-4" />
              </Link>
            </Button>
            <div className="text-sm text-muted-foreground">
              {formatDate(note.updated_at)}
            </div>
          </div>
          
          <div className="flex items-center gap-2">
            {hasUnsavedChanges && (
              <span className="text-sm text-muted-foreground">Unsaved changes</span>
            )}
            <Button variant="ghost" size="icon" onClick={handleToggleFavorite}>
              <Heart className={`h-4 w-4 ${note.is_favorite ? 'fill-current text-red-500' : ''}`} />
            </Button>
            <Button variant="ghost" size="icon">
              <Pin className={`h-4 w-4 ${note.is_pinned ? 'fill-current' : ''}`} />
            </Button>
            <Button variant="ghost" size="icon">
              <MoreVertical className="h-4 w-4" />
            </Button>
            <Button 
              onClick={handleSave} 
              disabled={!hasUnsavedChanges || isSaving}
              className="gap-2"
            >
              <Save className="h-4 w-4" />
              {isSaving ? 'Saving...' : 'Save'}
            </Button>
          </div>
        </div>

        {/* Content */}
        <ScrollArea className="flex-1">
          <div className="p-8 max-w-4xl mx-auto">
            <input
              type="text"
              value={title}
              onChange={handleTitleChange}
              className="text-3xl font-bold mb-8 w-full bg-transparent border-none outline-none focus:ring-0 placeholder:text-muted-foreground"
              placeholder="Note title..."
            />
            <div className="min-h-[60vh]">
              <SettingsContext>
                <FlashMessageContext>
                  <LexicalComposer initialConfig={initialConfig}>
                    <SettingsContext>
                      <SharedHistoryContext>
                        <TableContext>
                          <ToolbarContext>
                            <div className="editor-shell">
                              <InitialContentLoader content={content} />
                              <Editor />
                              <OnChangePlugin onChange={handleContentChange} />
                            </div>
                          </ToolbarContext>
                        </TableContext>
                      </SharedHistoryContext>
                    </SettingsContext>
                  </LexicalComposer>
                </FlashMessageContext>
              </SettingsContext>
            </div>
          </div>
        </ScrollArea>
      </div>
    </div>
  );
}
