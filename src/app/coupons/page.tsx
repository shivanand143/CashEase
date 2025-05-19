// src/app/coupons/page.tsx
// This is the Server Component shell

import * as React from 'react';
import CouponsClientContent from './coupons-client-content'; // Import the client component
import { Skeleton } from '@/components/ui/skeleton';
import { Card, CardHeader, CardContent } from '@/components/ui/card'; // Ensure Card imports

function CouponsPageSkeleton() {
  const COUPONS_PER_PAGE_SKELETON = 9;
  return (
    <div className="space-y-8">
      <Skeleton className="h-10 w-3/4 md:w-1/2 mx-auto" /> {/* Title */}
      <Skeleton className="h-5 w-full md:w-3/4 lg:w-1/2 mx-auto" /> {/* Subtitle */}

      <Card className="max-w-xl mx-auto shadow-sm border">
        <CardHeader className="pb-4 pt-4">
          <Skeleton className="h-6 w-1/3" /> {/* Card Title "Search Coupons" */}
          <Skeleton className="h-4 w-2/3" /> {/* Card Description */}
        </CardHeader>
        <CardContent className="pb-4">
          <Skeleton className="h-10 w-full" /> {/* Search Input */}
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 md:gap-6">
        {Array.from({ length: COUPONS_PER_PAGE_SKELETON }).map((_, index) => (
          <Skeleton key={`coupon-skel-${index}`} className="h-40 rounded-lg" />
        ))}
      </div>
    </div>
  );
}

export default function CouponsPage() {
  return (
    <React.Suspense fallback={<CouponsPageSkeleton />}>
      <CouponsClientContent />
    </React.Suspense>
  );
}
