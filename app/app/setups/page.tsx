"use client";

import { useState, useEffect } from 'react';
import { SetupCreateDialog } from '@/components/setups/setup-create-dialog';
import { SetupEditDialog } from '@/components/setups/setup-edit-dialog';
import { SetupDeleteDialog } from '@/components/setups/setup-delete-dialog';
import { Button } from '@/components/ui/button';
import { Plus, Filter, Search, MoreVertical, Edit, Trash2 } from 'lucide-react';
import { SetupInDB, SetupCategory } from '@/lib/types/setups';
import { setupsService } from '@/lib/services/setups-service';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';

export default function SetupsPage() {
  const [setups, setSetups] = useState<SetupInDB[]>([]);
  const [filteredSetups, setFilteredSetups] = useState<SetupInDB[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<SetupCategory | 'all'>('all');
  const [showActiveOnly, setShowActiveOnly] = useState(true);
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [selectedSetup, setSelectedSetup] = useState<SetupInDB | null>(null);

  // Load setups on component mount
  useEffect(() => {
    loadSetups();
  }, []);

  // Filter setups when search or filters change
  useEffect(() => {
    filterSetups();
  }, [setups, searchQuery, selectedCategory, showActiveOnly]);

  const loadSetups = async () => {
    try {
      setLoading(true);
      const allSetups = await setupsService.getSetups();
      setSetups(allSetups);
    } catch (error) {
      console.error('Error loading setups:', error);
    } finally {
      setLoading(false);
    }
  };

  const filterSetups = () => {
    let filtered = [...setups];

    // Filter by search query
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(setup =>
        setup.name.toLowerCase().includes(query) ||
        setup.description?.toLowerCase().includes(query) ||
        setup.tags.some(tag => tag.toLowerCase().includes(query))
      );
    }

    // Filter by category
    if (selectedCategory !== 'all') {
      filtered = filtered.filter(setup => setup.category === selectedCategory);
    }

    // Filter by active status
    if (showActiveOnly) {
      filtered = filtered.filter(setup => setup.is_active);
    }

    setFilteredSetups(filtered);
  };

  const handleSetupCreated = (newSetup: SetupInDB) => {
    setSetups(prev => [newSetup, ...prev]);
    setIsCreateDialogOpen(false);
  };

  const handleSetupUpdated = (updatedSetup: SetupInDB) => {
    setSetups(prev => prev.map(setup => 
      setup.id === updatedSetup.id ? updatedSetup : setup
    ));
  };

  const handleSetupDeleted = (setupId: number) => {
    setSetups(prev => prev.filter(setup => setup.id !== setupId));
  };

  const handleEditSetup = (setup: SetupInDB) => {
    setSelectedSetup(setup);
    setIsEditDialogOpen(true);
  };

  const handleDeleteSetup = (setup: SetupInDB) => {
    setSelectedSetup(setup);
    setIsDeleteDialogOpen(true);
  };

  const getCategoryColor = (category: SetupCategory) => {
    const colors = {
      Breakout: 'bg-blue-100 text-blue-800',
      Pullback: 'bg-green-100 text-green-800',
      Reversal: 'bg-red-100 text-red-800',
      Continuation: 'bg-purple-100 text-purple-800',
      Range: 'bg-yellow-100 text-yellow-800',
      Other: 'bg-gray-100 text-gray-800'
    };
    return colors[category] || colors.Other;
  };

  if (loading) {
    return (
      <div className="h-screen flex flex-col">
        <div className="w-full border-b bg-background px-8 py-4 flex-shrink-0">
          <h1 className="text-2xl font-bold tracking-tight">Setups</h1>
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

  return (
    <div className="h-screen flex flex-col">
      {/* Header */}
      <div className="w-full border-b bg-background px-8 py-4 flex-shrink-0">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold tracking-tight">Setups</h1>
          <Button onClick={() => setIsCreateDialogOpen(true)}>
            <Plus className="mr-2 h-4 w-4" />
            New Setup
          </Button>
        </div>
      </div>

      {/* Filters and Search */}
      <div className="border-b bg-background px-8 py-4 flex-shrink-0">
        <div className="flex items-center space-x-4">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search setups..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10"
            />
          </div>
          
          <Select value={selectedCategory} onValueChange={(value) => setSelectedCategory(value as SetupCategory | 'all')}>
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="All Categories" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Categories</SelectItem>
              <SelectItem value="Breakout">Breakout</SelectItem>
              <SelectItem value="Pullback">Pullback</SelectItem>
              <SelectItem value="Reversal">Reversal</SelectItem>
              <SelectItem value="Continuation">Continuation</SelectItem>
              <SelectItem value="Range">Range</SelectItem>
              <SelectItem value="Other">Other</SelectItem>
            </SelectContent>
          </Select>

          <Button
            variant={showActiveOnly ? "default" : "outline"}
            onClick={() => setShowActiveOnly(!showActiveOnly)}
            size="sm"
          >
            <Filter className="mr-2 h-4 w-4" />
            {showActiveOnly ? 'Active Only' : 'All Setups'}
          </Button>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 overflow-hidden">
        <div className="h-full overflow-y-auto">
          <div className="p-8">
            {filteredSetups.length === 0 ? (
              <div className="text-center py-12">
                <div className="text-muted-foreground mb-4">
                  {setups.length === 0 ? (
                    <>
                      <h3 className="text-lg font-semibold mb-2">No setups created yet</h3>
                      <p className="text-sm">Create your first trading setup to get started</p>
                    </>
                  ) : (
                    <>
                      <h3 className="text-lg font-semibold mb-2">No setups match your filters</h3>
                      <p className="text-sm">Try adjusting your search or filter criteria</p>
                    </>
                  )}
                </div>
                {setups.length === 0 && (
                  <Button onClick={() => setIsCreateDialogOpen(true)}>
                    <Plus className="mr-2 h-4 w-4" />
                    Create First Setup
                  </Button>
                )}
              </div>
            ) : (
              <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
                {filteredSetups.map((setup) => (
                  <div
                    key={setup.id}
                    className="border rounded-lg p-6 hover:shadow-md transition-shadow"
                  >
                    <div className="flex items-start justify-between mb-4">
                      <div className="flex-1">
                        <h3 className="font-semibold text-lg mb-2">{setup.name}</h3>
                        <Badge className={getCategoryColor(setup.category)}>
                          {setup.category}
                        </Badge>
                      </div>
                      <div className="flex items-center space-x-2">
                        <div className={`w-3 h-3 rounded-full ${setup.is_active ? 'bg-green-500' : 'bg-gray-400'}`} />
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                              <MoreVertical className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => handleEditSetup(setup)}>
                              <Edit className="mr-2 h-4 w-4" />
                              Edit
                            </DropdownMenuItem>
                            <DropdownMenuItem 
                              onClick={() => handleDeleteSetup(setup)}
                              className="text-destructive"
                            >
                              <Trash2 className="mr-2 h-4 w-4" />
                              Delete
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    </div>
                    
                    {setup.description && (
                      <p className="text-muted-foreground text-sm mb-4 line-clamp-2">
                        {setup.description}
                      </p>
                    )}
                    
                    {setup.tags.length > 0 && (
                      <div className="flex flex-wrap gap-1 mb-4">
                        {setup.tags.slice(0, 3).map((tag, index) => (
                          <Badge key={index} variant="secondary" className="text-xs">
                            {tag}
                          </Badge>
                        ))}
                        {setup.tags.length > 3 && (
                          <Badge variant="secondary" className="text-xs">
                            +{setup.tags.length - 3}
                          </Badge>
                        )}
                      </div>
                    )}
                    
                    <div className="text-xs text-muted-foreground">
                      Created {new Date(setup.created_at).toLocaleDateString()}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Create Setup Dialog */}
      <SetupCreateDialog
        open={isCreateDialogOpen}
        onOpenChange={setIsCreateDialogOpen}
        onSetupCreated={handleSetupCreated}
      />

      {/* Edit Setup Dialog */}
      <SetupEditDialog
        open={isEditDialogOpen}
        onOpenChange={setIsEditDialogOpen}
        setup={selectedSetup}
        onSetupUpdated={handleSetupUpdated}
      />

      {/* Delete Setup Dialog */}
      <SetupDeleteDialog
        open={isDeleteDialogOpen}
        onOpenChange={setIsDeleteDialogOpen}
        setup={selectedSetup}
        onSetupDeleted={handleSetupDeleted}
      />
    </div>
  );
}