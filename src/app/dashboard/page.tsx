
"use client";

import * as React from 'react';
import { useAuth } from '@/hooks/use-auth';
import { useRouter } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { AlertCircle, ArrowRight, Banknote, Clock, Gift, History, IndianRupee, Loader2, Send, Settings, User, MousePointerClick } from 'lucide-react';
import Link from 'next/link';
import { Alert, AlertTitle, AlertDescription } from '@/components/ui/alert';
import { formatCurrency } from '@/lib/utils';
import ProtectedRoute from '@/components/guards/protected-route';

function DashboardContent() {
  const { user, userProfile, loading: authLoading, authError, fetchUserProfile } = useAuth(); 
  const router = useRouter();
  const [isRefreshing, setIsRefreshing] = React.useState(false);


  React.useEffect(() => {
    if (user && fetchUserProfile) {
        setIsRefreshing(true);
        fetchUserProfile(user.uid).finally(() => setIsRefreshing(false));
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]); 


  const isLoading = authLoading || isRefreshing || (!user && !authError);

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

  if (!user || !userProfile) {
    // This case should ideally be handled by ProtectedRoute redirecting to login
    // If ProtectedRoute isn't working as expected, this is a fallback.
    return (
      <Alert variant="destructive">
        <AlertCircle className="h-4 w-4" />
        <AlertTitle>Access Denied</AlertTitle>
        <AlertDescription>
          You must be logged in to view the dashboard.
           <Button variant="link" className="p-0 h-auto ml-2" onClick={() => router.push('/login')}>
               Go to Login
           </Button>
        </AlertDescription>
      </Alert>
    );
  }

  const stats = [
    { title: "Available Balance", value: formatCurrency(userProfile.cashbackBalance ?? 0), icon: IndianRupee, color: "text-green-600", description: "Ready for withdrawal" },
    { title: "Pending Cashback", value: formatCurrency(userProfile.pendingCashback ?? 0), icon: Clock, color: "text-yellow-600", description: "Awaiting confirmation" },
    { title: "Lifetime Earnings", value: formatCurrency(userProfile.lifetimeCashback ?? 0), icon: Banknote, color: "text-blue-600", description: "Total confirmed cashback" },
    { title: "Referral Bonus", value: formatCurrency(userProfile.referralBonusEarned ?? 0), icon: Gift, color: "text-purple-600", description: `From ${userProfile.referralCount ?? 0} friends` },
  ];

  const quickLinks = [
    { href: "/dashboard/history", label: "Cashback History", icon: History },
    { href: "/dashboard/clicks", label: "Click History", icon: MousePointerClick },
    { href: "/dashboard/payout", label: "Request Payout", icon: Send },
    { href: "/dashboard/referrals", label: "Refer & Earn", icon: Gift },
    { href: "/dashboard/settings", label: "Account Settings", icon: Settings },
  ];

  return (
    <div className="space-y-8">
      <h1 className="text-3xl font-bold">Dashboard</h1>

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

       <div className="grid gap-8 md:grid-cols-2">
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

function DashboardSkeleton() {
  return (
    <div className="space-y-8">
      <Skeleton className="h-9 w-48" />
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
                {Array.from({ length: 5 }).map((_, index) => (
                    <Skeleton key={index} className="h-10 w-full"/>
                ))}
             </CardContent>
           </Card>
       </div>
    </div>
  );
}

export default function DashboardPage() {
    return (
        <ProtectedRoute>
            <DashboardContent />
        </ProtectedRoute>
    );
}
