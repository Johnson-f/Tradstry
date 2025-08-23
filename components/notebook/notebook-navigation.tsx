"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useMemo } from "react";
import { 
  Home, Calendar, FileText, Settings, Menu, Star, 
  Trash2, Users, Tag, FolderOpen, BookTemplate, Upload 
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { useFolders } from "@/lib/hooks/use-notes";
import { Folder } from "@/lib/types/notes";

// Map folder slugs to appropriate icons
const getFolderIcon = (slug: string) => {
  switch (slug) {
    case 'home':
      return Home;
    case 'favorites':
      return Star;
    case 'notes':
      return FileText;
    case 'calendar':
      return Calendar;
    case 'templates':
      return BookTemplate;
    case 'tags':
      return Tag;
    case 'files':
      return Upload;
    case 'trash':
      return Trash2;
    case 'shared-with-me':
      return Users;
    default:
      return FolderOpen;
  }
};

const FOLDERS_QUERY_PARAMS = { is_system: true, sort_by: 'name', sort_order: 'ASC' } as const;

export function NotebookNavigation() {
  const pathname = usePathname();
  const { data: folders = [], isLoading } = useFolders(FOLDERS_QUERY_PARAMS);

  const folderItems = useMemo(() => {
    return folders.map((folder: Folder) => {
      const isActive = folder.slug === 'home' 
        ? pathname === '/protected/notebook' || pathname === '/protected/notebook/folder/home'
        : pathname === `/protected/notebook/folder/${folder.slug}`;
        
      return {
        ...folder,
        IconComponent: getFolderIcon(folder.slug),
        href: folder.slug === 'home' ? '/protected/notebook' : `/protected/notebook/folder/${folder.slug}`,
        active: isActive
      };
    });
  }, [folders, pathname]);

  if (isLoading) {
    return (
      <div className="flex h-screen w-16 flex-col items-center border-r bg-background py-4">
        <Button variant="ghost" size="icon" className="mb-8">
          <Menu className="h-5 w-5" />
        </Button>
        <div className="flex flex-1 flex-col items-center space-y-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-12 w-12 rounded-lg bg-muted animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <TooltipProvider>
      <div className="flex h-screen w-16 flex-col items-center border-r bg-background py-4">
        <Button variant="ghost" size="icon" className="mb-8">
          <Menu className="h-5 w-5" />
        </Button>
        
        <nav className="flex flex-1 flex-col items-center space-y-4">
          {folderItems.map((item) => (
            <Tooltip key={item.id}>
              <TooltipTrigger asChild>
                <Button
                  asChild
                  variant="ghost"
                  size="icon"
                  className={cn(
                    "h-12 w-12 rounded-lg transition-colors",
                    item.active
                      ? "bg-primary/10 text-primary"
                      : "text-muted-foreground hover:bg-muted/50"
                  )}
                >
                  <Link href={item.href}>
                    <item.IconComponent className="h-5 w-5" />
                    <span className="sr-only">{item.name}</span>
                  </Link>
                </Button>
              </TooltipTrigger>
              <TooltipContent side="right" className="font-medium">
                {item.name}
                {item.description && (
                  <div className="text-xs text-muted-foreground mt-1">
                    {item.description}
                  </div>
                )}
              </TooltipContent>
            </Tooltip>
          ))}
          
          {/* Settings at the bottom of navigation */}
          <div className="flex-1" />
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                asChild
                variant="ghost"
                size="icon"
                className="h-12 w-12 rounded-lg text-muted-foreground hover:bg-muted/50"
              >
                <Link href="/protected/notebook/settings">
                  <Settings className="h-5 w-5" />
                  <span className="sr-only">Settings</span>
                </Link>
              </Button>
            </TooltipTrigger>
            <TooltipContent side="right" className="font-medium">
              Settings
            </TooltipContent>
          </Tooltip>
        </nav>
        
        <div className="mt-4">
          <div className="h-10 w-10 rounded-full bg-muted"></div>
        </div>
      </div>
    </TooltipProvider>
  );
}