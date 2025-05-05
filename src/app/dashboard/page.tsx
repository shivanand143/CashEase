"use client";

import * as React from 'react';
import { useAuth } from '@/hooks/use-auth';
import { useRouter } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { AlertCircle, ArrowRight, Banknote, Clock, Gift, History, IndianRupee, Loader2, Send, Settings, User } from 'lucide-react';
import Link from 'next/link';
import { Alert, AlertTitle, AlertDescription } from '@/components/ui/alert';
import { formatCurrency } from '@/lib/utils'; // Assuming you have a currency formatting utility
import ProtectedRoute from '@/components/guards/protected-route'; // Ensure this handles redirection

function DashboardContent() {
  const { user, userProfile, loading: authLoading, error: authError } = useAuth();
  const router = useRouter();

  // Combine loading states
  const isLoading = authLoading || (!user && !authError); // Loading if auth is loading OR no user yet and no error

  // Handle auth errors specifically
  if (authError) {
    return (
      <Alert variant="destructive">
        <AlertCircle className="h-4 w-4" />
        <AlertTitle>Authentication Error</AlertTitle>
        <AlertDescription>
          {authError}.
           <Button variant="link" className="p-0 h-auto ml-2" onClick={() => router.push('/login')}>
               Please try logging in again.
           </Button>
        </AlertDescription>
      </Alert>
    );
  }


  if (isLoading) {
    return <DashboardSkeleton />;
  }

  // If loading is finished, but still no user/profile (should be handled by ProtectedRoute, but defensively check)
  if (!user || !userProfile) {
    console.log("Dashboard: No user or profile found after loading, redirecting (likely handled by ProtectedRoute).");
    // ProtectedRoute should ideally handle the redirect before this point.
    // If it reaches here, return null or a minimal message while redirect happens.
    return null;
     // Or return <DashboardSkeleton /> if preferred during redirect flicker
  }


  // --- Data Ready: Render Dashboard ---
  const stats = [
    { title: "Available Balance", value: formatCurrency(userProfile.cashbackBalance ?? 0), icon: IndianRupee, color: "text-green-600", description: "Ready for withdrawal" },
    { title: "Pending Cashback", value: formatCurrency(userProfile.pendingCashback ?? 0), icon: Clock, color: "text-yellow-600", description: "Awaiting confirmation" },
    { title: "Lifetime Earnings", value: formatCurrency(userProfile.lifetimeCashback ?? 0), icon: Banknote, color: "text-blue-600", description: "Total confirmed cashback" },
    { title: "Referral Bonus", value: formatCurrency(userProfile.referralBonusEarned ?? 0), icon: Gift, color: "text-purple-600", description: `From ${userProfile.referralCount ?? 0} friends` },
  ];

  const quickLinks = [
    { href: "/dashboard/history", label: "Cashback History", icon: History },
    { href: "/dashboard/clicks", label: "Click History", icon: Clock }, // Assuming Clock icon for Click History
    { href: "/dashboard/payout", label: "Request Payout", icon: Send },
    { href: "/dashboard/referrals", label: "Refer & Earn", icon: Gift },
    { href: "/dashboard/settings", label: "Account Settings", icon: Settings },
  ];

  return (
    <div className="space-y-8">
      <h1 className="text-3xl font-bold">Dashboard</h1>

      {/* Stats Grid */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {stats.map((stat) => (
          <Card key={stat.title} className="shadow-sm hover:shadow-md transition-shadow">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">{stat.title}</CardTitle>
              <stat.icon className={`h-5 w-5 ${stat.color}`} />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stat.value}</div>
              <p className="text-xs text-muted-foreground">{stat.description}</p>
            </CardContent>
          </Card>
        ))}
      </div>

       {/* Welcome Message & Quick Links */}
       <div className="grid gap-8 md:grid-cols-2">
         {/* Welcome */}
         <Card className="shadow-sm">
             <CardHeader>
                 <CardTitle>Welcome back, {userProfile.displayName || 'User'}!</CardTitle>
                 <CardDescription>Here's a quick overview of your CashEase account.</CardDescription>
             </CardHeader>
             <CardContent className="space-y-4">
                 <p className="text-sm text-muted-foreground">
                     Keep shopping through CashEase to earn more rewards. Don't forget to check out the latest deals!
                 </p>
                 <div className="flex flex-wrap gap-2">
                    <Button asChild size="sm">
                        <Link href="/stores">Browse Stores</Link>
                    </Button>
                    <Button asChild variant="outline" size="sm">
                        <Link href="/coupons">Find Coupons</Link>
                    </Button>
                 </div>
             </CardContent>
         </Card>

         {/* Quick Links */}
          <Card className="shadow-sm">
            <CardHeader>
              <CardTitle>Quick Links</CardTitle>
              <CardDescription>Navigate quickly to manage your account.</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-2">
              {quickLinks.map((link) => (
                <Button
                  key={link.href}
                  variant="ghost"
                  className="justify-start gap-2 px-3"
                  asChild
                >
                  <Link href={link.href}>
                    <link.icon className="h-4 w-4 text-muted-foreground" />
                    {link.label}
                    <ArrowRight className="ml-auto h-4 w-4 text-muted-foreground/50" />
                  </Link>
                </Button>
              ))}
            </CardContent>
          </Card>
       </div>

    </div>
  );
}

// Skeleton component remains the same
function DashboardSkeleton() {
  return (
    <div className="space-y-8">
      <Skeleton className="h-9 w-48" />

      {/* Stats Skeleton */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, index) => (
          <Card key={index}>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-5 w-5 rounded-full" />
            </CardHeader>
            <CardContent>
              <Skeleton className="h-7 w-32 mb-1" />
              <Skeleton className="h-3 w-40" />
            </CardContent>
          </Card>
        ))}
      </div>

       {/* Welcome/Links Skeleton */}
       <div className="grid gap-8 md:grid-cols-2">
           <Card>
               <CardHeader>
                   <Skeleton className="h-6 w-3/4 mb-2"/>
                   <Skeleton className="h-4 w-1/2"/>
               </CardHeader>
               <CardContent className="space-y-4">
                   <Skeleton className="h-4 w-full"/>
                   <Skeleton className="h-4 w-2/3"/>
                   <div className="flex flex-wrap gap-2">
                      <Skeleton className="h-9 w-28"/>
                      <Skeleton className="h-9 w-28"/>
                   </div>
               </CardContent>
           </Card>
           <Card>
             <CardHeader>
                <Skeleton className="h-6 w-1/2 mb-2"/>
                <Skeleton className="h-4 w-3/4"/>
             </CardHeader>
             <CardContent className="grid gap-2">
                {Array.from({ length: 5 }).map((_, index) => ( // Updated length
                    <Skeleton key={index} className="h-10 w-full"/>
                ))}
             </CardContent>
           </Card>
       </div>
    </div>
  );
}

// Wrap the page content with ProtectedRoute
export default function DashboardPage() {
    return (
        <ProtectedRoute>
            <DashboardContent />
        </ProtectedRoute>
    );
}
