// src/app/admin/page.tsx
// This is the Server Component shell

import * as React from 'react';
import AdminOverviewClientContent from './admin-overview-client-content'; // Import the client component
import { Skeleton } from '@/components/ui/skeleton';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import AdminGuard from '@/components/guards/admin-guard';

function AdminOverviewPageSkeleton() {
  return (
    <div className="space-y-8">
      <Skeleton className="h-9 w-1/3" /> {/* Title "Admin Overview" */}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {Array.from({ length: 8 }).map((_, index) => (
          <Card key={index} className="shadow-sm">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <Skeleton className="h-4 w-20" /> {/* Stat title */}
              <Skeleton className="h-5 w-5 rounded-full" /> {/* Icon */}
            </CardHeader>
            <CardContent>
              <Skeleton className="h-8 w-16 mb-1" /> {/* Stat value */}
              <Skeleton className="h-3 w-24" /> {/* Stat link text */}
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader>
          <Skeleton className="h-7 w-1/4 mb-1" /> {/* Quick Actions Title */}
          <Skeleton className="h-4 w-1/2" /> {/* Quick Actions Description */}
        </CardHeader>
        <CardContent className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, index) => (
            <Skeleton key={`action-skel-${index}`} className="h-10 w-full" /> /* Button */
          ))}
        </CardContent>
      </Card>
    </div>
  );
}

export default function AdminOverviewPage() {
  return (
    <AdminGuard>
      <React.Suspense fallback={<AdminOverviewPageSkeleton />}>
        <AdminOverviewClientContent />
      </React.Suspense>
    </AdminGuard>
  );
}
