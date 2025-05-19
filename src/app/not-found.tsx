// src/app/not-found.tsx
// This is now a Server Component shell.
// The original NotFound content is moved to NotFoundClientContent.

import * as React from 'react';
import NotFoundClientContent from './not-found-client-content';
import { Skeleton } from '@/components/ui/skeleton';

function NotFoundSkeleton() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[calc(100vh-20rem)] text-center px-4">
      <Skeleton className="w-24 h-24 rounded-full mb-6" /> {/* Icon placeholder */}
      <Skeleton className="h-10 w-3/4 md:w-1/2 mb-2" /> {/* Title */}
      <Skeleton className="h-5 w-full md:w-3/4 lg:w-1/2 mb-8" /> {/* Message */}
      <Skeleton className="h-10 w-36" /> {/* Button */}
    </div>
  );
}

export default function NotFoundPage() {
  return (
    <React.Suspense fallback={<NotFoundSkeleton />}>
      <NotFoundClientContent />
    </React.Suspense>
  );
}
