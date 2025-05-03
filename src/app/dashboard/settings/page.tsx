// src/app/dashboard/settings/page.tsx
"use client";

import * as React from 'react';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/use-auth';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import * as z from 'zod';
import { updateProfile, updateEmail, updatePassword, reauthenticateWithCredential, EmailAuthProvider, type User } from 'firebase/auth'; // Import User type
import { doc, updateDoc, serverTimestamp } from 'firebase/firestore'; // Import serverTimestamp
import { db, auth } from '@/lib/firebase/config';

import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { AlertCircle, User as UserIcon, KeyRound, AtSign, ShieldCheck } from 'lucide-react'; // Renamed User to UserIcon
import { Skeleton } from '@/components/ui/skeleton';
import { Separator } from '@/components/ui/separator';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogClose
} from "@/components/ui/dialog";


// --- Profile Update Schema ---
const profileSchema = z.object({
  displayName: z.string().min(2, { message: 'Name must be at least 2 characters' }).max(50).optional(),
  // Add other profile fields here if needed (e.g., photoURL)
});
type ProfileFormValues = z.infer<typeof profileSchema>;

// --- Email Update Schema ---
const emailSchema = z.object({
   newEmail: z.string().email({ message: 'Invalid email address' }),
   currentPasswordForEmail: z.string().min(1, { message: 'Current password is required' }), // Changed min to 1
});
type EmailFormValues = z.infer<typeof emailSchema>;

// --- Password Update Schema ---
const passwordSchema = z.object({
  currentPassword: z.string().min(1, { message: 'Current password is required' }),
  newPassword: z.string().min(6, { message: 'New password must be at least 6 characters' }),
  confirmPassword: z.string(),
}).refine((data) => data.newPassword === data.confirmPassword, {
  message: "New passwords don't match",
  path: ["confirmPassword"], // path of error
});
type PasswordFormValues = z.infer<typeof passwordSchema>;


export default function SettingsPage() {
  // IMPORTANT: Replace 'YOUR_ADMIN_USER_ID_PLACEHOLDER' with the actual UID of the user you want to be the initial admin.
  // This is ONLY for initial setup and is NOT secure for production.
  // In production, use a backend function or secure method to manage roles.
  const adminSetupUid = '4v1fcqAFtPTmCIndN9IhoiYLkBz1'; // <<<--- REPLACE THIS

  const { user, userProfile, loading: authLoading, signOut, createOrUpdateUserProfile } = useAuth();
  const router = useRouter();
  const { toast } = useToast();

  const [profileLoading, setProfileLoading] = useState(false);
  const [profileError, setProfileError] = useState<string | null>(null);
  const [emailLoading, setEmailLoading] = useState(false);
  const [emailError, setEmailError] = useState<string | null>(null);
  const [passwordLoading, setPasswordLoading] = useState(false);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [isEmailDialogOpen, setIsEmailDialogOpen] = useState(false);
  const [isPasswordDialogOpen, setIsPasswordDialogOpen] = useState(false);
  const [adminLoading, setAdminLoading] = useState(false);

  const profileForm = useForm<ProfileFormValues>({
     resolver: zodResolver(profileSchema),
     defaultValues: {
       displayName: '',
     },
  });

  const emailForm = useForm<EmailFormValues>({
      resolver: zodResolver(emailSchema),
      defaultValues: {
          newEmail: '',
          currentPasswordForEmail: '',
      }
  });

   const passwordForm = useForm<PasswordFormValues>({
      resolver: zodResolver(passwordSchema),
      defaultValues: {
          currentPassword: '',
          newPassword: '',
          confirmPassword: '',
      }
   });

  useEffect(() => {
    if (!authLoading && !user) {
      router.push('/login?message=Please login to view settings');
    } else if (user && userProfile) { // Ensure both user and userProfile exist
      // Pre-fill forms once userProfile is loaded
      profileForm.reset({ displayName: userProfile.displayName ?? user.displayName ?? '' }); // Use auth display name as fallback
      emailForm.reset({ newEmail: user.email ?? '', currentPasswordForEmail: ''}); // Set current email from user object
    }
  }, [user, userProfile, authLoading, router, profileForm, emailForm]);


  // --- Handlers ---

  const onProfileSubmit = async (data: ProfileFormValues) => {
     if (!user || !userProfile) return;
     setProfileLoading(true);
     setProfileError(null);

      // Create object with only changed fields
      const updates: Record<string, any> = {};
      if (data.displayName && data.displayName !== userProfile.displayName) {
          updates.displayName = data.displayName;
      }
      // Add other updatable profile fields here (e.g., photoURL)
      // if (data.photoURL && data.photoURL !== userProfile.photoURL) {
      //     updates.photoURL = data.photoURL;
      // }

      // Check if there are any actual updates to perform
      if (Object.keys(updates).length === 0) {
          toast({ title: 'No Changes', description: 'No profile information was modified.' });
          setProfileLoading(false);
          return;
      }


     try {
       // Update Firebase Auth Profile (only if displayName changed)
       if (updates.displayName && updates.displayName !== user.displayName) {
          await updateProfile(user, { displayName: updates.displayName });
       }
       // Add auth profile updates for other fields like photoURL if needed
       // if (updates.photoURL && updates.photoURL !== user.photoURL) {
       //    await updateProfile(user, { photoURL: updates.photoURL });
       // }


       // Update Firestore Profile Document
       const userDocRef = doc(db, 'users', user.uid);
       await updateDoc(userDocRef, {
         ...updates, // Spread the changes
         updatedAt: serverTimestamp(), // Always update the timestamp
       });

       toast({
         title: 'Profile Updated',
         description: 'Your profile information has been saved.',
       });
     } catch (err: any) {
       console.error("Profile update failed:", err);
       setProfileError(err.message || "Failed to update profile.");
        toast({ variant: "destructive", title: 'Update Failed', description: err.message || "Failed to update profile." });
     } finally {
       setProfileLoading(false);
     }
  };

   // Re-authenticate user before sensitive operations (email/password change)
   const reauthenticate = async (password: string) => {
       if (!user || !user.email) {
           throw new Error("User not properly authenticated or email missing.");
       }
       const credential = EmailAuthProvider.credential(user.email, password);
       await reauthenticateWithCredential(user, credential);
       // console.log("Re-authentication successful"); // For debugging
   };


   const onEmailSubmit = async (data: EmailFormValues) => {
       if (!user) return;
        // Basic check if email is actually different
       if (data.newEmail === user.email) {
           setEmailError("The new email address is the same as the current one.");
           emailForm.setError("newEmail", { type: "manual", message: "Please enter a different email address." });
           return;
       }

       setEmailLoading(true);
       setEmailError(null);
       try {
           // console.log("Attempting to re-authenticate for email change..."); // Debugging
           // 1. Re-authenticate
           await reauthenticate(data.currentPasswordForEmail);
           // console.log("Re-authentication success, attempting email update..."); // Debugging


           // 2. Update email in Firebase Auth
           await updateEmail(user, data.newEmail);
           // console.log("Firebase Auth email updated successfully."); // Debugging


           // 3. Update email in Firestore (optional, but recommended if you store it)
           const userDocRef = doc(db, 'users', user.uid);
           await updateDoc(userDocRef, {
               email: data.newEmail, // Ensure your UserProfile type includes email
               updatedAt: serverTimestamp(), // Update timestamp
           });
           // console.log("Firestore email updated successfully."); // Debugging


           toast({
               title: 'Email Updated',
               description: `Your email has been updated to ${data.newEmail}. You might need to re-login.`,
           });
           setIsEmailDialogOpen(false); // Close dialog on success
           emailForm.reset({ newEmail: data.newEmail, currentPasswordForEmail: '' }); // Clear password, keep new email shown


           // Consider forcing a re-login for security
           // await signOut();
           // router.push('/login?message=Email updated. Please login again.');


       } catch (err: any) {
           console.error("Email update failed:", err); // Log the full error
           let message = "Failed to update email. Please check your password and try again.";
            if (err.code) { // More specific Firebase error handling
               switch (err.code) {
                    case 'auth/wrong-password':
                       message = 'Incorrect current password.';
                       emailForm.setError("currentPasswordForEmail", { type: "manual", message });
                       break;
                    case 'auth/email-already-in-use':
                       message = 'This email address is already in use by another account.';
                       emailForm.setError("newEmail", { type: "manual", message });
                       break;
                    case 'auth/invalid-email':
                       message = 'The new email address is not valid.';
                       emailForm.setError("newEmail", { type: "manual", message });
                       break;
                    case 'auth/requires-recent-login':
                       message = 'This action requires recent authentication. Please log out and log back in before changing your email.';
                       break;
                    case 'auth/user-token-expired':
                       message = 'Your login session has expired. Please log out and log back in.';
                       break;
                   case 'auth/too-many-requests':
                       message = 'Too many attempts. Please try again later.';
                       break;
                    default:
                       message = `An error occurred (${err.code}). Please try again.`;
               }
           }
            setEmailError(message); // Show error within the dialog
       } finally {
           setEmailLoading(false);
       }
   };

   const onPasswordSubmit = async (data: PasswordFormValues) => {
        if (!user) return;
        setPasswordLoading(true);
        setPasswordError(null);
        try {
            // console.log("Attempting re-authentication for password change..."); // Debugging
            // 1. Re-authenticate
            await reauthenticate(data.currentPassword);
            // console.log("Re-authentication success, attempting password update..."); // Debugging

            // 2. Update password in Firebase Auth
            await updatePassword(user, data.newPassword);
            // console.log("Password updated successfully."); // Debugging


            toast({
                title: 'Password Updated',
                description: 'Your password has been changed successfully. Please use your new password for future logins.',
            });
             setIsPasswordDialogOpen(false); // Close dialog
             passwordForm.reset(); // Clear form


        } catch (err: any) {
            console.error("Password update failed:", err); // Log the full error
            let message = "Failed to update password. Please check your current password.";
             if (err.code) { // More specific Firebase error handling
                switch (err.code) {
                    case 'auth/wrong-password':
                        message = 'Incorrect current password.';
                        passwordForm.setError("currentPassword", { type: "manual", message });
                        break;
                    case 'auth/weak-password':
                         message = 'The new password is too weak. Please choose a stronger password.';
                         passwordForm.setError("newPassword", { type: "manual", message });
                         break;
                    case 'auth/requires-recent-login':
                         message = 'This action requires recent authentication. Please log out and log back in before changing your password.';
                         break;
                    case 'auth/user-token-expired':
                        message = 'Your login session has expired. Please log out and log back in.';
                        break;
                    case 'auth/too-many-requests':
                        message = 'Too many attempts. Please try again later.';
                        break;
                    default:
                       message = `An error occurred (${err.code}). Please try again.`;
                }
             }
             setPasswordError(message); // Show error in dialog
        } finally {
            setPasswordLoading(false);
        }
   };

   const handleMakeAdmin = async () => {
      if (!user || !userProfile) {
          toast({ variant: "destructive", title: "Error", description: "User not logged in." });
          return;
      }

      // !! SECURITY WARNING !!
      // This client-side check is NOT secure for production.
      // Anyone can inspect the code and find the adminSetupUid.
      // Use this ONLY for initial local setup.
      if (user.uid !== adminSetupUid) {
          toast({ variant: "destructive", title: "Unauthorized", description: "You are not authorized for this action." });
          return;
      }

      if (userProfile.role === 'admin') {
           toast({ title: "Already Admin", description: "This user is already an admin." });
           return;
      }

      setAdminLoading(true);
      try {
          // Re-use createOrUpdateUserProfile to set the role
          // We need to pass the existing user object and modify the role
          const updatedUser = { ...user, role: "admin" } as User & { role: 'admin' }; // Cast to include role
          await createOrUpdateUserProfile(updatedUser, null); // Pass null for referral code
          toast({
              title: 'Admin Role Granted',
              description: `User ${userProfile.displayName || user.email} is now an admin.`,
          });
          // The userProfile state will update automatically via the onSnapshot listener in useAuth
      } catch (err: any) {
          console.error("Failed to make user admin:", err);
          toast({ variant: "destructive", title: 'Update Failed', description: err.message || "Failed to grant admin role." });
      } finally {
          setAdminLoading(false);
      }
   };


  if (authLoading || (!user && !authLoading)) {
    return <SettingsPageSkeleton />;
  }

  return (
    <div className="space-y-8 max-w-3xl">
      <h1 className="text-3xl font-bold">Settings</h1>

      {/* --- Profile Settings --- */}
      <Card>
        <CardHeader>
          <CardTitle>Profile Information</CardTitle>
          <CardDescription>Update your name.</CardDescription>
        </CardHeader>
        <CardContent>
           {profileError && (
               <Alert variant="destructive" className="mb-4">
                   <AlertCircle className="h-4 w-4" />
                   <AlertTitle>Error</AlertTitle>
                   <AlertDescription>{profileError}</AlertDescription>
               </Alert>
            )}
          <form onSubmit={profileForm.handleSubmit(onProfileSubmit)} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="displayName">Display Name</Label>
              <Input
                id="displayName"
                {...profileForm.register('displayName')}
                disabled={profileLoading || !userProfile} // Disable if profile not loaded
                 aria-invalid={profileForm.formState.errors.displayName ? "true" : "false"}
                 placeholder={user?.displayName ?? "Enter your display name"}
                 autoComplete="name"
              />
               {profileForm.formState.errors.displayName && <p className="text-sm text-destructive">{profileForm.formState.errors.displayName.message}</p>}
            </div>
             {/* Add other profile fields here */}
             <Button type="submit" disabled={profileLoading || !userProfile}>
                 {profileLoading ? 'Saving...' : 'Save Profile'}
             </Button>
          </form>

        </CardContent>
      </Card>

       <Separator />

       {/* --- Account Settings (Email & Password) --- */}
       <Card>
          <CardHeader>
            <CardTitle>Account Settings</CardTitle>
            <CardDescription>Manage your email address and password.</CardDescription>
          </CardHeader>
           <CardContent className="space-y-4">
               {/* Display Current Email */}
                <div className="space-y-2">
                  <Label>Current Email</Label>
                  <div className="flex items-center justify-between">
                     <p className="text-sm text-muted-foreground truncate pr-4">{user?.email ?? 'Loading email...'}</p>
                      {/* Email Change Dialog Trigger */}
                       <Dialog open={isEmailDialogOpen} onOpenChange={setIsEmailDialogOpen}>
                          <DialogTrigger asChild>
                             <Button variant="outline" size="sm" disabled={!user}>Change Email</Button>
                          </DialogTrigger>
                          <DialogContent>
                             <DialogHeader>
                                <DialogTitle>Change Email Address</DialogTitle>
                                <DialogDescription>
                                   Enter your current password and your new email address. You may need to verify your new email. This requires a recent login.
                                </DialogDescription>
                             </DialogHeader>
                              {emailError && (
                                  <Alert variant="destructive" className="mt-4">
                                      <AlertCircle className="h-4 w-4" />
                                      <AlertTitle>Error</AlertTitle>
                                      <AlertDescription>{emailError}</AlertDescription>
                                  </Alert>
                               )}
                              <form onSubmit={emailForm.handleSubmit(onEmailSubmit)} className="space-y-4 pt-4">
                                  <div className="space-y-1">
                                       <Label htmlFor="currentPasswordForEmail">Current Password</Label>
                                       <Input
                                           id="currentPasswordForEmail"
                                           type="password"
                                           {...emailForm.register('currentPasswordForEmail')}
                                           disabled={emailLoading}
                                           autoComplete="current-password"
                                           required
                                        />
                                       {emailForm.formState.errors.currentPasswordForEmail && <p className="text-sm text-destructive">{emailForm.formState.errors.currentPasswordForEmail.message}</p>}
                                  </div>
                                   <div className="space-y-1">
                                        <Label htmlFor="newEmail">New Email</Label>
                                        <Input
                                            id="newEmail"
                                            type="email"
                                            {...emailForm.register('newEmail')}
                                            disabled={emailLoading}
                                            autoComplete="email"
                                            required
                                        />
                                        {emailForm.formState.errors.newEmail && <p className="text-sm text-destructive">{emailForm.formState.errors.newEmail.message}</p>}
                                   </div>
                                   <DialogFooter>
                                        <DialogClose asChild>
                                           <Button type="button" variant="outline" disabled={emailLoading}>Cancel</Button>
                                        </DialogClose>
                                       <Button type="submit" disabled={emailLoading}>
                                           {emailLoading ? 'Updating...' : 'Update Email'}
                                       </Button>
                                   </DialogFooter>
                              </form>
                          </DialogContent>
                       </Dialog>
                  </div>
                </div>

               <Separator/>

                {/* Change Password Section */}
                 <div className="space-y-2">
                   <Label>Password</Label>
                    <div className="flex items-center justify-between">
                       <p className="text-sm text-muted-foreground">**********</p>
                        {/* Password Change Dialog Trigger */}
                         <Dialog open={isPasswordDialogOpen} onOpenChange={setIsPasswordDialogOpen}>
                           <DialogTrigger asChild>
                              <Button variant="outline" size="sm" disabled={!user}>Change Password</Button>
                           </DialogTrigger>
                           <DialogContent>
                              <DialogHeader>
                                 <DialogTitle>Change Password</DialogTitle>
                                 <DialogDescription>
                                    Enter your current password and set a new password. This requires a recent login.
                                 </DialogDescription>
                              </DialogHeader>
                              {passwordError && (
                                  <Alert variant="destructive" className="mt-4">
                                      <AlertCircle className="h-4 w-4" />
                                      <AlertTitle>Error</AlertTitle>
                                      <AlertDescription>{passwordError}</AlertDescription>
                                  </Alert>
                               )}
                              <form onSubmit={passwordForm.handleSubmit(onPasswordSubmit)} className="space-y-4 pt-4">
                                  <div className="space-y-1">
                                      <Label htmlFor="currentPassword">Current Password</Label>
                                      <Input
                                          id="currentPassword"
                                          type="password"
                                          {...passwordForm.register('currentPassword')}
                                          disabled={passwordLoading}
                                          autoComplete="current-password"
                                          required
                                      />
                                       {passwordForm.formState.errors.currentPassword && <p className="text-sm text-destructive">{passwordForm.formState.errors.currentPassword.message}</p>}
                                  </div>
                                  <div className="space-y-1">
                                      <Label htmlFor="newPassword">New Password</Label>
                                      <Input
                                          id="newPassword"
                                          type="password"
                                          {...passwordForm.register('newPassword')}
                                          disabled={passwordLoading}
                                          autoComplete="new-password"
                                          required
                                       />
                                       {passwordForm.formState.errors.newPassword && <p className="text-sm text-destructive">{passwordForm.formState.errors.newPassword.message}</p>}
                                  </div>
                                  <div className="space-y-1">
                                      <Label htmlFor="confirmPassword">Confirm New Password</Label>
                                      <Input
                                          id="confirmPassword"
                                          type="password"
                                          {...passwordForm.register('confirmPassword')}
                                          disabled={passwordLoading}
                                          autoComplete="new-password"
                                          required
                                      />
                                       {passwordForm.formState.errors.confirmPassword && <p className="text-sm text-destructive">{passwordForm.formState.errors.confirmPassword.message}</p>}
                                  </div>
                                   <DialogFooter>
                                       <DialogClose asChild>
                                           <Button type="button" variant="outline" disabled={passwordLoading}>Cancel</Button>
                                       </DialogClose>
                                       <Button type="submit" disabled={passwordLoading}>
                                           {passwordLoading ? 'Updating...' : 'Update Password'}
                                       </Button>
                                   </DialogFooter>
                              </form>
                           </DialogContent>
                         </Dialog>
                   </div>
                 </div>
           </CardContent>
       </Card>

        {/* --- Initial Admin Setup --- */}
        {/* Only show this section if the logged-in user's UID matches the hardcoded adminSetupUid */}
        {user?.uid === adminSetupUid && userProfile?.role !== 'admin' && (
           <Card>
               <CardHeader>
                   <CardTitle>Admin Setup</CardTitle>
                   <CardDescription>Grant admin privileges to this account (only for initial setup).</CardDescription>
               </CardHeader>
               <CardContent>
                   <Button
                       onClick={handleMakeAdmin}
                       disabled={adminLoading}
                       variant="destructive"
                    >
                       <ShieldCheck className="mr-2 h-4 w-4" /> {adminLoading ? 'Processing...' : 'Make Me Admin'}
                   </Button>
               </CardContent>
               <CardFooter>
                  <p className="text-xs text-muted-foreground">
                      Warning: This grants full admin access. Use only for the intended administrator account.
                  </p>
               </CardFooter>
           </Card>
        )}


        {/* --- Payment Settings --- */}
         <Card>
           <CardHeader>
             <CardTitle>Payment Settings</CardTitle>
             <CardDescription>Manage your preferred payout methods. Details entered here will be used for processing your cashback payouts.</CardDescription>
           </CardHeader>
           <CardContent>
              {/* TODO: Implement form to save/update payment details */}
              {/* Example: Select PayPal or Bank, then input fields */}
              <p className="text-muted-foreground">Payment settings section coming soon. You can enter your details during the payout request for now.</p>
              {/*
              <form className="space-y-4">
                 <div className="space-y-2">
                    <Label>Preferred Method</Label>
                     <Select> ... </Select>
                 </div>
                  <div className="space-y-2">
                     <Label>PayPal Email</Label>
                     <Input type="email" />
                  </div>
                  ... other fields ...
                  <Button>Save Payment Settings</Button>
               </form>
               */}
           </CardContent>
         </Card>

    </div>
  );
}


function SettingsPageSkeleton() {
   return (
      <div className="space-y-8 max-w-3xl">
        <Skeleton className="h-8 w-36" /> {/* Title */}

        {/* Profile Card Skeleton */}
         <Card>
           <CardHeader>
             <Skeleton className="h-6 w-48 mb-2" />
             <Skeleton className="h-4 w-64" />
           </CardHeader>
           <CardContent>
             <div className="space-y-4">
                 <div className="space-y-2">
                   <Skeleton className="h-4 w-24" />
                   <Skeleton className="h-10 w-full" />
                 </div>
                 <Skeleton className="h-10 w-32" />
             </div>
           </CardContent>
         </Card>

         <Separator />

         {/* Account Card Skeleton */}
          <Card>
            <CardHeader>
               <Skeleton className="h-6 w-52 mb-2" />
               <Skeleton className="h-4 w-72" />
            </CardHeader>
            <CardContent className="space-y-4">
                 <div className="space-y-2">
                    <Skeleton className="h-4 w-24 mb-1"/>
                     <div className="flex items-center justify-between">
                         <Skeleton className="h-5 w-40" />
                         <Skeleton className="h-8 w-28" />
                     </div>
                 </div>
                 <Separator />
                  <div className="space-y-2">
                     <Skeleton className="h-4 w-20 mb-1"/>
                      <div className="flex items-center justify-between">
                          <Skeleton className="h-5 w-32" />
                          <Skeleton className="h-8 w-36" />
                      </div>
                  </div>
            </CardContent>
          </Card>

          {/* Payment Card Skeleton */}
           <Card>
             <CardHeader>
               <Skeleton className="h-6 w-48 mb-2" />
               <Skeleton className="h-4 w-full" />
               <Skeleton className="h-4 w-3/4" />
             </CardHeader>
             <CardContent>
                {/* Simulate form skeleton */}
                <div className="space-y-4">
                   <div className="space-y-2">
                       <Skeleton className="h-4 w-24" />
                       <Skeleton className="h-10 w-1/2" />
                   </div>
                    <div className="space-y-2">
                       <Skeleton className="h-4 w-20" />
                       <Skeleton className="h-10 w-full" />
                   </div>
                   <Skeleton className="h-10 w-36" />
                </div>
             </CardContent>
           </Card>

      </div>
   )
}
