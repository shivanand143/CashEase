// src/app/dashboard/history/page.tsx
"use client";

import * as React from 'react';
import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/hooks/use-auth';
import { useRouter } from 'next/navigation';
import {
  collection,
  query,
  where,
  orderBy,
  limit,
  getDocs,
  startAfter,
  QueryDocumentSnapshot,
  DocumentData,
  Timestamp
} from 'firebase/firestore';
import { db } from '@/lib/firebase/config';
import type { Transaction, CashbackStatus } from '@/lib/types';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { formatCurrency, safeToDate } from '@/lib/utils';
import { format } from 'date-fns';
import { AlertCircle, History, Loader2 } from 'lucide-react';
import ProtectedRoute from '@/components/guards/protected-route'; // Use ProtectedRoute

const TRANSACTIONS_PER_PAGE = 15;

// Helper function to map status to badge variant
const getStatusVariant = (status: CashbackStatus): "default" | "secondary" | "destructive" | "outline" => {
  switch (status) {
    case 'confirmed': return 'default'; // Green/Primary for confirmed
    case 'paid': return 'secondary'; // Blue/Secondary for paid
    case 'pending': return 'outline'; // Muted/Outline for pending
    case 'rejected': return 'destructive'; // Red for rejected
    default: return 'outline';
  }
};

function CashbackHistoryContent() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastVisible, setLastVisible] = useState<QueryDocumentSnapshot<DocumentData> | null>(null);
  const [hasMore, setHasMore] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);

  const fetchTransactions = useCallback(async (loadMore = false) => {
    if (!user) {
      setLoading(false);
      setLoadingMore(false);
      return;
    } // Don't fetch if no user

    if (!loadMore) {
      setLoading(true);
      setLastVisible(null);
      setTransactions([]);
    } else {
      setLoadingMore(true);
    }
    setError(null);

    try {
      const transactionsCollection = collection(db, 'transactions');
      const constraints = [
        where('userId', '==', user.uid),
        orderBy('transactionDate', 'desc'),
        limit(TRANSACTIONS_PER_PAGE)
      ];

      if (loadMore && lastVisible) {
        constraints.push(startAfter(lastVisible));
      }

      const q = query(transactionsCollection, ...constraints);
      const querySnapshot = await getDocs(q);

      const transactionsData = querySnapshot.docs.map(docSnap => {
        const data = docSnap.data();
        return {
          id: docSnap.id,
          ...data,
          // Ensure dates are converted correctly
          transactionDate: safeToDate(data.transactionDate) || new Date(0),
          confirmationDate: safeToDate(data.confirmationDate),
          paidDate: safeToDate(data.paidDate),
          createdAt: safeToDate(data.createdAt) || new Date(0),
          updatedAt: safeToDate(data.updatedAt) || new Date(0),
        } as Transaction;
      });

      if (loadMore) {
        setTransactions(prev => [...prev, ...transactionsData]);
      } else {
        setTransactions(transactionsData);
      }

      setLastVisible(querySnapshot.docs[querySnapshot.docs.length - 1] || null);
      setHasMore(querySnapshot.docs.length === TRANSACTIONS_PER_PAGE);

    } catch (err) {
      console.error("Error fetching transactions:", err);
      const errorMsg = err instanceof Error ? err.message : "Failed to load transaction history.";
      setError(errorMsg);
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, [user, lastVisible]);

  useEffect(() => {
    if (user) {
      fetchTransactions(false);
    } else if (!authLoading) {
      // If auth is done loading and still no user, redirect
      router.push('/login');
    }
  }, [user, authLoading, fetchTransactions, router]);

  const handleLoadMore = () => {
    if (!loadingMore && hasMore) {
      fetchTransactions(true);
    }
  };

  if (authLoading || (loading && transactions.length === 0)) {
    return <HistoryTableSkeleton />;
  }

  if (!user) {
    // This should ideally be handled by ProtectedRoute, but good as a fallback
    return (
        <Alert variant="destructive" className="max-w-md mx-auto">
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>Authentication Required</AlertTitle>
            <AlertDescription>
                Please log in to view your cashback history.
                <Button variant="link" className="ml-2 p-0 h-auto" onClick={() => router.push('/login')}>Go to Login</Button>
            </AlertDescription>
        </Alert>
    );
  }


  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold flex items-center gap-2">
        <History className="w-7 h-7" /> Cashback History
      </h1>

      {error && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Error Loading History</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Your Transactions</CardTitle>
          <CardDescription>View the status and details of your cashback earnings.</CardDescription>
        </CardHeader>
        <CardContent>
          {loading && transactions.length === 0 ? (
            <HistoryTableSkeleton />
          ) : transactions.length === 0 ? (
            <div className="text-center py-16 text-muted-foreground">
              <p className="mb-4">You haven't earned any cashback yet.</p>
              <Button asChild>
                <Link href="/stores">Start Shopping & Earning!</Link>
              </Button>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Store</TableHead>
                  <TableHead>Order Amount</TableHead>
                  <TableHead>Cashback</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead>Status</TableHead>
                  {/* <TableHead>Details</TableHead> */}
                </TableRow>
              </TableHeader>
              <TableBody>
                {transactions.map((tx) => (
                  <TableRow key={tx.id}>
                    <TableCell className="font-medium">{tx.storeName || tx.storeId || 'Unknown Store'}</TableCell>
                    <TableCell>{formatCurrency(tx.saleAmount)}</TableCell>
                    <TableCell className="font-semibold">{formatCurrency(tx.cashbackAmount)}</TableCell>
                    <TableCell>{tx.transactionDate ? format(new Date(tx.transactionDate), 'PPp') : 'N/A'}</TableCell>
                    <TableCell>
                      <Badge variant={getStatusVariant(tx.status)}>{tx.status}</Badge>
                       {tx.status === 'confirmed' && tx.confirmationDate && (
                        <span className="block text-[10px] text-muted-foreground mt-1">
                          Confirmed: {format(new Date(tx.confirmationDate), 'PP')}
                        </span>
                       )}
                       {tx.status === 'paid' && tx.paidDate && (
                        <span className="block text-[10px] text-muted-foreground mt-1">
                          Paid: {format(new Date(tx.paidDate), 'PP')}
                        </span>
                       )}
                    </TableCell>
                    {/* <TableCell className="text-xs text-muted-foreground truncate max-w-[150px]">
                       {tx.adminNotes || '-'}
                       {tx.clickId && <span className="block">Click: {tx.clickId}</span>}
                    </TableCell> */}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
          {hasMore && (
            <div className="mt-6 text-center">
              <Button onClick={handleLoadMore} disabled={loadingMore}>
                {loadingMore ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                Load More Transactions
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// Skeleton Loader
function HistoryTableSkeleton() {
   return (
     <Card>
       <CardHeader>
         <Skeleton className="h-6 w-1/3 mb-2" />
         <Skeleton className="h-4 w-2/3" />
       </CardHeader>
       <CardContent>
         <Table>
           <TableHeader>
             <TableRow>
               {Array.from({ length: 5 }).map((_, index) => (
                 <TableHead key={index}><Skeleton className="h-5 w-full" /></TableHead>
               ))}
             </TableRow>
           </TableHeader>
           <TableBody>
             {Array.from({ length: 10 }).map((_, rowIndex) => (
               <TableRow key={rowIndex}>
                 {Array.from({ length: 5 }).map((_, colIndex) => (
                   <TableCell key={colIndex}><Skeleton className="h-5 w-full" /></TableCell>
                 ))}
               </TableRow>
             ))}
           </TableBody>
         </Table>
       </CardContent>
     </Card>
   );
 }

 // Wrap the page content with ProtectedRoute
 export default function CashbackHistoryPage() {
   return (
     <ProtectedRoute>
       <CashbackHistoryContent />
     </ProtectedRoute>
   );
 }
