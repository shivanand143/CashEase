
"use client";

import * as React from 'react';
import Link from 'next/link';
import { useAuth } from '@/hooks/use-auth';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { formatCurrency } from '@/lib/utils';
import { IndianRupee, History, Send, Gift, Settings, ShoppingBag, Tag, User, AlertCircle, ArrowRight } from 'lucide-react';
import ProtectedRoute from '@/components/guards/protected-route';

// This is the skeleton that was previously in page.tsx, moved here for self-containment if needed
// or page.tsx can continue to provide its own skeleton for the Suspense fallback.
// For this fix, we assume page.tsx's skeleton is sufficient.

export default function DashboardClientContent() {
  const { user, userProfile, loading: authLoading, authError } = useAuth();

  if (authLoading) {
    // The main page.tsx handles the Suspense fallback, so this can be minimal or null
    // Or, if page.tsx's fallback is too generic, return a more specific skeleton here.
    // For now, relying on parent's Suspense fallback.
    return null;
  }

  if (authError) {
    return (
      <Alert variant="destructive">
        <AlertCircle className="h-4 w-4" />
        <AlertTitle>Authentication Error</AlertTitle>
        <AlertDescription>{authError}</AlertDescription>
      </Alert>
    );
  }

  if (!user || !userProfile) {
    // This case should ideally be handled by ProtectedRoute redirecting,
    // but as a fallback:
    return (
      <Alert>
        <AlertCircle className="h-4 w-4" />
        <AlertTitle>Not Authenticated</AlertTitle>
        <AlertDescription>
          Please <Link href="/login" className="underline">login</Link> to view your dashboard.
        </AlertDescription>
      </Alert>
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
    { href: "/dashboard/payout", label: "Request Payout", icon: Send },
    { href: "/dashboard/referrals", label: "Refer Friends", icon: Gift },
    { href: "/stores", label: "Browse Stores", icon: ShoppingBag },
    { href: "/coupons", label: "Find Coupons", icon: Tag },
    { href: "/dashboard/settings", label: "Account Settings", icon: Settings },
  ];

  return (
    <ProtectedRoute>
      <div className="space-y-8">
        <h1 className="text-3xl font-bold">Dashboard</h1>

        {/* Welcome Message */}
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

        {/* Summary Stats */}
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

        {/* Quick Links */}
        <Card className="shadow-sm border">
            <CardHeader>
                <CardTitle>Quick Actions</CardTitle>
                <CardDescription>Navigate to important sections of your dashboard.</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-3 sm:grid-cols-2">
                {quickLinks.map((link) => (
                    <Button variant="outline" className="justify-start h-auto py-3" asChild key={link.href}>
                        <Link href={link.href} className="flex items-center text-left">
                            <link.icon className="w-5 h-5 mr-3 text-primary" />
                            <div>
                                <span className="font-medium">{link.label}</span>
                                {/* Optional: Add a small description under each quick link if needed */}
                            </div>
                            <ArrowRight className="w-4 h-4 ml-auto text-muted-foreground" />
                        </Link>
                    </Button>
                ))}
            </CardContent>
        </Card>
      </div>
    </ProtectedRoute>
  );
}
