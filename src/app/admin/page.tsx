
"use client";

import * as React from 'react';
import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { collection, query, orderBy, limit, getDocs,getCountFromServer, where, Timestamp } from 'firebase/firestore';
import { db, firebaseInitializationError } from '@/lib/firebase/config';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { formatCurrency, safeToDate } from '@/lib/utils';
import type { Store, Coupon, Category, Banner, UserProfile, Product, Click, Transaction, PayoutRequest } from '@/lib/types';
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

export default function AdminOverviewPage() {
  const router = useRouter();
  const [stats, setStats] = useState<Record<string, number | string>>({});
  const [loadingStats, setLoadingStats] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchCollectionCount = useCallback(async (collectionName: string, queryConstraints: any[] = []) => {
    if (!db) throw new Error("Firestore not initialized");
    const collRef = collection(db, collectionName);
    const q = query(collRef, ...queryConstraints);
    const snapshot = await getCountFromServer(q);
    return snapshot.data().count;
  }, []);


  useEffect(() => {
    let isMounted = true;
    const fetchAllStats = async () => {
      setLoadingStats(true);
      setError(null);
      if (firebaseInitializationError || !db) {
        if (isMounted) setError(firebaseInitializationError || "Database connection not available.");
        setLoadingStats(false);
        return;
      }

      try {
        const [
          userCount, storeCount, productCount, couponCount, categoryCount, bannerCount,
          transactionCount, clickCount, pendingPayoutCount, totalPayoutAmount
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
          getDocs(query(collection(db, 'payoutRequests'), where('status', '==', 'paid'))).then(snap =>
            snap.docs.reduce((sum, doc) => sum + (doc.data().amount || 0), 0)
          )
        ]);

        if (isMounted) {
          setStats({
            userCount, storeCount, productCount, couponCount, categoryCount, bannerCount,
            transactionCount, clickCount, pendingPayoutCount,
            totalPayoutAmount: formatCurrency(totalPayoutAmount)
          });
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

  return (
    <AdminGuard>
      <div className="space-y-8">
        <h1 className="text-3xl font-bold">Admin Overview</h1>

        {error && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>Error</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          <StatCard title="Total Users" value={stats.userCount ?? 0} icon={Users} link="/admin/users" linkText="View all users" isLoading={loadingStats} />
          <StatCard title="Active Stores" value={stats.storeCount ?? 0} icon={StoreIcon} link="/admin/stores" linkText="Manage stores" isLoading={loadingStats} />
          <StatCard title="Active Products" value={stats.productCount ?? 0} icon={Package} link="/admin/products" linkText="Manage products" isLoading={loadingStats} />
          <StatCard title="Active Coupons" value={stats.couponCount ?? 0} icon={BadgePercent} link="/admin/coupons" linkText="Manage coupons" isLoading={loadingStats} />
          <StatCard title="Active Categories" value={stats.categoryCount ?? 0} icon={Building2} link="/admin/categories" linkText="Manage categories" isLoading={loadingStats} />
          <StatCard title="Active Banners" value={stats.bannerCount ?? 0} icon={TicketPercent} link="/admin/banners" linkText="Manage banners" isLoading={loadingStats} />
          <StatCard title="Total Transactions" value={stats.transactionCount ?? 0} icon={ClipboardList} link="/admin/transactions" linkText="View transactions" isLoading={loadingStats} />
          <StatCard title="Total Clicks" value={stats.clickCount ?? 0} icon={MousePointerClick} link="/admin/clicks" linkText="View clicks" isLoading={loadingStats} />
          <StatCard title="Pending Payouts" value={stats.pendingPayoutCount ?? 0} icon={CreditCard} link="/admin/payouts" linkText="Process payouts" isLoading={loadingStats} />
          <StatCard title="Total Paid Out" value={stats.totalPayoutAmount ?? '₹0.00'} icon={CreditCard} link="/admin/payouts?status=paid" linkText="View paid" isLoading={loadingStats} />
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Quick Actions</CardTitle>
            <CardDescription>Common administrative tasks.</CardDescription>
          </CardHeader>
          <CardContent className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {quickLinks.map(link => (
              <Button variant="outline" asChild key={link.href}>
                <Link href={link.href} className="flex items-center justify-start gap-2 text-left h-auto py-3">
                  <link.icon className="w-4 h-4 text-primary" />
                  {link.label}
                </Link>
              </Button>
            ))}
          </CardContent>
        </Card>
      </div>
    </AdminGuard>
  );
}

