// src/app/dashboard/page.tsx
"use client";

import * as React from 'react';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/use-auth';
import { collection, query, where, orderBy, limit, getDocs } from 'firebase/firestore';
import { db } from '@/lib/firebase/config';
import type { Transaction } from '@/lib/types';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from '@/components/ui/card'; // Added CardFooter
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { format } from 'date-fns';
import Link from 'next/link';
import { IndianRupee, AlertCircle, History, Send, Settings } from 'lucide-react'; // Changed DollarSign to IndianRupee
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';

// Minimum payout threshold in INR
const MIN_PAYOUT_THRESHOLD = 2000; // Example: ₹2000

export default function DashboardPage() {
  const { user, userProfile, loading: authLoading, signOut } = useAuth();
  const router = useRouter();
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loadingTransactions, setLoadingTransactions] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!authLoading && !user) {
      router.push('/login?message=Please login to view your dashboard');
    }
  }, [user, authLoading, router]);

  useEffect(() => {
    // Fetch transactions only if user exists and db is available
    if (user && db) {
      const fetchTransactions = async () => {
        setLoadingTransactions(true);
        setError(null);
        try {
          const transactionsCollection = collection(db, 'transactions');
          const q = query(
            transactionsCollection,
            where('userId', '==', user.uid),
            orderBy('transactionDate', 'desc'),
            limit(10) // Fetch latest 10 transactions for the overview
          );
          const querySnapshot = await getDocs(q);
          const transactionsData = querySnapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data(),
            // Ensure date fields are converted
            transactionDate: doc.data().transactionDate?.toDate ? doc.data().transactionDate.toDate() : new Date(),
             confirmationDate: doc.data().confirmationDate?.toDate ? doc.data().confirmationDate.toDate() : null,
             createdAt: doc.data().createdAt?.toDate ? doc.data().createdAt.toDate() : new Date(),
             updatedAt: doc.data().updatedAt?.toDate ? doc.data().updatedAt.toDate() : new Date(),
          })) as Transaction[];
          setTransactions(transactionsData);
        } catch (err) {
          console.error("Error fetching transactions:", err);
          setError("Failed to load recent activity. Please try again later.");
        } finally {
          setLoadingTransactions(false);
        }
      };
      fetchTransactions();
    } else {
      // If user is not logged in (or logs out) or db is unavailable, clear transactions and stop loading
      setTransactions([]);
      setLoadingTransactions(false);
      if (!db) {
          setError("Database connection not available.");
      }
    }
  }, [user]); // Dependency on user only

  const getStatusBadgeVariant = (status: Transaction['status']): "default" | "secondary" | "outline" | "destructive" => {
    switch (status) {
      case 'confirmed': return 'default'; // Using primary color
      case 'paid': return 'secondary'; // Using secondary color
      case 'pending': return 'outline'; // Neutral outline
      case 'rejected': return 'destructive'; // Red
      default: return 'outline';
    }
  };

  // Determine payout eligibility only if userProfile is loaded
  const canRequestPayout = userProfile ? userProfile.cashbackBalance >= MIN_PAYOUT_THRESHOLD : false;
  const availableBalance = userProfile?.cashbackBalance ?? 0;
  const pendingBalance = userProfile?.pendingCashback ?? 0;
  const lifetimeBalance = userProfile?.lifetimeCashback ?? 0;
  const balanceDifference = userProfile ? (MIN_PAYOUT_THRESHOLD - userProfile.cashbackBalance) : MIN_PAYOUT_THRESHOLD;


  if (authLoading) {
    return <DashboardSkeleton />; // Show skeleton while auth or profile is loading
  }

  if (!user) {
     // This case should ideally be handled by the redirect, but added as a fallback
     // Render minimal state or redirect indicator
     return <p>Redirecting to login...</p>;
  }


  return (
    <div className="space-y-8">
      <h1 className="text-3xl font-bold">Welcome, {userProfile?.displayName ?? user.email}!</h1>

      {/* Summary Cards */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Available Cashback</CardTitle>
            <IndianRupee className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
             {/* Show skeleton if userProfile isn't loaded yet */}
             {!userProfile ? <Skeleton className="h-8 w-1/3 mb-1" /> : <div className="text-2xl font-bold">₹{availableBalance.toFixed(2)}</div>}
            <p className="text-xs text-muted-foreground">Ready for payout</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Pending Cashback</CardTitle>
            <History className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
             {!userProfile ? <Skeleton className="h-8 w-1/3 mb-1" /> : <div className="text-2xl font-bold">₹{pendingBalance.toFixed(2)}</div>}
            <p className="text-xs text-muted-foreground">Waiting for confirmation</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Lifetime Earned</CardTitle>
            <IndianRupee className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {!userProfile ? <Skeleton className="h-8 w-1/3 mb-1" /> : <div className="text-2xl font-bold">₹{lifetimeBalance.toFixed(2)}</div>}
            <p className="text-xs text-muted-foreground">Total cashback earned</p>
          </CardContent>
        </Card>
      </div>

      {/* Payout Section */}
       <Card>
         <CardHeader>
           <CardTitle>Request Payout</CardTitle>
           <CardDescription>
              You can request a payout once your available balance reaches ₹{MIN_PAYOUT_THRESHOLD}.
           </CardDescription>
         </CardHeader>
         <CardContent>
            {!userProfile ? (
                <Skeleton className="h-4 w-1/2 mb-4" />
            ) : (
                 <p className="mb-4">Your current available balance is <span className="font-bold">₹{availableBalance.toFixed(2)}</span>.</p>
             )}
           <Button asChild disabled={!canRequestPayout || !userProfile}>
              <Link href="/dashboard/payout">
                  <Send className="mr-2 h-4 w-4" /> Request Payout
              </Link>
           </Button>
            {userProfile && !canRequestPayout && (
              <p className="text-sm text-muted-foreground mt-2">
                 You need ₹{ balanceDifference.toFixed(2) } more to request a payout.
              </p>
            )}
             {!userProfile && <Skeleton className="h-4 w-1/3 mt-2" />} {/* Skeleton for the needed amount text */}
         </CardContent>
          <CardFooter className="text-xs text-muted-foreground">
             Payouts are typically processed within 5-7 business days. Ensure your <Link href="/dashboard/settings" className="underline hover:text-primary">payment details</Link> are up-to-date.
          </CardFooter>
       </Card>


      {/* Recent Activity */}
      <Card>
        <CardHeader>
          <CardTitle>Recent Activity</CardTitle>
          <CardDescription>Your latest cashback transactions.</CardDescription>
        </CardHeader>
        <CardContent>
          {error && (
            <Alert variant="destructive" className="mb-4">
              <AlertCircle className="h-4 w-4" />
              <AlertTitle>Error</AlertTitle>
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
          {loadingTransactions ? (
            <RecentActivitySkeleton />
          ) : transactions.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Store</TableHead>
                  <TableHead className="text-right">Cashback</TableHead>
                  <TableHead className="text-center">Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {transactions.map((tx) => (
                  <TableRow key={tx.id}>
                    <TableCell>{format(tx.transactionDate, 'PP')}</TableCell>
                    {/* TODO: Fetch store name based on tx.storeId */}
                    <TableCell>{tx.storeId ? tx.storeId.substring(0, 10) + '...' : 'N/A'}</TableCell>
                    <TableCell className="text-right font-medium">₹{tx.cashbackAmount.toFixed(2)}</TableCell>
                     <TableCell className="text-center">
                       <Badge variant={getStatusBadgeVariant(tx.status)} className="capitalize">
                         {tx.status}
                       </Badge>
                     </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <p className="text-center text-muted-foreground py-4">No recent transactions found.</p>
          )}
        </CardContent>
         <CardFooter className="justify-end">
            <Button variant="link" asChild>
               <Link href="/dashboard/history">View All History <History className="ml-2 h-4 w-4" /></Link>
            </Button>
         </CardFooter>
      </Card>
    </div>
  );
}


function DashboardSkeleton() {
  return (
     <div className="space-y-8">
       <Skeleton className="h-8 w-48" /> {/* Title */}

       {/* Summary Cards Skeleton */}
       <div className="grid gap-4 md:grid-cols-3">
         <Card>
           <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
             <Skeleton className="h-4 w-2/4" />
             <Skeleton className="h-4 w-4" />
           </CardHeader>
           <CardContent>
             <Skeleton className="h-8 w-1/3 mb-1" />
             <Skeleton className="h-3 w-1/2" />
           </CardContent>
         </Card>
         <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <Skeleton className="h-4 w-2/4" />
              <Skeleton className="h-4 w-4" />
            </CardHeader>
            <CardContent>
              <Skeleton className="h-8 w-1/3 mb-1" />
              <Skeleton className="h-3 w-1/2" />
            </CardContent>
         </Card>
          <Card>
             <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
               <Skeleton className="h-4 w-2/4" />
               <Skeleton className="h-4 w-4" />
             </CardHeader>
             <CardContent>
               <Skeleton className="h-8 w-1/3 mb-1" />
               <Skeleton className="h-3 w-1/2" />
             </CardContent>
          </Card>
       </div>

        {/* Payout Skeleton */}
        <Card>
             <CardHeader>
               <Skeleton className="h-6 w-32 mb-2" />
               <Skeleton className="h-4 w-3/4" />
             </CardHeader>
             <CardContent>
               <Skeleton className="h-4 w-1/2 mb-4" />
               <Skeleton className="h-10 w-36" />
               <Skeleton className="h-4 w-1/3 mt-2" /> {/* Skeleton for needed amount text */}
             </CardContent>
              <CardFooter>
                 <Skeleton className="h-3 w-full" />
              </CardFooter>
        </Card>


       {/* Recent Activity Skeleton */}
       <Card>
         <CardHeader>
           <Skeleton className="h-6 w-40 mb-2" />
           <Skeleton className="h-4 w-1/2" />
         </CardHeader>
         <CardContent>
           <RecentActivitySkeleton />
         </CardContent>
         <CardFooter className="justify-end">
            <Skeleton className="h-6 w-32" />
         </CardFooter>
       </Card>
     </div>
  )
}

function RecentActivitySkeleton() {
   return (
      <Table>
        <TableHeader>
          <TableRow>
             <TableHead><Skeleton className="h-4 w-20" /></TableHead>
             <TableHead><Skeleton className="h-4 w-24" /></TableHead>
             <TableHead className="text-right"><Skeleton className="h-4 w-16 ml-auto" /></TableHead>
             <TableHead className="text-center"><Skeleton className="h-4 w-16 mx-auto" /></TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {[...Array(3)].map((_, i) => (
            <TableRow key={i}>
               <TableCell><Skeleton className="h-4 w-24" /></TableCell>
               <TableCell><Skeleton className="h-4 w-32" /></TableCell>
               <TableCell className="text-right"><Skeleton className="h-4 w-12 ml-auto" /></TableCell>
               <TableCell className="text-center"><Skeleton className="h-5 w-20 mx-auto rounded-full" /></TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
   )
}
