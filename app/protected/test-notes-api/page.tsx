'use client';

import { useState, useEffect } from 'react';
import { 
  useNotes, 
  useFolders, 
  useCreateNote, 
  useCreateFolder,
  useUpdateNote,
  useDeleteNote,
  useToggleFavorite,
  useTags,
  useTemplates
} from '@/lib/hooks/use-notes';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { createClient } from '@/lib/supabase/client';

export default function TestNotesAPI() {
  const [testResults, setTestResults] = useState<string[]>([]);
  const [authStatus, setAuthStatus] = useState<string>('Checking...');
  const supabase = createClient();
  
  // Check authentication status
  useEffect(() => {
    const checkAuth = async () => {
      try {
        const { data: { session }, error } = await supabase.auth.getSession();
        if (error) {
          setAuthStatus(`Auth Error: ${error.message}`);
          console.error('Auth error:', error);
          return;
        }
        
        if (session) {
          setAuthStatus(`Authenticated as: ${session.user.email}`);
          console.log('Session:', session);
          console.log('Access token:', session.access_token ? 'Present' : 'Missing');
        } else {
          setAuthStatus('Not authenticated');
          console.log('No session found');
        }
      } catch (error) {
        setAuthStatus(`Auth check failed: ${error}`);
        console.error('Auth check error:', error);
      }
    };
    
    checkAuth();
  }, [supabase]);
  
  // Query hooks
  const { data: notes, isLoading: notesLoading, error: notesError } = useNotes();
  const { data: folders, isLoading: foldersLoading, error: foldersError } = useFolders();
  const { data: tags, isLoading: tagsLoading, error: tagsError } = useTags();
  const { data: templates, isLoading: templatesLoading, error: templatesError } = useTemplates();

  // Debug logging
  console.log('Auth Status:', authStatus);
  console.log('Folders data:', folders);
  console.log('Folders error:', foldersError);
  console.log('Notes data:', notes);
  console.log('Notes error:', notesError);
  
  // Mutation hooks
  const createNote = useCreateNote();
  const createFolder = useCreateFolder();
  const updateNote = useUpdateNote();
  const deleteNote = useDeleteNote();
  const toggleFavorite = useToggleFavorite();

  const addTestResult = (result: string) => {
    setTestResults(prev => [...prev, `${new Date().toLocaleTimeString()}: ${result}`]);
  };

  const testCreateFolder = async () => {
    try {
      const folder = await createFolder.mutateAsync({
        name: 'Test Folder',
        slug: 'test-folder',
        description: 'A test folder created via API'
      });
      addTestResult(`✅ Created folder: ${folder.name}`);
    } catch (error) {
      addTestResult(`❌ Failed to create folder: ${error}`);
    }
  };

  const testCreateNote = async () => {
    try {
      // Get first folder or create one
      const folderId = folders?.[0]?.id;
      if (!folderId) {
        addTestResult('❌ No folders available, create a folder first');
        return;
      }

      const note = await createNote.mutateAsync({
        title: 'Test Note',
        content: { text: 'This is a test note created via API' },
        folder_id: folderId
      });
      addTestResult(`✅ Created note: ${note.title} (ID: ${note.id})`);
      return note.id;
    } catch (error) {
      addTestResult(`❌ Failed to create note: ${error}`);
    }
  };

  const testUpdateNote = async () => {
    try {
      const noteId = notes?.[0]?.id;
      if (!noteId) {
        addTestResult('❌ No notes available to update');
        return;
      }

      const updated = await updateNote.mutateAsync({
        id: noteId,
        note: {
          title: 'Updated Test Note',
          content: { text: 'This note has been updated via API' }
        }
      });
      addTestResult(`✅ Updated note: ${updated.title}`);
    } catch (error) {
      addTestResult(`❌ Failed to update note: ${error}`);
    }
  };

  const testToggleFavorite = async () => {
    try {
      const noteId = notes?.[0]?.id;
      if (!noteId) {
        addTestResult('❌ No notes available to favorite');
        return;
      }

      await toggleFavorite.mutateAsync(noteId);
      addTestResult(`✅ Toggled favorite for note ID: ${noteId}`);
    } catch (error) {
      addTestResult(`❌ Failed to toggle favorite: ${error}`);
    }
  };

  const testDeleteNote = async () => {
    try {
      const noteId = notes?.[notes.length - 1]?.id;
      if (!noteId) {
        addTestResult('❌ No notes available to delete');
        return;
      }

      await deleteNote.mutateAsync({ id: noteId, permanent: false });
      addTestResult(`✅ Soft deleted note ID: ${noteId}`);
    } catch (error) {
      addTestResult(`❌ Failed to delete note: ${error}`);
    }
  };

  const testSystemFolders = () => {
    addTestResult(`📊 Folders data: ${JSON.stringify(folders, null, 2)}`);
    addTestResult(`📊 Folders count: ${folders?.length || 0}`);
    addTestResult(`📊 System folders: ${folders?.filter(f => f.is_system).length || 0}`);
    addTestResult(`📊 User folders: ${folders?.filter(f => !f.is_system).length || 0}`);
  };

  const testAuthEndpoint = async () => {
    try {
      const response = await fetch('http://localhost:8000/api/notes/debug/auth', {
        headers: {
          'Authorization': `Bearer ${(await supabase.auth.getSession()).data.session?.access_token}`
        }
      });
      const data = await response.json();
      addTestResult(`🔐 Auth test: ${response.status} - ${JSON.stringify(data)}`);
    } catch (error) {
      addTestResult(`🔐 Auth test failed: ${error}`);
    }
  };

  const runAllTests = async () => {
    setTestResults([]);
    addTestResult('Starting API tests...');
    
    // Test folder creation
    await testCreateFolder();
    
    // Wait a bit for data to refresh
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    // Test note operations
    await testCreateNote();
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    await testUpdateNote();
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    await testToggleFavorite();
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    await testDeleteNote();
    
    addTestResult('✅ All tests completed!');
  };

  return (
    <div className="container mx-auto p-6 space-y-6">
      <h1 className="text-3xl font-bold">Notes API Test Page</h1>
      
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Authentication & API Status */}
        <Card>
          <CardHeader>
            <CardTitle>Authentication & API Status</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <div className="font-semibold">
              Auth: {authStatus.includes('Authenticated') ? '✅' : authStatus.includes('Checking') ? '⏳' : '❌'} {authStatus}
            </div>
            <hr className="my-2" />
            <div>
              Notes: {notesLoading ? '⏳ Loading...' : notesError ? '❌ Error' : `✅ Connected (${notes?.length || 0} notes)`}
            </div>
            <div>
              Folders: {foldersLoading ? '⏳ Loading...' : foldersError ? '❌ Error' : `✅ Connected (${folders?.length || 0} folders)`}
            </div>
            <div>
              Tags: {tagsLoading ? '⏳ Loading...' : tagsError ? '❌ Error' : `✅ Connected (${tags?.length || 0} tags)`}
            </div>
            <div>
              Templates: {templatesLoading ? '⏳ Loading...' : templatesError ? '❌ Error' : `✅ Connected (${templates?.length || 0} templates)`}
            </div>
          </CardContent>
        </Card>

        {/* Test Controls */}
        <Card>
          <CardHeader>
            <CardTitle>Test Operations</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <Button onClick={testCreateFolder} className="w-full">
              Create Test Folder
            </Button>
            <Button onClick={testCreateNote} className="w-full">
              Create Test Note
            </Button>
            <Button onClick={testUpdateNote} className="w-full">
              Update First Note
            </Button>
            <Button onClick={testToggleFavorite} className="w-full">
              Toggle Favorite
            </Button>
            <Button onClick={testDeleteNote} className="w-full">
              Delete Last Note
            </Button>
            <Button onClick={testSystemFolders} className="w-full">
              Check System Folders
            </Button>
            <Button onClick={testAuthEndpoint} className="w-full">
              Test Authentication
            </Button>
            <Button onClick={runAllTests} variant="default" className="w-full">
              Run All Tests
            </Button>
          </CardContent>
        </Card>
      </div>

      {/* Current Data */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Current Notes</CardTitle>
          </CardHeader>
          <CardContent>
            {notesLoading ? (
              <p>Loading notes...</p>
            ) : notesError ? (
              <p className="text-red-500">Error loading notes: {String(notesError)}</p>
            ) : notes?.length === 0 ? (
              <p>No notes found</p>
            ) : (
              <ul className="space-y-2">
                {notes?.map(note => (
                  <li key={note.id} className="border-b pb-2">
                    <div className="font-semibold">{note.title}</div>
                    <div className="text-sm text-gray-600">
                      Folder: {note.folder?.name || note.folder_id}
                      {note.is_favorite && ' ⭐'}
                      {note.is_pinned && ' 📌'}
                      {note.is_archived && ' 📦'}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Current Folders</CardTitle>
          </CardHeader>
          <CardContent>
            {foldersLoading ? (
              <p>Loading folders...</p>
            ) : foldersError ? (
              <p className="text-red-500">Error loading folders: {String(foldersError)}</p>
            ) : folders?.length === 0 ? (
              <p>No folders found</p>
            ) : (
              <ul className="space-y-2">
                {folders?.map(folder => (
                  <li key={folder.id} className="border-b pb-2">
                    <div className="font-semibold">{folder.name}</div>
                    <div className="text-sm text-gray-600">
                      {folder.description || 'No description'}
                      {folder.is_system && ' (System)'}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Test Results */}
      <Card>
        <CardHeader>
          <CardTitle>Test Results</CardTitle>
        </CardHeader>
        <CardContent>
          {testResults.length === 0 ? (
            <p>No tests run yet</p>
          ) : (
            <div className="space-y-1 font-mono text-sm">
              {testResults.map((result, index) => (
                <div key={index}>{result}</div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
