// src/app/admin/stores/new/page.tsx
// This is the Server Component shell

import * as React from 'react';
import AddStoreClientContent from './add-store-client-content'; // Import the client component
import { Skeleton } from '@/components/ui/skeleton';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import AdminGuard from '@/components/guards/admin-guard';

function AddStorePageSkeleton() {
  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Skeleton className="h-10 w-10 rounded-md" /> {/* Back Button */}
        <Skeleton className="h-9 w-1/2" /> {/* Title */}
      </div>

      <Card>
        <CardHeader>
          <Skeleton className="h-7 w-1/3 mb-1" /> {/* Card Title */}
          <Skeleton className="h-4 w-2/3" /> {/* Card Description */}
        </CardHeader>
        <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-4">
          {/* Simulate multiple form fields */}
          {Array.from({ length: 10 }).map((_, index) => (
            <div key={`store-form-skel-${index}`} className="space-y-1 md:col-span-1">
              <Skeleton className="h-4 w-1/4" /> {/* Label */}
              <Skeleton className="h-10 w-full" /> {/* Input/Select/Textarea */}
            </div>
          ))}
          <div className="md:col-span-2 space-y-3 pt-2"> {/* Checkboxes */}
            <Skeleton className="h-5 w-1/2" />
            <Skeleton className="h-5 w-1/2" />
            <Skeleton className="h-5 w-1/2" />
          </div>
          <div className="md:col-span-2 flex justify-end gap-2 pt-4">
            <Skeleton className="h-10 w-24" /> {/* Cancel Button */}
            <Skeleton className="h-10 w-32" /> {/* Submit Button */}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

export default function AddStorePage() {
  return (
    <AdminGuard>
      <React.Suspense fallback={<AddStorePageSkeleton />}>
        <AddStoreClientContent />
      </React.Suspense>
    </AdminGuard>
  );
}
