import React from 'react';
import { Skeleton } from '@/components/ui/skeleton';

interface TagsListSkeletonProps {
  count?: number;
}

export function TagsListSkeleton({ count = 5 }: TagsListSkeletonProps) {
  return (
    <div className="space-y-0">
      {Array.from({ length: count }).map((_, i) => (
        <div
          key={i}
          className="w-full flex flex-col items-start gap-2 border-b p-4 last:border-b-0"
        >
          {/* Tag name, color dot, and count */}
          <div className="flex w-full items-center gap-2">
            <Skeleton className="w-3 h-3 rounded-full flex-shrink-0" />
            <Skeleton className="h-4 flex-1 max-w-[150px]" />
            <Skeleton className="h-5 w-8" />
            <Skeleton className="h-6 w-6" />
          </div>
          
          {/* Date */}
          <Skeleton className="h-3 w-20" />
        </div>
      ))}
    </div>
  );
}
