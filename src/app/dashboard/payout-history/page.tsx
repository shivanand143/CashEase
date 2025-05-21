// src/app/dashboard/payout-history/page.tsx
"use client";

import * as React from 'react';
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
import type { PayoutRequest, PayoutStatus, PayoutMethod } from '@/lib/types';
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
import { AlertCircle, History, Loader2, Info, ReceiptText, CheckCircle, XCircle, Hourglass, Eye } from 'lucide-react';
import ProtectedRoute from '@/components/guards/protected-route';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogClose } from "@/components/ui/dialog";


const PAYOUTS_PER_PAGE = 15;

const getStatusVariant = (status: PayoutStatus): "default" | "secondary" | "destructive" | "outline" => {
  switch (status) {
    case 'approved': return 'default';
    case 'paid': return 'default'; 
    case 'processing': return 'secondary'; 
    case 'pending': return 'outline';
    case 'rejected':
    case 'failed': return 'destructive';
    default: return 'outline';
  }
};

const getStatusIcon = (status: PayoutStatus) => {
  switch (status) {
    case 'approved': return <CheckCircle className="h-3 w-3 text-green-600" />;
    case 'paid': return <CheckCircle className="h-3 w-3 text-green-700" />;
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
        <div className="overflow-x-auto w-full">
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
  const [payouts, setPayouts] = React.useState<PayoutRequest[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [pageError, setPageError] = React.useState<string | null>(null);
  const [lastVisible, setLastVisible] = React.useState<QueryDocumentSnapshot<DocumentData> | null>(null);
  const [hasMore, setHasMore] = React.useState(true);
  const [loadingMore, setLoadingMore] = React.useState(false);
  const isMountedRef = React.useRef(true);

  const [isFullTextDialogOpen, setIsFullTextDialogOpen] = React.useState(false);
  const [fullTextContent, setFullTextContent] = React.useState<{ title: string; content: string | null | undefined }>({ title: '', content: '' });

  const showFullText = (title: string, content: string | null | undefined) => {
    setFullTextContent({ title, content: content || "No details available." });
    setIsFullTextDialogOpen(true);
  };

  const fetchPayouts = React.useCallback(async (isLoadMoreOp: boolean = false, docToStartAfter: QueryDocumentSnapshot<DocumentData> | null = null) => {
    if (!user || !isMountedRef.current) return;

    if (firebaseInitializationError || !db) {
      setPageError(firebaseInitializationError || "Database not available.");
      if (!isLoadMoreOp) setLoading(false); else setLoadingMore(false);
      setHasMore(false);
      return;
    }

    if (!isLoadMoreOp) {
      setLoading(true);
      setPayouts([]);
      setLastVisible(null);
      setHasMore(true);
      setPageError(null);
    } else {
      if (!docToStartAfter) { setLoadingMore(false); return; }
      setLoadingMore(true);
    }

    try {
      const payoutsCollection = collection(db, 'payoutRequests');
      const qConstraints = [
        where('userId', '==', user.uid),
        orderBy('requestedAt', 'desc'),
        limit(PAYOUTS_PER_PAGE)
      ];
      if (isLoadMoreOp && docToStartAfter) {
        qConstraints.push(startAfter(docToStartAfter));
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

      if (isMountedRef.current) {
        setPayouts(prev => isLoadMoreOp ? [...prev, ...newPayoutsData] : newPayoutsData);
        setLastVisible(querySnapshot.docs[querySnapshot.docs.length - 1] || null);
        setHasMore(newPayoutsData.length === PAYOUTS_PER_PAGE);
      }
    } catch (err) {
      if (isMountedRef.current) {
        const errorMsg = err instanceof Error ? err.message : "Failed to load payout history.";
        setPageError(errorMsg);
      }
    } finally {
      if (isMountedRef.current) {
        if (!isLoadMoreOp) setLoading(false); else setLoadingMore(false);
      }
    }
  }, [user]);

  React.useEffect(() => {
    isMountedRef.current = true;
    if (authLoading) {
      setLoading(true);
      return;
    }
    if (!user) {
      setLoading(false);
      router.push('/login?message=Please login to view your payout history.');
    } else {
      fetchPayouts(false, null);
    }
    return () => { isMountedRef.current = false; };
  }, [user, authLoading, router, fetchPayouts]);

  const handleLoadMore = () => {
    if (user && !loadingMore && hasMore && lastVisible) {
      fetchPayouts(true, lastVisible);
    }
  };

  const maskPaymentDetail = (method: PayoutMethod, detail: string): string => {
    if (!detail) return 'N/A';
    if (method === 'bank_transfer') {
        if (detail.toLowerCase().includes('@') && detail.toLowerCase().includes('upi')) return `UPI: ****${detail.slice(-4)}`;
        const parts = detail.split(/[\s,-]+/); // Split by space, comma, or hyphen
        const lastMeaningfulPart = parts.reverse().find(part => part.length >= 4 && !isNaN(Number(part.slice(-4))));
        if (lastMeaningfulPart) return `A/C: ****${lastMeaningfulPart.slice(-Math.min(4, lastMeaningfulPart.length))}`;
        return `Bank: ****${detail.slice(-Math.min(4, detail.length))}`;
    } else if (method === 'paypal') {
      const parts = detail.split('@');
      if (parts.length === 2) return `${parts[0].substring(0, Math.min(3, parts[0].length))}****@${parts[1]}`;
      return 'PayPal: ****@****';
    } else if (method === 'gift_card') {
      const emailMatch = detail.match(/([a-zA-Z0-9._-]+@[a-zA-Z0-9._-]+\.[a-zA-Z0-9_-]+)/gi);
      const cardTypeMatch = detail.toLowerCase().match(/(amazon|flipkart|myntra)/);
      let maskedDetail = cardTypeMatch ? cardTypeMatch[0].charAt(0).toUpperCase() + cardTypeMatch[0].slice(1) + " GC" : "Gift Card";
      if (emailMatch && emailMatch[0]) maskedDetail += ` to ...${emailMatch[0].slice(-Math.min(10, emailMatch[0].length))}`;
      return maskedDetail;
    }
    return detail.length > 10 ? `${detail.substring(0,7)}...` : detail;
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
        <h1 className="text-2xl sm:text-3xl font-bold flex items-center gap-2">
            <ReceiptText className="w-6 h-6 sm:w-7 sm:h-7 text-primary" /> Payout History
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
            ): !loading && payouts.length === 0 && !pageError ? (
              <div className="text-center py-16 text-muted-foreground">
                <Info className="w-12 h-12 mx-auto text-muted-foreground/50 mb-4" />
                <p className="text-lg mb-2">No payout requests found.</p>
                <p className="text-sm">Once you request a payout, it will appear here.</p>
                <Button asChild variant="link" onClick={() => router.push('/dashboard/payout')} className="mt-4">
                  Request a Payout
                </Button>
              </div>
            ) : (
              <div className="overflow-x-auto w-full">
                <Table className="min-w-[900px]">
                  <TableHeader>
                    <TableRow>
                      <TableHead className="min-w-[180px]">Requested At</TableHead>
                      <TableHead className="min-w-[100px]">Amount</TableHead>
                      <TableHead className="min-w-[120px]">Status</TableHead>
                      <TableHead className="min-w-[120px]">Method</TableHead>
                      <TableHead className="min-w-[180px]">Details</TableHead>
                      <TableHead className="min-w-[180px]">Processed At</TableHead>
                      <TableHead className="min-w-[200px]">Notes/Reason</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {payouts.map((payout) => (
                      <TableRow key={payout.id}>
                        <TableCell className="whitespace-nowrap">{payout.requestedAt ? format(new Date(payout.requestedAt), 'PPp') : 'N/A'}</TableCell>
                        <TableCell className="font-semibold">{formatCurrency(payout.amount)}</TableCell>
                        <TableCell>
                          <Badge variant={getStatusVariant(payout.status)} className="capitalize flex items-center gap-1 text-xs whitespace-nowrap">
                            {getStatusIcon(payout.status)}
                            {payout.status.replace('_', ' ')}
                          </Badge>
                        </TableCell>
                        <TableCell className="capitalize">{payout.paymentMethod.replace('_', ' ')}</TableCell>
                        <TableCell className="text-xs">
                          <TooltipProvider>
                           <Tooltip>
                             <TooltipTrigger asChild>
                                <span 
                                  className="truncate block max-w-[150px] cursor-pointer hover:text-primary"
                                  onClick={() => showFullText("Payment Details", payout.paymentDetails.detail)}
                                >
                                  {maskPaymentDetail(payout.paymentMethod, payout.paymentDetails.detail)}
                                </span>
                              </TooltipTrigger>
                             <TooltipContent><p>{payout.paymentDetails.detail}</p></TooltipContent>
                           </Tooltip>
                           </TooltipProvider>
                        </TableCell>
                        <TableCell className="whitespace-nowrap">
                          {payout.processedAt ? format(new Date(payout.processedAt), 'PPp') : '-'}
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                           <span 
                              className="truncate block max-w-[200px] cursor-pointer hover:text-primary"
                              onClick={() => showFullText(payout.failureReason ? "Rejection/Failure Reason" : "Admin Notes", payout.failureReason || payout.adminNotes)}
                           >
                             {(payout.failureReason || payout.adminNotes || '-').substring(0,30) }
                             {(payout.failureReason && payout.failureReason.length > 30) || (payout.adminNotes && payout.adminNotes.length > 30) ? '...' : ''}
                           </span>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}

            {hasMore && !loading && payouts.length > 0 && (
              <div className="mt-6 text-center">
                <Button onClick={handleLoadMore} disabled={loadingMore || loading}>
                  {loadingMore ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                  Load More Payouts
                </Button>
              </div>
            )}
            {loadingMore && <div className="text-center py-4"><Loader2 className="h-6 w-6 animate-spin text-primary mx-auto" /></div>}
          </CardContent>
        </Card>
      </div>
      <Dialog open={isFullTextDialogOpen} onOpenChange={setIsFullTextDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{fullTextContent.title}</DialogTitle>
          </DialogHeader>
          <div className="py-4 max-h-[60vh] overflow-y-auto">
            <p className="text-sm text-muted-foreground whitespace-pre-wrap break-all">{fullTextContent.content}</p>
          </div>
          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="outline">Close</Button>
            </DialogClose>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </ProtectedRoute>
  );
}
