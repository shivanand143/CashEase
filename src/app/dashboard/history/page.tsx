// src/app/dashboard/history/page.tsx
"use client";

import * as React from 'react';
import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/hooks/use-auth';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
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
import { db, firebaseInitializationError } from '@/lib/firebase/config';
import type { Transaction, CashbackStatus } from '@/lib/types';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { formatCurrency, safeToDate } from '@/lib/utils';
import { format } from 'date-fns';
import { AlertCircle, History, Loader2, Info } from 'lucide-react';
import ProtectedRoute from '@/components/guards/protected-route';

const TRANSACTIONS_PER_PAGE = 15;

function HistoryTableSkeleton() {
  return (
    <Card>
      <CardHeader>
        <Skeleton className="h-6 w-1/3 mb-2" />
        <Skeleton className="h-4 w-2/3" />
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                {Array.from({ length: 7 }).map((_, index) => (
                  <TableHead key={index}><Skeleton className="h-5 w-full" /></TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {Array.from({ length: 10 }).map((_, rowIndex) => (
                <TableRow key={rowIndex}>
                  {Array.from({ length: 7 }).map((_, colIndex) => (
                    <TableCell key={colIndex}><Skeleton className="h-5 w-full" /></TableCell>
                  ))}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}

const getStatusVariant = (status: CashbackStatus): "default" | "secondary" | "destructive" | "outline" => {
  switch (status) {
    case 'confirmed': return 'default';
    case 'paid': return 'secondary';
    case 'pending': return 'outline';
    case 'rejected':
    case 'cancelled': return 'destructive';
    default: return 'outline';
  }
};

const getStatusIcon = (status: CashbackStatus) => {
  switch (status) {
    case 'confirmed':
    case 'paid': return <History className="h-3 w-3 text-green-600" />;
    case 'pending': return <Loader2 className="h-3 w-3 animate-spin text-yellow-600" />;
    case 'rejected':
    case 'cancelled': return <AlertCircle className="h-3 w-3 text-red-600" />;
    default: return <Info className="h-3 w-3 text-muted-foreground" />;
  }
};

export default function CashbackHistoryPage() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [pageError, setPageError] = useState<string | null>(null);
  const [lastVisible, setLastVisible] = useState<QueryDocumentSnapshot<DocumentData> | null>(null);
  const [hasMore, setHasMore] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);

  const fetchTransactions = useCallback(async (isLoadMore = false) => {
    let isMounted = true;
    if (!user) {
      if (isMounted) {
        if (!isLoadMore) setLoading(false);
        else setLoadingMore(false);
      }
      return () => { isMounted = false; };
    }

    if (firebaseInitializationError || !db) {
      if (isMounted) {
        setPageError(firebaseInitializationError || "Database connection not available.");
        if (!isLoadMore) setLoading(false);
        else setLoadingMore(false);
        setHasMore(false);
      }
      return () => { isMounted = false; };
    }

    console.log(`Dashboard/History: Fetching transactions. Load more: ${isLoadMore}`);
    if (!isLoadMore) {
      setLoading(true);
      setTransactions([]);
      setLastVisible(null);
      setHasMore(true);
      setPageError(null);
    } else {
      if (!lastVisible) { // Don't load more if there's no cursor
        if (isMounted) setLoadingMore(false);
        return () => { isMounted = false; };
      }
      setLoadingMore(true);
    }

    try {
      const transactionsCollection = collection(db, 'transactions');
      const qConstraints = [
        where('userId', '==', user.uid),
        orderBy('transactionDate', 'desc'),
        limit(TRANSACTIONS_PER_PAGE)
      ];

      if (isLoadMore && lastVisible) {
        qConstraints.push(startAfter(lastVisible));
      }

      const q = query(transactionsCollection, ...qConstraints);
      const querySnapshot = await getDocs(q);
      console.log(`Dashboard/History: Fetched ${querySnapshot.size} transactions.`);

      const newTransactionsData = querySnapshot.docs.map(docSnap => {
        const data = docSnap.data();
        return {
          id: docSnap.id,
          ...data,
          transactionDate: safeToDate(data.transactionDate as Timestamp | undefined) || new Date(0),
          confirmationDate: safeToDate(data.confirmationDate as Timestamp | undefined),
          paidDate: safeToDate(data.paidDate as Timestamp | undefined),
          createdAt: safeToDate(data.createdAt as Timestamp | undefined) || new Date(0),
          updatedAt: safeToDate(data.updatedAt as Timestamp | undefined) || new Date(0),
        } as Transaction;
      });
      
      if (isMounted) {
        setTransactions(prev => isLoadMore ? [...prev, ...newTransactionsData] : newTransactionsData);
        setLastVisible(querySnapshot.docs[querySnapshot.docs.length - 1] || null);
        setHasMore(newTransactionsData.length === TRANSACTIONS_PER_PAGE);
      }
    } catch (err) {
      console.error("Error fetching transactions:", err);
      if (isMounted) {
        const errorMsg = err instanceof Error ? err.message : "Failed to load transaction history.";
        setPageError(errorMsg);
        setHasMore(false);
      }
    } finally {
      if (isMounted) {
        if (!isLoadMore) setLoading(false);
        else setLoadingMore(false);
      }
    }
    return () => { isMounted = false; };
  }, [user]); // Only user as dependency, as lastVisible is passed as argument

  useEffect(() => {
    if (user && !authLoading) {
      fetchTransactions(false);
    } else if (!authLoading && !user) {
      router.push('/login?message=Please login to view your history.');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, authLoading, router]); // fetchTransactions is stable due to useCallback

  const handleLoadMore = () => {
    if (!loadingMore && hasMore) {
      fetchTransactions(true);
    }
  };

  if (authLoading || (loading && transactions.length === 0 && !pageError)) {
    return <ProtectedRoute><HistoryTableSkeleton /></ProtectedRoute>;
  }

  if (!user && !authLoading) {
     return (
      <ProtectedRoute>
         <Alert variant="destructive" className="max-w-md mx-auto">
             <AlertCircle className="h-4 w-4" />
             <AlertTitle>Authentication Required</AlertTitle>
             <AlertDescription>
                 Please log in to view your cashback history.
                 <Button variant="link" className="ml-2 p-0 h-auto" onClick={() => router.push('/login')}>Go to Login</Button>
             </AlertDescription>
         </Alert>
      </ProtectedRoute>
     );
  }

  return (
    <ProtectedRoute>
      <div className="space-y-6">
        <h1 className="text-3xl font-bold flex items-center gap-2">
            <History className="w-7 h-7 text-primary" /> Cashback History
        </h1>

        {pageError && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>Error Loading History</AlertTitle>
            <AlertDescription>{pageError}</AlertDescription>
          </Alert>
        )}

        <Card>
          <CardHeader>
            <CardTitle>Your Transactions</CardTitle>
            <CardDescription>Track the status and details of your cashback earnings.</CardDescription>
          </CardHeader>
          <CardContent>
            {loading && transactions.length === 0 ? (
                <HistoryTableSkeleton />
            ) : !loading && transactions.length === 0 && !pageError ? (
              <div className="text-center py-16 text-muted-foreground">
                <p className="mb-4">You don't have any transactions yet.</p>
                <Button asChild>
                  <Link href="/stores">Start Shopping & Earning</Link>
                </Button>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Store</TableHead>
                      <TableHead>Order ID</TableHead>
                      <TableHead>Sale Amount</TableHead>
                      <TableHead>Cashback</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Transaction Date</TableHead>
                      <TableHead>Notes</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {transactions.map((transaction) => (
                      <TableRow key={transaction.id}>
                        <TableCell className="font-medium">{transaction.storeName || transaction.storeId}</TableCell>
                        <TableCell className="font-mono text-xs">{transaction.orderId || 'N/A'}</TableCell>
                        <TableCell>{formatCurrency(transaction.saleAmount)}</TableCell>
                        <TableCell className="font-semibold text-primary">{formatCurrency(transaction.cashbackAmount)}</TableCell>
                        <TableCell>
                          <Badge variant={getStatusVariant(transaction.status)} className="capitalize flex items-center gap-1 text-xs">
                            {getStatusIcon(transaction.status)}
                            {transaction.status}
                          </Badge>
                        </TableCell>
                        <TableCell className="whitespace-nowrap">{transaction.transactionDate ? format(new Date(transaction.transactionDate), 'PP') : 'N/A'}</TableCell>
                        <TableCell className="text-xs text-muted-foreground max-w-[200px] truncate" title={transaction.notesToUser || undefined}>
                          {transaction.notesToUser || '-'}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
            {hasMore && !loading && transactions.length > 0 && (
              <div className="mt-6 text-center">
                <Button onClick={handleLoadMore} disabled={loadingMore}>
                  {loadingMore ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                  Load More Transactions
                </Button>
              </div>
            )}
             {loadingMore && <div className="text-center py-4"><Loader2 className="h-6 w-6 animate-spin text-primary mx-auto" /></div>}
          </CardContent>
        </Card>
      </div>
    </ProtectedRoute>
  );
}
