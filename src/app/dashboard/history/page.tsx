
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
    case 'paid': return <History className="h-3 w-3 text-green-700" />;
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
  const [loadingPage, setLoadingPage] = React.useState(true); // Primary page loading state
  const [pageError, setPageError] = React.useState<string | null>(null);
  const [lastVisible, setLastVisible] = React.useState<QueryDocumentSnapshot<DocumentData> | null>(null);
  const [hasMore, setHasMore] = React.useState(true);
  const [loadingMore, setLoadingMore] = React.useState(false);

  const fetchTransactions = React.useCallback(async (isLoadMore = false) => {
    let isMounted = true;
    if (!user) {
      if (isMounted && !isLoadMore) setLoadingPage(false);
      return;
    }

    if (firebaseInitializationError || !db) {
      if (isMounted) {
        setPageError(firebaseInitializationError || "Database connection not available.");
        if (!isLoadMore) setLoadingPage(false); else setLoadingMore(false);
        setHasMore(false);
      }
      return;
    }

    if (isLoadMore) {
      setLoadingMore(true);
    } else {
      setLoadingPage(true); // Set primary loading true for initial fetch
      setTransactions([]);
      setLastVisible(null);
      setHasMore(true);
      setPageError(null);
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
        if (!isLoadMore) setPageError(null);
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
        if (isLoadMore) setLoadingMore(false);
        else setLoadingPage(false); // Primary loading done after initial fetch
      }
    }
  }, [user, lastVisible]); // Add lastVisible

  React.useEffect(() => {
    let isMounted = true;
    if (authLoading) {
      // console.log("HISTORY_PAGE: Auth loading, waiting...");
      return; // Wait for auth to resolve
    }

    if (!user) {
      console.log("HISTORY_PAGE: No user, auth finished. Redirecting.");
      if (isMounted) setLoadingPage(false);
      router.push('/login?message=Please login to view your history.');
    } else {
      // console.log("HISTORY_PAGE: User present, auth done. Fetching initial transactions.");
      fetchTransactions(false);
    }
    return () => { isMounted = false; };
     // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, authLoading, router]); // fetchTransactions is memoized, safe to include if its own deps are stable


  const handleLoadMore = () => {
    if (!loadingMore && hasMore) {
      fetchTransactions(true);
    }
  };

  if (authLoading || loadingPage) {
    return <ProtectedRoute><HistoryTableSkeleton /></ProtectedRoute>;
  }

   if (!user && !authLoading) { // Should be caught by ProtectedRoute, but as a fallback
     return (
      <ProtectedRoute> {/* Still keep ProtectedRoute for consistency */}
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
            {!loadingPage && transactions.length === 0 && !pageError ? (
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
                        <TableCell className="font-medium truncate" title={transaction.storeName || transaction.storeId}>{transaction.storeName || transaction.storeId}</TableCell>
                        <TableCell className="font-mono text-xs truncate" title={transaction.orderId || undefined}>{transaction.orderId || 'N/A'}</TableCell>
                        <TableCell>{formatCurrency(transaction.finalSaleAmount ?? transaction.saleAmount)}</TableCell>
                        <TableCell className="font-semibold text-primary">{formatCurrency(transaction.finalCashbackAmount ?? transaction.initialCashbackAmount ?? 0)}</TableCell>
                        <TableCell>
                          <Badge variant={getStatusVariant(transaction.status)} className="capitalize flex items-center gap-1 text-xs whitespace-nowrap">
                            {getStatusIcon(transaction.status)}
                            {transaction.status.replace('_', ' ')}
                          </Badge>
                        </TableCell>
                        <TableCell className="whitespace-nowrap">{transaction.transactionDate ? format(new Date(transaction.transactionDate), 'PP') : 'N/A'}</TableCell>
                        <TableCell className="text-xs text-muted-foreground truncate max-w-[150px] sm:max-w-xs" title={transaction.notesToUser || undefined}>
                          {transaction.notesToUser || '-'}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
            {hasMore && !loadingPage && transactions.length > 0 && (
              <div className="mt-6 text-center">
                <Button onClick={handleLoadMore} disabled={loadingMore || loadingPage}>
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
