// src/app/dashboard/history/page.tsx
"use client";

import * as React from 'react';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/use-auth';
import { collection, query, where, orderBy, getDocs, limit, startAfter, DocumentData, QueryDocumentSnapshot } from 'firebase/firestore';
import { db } from '@/lib/firebase/config';
import type { Transaction } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { format } from 'date-fns';
import { AlertCircle, History } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

const TRANSACTIONS_PER_PAGE = 15;

export default function CashbackHistoryPage() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastVisible, setLastVisible] = useState<QueryDocumentSnapshot<DocumentData> | null>(null);
  const [hasMore, setHasMore] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);

  useEffect(() => {
    if (!authLoading && !user) {
      router.push('/login?message=Please login to view your history');
    }
  }, [user, authLoading, router]);

  const fetchInitialTransactions = async () => {
      if (!user) return;
      setLoading(true);
      setError(null);
      setTransactions([]); // Reset on initial fetch
      setLastVisible(null);
      setHasMore(true);

      try {
        const transactionsCollection = collection(db, 'transactions');
        const q = query(
          transactionsCollection,
          where('userId', '==', user.uid),
          orderBy('transactionDate', 'desc'),
          limit(TRANSACTIONS_PER_PAGE)
        );
        const querySnapshot = await getDocs(q);
        const transactionsData = querySnapshot.docs.map(doc => mapDocToTransaction(doc));

        setTransactions(transactionsData);
        setLastVisible(querySnapshot.docs[querySnapshot.docs.length - 1]);
        setHasMore(querySnapshot.docs.length === TRANSACTIONS_PER_PAGE);

      } catch (err) {
        console.error("Error fetching transactions:", err);
        setError("Failed to load cashback history. Please try again later.");
      } finally {
        setLoading(false);
      }
  };


   const fetchMoreTransactions = async () => {
       if (!user || !lastVisible || !hasMore || loadingMore) return;
       setLoadingMore(true);
       setError(null);

       try {
         const transactionsCollection = collection(db, 'transactions');
         const q = query(
           transactionsCollection,
           where('userId', '==', user.uid),
           orderBy('transactionDate', 'desc'),
           startAfter(lastVisible),
           limit(TRANSACTIONS_PER_PAGE)
         );
         const querySnapshot = await getDocs(q);
         const newTransactionsData = querySnapshot.docs.map(doc => mapDocToTransaction(doc));

         setTransactions(prev => [...prev, ...newTransactionsData]);
         setLastVisible(querySnapshot.docs[querySnapshot.docs.length - 1]);
         setHasMore(querySnapshot.docs.length === TRANSACTIONS_PER_PAGE);

       } catch (err) {
         console.error("Error fetching more transactions:", err);
         setError("Failed to load more transactions. Please try again later.");
       } finally {
         setLoadingMore(false);
       }
   };

  useEffect(() => {
      if (user) {
          fetchInitialTransactions();
      }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]); // Fetch when user context is available


  const getStatusBadgeVariant = (status: Transaction['status']): "default" | "secondary" | "outline" | "destructive" => {
    switch (status) {
      case 'confirmed': return 'default';
      case 'paid': return 'secondary';
      case 'pending': return 'outline';
      case 'rejected': return 'destructive';
      default: return 'outline';
    }
  };

  const mapDocToTransaction = (doc: QueryDocumentSnapshot<DocumentData>): Transaction => {
      const data = doc.data();
      return {
          id: doc.id,
          userId: data.userId,
          storeId: data.storeId,
          clickId: data.clickId,
          saleAmount: data.saleAmount,
          cashbackAmount: data.cashbackAmount,
          status: data.status,
          transactionDate: data.transactionDate?.toDate ? data.transactionDate.toDate() : new Date(0), // Fallback date
          confirmationDate: data.confirmationDate?.toDate ? data.confirmationDate.toDate() : null,
          payoutId: data.payoutId,
          notes: data.notes,
          createdAt: data.createdAt?.toDate ? data.createdAt.toDate() : new Date(0),
          updatedAt: data.updatedAt?.toDate ? data.updatedAt.toDate() : new Date(0),
      } as Transaction;
  };

  if (authLoading || (!user && !authLoading)) {
      // Show loading skeleton or return null while auth is resolving or redirecting
      return <HistoryPageSkeleton />;
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-2xl flex items-center gap-2">
           <History className="w-6 h-6"/> Cashback History
        </CardTitle>
        <CardDescription>View all your past cashback transactions.</CardDescription>
      </CardHeader>
      <CardContent>
        {error && (
          <Alert variant="destructive" className="mb-4">
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>Error</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
        {loading ? (
          <HistoryTableSkeleton />
        ) : transactions.length > 0 ? (
           <>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Store</TableHead>
                  <TableHead className="hidden md:table-cell text-right">Sale Amount</TableHead>
                  <TableHead className="text-right">Cashback</TableHead>
                  <TableHead className="text-center">Status</TableHead>
                   <TableHead className="hidden lg:table-cell">Confirmation Date</TableHead>
                   <TableHead className="hidden lg:table-cell">Notes</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {transactions.map((tx) => (
                  <TableRow key={tx.id}>
                    <TableCell>{format(tx.transactionDate, 'PP')}</TableCell>
                    <TableCell>{tx.storeId}</TableCell> {/* TODO: Enhance with store name lookup */}
                     <TableCell className="hidden md:table-cell text-right">₹{tx.saleAmount.toFixed(2)}</TableCell>
                    <TableCell className="text-right font-medium">₹{tx.cashbackAmount.toFixed(2)}</TableCell>
                    <TableCell className="text-center">
                      <Badge variant={getStatusBadgeVariant(tx.status)} className="capitalize">
                        {tx.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="hidden lg:table-cell">
                        {tx.confirmationDate ? format(tx.confirmationDate, 'PP') : '-'}
                    </TableCell>
                     <TableCell className="hidden lg:table-cell text-xs text-muted-foreground">
                        {tx.notes || '-'}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            {hasMore && (
               <div className="mt-6 text-center">
                  <Button onClick={fetchMoreTransactions} disabled={loadingMore}>
                     {loadingMore ? 'Loading...' : 'Load More'}
                  </Button>
               </div>
            )}
          </>
        ) : (
          <p className="text-center text-muted-foreground py-8">You haven't earned any cashback yet. Start shopping through CashEase!</p>
        )}
      </CardContent>
    </Card>
  );
}


function HistoryPageSkeleton() {
   return (
     <Card>
       <CardHeader>
         <Skeleton className="h-7 w-48 mb-2" />
         <Skeleton className="h-4 w-64" />
       </CardHeader>
       <CardContent>
         <HistoryTableSkeleton />
       </CardContent>
     </Card>
   )
}


function HistoryTableSkeleton() {
   return (
      <Table>
        <TableHeader>
          <TableRow>{/* Remove whitespace between elements */}
             <TableHead><Skeleton className="h-4 w-20" /></TableHead>
             <TableHead><Skeleton className="h-4 w-24" /></TableHead>
             <TableHead className="hidden md:table-cell text-right"><Skeleton className="h-4 w-20 ml-auto" /></TableHead>
             <TableHead className="text-right"><Skeleton className="h-4 w-16 ml-auto" /></TableHead>
             <TableHead className="text-center"><Skeleton className="h-4 w-16 mx-auto" /></TableHead>
             <TableHead className="hidden lg:table-cell"><Skeleton className="h-4 w-24" /></TableHead>
             <TableHead className="hidden lg:table-cell"><Skeleton className="h-4 w-20" /></TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {[...Array(5)].map((_, i) => (
            <TableRow key={i}>{/* Remove whitespace between elements */}
               <TableCell><Skeleton className="h-4 w-24" /></TableCell>
               <TableCell><Skeleton className="h-4 w-32" /></TableCell>
               <TableCell className="hidden md:table-cell text-right"><Skeleton className="h-4 w-16 ml-auto" /></TableCell>
               <TableCell className="text-right"><Skeleton className="h-4 w-12 ml-auto" /></TableCell>
               <TableCell className="text-center"><Skeleton className="h-5 w-20 mx-auto rounded-full" /></TableCell>
               <TableCell className="hidden lg:table-cell"><Skeleton className="h-4 w-24" /></TableCell>
               <TableCell className="hidden lg:table-cell"><Skeleton className="h-4 w-20" /></TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
   )
}
