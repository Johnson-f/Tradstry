import React from 'react';
import { Skeleton } from '@/components/ui/skeleton';

interface NotesListSkeletonProps {
  count?: number;
}

export function NotesListSkeleton({ count = 6 }: NotesListSkeletonProps) {
  return (
    <div className="space-y-0">
      {Array.from({ length: count }).map((_, i) => (
        <div
          key={i}
          className="w-full flex flex-col items-start gap-2 border-b p-4 last:border-b-0"
        >
          {/* Title and status indicators */}
          <div className="flex w-full items-center gap-2">
            <Skeleton className="h-4 flex-1 max-w-[200px]" />
            <div className="flex items-center gap-1">
              <Skeleton className="h-3 w-3 rounded" />
              <Skeleton className="h-2 w-2 rounded-full" />
            </div>
          </div>
          
          {/* Date */}
          <Skeleton className="h-3 w-20" />
          
          {/* Preview text */}
          <div className="space-y-1 w-full">
            <Skeleton className="h-3 w-full max-w-[260px]" />
            <Skeleton className="h-3 w-3/4 max-w-[195px]" />
          </div>
        </div>
      ))}
    </div>
  );
}
