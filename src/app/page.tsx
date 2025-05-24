
// src/app/page.tsx
import * as React from 'react';
import { Suspense } from 'react'; // Import Suspense
import HomeClientContent from './home-client-content'; // Import the new client component
import { Skeleton } from '@/components/ui/skeleton';
import { Card, CardContent, CardHeader } from '@/components/ui/card';

// HomePageSkeleton remains the same or can be simplified if preferred
function HomePageSkeleton() {
  const ITEMS_PER_SECTION_STORES_CATEGORIES = 6;
  const ITEMS_PER_SECTION_PRODUCTS_COUPONS = 5;
  return (
    <div className="space-y-12 md:space-y-16 lg:space-y-20">
      {/* Banner Skeleton */}
      <Skeleton className="h-[250px] sm:h-[300px] md:h-[400px] w-full rounded-lg" />

      {/* Search Bar Skeleton */}
      <Card className="max-w-2xl mx-auto shadow-md border-2 border-primary/50 p-1 rounded-xl">
        <CardHeader className="pb-3 pt-4 text-center">
          <Skeleton className="h-7 w-3/4 mx-auto mb-1" />
        </CardHeader>
        <CardContent className="p-3 sm:p-4">
          <div className="flex gap-2 items-center">
            <Skeleton className="h-11 flex-grow rounded-md" />
            <Skeleton className="h-11 w-24 rounded-md" />
          </div>
        </CardContent>
      </Card>

      {/* Today's Picks Products Skeleton */}
      <section>
        <div className="flex justify-between items-center mb-4 md:mb-6"><Skeleton className="h-8 w-48" /></div>
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3 md:gap-4">
          {Array.from({ length: ITEMS_PER_SECTION_PRODUCTS_COUPONS }).map((_, i) => <Skeleton key={`tp-skel-${i}`} className="h-56 rounded-lg" />)}
        </div>
      </section>

      {/* Featured Stores Skeleton */}
      <section>
        <div className="flex justify-between items-center mb-4 md:mb-6"><Skeleton className="h-8 w-48" /><Skeleton className="h-8 w-24" /></div>
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3 md:gap-4">
          {Array.from({ length: ITEMS_PER_SECTION_STORES_CATEGORIES }).map((_, i) => <Skeleton key={`fs-skel-${i}`} className="h-36 rounded-lg" />)}
        </div>
      </section>

      {/* Top Coupons Skeleton */}
      <section>
        <div className="flex justify-between items-center mb-4 md:mb-6"><Skeleton className="h-8 w-48" /><Skeleton className="h-8 w-24" /></div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 md:gap-6">
          {Array.from({ length: ITEMS_PER_SECTION_PRODUCTS_COUPONS }).map((_, i) => <Skeleton key={`tc-skel-${i}`} className="h-40 rounded-lg" />)}
        </div>
      </section>

      {/* Popular Categories Skeleton */}
      <section>
        <div className="flex justify-between items-center mb-4 md:mb-6"><Skeleton className="h-8 w-48" /><Skeleton className="h-8 w-24" /></div>
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3 md:gap-4">
          {Array.from({ length: ITEMS_PER_SECTION_STORES_CATEGORIES }).map((_, i) => (
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


export default function HomePage() {
  return (
    <Suspense fallback={<HomePageSkeleton />}>
      <HomeClientContent />
    </Suspense>
  );
}
    
    