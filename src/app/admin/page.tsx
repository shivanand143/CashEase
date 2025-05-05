
"use client";

import * as React from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Users, Store, Tag, CreditCard, ArrowRight, Activity, AlertCircle, BadgePercent, Building2 } from 'lucide-react';
import Link from 'next/link';
import AdminGuard from '@/components/guards/admin-guard'; // Import AdminGuard
import { collection, getDocs, query, where, limit, getCountFromServer } from 'firebase/firestore';
import { db } from '@/lib/firebase/config';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertTitle, AlertDescription } from '@/components/ui/alert';
import { formatCurrency } from '@/lib/utils'; // Assuming you have a currency formatting utility

interface StatCardProps {
  title: string;
  value: string | number;
  icon: React.ElementType;
  link: string;
  linkText: string;
  isLoading: boolean;
  error?: string | null;
}

function StatCard({ title, value, icon: Icon, link, linkText, isLoading, error }: StatCardProps) {
  return (
    <Card className="shadow-sm hover:shadow-md transition-shadow">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium">{title}</CardTitle>
        <Icon className="h-5 w-5 text-muted-foreground" />
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <>
            <Skeleton className="h-8 w-24 mb-2" />
            <Skeleton className="h-4 w-32" />
          </>
        ) : error ? (
             <div className="text-sm text-destructive flex items-center gap-1">
                <AlertCircle className="h-4 w-4"/> Error loading
             </div>
        ): (
          <>
            <div className="text-2xl font-bold">{typeof value === 'number' ? formatCurrency(value) : value}</div>
            <Button variant="link" size="sm" asChild className="p-0 h-auto text-xs text-muted-foreground mt-1">
              <Link href={link} className="flex items-center gap-1">
                {linkText} <ArrowRight className="h-3 w-3" />
              </Link>
            </Button>
          </>
        )}
      </CardContent>
    </Card>
  );
}

function AdminOverviewPageContent() {
  const [stats, setStats] = React.useState({
    users: { value: 0, isLoading: true, error: null as string | null },
    stores: { value: 0, isLoading: true, error: null as string | null },
    coupons: { value: 0, isLoading: true, error: null as string | null },
    pendingPayouts: { value: 0, isLoading: true, error: null as string | null },
  });

  React.useEffect(() => {
    const fetchStats = async () => {
       if (!db) {
           console.error("Firestore not initialized");
           // Update all stats with error
            setStats(prev => ({
                users: { ...prev.users, isLoading: false, error: "DB Error" },
                stores: { ...prev.stores, isLoading: false, error: "DB Error" },
                coupons: { ...prev.coupons, isLoading: false, error: "DB Error" },
                pendingPayouts: { ...prev.pendingPayouts, isLoading: false, error: "DB Error" },
            }));
           return;
       }

      const fetchCollectionCount = async (collectionName: string) => {
        try {
          // Use getCountFromServer for better performance on large collections
          const snapshot = await getCountFromServer(collection(db, collectionName));
          return snapshot.data().count;
        } catch (error: any) {
          console.error(`Error fetching ${collectionName} count:`, error);
          return { error: error.message || `Failed to load ${collectionName}` };
        }
      };

      const fetchPendingPayoutsCount = async () => {
        try {
           const q = query(collection(db, 'payoutRequests'), where('status', '==', 'pending'));
           const snapshot = await getCountFromServer(q); // Use countFromServer
           return snapshot.data().count;
        } catch (error: any) {
            console.error('Error fetching pending payouts count:', error);
            return { error: error.message || 'Failed to load pending payouts' };
        }
      };

      const [usersResult, storesResult, couponsResult, pendingPayoutsResult] = await Promise.all([
        fetchCollectionCount('users'),
        fetchCollectionCount('stores'),
        fetchCollectionCount('coupons'),
        fetchPendingPayoutsCount(),
      ]);

      setStats({
        users: { value: typeof usersResult === 'number' ? usersResult : 0, isLoading: false, error: typeof usersResult !== 'number' ? usersResult.error : null },
        stores: { value: typeof storesResult === 'number' ? storesResult : 0, isLoading: false, error: typeof storesResult !== 'number' ? storesResult.error : null },
        coupons: { value: typeof couponsResult === 'number' ? couponsResult : 0, isLoading: false, error: typeof couponsResult !== 'number' ? couponsResult.error : null },
        pendingPayouts: { value: typeof pendingPayoutsResult === 'number' ? pendingPayoutsResult : 0, isLoading: false, error: typeof pendingPayoutsResult !== 'number' ? pendingPayoutsResult.error : null },
      });
    };

    fetchStats();
  }, []);

  const statCards = [
    { title: "Total Users", value: stats.users.value, icon: Users, link: "/admin/users", linkText: "Manage Users", isLoading: stats.users.isLoading, error: stats.users.error },
    { title: "Total Stores", value: stats.stores.value, icon: Store, link: "/admin/stores", linkText: "Manage Stores", isLoading: stats.stores.isLoading, error: stats.stores.error },
    { title: "Total Coupons", value: stats.coupons.value, icon: BadgePercent, link: "/admin/coupons", linkText: "Manage Coupons", isLoading: stats.coupons.isLoading, error: stats.coupons.error },
    { title: "Pending Payouts", value: stats.pendingPayouts.value, icon: CreditCard, link: "/admin/payouts?status=pending", linkText: "View Payouts", isLoading: stats.pendingPayouts.isLoading, error: stats.pendingPayouts.error },
  ];

  return (
    <div className="space-y-8">
      <h1 className="text-3xl font-bold">Admin Overview</h1>

       {/* Overall Error Alert */}
       {(stats.users.error || stats.stores.error || stats.coupons.error || stats.pendingPayouts.error) && (
            <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertTitle>Data Loading Error</AlertTitle>
                <AlertDescription>
                    There was an issue loading some summary statistics. Please check the console or try again later.
                </AlertDescription>
            </Alert>
       )}

      {/* Stats Grid */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {statCards.map((stat) => (
          <StatCard key={stat.title} {...stat} />
        ))}
      </div>

      {/* Quick Actions Card */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Activity className="w-5 h-5"/> Quick Actions</CardTitle>
          <CardDescription>Common administrative tasks.</CardDescription>
        </CardHeader>
        <CardContent className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
           {/* Updated Links */}
           <Button asChild variant="outline">
             <Link href="/admin/stores/new"> <Store className="mr-2 h-4 w-4"/>Add New Store</Link>
           </Button>
           <Button asChild variant="outline">
             <Link href="/admin/coupons/new"><BadgePercent className="mr-2 h-4 w-4"/>Add New Coupon/Offer</Link>
           </Button>
           <Button asChild variant="outline">
             <Link href="/admin/banners"><Building2 className="mr-2 h-4 w-4"/>Manage Banners</Link>
           </Button>
           <Button asChild variant="outline">
             <Link href="/admin/users"><Users className="mr-2 h-4 w-4"/>Search Users</Link>
           </Button>
           <Button asChild variant="outline">
             <Link href="/admin/payouts?status=pending"><CreditCard className="mr-2 h-4 w-4"/>Review Pending Payouts</Link>
           </Button>
           <Button asChild variant="outline">
             <Link href="/admin/categories"><Building2 className="mr-2 h-4 w-4"/>Manage Categories</Link>
           </Button>
        </CardContent>
      </Card>

       {/* Placeholder for system status or logs (can be added later) */}
       {/* <Card>...</Card> */}

    </div>
  );
}

export default function AdminOverviewPage() {
  // Wrap the page content with AdminGuard
  return (
    <AdminGuard>
      <AdminOverviewPageContent />
    </AdminGuard>
  );
}

