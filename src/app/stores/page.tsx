
// src/app/stores/page.tsx
// This is the Server Component shell

import * as React from 'react';
import StoresClientContent from './stores-client-content'; // Import the client component
import { Skeleton } from '@/components/ui/skeleton';
import { Card, CardHeader, CardContent } from '@/components/ui/card'; // Make sure CardHeader, CardContent are imported

function StoresPageSkeleton() {
  const STORES_PER_PAGE_SKELETON = 12; // Number of skeletons to show
  return (
    <div className="space-y-8">
      <Skeleton className="h-10 w-3/4 md:w-1/2 mx-auto" /> {/* Title */}
      <Skeleton className="h-5 w-full md:w-3/4 lg:w-1/2 mx-auto" /> {/* Subtitle */}

      <Card className="max-w-xl mx-auto shadow-sm border">
        <CardHeader className="pb-4 pt-4">
          <Skeleton className="h-6 w-1/3" /> {/* Card Title "Search Stores" */}
        </CardHeader>
        <CardContent className="pb-4">
          <Skeleton className="h-10 w-full" /> {/* Search Input */}
        </CardContent>
      </Card>

      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4 md:gap-6">
        {Array.from({ length: STORES_PER_PAGE_SKELETON }).map((_, index) => (
          <Skeleton key={`store-skel-${index}`} className="h-48 rounded-lg" />
        ))}
      </div>
    </div>
  );
}

export default function StoresPage() {
  return (
    <React.Suspense fallback={<StoresPageSkeleton />}>
      <StoresClientContent />
    </React.Suspense>
  );
}
