
// src/app/dashboard/referrals/page.tsx
"use client"; // Server component shell

import * as React from 'react';
import ReferralsClientContent from './referrals-client-content'; // Import the new client component
import { Skeleton } from '@/components/ui/skeleton';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/card'; // Ensure CardFooter is imported

function ReferralsPageSkeleton() {
    return (
        <div className="space-y-8 max-w-3xl mx-auto">
             <Skeleton className="h-9 w-1/3" />

             <Card className="shadow-lg">
                 <CardHeader>
                     <Skeleton className="h-7 w-3/4 mb-2" />
                     <Skeleton className="h-4 w-full" />
                     <Skeleton className="h-4 w-5/6" />
                 </CardHeader>
                 <CardContent className="space-y-6">
                    <div className="space-y-2">
                        <Skeleton className="h-5 w-1/4" />
                        <div className="flex items-center gap-2">
                            <Skeleton className="h-10 flex-grow" />
                            <Skeleton className="h-10 w-10" />
                            <Skeleton className="h-10 w-10" />
                        </div>
                    </div>
                     <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-4 border-t">
                        <Skeleton className="h-16 w-full" />
                        <Skeleton className="h-16 w-full" />
                     </div>
                 </CardContent>
                 <CardFooter>
                    <Skeleton className="h-3 w-1/2" />
                 </CardFooter>
             </Card>

             <Card>
                  <CardHeader>
                    <Skeleton className="h-6 w-1/2" />
                  </CardHeader>
                  <CardContent className="space-y-3">
                     <Skeleton className="h-4 w-full" />
                     <Skeleton className="h-4 w-full" />
                     <Skeleton className="h-4 w-full" />
                     <Skeleton className="h-4 w-full" />
                  </CardContent>
               </Card>
        </div>
    );
}

export default function ReferralsPage() {
  return (
    <React.Suspense fallback={<ReferralsPageSkeleton />}>
      <ReferralsClientContent />
    </React.Suspense>
  );
}

    