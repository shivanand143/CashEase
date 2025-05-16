
"use client";

import * as React from 'react';
import { useState, useEffect, useCallback } from 'react';
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
  getDoc, // Ensure getDoc is imported for fetching single documents
  writeBatch
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { AlertCircle, Loader2, Search, CheckCircle, XCircle, Hourglass, Send, Info } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { formatCurrency, safeToDate } from '@/lib/utils';
import AdminGuard from '@/components/guards/admin-guard';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogClose } from '@/components/ui/dialog';
import { useDebounce } from '@/hooks/use-debounce';

const PAYOUTS_PER_PAGE = 15;

interface PayoutRequestWithUser extends PayoutRequest {
  userDisplayName?: string;
  userEmail?: string;
}

const getStatusVariant = (status: PayoutStatus): "default" | "secondary" | "destructive" | "outline" => {
  switch (status) {
    case 'approved': return 'default';
    case 'paid': return 'secondary'; // More distinct variant for 'paid'
    case 'pending': return 'outline';
    case 'rejected':
    case 'failed': return 'destructive';
    case 'processing': return 'default'; // Using default for processing too, or could be another color
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


function AdminPayoutsPageContent() {
  const [payouts, setPayouts] = useState<PayoutRequestWithUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastVisible, setLastVisible] = useState<QueryDocumentSnapshot<DocumentData> | null>(null);
  const [hasMore, setHasMore] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const { toast } = useToast();

  const [filterStatus, setFilterStatus] = useState<PayoutStatus | 'all'>('all');
  const [searchTermInput, setSearchTermInput] = useState('');
  const debouncedSearchTerm = useDebounce(searchTermInput, 500);
  const [isSearching, setIsSearching] = useState(false);

  const [selectedPayout, setSelectedPayout] = useState<PayoutRequestWithUser | null>(null);
  const [updateStatus, setUpdateStatus] = useState<PayoutStatus>('pending');
  const [adminNotes, setAdminNotes] = useState('');
  const [failureReason, setFailureReason] = useState('');
  const [isUpdating, setIsUpdating] = useState(false);

   const fetchUserDataForPayouts = useCallback(async (payoutRequests: PayoutRequest[]): Promise<PayoutRequestWithUser[]> => {
        let isMounted = true;
        if (!payoutRequests || payoutRequests.length === 0 || !db || firebaseInitializationError) {
            if (isMounted && firebaseInitializationError) setError(prev => prev + (firebaseInitializationError || "DB error in fetchUserData. "));
            return payoutRequests;
        }

        const userIds = [...new Set(payoutRequests.map(p => p.userId))];
        const userProfiles: Record<string, UserProfile> = {};

        try {
            // Batch user profile fetches if possible, or iterate
            for (const userId of userIds) {
                 if (!userId) continue; // Skip if userId is invalid
                const userRef = doc(db, 'users', userId);
                const userSnap = await getDoc(userRef);
                 if (userSnap.exists()) {
                    const userData = userSnap.data() as UserProfile;
                    userProfiles[userId] = userData;
                 } else {
                    console.warn(`User profile not found for ID: ${userId}`);
                 }
            }
        } catch (userFetchError) {
            console.error("Error fetching user data for payouts:", userFetchError);
            if (isMounted) setError(prev => prev + "Error fetching user details for some payouts. ");
        }
        return () => {isMounted = false; payoutRequests.map(payout => ({
            ...payout,
            userDisplayName: userProfiles[payout.userId]?.displayName || 'Unknown User',
            userEmail: userProfiles[payout.userId]?.email || 'N/A',
        }))};
   // eslint-disable-next-line react-hooks/exhaustive-deps
   }, []);


  const fetchPayouts = useCallback(async (loadMore = false) => {
    let isMounted = true;
    if (!db || firebaseInitializationError) {
      if (isMounted) {
        setError(firebaseInitializationError || "Database connection not available.");
        if (!loadMore) setLoading(false); else setLoadingMore(false);
        setHasMore(false);
      }
      return () => { isMounted = false; };
    }

    if (!loadMore) {
      setLoading(true);
      setLastVisible(null);
      setPayouts([]); // Clear previous results for new search/filter
      setHasMore(true);
    } else {
      setLoadingMore(true);
    }
    if(!loadMore) setError(null);
    setIsSearching(debouncedSearchTerm !== '');

    try {
      const payoutsCollection = collection(db, 'payoutRequests');
      const constraints: QueryConstraint[] = [];

      if (filterStatus !== 'all') {
        constraints.push(where('status', '==', filterStatus));
      }
      if (debouncedSearchTerm) { // Assuming search by userId
        constraints.push(where('userId', '==', debouncedSearchTerm));
      }

      constraints.push(orderBy('requestedAt', 'desc'));
      if (loadMore && lastVisible) {
        constraints.push(startAfter(lastVisible));
      }
      constraints.push(limit(PAYOUTS_PER_PAGE));

      const q = query(payoutsCollection, ...constraints);
      const querySnapshot = await getDocs(q);

      const rawPayoutsData = querySnapshot.docs.map(docSnap => ({
        id: docSnap.id,
        ...docSnap.data(),
        requestedAt: safeToDate(docSnap.data().requestedAt),
        processedAt: safeToDate(docSnap.data().processedAt),
      } as PayoutRequest));

      const payoutsWithUserData = await fetchUserDataForPayouts(rawPayoutsData);
      
      if(isMounted) {
        setPayouts(prev => loadMore ? [...prev, ...payoutsWithUserData] : payoutsWithUserData);
        setLastVisible(querySnapshot.docs[querySnapshot.docs.length - 1] || null);
        setHasMore(querySnapshot.docs.length === PAYOUTS_PER_PAGE);
      }

    } catch (err) {
      console.error("Error fetching payout requests:", err);
      if (isMounted) {
        setError(err instanceof Error ? err.message : "Failed to fetch payouts");
        toast({ variant: "destructive", title: "Fetch Error", description: String(err) });
        setHasMore(false);
      }
    } finally {
      if (isMounted) {
        if (!loadMore) setLoading(false); else setLoadingMore(false);
        setIsSearching(false);
      }
    }
    return () => { isMounted = false; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterStatus, debouncedSearchTerm, toast, fetchUserDataForPayouts]); // Removed lastVisible from here, managed internally

  useEffect(() => {
    fetchPayouts(false);
  }, [fetchPayouts]);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    fetchPayouts(false);
  };

  const handleLoadMore = () => {
    if (!loadingMore && hasMore) {
      fetchPayouts(true);
    }
  };

  const openUpdateDialog = (payout: PayoutRequestWithUser) => {
    setSelectedPayout(payout);
    setUpdateStatus(payout.status);
    setAdminNotes(payout.adminNotes || '');
    setFailureReason(payout.failureReason || '');
  };

  const handleUpdatePayout = async () => {
    if (!selectedPayout || !selectedPayout.id || !db) return;
    setIsUpdating(true);
    setError(null);

    const payoutRef = doc(db, 'payoutRequests', selectedPayout.id);
    const userRef = doc(db, 'users', selectedPayout.userId);
    const originalStatus = selectedPayout.status;
    const newPayoutStatus = updateStatus; // Use the state variable for the new status

    try {
       await runTransaction(db, async (transaction) => {
           const payoutDocSnap = await transaction.get(payoutRef);
           const userDocSnap = await transaction.get(userRef);

           if (!payoutDocSnap.exists()) throw new Error("Payout request not found.");
           if (!userDocSnap.exists()) throw new Error("User profile not found.");

           const payoutData = payoutDocSnap.data() as PayoutRequest;
           const userData = userDocSnap.data() as UserProfile;
           const amount = payoutData.amount;

           const payoutUpdateData: Partial<PayoutRequest> = {
               status: newPayoutStatus,
               adminNotes: adminNotes.trim() || null,
               failureReason: newPayoutStatus === 'failed' ? failureReason.trim() || null : null,
               processedAt: serverTimestamp(),
           };
           transaction.update(payoutRef, payoutUpdateData);

           // User profile updates
           const userUpdateData: Partial<UserProfile> = { updatedAt: serverTimestamp() };

           // If payout is rejected or failed, and was pending/approved, return amount to user's pendingCashback
           // This assumes the amount was moved from cashbackBalance to a 'held' state or similar logic
           // For this implementation, if it's rejected from 'pending', it simply means the request is voided.
           // If it was 'approved' and then 'rejected'/'failed', cashback needs to be returned.
           if ((newPayoutStatus === 'rejected' || newPayoutStatus === 'failed') &&
               (originalStatus === 'pending' || originalStatus === 'approved' || originalStatus === 'processing')) {
                // The amount for payout requests is derived from user's 'confirmed' transactions.
                // If rejected/failed, these transactions are no longer part of this payout.
                // The user's `cashbackBalance` should effectively reflect this by NOT being reduced
                // if the payout doesn't complete. The transactions themselves might need status reversion.
                // For this simplified flow: if payout fails, we're just marking it.
                // Complex balance rollbacks require careful transaction status management.
                console.log(`Payout ${selectedPayout.id} ${newPayoutStatus}. User cashbackBalance was already reduced at request time. No further balance change needed.`);
           }

            // Update transactions linked to this payout if status becomes 'paid'
            if (newPayoutStatus === 'paid' && payoutData.transactionIds && payoutData.transactionIds.length > 0) {
                const batch = writeBatch(db); // Use a batch for updating multiple transactions
                payoutData.transactionIds.forEach(txId => {
                    const txRef = doc(db, 'transactions', txId);
                    batch.update(txRef, { status: 'paid' as CashbackStatus, paidDate: serverTimestamp() });
                });
                await batch.commit(); // Commit transaction updates
                console.log(`Updated ${payoutData.transactionIds.length} transactions to 'paid' for payout ${selectedPayout.id}`);
            }


            if (Object.keys(userUpdateData).length > 1 || (Object.keys(userUpdateData).length === 1 && !userUpdateData.updatedAt) ) {
                transaction.update(userRef, userUpdateData);
            } else if (!userDocSnap.data()?.updatedAt) { // Ensure updatedAt is always set
                 transaction.update(userRef, {updatedAt: serverTimestamp()});
            }

       });

      setPayouts(prev =>
        prev.map(p =>
          p.id === selectedPayout.id
            ? { ...p, status: newPayoutStatus, adminNotes: adminNotes.trim() || null, failureReason: newPayoutStatus === 'failed' ? failureReason.trim() || null : null, processedAt: new Date() }
            : p
        )
      );

      toast({ title: "Payout Updated", description: `Status set to ${newPayoutStatus}.` });
      setSelectedPayout(null);

    } catch (err) {
      console.error("Error updating payout request:", err);
      setError(err instanceof Error ? err.message : "Failed to update payout.");
      toast({ variant: "destructive", title: "Update Failed", description: err instanceof Error ? err.message : "Could not save changes." });
    } finally {
      setIsUpdating(false);
    }
  };


  if (loading && payouts.length === 0 && !error) {
    return <PayoutsTableSkeleton />;
  }

  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold">Payout Requests</h1>

      {error && !loading && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Error</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

       <Card>
        <CardHeader>
          <CardTitle>Filter & Search Payouts</CardTitle>
          <CardDescription>Filter by status or search by User ID.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col sm:flex-row gap-4">
          <div className="flex-1">
            <Select value={filterStatus} onValueChange={(value) => setFilterStatus(value as PayoutStatus | 'all')}>
              <SelectTrigger>
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
            <Input
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
          <CardTitle>Payout Requests</CardTitle>
          <CardDescription>Review and process user payout requests.</CardDescription>
        </CardHeader>
        <CardContent>
           {loading && payouts.length === 0 && !error ? (
             <PayoutsTableSkeleton />
           ) : !loading && payouts.length === 0 && !error ? (
             <p className="text-center text-muted-foreground py-8">
                {debouncedSearchTerm || filterStatus !== 'all' ? 'No payout requests found matching your criteria.' : 'No payout requests found.'}
             </p>
           ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>User</TableHead>
                  <TableHead>Amount</TableHead>
                  <TableHead>Method</TableHead>
                  <TableHead>Details</TableHead>
                  <TableHead>Requested At</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {payouts.map((payout) => (
                  <TableRow key={payout.id}>
                    <TableCell>
                       <div className="font-medium">{payout.userDisplayName || payout.userId}</div>
                       <div className="text-xs text-muted-foreground">{payout.userEmail || 'N/A'}</div>
                       <div className="text-[10px] font-mono text-muted-foreground/70">ID: {payout.userId}</div>
                    </TableCell>
                    <TableCell className="font-semibold">{formatCurrency(payout.amount)}</TableCell>
                    <TableCell className="capitalize">{payout.paymentMethod.replace('_', ' ')}</TableCell>
                    <TableCell className="text-xs truncate max-w-[150px]">{payout.paymentDetails.detail}</TableCell>
                    <TableCell>{payout.requestedAt ? format(new Date(payout.requestedAt), 'PPp') : 'N/A'}</TableCell>
                    <TableCell>
                      <Badge variant={getStatusVariant(payout.status)} className="flex items-center gap-1 w-fit">
                        {getStatusIcon(payout.status)}
                        {payout.status}
                      </Badge>
                      {payout.processedAt && (
                         <span className="block text-[10px] text-muted-foreground mt-1">
                             Proc: {format(new Date(payout.processedAt), 'Pp')}
                         </span>
                      )}
                    </TableCell>
                    <TableCell>
                       <DialogTrigger asChild>
                            <Button size="sm" variant="outline" onClick={() => openUpdateDialog(payout)}>
                                Manage
                            </Button>
                       </DialogTrigger>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
           {hasMore && !loading && payouts.length > 0 && (
            <div className="mt-4 text-center">
              <Button onClick={handleLoadMore} disabled={loadingMore}>
                {loadingMore ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                Load More
              </Button>
            </div>
          )}
           {loadingMore && <div className="text-center py-4"><Loader2 className="h-6 w-6 animate-spin text-primary mx-auto" /></div>}
        </CardContent>
      </Card>

       <Dialog open={!!selectedPayout} onOpenChange={(isOpen) => !isOpen && setSelectedPayout(null)}>
         <DialogContent>
           <DialogHeader>
             <DialogTitle>Manage Payout Request</DialogTitle>
             <DialogDescription>
               Update status for User: {selectedPayout?.userDisplayName || selectedPayout?.userId} ({formatCurrency(selectedPayout?.amount || 0)})
             </DialogDescription>
           </DialogHeader>
           <div className="grid gap-4 py-4">
             <div>
                <Label htmlFor="payout-status" className="text-sm font-medium mb-1 block">Status</Label>
                <Select value={updateStatus} onValueChange={(value) => setUpdateStatus(value as PayoutStatus)} disabled={isUpdating}>
                  <SelectTrigger id="payout-status">
                    <SelectValue placeholder="Select Status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="pending">Pending</SelectItem>
                    <SelectItem value="approved">Approved</SelectItem>
                    <SelectItem value="processing">Processing</SelectItem>
                    <SelectItem value="paid">Paid</SelectItem>
                    <SelectItem value="rejected">Rejected</SelectItem>
                    <SelectItem value="failed">Failed</SelectItem>
                  </SelectContent>
                </Select>
             </div>
             <div>
                <Label htmlFor="admin-notes" className="text-sm font-medium mb-1 block">Admin Notes</Label>
                <Textarea
                    id="admin-notes"
                    value={adminNotes}
                    onChange={(e) => setAdminNotes(e.target.value)}
                    placeholder="Optional notes (e.g., transaction ID, reason for rejection)"
                    disabled={isUpdating}
                />
             </div>
             {updateStatus === 'failed' && (
                 <div>
                     <Label htmlFor="failure-reason" className="text-sm font-medium mb-1 block">Failure Reason</Label>
                     <Textarea
                         id="failure-reason"
                         value={failureReason}
                         onChange={(e) => setFailureReason(e.target.value)}
                         placeholder="Reason for payout failure"
                         disabled={isUpdating}
                     />
                 </div>
             )}
           </div>
           <DialogFooter>
             <DialogClose asChild>
               <Button type="button" variant="outline" disabled={isUpdating}>
                 Cancel
               </Button>
             </DialogClose>
             <Button type="button" onClick={handleUpdatePayout} disabled={isUpdating}>
               {isUpdating ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
               Save Changes
             </Button>
           </DialogFooter>
         </DialogContent>
       </Dialog>

    </div>
  );
}

function PayoutsTableSkeleton() {
   return (
    <Card>
      <CardHeader>
         <Skeleton className="h-6 w-1/4 mb-2"/>
         <Skeleton className="h-4 w-1/2"/>
      </CardHeader>
      <CardContent>
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
      </CardContent>
    </Card>
  );
}

export default function AdminPayoutsPage() {
    return (
      <AdminGuard>
        <AdminPayoutsPageContent />
      </AdminGuard>
    );
}
