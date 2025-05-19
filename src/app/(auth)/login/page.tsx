// src/app/(auth)/login/page.tsx - This is now the Server Component shell
// The original content is moved to login-client-content.tsx

import * as React from 'react';
import LoginClientContent from './login-client-content';
import { Skeleton } from '@/components/ui/skeleton';
import { Card, CardHeader, CardContent, CardFooter } from '@/components/ui/card';

function LoginPageSkeleton() {
  return (
    <div className="flex justify-center items-center min-h-[calc(100vh-12rem)] px-4 py-8">
      <Card className="w-full max-w-md shadow-lg border border-border rounded-lg">
        <CardHeader className="space-y-1 text-center p-6">
          <Skeleton className="h-8 w-3/4 mx-auto" /> {/* Title */}
          <Skeleton className="h-4 w-1/2 mx-auto" /> {/* Description */}
        </CardHeader>
        <CardContent className="space-y-4 p-6">
          <div className="space-y-4"> {/* Form Skeleton */}
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
          {/* Separator and Google Button Skeleton */}
          <div className="relative my-6">
            <div className="absolute inset-0 flex items-center">
              <Skeleton className="h-px w-full" /> {/* border-t equivalent */}
            </div>
            <div className="relative flex justify-center text-xs uppercase">
              <Skeleton className="h-4 w-20 bg-background px-2" /> {/* "Or continue with" text placeholder */}
            </div>
          </div>
          <Skeleton className="h-10 w-full" /> {/* Google Button */}
        </CardContent>
        <CardFooter className="flex flex-col space-y-2 text-center text-sm p-6 pt-4">
          <Skeleton className="h-4 w-3/4 mx-auto" /> {/* "Don't have an account?" text */}
        </CardFooter>
      </Card>
    </div>
  );
}


export default function LoginPage() {
  return (
    <React.Suspense fallback={<LoginPageSkeleton />}>
      <LoginClientContent />
    </React.Suspense>
  );
}
