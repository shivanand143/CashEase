// src/components/guards/admin-guard.tsx
"use client";

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/use-auth';
import { AlertCircle, ShieldAlert } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';

export default function AdminGuard({ children }: { children: React.ReactNode }) {
  const { user, userProfile, loading } = useAuth();
  const router = useRouter();

  React.useEffect(() => {
    if (!loading) {
      if (!user) {
        // Not logged in, redirect to login
        router.push('/login?message=Please login to access this page');
      } else if (userProfile && userProfile.role !== 'admin') {
        // Logged in but not an admin, redirect to dashboard or home
         console.warn("Access denied: User is not an admin.", userProfile);
         router.push('/dashboard?message=Access Denied: Admin required');
        // Or redirect to home: router.push('/?message=Access Denied');
      }
       // If user is logged in and role is admin, allow access (do nothing)
       // If userProfile is still loading but user exists, wait
    }
  }, [user, userProfile, loading, router]);

  // While loading authentication or profile, show a loading state
  if (loading) {
    return (
      <div className="flex justify-center items-center h-screen">
        <p>Checking permissions...</p> {/* Or a spinner component */}
      </div>
    );
  }

  // If user is logged in and confirmed as admin, render the children
  if (user && userProfile && userProfile.role === 'admin') {
    return <>{children}</>;
  }

   // Fallback for cases where redirection is in progress or checks failed
   // (e.g., user exists but profile hasn't loaded yet, or redirect hasn't completed)
   // Render a message indicating restricted access before redirect completes
   return (
      <div className="container mx-auto py-10">
         <Alert variant="destructive" className="max-w-md mx-auto">
              <ShieldAlert className="h-4 w-4" />
              <AlertTitle>Access Denied</AlertTitle>
              <AlertDescription>
                 You do not have permission to access this page. Redirecting...
              </AlertDescription>
         </Alert>
      </div>
   );
}
