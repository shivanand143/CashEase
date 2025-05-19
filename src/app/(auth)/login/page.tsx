
"use client";

import * as React from 'react';
import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { signInWithEmailAndPassword } from 'firebase/auth';
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
import { AlertCircle, LogIn } from 'lucide-react';
import { useAuth } from '@/hooks/use-auth';
import { ChromeIcon } from '@/components/icons/chrome-icon';

const loginSchema = z.object({
  email: z.string().email({ message: 'Invalid email address' }),
  password: z.string().min(6, { message: 'Password must be at least 6 characters' }),
});

type LoginFormValues = z.infer<typeof loginSchema>;

export default function LoginPage() {
  const router = useRouter();
  const { toast } = useToast();
  const { signInWithGoogle, loading: authLoading } = useAuth(); // Get authLoading from useAuth
  const [loadingEmail, setLoadingEmail] = useState(false);
  const [loadingGoogle, setLoadingGoogle] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<LoginFormValues>({
    resolver: zodResolver(loginSchema),
  });

  const onSubmit = async (data: LoginFormValues) => {
    if (!auth) {
        setError("Authentication service is not available.");
        toast({ variant: "destructive", title: 'Error', description: "Authentication service failed." });
        return;
    }
    setLoadingEmail(true);
    setError(null);
    try {
      await signInWithEmailAndPassword(auth, data.email, data.password);
      toast({
        title: 'Login Successful',
        description: 'Welcome back!',
      });
      // Redirection is handled by useAuth's onAuthStateChanged or getRedirectResult
      // router.push('/dashboard'); // Keep commented if useAuth handles it
    } catch (err: unknown) {
       console.error("Login failed:", err);
       let errorMessage = "An unexpected error occurred. Please try again.";
       if (err instanceof FirebaseError) {
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
            case 'auth/network-request-failed':
                errorMessage = 'Network error. Please check your internet connection.';
                break;
            default:
                errorMessage = `Login failed (${err.code}). Please try again.`;
         }
       } else if (err instanceof Error) {
           errorMessage = err.message;
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
          // Redirect is handled by useAuth hook
      } catch (err: any) {
          console.error("Google Sign-In failed (from login page):", err);
          // Error is usually handled and toasted within signInWithGoogle
      } finally {
          setLoadingGoogle(false);
      }
   };

  const isLoading = loadingEmail || loadingGoogle || authLoading; // Include authLoading

  return (
    <div className="flex justify-center items-center min-h-[calc(100vh-12rem)] px-4 py-8">
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
