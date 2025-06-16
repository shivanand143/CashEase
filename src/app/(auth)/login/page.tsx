
"use client"; // Keep this for the page file itself

import * as React from 'react'; // Import React for Suspense
// Original imports for LoginPage's logic:
import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation'; // This will be in LoginCore
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { signInWithEmailAndPassword } from 'firebase/auth';
import { FirebaseError } from 'firebase/app';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { auth as firebaseAuthService } from '@/lib/firebase/config';
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { AlertCircle, LogIn } from 'lucide-react';
import { useAuth } from '@/hooks/use-auth';
import { ChromeIcon } from '@/components/icons/chrome-icon';
import { Skeleton } from '@/components/ui/skeleton'; // For fallback

// Define the schema and type inside this file as they are used by LoginCore
const loginSchema = z.object({
  email: z.string().email({ message: 'Invalid email address' }),
  password: z.string().min(6, { message: 'Password must be at least 6 characters' }),
});
type LoginFormValues = z.infer<typeof loginSchema>;

// This component will contain the original LoginPage logic and useSearchParams
function LoginCore() {
  const router = useRouter();
  const searchParams = useSearchParams(); // Hook is used here
  const { toast } = useToast();
  const { user, signInWithGoogle, loading: authLoadingHook } = useAuth();
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
        console.log("LOGIN CORE: User already logged in, redirecting...");
        const redirectUrl = typeof window !== 'undefined' ? sessionStorage.getItem('loginRedirectUrl') || '/dashboard' : '/dashboard';
        if (redirectUrl.startsWith('/')) {
          router.push(redirectUrl);
          if (typeof window !== 'undefined') {
            sessionStorage.removeItem('loginRedirectUrl');
            sessionStorage.removeItem('loginRedirectSource');
          }
        } else {
          router.push('/dashboard'); // Fallback
        }
    }
  }, [searchParams, user, authLoadingHook, router]);

  const onSubmit = async (data: LoginFormValues) => {
    console.log("LOGIN CORE: Email/password login attempt for:", data.email);
    if (!firebaseAuthService) {
        setError("Authentication service is not available.");
        toast({ variant: "destructive", title: 'Error', description: "Authentication service failed." });
        return;
    }
    setLoadingEmail(true);
    setError(null);
    try {
      await signInWithEmailAndPassword(firebaseAuthService, data.email, data.password);
      console.log("LOGIN CORE: Email/password login successful for:", data.email);
      toast({
        title: 'Login Successful',
        description: 'Welcome back! Redirecting...',
      });
      if (typeof window !== 'undefined') sessionStorage.setItem('loginRedirectSource', 'loginPage');
    } catch (err: unknown) {
       console.error("LOGIN CORE: Email/password login failed:", err);
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
      console.log("LOGIN CORE: Google Sign-In initiated.");
      setLoadingGoogle(true);
      setError(null);
      try {
          if (typeof window !== 'undefined') sessionStorage.setItem('loginRedirectSource', 'loginPage');
          await signInWithGoogle();
          console.log("LOGIN CORE: Google Sign-In process started via useAuth. Awaiting redirect.");
      } catch (err: any) {
          console.error("LOGIN CORE: Google Sign-In initiation failed (error from login core):", err);
      }
  };

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

// Fallback UI for Suspense
function LoginSkeleton() {
  return (
    <div className="flex justify-center items-center min-h-[calc(100vh-12rem)] px-4 py-8">
      <Card className="w-full max-w-md shadow-lg border border-border rounded-lg">
        <CardHeader className="space-y-1 text-center p-6">
          <Skeleton className="h-8 w-3/5 mx-auto" />
          <Skeleton className="h-4 w-4/5 mx-auto" />
        </CardHeader>
        <CardContent className="space-y-4 p-6">
          <div className="space-y-2">
            <Skeleton className="h-4 w-1/4" />
            <Skeleton className="h-10 w-full" />
          </div>
          <div className="space-y-2">
            <Skeleton className="h-4 w-1/4" />
            <Skeleton className="h-10 w-full" />
          </div>
          <Skeleton className="h-10 w-full" />
          <div className="relative my-6">
            <Skeleton className="h-px w-full" />
            <Skeleton className="h-4 w-1/3 mx-auto absolute inset-x-0 -top-2 bg-background px-2" />
          </div>
          <Skeleton className="h-10 w-full" />
        </CardContent>
        <CardFooter className="flex flex-col space-y-2 text-center text-sm p-6 pt-4">
          <Skeleton className="h-4 w-3/4 mx-auto" />
        </CardFooter>
      </Card>
    </div>
  );
}


// The actual default export for the page route
export default function LoginPageContainer() {
  return (
    <React.Suspense fallback={<LoginSkeleton />}>
      <LoginCore />
    </React.Suspense>
  );
}
      
    