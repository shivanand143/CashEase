// src/components/guards/protected-route.tsx
"use client";

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/use-auth';
import { Skeleton } from '@/components/ui/skeleton'; // Or your preferred loading component
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { AlertCircle } from "lucide-react";
import { Button } from '../ui/button';

interface ProtectedRouteProps {
  children: React.ReactNode;
}

export default function ProtectedRoute({ children }: ProtectedRouteProps) {
  const { user, loading, error } = useAuth();
  const router = useRouter();
  const [isLoading, setIsLoading] = React.useState(true); // Local loading state

  React.useEffect(() => {
    // Don't run checks until auth loading is complete
    if (loading) {
      setIsLoading(true);
      return;
    }

    // If auth is done loading and there's no user, redirect
    if (!user) {
      console.warn('ProtectedRoute: Not authenticated, redirecting to login.');
      router.replace('/login'); // Use replace to avoid adding to browser history
    } else {
      // User is authenticated
      setIsLoading(false);
    }

  }, [user, loading, router]);

  // Show loading skeleton while checking auth state
  if (isLoading || loading) {
     return (
         <div className="container mx-auto p-4 md:p-8">
             <div className="space-y-6">
                  <Skeleton className="h-10 w-1/4" />
                  <Skeleton className="h-64 w-full" />
                  <div className="grid gap-4 md:grid-cols-2">
                      <Skeleton className="h-32 w-full" />
                      <Skeleton className="h-32 w-full" />
                  </div>
             </div>
         </div>
     );
   }

   // Display error message if auth hook encountered an error
    if (error) {
      return (
        <div className="container mx-auto p-4 md:p-8">
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>Authentication Error</AlertTitle>
            <AlertDescription>
               There was an error checking your credentials: {error}.
               <Button variant="link" className="ml-2 p-0 h-auto" onClick={() => router.push('/login')}>
                  Go to Login
               </Button>
            </AlertDescription>
          </Alert>
        </div>
      );
    }


  // If authenticated, render the protected content
  // Add a check for user existence again, just in case of race conditions
  return user ? <>{children}</> : null;
}
