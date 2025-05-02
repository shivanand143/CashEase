// src/app/(auth)/signup/page.tsx
"use client";

import * as React from 'react';
import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { createUserWithEmailAndPassword, updateProfile } from 'firebase/auth';
import { doc, setDoc, serverTimestamp, getDoc } from 'firebase/firestore'; // Import getDoc


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
import { auth, db } from '@/lib/firebase/config';
import type { UserProfile, User } from '@/lib/types'; // Assuming User type is exported from types or use firebase/auth User
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { AlertCircle, UserPlus, ChromeIcon } from 'lucide-react'; // Use a generic Chrome icon or create a Google SVG
import { Separator } from '@/components/ui/separator'; // Import Separator
import { useAuth } from '@/hooks/use-auth'; // Import useAuth for Google Sign-In


const signupSchema = z.object({
  displayName: z.string().min(2, { message: 'Name must be at least 2 characters' }).max(50, { message: 'Name cannot exceed 50 characters' }),
  email: z.string().email({ message: 'Invalid email address' }),
  password: z.string().min(6, { message: 'Password must be at least 6 characters' }),
});

type SignupFormValues = z.infer<typeof signupSchema>;

export default function SignupPage() {
  const router = useRouter();
  const { toast } = useToast();
  const { signInWithGoogle } = useAuth(); // Get signInWithGoogle function
  const [loadingEmail, setLoadingEmail] = useState(false);
  const [loadingGoogle, setLoadingGoogle] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<SignupFormValues>({
    resolver: zodResolver(signupSchema),
  });

 // Function to create/update profile in Firestore (moved from useAuth for reuse here, consider refactoring later)
 const createOrUpdateUserProfile = async (userToUpdate: User) => {
   if (!userToUpdate) return;
   const userDocRef = doc(db, 'users', userToUpdate.uid);
   console.log(`Attempting to create/update profile for user: ${userToUpdate.uid} during manual signup`);

   try {
     const docSnap = await getDoc(userDocRef);
     let existingData: Partial<UserProfile> = {};
     if (docSnap.exists()) {
       existingData = docSnap.data() as Partial<UserProfile>;
       console.log("Existing profile data found:", existingData);
     } else {
        console.log("No existing profile found, creating new one.");
     }

     // Ensure all optional fields are handled, preferring existing data if available
     const newUserProfileData: Omit<UserProfile, 'createdAt' | 'updatedAt'> & { createdAt?: any, updatedAt: any } = {
       uid: userToUpdate.uid,
       email: userToUpdate.email,
       displayName: userToUpdate.displayName, // Use name from Auth profile first
       photoURL: userToUpdate.photoURL ?? null, // Use photo from Auth profile first
       role: existingData.role ?? 'user',
       cashbackBalance: existingData.cashbackBalance ?? 0,
       pendingCashback: existingData.pendingCashback ?? 0,
       lifetimeCashback: existingData.lifetimeCashback ?? 0,
       referralCode: existingData.referralCode ?? null, // Use null if undefined
       referredBy: existingData.referredBy ?? null, // Use null if undefined
       // Only set createdAt if document doesn't exist
       ...( !docSnap.exists() && { createdAt: serverTimestamp() } ),
       updatedAt: serverTimestamp(),
     };

     // Use setDoc with merge: true to create or update
     await setDoc(userDocRef, newUserProfileData, { merge: true });
     console.log(`User profile successfully created/updated for ${userToUpdate.uid}`);

   } catch (error) {
     console.error(`Error creating/updating user profile for ${userToUpdate.uid}:`, error);
     // Handle error appropriately (e.g., show toast, log)
      throw new Error("Failed to save user profile information."); // Re-throw to be caught by onSubmit
   }
 };


 const onSubmit = async (data: SignupFormValues) => {
   setLoadingEmail(true);
   setError(null);
   try {
     // 1. Create user in Firebase Authentication
     const userCredential = await createUserWithEmailAndPassword(auth, data.email, data.password);
     const user = userCredential.user;

     // 2. Update Firebase Auth profile (optional but good practice)
     await updateProfile(user, {
       displayName: data.displayName,
       // Optionally set photoURL here if you collect it
     });

     // Ensure user object is refreshed to include displayName for profile creation
     // It might not be immediately available, so we pass it directly if needed.
     const userWithProfileData = {
        ...user,
        displayName: data.displayName, // Ensure displayName from form is used
     } as User; // Cast needed as user doesn't initially have all properties

     // 3. Create user profile document in Firestore using the helper function
     await createOrUpdateUserProfile(userWithProfileData);

     toast({
       title: 'Signup Successful',
       description: 'Welcome to CashEase! Redirecting...',
     });
     router.push('/dashboard'); // Redirect to dashboard after successful signup

   } catch (err: any) {
     console.error("Signup failed:", err);
     let errorMessage = "An unexpected error occurred. Please try again.";
     if (err.code) {
       switch (err.code) {
         case 'auth/email-already-in-use':
           errorMessage = 'This email address is already registered. Please try logging in.';
           break;
         case 'auth/invalid-email':
           errorMessage = 'Please enter a valid email address.';
           break;
         case 'auth/weak-password':
           errorMessage = 'Password is too weak. Please choose a stronger password (at least 6 characters).';
           break;
         case 'auth/operation-not-allowed':
             errorMessage = 'Email/password accounts are not enabled. Please contact support.';
             break;
         default:
              // Check for Firestore specific errors
               if (err.message?.includes('Failed to save user profile information.')) {
                  errorMessage = 'Account created, but failed to save profile details. Please contact support.';
               } else {
                   errorMessage = `An error occurred (${err.code || 'unknown'}). Please try again.`;
               }
       }
     }
     setError(errorMessage);
     toast({
       variant: "destructive",
       title: 'Signup Failed',
       description: errorMessage,
     });
   } finally {
     setLoadingEmail(false);
   }
 };

  const handleGoogleSignIn = async () => {
     setLoadingGoogle(true);
     setError(null);
     try {
         await signInWithGoogle();
         // No need for toast here, it's handled in useAuth
         router.push('/dashboard'); // Redirect on success
     } catch (err: any) {
         // Error handling is mostly done within useAuth, but we can set local error state if needed
         console.error("Google Sign-In failed (from signup page):", err);
         setError(err.message || "Failed to sign in with Google.");
         // Toast is likely already shown by useAuth
     } finally {
         setLoadingGoogle(false);
     }
  };

  const isLoading = loadingEmail || loadingGoogle;


  return (
    <div className="flex justify-center items-center min-h-[calc(100vh-10rem)]">
      <Card className="w-full max-w-md shadow-lg">
        <CardHeader className="space-y-1 text-center">
          <CardTitle className="text-2xl font-bold">Create your Account</CardTitle>
          <CardDescription>Join CashEase for free and start earning cashback!</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {error && (
             <Alert variant="destructive">
               <AlertCircle className="h-4 w-4" />
               <AlertTitle>Error</AlertTitle>
               <AlertDescription>{error}</AlertDescription>
             </Alert>
           )}
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="displayName">Name</Label>
              <Input
                id="displayName"
                type="text"
                placeholder="Your Name"
                {...register('displayName')}
                disabled={isLoading}
                 aria-invalid={errors.displayName ? "true" : "false"}
                 autoComplete="name"
              />
               {errors.displayName && <p className="text-sm text-destructive">{errors.displayName.message}</p>}
            </div>
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                placeholder="m@example.com"
                {...register('email')}
                disabled={isLoading}
                 aria-invalid={errors.email ? "true" : "false"}
                 autoComplete="email"
              />
               {errors.email && <p className="text-sm text-destructive">{errors.email.message}</p>}
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                placeholder="••••••••"
                {...register('password')}
                disabled={isLoading}
                 aria-invalid={errors.password ? "true" : "false"}
                 autoComplete="new-password"
              />
               {errors.password && <p className="text-sm text-destructive">{errors.password.message}</p>}
            </div>
            <Button type="submit" className="w-full" disabled={isLoading}>
              {loadingEmail ? 'Creating Account...' : <> <UserPlus className="mr-2 h-4 w-4" /> Sign Up </>}
            </Button>
          </form>

           {/* Separator and Google Login */}
           <div className="relative my-4">
             <div className="absolute inset-0 flex items-center">
               <span className="w-full border-t" />
             </div>
             <div className="relative flex justify-center text-xs uppercase">
               <span className="bg-background px-2 text-muted-foreground">
                 Or sign up with
               </span>
             </div>
           </div>
           <Button variant="outline" className="w-full" onClick={handleGoogleSignIn} disabled={isLoading}>
             {loadingGoogle ? 'Signing in...' : <> <ChromeIcon className="mr-2 h-4 w-4" /> Continue with Google </>}
           </Button>


        </CardContent>
        <CardFooter className="flex flex-col space-y-2 text-center text-sm">
           <p className="text-xs text-muted-foreground px-4">
             By clicking Sign Up or Continue with Google, you agree to our{' '}
             <Link href="/terms" className="underline hover:text-primary">Terms of Service</Link> and{' '}
             <Link href="/privacy" className="underline hover:text-primary">Privacy Policy</Link>.
           </p>
          <p className="mt-4">
            Already have an account?{' '}
            <Link href="/login" className="font-medium text-primary hover:underline">
              Login
            </Link>
          </p>
        </CardFooter>
      </Card>
    </div>
  );
}
