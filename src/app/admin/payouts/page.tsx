
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
  runTransaction
} from 'firebase/firestore';
import { db, firebaseInitializationError } from '@/lib/firebase/config';
import type { PayoutRequest, PayoutStatus, UserProfile } from '@/lib/types';
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
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogClose, DialogTrigger } from '@/components/ui/dialog';
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
        if (!payoutRequests || payoutRequests.length === 0 || !db) return payoutRequests;

        const userIds = [...new Set(payoutRequests.map(p => p.userId))];
        const userProfiles: Record<string, UserProfile> = {};

        try {
            for (const userId of userIds) {
                const userRef = doc(db, 'users', userId);
                const userSnap = await getDoc(userRef); // Changed to getDoc for single document
                 if (userSnap.exists()) {
                    const userData = userSnap.data() as UserProfile;
                    userProfiles[userId] = userData;
                 } else {
                    console.warn(`User profile not found for ID: ${userId}`);
                 }
            }
        } catch (userFetchError) {
            console.error("Error fetching user data for payouts:", userFetchError);
        }

        return payoutRequests.map(payout => ({
            ...payout,
            userDisplayName: userProfiles[payout.userId]?.displayName || 'Unknown User',
            userEmail: userProfiles[payout.userId]?.email || 'N/A',
        }));
   }, []);


  const fetchPayouts = useCallback(async (loadMore = false) => {
    if (!db || firebaseInitializationError) {
      setError(firebaseInitializationError || "Database connection not available.");
      setLoading(false);
      setLoadingMore(false);
      setHasMore(false);
      return;
    }
    const isInitialOrNewSearch = !loadMore;
    if (isInitialOrNewSearch) {
      setLoading(true);
      setLastVisible(null);
      setPayouts([]);
      setHasMore(true);
    } else {
      setLoadingMore(true);
    }
    setError(null);
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

      if (isInitialOrNewSearch) {
        setPayouts(payoutsWithUserData);
      } else {
        setPayouts(prev => [...prev, ...payoutsWithUserData]);
      }

      setLastVisible(querySnapshot.docs[querySnapshot.docs.length - 1] || null);
      setHasMore(querySnapshot.docs.length === PAYOUTS_PER_PAGE);

    } catch (err) {
      console.error("Error fetching payout requests:", err);
      setError(err instanceof Error ? err.message : "Failed to fetch payouts");
      toast({ variant: "destructive", title: "Fetch Error", description: String(err) });
    } finally {
      setLoading(false);
      setLoadingMore(false);
      setIsSearching(false);
    }
  }, [filterStatus, debouncedSearchTerm, lastVisible, fetchUserDataForPayouts, toast]);


  useEffect(() => {
    fetchPayouts(false);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterStatus, debouncedSearchTerm, fetchPayouts]); // fetchPayouts is stable

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    // useEffect handles fetching due to debouncedSearchTerm change
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

    try {
       await runTransaction(db, async (transaction) => {
           const payoutDoc = await transaction.get(payoutRef);
           const userDoc = await transaction.get(userRef);

           if (!payoutDoc.exists()) throw new Error("Payout request not found.");
           if (!userDoc.exists()) throw new Error("User profile not found.");

           const payoutData = payoutDoc.data() as PayoutRequest;
           const userData = userDoc.data() as UserProfile;
           const amount = payoutData.amount;

           const payoutUpdateData: Partial<PayoutRequest> = {
               status: updateStatus,
               adminNotes: adminNotes.trim() || null,
               failureReason: updateStatus === 'failed' ? failureReason.trim() || null : null,
               processedAt: serverTimestamp(),
           };

           const userUpdateData: Partial<UserProfile> = { updatedAt: serverTimestamp() };

           if (updateStatus === 'paid' && (originalStatus === 'approved' || originalStatus === 'processing')) {
             // No direct balance change here as it's assumed to be handled at request or pre-approval
           } else if (updateStatus === 'rejected' && originalStatus === 'pending') {
                console.log(`Rejecting pending request for user ${selectedPayout.userId}. Re-adding ${amount} to balance.`);
                userUpdateData.cashbackBalance = (userData.cashbackBalance || 0) + amount;
           } else if (updateStatus === 'failed' && (originalStatus === 'processing' || originalStatus === 'approved')) {
                // This case implies money was committed but failed.
                // Re-adding to balance might be complex and depend on specific accounting.
                // For now, we only mark as failed. Manual adjustment or further logic might be needed.
                console.warn(`Payout ${selectedPayout.id} marked as failed. Balance was likely committed. Review required.`);
           }

            if (userUpdateData.cashbackBalance !== undefined && userUpdateData.cashbackBalance < 0) {
                throw new Error("User balance cannot go below zero.");
            }

            transaction.update(payoutRef, payoutUpdateData);
            if (Object.keys(userUpdateData).length > 1) {
                transaction.update(userRef, userUpdateData);
            } else {
                 transaction.update(userRef, { updatedAt: serverTimestamp() });
            }
       });

      setPayouts(prev =>
        prev.map(p =>
          p.id === selectedPayout.id
            ? { ...p, status: updateStatus, adminNotes: adminNotes.trim() || null, failureReason: updateStatus === 'failed' ? failureReason.trim() || null : null, processedAt: new Date() }
            : p
        )
      );

      toast({ title: "Payout Updated", description: `Status set to ${updateStatus}.` });
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
                       <Dialog>
                         <DialogTrigger asChild>
                            <Button size="sm" variant="outline" onClick={() => openUpdateDialog(payout)}>
                                Manage
                            </Button>
                         </DialogTrigger>
                       </Dialog>
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
               Update status and add notes for User: {selectedPayout?.userDisplayName || selectedPayout?.userId} ({formatCurrency(selectedPayout?.amount || 0)})
             </DialogDescription>
           </DialogHeader>
           <div className="grid gap-4 py-4">
             <div>
                <label htmlFor="payout-status" className="text-sm font-medium mb-1 block">Status</label>
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
                <label htmlFor="admin-notes" className="text-sm font-medium mb-1 block">Admin Notes</label>
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
                     <label htmlFor="failure-reason" className="text-sm font-medium mb-1 block">Failure Reason</label>
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
