// src/app/(auth)/login/page.tsx
"use client";

import * as React from 'react';
import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { signInWithEmailAndPassword } from 'firebase/auth';

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
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { AlertCircle, LogIn } from 'lucide-react'; // Use a generic Chrome icon or create a Google SVG
import { useAuth } from '@/hooks/use-auth'; // Import useAuth for Google Sign-In
import { ChromeIcon } from '@/components/icons/chrome-icon'; // Import custom icon


const loginSchema = z.object({
  email: z.string().email({ message: 'Invalid email address' }),
  password: z.string().min(6, { message: 'Password must be at least 6 characters' }),
});

type LoginFormValues = z.infer<typeof loginSchema>;

export default function LoginPage() {
  const router = useRouter();
  const { toast } = useToast();
  const { signInWithGoogle } = useAuth(); // Get signInWithGoogle function
  const [loadingEmail, setLoadingEmail] = useState(false); // Loading state for email/password login
  const [loadingGoogle, setLoadingGoogle] = useState(false); // Loading state for Google login
  const [error, setError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<LoginFormValues>({
    resolver: zodResolver(loginSchema),
  });

  const onSubmit = async (data: LoginFormValues) => {
    setLoadingEmail(true);
    setError(null);
    try {
      await signInWithEmailAndPassword(auth, data.email, data.password);
      toast({
        title: 'Login Successful',
        description: 'Welcome back!',
      });
      router.push('/dashboard'); // Redirect to dashboard after successful login
    } catch (err: any) {
       console.error("Login failed:", err);
       // Provide more specific error messages
       let errorMessage = "An unexpected error occurred. Please try again.";
       if (err.code) {
         switch (err.code) {
           case 'auth/user-not-found':
           case 'auth/wrong-password':
           case 'auth/invalid-credential':
             errorMessage = 'Invalid email or password. Please check your credentials.';
             break;
           case 'auth/invalid-email':
             errorMessage = 'Please enter a valid email address.';
             break;
           case 'auth/too-many-requests':
             errorMessage = 'Too many login attempts. Please try again later.';
             break;
           case 'auth/user-disabled':
               errorMessage = 'Your account has been disabled. Please contact support.';
               break;
         }
       }
       setError(errorMessage);
       toast({
         variant: "destructive",
         title: 'Login Failed',
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
          console.error("Google Sign-In failed (from page):", err);
          setError(err.message || "Failed to sign in with Google.");
          // Toast is likely already shown by useAuth
      } finally {
          setLoadingGoogle(false);
      }
   };

  const isLoading = loadingEmail || loadingGoogle; // General loading state

  return (
    <div className="flex justify-center items-center min-h-[calc(100vh-10rem)] px-4 py-8">
      <Card className="w-full max-w-md shadow-lg border border-border rounded-lg">
        <CardHeader className="space-y-1 text-center p-6">
          <CardTitle className="text-2xl md:text-3xl font-bold">Welcome Back!</CardTitle>
          <CardDescription>Enter your email and password or use Google</CardDescription>
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
               <div className="flex items-center justify-between">
                 <Label htmlFor="password">Password</Label>
                 {/* Optional: Add Forgot Password Link */}
                 {/* <Link href="/forgot-password" className="text-sm text-primary hover:underline">
                   Forgot password?
                 </Link> */}
               </div>
              <Input
                id="password"
                type="password"
                {...register('password')}
                disabled={isLoading}
                aria-invalid={errors.password ? "true" : "false"}
                 autoComplete="current-password"
                 className="h-10 text-base"
              />
              {errors.password && <p className="text-sm text-destructive">{errors.password.message}</p>}
            </div>
            <Button type="submit" className="w-full h-10" disabled={isLoading}>
              {loadingEmail ? 'Logging in...' : <> <LogIn className="mr-2 h-4 w-4" /> Login </>}
            </Button>
          </form>

           {/* Separator and Google Login */}
           <div className="relative my-6">
             <div className="absolute inset-0 flex items-center">
               <span className="w-full border-t" />
             </div>
             <div className="relative flex justify-center text-xs uppercase">
               <span className="bg-background px-2 text-muted-foreground">
                 Or continue with
               </span>
             </div>
           </div>
           <Button variant="outline" className="w-full h-10" onClick={handleGoogleSignIn} disabled={isLoading}>
             {loadingGoogle ? 'Signing in...' : <> <ChromeIcon className="mr-2 h-4 w-4" /> Continue with Google </>}
           </Button>

        </CardContent>
        <CardFooter className="flex flex-col space-y-2 text-center text-sm p-6 pt-4">
          <p>
            Don&apos;t have an account?{' '}
            <Link href="/signup" className="font-medium text-primary hover:underline">
              Sign Up
            </Link>
          </p>
        </CardFooter>
      </Card>
    </div>
  );
}

    