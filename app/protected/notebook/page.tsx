"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Search, Plus, MoreVertical, Clock } from "lucide-react";
import { NotebookNavigation } from "@/components/notebook/notebook-navigation";

type Note = {
  id: string;
  title: string;
  content: string;
  updatedAt: string;
  preview: string;
};

const sampleNotes: Note[] = [
  {
    id: '1',
    title: 'Welcome to Notebook',
    content: 'This is your first note. Start writing your thoughts here...',
    updatedAt: '2025-08-19T10:30:00',
    preview: 'Start writing your thoughts...',
  },
  {
    id: '2',
    title: 'Meeting Notes',
    content: 'Discussed project timeline and deliverables for Q4...',
    updatedAt: '2025-08-18T14:45:00',
    preview: 'Discussed project timeline and...',
  },
  {
    id: '3',
    title: 'Shopping List',
    content: '- Milk\n- Eggs\n- Bread\n- Fruits',
    updatedAt: '2025-08-17T09:15:00',
    preview: '- Milk - Eggs - Bread - Fruits',
  },
];

const formatDate = (dateString: string) => {
  const date = new Date(dateString);
  const now = new Date();
  const diffInDays = Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24));
  
  if (diffInDays === 0) return 'Today';
  if (diffInDays === 1) return 'Yesterday';
  if (diffInDays < 7) return `${diffInDays} days ago`;
  
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
};

export default function NotebookPage() {
  const [selectedNote, setSelectedNote] = useState<Note | null>(sampleNotes[0]);
  const [searchQuery, setSearchQuery] = useState('');

  const filteredNotes = sampleNotes.filter(note =>
    note.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
    note.content.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="flex h-screen bg-background">
      {/* Navigation Sidebar */}
      <NotebookNavigation />
      
      {/* Notes Sidebar */}
      <div className="w-80 border-r flex flex-col">
        <div className="p-4">
          <div className="relative mb-4">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              type="search"
              placeholder="Search notes..."
              className="w-full pl-9"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
          
          <Button className="w-full justify-start gap-2 mb-6">
            <Plus className="h-4 w-4" />
            New Note
          </Button>
        </div>
        
        <ScrollArea className="flex-1 px-3">
          <div className="space-y-1">
            {filteredNotes.map((note) => (
              <div 
                key={note.id}
                className={`p-3 rounded-lg cursor-pointer transition-colors ${
                  selectedNote?.id === note.id ? 'bg-accent' : 'hover:bg-muted/50'
                }`}
                onClick={() => setSelectedNote(note)}
              >
                <div className="flex justify-between items-start mb-1">
                  <h3 className="font-medium truncate">{note.title}</h3>
                  <Button variant="ghost" size="icon" className="h-6 w-6 -mr-2 opacity-0 group-hover:opacity-100">
                    <MoreVertical className="h-4 w-4" />
                  </Button>
                </div>
                <p className="text-sm text-muted-foreground line-clamp-2 mb-1">
                  {note.preview}
                </p>
                <div className="flex items-center text-xs text-muted-foreground">
                  <Clock className="h-3 w-3 mr-1" />
                  {formatDate(note.updatedAt)}
                </div>
              </div>
            ))}
          </div>
        </ScrollArea>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {selectedNote ? (
          <div className="flex-1 overflow-auto p-8">
            <div className="max-w-3xl mx-auto">
              <div className="mb-2 text-sm text-muted-foreground">
                {formatDate(selectedNote.updatedAt)}
              </div>
              <h1 className="text-3xl font-bold mb-8 focus:outline-none" contentEditable>
                {selectedNote.title}
              </h1>
              <div 
                className="prose dark:prose-invert max-w-none min-h-[60vh] focus:outline-none" 
                contentEditable
              >
                {selectedNote.content}
              </div>
            </div>
          </div>
        ) : (
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center space-y-4 max-w-md">
              <div className="mx-auto w-16 h-16 rounded-full bg-muted flex items-center justify-center">
                <Plus className="h-8 w-8 text-muted-foreground" />
              </div>
              <h3 className="text-xl font-medium">No note selected</h3>
              <p className="text-muted-foreground">
                Select a note from the sidebar or create a new one to get started.
              </p>
              <Button className="mt-2">
                <Plus className="mr-2 h-4 w-4" />
                New Note
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}