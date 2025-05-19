// src/app/about/page.tsx
// This is the Server Component shell

import * as React from 'react';
import AboutClientContent from './about-client-content'; // Import the client component
import { Skeleton } from '@/components/ui/skeleton';
import { Card, CardHeader, CardContent } from '@/components/ui/card'; // Added CardHeader, CardContent

function AboutPageSkeleton() {
  return (
    <div className="space-y-12">
      {/* Hero Section Skeleton */}
      <section className="relative text-center py-16 md:py-24 bg-gradient-to-b from-primary/10 via-background to-secondary/10 rounded-lg overflow-hidden border border-border/30 shadow-sm">
        <div className="container relative z-10">
          <Skeleton className="h-12 md:h-16 w-3/4 mx-auto mb-4" /> {/* Title */}
          <Skeleton className="h-6 md:h-7 w-1/2 mx-auto" /> {/* Subtitle */}
        </div>
      </section>

      {/* Our Mission Skeleton */}
      <section className="container grid md:grid-cols-2 gap-10 items-center">
        <div className="order-last md:order-first space-y-3">
          <Skeleton className="h-8 w-1/3 mb-4" /> {/* Section Title */}
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-5/6" />
        </div>
        <div className="flex justify-center">
          <Skeleton className="w-[500px] h-[350px] rounded-lg shadow-md" /> {/* Image Placeholder */}
        </div>
      </section>

      {/* Why Choose Us Skeleton */}
      <section className="container py-12 bg-muted/50 rounded-lg border border-border/50">
        <Skeleton className="h-8 w-1/2 mx-auto mb-10" /> {/* Section Title */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 md:gap-8">
          {Array.from({ length: 4 }).map((_, index) => (
            <div key={`why-skel-${index}`} className="text-center p-4 space-y-2">
              <Skeleton className="w-16 h-16 rounded-full mx-auto mb-4" /> {/* Icon Placeholder */}
              <Skeleton className="h-5 w-3/4 mx-auto" /> {/* Item Title */}
              <Skeleton className="h-3 w-full mx-auto" />
              <Skeleton className="h-3 w-5/6 mx-auto" />
            </div>
          ))}
        </div>
      </section>

      {/* Join Us Skeleton */}
      <section className="container text-center py-10">
        <Skeleton className="h-8 w-3/4 mx-auto mb-4" /> {/* Section Title */}
        <Skeleton className="h-4 w-full max-w-xl mx-auto mb-6" />
        <Skeleton className="h-4 w-5/6 max-w-xl mx-auto mb-6" />
        <Skeleton className="h-12 w-36 mx-auto" /> {/* Button */}
      </section>
    </div>
  );
}

export default function AboutPage() {
  return (
    <React.Suspense fallback={<AboutPageSkeleton />}>
      <AboutClientContent />
    </React.Suspense>
  );
}
