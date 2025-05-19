
"use client"; // Server component shell

import * as React from 'react';
import BlogClientContent from './blog-client-content'; // Import the new client component
import { Skeleton } from '@/components/ui/skeleton';
import { Card, CardHeader, CardFooter } from '@/components/ui/card'; // Ensure imports are correct

// Skeleton for the Blog Page (List of Posts)
function BlogPageSkeleton() {
  return (
    <div className="space-y-8">
      <Skeleton className="h-10 w-1/2 mx-auto" /> {/* Title "CashEase Blog" */}
      <Skeleton className="h-5 w-3/4 mx-auto mb-8" /> {/* Subtitle */}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {Array.from({ length: 6 }).map((_, index) => (
          <Card key={index} className="overflow-hidden">
            <Skeleton className="h-48 w-full" />
            <CardHeader>
              <Skeleton className="h-6 w-3/4 mb-2" />
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-1/2" />
            </CardHeader>
            <CardFooter>
              <Skeleton className="h-8 w-24" />
            </CardFooter>
          </Card>
        ))}
      </div>
    </div>
  );
}

export default function BlogPage() {
  return (
    <React.Suspense fallback={<BlogPageSkeleton />}>
      <BlogClientContent />
    </React.Suspense>
  );
}

    