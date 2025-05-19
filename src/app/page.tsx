// src/app/page.tsx
// This is the Server Component shell

import * as React from 'react';
import { Skeleton } from '@/components/ui/skeleton';
import { Card, CardContent, CardHeader } from '@/components/ui/card'; // Removed CardDescription as it wasn't used
import HomeClientContent from './home-client-content'; // Import the new client component

// HomePageSkeleton remains the same or can be simplified if preferred
function HomePageSkeleton() {
  return (
    <div className="container mx-auto px-4 py-8 space-y-12 md:space-y-16 lg:space-y-20">
      {/* Hero Section Skeleton */}
      <section className="text-center py-12 md:py-16 lg:py-20">
        <Skeleton className="h-12 w-3/4 mx-auto mb-4" />
        <Skeleton className="h-6 w-1/2 mx-auto mb-8" />
        <Card className="max-w-2xl mx-auto">
          <CardContent className="p-2 sm:p-3">
            <Skeleton className="h-12 w-full" />
          </CardContent>
        </Card>
        <div className="flex flex-col sm:flex-row justify-center items-center gap-4 mt-8">
          <Skeleton className="h-12 w-48" />
          <Skeleton className="h-12 w-40" />
        </div>
      </section>

      {/* How it Works Skeleton */}
      <section className="py-12 text-center">
        <Skeleton className="h-10 w-1/2 mx-auto mb-4" />
        <Skeleton className="h-5 w-3/4 mx-auto mb-8" />
        <div className="grid md:grid-cols-3 gap-6 md:gap-8">
          {[1, 2, 3].map((i) => (
            <div key={i} className="flex flex-col items-center space-y-2 p-4">
              <Skeleton className="h-16 w-16 rounded-full mb-3" />
              <Skeleton className="h-6 w-3/4" />
              <Skeleton className="h-4 w-full" />
            </div>
          ))}
        </div>
        <Skeleton className="h-10 w-32 mt-6 mx-auto" />
      </section>

      {/* Sections Skeletons (e.g., Today's Picks, Featured Stores, etc.) */}
      {['Today\'s Picks', 'Featured Stores', 'Top Coupons', 'Popular Categories'].map((title) => (
        <section key={title}>
          <div className="flex justify-between items-center mb-6 md:mb-8">
            <Skeleton className="h-10 w-1/3" />
            <Skeleton className="h-9 w-28" />
          </div>
          <div className={`grid ${title === 'Top Coupons' ? 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3' : 'grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6'} gap-4 md:gap-6`}>
            {Array.from({ length: title === 'Top Coupons' ? 3 : 6 }).map((_, index) => (
              <Skeleton key={`${title}-skel-${index}`} className={title === 'Top Coupons' ? "h-40 rounded-lg" : "h-48 rounded-lg"} />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

export default function Page() {
  return (
    <React.Suspense fallback={<HomePageSkeleton />}>
      <HomeClientContent />
    </React.Suspense>
  );
}
