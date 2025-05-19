// src/app/dashboard/payout/page.tsx
// This is the Server Component shell

import * as React from 'react';
import PayoutClientContent from './payout-client-content'; // Import the client component
import { Skeleton } from '@/components/ui/skeleton';
import { Card, CardHeader, CardContent } from '@/components/ui/card';
import ProtectedRoute from '@/components/guards/protected-route';

function PayoutPageSkeleton() {
  return (
    <div className="space-y-8 max-w-2xl mx-auto">
      <Skeleton className="h-9 w-1/3" /> {/* Title */}

      <Card>
        <CardHeader>
          <Skeleton className="h-6 w-1/2 mb-2" /> {/* Card Title */}
          <Skeleton className="h-4 w-3/4" /> {/* Card Description */}
        </CardHeader>
        <CardContent>
          <Skeleton className="h-12 w-1/2" /> {/* Balance display */}
        </CardContent>
      </Card>

      {/* Skeleton for the form card or alert message */}
      <Card>
        <CardHeader>
          <Skeleton className="h-6 w-1/2 mb-2" />
          <Skeleton className="h-4 w-3/4" />
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="space-y-2">
            <Skeleton className="h-4 w-1/4" /> {/* Label */}
            <Skeleton className="h-10 w-full" /> {/* Input/Select */}
          </div>
          <div className="space-y-2">
            <Skeleton className="h-4 w-1/4" /> {/* Label */}
            <Skeleton className="h-10 w-full" /> {/* Input */}
          </div>
          <Skeleton className="h-10 w-full" /> {/* Button */}
        </CardContent>
      </Card>
    </div>
  );
}

export default function PayoutPage() {
  return (
    <ProtectedRoute>
      <React.Suspense fallback={<PayoutPageSkeleton />}>
        <PayoutClientContent />
      </React.Suspense>
    </ProtectedRoute>
  );
}
