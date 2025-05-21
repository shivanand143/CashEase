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
import { AlertCircle, History, Loader2, Info, CheckCircle, XCircle, Eye } from 'lucide-react';
import ProtectedRoute from '@/components/guards/protected-route';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogClose } from "@/components/ui/dialog";

const TRANSACTIONS_PER_PAGE = 15;

function HistoryTableSkeleton() {
  return (
    <Card>
      <CardHeader>
        <Skeleton className="h-6 w-1/3 mb-2" />
        <Skeleton className="h-4 w-2/3" />
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
    case 'paid': return <History className="h-3 w-3 text-green-700" />; // Changed for Paid to History
    case 'pending': return <Loader2 className="h-3 w-3 animate-spin text-yellow-600" />;
    case 'awaiting_payout': return <History className="h-3 w-3 text-purple-600" />; // Changed for Awaiting to History
    case 'rejected':
    case 'cancelled': return <XCircle className="h-3 w-3 text-red-600" />;
    default: return <Info className="h-3 w-3 text-muted-foreground" />;
  }
};

export default function CashbackHistoryPage() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();
  const [transactions, setTransactions] = React.useState<Transaction[]>([]);
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

  const fetchTransactions = React.useCallback(async (isLoadMoreOp: boolean = false, docToStartAfter: QueryDocumentSnapshot<DocumentData> | null = null) => {
    if (!user || !isMountedRef.current) return;

    if (firebaseInitializationError || !db) {
      setPageError(firebaseInitializationError || "Database not available.");
      if (!isLoadMoreOp) setLoading(false); else setLoadingMore(false);
      setHasMore(false);
      return;
    }

    if (!isLoadMoreOp) {
      setLoading(true);
      setTransactions([]);
      setLastVisible(null);
      setHasMore(true);
      setPageError(null);
    } else {
      if (!docToStartAfter) { setLoadingMore(false); return; }
      setLoadingMore(true);
    }

    try {
      const transactionsCollection = collection(db, 'transactions');
      const qConstraints = [
        where('userId', '==', user.uid),
        orderBy('transactionDate', 'desc'),
        limit(TRANSACTIONS_PER_PAGE)
      ];
      if (isLoadMoreOp && docToStartAfter) {
        qConstraints.push(startAfter(docToStartAfter));
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

      if (isMountedRef.current) {
        setTransactions(prev => isLoadMoreOp ? [...prev, ...newTransactionsData] : newTransactionsData);
        setLastVisible(querySnapshot.docs[querySnapshot.docs.length - 1] || null);
        setHasMore(newTransactionsData.length === TRANSACTIONS_PER_PAGE);
      }
    } catch (err) {
      if (isMountedRef.current) {
        const errorMsg = err instanceof Error ? err.message : "Failed to load transaction history.";
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
      router.push('/login?message=Please login to view your history.');
    } else {
      fetchTransactions(false, null);
    }
    return () => { isMountedRef.current = false; };
  }, [user, authLoading, router, fetchTransactions]);

  const handleLoadMore = () => {
    if (user && !loadingMore && hasMore && lastVisible) {
      fetchTransactions(true, lastVisible);
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
              <div className="overflow-x-auto w-full">
                <Table className="min-w-[800px]">
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
                          <TooltipProvider>
                            <Tooltip>
                              <TooltipTrigger asChild><span className="truncate block max-w-[150px]">{transaction.storeName || transaction.storeId}</span></TooltipTrigger>
                              <TooltipContent><p>{transaction.storeName || transaction.storeId}</p></TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
                        </TableCell>
                        <TableCell className="font-mono text-xs">
                          <TooltipProvider>
                            <Tooltip>
                              <TooltipTrigger asChild><span className="truncate block max-w-[120px]">{transaction.orderId || 'N/A'}</span></TooltipTrigger>
                              <TooltipContent><p>{transaction.orderId || 'N/A'}</p></TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
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
                          {(transaction.notesToUser && transaction.notesToUser.length > 50) || (transaction.rejectionReason && transaction.rejectionReason.length > 50) ? (
                            <span 
                              className="truncate block max-w-[200px] cursor-pointer hover:text-primary"
                              onClick={() => showFullText(transaction.rejectionReason ? "Rejection Reason" : "Notes", transaction.rejectionReason || transaction.notesToUser)}
                            >
                              {transaction.rejectionReason ? transaction.rejectionReason.substring(0, 50) : transaction.notesToUser!.substring(0, 50)}... 
                              <Eye className="inline h-3 w-3 ml-1 opacity-70" />
                            </span>
                          ) : (
                            transaction.rejectionReason || transaction.notesToUser || '-'
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
            {hasMore && !loading && transactions.length > 0 && (
              <div className="mt-6 text-center">
                <Button onClick={handleLoadMore} disabled={loadingMore || loading}>
                  {loadingMore ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                  Load More Transactions
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
            <p className="text-sm text-muted-foreground whitespace-pre-wrap">{fullTextContent.content}</p>
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
