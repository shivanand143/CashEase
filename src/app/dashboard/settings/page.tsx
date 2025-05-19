// src/app/dashboard/settings/page.tsx
// This is the Server Component shell

import * as React from 'react';
import SettingsClientContent from './settings-client-content'; // Import the client component
import { Skeleton } from '@/components/ui/skeleton';
import { Card, CardHeader, CardContent, CardTitle, CardDescription } from '@/components/ui/card';
import ProtectedRoute from '@/components/guards/protected-route';

function SettingsPageSkeleton() {
  return (
    <div className="space-y-8 max-w-3xl mx-auto">
      <Skeleton className="h-9 w-1/3" /> {/* Title "Account Settings" */}

      {/* Profile Information Card Skeleton */}
      <Card>
        <CardHeader>
          <Skeleton className="h-7 w-1/2 mb-1" /> {/* Card Title */}
          <Skeleton className="h-4 w-3/4" /> {/* Card Description */}
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Skeleton className="h-4 w-1/4" /> {/* Label */}
            <Skeleton className="h-10 w-full" /> {/* Input */}
          </div>
          <Skeleton className="h-10 w-32" /> {/* Button */}
        </CardContent>
      </Card>

      {/* Payout Details Card Skeleton */}
      <Card>
        <CardHeader>
          <Skeleton className="h-7 w-1/2 mb-1" />
          <Skeleton className="h-4 w-3/4" />
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Skeleton className="h-4 w-1/4" />
            <Skeleton className="h-10 w-full" />
          </div>
          <div className="space-y-2">
            <Skeleton className="h-4 w-1/4" />
            <Skeleton className="h-10 w-full" />
          </div>
          <Skeleton className="h-10 w-40" />
        </CardContent>
      </Card>


      {/* Change Email Card Skeleton */}
      <Card>
        <CardHeader>
          <Skeleton className="h-7 w-1/2 mb-1" />
          <Skeleton className="h-4 w-3/4" />
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Skeleton className="h-4 w-1/4" />
            <Skeleton className="h-10 w-full" />
          </div>
          <div className="space-y-2">
            <Skeleton className="h-4 w-1/4" />
            <Skeleton className="h-10 w-full" />
          </div>
          <Skeleton className="h-10 w-36" />
        </CardContent>
      </Card>

      {/* Change Password Card Skeleton */}
      <Card>
        <CardHeader>
          <Skeleton className="h-7 w-1/2 mb-1" />
          <Skeleton className="h-4 w-3/4" />
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Skeleton className="h-4 w-1/4" />
            <Skeleton className="h-10 w-full" />
          </div>
          <div className="space-y-2">
            <Skeleton className="h-4 w-1/4" />
            <Skeleton className="h-10 w-full" />
          </div>
          <div className="space-y-2">
            <Skeleton className="h-4 w-1/4" />
            <Skeleton className="h-10 w-full" />
          </div>
          <Skeleton className="h-10 w-40" />
        </CardContent>
      </Card>
    </div>
  );
}

export default function SettingsPage() {
  return (
    <ProtectedRoute>
      <React.Suspense fallback={<SettingsPageSkeleton />}>
        <SettingsClientContent />
      </React.Suspense>
    </ProtectedRoute>
  );
}
