
"use client";

import * as React from 'react';
import { useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { createUserWithEmailAndPassword, updateProfile, User } from 'firebase/auth';
import { FirebaseError } from 'firebase/app';

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
import { auth } from '@/lib/firebase/config';
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { AlertCircle, UserPlus } from 'lucide-react';
import { useAuth } from '@/hooks/use-auth';
import { ChromeIcon } from '@/components/icons/chrome-icon';

const signupSchema = z.object({
  displayName: z.string().min(2, { message: 'Name must be at least 2 characters' }).max(50, { message: 'Name cannot exceed 50 characters' }),
  email: z.string().email({ message: 'Invalid email address' }),
  password: z.string().min(6, { message: 'Password must be at least 6 characters' }),
});

type SignupFormValues = z.infer<typeof signupSchema>;

export default function SignupPageClientContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { toast } = useToast();
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
    if (!auth) {
        setError("Authentication service is not available.");
        toast({ variant: "destructive", title: 'Error', description: "Authentication service failed." });
        return;
    }
    setLoadingEmail(true);
    setError(null);
    const referralCodeFromUrl = searchParams.get('ref');
    console.log("Manual signup attempt. Referral code from URL:", referralCodeFromUrl);

    try {
      const userCredential = await createUserWithEmailAndPassword(auth, data.email, data.password);
      const user = userCredential.user;
      console.log("User created in Firebase Auth:", user.uid);

      await updateProfile(user, { displayName: data.displayName });
      console.log("Firebase Auth profile updated with display name:", data.displayName);
      
      // Pass the referral code from the URL and the user object as type User
      await createOrUpdateUserProfile(user as User, referralCodeFromUrl);


      toast({
        title: 'Signup Successful',
        description: 'Welcome to MagicSaver! Redirecting...',
      });
      router.push('/dashboard');

    } catch (err: unknown) {
      console.error("Signup failed:", err);
      let errorMessage = "An unexpected error occurred. Please try again.";
      if (err instanceof FirebaseError) {
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
           case 'auth/network-request-failed':
                errorMessage = 'Network error. Please check your internet connection.';
                break;
          default:
            errorMessage = `Signup error (${err.code}). Please try again.`;
        }
      } else if (err instanceof Error) {
          errorMessage = err.message;
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
     } catch (err: any) {
         console.error("Google Sign-In failed (from signup page):", err);
     } finally {
         setLoadingGoogle(false);
     }
  };

  const isLoading = loadingEmail || loadingGoogle;

  return (
    <div className="flex justify-center items-center min-h-[calc(100vh-12rem)] px-4 py-8">
      <Card className="w-full max-w-md shadow-lg border border-border rounded-lg">
        <CardHeader className="space-y-1 text-center p-6">
          <CardTitle className="text-2xl md:text-3xl font-bold">Create your Account</CardTitle>
          <CardDescription>Join MagicSaver for free and start earning cashback!</CardDescription>
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
