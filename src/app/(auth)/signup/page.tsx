"use client"; // Keep existing "use client" for Suspense compatibility on page level if needed, or remove if skeleton is pure server.
// For this fix, assuming the page itself can remain a structure that uses Suspense,
// or make it a server component that just renders Suspense + Client Component.
// Let's structure it as a simple Server Component shell.

import * as React from 'react';
import SignupPageClientContent from './signup-client-content';
import { Skeleton } from '@/components/ui/skeleton';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';

function SignupPageSkeleton() {
  return (
    <div className="flex justify-center items-center min-h-[calc(100vh-12rem)] px-4 py-8">
      <Card className="w-full max-w-md shadow-lg border border-border rounded-lg">
        <CardHeader className="space-y-1 text-center p-6">
          <Skeleton className="h-8 w-3/4 mx-auto" /> {/* Title */}
          <Skeleton className="h-4 w-1/2 mx-auto" /> {/* Description */}
        </CardHeader>
        <CardContent className="space-y-4 p-6">
          <div className="space-y-4">
            <div className="space-y-2">
              <Skeleton className="h-4 w-1/4" /> {/* Label */}
              <Skeleton className="h-10 w-full" /> {/* Input */}
            </div>
            <div className="space-y-2">
              <Skeleton className="h-4 w-1/4" /> {/* Label */}
              <Skeleton className="h-10 w-full" /> {/* Input */}
            </div>
            <div className="space-y-2">
              <Skeleton className="h-4 w-1/4" /> {/* Label */}
              <Skeleton className="h-10 w-full" /> {/* Input */}
            </div>
            <Skeleton className="h-10 w-full" /> {/* Button */}
          </div>
          <div className="relative my-6">
            <div className="absolute inset-0 flex items-center">
              <Skeleton className="h-px w-full" />
            </div>
            <div className="relative flex justify-center text-xs uppercase">
              <Skeleton className="h-4 w-20 bg-background px-2" /> {/* Needs bg-background to hide line */}
            </div>
          </div>
          <Skeleton className="h-10 w-full" /> {/* Google Button */}
        </CardContent>
        <CardFooter className="flex flex-col space-y-2 text-center text-sm p-6 pt-4">
          <Skeleton className="h-3 w-full" /> {/* Terms link */}
          <Skeleton className="h-4 w-1/2 mx-auto mt-4" /> {/* Login link */}
        </CardFooter>
      </Card>
    </div>
  );
}


export default function SignupPage() {
  return (
    <React.Suspense fallback={<SignupPageSkeleton />}>
      <SignupPageClientContent />
    </React.Suspense>
  );
}
