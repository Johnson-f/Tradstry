import React from 'react';
import { Skeleton } from '@/components/ui/skeleton';

interface TemplatesListSkeletonProps {
  count?: number;
}

export function TemplatesListSkeleton({ count = 4 }: TemplatesListSkeletonProps) {
  return (
    <div className="space-y-0">
      {Array.from({ length: count }).map((_, i) => (
        <div
          key={i}
          className="w-full flex flex-col items-start gap-2 border-b p-4 last:border-b-0"
        >
          {/* Template name and system badge */}
          <div className="flex w-full items-center gap-2">
            <Skeleton className="h-4 flex-1 max-w-[180px]" />
            <div className="flex items-center gap-1">
              {i % 3 === 0 && (
                <Skeleton className="h-5 w-12" />
              )}
              <Skeleton className="h-6 w-6" />
            </div>
          </div>
          
          {/* Date */}
          <Skeleton className="h-3 w-20" />
          
          {/* Description/preview */}
          <div className="space-y-1 w-full">
            <Skeleton className="h-3 w-full max-w-[240px]" />
            <Skeleton className="h-3 w-2/3 max-w-[160px]" />
          </div>
        </div>
      ))}
    </div>
  );
}
