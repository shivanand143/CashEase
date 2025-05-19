// src/app/page.tsx
// This is the Server Component shell

import * as React from 'react';
import { Skeleton } from '@/components/ui/skeleton';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'; // Card related imports
import HomeClientContent from './home-client-content'; // Import the new client component

// HomePageSkeleton remains the same or can be simplified if preferred
function HomePageSkeleton() {
  const ITEMS_PER_SECTION = 6;
  const COUPONS_PRODUCTS_LIMIT = 3;

  return (
    <div className="space-y-12 md:space-y-16 lg:space-y-20">
      {/* Banners Carousel Skeleton */}
      <section className="relative -mx-4 sm:-mx-6 md:-mx-0">
        <Skeleton className="h-[250px] sm:h-[300px] md:h-[400px] w-full rounded-lg" />
      </section>

      {/* Search Bar Section Skeleton */}
      <section className="py-6 md:py-8">
          <Card className="max-w-2xl mx-auto shadow-md border-2 border-primary/50 p-1 bg-gradient-to-r from-primary/5 via-background to-secondary/5 rounded-xl">
              <CardHeader className="pb-3 pt-4 text-center">
                  <Skeleton className="h-7 w-3/4 mx-auto mb-1" /> {/* CardTitle */}
                  <Skeleton className="h-4 w-1/2 mx-auto" /> {/* CardDescription */}
              </CardHeader>
              <CardContent className="p-3 sm:p-4">
                  <div className="flex gap-2 items-center">
                      <Skeleton className="h-11 flex-grow rounded-md" /> {/* Input */}
                      <Skeleton className="h-11 w-24 rounded-md" /> {/* Button */}
                  </div>
              </CardContent>
          </Card>
      </section>

      {/* Today's Picks (Products) Skeleton */}
      <section>
        <div className="flex justify-between items-center mb-4 md:mb-6"><Skeleton className="h-8 w-48" /><Skeleton className="h-8 w-24 hidden sm:block" /></div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 md:gap-6">
            {Array.from({ length: COUPONS_PRODUCTS_LIMIT }).map((_, i) => <Skeleton key={`tp-skel-${i}`} className="h-72 rounded-lg" />)}
        </div>
      </section>

      {/* Featured Stores Skeleton */}
      <section>
        <div className="flex justify-between items-center mb-4 md:mb-6"><Skeleton className="h-8 w-48" /><Skeleton className="h-8 w-24" /></div>
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3 md:gap-4">
            {Array.from({ length: ITEMS_PER_SECTION }).map((_, i) => <Skeleton key={`fs-skel-${i}`} className="h-40 rounded-lg" />)}
        </div>
      </section>

      {/* Top Coupons & Offers Skeleton */}
      <section>
        <div className="flex justify-between items-center mb-4 md:mb-6"><Skeleton className="h-8 w-48" /><Skeleton className="h-8 w-24" /></div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 md:gap-6">
            {Array.from({ length: COUPONS_PRODUCTS_LIMIT }).map((_, i) => <Skeleton key={`tc-skel-${i}`} className="h-44 rounded-lg" />)}
        </div>
      </section>

      {/* Popular Categories Skeleton */}
      <section>
        <div className="flex justify-between items-center mb-4 md:mb-6"><Skeleton className="h-8 w-48" /><Skeleton className="h-8 w-24" /></div>
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3 md:gap-4">
            {Array.from({ length: ITEMS_PER_SECTION }).map((_, i) => (
                <div key={`pc-skel-${i}`} className="flex flex-col items-center p-2 border rounded-lg bg-card shadow-sm">
                    <Skeleton className="w-16 h-16 rounded-full mb-2" />
                    <Skeleton className="h-4 w-20" />
                </div>
            ))}
        </div>
      </section>
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
