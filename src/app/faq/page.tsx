// src/app/faq/page.tsx
// This is the Server Component shell

import * as React from 'react';
import FaqClientContent from './faq-client-content'; // Import the client component
import { Skeleton } from '@/components/ui/skeleton';
import { Accordion, AccordionItem } from "@/components/ui/accordion";

function FaqPageSkeleton() {
  return (
    <div className="max-w-3xl mx-auto space-y-8">
      <div className="text-center">
        <Skeleton className="h-10 w-3/4 mx-auto mb-2" />
        <Skeleton className="h-5 w-1/2 mx-auto mt-2" />
      </div>

      <Accordion type="single" collapsible className="w-full border rounded-lg shadow-sm bg-card">
        {Array.from({ length: 5 }).map((_, index) => (
          <AccordionItem key={`skel-faq-${index}`} value={`item-${index}`} className="border-b last:border-b-0">
            <div className="p-4">
              <Skeleton className="h-6 w-full" />
            </div>
          </AccordionItem>
        ))}
      </Accordion>

      <section className="text-center mt-12 pt-8 border-t">
        <Skeleton className="h-8 w-1/2 mx-auto mb-3" />
        <Skeleton className="h-4 w-3/4 mx-auto mb-4" />
        <Skeleton className="h-10 w-32 mx-auto" />
      </section>
    </div>
  );
}

export default function FaqPage() {
  return (
    <React.Suspense fallback={<FaqPageSkeleton />}>
      <FaqClientContent />
    </React.Suspense>
  );
}
