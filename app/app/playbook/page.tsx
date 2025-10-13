"use client";

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Plus, Filter, Search, MoreVertical, Edit, Trash2, Database, RefreshCw } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { usePlaybookService, playbookUtils } from '@/lib/services/playbook-service';
import type { Playbook, PlaybookFormData } from '@/lib/drizzle/playbook';
import { PlaybookCreateDialog } from '@/components/playbook/playbook-create-dialog';
import { PlaybookEditDialog } from '@/components/playbook/playbook-edit-dialog';
import { PlaybookDeleteDialog } from '@/components/playbook/playbook-delete-dialog';
import { useUserProfile } from '@/hooks/use-user-profile';

export default function PlaybookPage() {
  const { userId } = useUserProfile();
  const playbookService = usePlaybookService(userId);
  
  const [playbooks, setPlaybooks] = useState<Playbook[]>([]);
  const [filteredPlaybooks, setFilteredPlaybooks] = useState<Playbook[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [selectedPlaybook, setSelectedPlaybook] = useState<Playbook | null>(null);
  const [showMigrationOption, setShowMigrationOption] = useState(false);

  // Load playbooks when database is initialized
  useEffect(() => {
    if (playbookService.isInitialized && !playbookService.isInitializing) {
      loadPlaybooks();
    }
  }, [playbookService.isInitialized, playbookService.isInitializing]);

  // Filter playbooks when search changes
  useEffect(() => {
    filterPlaybooks();
  }, [playbooks, searchQuery]);

  // Check if database is initialized and show migration option
  useEffect(() => {
    if (playbookService.isInitialized && playbooks.length === 0 && !loading) {
      setShowMigrationOption(true);
    }
  }, [playbookService.isInitialized, playbooks.length, loading]);

  const loadPlaybooks = async () => {
    try {
      setLoading(true);
      const allPlaybooks = await playbookService.getAllPlaybooks();
      setPlaybooks(allPlaybooks);
    } catch (error) {
      console.error('Error loading playbooks:', error);
    } finally {
      setLoading(false);
    }
  };

  const filterPlaybooks = () => {
    let filtered = [...playbooks];

    // Filter by search query
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(playbook =>
        playbook.name.toLowerCase().includes(query) ||
        playbook.description?.toLowerCase().includes(query)
      );
    }

    setFilteredPlaybooks(filtered);
  };

  const handlePlaybookCreated = (newPlaybook: Playbook) => {
    setPlaybooks(prev => [newPlaybook, ...prev]);
    setIsCreateDialogOpen(false);
    setShowMigrationOption(false);
  };

  const handlePlaybookUpdated = (updatedPlaybook: Playbook) => {
    setPlaybooks(prev => prev.map(playbook => 
      playbook.id === updatedPlaybook.id ? updatedPlaybook : playbook
    ));
    setIsEditDialogOpen(false);
  };

  const handlePlaybookDeleted = (playbookId: string) => {
    setPlaybooks(prev => prev.filter(playbook => playbook.id !== playbookId));
    setIsDeleteDialogOpen(false);
  };

  const handleEditPlaybook = (playbook: Playbook) => {
    setSelectedPlaybook(playbook);
    setIsEditDialogOpen(true);
  };

  const handleDeletePlaybook = (playbook: Playbook) => {
    setSelectedPlaybook(playbook);
    setIsDeleteDialogOpen(true);
  };

  const handleMigrateSetups = async () => {
    try {
      setLoading(true);
      const migratedPlaybooks = await playbookService.migrateSetupsToPlaybooks();
      setPlaybooks(prev => [...migratedPlaybooks, ...prev]);
      setShowMigrationOption(false);
    } catch (error) {
      console.error('Error migrating setups:', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading || playbookService.isInitializing) {
    return (
      <div className="h-screen flex flex-col">
        <div className="w-full border-b bg-background px-8 py-4 flex-shrink-0">
          <h1 className="text-2xl font-bold tracking-tight">Playbook</h1>
        </div>
        <div className="flex-1 overflow-hidden">
          <div className="h-full overflow-y-auto">
            <div className="p-8">
              <div className="space-y-4">
                {[...Array(5)].map((_, i) => (
                  <div key={i} className="flex items-center space-x-4">
                    <Skeleton className="h-12 w-12 rounded-full" />
                    <div className="space-y-2">
                      <Skeleton className="h-4 w-[250px]" />
                      <Skeleton className="h-4 w-[200px]" />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (playbookService.error) {
    return (
      <div className="h-screen flex flex-col">
        <div className="w-full border-b bg-background px-8 py-4 flex-shrink-0">
          <h1 className="text-2xl font-bold tracking-tight">Playbook</h1>
        </div>
        <div className="flex-1 overflow-hidden">
          <div className="h-full overflow-y-auto">
            <div className="p-8">
              <div className="text-center py-12">
                <div className="text-destructive mb-4">
                  <h3 className="text-lg font-semibold mb-2">Database Error</h3>
                  <p className="text-sm">{playbookService.error.message}</p>
                </div>
                <Button onClick={() => playbookService.init()}>
                  <RefreshCw className="mr-2 h-4 w-4" />
                  Retry
                </Button>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen flex flex-col">
      {/* Header */}
      <div className="w-full border-b bg-background px-8 py-4 flex-shrink-0">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold tracking-tight">Playbook</h1>
          <div className="flex items-center space-x-2">
            {showMigrationOption && (
              <Button variant="outline" onClick={handleMigrateSetups}>
                <Database className="mr-2 h-4 w-4" />
                Migrate Setups
              </Button>
            )}
          <Button onClick={() => setIsCreateDialogOpen(true)}>
            <Plus className="mr-2 h-4 w-4" />
              New Playbook
          </Button>
          </div>
        </div>
      </div>

      {/* Search */}
      <div className="border-b bg-background px-8 py-4 flex-shrink-0">
        <div className="flex items-center space-x-4">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search playbooks..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10"
            />
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 overflow-hidden">
        <div className="h-full overflow-y-auto">
          <div className="p-8">
            {filteredPlaybooks.length === 0 ? (
              <div className="text-center py-12">
                <div className="text-muted-foreground mb-4">
                  {playbooks.length === 0 ? (
                    <>
                      <h3 className="text-lg font-semibold mb-2">No playbooks created yet</h3>
                      <p className="text-sm">Create your first trading playbook to get started</p>
                    </>
                  ) : (
                    <>
                      <h3 className="text-lg font-semibold mb-2">No playbooks match your search</h3>
                      <p className="text-sm">Try adjusting your search criteria</p>
                    </>
                  )}
                </div>
                {playbooks.length === 0 && (
                  <Button onClick={() => setIsCreateDialogOpen(true)}>
                    <Plus className="mr-2 h-4 w-4" />
                    Create First Playbook
                  </Button>
                )}
              </div>
            ) : (
              <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
                {filteredPlaybooks.map((playbook) => (
                  <div
                    key={playbook.id}
                    className="border rounded-lg p-6 hover:shadow-md transition-shadow"
                  >
                    <div className="flex items-start justify-between mb-4">
                      <div className="flex-1">
                        <h3 className="font-semibold text-lg mb-2">{playbook.name}</h3>
                        <Badge variant="secondary">
                          Trading Setup
                        </Badge>
                      </div>
                      <div className="flex items-center space-x-2">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                              <MoreVertical className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => handleEditPlaybook(playbook)}>
                              <Edit className="mr-2 h-4 w-4" />
                              Edit
                            </DropdownMenuItem>
                            <DropdownMenuItem 
                              onClick={() => handleDeletePlaybook(playbook)}
                              className="text-destructive"
                            >
                              <Trash2 className="mr-2 h-4 w-4" />
                              Delete
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    </div>
                    
                    {playbook.description && (
                      <p className="text-muted-foreground text-sm mb-4 line-clamp-2">
                        {playbook.description}
                      </p>
                    )}
                    
                    <div className="text-xs text-muted-foreground">
                      Created {new Date(playbook.createdAt).toLocaleDateString()}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Create Playbook Dialog */}
      <PlaybookCreateDialog
        open={isCreateDialogOpen}
        onOpenChange={setIsCreateDialogOpen}
        onPlaybookCreated={handlePlaybookCreated}
      />

      {/* Edit Playbook Dialog */}
      <PlaybookEditDialog
        open={isEditDialogOpen}
        onOpenChange={setIsEditDialogOpen}
        playbook={selectedPlaybook}
        onPlaybookUpdated={handlePlaybookUpdated}
      />

      {/* Delete Playbook Dialog */}
      <PlaybookDeleteDialog
        open={isDeleteDialogOpen}
        onOpenChange={setIsDeleteDialogOpen}
        playbook={selectedPlaybook}
        onPlaybookDeleted={handlePlaybookDeleted}
      />
    </div>
  );
}