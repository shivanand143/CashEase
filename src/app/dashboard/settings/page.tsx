
// src/app/dashboard/settings/page.tsx
'use client';

import * as React from 'react';
import { useState, useEffect } from 'react';
import { useAuth } from '@/hooks/use-auth';
import { useRouter } from 'next/navigation';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import * as z from 'zod';
import { updateProfile, updateEmail, updatePassword, reauthenticateWithCredential, EmailAuthProvider, User } from 'firebase/auth';
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
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { AlertCircle, Loader2, Save, Mail, KeyRound, Banknote } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogTrigger,
  DialogClose
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger, // Ensure this is imported
} from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import type { PayoutDetails, PayoutMethod, UserProfile } from '@/lib/types'; // Import types
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'; // Import Select
import ProtectedRoute from '@/components/guards/protected-route';

// --- Profile Update Schema ---
const profileSchema = z.object({
  displayName: z.string().min(2, 'Name must be at least 2 characters').max(50, 'Name cannot exceed 50 characters').trim(),
  // photoURL: z.string().url({ message: "Invalid URL" }).optional().or(z.literal("")), // Optional photo URL
});
type ProfileFormValues = z.infer<typeof profileSchema>;

// --- Email Update Schema ---
const emailSchema = z.object({
  newEmail: z.string().email({ message: "Invalid email address" }),
  currentPasswordForEmail: z.string().min(1, { message: "Password is required" }),
});
type EmailFormValues = z.infer<typeof emailSchema>;

// --- Password Update Schema ---
const passwordSchema = z.object({
  currentPassword: z.string().min(1, { message: "Current password is required" }),
  newPassword: z.string().min(6, { message: "New password must be at least 6 characters" }),
  confirmNewPassword: z.string(),
}).refine((data) => data.newPassword === data.confirmNewPassword, {
  message: "New passwords don't match",
  path: ["confirmNewPassword"], // Error path
});
type PasswordFormValues = z.infer<typeof passwordSchema>;

// --- Payout Details Update Schema ---
const payoutSchema = z.object({
   method: z.enum(['paypal', 'bank_transfer', 'gift_card']), // Use PayoutMethod type values
   detail: z.string().min(3, 'Payout detail is required (e.g., email, UPI, account info)').max(100, 'Detail too long'),
});
type PayoutFormValues = z.infer<typeof payoutSchema>;


function SettingsPageContent() {
  const { user, userProfile, loading: authLoading, updateUserProfileData, createOrUpdateUserProfile } = useAuth();
  const router = useRouter();
  const { toast } = useToast();

  // Loading states for each section
  const [profileLoading, setProfileLoading] = useState(false);
  const [emailLoading, setEmailLoading] = useState(false);
  const [passwordLoading, setPasswordLoading] = useState(false);
  const [payoutLoading, setPayoutLoading] = useState(false);

  // Error states for each section
  const [profileError, setProfileError] = useState<string | null>(null);
  const [emailError, setEmailError] = useState<string | null>(null);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [payoutError, setPayoutError] = useState<string | null>(null);

  // Form Hooks
  const profileForm = useForm<ProfileFormValues>({
    resolver: zodResolver(profileSchema),
    defaultValues: {
      displayName: '',
      // photoURL: '',
    },
  });

  const emailForm = useForm<EmailFormValues>({
    resolver: zodResolver(emailSchema),
    defaultValues: {
      newEmail: '',
      currentPasswordForEmail: '',
    },
  });

  const passwordForm = useForm<PasswordFormValues>({
    resolver: zodResolver(passwordSchema),
    defaultValues: {
      currentPassword: '',
      newPassword: '',
      confirmNewPassword: '',
    },
  });

   const payoutForm = useForm<PayoutFormValues>({
    resolver: zodResolver(payoutSchema),
    defaultValues: {
      method: 'bank_transfer', // Default method
      detail: '',
    },
  });

  // Pre-fill forms when user profile is loaded/updated
  useEffect(() => {
    if (userProfile) {
      profileForm.reset({
        displayName: userProfile.displayName || '',
        // photoURL: userProfile.photoURL || '',
      });
       payoutForm.reset({
         method: userProfile.payoutDetails?.method || 'bank_transfer',
         detail: userProfile.payoutDetails?.detail || '',
       });
    }
     // Email form default is user's current email
     if (user) {
        emailForm.setValue('newEmail', user.email || '');
     }
  }, [userProfile, user, profileForm, emailForm, payoutForm]); // Added payoutForm

  // --- Handlers ---

  // Profile Update Handler
  const onProfileSubmit = async (data: ProfileFormValues) => {
     if (!user) return;
     setProfileLoading(true);
     setProfileError(null);
     try {
         // Update Firebase Auth profile (only if changed)
         if (auth && auth.currentUser && auth.currentUser.displayName !== data.displayName /*|| auth.currentUser.photoURL !== data.photoURL*/) {
            await updateProfile(auth.currentUser, {
               displayName: data.displayName,
               // photoURL: data.photoURL || null, // Ensure null if empty
            });
         }

         // Update Firestore profile using the hook
         await updateUserProfileData(user.uid, {
            displayName: data.displayName,
            // photoURL: data.photoURL || null, // Ensure null if empty
         });

         toast({ title: 'Profile Updated', description: 'Your profile information has been saved.' });
         profileForm.reset(data); // Reset form with new defaults
     } catch (err: any) {
         console.error("Profile update failed:", err);
         setProfileError(err.message || "Failed to update profile.");
         toast({ variant: "destructive", title: 'Update Failed', description: err.message || "Failed to update profile." });
     } finally {
         setProfileLoading(false);
     }
  };

  const handleMakeAdmin = async () => {
    if (!user || !userProfile) return;
    const myAdminUid = process.env.NEXT_PUBLIC_INITIAL_ADMIN_UID; // Get your UID from env
    if (!myAdminUid) {
        toast({ variant: "destructive", title: "Configuration Error", description: "Admin UID not set." });
        return;
    }
    if (user.uid !== myAdminUid) {
         toast({ variant: "destructive", title: "Permission Denied", description: "You are not authorized for this action." });
        return;
    }

    try {
      // Use the spread operator on `user` to pass existing auth properties,
      // then override the role.
      // The `createOrUpdateUserProfile` function is designed to handle both creation and updates.
      // We need to cast `authUser` to `User` type as it's expected by `createOrUpdateUserProfile`
      // even though we are just updating the role and not all fields of User.
      // The function should ideally only update fields present in its second argument.
      const authUserWithAdminRole = { ...user, role: "admin" } as unknown as User;
      await createOrUpdateUserProfile(authUserWithAdminRole, null); // No referral code needed here
      toast({
        title: 'User Promoted to Admin',
        description: 'User role has been updated to admin.',
      });
    } catch (err: any) {
      console.error("Admin promotion failed:", err);
      setProfileError(err.message || "Failed to promote user to admin.");
       toast({ variant: "destructive", title: 'Admin Promotion Failed', description: err.message || "Failed to promote user to admin." });
    }
 };

  // Re-authenticate user before sensitive operations (email/password change)
  const reauthenticate = async (password: string): Promise<boolean> => {
     if (!auth || !auth.currentUser || !auth.currentUser.email) {
       console.error("Re-authentication failed: User not logged in or email missing.");
       return false;
     }
     try {
       const credential = EmailAuthProvider.credential(auth.currentUser.email, password);
       await reauthenticateWithCredential(auth.currentUser, credential);
       return true;
     } catch (err: any) {
       console.error("Re-authentication failed:", err);
       // Handle specific re-auth errors (e.g., wrong password)
       let message = "Re-authentication failed. Please check your password.";
       if (err.code === 'auth/wrong-password') {
           message = "Incorrect current password provided.";
       } else if (err.code === 'auth/too-many-requests') {
           message = "Too many re-authentication attempts. Please try again later.";
       }
       toast({ variant: "destructive", title: 'Re-authentication Failed', description: message });
       return false;
     }
  };


  // Email Update Handler
  const onEmailSubmit = async (data: EmailFormValues) => {
      if (!user || !auth || !auth.currentUser) return;
      setEmailLoading(true);
      setEmailError(null);

      // 1. Re-authenticate
      const reAuthSuccess = await reauthenticate(data.currentPasswordForEmail);
      if (!reAuthSuccess) {
         setEmailError("Re-authentication failed. Please check your password.");
         setEmailLoading(false);
         return;
      }

      // 2. Update Email in Firebase Auth
      try {
         await updateEmail(auth.currentUser, data.newEmail);

         // 3. Update Email in Firestore Profile (using the hook)
         await updateUserProfileData(user.uid, { email: data.newEmail });

         toast({ title: 'Email Updated', description: 'Your email address has been successfully changed.' });
         emailForm.reset(); // Clear the form
      } catch (err: any) {
         console.error("Email update failed:", err);
         let message = "Failed to update email.";
         if (err.code === 'auth/email-already-in-use') {
             message = "This email address is already in use by another account.";
         } else if (err.code === 'auth/invalid-email') {
             message = "The new email address is not valid.";
         } else if (err.code === 'auth/requires-recent-login') {
             message = "This operation requires a recent login. Please log out and log back in.";
         }
         setEmailError(message);
         toast({ variant: "destructive", title: 'Email Update Failed', description: message });
      } finally {
         setEmailLoading(false);
      }
  };

  // Password Update Handler
  const onPasswordSubmit = async (data: PasswordFormValues) => {
     if (!user || !auth || !auth.currentUser) return;
     setPasswordLoading(true);
     setPasswordError(null);

      // 1. Re-authenticate
     const reAuthSuccess = await reauthenticate(data.currentPassword);
      if (!reAuthSuccess) {
         setPasswordError("Re-authentication failed. Please check your current password.");
         setPasswordLoading(false);
         return;
      }

      // 2. Update Password in Firebase Auth
     try {
       await updatePassword(auth.currentUser, data.newPassword);
       toast({ title: 'Password Updated', description: 'Your password has been successfully changed.' });
       passwordForm.reset(); // Clear the form
     } catch (err: any) {
       console.error("Password update failed:", err);
       let message = "Failed to update password.";
        if (err.code === 'auth/weak-password') {
            message = "The new password is too weak.";
        } else if (err.code === 'auth/requires-recent-login') {
            message = "This operation requires a recent login. Please log out and log back in.";
        }
       setPasswordError(message);
       toast({ variant: "destructive", title: 'Password Update Failed', description: message });
     } finally {
       setPasswordLoading(false);
     }
  };

   // Payout Details Update Handler
   const onPayoutSubmit = async (data: PayoutFormValues) => {
     if (!user) return;
     setPayoutLoading(true);
     setPayoutError(null);
     try {
       const payoutDetails: PayoutDetails = {
         method: data.method as PayoutMethod, // Cast to PayoutMethod
         detail: data.detail,
       };
       await updateUserProfileData(user.uid, { payoutDetails });
       toast({ title: 'Payout Details Updated', description: 'Your preferred payout method has been saved.' });
     } catch (err: any) {
       console.error("Payout details update failed:", err);
       setPayoutError(err.message || "Failed to update payout details.");
        toast({ variant: "destructive", title: 'Update Failed', description: err.message || "Failed to update payout details." });
     } finally {
       setPayoutLoading(false);
     }
   };


  // --- Render Logic ---

  if (authLoading) {
    return (
      <div className="space-y-6">
         <Skeleton className="h-10 w-1/4" />
         <Card>
           <CardHeader><Skeleton className="h-8 w-1/2" /></CardHeader>
           <CardContent className="space-y-4">
             <Skeleton className="h-10 w-full" />
             <Skeleton className="h-10 w-full" />
             <Skeleton className="h-10 w-1/3" />
           </CardContent>
         </Card>
         {/* Skeletons for other cards */}
         <Card><CardHeader><Skeleton className="h-8 w-1/2" /></CardHeader><CardContent><Skeleton className="h-10 w-full" /></CardContent></Card>
         <Card><CardHeader><Skeleton className="h-8 w-1/2" /></CardHeader><CardContent><Skeleton className="h-10 w-full" /></CardContent></Card>
         <Card><CardHeader><Skeleton className="h-8 w-1/2" /></CardHeader><CardContent><Skeleton className="h-10 w-full" /></CardContent></Card>
      </div>
    );
  }

  if (!user || !userProfile) {
    return (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Not Logged In</AlertTitle>
          <AlertDescription>
            You must be logged in to view your settings.
            <Button variant="link" className="p-0 h-auto ml-2" onClick={() => router.push('/login')}>
                Go to Login
            </Button>
          </AlertDescription>
        </Alert>
    );
  }

  return (
    <div className="space-y-8 max-w-3xl mx-auto">
      <h1 className="text-3xl font-bold">Account Settings</h1>

      {/* --- Profile Information Card --- */}
      <Card>
        <CardHeader>
          <CardTitle className="text-xl">Profile Information</CardTitle>
          <CardDescription>Update your display name.</CardDescription>
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
                   disabled={profileLoading}
                 />
                 {profileForm.formState.errors.displayName && (
                   <p className="text-sm text-destructive">{profileForm.formState.errors.displayName.message}</p>
                 )}
              </div>
               {/* Photo URL Input (Optional) */}
              {/* <div className="space-y-2">
                 <Label htmlFor="photoURL">Photo URL (Optional)</Label>
                 <Input
                   id="photoURL"
                   type="url"
                   placeholder="https://example.com/your-photo.jpg"
                   {...profileForm.register('photoURL')}
                   disabled={profileLoading}
                 />
                  {profileForm.formState.errors.photoURL && (
                   <p className="text-sm text-destructive">{profileForm.formState.errors.photoURL.message}</p>
                 )}
              </div> */}
              <Button type="submit" disabled={profileLoading} className="w-full sm:w-auto">
                 {profileLoading ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Saving...</> : <> <Save className="mr-2 h-4 w-4"/> Save Profile</>}
              </Button>
           </form>
            {userProfile?.role !== 'admin' && process.env.NEXT_PUBLIC_INITIAL_ADMIN_UID && user?.uid === process.env.NEXT_PUBLIC_INITIAL_ADMIN_UID && (
                 <Button type="button" onClick={handleMakeAdmin} disabled={profileLoading} className="mt-4 ml-2" variant="outline">
                    Become Admin (Dev Only)
                 </Button>
            )}
        </CardContent>
      </Card>


       {/* --- Payout Details Card --- */}
      <Card>
        <CardHeader>
          <CardTitle className="text-xl">Payout Details</CardTitle>
          <CardDescription>Set your preferred method for receiving cashback payouts.</CardDescription>
        </CardHeader>
        <CardContent>
           {payoutError && (
             <Alert variant="destructive" className="mb-4">
               <AlertCircle className="h-4 w-4" />
               <AlertTitle>Error</AlertTitle>
               <AlertDescription>{payoutError}</AlertDescription>
             </Alert>
           )}
          <form onSubmit={payoutForm.handleSubmit(onPayoutSubmit)} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="payoutMethod">Payout Method</Label>
              <Select
                value={payoutForm.watch('method')}
                onValueChange={(value) => payoutForm.setValue('method', value as PayoutMethod)}
                 disabled={payoutLoading}
              >
                <SelectTrigger id="payoutMethod">
                  <SelectValue placeholder="Select a payout method" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="bank_transfer">Bank Transfer (UPI/NEFT)</SelectItem>
                  <SelectItem value="paypal">PayPal</SelectItem>
                  <SelectItem value="gift_card">Amazon/Flipkart Gift Card</SelectItem>
                  {/* Add more methods as needed */}
                </SelectContent>
              </Select>
               {payoutForm.formState.errors.method && (
                <p className="text-sm text-destructive">{payoutForm.formState.errors.method.message}</p>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="payoutDetail">Details</Label>
              <Input
                id="payoutDetail"
                placeholder={
                   payoutForm.watch('method') === 'paypal' ? 'Your PayPal Email Address' :
                   payoutForm.watch('method') === 'bank_transfer' ? 'Your UPI ID or Bank Account Details' :
                   'Email for Gift Card Delivery'
                 }
                {...payoutForm.register('detail')}
                disabled={payoutLoading}
              />
               {payoutForm.formState.errors.detail && (
                <p className="text-sm text-destructive">{payoutForm.formState.errors.detail.message}</p>
              )}
               <p className="text-xs text-muted-foreground">
                 { payoutForm.watch('method') === 'bank_transfer' && 'Enter UPI ID (e.g., yourname@bank) or Full Name, Account Number, IFSC Code.' }
                 { payoutForm.watch('method') === 'paypal' && 'Enter the email address associated with your PayPal account.' }
                 { payoutForm.watch('method') === 'gift_card' && 'Gift cards will be sent to this email address.' }
               </p>
            </div>
            <Button type="submit" disabled={payoutLoading} className="w-full sm:w-auto">
               {payoutLoading ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Saving...</> : <><Banknote className="mr-2 h-4 w-4"/> Save Payout Details</>}
            </Button>
          </form>
        </CardContent>
      </Card>


      {/* --- Change Email Card --- */}
      <Card>
        <CardHeader>
          <CardTitle className="text-xl">Change Email</CardTitle>
          <CardDescription>Update the email address associated with your account.</CardDescription>
        </CardHeader>
        <CardContent>
          {emailError && (
            <Alert variant="destructive" className="mb-4">
              <AlertCircle className="h-4 w-4" />
              <AlertTitle>Error</AlertTitle>
              <AlertDescription>{emailError}</AlertDescription>
            </Alert>
          )}
          <form onSubmit={emailForm.handleSubmit(onEmailSubmit)} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="newEmail">New Email Address</Label>
              <Input
                id="newEmail"
                type="email"
                {...emailForm.register('newEmail')}
                disabled={emailLoading}
              />
              {emailForm.formState.errors.newEmail && (
                <p className="text-sm text-destructive">{emailForm.formState.errors.newEmail.message}</p>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="currentPasswordForEmail">Current Password</Label>
              <Input
                id="currentPasswordForEmail"
                type="password"
                {...emailForm.register('currentPasswordForEmail')}
                disabled={emailLoading}
              />
              {emailForm.formState.errors.currentPasswordForEmail && (
                <p className="text-sm text-destructive">{emailForm.formState.errors.currentPasswordForEmail.message}</p>
              )}
            </div>
            <Button type="submit" disabled={emailLoading} className="w-full sm:w-auto">
               {emailLoading ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Updating...</> : <><Mail className="mr-2 h-4 w-4"/> Update Email</>}
            </Button>
          </form>
        </CardContent>
      </Card>

      {/* --- Change Password Card --- */}
      <Card>
        <CardHeader>
          <CardTitle className="text-xl">Change Password</CardTitle>
          <CardDescription>Update your account password.</CardDescription>
        </CardHeader>
        <CardContent>
          {passwordError && (
            <Alert variant="destructive" className="mb-4">
              <AlertCircle className="h-4 w-4" />
              <AlertTitle>Error</AlertTitle>
              <AlertDescription>{passwordError}</AlertDescription>
            </Alert>
          )}
          <form onSubmit={passwordForm.handleSubmit(onPasswordSubmit)} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="currentPassword">Current Password</Label>
              <Input
                id="currentPassword"
                type="password"
                {...passwordForm.register('currentPassword')}
                disabled={passwordLoading}
              />
              {passwordForm.formState.errors.currentPassword && (
                <p className="text-sm text-destructive">{passwordForm.formState.errors.currentPassword.message}</p>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="newPassword">New Password</Label>
              <Input
                id="newPassword"
                type="password"
                {...passwordForm.register('newPassword')}
                disabled={passwordLoading}
              />
              {passwordForm.formState.errors.newPassword && (
                <p className="text-sm text-destructive">{passwordForm.formState.errors.newPassword.message}</p>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="confirmNewPassword">Confirm New Password</Label>
              <Input
                id="confirmNewPassword"
                type="password"
                {...passwordForm.register('confirmNewPassword')}
                disabled={passwordLoading}
              />
              {passwordForm.formState.errors.confirmNewPassword && (
                <p className="text-sm text-destructive">{passwordForm.formState.errors.confirmNewPassword.message}</p>
              )}
            </div>
            <Button type="submit" disabled={passwordLoading} className="w-full sm:w-auto">
              {passwordLoading ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Updating...</> : <><KeyRound className="mr-2 h-4 w-4"/> Update Password</>}
            </Button>
          </form>
        </CardContent>
      </Card>


       {/* Optional: Delete Account Section - Needs Careful Implementation */}
       {/* <Card className="border-destructive">
           <CardHeader>
               <CardTitle className="text-xl text-destructive">Delete Account</CardTitle>
               <CardDescription>Permanently delete your account and all associated data. This action cannot be undone.</CardDescription>
           </CardHeader>
           <CardContent>
                <AlertDialog>
                   <AlertDialogTrigger asChild>
                        <Button variant="destructive">Delete My Account</Button>
                   </AlertDialogTrigger>
                   <AlertDialogContent>
                       <AlertDialogHeader>
                           <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
                           <AlertDialogDescription>
                                This action cannot be undone. This will permanently delete your
                                account and remove your data from our servers.
                           </AlertDialogDescription>
                       </AlertDialogHeader>
                       <AlertDialogFooter>
                           <AlertDialogCancel>Cancel</AlertDialogCancel>
                           <AlertDialogAction
                               onClick={handleDeleteAccount} // Implement handleDeleteAccount function
                               className={buttonVariants({ variant: "destructive" })} // Ensure destructive styling
                           >
                                Yes, delete account
                            </AlertDialogAction>
                       </AlertDialogFooter>
                   </AlertDialogContent>
               </AlertDialog>
           </CardContent>
       </Card> */}

    </div>
  );
}

export default function SettingsPage() {
  return (
    <ProtectedRoute>
      <SettingsPageContent />
    </ProtectedRoute>
  );
}
