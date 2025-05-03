// src/components/guards/admin-guard.tsx
"use client";

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/use-auth';
import { AlertCircle, ShieldAlert } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Skeleton } from '@/components/ui/skeleton'; // Import Skeleton for loading state

// IMPORTANT: This UID should match the one used in SettingsPage for initial admin setup.
// In a real application, this check should be removed, and role validation
// should solely rely on the `userProfile.role` fetched from the secure database,
// ideally verified by backend logic, not just client-side state.
const adminSetupUid = '4v1fcqAFtPTmCIndN9IhoiYLkBz1'; // <<<--- Ensure this matches SettingsPage

export default function AdminGuard({ children }: { children: React.ReactNode }) {
  const { user, userProfile, loading } = useAuth();
  const router = useRouter();
  const [isChecking, setIsChecking] = React.useState(true); // Local loading state

  React.useEffect(() => {
    // Only perform checks once auth loading is complete
    if (!loading) {
        setIsChecking(false); // Mark checking as complete
        if (!user) {
            // Not logged in, redirect to login
            console.log("AdminGuard: User not logged in. Redirecting to login.");
            router.replace('/login?message=Please login to access this page'); // Use replace to avoid adding to history
        } else if (userProfile) {
            // User and profile loaded, check role
            if (userProfile.role !== 'admin') {
                 // Check if this user is the designated setup admin UID as a fallback
                 if (user.uid === adminSetupUid) {
                     console.warn(`AdminGuard: User UID ${user.uid} matches adminSetupUid but role is '${userProfile.role}'. Allowing access based on UID for setup.`);
                     // Allow access for the designated setup admin even if role hasn't updated yet
                 } else {
                     // Logged in but not an admin (and not the setup UID), redirect
                     console.warn(`AdminGuard: Access denied. User ${user.uid} has role '${userProfile.role}'. Redirecting.`);
                     router.replace('/dashboard?message=Access Denied: Admin required');
                 }
            }
            // If role IS admin, allow access (do nothing)
        } else {
             // User exists, but profile is still null (potentially loading or failed to load/create)
             // Check if this user is the designated setup admin UID as a fallback
             if (user.uid === adminSetupUid) {
                 console.warn(`AdminGuard: User UID ${user.uid} matches adminSetupUid but profile is not loaded yet. Allowing access based on UID for setup.`);
                 // Allow access for the designated setup admin, assuming profile will load/be created
             } else {
                // Not the setup admin and profile not loaded - deny access
                console.warn(`AdminGuard: Access denied. User ${user.uid} profile not loaded. Redirecting.`);
                router.replace('/dashboard?message=Access Denied: Admin required');
             }
        }
    }
  }, [user, userProfile, loading, router]);

  // While loading authentication or profile, show a loading state
  if (loading || isChecking) {
    return (
       <div className="flex justify-center items-center min-h-[calc(100vh-10rem)]">
          <div className="space-y-4 text-center">
             <Skeleton className="h-8 w-48 mx-auto" />
             <p className="text-muted-foreground">Checking permissions...</p>
          </div>
       </div>
    );
  }

  // If user is logged in and confirmed as admin (either by role or by matching setup UID)
  if (user && (userProfile?.role === 'admin' || user.uid === adminSetupUid)) {
    return <>{children}</>;
  }

   // Fallback for cases where redirection is in progress or checks failed definitively
   // Render a message indicating restricted access before redirect completes
   return (
      <div className="container mx-auto py-10 flex justify-center items-center min-h-[calc(100vh-10rem)]">
         <Alert variant="destructive" className="max-w-md">
              <ShieldAlert className="h-4 w-4" />
              <AlertTitle>Access Denied</AlertTitle>
              <AlertDescription>
                 You do not have permission to access this page. You will be redirected shortly.
              </AlertDescription>
         </Alert>
      </div>
   );
}
