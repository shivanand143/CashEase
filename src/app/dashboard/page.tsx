
// src/app/dashboard/page.tsx
// This is the Server Component shell

import * as React from 'react';
import DashboardClientContent from './dashboard-client-content'; // Ensure this path is correct
import { Skeleton } from '@/components/ui/skeleton';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'; // Card related imports
import ProtectedRoute from '@/components/guards/protected-route';

function DashboardPageSkeleton() {
  return (
    <div className="space-y-8">
      <Skeleton className="h-9 w-48" /> {/* Title "Dashboard" */}
      
      {/* Welcome Message Skeleton */}
      <Card>
        <CardHeader>
          <Skeleton className="h-7 w-3/4 mb-1" /> {/* Welcome Title */}
          <Skeleton className="h-4 w-1/2" />    {/* Welcome Description */}
        </CardHeader>
        <CardContent>
          <Skeleton className="h-4 w-full mb-2" /> {/* Welcome text */}
          <div className="flex flex-wrap gap-2">
            <Skeleton className="h-10 w-32" /> {/* Button */}
            <Skeleton className="h-10 w-32" /> {/* Button */}
          </div>
        </CardContent>
      </Card>

      {/* Summary Stats Skeleton */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, index) => (
          <Card key={index}>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <Skeleton className="h-4 w-24" /> {/* Stat title */}
              <Skeleton className="h-5 w-5 rounded-full" /> {/* Icon */}
            </CardHeader>
            <CardContent>
              <Skeleton className="h-7 w-32 mb-1" /> {/* Stat value */}
              <Skeleton className="h-3 w-40" /> {/* Stat description */}
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Quick Links Skeleton */}
      <Card>
        <CardHeader>
          <Skeleton className="h-6 w-1/2 mb-2" /> {/* Quick Links Title */}
          <Skeleton className="h-4 w-3/4" /> {/* Quick Links Description */}
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-2">
          {Array.from({ length: 6 }).map((_, index) => ( // Assuming 6 quick links
            <Skeleton key={`quicklink-skel-${index}`} className="h-12 w-full rounded-md" /> 
          ))}
        </CardContent>
      </Card>
    </div>
  );
}

export default function DashboardPage() {
  return (
    <ProtectedRoute>
      <React.Suspense fallback={<DashboardPageSkeleton />}>
        <DashboardClientContent />
      </React.Suspense>
    </ProtectedRoute>
  );
}
