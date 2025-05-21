// src/app/dashboard/history/page.tsx
"use client";

import * as React from 'react';
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
import { AlertCircle, History, Loader2, Info, CheckCircle, XCircle } from 'lucide-react';
import ProtectedRoute from '@/components/guards/protected-route';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

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
    case 'awaiting_payout': return 'default';
    case 'rejected':
    case 'cancelled': return 'destructive';
    default: return 'outline';
  }
};

const getStatusIcon = (status: CashbackStatus) => {
  switch (status) {
    case 'confirmed': return <CheckCircle className="h-3 w-3 text-green-600" />;
    case 'paid': return <History className="h-3 w-3 text-green-700" />; // Or a specific "paid" icon
    case 'pending': return <Loader2 className="h-3 w-3 animate-spin text-yellow-600" />;
    case 'awaiting_payout': return <History className="h-3 w-3 text-purple-600" />;
    case 'rejected':
    case 'cancelled': return <XCircle className="h-3 w-3 text-red-600" />;
    default: return <Info className="h-3 w-3 text-muted-foreground" />;
  }
};

export default function CashbackHistoryPage() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();
  const [transactions, setTransactions] = React.useState<Transaction[]>([]);
  const [pageLoading, setPageLoading] = React.useState(true); // Renamed for clarity
  const [pageError, setPageError] = React.useState<string | null>(null);
  const [lastVisible, setLastVisible] = React.useState<QueryDocumentSnapshot<DocumentData> | null>(null);
  const [hasMore, setHasMore] = React.useState(true);
  const [loadingMore, setLoadingMore] = React.useState(false);

  const fetchInitialTransactions = React.useCallback(async (userId: string) => {
    let isMounted = true;
    setPageLoading(true);
    setPageError(null);
    setTransactions([]);
    setLastVisible(null);
    setHasMore(true);

    if (firebaseInitializationError || !db) {
      if (isMounted) {
        setPageError(firebaseInitializationError || "Database not available.");
        setPageLoading(false);
      }
      return;
    }

    try {
      const transactionsCollection = collection(db, 'transactions');
      const qConstraints = [
        where('userId', '==', userId),
        orderBy('transactionDate', 'desc'),
        limit(TRANSACTIONS_PER_PAGE)
      ];
      const q = query(transactionsCollection, ...qConstraints);
      const querySnapshot = await getDocs(q);

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
        setTransactions(newTransactionsData);
        setLastVisible(querySnapshot.docs[querySnapshot.docs.length - 1] || null);
        setHasMore(newTransactionsData.length === TRANSACTIONS_PER_PAGE);
      }
    } catch (err) {
      if (isMounted) {
        const errorMsg = err instanceof Error ? err.message : "Failed to load transaction history.";
        setPageError(errorMsg);
      }
    } finally {
      if (isMounted) {
        setPageLoading(false);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Removed user from here as it's passed directly

  const fetchMoreTransactions = React.useCallback(async (userId: string, lastDoc: QueryDocumentSnapshot<DocumentData> | null) => {
    if (!lastDoc) return;
    let isMounted = true;
    setLoadingMore(true);

    if (firebaseInitializationError || !db) {
      if (isMounted) {
        setPageError(firebaseInitializationError || "Database not available.");
        setLoadingMore(false);
      }
      return;
    }

    try {
      const transactionsCollection = collection(db, 'transactions');
      const qConstraints = [
        where('userId', '==', userId),
        orderBy('transactionDate', 'desc'),
        startAfter(lastDoc),
        limit(TRANSACTIONS_PER_PAGE)
      ];
      const q = query(transactionsCollection, ...qConstraints);
      const querySnapshot = await getDocs(q);

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
        setTransactions(prev => [...prev, ...newTransactionsData]);
        setLastVisible(querySnapshot.docs[querySnapshot.docs.length - 1] || null);
        setHasMore(newTransactionsData.length === TRANSACTIONS_PER_PAGE);
      }
    } catch (err) {
      if (isMounted) {
        const errorMsg = err instanceof Error ? err.message : "Failed to load more transactions.";
        setPageError(errorMsg);
      }
    } finally {
      if (isMounted) {
        setLoadingMore(false);
      }
    }
     // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Removed user and lastVisible from here

  React.useEffect(() => {
    if (authLoading) {
      setPageLoading(true);
      return;
    }
    if (!user) {
      setPageLoading(false);
      router.push('/login?message=Please login to view your history.');
    } else {
      fetchInitialTransactions(user.uid);
    }
  }, [user, authLoading, router, fetchInitialTransactions]);

  const handleLoadMore = () => {
    if (user && !loadingMore && hasMore && lastVisible) {
      fetchMoreTransactions(user.uid, lastVisible);
    }
  };

  if (authLoading || (pageLoading && transactions.length === 0 && !pageError)) {
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
        <h1 className="text-2xl sm:text-3xl font-bold flex items-center gap-2">
          <History className="w-6 h-6 sm:w-7 sm:h-7 text-primary" /> Cashback History
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
            {pageLoading && transactions.length === 0 ? (
              <HistoryTableSkeleton />
            ) : !pageLoading && transactions.length === 0 && !pageError ? (
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
                      <TableHead className="min-w-[150px]">Store</TableHead>
                      <TableHead className="min-w-[120px]">Order ID</TableHead>
                      <TableHead className="min-w-[100px]">Sale Amount</TableHead>
                      <TableHead className="min-w-[100px]">Cashback</TableHead>
                      <TableHead className="min-w-[120px]">Status</TableHead>
                      <TableHead className="min-w-[120px]">Date</TableHead>
                      <TableHead className="min-w-[200px]">Notes</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {transactions.map((transaction) => (
                      <TableRow key={transaction.id}>
                        <TableCell className="font-medium">
                          <Tooltip>
                            <TooltipTrigger asChild><span className="truncate block max-w-[150px]">{transaction.storeName || transaction.storeId}</span></TooltipTrigger>
                            <TooltipContent><p>{transaction.storeName || transaction.storeId}</p></TooltipContent>
                          </Tooltip>
                        </TableCell>
                        <TableCell className="font-mono text-xs">
                          <Tooltip>
                            <TooltipTrigger asChild><span className="truncate block max-w-[120px]">{transaction.orderId || 'N/A'}</span></TooltipTrigger>
                            <TooltipContent><p>{transaction.orderId || 'N/A'}</p></TooltipContent>
                          </Tooltip>
                        </TableCell>
                        <TableCell>{formatCurrency(transaction.finalSaleAmount ?? transaction.saleAmount)}</TableCell>
                        <TableCell className="font-semibold text-primary">{formatCurrency(transaction.finalCashbackAmount ?? transaction.initialCashbackAmount ?? 0)}</TableCell>
                        <TableCell>
                          <Badge variant={getStatusVariant(transaction.status)} className="capitalize flex items-center gap-1 text-xs whitespace-nowrap">
                            {getStatusIcon(transaction.status)}
                            {transaction.status.replace('_', ' ')}
                          </Badge>
                        </TableCell>
                        <TableCell className="whitespace-nowrap">{transaction.transactionDate ? format(new Date(transaction.transactionDate), 'PP') : 'N/A'}</TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          <Tooltip>
                            <TooltipTrigger asChild><span className="truncate block max-w-[200px]">{transaction.notesToUser || '-'}</span></TooltipTrigger>
                            <TooltipContent><p>{transaction.notesToUser || '-'}</p></TooltipContent>
                          </Tooltip>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
            {hasMore && !pageLoading && transactions.length > 0 && (
              <div className="mt-6 text-center">
                <Button onClick={handleLoadMore} disabled={loadingMore || pageLoading}>
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
