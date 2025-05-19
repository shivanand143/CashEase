// src/app/contact/page.tsx
// This is the Server Component shell

import * as React from 'react';
import ContactClientContent from './contact-client-content'; // Import the client component
import { Skeleton } from '@/components/ui/skeleton';
import { Card, CardHeader, CardContent, CardTitle, CardDescription } from '@/components/ui/card';

function ContactPageSkeleton() {
  return (
    <div className="max-w-2xl mx-auto space-y-8">
      <div className="text-center">
        <Skeleton className="h-10 w-3/4 mx-auto mb-2" /> {/* Title */}
        <Skeleton className="h-5 w-1/2 mx-auto mt-2" /> {/* Subtitle */}
      </div>

      <Card className="shadow-lg border">
        <CardHeader>
          <Skeleton className="h-7 w-1/2 mb-1" /> {/* Card Title */}
          <Skeleton className="h-4 w-3/4" /> {/* Card Description */}
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Skeleton className="h-4 w-1/4" /> {/* Label */}
              <Skeleton className="h-10 w-full" /> {/* Input */}
            </div>
            <div className="space-y-2">
              <Skeleton className="h-4 w-1/4" /> {/* Label */}
              <Skeleton className="h-10 w-full" /> {/* Input */}
            </div>
          </div>
          <div className="space-y-2">
            <Skeleton className="h-4 w-1/4" /> {/* Label */}
            <Skeleton className="h-10 w-full" /> {/* Select */}
          </div>
          <div className="space-y-2">
            <Skeleton className="h-4 w-1/4" /> {/* Label */}
            <Skeleton className="h-20 w-full" /> {/* Textarea */}
          </div>
          <Skeleton className="h-10 w-full sm:w-32" /> {/* Button */}
        </CardContent>
      </Card>

      <div className="text-center text-sm text-muted-foreground space-y-2">
        <Skeleton className="h-4 w-3/4 mx-auto" />
        <Skeleton className="h-4 w-1/2 mx-auto" />
      </div>
    </div>
  );
}

export default function ContactPage() {
  return (
    <React.Suspense fallback={<ContactPageSkeleton />}>
      <ContactClientContent />
    </React.Suspense>
  );
}
