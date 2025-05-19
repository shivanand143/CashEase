// src/app/admin/reports/page.tsx
// This is the Server Component shell

import * as React from 'react';
import ReportsClientContent from './reports-client-content'; // Import the client component
import { Skeleton } from '@/components/ui/skeleton';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import AdminGuard from '@/components/guards/admin-guard';

function ReportsPageSkeleton() {
  return (
    <div className="space-y-8">
      <Skeleton className="h-9 w-1/3" /> {/* Title "Reports" */}

      <Card>
        <CardHeader>
          <Skeleton className="h-7 w-1/2 mb-1" /> {/* Card Title "Generate Report" */}
          <Skeleton className="h-4 w-3/4" /> {/* Card Description */}
        </CardHeader>
        <CardContent className="flex flex-col sm:flex-row gap-4 items-end">
          <div className="flex-1 space-y-2">
            <Skeleton className="h-4 w-1/4" /> {/* Label */}
            <Skeleton className="h-10 w-full" /> {/* Select */}
          </div>
          <div className="space-y-2">
            <Skeleton className="h-4 w-1/4" /> {/* Label */}
            <Skeleton className="h-10 w-full sm:w-[300px]" /> {/* Date Range Picker */}
          </div>
          <Skeleton className="h-10 w-24" /> {/* Generate Button */}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <Skeleton className="h-7 w-1/2 mb-1" /> {/* Report Title */}
          <Skeleton className="h-4 w-3/4" /> {/* Report Description */}
        </CardHeader>
        <CardContent className="min-h-[300px] flex items-center justify-center">
          <div className="text-center space-y-2">
            <Skeleton className="h-10 w-10 mx-auto rounded-full" /> {/* Icon Placeholder */}
            <Skeleton className="h-5 w-1/2 mx-auto" /> {/* Text Placeholder */}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

export default function AdminReportsPage() {
  return (
    <AdminGuard>
      <React.Suspense fallback={<ReportsPageSkeleton />}>
        <ReportsClientContent />
      </React.Suspense>
    </AdminGuard>
  );
}
