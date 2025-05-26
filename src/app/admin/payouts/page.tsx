
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
  QueryConstraint,
  DocumentData,
  QueryDocumentSnapshot,
  Timestamp,
  runTransaction,
  getDoc,
  writeBatch,
  increment,
  FieldValue // Import FieldValue
} from 'firebase/firestore';
import { db, firebaseInitializationError } from '@/lib/firebase/config';
import type { PayoutRequest, PayoutStatus, UserProfile, Transaction, CashbackStatus } from '@/lib/types';
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
import { AlertCircle, Loader2, Search, CheckCircle, XCircle, Hourglass, Send, Info, IndianRupee } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { formatCurrency, safeToDate } from '@/lib/utils';
import AdminGuard from '@/components/guards/admin-guard';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogClose } from '@/components/ui/dialog';
import { useDebounce } from '@/hooks/use-debounce';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';


const PAYOUTS_PER_PAGE = 15;
const ADMIN_PAYOUTS_LOG_PREFIX = "ADMIN_PAYOUTS_PAGE:";

interface PayoutRequestWithUser extends PayoutRequest {
  userDisplayName?: string;
  userEmail?: string;
}

const getStatusVariant = (status: PayoutStatus): "default" | "secondary" | "destructive" | "outline" => {
  switch (status) {
    case 'approved': return 'default'; // Using default for approved for better visibility
    case 'paid': return 'default'; // Using default (often green-ish) for paid
    case 'processing': return 'secondary'; // Secondary might be a muted blue/grey
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

function AdminPayoutsPageSkeleton() {
   return (
    <Card>
      <CardHeader>
         <Skeleton className="h-6 w-1/4 mb-2"/>
         <Skeleton className="h-4 w-1/2"/>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto w-full">
        <Table>
          <TableHeader>
            <TableRow>
              {Array.from({ length: 8 }).map((_, index) => (
                <TableHead key={index}  className="min-w-[120px]"><Skeleton className="h-5 w-full" /></TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {Array.from({ length: 10 }).map((_, rowIndex) => (
              <TableRow key={rowIndex}>
                {Array.from({ length: 8 }).map((_, colIndex) => (
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
  const [payouts, setPayouts] = React.useState<PayoutRequestWithUser[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [pageError, setPageError] = React.useState<string | null>(null);
  const [lastVisible, setLastVisible] = React.useState<QueryDocumentSnapshot<DocumentData> | null>(null);
  const [hasMore, setHasMore] = React.useState(true);
  const [loadingMore, setLoadingMore] = React.useState(false);
  const { toast } = useToast();

  const [filterStatus, setFilterStatus] = React.useState<PayoutStatus | 'all'>('all');
  const [searchTermInput, setSearchTermInput] = React.useState('');
  const debouncedSearchTerm = useDebounce(searchTermInput, 500);
  const [isSearching, setIsSearching] = React.useState(false);

  const [selectedPayout, setSelectedPayout] = React.useState<PayoutRequestWithUser | null>(null);
  const [updateStatus, setUpdateStatus] = React.useState<PayoutStatus>('pending');
  const [adminNotes, setAdminNotes] = React.useState('');
  const [failureReason, setFailureReason] = React.useState('');
  const [isUpdating, setIsUpdating] = React.useState(false);
  const [isDialogOpen, setIsDialogOpen] = React.useState(false);

  const [userCache, setUserCache] = React.useState<Record<string, Pick<UserProfile, 'displayName' | 'email'>>>({});

  const fetchUserDataForPayouts = React.useCallback(async (payoutRequests: PayoutRequest[]): Promise<PayoutRequestWithUser[]> => {
    console.log(`${ADMIN_PAYOUTS_LOG_PREFIX} fetchUserDataForPayouts called for ${payoutRequests.length} payouts.`);
    if (!payoutRequests || payoutRequests.length === 0) return payoutRequests;
    if (!db || firebaseInitializationError) {
        console.error(`${ADMIN_PAYOUTS_LOG_PREFIX} Firestore not available for fetching user data.`);
        setPageError(prev => (prev ? prev + "; " : "") + (firebaseInitializationError || "DB error in fetchUserData."));
        return payoutRequests.map(p => ({ ...p, userDisplayName: p.userId, userEmail: 'N/A (DB Error)' }));
    }

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
        // Firestore 'in' query limit is 30
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
    console.log(`${ADMIN_PAYOUTS_LOG_PREFIX} Fetching payouts. LoadMore: ${loadMoreOperation}, Status: ${filterStatus}, Term: '${debouncedSearchTerm}'`);
    
    if (!db || firebaseInitializationError) {
      setPageError(firebaseInitializationError || "Database connection not available.");
      if(!loadMoreOperation) setLoading(false); else setLoadingMore(false);
      setHasMore(false);
      return;
    }

    if (!loadMoreOperation) {
      setLoading(true); setPayouts([]); setLastVisible(null); setHasMore(true);
    } else {
      if (!docToStartAfter && loadMoreOperation) { setLoadingMore(false); return; }
      setLoadingMore(true);
    }
    if(!loadMoreOperation) setPageError(null);
    setIsSearching(debouncedSearchTerm !== '');

    try {
      const payoutsCollection = collection(db, 'payoutRequests');
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

      const q = query(payoutsCollection, ...constraints);
      const querySnapshot = await getDocs(q);
      
      const rawPayoutsData = querySnapshot.docs.map(docSnap => ({
        id: docSnap.id,
        ...docSnap.data(),
        requestedAt: safeToDate(docSnap.data().requestedAt as Timestamp | undefined) || new Date(0),
        processedAt: safeToDate(docSnap.data().processedAt as Timestamp | undefined),
      } as PayoutRequest));

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
      if (!loadMoreOperation) setLoading(false); else setLoadingMore(false);
      setIsSearching(false);
    }
  }, [filterStatus, debouncedSearchTerm, toast, fetchUserDataForPayouts]);

  React.useEffect(() => {
    fetchPayouts(false, null);
  }, [filterStatus, debouncedSearchTerm, fetchPayouts]);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
     // fetchPayouts is called by useEffect due to debouncedSearchTerm change
  };

  const handleLoadMore = () => {
    if (!loadingMore && hasMore && lastVisible) {
      fetchPayouts(true, lastVisible);
    }
  };

  const openUpdateDialog = (payout: PayoutRequestWithUser) => {
    setSelectedPayout(payout);
    setUpdateStatus(payout.status);
    setAdminNotes(payout.adminNotes || '');
    setFailureReason(payout.failureReason || '');
    setIsDialogOpen(true);
  };

  const handleUpdatePayout = async () => {
    if (!selectedPayout || !selectedPayout.id || !db) {
        toast({ variant: "destructive", title: "Error", description: "No payout selected or DB error." });
        return;
    }
    if ((updateStatus === 'rejected' || updateStatus === 'failed') && !failureReason.trim()) {
        toast({ variant: "destructive", title: "Input Required", description: "Reason is required for rejection or failure." });
        return;
    }

    setIsUpdating(true);
    setPageError(null);
    console.log(`${ADMIN_PAYOUTS_LOG_PREFIX} Starting update for payout ID: ${selectedPayout.id}, New Status: ${updateStatus}`);

    const payoutRef = doc(db, 'payoutRequests', selectedPayout.id);
    const userRef = doc(db, 'users', selectedPayout.userId);
    const originalStatus = selectedPayout.status;
    const newPayoutStatus = updateStatus;
    const payoutAmount = selectedPayout.amount;

    try {
       await runTransaction(db, async (firestoreTransaction) => { // Renamed transaction to firestoreTransaction
           const payoutDocSnap = await firestoreTransaction.get(payoutRef);
           const userDocSnap = await firestoreTransaction.get(userRef);

           if (!payoutDocSnap.exists()) throw new Error("Payout request document not found.");
           if (!userDocSnap.exists()) throw new Error(`User profile ${selectedPayout.userId} not found.`);
           
           const currentPayoutData = payoutDocSnap.data() as PayoutRequest;
           const currentUserData = userDocSnap.data() as UserProfile;

           console.log(`${ADMIN_PAYOUTS_LOG_PREFIX} Payout doc (in transaction):`, currentPayoutData);
           console.log(`${ADMIN_PAYOUTS_LOG_PREFIX} User doc (in transaction):`, currentUserData);

           const payoutUpdateData: Partial<Omit<PayoutRequest, 'id' | 'userId' | 'amount' | 'requestedAt' | 'paymentMethod' | 'paymentDetails'>> & { updatedAt: FieldValue } = {
               status: newPayoutStatus,
               adminNotes: adminNotes.trim() || null,
               processedAt: serverTimestamp() as Timestamp,
               failureReason: (newPayoutStatus === 'failed' || newPayoutStatus === 'rejected') ? failureReason.trim() || null : null,
               updatedAt: serverTimestamp()
           };

           const userProfileUpdates: { [key: string]: any } = { updatedAt: serverTimestamp() };
           let transactionsToUpdateBatch = writeBatch(db);
           let linkedTransactionIds: string[] = currentPayoutData.transactionIds || [];

           if (newPayoutStatus === 'paid' && originalStatus !== 'paid') {
               console.log(`${ADMIN_PAYOUTS_LOG_PREFIX} Processing 'paid' status. Original payout Tx IDs:`, linkedTransactionIds);
               // If transactionIds were not pre-linked (e.g. by user request step), find them now
               if (!linkedTransactionIds || linkedTransactionIds.length === 0) {
                  console.log(`${ADMIN_PAYOUTS_LOG_PREFIX} No pre-linked Tx IDs. Fetching 'confirmed' transactions for user ${selectedPayout.userId} to cover amount ${payoutAmount}.`);
                  const transactionsQuery = query(
                      collection(db, 'transactions'),
                      where('userId', '==', selectedPayout.userId),
                      where('status', '==', 'confirmed' as CashbackStatus),
                      where('payoutId', '==', null),
                      orderBy('transactionDate', 'asc')
                  );
                  const confirmedUnpaidSnap = await firestoreTransaction.get(transactionsQuery); // Use transaction.get for reads
                  console.log(`${ADMIN_PAYOUTS_LOG_PREFIX} Found ${confirmedUnpaidSnap.size} confirmed, unpaid transactions.`);
                  
                  let sumOfSelectedTransactions = 0;
                  const transactionIdsToMarkPaid: string[] = [];

                  for (const txDocSnap of confirmedUnpaidSnap.docs) {
                      const txData = txDocSnap.data() as Transaction;
                      const txCashbackAmount = txData.finalCashbackAmount ?? txData.initialCashbackAmount ?? 0;
                      if (sumOfSelectedTransactions + txCashbackAmount <= payoutAmount) {
                          sumOfSelectedTransactions += txCashbackAmount;
                          transactionIdsToMarkPaid.push(txDocSnap.id);
                      }
                      if (sumOfSelectedTransactions >= payoutAmount) break;
                  }
                  // Basic check, more robust validation might be needed if partial fulfillment isn't allowed
                  if (sumOfSelectedTransactions < payoutAmount && transactionIdsToMarkPaid.length === 0) {
                     console.error(`${ADMIN_PAYOUTS_LOG_PREFIX} Insufficient confirmed transaction value (found ${sumOfSelectedTransactions}) to cover payout ${payoutAmount}.`);
                     throw new Error("Could not find enough confirmed transactions to fulfill this payout amount. Check transaction statuses.");
                  }
                  linkedTransactionIds = transactionIdsToMarkPaid; // Use newly found transactions
                  payoutUpdateData.transactionIds = linkedTransactionIds;
                  console.log(`${ADMIN_PAYOUTS_LOG_PREFIX} Will mark these Tx IDs as paid:`, linkedTransactionIds);
               }

               linkedTransactionIds.forEach(txId => {
                   transactionsToUpdateBatch.update(doc(db, 'transactions', txId), {
                       status: 'paid' as CashbackStatus,
                       paidDate: serverTimestamp(),
                       updatedAt: serverTimestamp()
                   });
               });
               // No change to user's cashbackBalance here, it was debited on payout *request*.
           } else if ((newPayoutStatus === 'rejected' || newPayoutStatus === 'failed') && (originalStatus === 'pending' || originalStatus === 'approved' || originalStatus === 'processing')) {
               // Payout is rejected/failed, credit back the amount to user's cashbackBalance
               console.log(`${ADMIN_PAYOUTS_LOG_PREFIX} Payout ${selectedPayout.id} is ${newPayoutStatus}. Crediting user ${userDocSnap.id} balance by ₹${payoutAmount}.`);
               userProfileUpdates.cashbackBalance = increment(payoutAmount);

               // Revert linked transactions from 'awaiting_payout' (if any) back to 'confirmed'
               if (originalStatus === 'pending' && linkedTransactionIds.length > 0) { // Or 'approved' or 'processing' if those states also moved txns to awaiting_payout
                  console.log(`${ADMIN_PAYOUTS_LOG_PREFIX} Reverting status for linked transactions:`, linkedTransactionIds);
                  linkedTransactionIds.forEach(txId => {
                      transactionsToUpdateBatch.update(doc(db, 'transactions', txId), {
                          status: 'confirmed' as CashbackStatus,
                          payoutId: null, // Clear payoutId
                          updatedAt: serverTimestamp()
                      });
                  });
               }
           }
           
           firestoreTransaction.update(payoutRef, payoutUpdateData);
           if (Object.keys(userProfileUpdates).length > 1) { // more than just updatedAt
              firestoreTransaction.update(userRef, userProfileUpdates);
           }
           await transactionsToUpdateBatch.commit(); // Commit batch updates for transactions (if any)
       });

      setPayouts(prev =>
        prev.map(p =>
          p.id === selectedPayout.id
            ? { ...p, status: newPayoutStatus, adminNotes: adminNotes.trim() || null, failureReason: (newPayoutStatus === 'failed' || newPayoutStatus === 'rejected') ? failureReason.trim() || null : null, processedAt: new Date(), transactionIds: newPayoutStatus === 'paid' ? selectedPayout.transactionIds : p.transactionIds } 
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

  if (loading && payouts.length === 0 && !pageError) {
    return <AdminGuard><AdminPayoutsPageSkeleton /></AdminGuard>;
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
        <CardContent className="flex flex-col sm:flex-row gap-4">
          <div className="flex-1">
            <Label htmlFor="filter-status-payouts" className="sr-only">Filter by Status</Label>
            <Select value={filterStatus} onValueChange={(value) => setFilterStatus(value as PayoutStatus | 'all')}>
              <SelectTrigger id="filter-status-payouts">
                <SelectValue placeholder="Filter by Status" />
              </SelectTrigger>
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
          <form onSubmit={handleSearch} className="flex-1 flex gap-2">
            <Label htmlFor="search-user-payouts" className="sr-only">Search by User ID</Label>
            <Input
              id="search-user-payouts"
              type="search"
              placeholder="Search by User ID..."
              value={searchTermInput}
              onChange={(e) => setSearchTermInput(e.target.value)}
              disabled={isSearching || loading}
            />
            <Button type="submit" disabled={isSearching || loading}>
              {isSearching || (loading && debouncedSearchTerm) ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
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
           {loading && payouts.length === 0 && !pageError ? (
             <AdminPayoutsPageSkeleton />
           ) : !loading && payouts.length === 0 && !pageError ? (
             <p className="text-center text-muted-foreground py-8">
                {debouncedSearchTerm || filterStatus !== 'all' ? 'No payout requests found matching your criteria.' : 'No payout requests found.'}
             </p>
           ) : (
             <div className="overflow-x-auto w-full">
                <Table className="min-w-[1000px]">
                <TableHeader>
                    <TableRow>
                    <TableHead className="min-w-[180px]">User</TableHead>
                    <TableHead className="min-w-[100px] text-right">Amount</TableHead>
                    <TableHead className="min-w-[120px]">Method</TableHead>
                    <TableHead className="min-w-[180px]">Details</TableHead>
                    <TableHead className="min-w-[180px]">Requested At</TableHead>
                    <TableHead className="min-w-[120px]">Status</TableHead>
                    <TableHead className="min-w-[180px]">Processed At</TableHead>
                    <TableHead className="text-right min-w-[100px]">Actions</TableHead>
                    </TableRow>
                </TableHeader>
                <TableBody>
                    {payouts.map((payout) => (
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
                        <TableCell className="whitespace-nowrap">{payout.requestedAt ? format(new Date(payout.requestedAt), 'PPp') : 'N/A'}</TableCell>
                        <TableCell>
                        <Badge variant={getStatusVariant(payout.status)} className="flex items-center gap-1 w-fit text-xs whitespace-nowrap">
                            {getStatusIcon(payout.status)}
                            {payout.status.replace('_',' ')}
                        </Badge>
                        </TableCell>
                        <TableCell className="whitespace-nowrap">
                            {payout.processedAt ? format(new Date(payout.processedAt), 'PPp') : '-'}
                        </TableCell>
                        <TableCell className="text-right">
                            <Button size="sm" variant="outline" onClick={() => openUpdateDialog(payout)}>
                                Manage
                            </Button>
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
                <Label htmlFor="payout-status-dialog" className="text-sm font-medium mb-1 block">New Status*</Label>
                <Select value={updateStatus} onValueChange={(value) => setUpdateStatus(value as PayoutStatus)} disabled={isUpdating}>
                  <SelectTrigger id="payout-status-dialog">
                    <SelectValue placeholder="Select Status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="pending">Pending</SelectItem>
                    <SelectItem value="approved">Approved (Awaiting Payment)</SelectItem>
                    <SelectItem value="processing">Processing Payment</SelectItem>
                    <SelectItem value="paid">Paid</SelectItem>
                    <SelectItem value="rejected">Rejected</SelectItem>
                    <SelectItem value="failed">Failed</SelectItem>
                  </SelectContent>
                </Select>
             </div>
             <div>
                <Label htmlFor="admin-notes-dialog" className="text-sm font-medium mb-1 block">Admin Notes</Label>
                <Textarea
                    id="admin-notes-dialog"
                    value={adminNotes}
                    onChange={(e) => setAdminNotes(e.target.value)}
                    placeholder="Optional notes (e.g., transaction ID, reason for rejection)"
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

export default function AdminPayoutsPageWrapper() {
    return <AdminPayoutsPageContent />;
}

    