// src/app/dashboard/settings/page.tsx
"use client";

import * as React from 'react';
import { useState, useEffect } from 'react';
import { useAuth } from '@/hooks/use-auth';
import { useRouter } from 'next/navigation';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm, Controller } from 'react-hook-form';
import * as z from 'zod';
import { 
  updateProfile as firebaseAuthUpdateProfile, // Renamed to avoid conflict with local updateProfile
  updateEmail as firebaseAuthUpdateEmail, 
  updatePassword as firebaseAuthUpdatePassword, 
  reauthenticateWithCredential, 
  EmailAuthProvider 
} from 'firebase/auth';
import { doc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { db, auth as firebaseAuthService } from '@/lib/firebase/config';

import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { useToast } from "@/hooks/use-toast";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { AlertCircle, Eye, EyeOff, Loader2, User, Lock, Mail, CreditCard, Settings as SettingsIcon } from 'lucide-react';
import ProtectedRoute from '@/components/guards/protected-route';
import { Skeleton } from '@/components/ui/skeleton';
import type { PayoutDetails, PayoutMethod, UserProfile as AppUserProfileType } from '@/lib/types'; // Renamed UserProfile import
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogTrigger,
  DialogClose,
} from "@/components/ui/dialog";


// --- Profile Update Schema ---
const profileSchema = z.object({
  displayName: z.string().min(2, "Name must be at least 2 characters").max(50, "Name too long").optional().or(z.literal('')),
  photoURL: z.string().url("Invalid URL format").optional().or(z.literal('')),
});
type ProfileFormValues = z.infer<typeof profileSchema>;

// --- Payout Details Schema ---
const payoutDetailsSchema = z.object({
  method: z.enum(['bank_transfer', 'paypal', 'gift_card'], { required_error: "Please select a payout method." }),
  detail: z.string().min(5, "Payout details must be at least 5 characters.").max(200, "Details too long."),
});
type PayoutDetailsFormValues = z.infer<typeof payoutDetailsSchema>;

// --- Email Change Schema ---
const emailChangeSchema = z.object({
  newEmail: z.string().email("Invalid email address."),
  currentPasswordForEmail: z.string().min(6, "Password must be at least 6 characters."),
});
type EmailChangeFormValues = z.infer<typeof emailChangeSchema>;

// --- Password Change Schema ---
const passwordChangeSchema = z.object({
  currentPassword: z.string().min(1, "Current password is required."),
  newPassword: z.string().min(6, "New password must be at least 6 characters."),
  confirmNewPassword: z.string().min(6, "Please confirm your new password."),
}).refine((data) => data.newPassword === data.confirmNewPassword, {
  message: "New passwords don't match.",
  path: ["confirmNewPassword"],
});
type PasswordChangeFormValues = z.infer<typeof passwordChangeSchema>;


function SettingsPageSkeleton() {
  return (
    <div className="space-y-8 max-w-3xl mx-auto">
      <Skeleton className="h-9 w-1/3" /> {/* Title "Account Settings" */}

      {/* Profile Information Card Skeleton */}
      <Card>
        <CardHeader>
          <Skeleton className="h-7 w-1/2 mb-1" /> {/* Card Title */}
          <Skeleton className="h-4 w-3/4" /> {/* Card Description */}
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Skeleton className="h-4 w-1/4" /> {/* Label */}
            <Skeleton className="h-10 w-full" /> {/* Input */}
          </div>
          <Skeleton className="h-10 w-32" /> {/* Button */}
        </CardContent>
      </Card>

      {/* Payout Details Card Skeleton */}
      <Card>
        <CardHeader>
          <Skeleton className="h-7 w-1/2 mb-1" />
          <Skeleton className="h-4 w-3/4" />
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Skeleton className="h-4 w-1/4" />
            <Skeleton className="h-10 w-full" />
          </div>
          <div className="space-y-2">
            <Skeleton className="h-4 w-1/4" />
            <Skeleton className="h-10 w-full" />
          </div>
          <Skeleton className="h-10 w-40" />
        </CardContent>
      </Card>


      {/* Change Email Card Skeleton */}
      <Card>
        <CardHeader>
          <Skeleton className="h-7 w-1/2 mb-1" />
          <Skeleton className="h-4 w-3/4" />
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Skeleton className="h-4 w-1/4" />
            <Skeleton className="h-10 w-full" />
          </div>
          <div className="space-y-2">
            <Skeleton className="h-4 w-1/4" />
            <Skeleton className="h-10 w-full" />
          </div>
          <Skeleton className="h-10 w-36" />
        </CardContent>
      </Card>

      {/* Change Password Card Skeleton */}
      <Card>
        <CardHeader>
          <Skeleton className="h-7 w-1/2 mb-1" />
          <Skeleton className="h-4 w-3/4" />
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Skeleton className="h-4 w-1/4" />
            <Skeleton className="h-10 w-full" />
          </div>
          <div className="space-y-2">
            <Skeleton className="h-4 w-1/4" />
            <Skeleton className="h-10 w-full" />
          </div>
          <div className="space-y-2">
            <Skeleton className="h-4 w-1/4" />
            <Skeleton className="h-10 w-full" />
          </div>
          <Skeleton className="h-10 w-40" />
        </CardContent>
      </Card>
    </div>
  );
}

export default function SettingsPage() {
  const { user, userProfile, loading: authLoading, signOut, updateUserProfileData, fetchUserProfile, createOrUpdateUserProfile } = useAuth();
  const router = useRouter();
  const { toast } = useToast();

  // --- State for Profile Form ---
  const [profileLoading, setProfileLoading] = useState(false);
  const [profileError, setProfileError] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  // --- State for Payout Details Form ---
  const [payoutLoading, setPayoutLoading] = useState(false);
  const [payoutError, setPayoutError] = useState<string | null>(null);

  // --- State for Email Change ---
  const [emailChangeLoading, setEmailChangeLoading] = useState(false);
  const [emailChangeError, setEmailChangeError] = useState<string | null>(null);
  const [isEmailChangeDialogOpen, setIsEmailChangeDialogOpen] = useState(false);

  // --- State for Password Change ---
  const [passwordChangeLoading, setPasswordChangeLoading] = useState(false);
  const [passwordChangeError, setPasswordChangeError] = useState<string | null>(null);
  const [isPasswordChangeDialogOpen, setIsPasswordChangeDialogOpen] = useState(false);


  const profileForm = useForm<ProfileFormValues>({
    resolver: zodResolver(profileSchema),
    defaultValues: {
      displayName: userProfile?.displayName || '',
      photoURL: userProfile?.photoURL || '',
    },
  });

  const payoutForm = useForm<PayoutDetailsFormValues>({
    resolver: zodResolver(payoutDetailsSchema),
    defaultValues: {
      method: userProfile?.payoutDetails?.method || undefined,
      detail: userProfile?.payoutDetails?.detail || '',
    },
  });

  const emailChangeForm = useForm<EmailChangeFormValues>({
    resolver: zodResolver(emailChangeSchema),
    defaultValues: { newEmail: '', currentPasswordForEmail: '' },
  });

  const passwordChangeForm = useForm<PasswordChangeFormValues>({
    resolver: zodResolver(passwordChangeSchema),
    defaultValues: { currentPassword: '', newPassword: '', confirmNewPassword: '' },
  });


  useEffect(() => {
    if (!authLoading && !user) {
      router.push('/login?message=Please login to access settings.');
    }
    if (userProfile) {
      profileForm.reset({
        displayName: userProfile.displayName || '',
        photoURL: userProfile.photoURL || '',
      });
      payoutForm.reset({
        method: userProfile.payoutDetails?.method || undefined,
        detail: userProfile.payoutDetails?.detail || '',
      });
    }
     // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, userProfile, authLoading, router]); // Removed form.reset from deps to avoid loops

   const onProfileSubmit = async (data: ProfileFormValues) => {
     if (!user || !userProfile || !firebaseAuthService?.currentUser) return;
     setProfileLoading(true);
     setProfileError(null);

     try {
       await firebaseAuthUpdateProfile(firebaseAuthService.currentUser, {
         displayName: data.displayName || null,
         photoURL: data.photoURL || null,
       });

       await updateUserProfileData(user.uid, {
         displayName: data.displayName || null,
         photoURL: data.photoURL || null,
       });
        await fetchUserProfile(user.uid);

       toast({ title: 'Profile Updated', description: 'Your profile information has been saved.' });
     } catch (err: any) {
       console.error("Profile update failed:", err);
       setProfileError(err.message || "Failed to update profile.");
        toast({ variant: "destructive", title: 'Update Failed', description: err.message || "Failed to update profile." });
     } finally {
       setProfileLoading(false);
     }
  };

  const onPayoutDetailsSubmit = async (data: PayoutDetailsFormValues) => {
    if (!user) return;
    setPayoutLoading(true);
    setPayoutError(null);
    try {
      const payoutDetailsToSave: PayoutDetails = {
        method: data.method,
        detail: data.detail,
      };
      await updateUserProfileData(user.uid, { payoutDetails: payoutDetailsToSave });
      await fetchUserProfile(user.uid);
      toast({ title: 'Payout Details Saved', description: 'Your preferred payout method has been updated.' });
    } catch (err: any) {
      setPayoutError(err.message || "Failed to save payout details.");
      toast({ variant: "destructive", title: 'Save Failed', description: err.message || "Failed to save payout details." });
    } finally {
      setPayoutLoading(false);
    }
  };

   const handleMakeAdmin = async () => {
     if (!user || !userProfile) return;
     // THIS IS NOT SECURE FOR PRODUCTION. Role changes should be done via a backend admin SDK.
     // This is for demonstration/testing in a controlled environment.
     const myAdminUid = process.env.NEXT_PUBLIC_INITIAL_ADMIN_UID;
     if (user.uid !== myAdminUid) {
       toast({ variant: "destructive", title: "Unauthorized", description: "You are not authorized to perform this action." });
       return;
     }

     try {
       // Create a mock AuthUser object with the role property
       const mockAuthUserWithAdminRole = {
         ...user, // Spread existing user properties
         // Firebase User type doesn't have 'role', so we create a compatible object for our function
         // This assumes createOrUpdateUserProfile can handle this custom structure
       };
       
       // We'll directly update the user's role in Firestore
       await updateUserProfileData(user.uid, { role: 'admin' });
       await fetchUserProfile(user.uid); // Re-fetch to update context

       toast({
         title: 'User Role Updated',
         description: 'User has been made admin.',
       });
     } catch (err: any) {
       console.error("Admin role update failed:", err);
       toast({ variant: "destructive", title: 'Update Failed', description: err.message || "Failed to update role." });
     }
  };

   const reauthenticate = async (password: string) => {
       if (!user || !user.email || !firebaseAuthService?.currentUser) {
           throw new Error("User not properly authenticated or auth service not ready.");
       }
       const credential = EmailAuthProvider.credential(user.email, password);
       await reauthenticateWithCredential(firebaseAuthService.currentUser, credential);
   };

  const onEmailChangeSubmit = async (data: EmailChangeFormValues) => {
    if (!user || !user.email || !firebaseAuthService?.currentUser || !db) return;
    setEmailChangeLoading(true);
    setEmailChangeError(null);
    try {
      await reauthenticate(data.currentPasswordForEmail);
      await firebaseAuthUpdateEmail(firebaseAuthService.currentUser, data.newEmail);
      
      const userDocRef = doc(db, 'users', user.uid);
      await updateDoc(userDocRef, {
        email: data.newEmail,
        updatedAt: serverTimestamp(),
      });

      await fetchUserProfile(user.uid);
      toast({ title: "Email Updated", description: "Your email address has been successfully updated. Please verify your new email if prompted." });
      emailChangeForm.reset();
      setIsEmailChangeDialogOpen(false);
    } catch (err: any) {
      console.error("Email change failed:", err);
      setEmailChangeError(err.message || "Failed to update email.");
      toast({ variant: "destructive", title: "Email Update Failed", description: err.message || "Could not update email."});
    } finally {
      setEmailChangeLoading(false);
    }
  };

  const onPasswordChangeSubmit = async (data: PasswordChangeFormValues) => {
    if (!user || !firebaseAuthService?.currentUser) return;
    setPasswordChangeLoading(true);
    setPasswordChangeError(null);
    try {
      await reauthenticate(data.currentPassword);
      await firebaseAuthUpdatePassword(firebaseAuthService.currentUser, data.newPassword);
      toast({ title: "Password Updated", description: "Your password has been successfully changed." });
      passwordChangeForm.reset();
      setIsPasswordChangeDialogOpen(false);
    } catch (err: any) {
      console.error("Password change failed:", err);
      setPasswordChangeError(err.message || "Failed to change password.");
      toast({ variant: "destructive", title: "Password Change Failed", description: err.message || "Could not change password." });
    } finally {
      setPasswordChangeLoading(false);
    }
  };


  if (authLoading || !userProfile) {
    return <ProtectedRoute><SettingsPageSkeleton /></ProtectedRoute>;
  }

  return (
    <ProtectedRoute>
      <div className="space-y-8 max-w-3xl mx-auto">
        <h1 className="text-3xl font-bold flex items-center gap-2"><SettingsIcon className="w-7 h-7 text-primary"/> Account Settings</h1>

        {/* Profile Information Card */}
        <Card className="shadow-md border">
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><User className="w-5 h-5 text-primary"/> Profile Information</CardTitle>
            <CardDescription>Update your display name and profile picture URL.</CardDescription>
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
              <div>
                <Label htmlFor="displayName">Display Name</Label>
                <Input id="displayName" {...profileForm.register('displayName')} placeholder="Your Name" disabled={profileLoading} />
                {profileForm.formState.errors.displayName && <p className="text-sm text-destructive mt-1">{profileForm.formState.errors.displayName.message}</p>}
              </div>
              <div>
                <Label htmlFor="photoURL">Photo URL</Label>
                <Input id="photoURL" {...profileForm.register('photoURL')} placeholder="https://example.com/image.png" disabled={profileLoading} />
                {profileForm.formState.errors.photoURL && <p className="text-sm text-destructive mt-1">{profileForm.formState.errors.photoURL.message}</p>}
              </div>
              <Button type="submit" disabled={profileLoading || !userProfile}>
                {profileLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin"/> : null}
                Save Profile
              </Button>
            </form>
            {user && userProfile && user.uid === process.env.NEXT_PUBLIC_INITIAL_ADMIN_UID && userProfile.role !== 'admin' && (
               <Button type="button" onClick={handleMakeAdmin} variant="outline" className="mt-4" disabled={profileLoading}>
                 Make Admin (Dev Only)
               </Button>
            )}
          </CardContent>
        </Card>

        {/* Payout Details Card */}
        <Card className="shadow-md border">
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><CreditCard className="w-5 h-5 text-primary"/> Payout Details</CardTitle>
            <CardDescription>Manage your preferred method for receiving cashback.</CardDescription>
          </CardHeader>
          <CardContent>
            {payoutError && (
              <Alert variant="destructive" className="mb-4">
                <AlertCircle className="h-4 w-4" />
                <AlertTitle>Error</AlertTitle>
                <AlertDescription>{payoutError}</AlertDescription>
              </Alert>
            )}
            <form onSubmit={payoutForm.handleSubmit(onPayoutDetailsSubmit)} className="space-y-4">
              <Controller
                name="method"
                control={payoutForm.control}
                render={({ field }) => (
                  <RadioGroup
                    onValueChange={field.onChange}
                    defaultValue={field.value} // Use defaultValue for initial set
                    value={field.value} // Controlled component
                    className="grid grid-cols-1 sm:grid-cols-3 gap-2"
                    aria-label="Payout Method"
                  >
                    {(['bank_transfer', 'paypal', 'gift_card'] as PayoutMethod[]).map((method) => (
                      <Label
                        key={method}
                        htmlFor={`payout-settings-${method}`}
                        className={`flex items-center justify-center rounded-md border-2 border-muted bg-popover p-3 hover:bg-accent hover:text-accent-foreground cursor-pointer ${
                          field.value === method ? "border-primary ring-2 ring-primary" : ""
                        }`}
                      >
                        <RadioGroupItem value={method} id={`payout-settings-${method}`} className="sr-only" />
                        <span className="font-normal capitalize text-sm">{method.replace('_', ' ')}</span>
                      </Label>
                    ))}
                  </RadioGroup>
                )}
              />
              {payoutForm.formState.errors.method && <p className="text-sm text-destructive">{payoutForm.formState.errors.method.message}</p>}

              <div>
                <Label htmlFor="payoutDetailSettings">
                  {payoutForm.watch('method') === 'bank_transfer' && 'Bank Account / UPI ID'}
                  {payoutForm.watch('method') === 'paypal' && 'PayPal Email Address'}
                  {payoutForm.watch('method') === 'gift_card' && 'Preferred Gift Card (e.g., Amazon)'}
                  {!payoutForm.watch('method') && 'Payment Details'}
                </Label>
                <Textarea
                  id="payoutDetailSettings"
                  {...payoutForm.register('detail')}
                  placeholder="Enter your payout details..."
                  rows={2}
                  disabled={payoutLoading}
                />
                {payoutForm.formState.errors.detail && <p className="text-sm text-destructive mt-1">{payoutForm.formState.errors.detail.message}</p>}
              </div>
              <Button type="submit" disabled={payoutLoading || !userProfile}>
                {payoutLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin"/> : null}
                Save Payout Details
              </Button>
            </form>
          </CardContent>
        </Card>

        {/* Change Email Card */}
        <Card className="shadow-md border">
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><Mail className="w-5 h-5 text-primary"/> Change Email</CardTitle>
            <CardDescription>Update the email address associated with your account.</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-sm mb-2">Current Email: <span className="font-semibold">{user?.email}</span></p>
            <Dialog open={isEmailChangeDialogOpen} onOpenChange={setIsEmailChangeDialogOpen}>
              <DialogTrigger asChild>
                <Button variant="outline" disabled={!user || !user.email || (user.providerData.length > 0 && user.providerData[0].providerId !== 'password')}>
                  Change Email
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Change Your Email Address</DialogTitle>
                  <DialogDescription>
                    Enter your current password and new email address. You may need to re-verify your email.
                  </DialogDescription>
                </DialogHeader>
                {emailChangeError && (
                  <Alert variant="destructive" className="my-2">
                    <AlertCircle className="h-4 w-4" />
                    <AlertTitle>Error</AlertTitle>
                    <AlertDescription>{emailChangeError}</AlertDescription>
                  </Alert>
                )}
                <form onSubmit={emailChangeForm.handleSubmit(onEmailChangeSubmit)} className="space-y-4 py-2">
                  <div>
                    <Label htmlFor="currentPasswordForEmail">Current Password</Label>
                    <Input id="currentPasswordForEmail" type="password" {...emailChangeForm.register('currentPasswordForEmail')} disabled={emailChangeLoading} />
                    {emailChangeForm.formState.errors.currentPasswordForEmail && <p className="text-sm text-destructive mt-1">{emailChangeForm.formState.errors.currentPasswordForEmail.message}</p>}
                  </div>
                  <div>
                    <Label htmlFor="newEmail">New Email Address</Label>
                    <Input id="newEmail" type="email" {...emailChangeForm.register('newEmail')} disabled={emailChangeLoading} />
                    {emailChangeForm.formState.errors.newEmail && <p className="text-sm text-destructive mt-1">{emailChangeForm.formState.errors.newEmail.message}</p>}
                  </div>
                  <DialogFooter>
                    <DialogClose asChild><Button type="button" variant="outline" disabled={emailChangeLoading}>Cancel</Button></DialogClose>
                    <Button type="submit" disabled={emailChangeLoading}>
                      {emailChangeLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin"/> : null} Submit Email Change
                    </Button>
                  </DialogFooter>
                </form>
              </DialogContent>
            </Dialog>
            {user && user.providerData.length > 0 && user.providerData[0].providerId !== 'password' && (
                <p className="text-xs text-muted-foreground mt-2">Email change is not available for accounts signed in with Google.</p>
            )}
          </CardContent>
        </Card>


        {/* Change Password Card */}
        <Card className="shadow-md border">
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><Lock className="w-5 h-5 text-primary"/> Change Password</CardTitle>
            <CardDescription>Update your account password.</CardDescription>
          </CardHeader>
          <CardContent>
             <Dialog open={isPasswordChangeDialogOpen} onOpenChange={setIsPasswordChangeDialogOpen}>
               <DialogTrigger asChild>
                 <Button variant="outline" disabled={!user || (user.providerData.length > 0 && user.providerData[0].providerId !== 'password')}>
                   Change Password
                 </Button>
               </DialogTrigger>
               <DialogContent>
                 <DialogHeader>
                   <DialogTitle>Change Your Password</DialogTitle>
                   <DialogDescription>
                     Enter your current password and your new password.
                   </DialogDescription>
                 </DialogHeader>
                 {passwordChangeError && (
                   <Alert variant="destructive" className="my-2">
                     <AlertCircle className="h-4 w-4" />
                     <AlertTitle>Error</AlertTitle>
                     <AlertDescription>{passwordChangeError}</AlertDescription>
                   </Alert>
                 )}
                 <form onSubmit={passwordChangeForm.handleSubmit(onPasswordChangeSubmit)} className="space-y-4 py-2">
                   <div className="relative">
                     <Label htmlFor="currentPassword">Current Password</Label>
                     <Input id="currentPassword" type={showPassword ? "text" : "password"} {...passwordChangeForm.register('currentPassword')} disabled={passwordChangeLoading} />
                      <Button type="button" variant="ghost" size="sm" className="absolute right-1 top-6 h-7 px-2" onClick={() => setShowPassword(!showPassword)}>
                          {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </Button>
                     {passwordChangeForm.formState.errors.currentPassword && <p className="text-sm text-destructive mt-1">{passwordChangeForm.formState.errors.currentPassword.message}</p>}
                   </div>
                   <div className="relative">
                     <Label htmlFor="newPassword">New Password</Label>
                     <Input id="newPassword" type={showNewPassword ? "text" : "password"} {...passwordChangeForm.register('newPassword')} disabled={passwordChangeLoading} />
                      <Button type="button" variant="ghost" size="sm" className="absolute right-1 top-6 h-7 px-2" onClick={() => setShowNewPassword(!showNewPassword)}>
                          {showNewPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </Button>
                     {passwordChangeForm.formState.errors.newPassword && <p className="text-sm text-destructive mt-1">{passwordChangeForm.formState.errors.newPassword.message}</p>}
                   </div>
                   <div className="relative">
                     <Label htmlFor="confirmNewPassword">Confirm New Password</Label>
                     <Input id="confirmNewPassword" type={showConfirmPassword ? "text" : "password"} {...passwordChangeForm.register('confirmNewPassword')} disabled={passwordChangeLoading} />
                     <Button type="button" variant="ghost" size="sm" className="absolute right-1 top-6 h-7 px-2" onClick={() => setShowConfirmPassword(!showConfirmPassword)}>
                          {showConfirmPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </Button>
                     {passwordChangeForm.formState.errors.confirmNewPassword && <p className="text-sm text-destructive mt-1">{passwordChangeForm.formState.errors.confirmNewPassword.message}</p>}
                   </div>
                   <DialogFooter>
                     <DialogClose asChild><Button type="button" variant="outline" disabled={passwordChangeLoading}>Cancel</Button></DialogClose>
                     <Button type="submit" disabled={passwordChangeLoading}>
                       {passwordChangeLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin"/> : null} Update Password
                     </Button>
                   </DialogFooter>
                 </form>
               </DialogContent>
             </Dialog>
             {user && user.providerData.length > 0 && user.providerData[0].providerId !== 'password' && (
                <p className="text-xs text-muted-foreground mt-2">Password change is not available for accounts signed in with Google.</p>
             )}
          </CardContent>
        </Card>
      </div>
    </ProtectedRoute>
  );
}
