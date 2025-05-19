
// src/app/search/page.tsx
// This is now a Server Component shell that uses Suspense.

import * as React from 'react';
import SearchPageClientContent from './search-client-content';
import { Skeleton } from '@/components/ui/skeleton';
import { AlertCircle, Search as SearchIconLucide, ShoppingBag, Tag } from 'lucide-react'; // Renamed Search to avoid conflict

function SearchPageSkeleton() {
  return (
    <div className="space-y-8">
      <Skeleton className="h-10 w-3/4 md:w-1/2" /> {/* Title "Search Results for..." */}
      <div className="space-y-10">
        <section>
          <Skeleton className="h-8 w-1/3 mb-4" /> {/* Section Title "Matching Stores" */}
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4 md:gap-6">
            {Array.from({ length: 6 }).map((_, index) => (
              <Skeleton key={`store-skel-${index}`} className="h-48 rounded-lg" />
            ))}
          </div>
        </section>
        <section>
          <Skeleton className="h-8 w-1/3 mb-4" /> {/* Section Title "Matching Coupons" */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 md:gap-6">
            {Array.from({ length: 3 }).map((_, index) => (
              <Skeleton key={`coupon-skel-${index}`} className="h-40 rounded-lg" />
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}

export default function SearchPage() {
  return (
    // The key for Suspense should ideally be dynamic if searchParams change,
    // to ensure the component re-suspends correctly.
    // However, useSearchParams() is client-side, so we rely on Next.js navigation
    // to re-render the page which will re-trigger Suspense.
    <React.Suspense fallback={<SearchPageSkeleton />}>
      <SearchPageClientContent />
    </React.Suspense>
  );
}
