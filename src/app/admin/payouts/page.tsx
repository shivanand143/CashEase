
// src/app/admin/payouts/page.tsx
"use client";

import * as React from 'react';
import {
  collection,
  query,
  orderBy,
  startAfter,
  limit,
  getDocs,
  doc,
  updateDoc,
  serverTimestamp,
  where,
  type QueryConstraint,
  type DocumentData,
  type QueryDocumentSnapshot,
  Timestamp, 
  type FieldValue, 
  runTransaction,
  writeBatch,
  type CollectionReference, 
  type Query as FirestoreQueryType, 
  getDoc, 
  increment,
  type WithFieldValue,        
  type Firestore,
  type Transaction as FirestoreTransactionType,
  QuerySnapshot, // Import QuerySnapshot
} from 'firebase/firestore';
import { db, firebaseInitializationError, auth as firebaseAuthService } from '@/lib/firebase/config';
import type { PayoutRequest, PayoutStatus, UserProfile, Transaction, CashbackStatus, PayoutMethod, Store } from '@/lib/types';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { format } from 'date-fns';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { AlertCircle, Loader2, Search, CheckCircle, XCircle, Hourglass, Send, Info, IndianRupee, ListFilter, User as UserIconLucide } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { formatCurrency } from '@/lib/utils';
import AdminGuard from '@/components/guards/admin-guard';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogClose } from '@/components/ui/dialog';
import { useDebounce } from '@/hooks/use-debounce';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { useAuth } from '@/hooks/use-auth';

const PAYOUTS_PER_PAGE = 15;
const ADMIN_PAYOUTS_LOG_PREFIX = "ADMIN_PAYOUTS_PAGE:";

interface PayoutRequestWithUserDetails extends PayoutRequest {
  userDisplayName?: string | null;
  userEmail?: string | null;
}


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
    case 'approved':
    case 'paid': return <CheckCircle className="h-4 w-4 text-green-600" />;
    case 'pending': return <Hourglass className="h-4 w-4 text-yellow-600" />;
    case 'rejected':
    case 'failed': return <XCircle className="h-4 w-4 text-red-600" />;
    case 'processing': return <Loader2 className="h-4 w-4 animate-spin text-blue-600" />;
    default: return <Info className="h-4 w-4 text-muted-foreground" />;
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
                {Array.from({ length: 9 }).map((_, index) => (
                  <TableHead key={index} className="min-w-[120px]"><Skeleton className="h-5 w-full" /></TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {Array.from({ length: 8 }).map((_, rowIndex) => (
                <TableRow key={rowIndex}>
                  {Array.from({ length: 9 }).map((_, colIndex) => (
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

function AdminPayoutsPageContent() {
  const { user: adminUser, loading: adminAuthLoading } = useAuth();
  const [payouts, setPayouts] = React.useState<PayoutRequestWithUserDetails[]>([]);
  const [pageLoading, setPageLoading] = React.useState(true);
  const [pageError, setPageError] = React.useState<string | null>(null);
  const [lastVisible, setLastVisible] = React.useState<QueryDocumentSnapshot<DocumentData> | null>(null);
  const [hasMore, setHasMore] = React.useState(true);
  const [loadingMore, setLoadingMore] = React.useState(false);
  const { toast } = useToast();

  const [filterStatus, setFilterStatus] = React.useState<PayoutStatus | 'all'>('all');
  const [searchTermInput, setSearchTermInput] = React.useState('');
  const debouncedSearchTerm = useDebounce(searchTermInput, 500);
  const [isSearching, setIsSearching] = React.useState(false);

  const [selectedPayout, setSelectedPayout] = React.useState<PayoutRequestWithUserDetails | null>(null);
  const [updateStatus, setUpdateStatus] = React.useState<PayoutStatus>('pending');
  const [adminNotes, setAdminNotes] = React.useState('');
  const [failureReason, setFailureReason] = React.useState('');
  const [isUpdating, setIsUpdating] = React.useState(false);
  const [isDialogOpen, setIsDialogOpen] = React.useState(false);

  const [userCache, setUserCache] = React.useState<Record<string, Pick<UserProfile, 'displayName' | 'email'>>>({});
  const [storeCache, setStoreCache] = React.useState<Record<string, Pick<Store, 'name'>>>({}); 

  const fetchUserDataForPayouts = React.useCallback(async (payoutRequests: PayoutRequest[]): Promise<PayoutRequestWithUserDetails[]> => {
    if (!db || firebaseInitializationError) {
      setPageError(prev => (prev ? prev + "; " : "") + (firebaseInitializationError || "DB error in fetchUserData."));
      return payoutRequests.map(p => ({ ...p, userDisplayName: p.userId, userEmail: 'N/A (DB Error)' }));
    }
    if (!payoutRequests || payoutRequests.length === 0) return payoutRequests;

    const userIdsToFetch = [...new Set(payoutRequests.map(p => p.userId).filter(uid => uid && !userCache[uid]))];
    if (userIdsToFetch.length === 0) {
      return payoutRequests.map(p => ({
        ...p,
        userDisplayName: userCache[p.userId]?.displayName || p.userId,
        userEmail: userCache[p.userId]?.email || 'N/A',
      }));
    }

    const newUsers: Record<string, Pick<UserProfile, 'displayName' | 'email'>> = {};
    try {
      for (let i = 0; i < userIdsToFetch.length; i += 30) {
        const chunk = userIdsToFetch.slice(i, i + 30);
        if (chunk.length === 0) continue;
        const usersQuery = query(collection(db, 'users'), where('__name__', 'in', chunk));
        const userSnaps = await getDocs(usersQuery);
        userSnaps.forEach(docSnap => {
          const data = docSnap.data();
          newUsers[docSnap.id] = { displayName: data.displayName || null, email: data.email || null };
        });
      }
      setUserCache(prev => ({ ...prev, ...newUsers }));
    } catch (userFetchError) {
      console.error(`${ADMIN_PAYOUTS_LOG_PREFIX} Error fetching user data for payouts:`, userFetchError);
      setPageError(prev => (prev ? prev + "; " : "") + "Error fetching user details for some payouts.");
    }

    return payoutRequests.map(payout => ({
      ...payout,
      userDisplayName: newUsers[payout.userId]?.displayName || userCache[payout.userId]?.displayName || payout.userId,
      userEmail: newUsers[payout.userId]?.email || userCache[payout.userId]?.email || 'N/A',
    }));
  }, [userCache]); 

  const fetchPayouts = React.useCallback(async (
    loadMoreOperation = false,
    docToStartAfter: QueryDocumentSnapshot<DocumentData> | null = null
  ) => {
    if (!db || firebaseInitializationError) {
      setPageError(firebaseInitializationError || "Database connection not available.");
      if(!loadMoreOperation) setPageLoading(false); else setLoadingMore(false);
      setHasMore(false);
      return;
    }
    const firestoreDb = db; 

    if (!loadMoreOperation) {
      setPageLoading(true); setPayouts([]); setLastVisible(null); setHasMore(true); setPageError(null);
    } else {
      if (!docToStartAfter && loadMoreOperation) { setLoadingMore(false); return; }
      setLoadingMore(true);
    }
    setIsSearching(debouncedSearchTerm !== '');

    try {
      const payoutsCollectionRef = collection(firestoreDb, 'payoutRequests');
      const constraints: QueryConstraint[] = [];

      if (filterStatus !== 'all') {
        constraints.push(where('status', '==', filterStatus));
      }
      if (debouncedSearchTerm.trim()) {
        constraints.push(where('userId', '==', debouncedSearchTerm.trim()));
      }

      constraints.push(orderBy('requestedAt', 'desc'));
      if (loadMoreOperation && docToStartAfter) {
        constraints.push(startAfter(docToStartAfter));
      }
      constraints.push(limit(PAYOUTS_PER_PAGE));

      const q = query(payoutsCollectionRef, ...constraints);
      const querySnapshot = await getDocs(q);
      
      const rawPayoutsData = querySnapshot.docs.map(docSnap => {
        const data = docSnap.data();
        return {
            id: docSnap.id,
            ...data,
            requestedAt: data.requestedAt as Timestamp, 
            processedAt: data.processedAt ? data.processedAt as Timestamp : null,
            updatedAt: data.updatedAt ? data.updatedAt as Timestamp : null, 
        } as PayoutRequest;
      });
      const payoutsWithUserData = await fetchUserDataForPayouts(rawPayoutsData);
      
      setPayouts(prev => loadMoreOperation ? [...prev, ...payoutsWithUserData] : payoutsWithUserData);
      setLastVisible(querySnapshot.docs[querySnapshot.docs.length - 1] || null);
      setHasMore(querySnapshot.docs.length === PAYOUTS_PER_PAGE);

    } catch (err) {
      console.error(`${ADMIN_PAYOUTS_LOG_PREFIX} Error fetching payout requests:`, err);
      const errorMsg = err instanceof Error ? err.message : "Failed to fetch payouts";
      setPageError(errorMsg);
      toast({ variant: "destructive", title: "Fetch Error", description: errorMsg });
      setHasMore(false);
    } finally {
      if (!loadMoreOperation) setPageLoading(false); else setLoadingMore(false);
      setIsSearching(false);
    }
  }, [filterStatus, debouncedSearchTerm, toast, fetchUserDataForPayouts]);

  React.useEffect(() => {
    let isMounted = true;
    if (adminAuthLoading) {
      setPageLoading(true);
      return;
    }
    if (!adminUser && !adminAuthLoading) {
      setPageLoading(false); 
      return;
    }
    if(adminUser && isMounted) {
      fetchPayouts(false, null);
    }
    return () => { isMounted = false; };
  }, [adminUser, adminAuthLoading, filterStatus, debouncedSearchTerm, fetchPayouts]);

  const handleSearch = (e: React.FormEvent) => e.preventDefault();

  const handleLoadMore = () => {
    if (!loadingMore && hasMore && lastVisible) {
      fetchPayouts(true, lastVisible);
    }
  };

  const openUpdateDialog = (payout: PayoutRequestWithUserDetails) => {
    setSelectedPayout(payout);
    setUpdateStatus(payout.status);
    setAdminNotes(payout.adminNotes || '');
    setFailureReason(payout.failureReason || '');
    setIsDialogOpen(true);
  };

  const handleUpdatePayout = async () => {
    if (!selectedPayout || !selectedPayout.id) {
      toast({ variant: "destructive", title: "Error", description: "No payout selected." });
      return;
    }
    if (!db || firebaseInitializationError) {
        toast({ variant: "destructive", title: "Database Error", description: firebaseInitializationError || "Database not available." });
        setIsUpdating(false);
        return;
    }
    const firestoreDb = db as Firestore;


    if ((updateStatus === 'rejected' || updateStatus === 'failed') && !failureReason.trim()) {
      toast({ variant: "destructive", title: "Input Required", description: "Reason is required for rejection or failure." });
      return;
    }

    setIsUpdating(true);
    setPageError(null);
    console.log(`${ADMIN_PAYOUTS_LOG_PREFIX} Starting update for payout ID: ${selectedPayout.id}, New Status: ${updateStatus}`);

    const payoutRef = doc(firestoreDb, 'payoutRequests', selectedPayout.id);
    const userRef = doc(firestoreDb, 'users', selectedPayout.userId);
    const originalStatus = selectedPayout.status;
    const newPayoutStatus = updateStatus;
    const payoutAmount = selectedPayout.amount;

    try {
      await runTransaction(firestoreDb, async (firestoreTransaction: FirestoreTransactionType) => {
        console.log(`${ADMIN_PAYOUTS_LOG_PREFIX} Inside Firestore transaction for payout ${selectedPayout.id}.`);
        const payoutDocSnap = await firestoreTransaction.get(payoutRef);
        const userDocSnap = await firestoreTransaction.get(userRef);

        if (!payoutDocSnap.exists()) throw new Error("Payout request document not found.");
        if (!userDocSnap.exists()) throw new Error(`User profile ${selectedPayout.userId} not found.`);

        const currentPayoutData = payoutDocSnap.data() as PayoutRequest;
        
        const payoutUpdateData: Partial<WithFieldValue<PayoutRequest>> = {
            status: newPayoutStatus,
            adminNotes: adminNotes.trim() || null,
            processedAt: serverTimestamp(), 
            failureReason: (newPayoutStatus === 'failed' || newPayoutStatus === 'rejected') ? failureReason.trim() || null : null,
            updatedAt: serverTimestamp(),
        };

        const userProfileUpdates: { [key: string]: any } = { updatedAt: serverTimestamp() };
        let transactionIdsToFinalize: string[] = currentPayoutData.transactionIds || [];

        if (newPayoutStatus === 'paid' && originalStatus !== 'paid') {
            console.log(`${ADMIN_PAYOUTS_LOG_PREFIX} Processing 'paid' status for payout ${selectedPayout.id}.`);
            
            if (!transactionIdsToFinalize || transactionIdsToFinalize.length === 0) {
                console.log(`${ADMIN_PAYOUTS_LOG_PREFIX} No pre-linked Tx IDs. Fetching 'confirmed' transactions for user ${selectedPayout.userId} to cover amount ${payoutAmount}.`);
                
                const transactionsQuery = query(
                    collection(firestoreDb, 'transactions') as CollectionReference<DocumentData>, 
                    where('userId', '==', selectedPayout.userId),
                    where('status', '==', 'confirmed' as CashbackStatus),
                    where('payoutId', '==', null), 
                    orderBy('transactionDate', 'asc')
                );
                
                const confirmedUnpaidSnap = await firestoreTransaction.get(transactionsQuery) as QuerySnapshot<DocumentData>;
                console.log(`${ADMIN_PAYOUTS_LOG_PREFIX} Found ${confirmedUnpaidSnap.size} confirmed, unpaid transactions.`);
                
                let sumOfSelectedTxs = 0;
                const collectedTxIds: string[] = [];

                for (const txDocSnap of confirmedUnpaidSnap.docs) { 
                    const txData = txDocSnap.data() as Transaction; 
                    const txCashbackAmount = txData.finalCashbackAmount ?? txData.initialCashbackAmount ?? 0;
                    if (txCashbackAmount > 0 && (sumOfSelectedTxs + txCashbackAmount) <= payoutAmount) {
                        sumOfSelectedTxs += txCashbackAmount;
                        collectedTxIds.push(txDocSnap.id);
                    }
                    if (sumOfSelectedTxs >= payoutAmount) break;
                }
                
                sumOfSelectedTxs = parseFloat(sumOfSelectedTxs.toFixed(2));
                if (Math.abs(sumOfSelectedTxs - payoutAmount) > 0.01 && collectedTxIds.length === 0 && payoutAmount > 0) {
                    console.warn(`${ADMIN_PAYOUTS_LOG_PREFIX} Could not find exact match or any transactions for payout amount ${payoutAmount} for payout ${selectedPayout.id}. Sum: ${sumOfSelectedTxs}. This might lead to issues.`);
                    throw new Error(`Could not gather enough confirmed transactions to match payout amount of ${formatCurrency(payoutAmount)}. Found ${formatCurrency(sumOfSelectedTxs)}.`);
                } else {
                    console.log(`${ADMIN_PAYOUTS_LOG_PREFIX} Matched ${collectedTxIds.length} transactions summing to ₹${sumOfSelectedTxs.toFixed(2)} for payout amount ₹${payoutAmount.toFixed(2)}.`);
                }
                payoutUpdateData.transactionIds = collectedTxIds; 
                transactionIdsToFinalize = collectedTxIds; 
            }
        } else if ((newPayoutStatus === 'rejected' || newPayoutStatus === 'failed') && 
                   (originalStatus === 'pending' || originalStatus === 'approved' || originalStatus === 'processing' || originalStatus === 'awaiting_payout')) {
            console.log(`${ADMIN_PAYOUTS_LOG_PREFIX} Payout ${selectedPayout.id} is ${newPayoutStatus}. Refunding amount ${payoutAmount} to user ${userDocSnap.id}.`);
            userProfileUpdates.cashbackBalance = increment(payoutAmount); 
            payoutUpdateData.transactionIds = []; 
            transactionIdsToFinalize = []; 
        }

        firestoreTransaction.update(payoutRef, payoutUpdateData);
        if (Object.keys(userProfileUpdates).length > 1 || (userProfileUpdates.cashbackBalance !== undefined)) { 
          firestoreTransaction.update(userRef, userProfileUpdates);
        }
      }); 
      
      const postTransactionBatch = writeBatch(firestoreDb);
      let batchHasUpdates = false;

      if (newPayoutStatus === 'paid' && transactionIdsToFinalize.length > 0) {
        console.log(`${ADMIN_PAYOUTS_LOG_PREFIX} Batch updating ${transactionIdsToFinalize.length} transactions to 'paid' status.`);
        for (const txId of transactionIdsToFinalize) {
          const txRef = doc(firestoreDb, 'transactions', txId);
          postTransactionBatch.update(txRef, {
            status: 'paid' as CashbackStatus,
            payoutId: selectedPayout.id, 
            paidDate: serverTimestamp(),
            updatedAt: serverTimestamp()
          });
          batchHasUpdates = true;
        }
      } else if ((newPayoutStatus === 'rejected' || newPayoutStatus === 'failed') && 
                 (originalStatus === 'awaiting_payout' || originalStatus === 'approved' || originalStatus === 'processing' || originalStatus === 'paid') && 
                 (currentPayoutData.transactionIds && currentPayoutData.transactionIds.length > 0)) {
         console.log(`${ADMIN_PAYOUTS_LOG_PREFIX} Batch reverting ${currentPayoutData.transactionIds.length} transactions from status indicating payout link to 'confirmed'.`);
         for (const txId of currentPayoutData.transactionIds) {
            const txRef = doc(firestoreDb, 'transactions', txId);
            postTransactionBatch.update(txRef, {
                status: 'confirmed' as CashbackStatus,
                payoutId: null, 
                paidDate: null, 
                updatedAt: serverTimestamp()
            });
            batchHasUpdates = true;
         }
      }
      
      if (batchHasUpdates) {
        await postTransactionBatch.commit();
        console.log(`${ADMIN_PAYOUTS_LOG_PREFIX} Post-transaction batch update of transactions complete.`);
      }
      
      setPayouts(prev =>
          prev.map(p =>
          p.id === selectedPayout!.id 
              ? {
              ...p,
              status: newPayoutStatus,
              adminNotes: adminNotes.trim() || null,
              failureReason: (newPayoutStatus === 'failed' || newPayoutStatus === 'rejected') ? failureReason.trim() || null : null,
              processedAt: Timestamp.now(), 
              transactionIds: transactionIdsToFinalize, 
              updatedAt: Timestamp.now(),
              }
              : p
          )
      );
      toast({ title: "Payout Updated", description: `Status set to ${newPayoutStatus}.` });
      setIsDialogOpen(false);
      setSelectedPayout(null);
    } catch (err) {
      console.error(`${ADMIN_PAYOUTS_LOG_PREFIX} Error updating payout request:`, err);
      const errorMsg = err instanceof Error ? err.message : "Failed to update payout.";
      setPageError(errorMsg);
      toast({ variant: "destructive", title: "Update Failed", description: errorMsg });
    } finally {
      setIsUpdating(false);
    }
  };

  if (adminAuthLoading || (pageLoading && payouts.length === 0 && !pageError)) {
    return <AdminGuard><PayoutHistoryTableSkeleton /></AdminGuard>;
  }

  return (
    <AdminGuard>
    <div className="space-y-6">
      <h1 className="text-2xl sm:text-3xl font-bold flex items-center gap-2"><Send className="w-7 h-7 text-primary"/>Payout Requests</h1>

      {pageError && (
        <Alert variant="destructive" className="mt-4">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Error</AlertTitle>
          <AlertDescription>{pageError}</AlertDescription>
        </Alert>
      )}

       <Card>
        <CardHeader>
          <CardTitle>Filter & Search Payouts</CardTitle>
          <CardDescription>Filter by status or search by User ID.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col sm:flex-row gap-4 items-end">
            <div className="w-full sm:w-auto flex-shrink-0">
                <Label htmlFor="filter-status-payouts" className="sr-only">Filter by Status</Label>
                <Select value={filterStatus} onValueChange={(value) => setFilterStatus(value as PayoutStatus | 'all')}>
                <SelectTrigger id="filter-status-payouts" className="h-10"><SelectValue placeholder="Filter by Status" /></SelectTrigger>
                <SelectContent>
                    <SelectItem value="all">All Statuses</SelectItem>
                    <SelectItem value="pending">Pending</SelectItem>
                    <SelectItem value="approved">Approved</SelectItem>
                    <SelectItem value="processing">Processing</SelectItem>
                    <SelectItem value="paid">Paid</SelectItem>
                    <SelectItem value="rejected">Rejected</SelectItem>
                    <SelectItem value="failed">Failed</SelectItem>
                </SelectContent>
                </Select>
            </div>
            <form onSubmit={handleSearch} className="flex-1 flex gap-2 w-full sm:w-auto mt-4 sm:mt-0">
                <Label htmlFor="search-user-payouts" className="sr-only">Search by User ID</Label>
                <Input
                id="search-user-payouts"
                type="search"
                placeholder="Search by User ID..."
                value={searchTermInput}
                onChange={(e) => setSearchTermInput(e.target.value)}
                disabled={isSearching || pageLoading}
                className="h-10"
                />
                <Button type="submit" disabled={isSearching || pageLoading} className="h-10">
                {isSearching || (pageLoading && debouncedSearchTerm) ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
                <span className="sr-only sm:not-sr-only sm:ml-2">Search</span>
                </Button>
            </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Payout Requests List</CardTitle>
          <CardDescription>Review and process user payout requests.</CardDescription>
        </CardHeader>
        <CardContent>
           {pageLoading && payouts.length === 0 && !pageError ? (
             <PayoutHistoryTableSkeleton />
           ) : !pageLoading && payouts.length === 0 && !pageError ? (
             <p className="text-center text-muted-foreground py-8">
                {debouncedSearchTerm || filterStatus !== 'all' ? 'No payout requests found matching your criteria.' : 'No payout requests found.'}
             </p>
           ) : (
             <div className="overflow-x-auto w-full">
                <Table className="min-w-[1200px]">
                <TableHeader>
                    <TableRow>
                    <TableHead className="min-w-[180px]">User</TableHead>
                    <TableHead className="min-w-[100px] text-right">Amount</TableHead>
                    <TableHead className="min-w-[120px]">Method</TableHead>
                    <TableHead className="min-w-[180px]">Details</TableHead>
                    <TableHead className="min-w-[180px]">Requested At</TableHead>
                    <TableHead className="min-w-[120px]">Status</TableHead>
                    <TableHead className="min-w-[180px]">Processed At</TableHead>
                    <TableHead className="min-w-[200px]">Admin Notes/Reason</TableHead>
                    <TableHead className="text-right min-w-[100px]">Actions</TableHead>
                    </TableRow>
                </TableHeader>
                <TableBody>
                    {payouts.map((payout) => {
                        const requestedAtDate = payout.requestedAt instanceof Timestamp ? payout.requestedAt.toDate() : null;
                        const processedAtDate = payout.processedAt instanceof Timestamp ? payout.processedAt.toDate() : null;
                        return (
                            <TableRow key={payout.id}>
                                <TableCell>
                                  <TooltipProvider>
                                    <Tooltip>
                                      <TooltipTrigger asChild>
                                          <div className="font-medium truncate max-w-[150px]" title={payout.userDisplayName || payout.userId}>
                                              {payout.userDisplayName || payout.userId}
                                          </div>
                                      </TooltipTrigger>
                                      <TooltipContent>
                                        <p>UID: {payout.userId}</p>
                                        {payout.userEmail && <p>Email: {payout.userEmail}</p>}
                                      </TooltipContent>
                                    </Tooltip>
                                  </TooltipProvider>
                                  <div className="text-xs text-muted-foreground truncate max-w-[150px]" title={payout.userEmail || undefined}>{payout.userEmail || 'N/A'}</div>
                                </TableCell>
                                <TableCell className="font-semibold text-right">{formatCurrency(payout.amount)}</TableCell>
                                <TableCell className="capitalize">{payout.paymentMethod.replace('_', ' ')}</TableCell>
                                <TableCell className="text-xs">
                                   <TooltipProvider>
                                    <Tooltip>
                                        <TooltipTrigger asChild>
                                            <span className="truncate block max-w-[150px] cursor-default">{payout.paymentDetails.detail}</span>
                                        </TooltipTrigger>
                                        <TooltipContent><p className="max-w-xs break-words">{payout.paymentDetails.detail}</p></TooltipContent>
                                    </Tooltip>
                                   </TooltipProvider>
                                </TableCell>
                                <TableCell className="whitespace-nowrap">{requestedAtDate ? format(requestedAtDate, 'PPp') : 'N/A'}</TableCell>
                                <TableCell>
                                <Badge variant={getStatusVariant(payout.status)} className="flex items-center gap-1 w-fit text-xs whitespace-nowrap">
                                    {getStatusIcon(payout.status)}
                                    {payout.status.replace('_',' ')}
                                </Badge>
                                </TableCell>
                                <TableCell className="whitespace-nowrap">
                                    {processedAtDate ? format(processedAtDate, 'PPp') : '-'}
                                </TableCell>
                                 <TableCell className="text-xs text-muted-foreground truncate max-w-[200px]">
                                    <TooltipProvider>
                                       <Tooltip>
                                         <TooltipTrigger asChild>
                                           <span className="cursor-default">{payout.failureReason || payout.adminNotes || '-'}</span>
                                         </TooltipTrigger>
                                         <TooltipContent><p className="max-w-xs break-words">{payout.failureReason ? `Reason: ${payout.failureReason}` : payout.adminNotes || 'No notes'}</p></TooltipContent>
                                       </Tooltip>
                                    </TooltipProvider>
                                 </TableCell>
                                <TableCell className="text-right">
                                    <Button size="sm" variant="outline" onClick={() => openUpdateDialog(payout)}>
                                        Manage
                                    </Button>
                                </TableCell>
                            </TableRow>
                        );
                    })}
                </TableBody>
                </Table>
             </div>
          )}
           {hasMore && !pageLoading && payouts.length > 0 && (
            <div className="mt-6 text-center">
              <Button onClick={handleLoadMore} disabled={loadingMore}>
                {loadingMore ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                Load More
              </Button>
            </div>
          )}
           {loadingMore && <div className="text-center py-4"><Loader2 className="h-6 w-6 animate-spin text-primary mx-auto" /></div>}
        </CardContent>
      </Card>

       <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
         <DialogContent className="sm:max-w-lg">
           <DialogHeader>
             <DialogTitle>Manage Payout Request</DialogTitle>
             <DialogDescription>
               User: {selectedPayout?.userDisplayName || selectedPayout?.userId} ({formatCurrency(selectedPayout?.amount || 0)})
             </DialogDescription>
           </DialogHeader>
           <div className="grid gap-4 py-4">
             <div>
                <Label htmlFor="payout-status-dialog" className="text-sm font-medium mb-1 block">Status</Label>
                <Select value={updateStatus} onValueChange={(value) => setUpdateStatus(value as PayoutStatus)} disabled={isUpdating}>
                  <SelectTrigger id="payout-status-dialog">
                    <SelectValue placeholder="Select Status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="pending">Pending</SelectItem>
                    <SelectItem value="approved">Approved (Ready for Bank Txn)</SelectItem>
                    <SelectItem value="processing">Processing Payment (Bank Txn Initiated)</SelectItem>
                    <SelectItem value="paid">Paid (Payment Confirmed & Transactions Updated)</SelectItem>
                    <SelectItem value="rejected">Rejected (Refund Balance to User)</SelectItem>
                    <SelectItem value="failed">Failed (Investigate, May Refund Balance)</SelectItem>
                  </SelectContent>
                </Select>
             </div>
             <div>
                <Label htmlFor="admin-notes-dialog" className="text-sm font-medium mb-1 block">Admin Notes</Label>
                <Textarea
                    id="admin-notes-dialog"
                    value={adminNotes}
                    onChange={(e) => setAdminNotes(e.target.value)}
                    placeholder="Optional notes (e.g., payment transaction ID, reason for rejection)"
                    disabled={isUpdating}
                    rows={2}
                />
             </div>
             {(updateStatus === 'failed' || updateStatus === 'rejected') && (
                 <div>
                     <Label htmlFor="failure-reason-dialog" className="text-sm font-medium mb-1 block">
                        {updateStatus === 'failed' ? 'Failure Reason*' : 'Rejection Reason*'}
                     </Label>
                     <Textarea
                         id="failure-reason-dialog"
                         value={failureReason}
                         onChange={(e) => setFailureReason(e.target.value)}
                         placeholder={updateStatus === 'failed' ? "Reason for payout failure" : "Reason for rejecting payout"}
                         disabled={isUpdating}
                         required 
                         rows={2}
                     />
                 </div>
             )}
           </div>
           <DialogFooter className="flex-col sm:flex-row sm:justify-end gap-2 mt-2">
             <DialogClose asChild>
               <Button type="button" variant="outline" disabled={isUpdating} className="w-full sm:w-auto">
                 Cancel
               </Button>
             </DialogClose>
             <Button type="button" onClick={handleUpdatePayout} disabled={isUpdating || ((updateStatus === 'rejected' || updateStatus === 'failed') && !failureReason.trim())} className="w-full sm:w-auto">
               {isUpdating ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
               Save Changes
             </Button>
           </DialogFooter>
         </DialogContent>
       </Dialog>
    </div>
    </AdminGuard>
  );
}

export default function AdminPayoutsPage() {
    return <AdminPayoutsPageContent />;
}

    
