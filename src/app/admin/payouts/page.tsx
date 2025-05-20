
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
  getDoc, 
  writeBatch,
  increment
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
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogClose } from '@/components/ui/dialog'; // Removed DialogTrigger as it's not directly used for opening programmatically
import { useDebounce } from '@/hooks/use-debounce';

const PAYOUTS_PER_PAGE = 15;

interface PayoutRequestWithUser extends PayoutRequest {
  userDisplayName?: string;
  userEmail?: string;
}

const getStatusVariant = (status: PayoutStatus): "default" | "secondary" | "destructive" | "outline" => {
  switch (status) {
    case 'approved': return 'default';
    case 'paid': return 'secondary'; 
    case 'pending': return 'outline';
    case 'rejected':
    case 'failed': return 'destructive';
    case 'processing': return 'default'; 
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

function AdminPayoutsPageSkeleton() { // Renamed to avoid conflict
   return (
    <Card>
      <CardHeader>
         <Skeleton className="h-6 w-1/4 mb-2"/>
         <Skeleton className="h-4 w-1/2"/>
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

export default function AdminPayoutsPage() { // Changed component name
  const [payouts, setPayouts] = useState<PayoutRequestWithUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [pageError, setPageError] = useState<string | null>(null); 
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
  const [failureReason, setFailureReason] = useState(''); // Also used for rejection reason
  const [isUpdating, setIsUpdating] = useState(false);
  const [isDialogOpen, setIsDialogOpen] = useState(false);

   const fetchUserDataForPayouts = useCallback(async (payoutRequests: PayoutRequest[]): Promise<PayoutRequestWithUser[]> => {
        let isMounted = true;
        if (!payoutRequests || payoutRequests.length === 0 || !db || firebaseInitializationError) {
            if (isMounted && firebaseInitializationError) setPageError(prev => (prev ? prev + "; " : "") + (firebaseInitializationError || "DB error in fetchUserData. "));
            return payoutRequests;
        }

        const userIds = [...new Set(payoutRequests.map(p => p.userId))];
        const userProfiles: Record<string, Pick<UserProfile, 'displayName' | 'email'>> = {};

        try {
            for (const userId of userIds) {
                 if (!userId) continue; 
                const userRef = doc(db, 'users', userId);
                const userSnap = await getDoc(userRef);
                 if (userSnap.exists()) {
                    const userData = userSnap.data();
                    userProfiles[userId] = {displayName: userData.displayName || null, email: userData.email || null};
                 } else {
                    console.warn(`User profile not found for ID: ${userId}`);
                    userProfiles[userId] = {displayName: 'Unknown User', email: 'N/A'};
                 }
            }
        } catch (userFetchError) {
            console.error("Error fetching user data for payouts:", userFetchError);
            if (isMounted) setPageError(prev => (prev ? prev + "; " : "") + "Error fetching user details for some payouts. ");
        }
        if (!isMounted) return payoutRequests; 
        
        return payoutRequests.map(payout => ({
            ...payout,
            userDisplayName: userProfiles[payout.userId]?.displayName || 'Unknown User',
            userEmail: userProfiles[payout.userId]?.email || 'N/A',
        }));
   }, []);


  const fetchPayouts = useCallback(async (loadMoreOperation = false) => {
    let isMounted = true;
    const docToStartAfter = lastVisible; 

    if (!db || firebaseInitializationError) {
      if (isMounted) {
        setPageError(firebaseInitializationError || "Database connection not available.");
        if(!loadMoreOperation) setLoading(false); else setLoadingMore(false);
        setHasMore(false);
      }
      return () => { isMounted = false; };
    }

    if (!loadMoreOperation) {
      setLoading(true);
      setPayouts([]); 
      setLastVisible(null); 
      setHasMore(true);
    } else {
      if (!docToStartAfter && loadMoreOperation) { 
        if(isMounted) setLoadingMore(false);
        return () => { isMounted = false; };
      }
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
      if (debouncedSearchTerm) { 
        constraints.push(where('userId', '==', debouncedSearchTerm));
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
        requestedAt: safeToDate(docSnap.data().requestedAt),
        processedAt: safeToDate(docSnap.data().processedAt),
      } as PayoutRequest));

      const payoutsWithUserData = await fetchUserDataForPayouts(rawPayoutsData);
      
      if(isMounted){
        setPayouts(prev => loadMoreOperation ? [...prev, ...payoutsWithUserData] : payoutsWithUserData);
        setLastVisible(querySnapshot.docs[querySnapshot.docs.length - 1] || null);
        setHasMore(querySnapshot.docs.length === PAYOUTS_PER_PAGE);
      }

    } catch (err) {
      console.error("Error fetching payout requests:", err);
      if (isMounted) {
        setPageError(err instanceof Error ? err.message : "Failed to fetch payouts");
        toast({ variant: "destructive", title: "Fetch Error", description: String(err) });
        setHasMore(false);
      }
    } finally {
      if (isMounted) {
        if (!loadMoreOperation) setLoading(false); else setLoadingMore(false);
        setIsSearching(false);
      }
    }
    return () => { isMounted = false; };
  }, [filterStatus, debouncedSearchTerm, toast, fetchUserDataForPayouts, lastVisible]); 

  useEffect(() => {
    fetchPayouts(false);
  }, [filterStatus, debouncedSearchTerm, fetchPayouts]);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
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
    setFailureReason(payout.failureReason || ''); // Used for rejection/failure reason
    setIsDialogOpen(true);
  };

  const handleUpdatePayout = async () => {
    if (!selectedPayout || !selectedPayout.id || !db) return;
    if ((updateStatus === 'rejected' || updateStatus === 'failed') && !failureReason.trim()) {
        toast({ variant: "destructive", title: "Input Required", description: "Reason is required for rejection or failure." });
        return;
    }

    setIsUpdating(true);
    setPageError(null);

    const payoutRef = doc(db, 'payoutRequests', selectedPayout.id);
    const userRef = doc(db, 'users', selectedPayout.userId);
    const originalStatus = selectedPayout.status;
    const newPayoutStatus = updateStatus; 
    const payoutAmount = selectedPayout.amount;

    try {
       await runTransaction(db, async (transaction) => {
           const payoutDocSnap = await transaction.get(payoutRef);
           const userDocSnap = await transaction.get(userRef);

           if (!payoutDocSnap.exists()) throw new Error("Payout request not found.");
           if (!userDocSnap.exists()) throw new Error("User profile not found.");
           
           const payoutData = payoutDocSnap.data() as PayoutRequest;

           const payoutUpdateData: Partial<PayoutRequest> = {
               status: newPayoutStatus,
               adminNotes: adminNotes.trim() || null,
               failureReason: (newPayoutStatus === 'failed' || newPayoutStatus === 'rejected') ? failureReason.trim() || null : null,
               processedAt: serverTimestamp(),
           };
           transaction.update(payoutRef, payoutUpdateData);

           const userProfileUpdates: Record<string, any> = { updatedAt: serverTimestamp() };

           // Handle user balance and transaction status changes
           const batch = writeBatch(db); // Use a separate batch for transaction updates as they are not part of the atomic user/payout update

           if (newPayoutStatus === 'paid') {
               if (payoutData.transactionIds && payoutData.transactionIds.length > 0) {
                   payoutData.transactionIds.forEach(txId => {
                       const txRef = doc(db, 'transactions', txId);
                       batch.update(txRef, { status: 'paid' as CashbackStatus, paidDate: serverTimestamp(), updatedAt: serverTimestamp() });
                   });
               }
               console.log(`ADMIN_PAYOUT: Payout ${selectedPayout.id} marked as 'paid'. ${payoutData.transactionIds?.length || 0} transactions updated.`);
           } else if (newPayoutStatus === 'rejected' || newPayoutStatus === 'failed') {
               // If payout is rejected/failed, credit back the amount to user's cashbackBalance
               // and revert linked transactions from 'awaiting_payout' back to 'confirmed'.
               userProfileUpdates.cashbackBalance = increment(payoutAmount);
               console.log(`ADMIN_PAYOUT: Payout ${selectedPayout.id} is ${newPayoutStatus}. User balance ${userDocSnap.id} credited back ₹${payoutAmount}.`);

               if (payoutData.transactionIds && payoutData.transactionIds.length > 0) {
                   payoutData.transactionIds.forEach(txId => {
                       const txRef = doc(db, 'transactions', txId);
                       batch.update(txRef, { status: 'confirmed' as CashbackStatus, payoutId: null, updatedAt: serverTimestamp() });
                   });
                   console.log(`ADMIN_PAYOUT: Reverted ${payoutData.transactionIds.length} transactions to 'confirmed' for payout ${selectedPayout.id}.`);
               }
           }
           
           if (Object.keys(userProfileUpdates).length > 1 ) { 
               transaction.update(userRef, userProfileUpdates);
           }
           await batch.commit(); // Commit transaction status updates
       });

      setPayouts(prev =>
        prev.map(p =>
          p.id === selectedPayout.id
            ? { ...p, status: newPayoutStatus, adminNotes: adminNotes.trim() || null, failureReason: (newPayoutStatus === 'failed' || newPayoutStatus === 'rejected') ? failureReason.trim() || null : null, processedAt: new Date() }
            : p
        )
      );

      toast({ title: "Payout Updated", description: `Status set to ${newPayoutStatus}.` });
      setIsDialogOpen(false);
      setSelectedPayout(null);

    } catch (err) {
      console.error("Error updating payout request:", err);
      setPageError(err instanceof Error ? err.message : "Failed to update payout.");
      toast({ variant: "destructive", title: "Update Failed", description: err instanceof Error ? err.message : "Could not save changes." });
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
      <h1 className="text-3xl font-bold">Payout Requests</h1>

      {pageError && (
        <Alert variant="destructive">
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
           {loading && payouts.length === 0 ? (
             <AdminPayoutsPageSkeleton />
           ) : !loading && payouts.length === 0 && !pageError ? (
             <p className="text-center text-muted-foreground py-8">
                {debouncedSearchTerm || filterStatus !== 'all' ? 'No payout requests found matching your criteria.' : 'No payout requests found.'}
             </p>
           ) : (
             <div className="overflow-x-auto">
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
                        <Badge variant={getStatusVariant(payout.status)} className="flex items-center gap-1 w-fit text-xs">
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

       <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
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
                    <SelectItem value="approved">Approved (Awaiting Payment)</SelectItem>
                    <SelectItem value="processing">Processing Payment</SelectItem>
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
             {(updateStatus === 'failed' || updateStatus === 'rejected') && (
                 <div>
                     <Label htmlFor="failure-reason" className="text-sm font-medium mb-1 block">
                        {updateStatus === 'failed' ? 'Failure Reason*' : 'Rejection Reason*'}
                     </Label>
                     <Textarea
                         id="failure-reason"
                         value={failureReason}
                         onChange={(e) => setFailureReason(e.target.value)}
                         placeholder={updateStatus === 'failed' ? "Reason for payout failure" : "Reason for rejecting payout"}
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
             <Button type="button" onClick={handleUpdatePayout} disabled={isUpdating || ((updateStatus === 'rejected' || updateStatus === 'failed') && !failureReason.trim())}>
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
