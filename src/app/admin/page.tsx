
"use client";

import * as React from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Users, Store as StoreIconLucide, Tag, CreditCard, ArrowRight, Activity, AlertCircle, BadgePercent, Building2, TicketPercent, BarChart3, Package } from 'lucide-react'; // Renamed Store import
import Link from 'next/link';
import AdminGuard from '@/components/guards/admin-guard';
import { collection, getDocs, query, where, limit, getCountFromServer } from 'firebase/firestore';
import { db } from '@/lib/firebase/config';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertTitle, AlertDescription } from '@/components/ui/alert';
import { formatCurrency } from '@/lib/utils';

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
            <div className="text-2xl font-bold">{typeof value === 'number' && title !== "Total Users" && title !== "Pending Payouts" && title !== "Total Products" ? formatCurrency(value) : value}</div>
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
    categories: { value: 0, isLoading: true, error: null as string | null },
    banners: { value: 0, isLoading: true, error: null as string | null },
    products: { value: 0, isLoading: true, error: null as string | null }, // New product stat
    transactions: { value: 0, isLoading: true, error: null as string | null },
    pendingPayouts: { value: 0, isLoading: true, error: null as string | null },
  });
  const [overallError, setOverallError] = React.useState<string | null>(null);


  React.useEffect(() => {
    let isMounted = true;
    const fetchAllStats = async () => {
      if (!isMounted) return;

      const updateStatState = (key: keyof typeof stats, loading: boolean, errorMsg: string | null = null, valueIfError = 0) => {
        if (isMounted) {
          setStats(prev => ({
            ...prev,
            [key]: { ...prev[key], isLoading: loading, error: errorMsg, value: errorMsg ? valueIfError : prev[key].value }
          }));
        }
      };
      
      if (!db) {
        if (isMounted) {
          console.error("Firestore not initialized for fetching admin stats");
          const dbErrorMsg = "Database Error";
          setOverallError(dbErrorMsg);
          (Object.keys(stats) as Array<keyof typeof stats>).forEach(key => {
            updateStatState(key, false, dbErrorMsg);
          });
        }
        return;
      }

      const fetchCollectionCount = async (collectionName: string, statKey: keyof typeof stats) => {
        if (!isMounted) return { count: 0, error: "Component unmounted" };
        updateStatState(statKey, true);
        try {
          const snapshot = await getCountFromServer(collection(db, collectionName));
          const count = snapshot.data().count;
          if (isMounted) setStats(prev => ({ ...prev, [statKey]: { value: count, isLoading: false, error: null } }));
          return { count, error: null };
        } catch (error: any) {
          console.error(`Error fetching ${collectionName} count:`, error);
          const errorMsg = error.message || `Failed to load ${collectionName}`;
          if (isMounted) updateStatState(statKey, false, errorMsg);
          return { count: 0, error: errorMsg };
        }
      };

      const fetchPendingPayoutsCount = async () => {
        if (!isMounted) return { count: 0, error: "Component unmounted" };
        updateStatState('pendingPayouts', true);
        try {
           const q = query(collection(db, 'payoutRequests'), where('status', '==', 'pending'));
           const snapshot = await getCountFromServer(q);
           const count = snapshot.data().count;
           if (isMounted) setStats(prev => ({ ...prev, pendingPayouts: { value: count, isLoading: false, error: null } }));
           return { count, error: null };
        } catch (error: any) {
            console.error('Error fetching pending payouts count:', error);
            const errorMsg = error.message || 'Failed to load pending payouts';
            if (isMounted) updateStatState('pendingPayouts', false, errorMsg);
            return { count: 0, error: errorMsg };
        }
      };

      await Promise.allSettled([
        fetchCollectionCount('users', 'users'),
        fetchCollectionCount('stores', 'stores'),
        fetchCollectionCount('coupons', 'coupons'),
        fetchCollectionCount('categories', 'categories'),
        fetchCollectionCount('banners', 'banners'),
        fetchCollectionCount('products', 'products'), // Fetch product count
        fetchCollectionCount('transactions', 'transactions'),
        fetchPendingPayoutsCount(),
      ]);

      if (isMounted) {
        setStats(prev => {
          const updatedStats = { ...prev };
          for (const key in updatedStats) {
            if (updatedStats[key as keyof typeof stats].isLoading) {
              updatedStats[key as keyof typeof stats].isLoading = false;
              if (!updatedStats[key as keyof typeof stats].error && !db) {
                 updatedStats[key as keyof typeof stats].error = "DB Error (Final Check)";
              }
            }
          }
          return updatedStats;
        });
      }
    };

    fetchAllStats();
    return () => { isMounted = false; };
  }, []);

  const statCards = [
    { title: "Total Users", value: stats.users.value, icon: Users, link: "/admin/users", linkText: "Manage Users", isLoading: stats.users.isLoading, error: stats.users.error },
    { title: "Total Stores", value: stats.stores.value, icon: StoreIconLucide, link: "/admin/stores", linkText: "Manage Stores", isLoading: stats.stores.isLoading, error: stats.stores.error },
    { title: "Total Products", value: stats.products.value, icon: Package, link: "/admin/products", linkText: "Manage Products", isLoading: stats.products.isLoading, error: stats.products.error }, // New Product Card
    { title: "Total Coupons", value: stats.coupons.value, icon: BadgePercent, link: "/admin/coupons", linkText: "Manage Coupons", isLoading: stats.coupons.isLoading, error: stats.coupons.error },
    { title: "Total Categories", value: stats.categories.value, icon: Building2, link: "/admin/categories", linkText: "Manage Categories", isLoading: stats.categories.isLoading, error: stats.categories.error },
    { title: "Total Banners", value: stats.banners.value, icon: TicketPercent, link: "/admin/banners", linkText: "Manage Banners", isLoading: stats.banners.isLoading, error: stats.banners.error },
    { title: "Total Transactions", value: stats.transactions.value, icon: Activity, link: "/admin/transactions", linkText: "View Transactions", isLoading: stats.transactions.isLoading, error: stats.transactions.error },
    { title: "Pending Payouts", value: stats.pendingPayouts.value, icon: CreditCard, link: "/admin/payouts?status=pending", linkText: "View Payouts", isLoading: stats.pendingPayouts.isLoading, error: stats.pendingPayouts.error },
  ];

  return (
    <div className="space-y-8">
      <h1 className="text-3xl font-bold">Admin Overview</h1>

       {overallError && (
            <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertTitle>Overall Data Loading Error</AlertTitle>
                <AlertDescription>
                    {overallError} Some statistics might not be loaded.
                </AlertDescription>
            </Alert>
       )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {statCards.map((stat) => (
          <StatCard key={stat.title} {...stat} />
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Activity className="w-5 h-5"/> Quick Actions</CardTitle>
          <CardDescription>Common administrative tasks.</CardDescription>
        </CardHeader>
        <CardContent className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
           <Button asChild variant="outline">
             <Link href="/admin/stores/new"> <StoreIconLucide className="mr-2 h-4 w-4"/>Add New Store</Link>
           </Button>
            <Button asChild variant="outline">
             <Link href="/admin/products/new"> <Package className="mr-2 h-4 w-4"/>Add New Product</Link>
           </Button>
           <Button asChild variant="outline">
             <Link href="/admin/coupons/new"><BadgePercent className="mr-2 h-4 w-4"/>Add New Coupon/Offer</Link>
           </Button>
            <Button asChild variant="outline">
             <Link href="/admin/categories"><Building2 className="mr-2 h-4 w-4"/>Manage Categories</Link>
           </Button>
           <Button asChild variant="outline">
             <Link href="/admin/banners"><TicketPercent className="mr-2 h-4 w-4"/>Manage Banners</Link>
           </Button>
           <Button asChild variant="outline">
             <Link href="/admin/users"><Users className="mr-2 h-4 w-4"/>Search Users</Link>
           </Button>
           <Button asChild variant="outline">
             <Link href="/admin/payouts?status=pending"><CreditCard className="mr-2 h-4 w-4"/>Review Pending Payouts</Link>
           </Button>
        </CardContent>
      </Card>
    </div>
  );
}

export default function AdminOverviewPage() {
  return (
    <AdminGuard>
      <AdminOverviewPageContent />
    </AdminGuard>
  );
}
