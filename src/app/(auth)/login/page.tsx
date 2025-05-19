
"use client";

import * as React from 'react';
import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
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
import { auth as firebaseAuthService } from '@/lib/firebase/config'; // Use firebaseAuthService alias
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
  const searchParams = useSearchParams();
  const { toast } = useToast();
  const { user, signInWithGoogle, loading: authLoadingHook } = useAuth(); // Renamed authLoading to authLoadingHook
  const [loadingEmail, setLoadingEmail] = useState(false);
  const [loadingGoogle, setLoadingGoogle] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [redirectMessage, setRedirectMessage] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<LoginFormValues>({
    resolver: zodResolver(loginSchema),
  });

  useEffect(() => {
    const message = searchParams?.get('message');
    if (message) {
      setRedirectMessage(decodeURIComponent(message));
    }
    if (user && !authLoadingHook) {
        console.log("LOGIN PAGE: User already logged in, redirecting...");
        const redirectUrl = sessionStorage.getItem('loginRedirectUrl') || '/dashboard';
        if (redirectUrl.startsWith('/')) {
          router.push(redirectUrl);
          sessionStorage.removeItem('loginRedirectUrl');
          sessionStorage.removeItem('loginRedirectSource');
        } else {
          router.push('/dashboard'); // Fallback
        }
    }
  }, [searchParams, user, authLoadingHook, router]);


  const onSubmit = async (data: LoginFormValues) => {
    console.log("LOGIN PAGE: Email/password login attempt for:", data.email);
    if (!firebaseAuthService) { // Check aliased import
        setError("Authentication service is not available.");
        toast({ variant: "destructive", title: 'Error', description: "Authentication service failed." });
        return;
    }
    setLoadingEmail(true);
    setError(null);
    try {
      await signInWithEmailAndPassword(firebaseAuthService, data.email, data.password); // Use aliased import
      console.log("LOGIN PAGE: Email/password login successful for:", data.email);
      toast({
        title: 'Login Successful',
        description: 'Welcome back! Redirecting...',
      });
      // Redirection is handled by useAuth's onAuthStateChanged or getRedirectResult now.
      // For email/pass, onAuthStateChanged will pick it up.
      if (typeof window !== 'undefined') sessionStorage.setItem('loginRedirectSource', 'loginPage');
    } catch (err: unknown) {
       console.error("LOGIN PAGE: Email/password login failed:", err);
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
             errorMessage = 'Too many login attempts. Please try again later or reset your password.';
             break;
           case 'auth/user-disabled':
               errorMessage = 'Your account has been disabled. Please contact support.';
               break;
            case 'auth/network-request-failed':
                errorMessage = 'Network error. Please check your internet connection and try again.';
                break;
            default:
                errorMessage = `Login failed (${err.code || 'unknown'}). Please try again.`;
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
      console.log("LOGIN PAGE: Google Sign-In initiated.");
      setLoadingGoogle(true); // Set loading state for Google button
      setError(null);
      try {
          if (typeof window !== 'undefined') sessionStorage.setItem('loginRedirectSource', 'loginPage');
          await signInWithGoogle();
          // Redirection is handled by useAuth hook (getRedirectResult & onAuthStateChanged)
          console.log("LOGIN PAGE: Google Sign-In process started via useAuth. Awaiting redirect.");
      } catch (err: any) {
          // Errors during *initiation* of signInWithGoogle (e.g., popup blocked before redirect)
          // are typically handled within useAuth itself.
          // If an error still bubbles up here, it's likely an unexpected scenario.
          console.error("LOGIN PAGE: Google Sign-In initiation failed (error from login page):", err);
          // Toast for this specific error if not handled by useAuth
          // setError(err.message || "Failed to start Google Sign-In.");
          // toast({ variant: "destructive", title: "Google Sign-In Error", description: err.message || "Could not start Google Sign-In."});
      } finally {
          // For signInWithRedirect, loading state might need to persist until redirect happens
          // or be managed by the global authLoadingHook from useAuth.
          // setLoadingGoogle(false); // Potentially remove if redirect makes this state irrelevant.
      }
   };

  // isLoading now combines local email/Google loading AND global auth loading from the hook
  const isLoading = loadingEmail || loadingGoogle || authLoadingHook;

  return (
    <div className="flex justify-center items-center min-h-[calc(100vh-12rem)] px-4 py-8">
      <Card className="w-full max-w-md shadow-lg border border-border rounded-lg">
        <CardHeader className="space-y-1 text-center p-6">
          <CardTitle className="text-2xl md:text-3xl font-bold">Welcome Back!</CardTitle>
          <CardDescription>Enter your email and password or use Google</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4 p-6">
           {redirectMessage && (
             <Alert variant="default" className="border-blue-500 bg-blue-50 text-blue-700 dark:border-blue-400 dark:bg-blue-900/30 dark:text-blue-300 [&>svg]:text-blue-700 dark:[&>svg]:text-blue-300">
               <AlertCircle className="h-4 w-4" />
               <AlertTitle>Please Login</AlertTitle>
               <AlertDescription>{redirectMessage}</AlertDescription>
             </Alert>
           )}
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
                 {/* Optional: Add Forgot Password link here */}
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
             {loadingGoogle || authLoadingHook ? 'Signing in with Google...' : <> <ChromeIcon className="mr-2 h-4 w-4" /> Continue with Google </>}
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
