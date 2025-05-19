// src/app/categories/page.tsx
// This is the Server Component shell

import * as React from 'react';
import CategoriesClientContent from './categories-client-content'; // Import the client component
import { Skeleton } from '@/components/ui/skeleton';
// Card components are used within the client content's rendering logic, not directly in the skeleton usually.

function CategoriesPageSkeleton() {
  return (
    <div className="space-y-8">
      <Skeleton className="h-10 w-3/4 md:w-1/2 mx-auto" /> {/* Title */}
      <Skeleton className="h-5 w-full md:w-3/4 lg:w-1/2 mx-auto" /> {/* Subtitle */}

      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4 md:gap-6">
        {Array.from({ length: 12 }).map((_, index) => (
          <Skeleton key={index} className="h-36 rounded-lg" />
        ))}
      </div>
    </div>
  );
}

export default function CategoriesPage() {
  return (
    <React.Suspense fallback={<CategoriesPageSkeleton />}>
      <CategoriesClientContent />
    </React.Suspense>
  );
}
