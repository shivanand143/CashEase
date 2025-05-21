// src/app/dashboard/page.tsx
"use client";

import * as React from 'react';
import Link from 'next/link';
import { useAuth } from '@/hooks/use-auth';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { formatCurrency, safeToDate } from '@/lib/utils'; // Ensure safeToDate is imported
import {
    IndianRupee,
    History,
    Send,
    Gift,
    Settings,
    ShoppingBag,
    Tag,
    User,
    AlertCircle,
    ArrowRight,
    MousePointerClick,
    ReceiptText, // Icon for Payouts
    ListChecks // Icon for Recent Payouts card
} from 'lucide-react';
import ProtectedRoute from '@/components/guards/protected-route';
import { useRouter } from 'next/navigation';
import { collection, query, where, orderBy, limit, getDocs, Timestamp } from 'firebase/firestore';
import { db } from '@/lib/firebase/config';
import type { PayoutRequest, PayoutStatus } from '@/lib/types';
import { format } from 'date-fns';
import { Badge } from '@/components/ui/badge';


const getStatusVariant = (status: PayoutStatus): "default" | "secondary" | "destructive" | "outline" => {
  switch (status) {
    case 'approved':
    case 'paid': return 'default';
    case 'processing': return 'secondary';
    case 'pending': return 'outline';
    case 'rejected':
    case 'failed': return 'destructive';
    default: return 'outline';
  }
};

function DashboardPageSkeleton() {
  return (
    <div className="space-y-8">
      <Skeleton className="h-9 w-48" /> {/* Title "Dashboard" */}
      <Card>
        <CardHeader>
          <Skeleton className="h-7 w-3/4 mb-1" />
          <Skeleton className="h-4 w-1/2" />
        </CardHeader>
        <CardContent>
          <Skeleton className="h-4 w-full mb-2" />
          <div className="flex flex-wrap gap-2">
            <Skeleton className="h-10 w-32" />
            <Skeleton className="h-10 w-32" />
          </div>
        </CardContent>
      </Card>
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
      <Card>
        <CardHeader>
          <Skeleton className="h-6 w-1/2 mb-2" />
          <Skeleton className="h-4 w-3/4" />
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, index) => (
            <Skeleton key={`quicklink-skel-${index}`} className="h-12 w-full rounded-md" />
          ))}
        </CardContent>
      </Card>
       <Card>
        <CardHeader>
          <Skeleton className="h-6 w-1/2 mb-2" /> {/* Recent Payouts Title */}
        </CardHeader>
        <CardContent className="space-y-3">
          {Array.from({ length: 3 }).map((_, index) => (
            <Skeleton key={`payout-skel-${index}`} className="h-10 w-full rounded-md" />
          ))}
        </CardContent>
      </Card>
    </div>
  );
}

export default function DashboardPage() {
  const { user, userProfile, loading: authLoading, authError } = useAuth();
  const router = useRouter();
  const [recentPayouts, setRecentPayouts] = React.useState<PayoutRequest[]>([]);
  const [loadingPayouts, setLoadingPayouts] = React.useState(true);

  React.useEffect(() => {
    if (!authLoading && !user) {
      router.push('/login?message=Please login to access your dashboard.');
    }
  }, [user, authLoading, router]);

  React.useEffect(() => {
    let isMounted = true;
    const fetchRecentPayouts = async () => {
      if (!user || !db) {
        if (isMounted) setLoadingPayouts(false);
        return;
      }
      setLoadingPayouts(true);
      try {
        const payoutsQuery = query(
          collection(db, 'payoutRequests'),
          where('userId', '==', user.uid),
          orderBy('requestedAt', 'desc'),
          limit(3)
        );
        const snapshot = await getDocs(payoutsQuery);
        const fetchedPayouts = snapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data(),
          requestedAt: safeToDate(doc.data().requestedAt as Timestamp | undefined) || new Date(0),
          processedAt: safeToDate(doc.data().processedAt as Timestamp | undefined),
        } as PayoutRequest));
        if (isMounted) setRecentPayouts(fetchedPayouts);
      } catch (error) {
        console.error("Error fetching recent payouts:", error);
        // Optionally set an error state for payouts
      } finally {
        if (isMounted) setLoadingPayouts(false);
      }
    };

    if (user) {
      fetchRecentPayouts();
    }
    return () => { isMounted = false; };
  }, [user]);


  if (authLoading || (!user && !authError) || (!userProfile && !authError)) {
    return <ProtectedRoute><DashboardPageSkeleton /></ProtectedRoute>;
  }

  if (authError) {
    return (
      <ProtectedRoute>
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Authentication Error</AlertTitle>
          <AlertDescription>{authError}</AlertDescription>
        </Alert>
      </ProtectedRoute>
    );
  }

  if (!userProfile) {
    // This case might occur if authUser is set but profile fetching failed silently earlier
    return (
      <ProtectedRoute>
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Profile Error</AlertTitle>
          <AlertDescription>Could not load your profile data. Please try logging out and back in, or contact support if the issue persists.</AlertDescription>
           <Button onClick={() => router.push('/login')} className="mt-2">Go to Login</Button>
        </Alert>
      </ProtectedRoute>
    );
  }

  const summaryStats = [
    { title: "Available Balance", value: formatCurrency(userProfile.cashbackBalance), icon: IndianRupee, description: "Cashback ready for payout." },
    { title: "Pending Cashback", value: formatCurrency(userProfile.pendingCashback), icon: History, description: "Cashback awaiting confirmation." },
    { title: "Lifetime Earnings", value: formatCurrency(userProfile.lifetimeCashback), icon: Gift, description: "Total cashback earned." },
    { title: "Referral Bonus", value: formatCurrency(userProfile.referralBonusEarned), icon: User, description: "Bonus from referrals." },
  ];

  const quickLinks = [
    { href: "/dashboard/history", label: "View Cashback History", icon: History },
    { href: "/dashboard/clicks", label: "View Click History", icon: MousePointerClick },
    { href: "/dashboard/payout", label: "Request Payout", icon: Send },
    { href: "/dashboard/payout-history", label: "View Payout History", icon: ReceiptText },
    { href: "/dashboard/referrals", label: "Refer Friends", icon: Gift },
    { href: "/stores", label: "Browse Stores", icon: ShoppingBag },
    { href: "/coupons", label: "Find Coupons", icon: Tag },
    { href: "/dashboard/settings", label: "Account Settings", icon: Settings },
  ];

  return (
    <ProtectedRoute>
      <div className="space-y-8">
        <h1 className="text-3xl font-bold">Dashboard</h1>
        <Card className="shadow-sm border">
          <CardHeader>
            <CardTitle className="text-2xl">Welcome back, {userProfile.displayName || user.email}!</CardTitle>
            <CardDescription>Here's a summary of your MagicSaver account.</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground">
              Start exploring new deals or manage your earnings. Happy saving!
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
                <Button asChild>
                    <Link href="/stores">Find New Offers</Link>
                </Button>
                <Button variant="outline" asChild>
                    <Link href="/how-it-works">How It Works</Link>
                </Button>
            </div>
          </CardContent>
        </Card>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {summaryStats.map((stat) => (
            <Card key={stat.title} className="shadow-sm border">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">{stat.title}</CardTitle>
                <stat.icon className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{stat.value}</div>
                <p className="text-xs text-muted-foreground">{stat.description}</p>
              </CardContent>
            </Card>
          ))}
        </div>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <Card className="shadow-sm border">
                <CardHeader>
                    <CardTitle>Quick Actions</CardTitle>
                    <CardDescription>Navigate to important sections.</CardDescription>
                </CardHeader>
                <CardContent className="grid gap-3 sm:grid-cols-2">
                    {quickLinks.slice(0, 4).map((linkItem) => ( // Show first 4 prominent actions
                        <Button variant="outline" className="justify-start h-auto py-3" asChild key={linkItem.href}>
                            <Link href={linkItem.href} className="flex items-center text-left">
                                <linkItem.icon className="w-5 h-5 mr-3 text-primary" />
                                <span className="font-medium">{linkItem.label}</span>
                                <ArrowRight className="w-4 h-4 ml-auto text-muted-foreground" />
                            </Link>
                        </Button>
                    ))}
                </CardContent>
            </Card>

             <Card className="shadow-sm border">
              <CardHeader>
                <CardTitle className="flex items-center gap-2"><ListChecks className="w-5 h-5 text-primary" /> Recent Payout Requests</CardTitle>
                <CardDescription>A quick look at your latest payout activities.</CardDescription>
              </CardHeader>
              <CardContent>
                {loadingPayouts ? (
                   <div className="space-y-2">
                       <Skeleton className="h-8 w-full" />
                       <Skeleton className="h-8 w-full" />
                       <Skeleton className="h-8 w-full" />
                   </div>
                ) : recentPayouts.length > 0 ? (
                  <ul className="space-y-3">
                    {recentPayouts.map(payout => (
                      <li key={payout.id} className="flex justify-between items-center text-sm p-2 bg-muted/50 rounded-md">
                        <div>
                          <span className="font-medium">{formatCurrency(payout.amount)}</span>
                          <span className="text-xs text-muted-foreground ml-2">
                            ({payout.requestedAt ? format(new Date(payout.requestedAt), 'PP') : 'N/A'})
                          </span>
                        </div>
                        <Badge variant={getStatusVariant(payout.status)} className="capitalize text-xs">{payout.status}</Badge>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-sm text-muted-foreground text-center py-4">No recent payout requests.</p>
                )}
                {recentPayouts.length > 0 && (
                    <Button variant="link" asChild className="mt-3 p-0 h-auto text-sm">
                        <Link href="/dashboard/payout-history">View All Payout History</Link>
                    </Button>
                )}
              </CardContent>
            </Card>
        </div>
      </div>
    </ProtectedRoute>
  );
}
