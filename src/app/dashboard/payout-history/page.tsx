// src/app/dashboard/payout-history/page.tsx
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
import { db, firebaseInitializationError } from '@/lib/firebase/config';
import type { PayoutRequest, PayoutStatus } from '@/lib/types';
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
import { AlertCircle, History, Loader2, Info, ReceiptText, CheckCircle, XCircle, Hourglass } from 'lucide-react';
import ProtectedRoute from '@/components/guards/protected-route';

const PAYOUTS_PER_PAGE = 15;

const getStatusVariant = (status: PayoutStatus): "default" | "secondary" | "destructive" | "outline" => {
  switch (status) {
    case 'approved':
    case 'paid': return 'default'; // Green-like (paid is more final)
    case 'processing': return 'secondary'; // Blue/Purple-like
    case 'pending': return 'outline'; // Yellow-like
    case 'rejected':
    case 'failed': return 'destructive'; // Red-like
    default: return 'outline';
  }
};

const getStatusIcon = (status: PayoutStatus) => {
  switch (status) {
    case 'approved': return <CheckCircle className="h-3 w-3 text-green-600" />;
    case 'paid': return <CheckCircle className="h-3 w-3 text-green-700" />; // Slightly different for paid
    case 'processing': return <Loader2 className="h-3 w-3 animate-spin text-blue-600" />;
    case 'pending': return <Hourglass className="h-3 w-3 text-yellow-600" />;
    case 'rejected':
    case 'failed': return <XCircle className="h-3 w-3 text-red-600" />;
    default: return <Info className="h-3 w-3 text-muted-foreground" />;
  }
};


function PayoutHistoryTableSkeleton() {
  return (
    <Card>
      <CardHeader>
        <Skeleton className="h-7 w-1/2 mb-1" />
        <Skeleton className="h-4 w-3/4" />
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
              {Array.from({ length: 8 }).map((_, rowIndex) => (
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

export default function PayoutHistoryPage() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();
  const [payouts, setPayouts] = useState<PayoutRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [pageError, setPageError] = useState<string | null>(null);
  const [lastVisible, setLastVisible] = useState<QueryDocumentSnapshot<DocumentData> | null>(null);
  const [hasMore, setHasMore] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);

  const fetchPayouts = useCallback(async (isLoadMore = false) => {
    let isMounted = true;
    if (!user) {
      if (isMounted) {
        if (!isLoadMore) setLoading(false); else setLoadingMore(false);
      }
      return () => { isMounted = false; };
    }

    if (firebaseInitializationError || !db) {
      if (isMounted) {
        setPageError(firebaseInitializationError || "Database connection not available.");
        if (!isLoadMore) setLoading(false); else setLoadingMore(false);
        setHasMore(false);
      }
      return () => { isMounted = false; };
    }

    if (!isLoadMore) {
      setLoading(true);
      setPayouts([]);
      setLastVisible(null);
      setHasMore(true);
      setPageError(null);
    } else {
      if (!lastVisible) {
        if (isMounted) setLoadingMore(false);
        return () => { isMounted = false; };
      }
      setLoadingMore(true);
    }

    try {
      const payoutsCollection = collection(db, 'payoutRequests');
      const qConstraints = [
        where('userId', '==', user.uid),
        orderBy('requestedAt', 'desc'),
        limit(PAYOUTS_PER_PAGE)
      ];

      if (isLoadMore && lastVisible) {
        qConstraints.push(startAfter(lastVisible));
      }

      const q = query(payoutsCollection, ...qConstraints);
      const querySnapshot = await getDocs(q);

      const newPayoutsData = querySnapshot.docs.map(docSnap => {
        const data = docSnap.data();
        return {
          id: docSnap.id,
          ...data,
          requestedAt: safeToDate(data.requestedAt as Timestamp | undefined) || new Date(0),
          processedAt: safeToDate(data.processedAt as Timestamp | undefined),
        } as PayoutRequest;
      });
      
      if (isMounted) {
        setPayouts(prev => isLoadMore ? [...prev, ...newPayoutsData] : newPayoutsData);
        setLastVisible(querySnapshot.docs[querySnapshot.docs.length - 1] || null);
        setHasMore(newPayoutsData.length === PAYOUTS_PER_PAGE);
      }
    } catch (err) {
      if (isMounted) {
        const errorMsg = err instanceof Error ? err.message : "Failed to load payout history.";
        setPageError(errorMsg);
        setHasMore(false);
      }
    } finally {
      if (isMounted) {
        if (!isLoadMore) setLoading(false); else setLoadingMore(false);
      }
    }
    return () => { isMounted = false; };
  }, [user]);

  useEffect(() => {
    if (user && !authLoading) {
      fetchPayouts(false);
    } else if (!authLoading && !user) {
      router.push('/login?message=Please login to view your payout history.');
    }
  }, [user, authLoading, router, fetchPayouts]);

  const handleLoadMore = () => {
    if (!loadingMore && hasMore) {
      fetchPayouts(true);
    }
  };

  const maskPaymentDetail = (method: PayoutMethod, detail: string): string => {
    if (!detail) return 'N/A';
    if (method === 'bank_transfer') {
      // Basic masking, assuming account number might be long
      if (detail.length > 8) return `****${detail.slice(-4)}`;
      return '****';
    } else if (method === 'paypal') {
      const parts = detail.split('@');
      if (parts.length === 2) return `${parts[0].substring(0, Math.min(3, parts[0].length))}****@${parts[1]}`;
      return '****@****';
    } else if (method === 'gift_card') {
      return `Gift Card (${detail.substring(0, Math.min(10, detail.length))}...)`;
    }
    return detail;
  };

  if (authLoading || (loading && payouts.length === 0 && !pageError)) {
    return <ProtectedRoute><PayoutHistoryTableSkeleton /></ProtectedRoute>;
  }

  if (!user && !authLoading) {
     return (
      <ProtectedRoute>
         <Alert variant="destructive" className="max-w-md mx-auto">
             <AlertCircle className="h-4 w-4" />
             <AlertTitle>Authentication Required</AlertTitle>
             <AlertDescription>
                 Please log in to view your payout history.
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
            <ReceiptText className="w-7 h-7 text-primary" /> Payout History
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
            <CardTitle>Your Payout Requests</CardTitle>
            <CardDescription>Track the status and details of your cashback withdrawal requests.</CardDescription>
          </CardHeader>
          <CardContent>
            {loading && payouts.length === 0 ? (
                <PayoutHistoryTableSkeleton />
            ) : !loading && payouts.length === 0 && !pageError ? (
              <div className="text-center py-16 text-muted-foreground">
                <p className="mb-4">You haven't requested any payouts yet.</p>
                <Button asChild variant="link" onClick={() => router.push('/dashboard/payout')}>
                  Request a Payout
                </Button>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Requested At</TableHead>
                      <TableHead>Amount</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Method</TableHead>
                      <TableHead>Details</TableHead>
                      <TableHead>Processed At</TableHead>
                      <TableHead>Notes/Reason</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {payouts.map((payout) => (
                      <TableRow key={payout.id}>
                        <TableCell className="whitespace-nowrap">{payout.requestedAt ? format(new Date(payout.requestedAt), 'PPp') : 'N/A'}</TableCell>
                        <TableCell className="font-semibold">{formatCurrency(payout.amount)}</TableCell>
                        <TableCell>
                          <Badge variant={getStatusVariant(payout.status)} className="capitalize flex items-center gap-1 text-xs">
                            {getStatusIcon(payout.status)}
                            {payout.status}
                          </Badge>
                        </TableCell>
                        <TableCell className="capitalize">{payout.paymentMethod.replace('_', ' ')}</TableCell>
                        <TableCell className="text-xs truncate max-w-[150px]" title={payout.paymentDetails.detail}>
                          {maskPaymentDetail(payout.paymentMethod, payout.paymentDetails.detail)}
                        </TableCell>
                        <TableCell className="whitespace-nowrap">
                          {payout.processedAt ? format(new Date(payout.processedAt), 'PPp') : '-'}
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground max-w-[200px] truncate" title={payout.adminNotes || payout.failureReason || undefined}>
                          {payout.status === 'rejected' || payout.status === 'failed' ? payout.failureReason : payout.adminNotes || '-'}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
            {hasMore && !loading && payouts.length > 0 && (
              <div className="mt-6 text-center">
                <Button onClick={handleLoadMore} disabled={loadingMore}>
                  {loadingMore ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                  Load More Payouts
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
