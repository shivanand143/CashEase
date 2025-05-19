
"use client";

import * as React from 'react';
import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { collection, query, getCountFromServer, where, Timestamp } from 'firebase/firestore';
import { db, firebaseInitializationError } from '@/lib/firebase/config';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { formatCurrency } from '@/lib/utils';
import {
  Users, Store as StoreIcon, BadgePercent, Building2, TicketPercent, ClipboardList,
  MousePointerClick, CreditCard, BarChart3, Package, AlertCircle, PlusCircle, Search, Send
} from 'lucide-react';
import AdminGuard from '@/components/guards/admin-guard';

interface StatCardProps {
  title: string;
  value: string | number;
  icon: React.ElementType;
  link?: string;
  linkText?: string;
  isLoading?: boolean;
}

const StatCard: React.FC<StatCardProps> = ({ title, value, icon: Icon, link, linkText, isLoading }) => (
  <Card className="shadow-sm hover:shadow-md transition-shadow">
    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
      <CardTitle className="text-sm font-medium">{title}</CardTitle>
      <Icon className="h-4 w-4 text-muted-foreground" />
    </CardHeader>
    <CardContent>
      {isLoading ? (
        <>
          <Skeleton className="h-8 w-16 mb-1" />
          {linkText && <Skeleton className="h-3 w-24" />}
        </>
      ) : (
        <>
          <div className="text-2xl font-bold">{value}</div>
          {link && linkText && (
            <Link href={link} className="text-xs text-muted-foreground hover:text-primary">
              {linkText}
            </Link>
          )}
        </>
      )}
    </CardContent>
  </Card>
);

function AdminOverviewPageSkeleton() {
  return (
    <div className="space-y-8">
      <Skeleton className="h-9 w-1/3" /> {/* Title "Admin Overview" */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {Array.from({ length: 10 }).map((_, index) => ( // Assuming 10 stat cards
          <Card key={`stat-skel-${index}`}>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <Skeleton className="h-4 w-20" />
              <Skeleton className="h-5 w-5 rounded-full" />
            </CardHeader>
            <CardContent>
              <Skeleton className="h-8 w-16 mb-1" />
              <Skeleton className="h-3 w-24" />
            </CardContent>
          </Card>
        ))}
      </div>
      <Card>
        <CardHeader>
          <Skeleton className="h-6 w-1/2 mb-2" />
          <Skeleton className="h-4 w-3/4" />
        </CardHeader>
        <CardContent className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, index) => (
            <Skeleton key={`qlink-skel-${index}`} className="h-12 w-full rounded-md" />
          ))}
        </CardContent>
      </Card>
    </div>
  );
}

export default function AdminOverviewPage() {
  const router = useRouter();
  const [stats, setStats] = useState<Record<string, number | string>>({});
  const [loadingStats, setLoadingStats] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchCollectionCount = useCallback(async (collectionName: string, queryConstraints: any[] = []) => {
    if (!db) {
      console.error(`Admin Overview: DB not available for ${collectionName}`);
      throw new Error("Firestore not initialized");
    }
    const collRef = collection(db, collectionName);
    const q = query(collRef, ...queryConstraints);
    const snapshot = await getCountFromServer(q);
    return snapshot.data().count;
  }, []);


  useEffect(() => {
    let isMounted = true;
    const fetchAllStats = async () => {
      if (!isMounted) return;
      setLoadingStats(true);
      setError(null);
      if (firebaseInitializationError || !db) {
        if (isMounted) setError(firebaseInitializationError || "Database connection not available.");
        setLoadingStats(false);
        return;
      }

      try {
        console.log("Admin Overview: Fetching stats...");
        const [
          userCount, activeStoreCount, activeProductCount, activeCouponCount, activeCategoryCount, activeBannerCount,
          transactionCount, clickCount, pendingPayoutCount, // totalPayoutAmount can be complex, omitting for now or fetching differently
        ] = await Promise.all([
          fetchCollectionCount('users'),
          fetchCollectionCount('stores', [where('isActive', '==', true)]),
          fetchCollectionCount('products', [where('isActive', '==', true)]),
          fetchCollectionCount('coupons', [where('isActive', '==', true)]),
          fetchCollectionCount('categories', [where('isActive', '==', true)]),
          fetchCollectionCount('banners', [where('isActive', '==', true)]),
          fetchCollectionCount('transactions'),
          fetchCollectionCount('clicks'),
          fetchCollectionCount('payoutRequests', [where('status', '==', 'pending')]),
        ]);

        if (isMounted) {
          setStats({
            userCount, activeStoreCount, activeProductCount, activeCouponCount, activeCategoryCount, activeBannerCount,
            transactionCount, clickCount, pendingPayoutCount,
            // totalPayoutAmount: formatCurrency(totalPayoutAmount) // Add if implemented
          });
          console.log("Admin Overview: Stats fetched:", { userCount, activeStoreCount });
        }
      } catch (err) {
        console.error("Error fetching admin stats:", err);
        if (isMounted) setError(err instanceof Error ? err.message : "Failed to load overview data.");
      } finally {
        if (isMounted) setLoadingStats(false);
      }
    };

    fetchAllStats();
    return () => { isMounted = false; };
  }, [fetchCollectionCount]);

  const quickLinks = [
    { href: '/admin/stores/new', label: 'Add New Store', icon: StoreIcon },
    { href: '/admin/products/new', label: 'Add New Product', icon: Package },
    { href: '/admin/coupons/new', label: 'Add New Coupon', icon: BadgePercent },
    { href: '/admin/users', label: 'Search Users', icon: Search },
    { href: '/admin/transactions', label: 'Manage Transactions', icon: ClipboardList },
    { href: '/admin/payouts', label: 'Review Pending Payouts', icon: Send },
  ];

  if (loadingStats && Object.keys(stats).length === 0 && !error) {
    return <AdminGuard><AdminOverviewPageSkeleton /></AdminGuard>;
  }

  return (
    <AdminGuard>
      <div className="space-y-8">
        <h1 className="text-3xl font-bold">Admin Overview</h1>

        {error && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>Error Loading Data</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          <StatCard title="Total Users" value={stats.userCount ?? '...'} icon={Users} link="/admin/users" linkText="View all users" isLoading={loadingStats && stats.userCount === undefined} />
          <StatCard title="Active Stores" value={stats.activeStoreCount ?? '...'} icon={StoreIcon} link="/admin/stores" linkText="Manage stores" isLoading={loadingStats && stats.activeStoreCount === undefined} />
          <StatCard title="Active Products" value={stats.activeProductCount ?? '...'} icon={Package} link="/admin/products" linkText="Manage products" isLoading={loadingStats && stats.activeProductCount === undefined} />
          <StatCard title="Active Coupons" value={stats.activeCouponCount ?? '...'} icon={BadgePercent} link="/admin/coupons" linkText="Manage coupons" isLoading={loadingStats && stats.activeCouponCount === undefined} />
          <StatCard title="Active Categories" value={stats.activeCategoryCount ?? '...'} icon={Building2} link="/admin/categories" linkText="Manage categories" isLoading={loadingStats && stats.activeCategoryCount === undefined} />
          <StatCard title="Active Banners" value={stats.activeBannerCount ?? '...'} icon={TicketPercent} link="/admin/banners" linkText="Manage banners" isLoading={loadingStats && stats.activeBannerCount === undefined} />
          <StatCard title="Total Transactions" value={stats.transactionCount ?? '...'} icon={ClipboardList} link="/admin/transactions" linkText="View transactions" isLoading={loadingStats && stats.transactionCount === undefined} />
          <StatCard title="Total Clicks" value={stats.clickCount ?? '...'} icon={MousePointerClick} link="/admin/clicks" linkText="View clicks" isLoading={loadingStats && stats.clickCount === undefined} />
          <StatCard title="Pending Payouts" value={stats.pendingPayoutCount ?? '...'} icon={CreditCard} link="/admin/payouts" linkText="Process payouts" isLoading={loadingStats && stats.pendingPayoutCount === undefined} />
          {/* <StatCard title="Total Paid Out" value={stats.totalPayoutAmount ?? '₹...'} icon={CreditCard} link="/admin/payouts?status=paid" linkText="View paid" isLoading={loadingStats && stats.totalPayoutAmount === undefined} /> */}
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Quick Actions</CardTitle>
            <CardDescription>Common administrative tasks.</CardDescription>
          </CardHeader>
          <CardContent className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {quickLinks.map(linkItem => ( // Renamed link to linkItem
              <Button variant="outline" asChild key={linkItem.href}>
                <Link href={linkItem.href} className="flex items-center justify-start gap-2 text-left h-auto py-3">
                  <linkItem.icon className="w-4 h-4 text-primary" />
                  {linkItem.label}
                </Link>
              </Button>
            ))}
          </CardContent>
        </Card>
      </div>
    </AdminGuard>
  );
}
    
