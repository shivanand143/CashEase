// src/app/(auth)/signup/page.tsx
"use client";

import * as React from 'react';
import { useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation'; // Import useSearchParams
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
import { AlertCircle, UserPlus } from 'lucide-react'; // Use a generic Chrome icon or create a Google SVG
import { useAuth } from '@/hooks/use-auth'; // Import useAuth for Google Sign-In and profile creation logic
import { ChromeIcon } from '@/components/icons/chrome-icon'; // Import custom icon


const signupSchema = z.object({
  displayName: z.string().min(2, { message: 'Name must be at least 2 characters' }).max(50, { message: 'Name cannot exceed 50 characters' }),
  email: z.string().email({ message: 'Invalid email address' }),
  password: z.string().min(6, { message: 'Password must be at least 6 characters' }),
});

type SignupFormValues = z.infer<typeof signupSchema>;

export default function SignupPage() {
  const router = useRouter();
   const searchParams = useSearchParams(); // Get search params
  const { toast } = useToast();
  // Use the profile creation logic from the hook
  const { signInWithGoogle, createOrUpdateUserProfile } = useAuth();
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


 const onSubmit = async (data: SignupFormValues) => {
   setLoadingEmail(true);
   setError(null);
   const referralCode = searchParams.get('ref'); // Get referral code from URL
   console.log("Attempting manual signup. Referral code:", referralCode);

   try {
     // 1. Create user in Firebase Authentication
     const userCredential = await createUserWithEmailAndPassword(auth, data.email, data.password);
     const user = userCredential.user;
     console.log("User created in Firebase Auth:", user.uid);

     // 2. Update Firebase Auth profile (optional but good practice)
     await updateProfile(user, {
       displayName: data.displayName,
     });
     console.log("Firebase Auth profile updated with display name:", data.displayName);

     // Ensure user object is refreshed to include displayName for profile creation
     // It might not be immediately available, so we pass it directly if needed.
     const userWithProfileData = {
        ...user,
        displayName: data.displayName, // Ensure displayName from form is used
        role: 'user', // Assign default role
     } as User; // Cast needed as user doesn't initially have all properties

     // 3. Create user profile document in Firestore using the function from useAuth
     // Pass the referral code obtained from the URL params
     await createOrUpdateUserProfile(userWithProfileData, referralCode);
     console.log("Firestore profile created/updated via useAuth function with referral code:", referralCode);

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
               if (err.message?.includes('Missing or insufficient permissions')) {
                  errorMessage = 'Account created, but failed to save profile details due to permissions. Please contact support.';
               } else if (err.message?.includes('Failed to save user profile information.')) {
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
         await signInWithGoogle(); // This now handles profile creation/update internally, including referral code from URL
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
    <div className="flex justify-center items-center min-h-[calc(100vh-10rem)] px-4 py-8">
      <Card className="w-full max-w-md shadow-lg border border-border rounded-lg">
        <CardHeader className="space-y-1 text-center p-6">
          <CardTitle className="text-2xl md:text-3xl font-bold">Create your Account</CardTitle>
          <CardDescription>Join CashEase for free and start earning cashback!</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4 p-6">
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
                 className="h-10 text-base"
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
                 className="h-10 text-base"
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
                 className="h-10 text-base"
              />
               {errors.password && <p className="text-sm text-destructive">{errors.password.message}</p>}
            </div>
            <Button type="submit" className="w-full h-10" disabled={isLoading}>
              {loadingEmail ? 'Creating Account...' : <> <UserPlus className="mr-2 h-4 w-4" /> Sign Up </>}
            </Button>
          </form>

           {/* Separator and Google Login */}
           <div className="relative my-6">
             <div className="absolute inset-0 flex items-center">
               <span className="w-full border-t" />
             </div>
             <div className="relative flex justify-center text-xs uppercase">
               <span className="bg-background px-2 text-muted-foreground">
                 Or sign up with
               </span>
             </div>
           </div>
           <Button variant="outline" className="w-full h-10" onClick={handleGoogleSignIn} disabled={isLoading}>
             {loadingGoogle ? 'Signing in...' : <> <ChromeIcon className="mr-2 h-4 w-4" /> Continue with Google </>}
           </Button>


        </CardContent>
        <CardFooter className="flex flex-col space-y-2 text-center text-sm p-6 pt-4">
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
