// src/app/admin/banners/page.tsx
// This is the Server Component shell

import * as React from 'react';
import BannersClientContent from './banners-client-content'; // Import the client component
import { Skeleton } from '@/components/ui/skeleton';
import { Card, CardHeader, CardContent, CardTitle, CardDescription } from '@/components/ui/card';
import AdminGuard from '@/components/guards/admin-guard';

function BannersPageSkeleton() {
  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <Skeleton className="h-9 w-1/3" /> {/* Title */}
        <Skeleton className="h-10 w-36" /> {/* Add Button */}
      </div>
      <Card>
        <CardHeader>
          <Skeleton className="h-7 w-1/4 mb-1" /> {/* Card Title */}
          <Skeleton className="h-4 w-1/2" /> {/* Card Description */}
        </CardHeader>
        <CardContent className="space-y-4">
          {Array.from({ length: 3 }).map((_, index) => (
            <div key={index} className="flex items-center gap-4 p-4 border rounded-lg">
              <Skeleton className="h-8 w-8" /> {/* Drag Handle area */}
              <Skeleton className="h-[75px] w-[150px] rounded-md" /> {/* Image */}
              <div className="flex-grow space-y-2">
                <Skeleton className="h-4 w-3/4" /> {/* Title */}
                <Skeleton className="h-3 w-1/2" /> {/* Subtitle */}
                <Skeleton className="h-3 w-full" /> {/* Other info */}
              </div>
              <Skeleton className="h-8 w-8" /> {/* Edit Button */}
              <Skeleton className="h-8 w-8" /> {/* Delete Button */}
            </div>
          ))}
        </CardContent>
      </Card>
      {/* Dialog skeleton is tricky, usually not necessary if page skeleton is good */}
    </div>
  );
}

export default function AdminBannersPage() {
  return (
    <AdminGuard>
      <React.Suspense fallback={<BannersPageSkeleton />}>
        <BannersClientContent />
      </React.Suspense>
    </AdminGuard>
  );
}
