"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { 
  Plus, 
  FileText, 
  MoreVertical, 
  Edit, 
  Trash2, 
  Copy,
  Shield
} from "lucide-react";
import { 
  useTemplates, 
  useCreateTemplate, 
  useUpdateTemplate, 
  useDeleteTemplate 
} from "@/lib/hooks/use-notes";
import { toast } from "sonner";
import { Template } from "@/lib/types/notes";

interface TemplateManagerProps {
  onTemplateSelect?: (template: Template) => void;
}

export function TemplateManager({ onTemplateSelect }: TemplateManagerProps) {
  const { data: templates = [], isLoading, refetch } = useTemplates();
  const createTemplateMutation = useCreateTemplate();
  const updateTemplateMutation = useUpdateTemplate();
  const deleteTemplateMutation = useDeleteTemplate();

  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);

  const [newTemplate, setNewTemplate] = useState({
    name: "",
    description: "",
    content: "",
  });

  const [editingTemplate, setEditingTemplate] = useState<Template | null>(null);
  const [editTemplate, setEditTemplate] = useState({
    name: "",
    description: "",
    content: "",
  });

  const [templateToDelete, setTemplateToDelete] = useState<Template | null>(null);

  const systemTemplates = templates.filter(t => t.is_system);
  const userTemplates = templates.filter(t => !t.is_system);

  const handleCreateTemplate = async () => {
    if (!newTemplate.name.trim()) return;

    try {
      await createTemplateMutation.mutateAsync({
        name: newTemplate.name,
        description: newTemplate.description || null,
        content: { text: newTemplate.content },
      });

      setIsCreateDialogOpen(false);
      setNewTemplate({ name: "", description: "", content: "" });
      
      toast.success("Template created", {
        description: `Template "${newTemplate.name}" has been created successfully.`,
      });
      
      refetch();
    } catch (error) {
      toast.error("Error", {
        description: "Failed to create template. Please try again.",
      });
    }
  };

  const handleUpdateTemplate = async () => {
    if (!editingTemplate || !editTemplate.name.trim()) return;

    try {
      await updateTemplateMutation.mutateAsync({
        templateId: editingTemplate.id,
        template: {
          name: editTemplate.name,
          description: editTemplate.description || null,
          content: { text: editTemplate.content },
        },
      });

      setIsEditDialogOpen(false);
      setEditingTemplate(null);
      
      toast.success("Template updated", {
        description: `Template "${editTemplate.name}" has been updated successfully.`,
      });
      
      refetch();
    } catch (error) {
      toast.error("Error", {
        description: "Failed to update template. Please try again.",
      });
    }
  };

  const handleDeleteTemplate = async () => {
    if (!templateToDelete || templateToDelete.is_system) return;

    try {
      await deleteTemplateMutation.mutateAsync(templateToDelete.id);
      
      setIsDeleteDialogOpen(false);
      setTemplateToDelete(null);
      
      toast.success("Template deleted", {
        description: "The template has been deleted successfully.",
      });
      
      refetch();
    } catch (error) {
      toast.error("Error", {
        description: "Failed to delete template. Please try again.",
      });
    }
  };

  const handleEditClick = (template: Template) => {
    setEditingTemplate(template);
    setEditTemplate({
      name: template.name,
      description: template.description || "",
      content: typeof template.content === 'string' 
        ? template.content 
        : template.content?.text || JSON.stringify(template.content),
    });
    setIsEditDialogOpen(true);
  };

  const handleDeleteClick = (template: Template) => {
    setTemplateToDelete(template);
    setIsDeleteDialogOpen(true);
  };

  const handleUseTemplate = (template: Template) => {
    if (onTemplateSelect) {
      onTemplateSelect(template);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-8">
        <div className="h-8 w-8 animate-spin rounded-full border-b-2 border-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <Button
        onClick={() => setIsCreateDialogOpen(true)}
        className="w-full justify-start gap-2"
      >
        <Plus className="h-4 w-4" />
        New Template
      </Button>

      <ScrollArea className="h-[calc(100vh-200px)]">
        {templates.length === 0 ? (
          <div className="text-center py-8">
            <FileText className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
            <p className="text-muted-foreground">No templates yet</p>
            <p className="text-sm text-muted-foreground mt-2">
              Create your first template to reuse content
            </p>
          </div>
        ) : (
          <div className="space-y-6">
            {/* System Templates */}
            {systemTemplates.length > 0 && (
              <div>
                <h3 className="text-sm font-medium text-muted-foreground mb-3 flex items-center gap-2">
                  <Shield className="h-4 w-4" />
                  System Templates
                </h3>
                <div className="space-y-2">
                  {systemTemplates.map((template) => (
                    <TemplateCard
                      key={template.id}
                      template={template}
                      onEdit={template.is_system ? undefined : handleEditClick}
                      onDelete={undefined}
                      onUse={handleUseTemplate}
                    />
                  ))}
                </div>
              </div>
            )}

            {/* User Templates */}
            {userTemplates.length > 0 && (
              <div>
                <h3 className="text-sm font-medium text-muted-foreground mb-3">
                  My Templates
                </h3>
                <div className="space-y-2">
                  {userTemplates.map((template) => (
                    <TemplateCard
                      key={template.id}
                      template={template}
                      onEdit={handleEditClick}
                      onDelete={handleDeleteClick}
                      onUse={handleUseTemplate}
                    />
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </ScrollArea>

      {/* Create Template Dialog */}
      <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Create New Template</DialogTitle>
            <DialogDescription>
              Create a reusable template for your notes.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <Input
              placeholder="Template name"
              value={newTemplate.name}
              onChange={(e) => setNewTemplate({ ...newTemplate, name: e.target.value })}
            />
            <Input
              placeholder="Description (optional)"
              value={newTemplate.description}
              onChange={(e) => setNewTemplate({ ...newTemplate, description: e.target.value })}
            />
            <Textarea
              placeholder="Template content"
              value={newTemplate.content}
              onChange={(e) => setNewTemplate({ ...newTemplate, content: e.target.value })}
              rows={10}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsCreateDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleCreateTemplate} disabled={!newTemplate.name.trim()}>
              Create Template
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Template Dialog */}
      <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Edit Template</DialogTitle>
            <DialogDescription>
              Modify the template details and content.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <Input
              placeholder="Template name"
              value={editTemplate.name}
              onChange={(e) => setEditTemplate({ ...editTemplate, name: e.target.value })}
              disabled={editingTemplate?.is_system}
            />
            <Input
              placeholder="Description (optional)"
              value={editTemplate.description}
              onChange={(e) => setEditTemplate({ ...editTemplate, description: e.target.value })}
              disabled={editingTemplate?.is_system}
            />
            <Textarea
              placeholder="Template content"
              value={editTemplate.content}
              onChange={(e) => setEditTemplate({ ...editTemplate, content: e.target.value })}
              rows={10}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsEditDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleUpdateTemplate} disabled={!editTemplate.name.trim()}>
              Save Changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Template Dialog */}
      <Dialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Template</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete the template "{templateToDelete?.name}"? 
              This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsDeleteDialogOpen(false)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleDeleteTemplate}>
              Delete Template
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

interface TemplateCardProps {
  template: Template;
  onEdit?: (template: Template) => void;
  onDelete?: (template: Template) => void;
  onUse: (template: Template) => void;
}

function TemplateCard({ template, onEdit, onDelete, onUse }: TemplateCardProps) {
  return (
    <div className="p-4 rounded-lg border hover:bg-muted/50 transition-colors group">
      <div className="flex justify-between items-start mb-2">
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <h4 className="font-medium">{template.name}</h4>
            {template.is_system && (
              <Badge variant="secondary" className="text-xs">
                System
              </Badge>
            )}
          </div>
          {template.description && (
            <p className="text-sm text-muted-foreground mt-1">
              {template.description}
            </p>
          )}
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 opacity-0 group-hover:opacity-100"
            >
              <MoreVertical className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => onUse(template)}>
              <Copy className="mr-2 h-4 w-4" />
              Use Template
            </DropdownMenuItem>
            {onEdit && !template.is_system && (
              <DropdownMenuItem onClick={() => onEdit(template)}>
                <Edit className="mr-2 h-4 w-4" />
                Edit
              </DropdownMenuItem>
            )}
            {onDelete && !template.is_system && (
              <DropdownMenuItem
                onClick={() => onDelete(template)}
                className="text-destructive"
              >
                <Trash2 className="mr-2 h-4 w-4" />
                Delete
              </DropdownMenuItem>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
}
