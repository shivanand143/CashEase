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
import { doc, setDoc, serverTimestamp } from 'firebase/firestore';


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
import type { UserProfile } from '@/lib/types';
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { AlertCircle, UserPlus } from 'lucide-react';

const signupSchema = z.object({
  displayName: z.string().min(2, { message: 'Name must be at least 2 characters' }).max(50, { message: 'Name cannot exceed 50 characters' }),
  email: z.string().email({ message: 'Invalid email address' }),
  password: z.string().min(6, { message: 'Password must be at least 6 characters' }),
});

type SignupFormValues = z.infer<typeof signupSchema>;

export default function SignupPage() {
  const router = useRouter();
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<SignupFormValues>({
    resolver: zodResolver(signupSchema),
  });

 const onSubmit = async (data: SignupFormValues) => {
   setLoading(true);
   setError(null);
   try {
     // 1. Create user in Firebase Authentication
     const userCredential = await createUserWithEmailAndPassword(auth, data.email, data.password);
     const user = userCredential.user;

     // 2. Update Firebase Auth profile (optional but good practice)
     await updateProfile(user, {
       displayName: data.displayName,
     });

     // 3. Create user profile document in Firestore
     const userDocRef = doc(db, 'users', user.uid);
     const newUserProfile: Omit<UserProfile, 'uid'> = {
       email: user.email,
       displayName: data.displayName,
       role: 'user', // Default role
       cashbackBalance: 0,
       pendingCashback: 0,
       lifetimeCashback: 0,
       createdAt: new Date(), // Use client-side date for consistency or serverTimestamp()
       // referralCode: generateReferralCode(), // TODO: Implement referral code generation if needed
     };

     // Use setDoc to create the document with the specific UID
     await setDoc(userDocRef, {
        ...newUserProfile,
        createdAt: serverTimestamp() // Use server timestamp for creation time
     });

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
       }
     }
     setError(errorMessage);
     toast({
       variant: "destructive",
       title: 'Signup Failed',
       description: errorMessage,
     });
   } finally {
     setLoading(false);
   }
 };


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
                disabled={loading}
                 aria-invalid={errors.displayName ? "true" : "false"}
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
                disabled={loading}
                 aria-invalid={errors.email ? "true" : "false"}
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
                disabled={loading}
                 aria-invalid={errors.password ? "true" : "false"}
              />
               {errors.password && <p className="text-sm text-destructive">{errors.password.message}</p>}
            </div>
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? 'Creating Account...' : <> <UserPlus className="mr-2 h-4 w-4" /> Sign Up </>}
            </Button>
          </form>
        </CardContent>
        <CardFooter className="flex flex-col space-y-2 text-center text-sm">
           <p className="text-xs text-muted-foreground px-4">
             By clicking Sign Up, you agree to our{' '}
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
