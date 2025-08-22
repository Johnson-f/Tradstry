'use client';

import { useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ArrowLeft, Search, FileText, Calendar, Pin, Star } from 'lucide-react';
import { useNotesByTag, useTagsWithCounts } from '@/lib/hooks/use-notes';
import { formatDistanceToNow } from 'date-fns';

interface NoteWithPreview {
  id: string;
  title: string;
  content: any;
  preview: string;
  folder_id: string;
  is_pinned: boolean;
  is_favorite: boolean;
  is_archived: boolean;
  created_at: string;
  updated_at: string;
}

export default function TagNotesPage() {
  const params = useParams();
  const router = useRouter();
  const tagId = params.tagId as string;
  const [searchQuery, setSearchQuery] = useState('');

  // Get tag info
  const { data: tags = [] } = useTagsWithCounts();
  const currentTag = tags.find(tag => tag.id === tagId);

  // Get notes for this tag
  const { data: notes = [], isLoading } = useNotesByTag(tagId);

  // Create notes with preview
  const notesWithPreview: NoteWithPreview[] = notes
    .sort((a, b) => {
      if (a.is_pinned && !b.is_pinned) return -1;
      if (!a.is_pinned && b.is_pinned) return 1;
      return new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime();
    })
    .map((note) => {
      let preview = 'No content';
      if (note.content) {
        if (typeof note.content === 'object') {
          const textContent = note.content.text || JSON.stringify(note.content);
          if (typeof textContent === 'string') {
            preview = textContent.substring(0, 100) + (textContent.length > 100 ? '...' : '');
          }
        } else if (typeof note.content === 'string') {
          preview = note.content.substring(0, 100) + (note.content.length > 100 ? '...' : '');
        }
      }
      return { ...note, preview };
    });

  // Filter notes based on search
  const filteredNotes = notesWithPreview.filter(note => {
    const searchLower = searchQuery.toLowerCase();
    return note.title?.toLowerCase().includes(searchLower) ||
           (typeof note.content === 'string' && note.content.toLowerCase().includes(searchLower)) ||
           (typeof note.content === 'object' && note.content?.text?.toLowerCase().includes(searchLower));
  });

  const handleNoteClick = (noteId: string) => {
    router.push(`/protected/notebook/note/${noteId}`);
  };

  return (
    <div className="container mx-auto px-4 py-8 max-w-7xl">
      {/* Header */}
      <div className="mb-8">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => router.push('/protected/notebook/folder/tags')}
          className="mb-4"
        >
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back to Tags
        </Button>

        <div className="flex items-center gap-3 mb-6">
          <div
            className="w-10 h-10 rounded-full flex items-center justify-center"
            style={{ backgroundColor: currentTag?.color || '#6B7280' }}
          >
            <span className="text-white font-semibold">
              {currentTag?.name.charAt(0).toUpperCase()}
            </span>
          </div>
          <div>
            <h1 className="text-3xl font-bold">{currentTag?.name || 'Tag'}</h1>
            <p className="text-muted-foreground">
              {filteredNotes.length} {filteredNotes.length === 1 ? 'note' : 'notes'}
            </p>
          </div>
        </div>

        {/* Search Bar */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground h-4 w-4" />
          <Input
            type="text"
            placeholder="Search notes in this tag..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10"
          />
        </div>
      </div>

      {/* Notes Grid */}
      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <div className="h-8 w-8 animate-spin rounded-full border-b-2 border-primary" />
        </div>
      ) : filteredNotes.length === 0 ? (
        <Card className="py-12">
          <CardContent className="text-center">
            <FileText className="mx-auto h-12 w-12 text-muted-foreground mb-4" />
            <h3 className="text-lg font-semibold mb-2">
              {searchQuery ? 'No notes found' : 'No notes with this tag'}
            </h3>
            <p className="text-muted-foreground">
              {searchQuery 
                ? 'Try adjusting your search query.' 
                : 'Notes tagged with this tag will appear here.'}
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {filteredNotes.map((note) => (
            <Card 
              key={note.id} 
              className="cursor-pointer hover:shadow-lg transition-shadow"
              onClick={() => handleNoteClick(note.id)}
            >
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between">
                  <CardTitle className="text-lg line-clamp-2 flex-1">
                    {note.title || 'Untitled Note'}
                  </CardTitle>
                  <div className="flex items-center gap-1 ml-2">
                    {note.is_pinned && (
                      <Pin className="h-4 w-4 text-muted-foreground" />
                    )}
                    {note.is_favorite && (
                      <Star className="h-4 w-4 text-yellow-500 fill-yellow-500" />
                    )}
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground line-clamp-3 mb-3">
                  {note.preview}
                </p>
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Calendar className="h-3 w-3" />
                  <span>
                    {formatDistanceToNow(new Date(note.updated_at), { addSuffix: true })}
                  </span>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
