
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
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { formatCurrency, safeToDate } from '@/lib/utils';
import { format, isValid } from 'date-fns';
import { AlertCircle, History, Loader2, CheckCircle, XCircle, Hourglass } from 'lucide-react';
import ProtectedRoute from '@/components/guards/protected-route';

const TRANSACTIONS_PER_PAGE = 15;

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
      case 'paid': return <CheckCircle className="h-3 w-3" />;
      case 'pending': return <Hourglass className="h-3 w-3" />;
      case 'rejected':
      case 'cancelled': return <XCircle className="h-3 w-3" />;
      default: return <AlertCircle className="h-3 w-3" />;
    }
};


function CashbackHistoryContent() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [pageError, setPageError] = useState<string | null>(null);
  const [lastVisible, setLastVisible] = useState<QueryDocumentSnapshot<DocumentData> | null>(null);
  const [hasMore, setHasMore] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);

  const fetchTransactions = useCallback(async (isLoadMoreOperation = false, docToStartAfter: QueryDocumentSnapshot<DocumentData> | null = lastVisible) => {
    let isMounted = true;
    if (!user) {
      if(isMounted) {
         if (!isLoadMoreOperation) setLoading(false); else setLoadingMore(false);
      }
      return () => { isMounted = false; };
    }
    if (firebaseInitializationError || !db) {
      if(isMounted) {
        setPageError(firebaseInitializationError || "Database connection not available.");
        if (!isLoadMoreOperation) setLoading(false); else setLoadingMore(false);
        setHasMore(false);
      }
      return () => { isMounted = false; };
    }

    if (!isLoadMoreOperation) {
      setLoading(true);
      setTransactions([]);
      setLastVisible(null);
      setHasMore(true);
    } else {
       if (!docToStartAfter) { // Don't load more if there's no cursor
        if(isMounted) setLoadingMore(false);
        return () => { isMounted = false; };
      }
      setLoadingMore(true);
    }
    if (!isLoadMoreOperation) setPageError(null);

    try {
      const transactionsCollection = collection(db, 'transactions');
      const constraints = [
        where('userId', '==', user.uid),
        orderBy('transactionDate', 'desc'),
        limit(TRANSACTIONS_PER_PAGE)
      ];

      if (isLoadMoreOperation && docToStartAfter) {
        constraints.push(startAfter(docToStartAfter));
      }

      const q = query(transactionsCollection, ...constraints);
      const querySnapshot = await getDocs(q);

      const transactionsData = querySnapshot.docs.map(docSnap => {
        const data = docSnap.data();
        return {
          id: docSnap.id,
          ...data,
          transactionDate: safeToDate(data.transactionDate) || new Date(0),
          confirmationDate: safeToDate(data.confirmationDate),
          paidDate: safeToDate(data.paidDate),
          createdAt: safeToDate(data.createdAt) || new Date(0),
          updatedAt: safeToDate(data.updatedAt) || new Date(0),
        } as Transaction;
      });
      if(isMounted){
        setTransactions(prev => isLoadMoreOperation ? [...prev, ...transactionsData] : transactionsData);
        setLastVisible(querySnapshot.docs[querySnapshot.docs.length - 1] || null);
        setHasMore(querySnapshot.docs.length === TRANSACTIONS_PER_PAGE);
      }

    } catch (err) {
      console.error("Error fetching transactions:", err);
      if(isMounted){
        const errorMsg = err instanceof Error ? err.message : "Failed to load transaction history.";
        setPageError(errorMsg);
        setHasMore(false);
      }
    } finally {
      if(isMounted){
        if (!isLoadMoreOperation) setLoading(false); else setLoadingMore(false);
      }
    }
    return () => { isMounted = false; };
  }, [user, lastVisible]);


  useEffect(() => {
    if (user && !authLoading) {
      fetchTransactions(false, null); // Initial fetch
    } else if (!authLoading && !user) {
      router.push('/login');
    }
  }, [user, authLoading, fetchTransactions, router]);

  const handleLoadMore = () => {
    if (!loadingMore && hasMore && lastVisible) {
      fetchTransactions(true, lastVisible);
    }
  };

  if (authLoading || (loading && transactions.length === 0 && !pageError)) {
    return <HistoryTableSkeleton />;
  }

  if (!user && !authLoading) {
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
          <CardDescription>View the status and details of your cashback earnings.</CardDescription>
        </CardHeader>
        <CardContent>
          {loading && transactions.length === 0 ? (
            <HistoryTableSkeleton />
          ) : !loading && transactions.length === 0 && !pageError ? (
            <div className="text-center py-16 text-muted-foreground">
              <p className="mb-4">You haven't earned any cashback yet.</p>
              <Button asChild>
                <Link href="/stores">Start Shopping & Earning!</Link>
              </Button>
            </div>
          ) : (
            <div className="overflow-x-auto">
                <Table>
                <TableHeader>
                    <TableRow>
                    <TableHead>Store</TableHead>
                    <TableHead>Order Amount</TableHead>
                    <TableHead>Cashback</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Notes</TableHead>
                    </TableRow>
                </TableHeader>
                <TableBody>
                    {transactions.map((tx) => (
                    <TableRow key={tx.id}>
                        <TableCell className="font-medium">{tx.storeName || tx.storeId || 'Unknown Store'}</TableCell>
                        <TableCell>{formatCurrency(tx.saleAmount)}</TableCell>
                        <TableCell className="font-semibold">{formatCurrency(tx.cashbackAmount)}</TableCell>
                        <TableCell className="whitespace-nowrap">{tx.transactionDate && isValid(new Date(tx.transactionDate as Date)) ? format(new Date(tx.transactionDate as Date), 'PPp') : 'N/A'}</TableCell>
                        <TableCell>
                        <Badge variant={getStatusVariant(tx.status)} className="flex items-center gap-1 w-fit">
                            {getStatusIcon(tx.status)}
                            {tx.status}
                        </Badge>
                        {tx.status === 'confirmed' && tx.confirmationDate && isValid(new Date(tx.confirmationDate as Date)) && (
                            <span className="block text-[10px] text-muted-foreground mt-1">
                            Confirmed: {format(new Date(tx.confirmationDate as Date), 'PP')}
                            </span>
                        )}
                        {tx.status === 'paid' && tx.paidDate && isValid(new Date(tx.paidDate as Date)) &&(
                            <span className="block text-[10px] text-muted-foreground mt-1">
                            Paid: {format(new Date(tx.paidDate as Date), 'PP')}
                            </span>
                        )}
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground truncate max-w-[150px]" title={tx.notesToUser || tx.adminNotes || ''}>
                            {tx.notesToUser || tx.adminNotes || '-'}
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
  );
}

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
                {Array.from({ length: 6 }).map((_, index) => (
                    <TableHead key={index}><Skeleton className="h-5 w-full" /></TableHead>
                ))}
                </TableRow>
            </TableHeader>
            <TableBody>
                {Array.from({ length: 10 }).map((_, rowIndex) => (
                <TableRow key={rowIndex}>
                    {Array.from({ length: 6 }).map((_, colIndex) => (
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

 export default function CashbackHistoryPage() {
   return (
     <ProtectedRoute>
       <CashbackHistoryContent />
     </ProtectedRoute>
   );
 }
