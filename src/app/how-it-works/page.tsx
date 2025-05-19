// src/app/how-it-works/page.tsx
// This is the Server Component shell

import * as React from 'react';
import HowItWorksClientContent from './how-it-works-client-content'; // Import the client component
import { Skeleton } from '@/components/ui/skeleton';
import { Card, CardHeader, CardContent, CardTitle } from '@/components/ui/card'; // Import Card components

function HowItWorksPageSkeleton() {
  return (
    <div className="space-y-12">
      <section className="text-center">
        <Skeleton className="h-10 md:h-12 w-3/4 mx-auto mb-4" /> {/* Title */}
        <Skeleton className="h-5 md:h-6 w-1/2 mx-auto" /> {/* Subtitle */}
      </section>

      <section className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 md:gap-8 lg:gap-10">
        {Array.from({ length: 6 }).map((_, index) => (
          <Card key={index} className="flex flex-col text-center shadow-sm">
            <CardHeader className="items-center">
              <Skeleton className="w-16 h-16 rounded-full mb-4" /> {/* Icon placeholder */}
              <Skeleton className="h-6 w-3/4" /> {/* Step Title */}
            </CardHeader>
            <CardContent className="flex-grow flex flex-col items-center">
              <Skeleton className="aspect-[16/10] w-full max-w-xs rounded-md mb-4" /> {/* Image placeholder */}
              <Skeleton className="h-4 w-full mb-1" />
              <Skeleton className="h-4 w-5/6" />
            </CardContent>
          </Card>
        ))}
      </section>

      <section className="text-center py-10 bg-gradient-to-r from-primary/10 to-secondary/10 rounded-lg">
        <Skeleton className="h-8 w-3/4 mx-auto mb-4" /> {/* Section Title */}
        <Skeleton className="h-4 w-full max-w-xl mx-auto mb-6" />
        <Skeleton className="h-4 w-5/6 max-w-xl mx-auto mb-6" />
        <div className="flex flex-col sm:flex-row justify-center items-center gap-4">
          <Skeleton className="h-12 w-48" /> {/* Button */}
          <Skeleton className="h-12 w-40" /> {/* Button */}
        </div>
      </section>
    </div>
  );
}

export default function HowItWorksPage() {
  return (
    <React.Suspense fallback={<HowItWorksPageSkeleton />}>
      <HowItWorksClientContent />
    </React.Suspense>
  );
}
