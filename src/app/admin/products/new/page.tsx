// src/app/admin/products/new/page.tsx
// This is the Server Component shell

import * as React from 'react';
import AddProductClientContent from './add-product-client-content'; // Import the client component
import { Skeleton } from '@/components/ui/skeleton';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import AdminGuard from '@/components/guards/admin-guard';

function AddProductPageSkeleton() {
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
        <CardContent className="grid md:grid-cols-2 gap-x-6 gap-y-4">
          {/* Loop for form fields - adjust count based on actual form complexity */}
          {Array.from({ length: 8 }).map((_, index) => (
            <div key={`form-field-skel-${index}`} className="space-y-1 md:col-span-${index < 4 ? 1 : 2}`}>
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

export default function AddProductAdminPage() {
  return (
    <AdminGuard>
      <React.Suspense fallback={<AddProductPageSkeleton />}>
        <AddProductClientContent />
      </React.Suspense>
    </AdminGuard>
  );
}
