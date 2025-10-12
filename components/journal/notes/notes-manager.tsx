"use client";

import { useState, useEffect } from 'react';
import { useNotesDatabase } from '@/lib/drizzle/notes';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { 
  Plus, 
  Search, 
  Edit, 
  Trash2, 
  Copy, 
  Calendar,
  FileText,
  MoreHorizontal,
  Save,
  X
} from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { toast } from 'sonner';
import { formatDistanceToNow } from 'date-fns';
import TailwindAdvancedEditor from '@/components/journal/trade-notes/components/tailwind/advanced-editor';

interface NotesManagerProps {
  userId: string;
}

interface EditingNote {
  id: string;
  name: string;
  content: string;
}

export function NotesManager({ userId }: NotesManagerProps) {
  const { 
    isInitialized, 
    getAllNotes, 
    insertNote,
    updateNote,
    deleteNote, 
    duplicateNote, 
    searchNotes,
    getStats 
  } = useNotesDatabase(userId);
  
  const [notes, setNotes] = useState<any[]>([]);
  const [stats, setStats] = useState<any>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [loading, setLoading] = useState(false);
  const [deleteNoteId, setDeleteNoteId] = useState<string | null>(null);
  const [editingNote, setEditingNote] = useState<EditingNote | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [newNoteName, setNewNoteName] = useState('');
  const [isUpdating, setIsUpdating] = useState(false);

  // Load notes
  const loadNotes = async () => {
    if (!isInitialized) return;
    
    setLoading(true);
    try {
      const notesData = await getAllNotes({
        orderBy: 'updated_at',
        orderDirection: 'desc',
        limit: 50
      });
      setNotes(notesData);
    } catch (error) {
      console.error('Failed to load notes:', error);
      toast.error('Failed to load notes');
    } finally {
      setLoading(false);
    }
  };

  // Load stats
  const loadStats = async () => {
    if (!isInitialized) return;
    
    try {
      const statsData = await getStats();
      setStats(statsData);
    } catch (error) {
      console.error('Failed to load stats:', error);
    }
  };

  // Search notes
  const handleSearch = async (term: string) => {
    setSearchTerm(term);
    if (!isInitialized) return;
    
    setLoading(true);
    try {
      if (term.trim()) {
        const searchResults = await searchNotes(term);
        setNotes(searchResults);
      } else {
        await loadNotes();
      }
    } catch (error) {
      console.error('Failed to search notes:', error);
      toast.error('Failed to search notes');
    } finally {
      setLoading(false);
    }
  };

  // Create new note
  const handleCreateNote = async () => {
    if (!newNoteName.trim()) {
      toast.error('Please enter a note name');
      return;
    }

    try {
      const newNote = await insertNote({
        name: newNoteName.trim(),
        content: ''
      });
      
      toast.success('Note created successfully');
      setNewNoteName('');
      setIsCreating(false);
      await loadNotes();
      await loadStats();
      
      // Start editing the new note
      setEditingNote({
        id: newNote.id,
        name: newNote.name,
        content: newNote.content || ''
      });
    } catch (error) {
      console.error('Failed to create note:', error);
      toast.error('Failed to create note');
    }
  };

  // Update note
  const handleUpdateNote = async () => {
    if (!editingNote) return;

    setIsUpdating(true);
    try {
      await updateNote(editingNote.id, {
        name: editingNote.name,
        content: editingNote.content
      });
      
      toast.success('Note updated successfully');
      setEditingNote(null);
      await loadNotes();
      await loadStats();
    } catch (error) {
      console.error('Failed to update note:', error);
      toast.error('Failed to update note');
    } finally {
      setIsUpdating(false);
    }
  };

  // Delete note
  const handleDeleteNote = async (noteId: string) => {
    try {
      const success = await deleteNote(noteId);
      if (success) {
        toast.success('Note deleted successfully');
        await loadNotes();
        await loadStats();
      } else {
        toast.error('Failed to delete note');
      }
    } catch (error) {
      console.error('Failed to delete note:', error);
      toast.error('Failed to delete note');
    }
    setDeleteNoteId(null);
  };

  // Duplicate note
  const handleDuplicateNote = async (noteId: string) => {
    try {
      await duplicateNote(noteId);
      toast.success('Note duplicated successfully');
      await loadNotes();
      await loadStats();
    } catch (error) {
      console.error('Failed to duplicate note:', error);
      toast.error('Failed to duplicate note');
    }
  };

  // Start editing note
  const handleEditNote = (note: any) => {
    setEditingNote({
      id: note.id,
      name: note.name,
      content: note.content || ''
    });
  };

  // Cancel editing
  const handleCancelEdit = () => {
    setEditingNote(null);
  };

  // Get word count from content
  const getWordCount = (content: string) => {
    if (!content) return 0;
    try {
      const parsed = JSON.parse(content);
      const text = JSON.stringify(parsed);
      return text.split(/\s+/).filter(word => word.length > 0).length;
    } catch {
      return content.split(/\s+/).filter(word => word.length > 0).length;
    }
  };

  useEffect(() => {
    if (isInitialized) {
      loadNotes();
      loadStats();
    }
  }, [isInitialized]);

  if (!isInitialized) {
    return (
      <Card className="h-full">
        <CardContent className="flex items-center justify-center h-full">
          <div className="text-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4"></div>
            <p className="text-muted-foreground">Loading notes...</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="h-full flex">
      {/* Notes List Sidebar */}
      <Card className="w-80 h-full flex flex-col">
        <CardHeader className="pb-4">
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5" />
              Trading Notes
            </CardTitle>
            <Button onClick={() => setIsCreating(true)} size="sm">
              <Plus className="h-4 w-4 mr-2" />
              New Note
            </Button>
          </div>
          
          {/* Search */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search notes..."
              value={searchTerm}
              onChange={(e) => handleSearch(e.target.value)}
              className="pl-10"
            />
          </div>

          {/* Stats */}
          {stats && (
            <div className="flex gap-2 text-sm text-muted-foreground">
              <Badge variant="secondary">{stats.totalNotes} notes</Badge>
              <Badge variant="secondary">{stats.totalWords} words</Badge>
              {stats.lastUpdated && (
                <Badge variant="outline">
                  Updated {formatDistanceToNow(new Date(stats.lastUpdated), { addSuffix: true })}
                </Badge>
              )}
            </div>
          )}
        </CardHeader>

        <CardContent className="flex-1 overflow-y-auto">
          {/* Create new note form */}
          {isCreating && (
            <div className="p-3 border rounded-lg mb-3 bg-accent/50">
              <Input
                placeholder="Note name..."
                value={newNoteName}
                onChange={(e) => setNewNoteName(e.target.value)}
                onKeyPress={(e) => {
                  if (e.key === 'Enter') {
                    handleCreateNote();
                  }
                }}
                className="mb-2"
              />
              <div className="flex gap-2">
                <Button onClick={handleCreateNote} size="sm">
                  <Save className="h-4 w-4 mr-1" />
                  Create
                </Button>
                <Button onClick={() => setIsCreating(false)} variant="outline" size="sm">
                  <X className="h-4 w-4 mr-1" />
                  Cancel
                </Button>
              </div>
            </div>
          )}

          {loading ? (
            <div className="flex items-center justify-center py-8">
              <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary"></div>
            </div>
          ) : notes.length === 0 ? (
            <div className="text-center py-8">
              <FileText className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
              <p className="text-muted-foreground mb-4">
                {searchTerm ? 'No notes found matching your search.' : 'No notes yet.'}
              </p>
              {!searchTerm && !isCreating && (
                <Button onClick={() => setIsCreating(true)} variant="outline">
                  <Plus className="h-4 w-4 mr-2" />
                  Create your first note
                </Button>
              )}
            </div>
          ) : (
            <div className="space-y-2">
              {notes.map((note) => (
                <div
                  key={note.id}
                  className={`p-3 rounded-lg border cursor-pointer transition-colors hover:bg-accent ${
                    editingNote?.id === note.id ? 'bg-accent border-primary' : 'border-border'
                  }`}
                  onClick={() => handleEditNote(note)}
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1 min-w-0">
                      <h3 className="font-medium truncate">{note.name}</h3>
                      <div className="flex items-center gap-2 text-sm text-muted-foreground mt-1">
                        <Calendar className="h-3 w-3" />
                        <span>{formatDistanceToNow(new Date(note.updatedAt), { addSuffix: true })}</span>
                        {note.content && (
                          <>
                            <span>•</span>
                            <span>{getWordCount(note.content)} words</span>
                          </>
                        )}
                      </div>
                    </div>
                    
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="sm" onClick={(e) => e.stopPropagation()}>
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={(e) => {
                          e.stopPropagation();
                          handleDuplicateNote(note.id);
                        }}>
                          <Copy className="h-4 w-4 mr-2" />
                          Duplicate
                        </DropdownMenuItem>
                        <DropdownMenuItem 
                          onClick={(e) => {
                            e.stopPropagation();
                            setDeleteNoteId(note.id);
                          }}
                          className="text-destructive"
                        >
                          <Trash2 className="h-4 w-4 mr-2" />
                          Delete
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Editor Area */}
      <div className="flex-1 flex flex-col">
        {editingNote ? (
          <div className="flex-1 flex flex-col">
            {/* Editor Header */}
            <div className="border-b p-4 flex items-center justify-between">
              <div className="flex items-center gap-4">
                <Input
                  value={editingNote.name}
                  onChange={(e) => setEditingNote({ ...editingNote, name: e.target.value })}
                  className="font-semibold text-lg border-none shadow-none p-0 h-auto"
                />
              </div>
              <div className="flex gap-2">
                <Button onClick={handleUpdateNote} disabled={isUpdating}>
                  <Save className="h-4 w-4 mr-2" />
                  {isUpdating ? 'Saving...' : 'Save'}
                </Button>
                <Button onClick={handleCancelEdit} variant="outline">
                  <X className="h-4 w-4 mr-2" />
                  Cancel
                </Button>
              </div>
            </div>

            {/* Editor Content */}
            <div className="flex-1 p-4">
              <TailwindAdvancedEditor />
            </div>
          </div>
        ) : (
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center">
              <FileText className="h-16 w-16 text-muted-foreground mx-auto mb-4" />
              <h3 className="text-lg font-medium text-muted-foreground mb-2">
                Select a note to start editing
              </h3>
              <p className="text-sm text-muted-foreground">
                Choose a note from the sidebar or create a new one to begin writing.
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Delete confirmation dialog */}
      <AlertDialog open={!!deleteNoteId} onOpenChange={() => setDeleteNoteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Note</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this note? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteNoteId && handleDeleteNote(deleteNoteId)}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
