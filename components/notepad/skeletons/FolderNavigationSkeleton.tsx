import React from 'react';
import { Skeleton } from '@/components/ui/skeleton';

export function FolderNavigationSkeleton() {
  return (
    <div className="flex justify-center py-4">
      <div className="space-y-3">
        {Array.from({ length: 8 }).map((_, i) => (
          <Skeleton key={i} className="w-8 h-8 rounded-lg" />
        ))}
      </div>
    </div>
  );
}
