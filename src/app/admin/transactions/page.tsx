
"use client";

import * as React from 'react';
import { useState, useEffect, useCallback } from 'react';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import {
  collection,
  query,
  orderBy,
  startAfter,
  limit,
  getDocs,
  doc,
  updateDoc,
  addDoc,
  serverTimestamp,
  where,
  QueryConstraint,
  DocumentData,
  QueryDocumentSnapshot,
  Timestamp,
  runTransaction,
  writeBatch,
  getDoc,
  increment
} from 'firebase/firestore';
import { db, firebaseInitializationError } from '@/lib/firebase/config';
import type { Transaction, CashbackStatus, UserProfile, Store, TransactionFormValues as AppTransactionFormValues } from '@/lib/types';
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
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { AlertCircle, Loader2, Search, Edit, PlusCircle, CheckCircle, XCircle, Info, ListFilter, Calendar as CalendarIconLucide, IndianRupee, ThumbsUp, ThumbsDown } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogClose,
  DialogTrigger,
} from "@/components/ui/dialog";
import AdminGuard from '@/components/guards/admin-guard';
import { formatCurrency, safeToDate } from '@/lib/utils';
import { format, parseISO } from 'date-fns';
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { cn } from "@/lib/utils";
import { useDebounce } from '@/hooks/use-debounce';

const TRANSACTIONS_PER_PAGE = 15;

// Updated Zod schema for the "Add Transaction" form
const transactionFormSchema = z.object({
  userId: z.string().min(1, "User ID is required."),
  storeId: z.string().min(1, "Store ID is required."),
  storeName: z.string().optional().nullable(),
  orderId: z.string().min(1, "Order ID is required").optional().nullable(),
  clickId: z.string().optional().nullable(),
  productDetails: z.string().optional().nullable(),
  transactionDate: z.date({ required_error: "Transaction date is required."}),
  saleAmount: z.number({ required_error: "Sale amount is required."}).min(0, "Sale amount must be non-negative."),
  cashbackAmount: z.number({ required_error: "Cashback amount is required."}).min(0, "Cashback amount must be non-negative."),
  status: z.enum(['pending', 'confirmed', 'rejected', 'cancelled', 'awaiting_payout', 'paid'] as [CashbackStatus, ...CashbackStatus[]], { required_error: "Status is required."}),
  adminNotes: z.string().optional().nullable(),
  notesToUser: z.string().optional().nullable(),
  rejectionReason: z.string().optional().nullable(),
}).refine(data => !( (data.status === 'rejected' || data.status === 'cancelled') && !data.rejectionReason?.trim()), {
    message: "Rejection reason is required if status is 'rejected' or 'cancelled'.",
    path: ["rejectionReason"],
});


type TransactionFormValues = z.infer<typeof transactionFormSchema>;


interface TransactionWithUser extends Transaction {
  userDisplayName?: string;
  userEmail?: string;
}

function TransactionsTableSkeleton() {
  return (
    <Card>
      <CardHeader>
        <Skeleton className="h-6 w-1/4 mb-2" />
        <Skeleton className="h-4 w-1/2" />
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                {Array.from({ length: 9 }).map((_, index) => (
                  <TableHead key={index}><Skeleton className="h-5 w-full" /></TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {Array.from({ length: 10 }).map((_, rowIndex) => (
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

const getStatusVariant = (status: CashbackStatus): "default" | "secondary" | "destructive" | "outline" => {
  switch (status) {
    case 'confirmed': return 'default';
    case 'paid': return 'secondary';
    case 'pending': return 'outline';
    case 'awaiting_payout': return 'default'; // Similar to confirmed but distinct
    case 'rejected':
    case 'cancelled': return 'destructive';
    default: return 'outline';
  }
};

const getStatusIcon = (status: CashbackStatus) => {
  switch (status) {
    case 'confirmed': return <CheckCircle className="h-3 w-3 text-green-600" />;
    case 'paid': return <IndianRupee className="h-3 w-3 text-blue-600" />;
    case 'pending': return <Loader2 className="h-3 w-3 animate-spin text-yellow-600" />;
    case 'awaiting_payout': return <IndianRupee className="h-3 w-3 text-purple-600" />;
    case 'rejected':
    case 'cancelled': return <XCircle className="h-3 w-3 text-red-600" />;
    default: return <Info className="h-3 w-3 text-muted-foreground" />;
  }
};

export default function AdminTransactionsPage() {
  const [transactions, setTransactions] = useState<TransactionWithUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [pageError, setPageError] = useState<string | null>(null);
  const [lastVisible, setLastVisible] = useState<QueryDocumentSnapshot<DocumentData> | null>(null);
  const [hasMore, setHasMore] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const { toast } = useToast();

  const [filterType, setFilterType] = useState<'all' | 'userId' | 'storeId' | 'orderId' | 'status'>('all');
  const [filterStatus, setFilterStatus] = useState<CashbackStatus | 'all'>('all');
  const [searchTermInput, setSearchTermInput] = useState('');
  const debouncedSearchTerm = useDebounce(searchTermInput, 500);
  const [isSearching, setIsSearching] = useState(false);

  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [editingTransaction, setEditingTransaction] = useState<TransactionWithUser | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  
  // State for fields editable in the "Manage Transaction" dialog
  const [currentEditStatus, setCurrentEditStatus] = useState<CashbackStatus>('pending');
  const [currentEditAdminNotes, setCurrentEditAdminNotes] = useState('');
  const [currentEditNotesToUser, setCurrentEditNotesToUser] = useState('');
  const [currentEditRejectionReason, setCurrentEditRejectionReason] = useState('');

  const [userCache, setUserCache] = useState<Record<string, Pick<UserProfile, 'displayName' | 'email'>>>({});
  const [storeCache, setStoreCache] = useState<Record<string, Pick<Store, 'name'>>>({});

  const addForm = useForm<TransactionFormValues>({
    resolver: zodResolver(transactionFormSchema),
    defaultValues: {
      userId: '', storeId: '', storeName: '', orderId: '', clickId: '',
      productDetails: '', transactionDate: new Date(), saleAmount: 0,
      cashbackAmount: 0, status: 'pending', adminNotes: '', notesToUser: '', rejectionReason: ''
    },
  });

  const fetchTransactionDetails = useCallback(async (rawTransactions: Transaction[]): Promise<TransactionWithUser[]> => {
    let isMounted = true;
    if (!db || firebaseInitializationError || rawTransactions.length === 0) {
        if(isMounted) console.warn("AdminTransactions: DB not init or no raw transactions for detail fetching.");
        return rawTransactions.map(t => ({...t, userDisplayName: t.userId, storeName: t.storeName || t.storeId}));
    }

    const userIdsToFetch = [...new Set(rawTransactions.map(t => t.userId).filter(id => id && !userCache[id]))];
    const storeIdsToFetch = [...new Set(rawTransactions.map(t => t.storeId).filter(id => id && !storeCache[id] && !t.storeName))];

    if(isMounted) console.log("AdminTransactions: Fetching details for user IDs:", userIdsToFetch, "and store IDs:", storeIdsToFetch);

    try {
      if (userIdsToFetch.length > 0) {
        const newUsers: Record<string, Pick<UserProfile, 'displayName' | 'email'>> = {};
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
        if (isMounted) setUserCache(prev => ({ ...prev, ...newUsers }));
      }

      if (storeIdsToFetch.length > 0) {
        const newStores: Record<string, Pick<Store, 'name'>> = {};
        for (let i = 0; i < storeIdsToFetch.length; i += 30) {
            const chunk = storeIdsToFetch.slice(i, i + 30);
            if (chunk.length === 0) continue;
            const storesQuery = query(collection(db, 'stores'), where('__name__', 'in', chunk));
            const storeSnaps = await getDocs(storesQuery);
            storeSnaps.forEach(docSnap => {
                const data = docSnap.data();
                newStores[docSnap.id] = { name: data.name || 'Unknown Store' };
            });
        }
        if (isMounted) setStoreCache(prev => ({ ...prev, ...newStores }));
      }
    } catch (detailError) {
      console.error("AdminTransactions: Error fetching transaction details (users/stores):", detailError);
      if(isMounted) toast({ variant: "destructive", title: "Detail Fetch Error", description: "Could not load some user/store names." });
    }
    if (!isMounted) return rawTransactions.map(t => ({...t, userDisplayName: t.userId, storeName: t.storeName || t.storeId}));
    
    return rawTransactions.map(transaction => ({
      ...transaction,
      userDisplayName: userCache[transaction.userId]?.displayName || transaction.userId,
      userEmail: userCache[transaction.userId]?.email,
      storeName: transaction.storeName || storeCache[transaction.storeId]?.name || transaction.storeId,
    }));
  }, [userCache, storeCache, toast]);


  const fetchTransactions = useCallback(async (
    loadMoreOperation = false,
    docToStartAfter: QueryDocumentSnapshot<DocumentData> | null = null
  ) => {
    let isMounted = true;
    if (firebaseInitializationError || !db) {
      if (isMounted) {
        setPageError(firebaseInitializationError || "Database connection not available.");
        if(!loadMoreOperation) setLoading(false); else setLoadingMore(false);
        setHasMore(false);
      }
      return () => { isMounted = false; };
    }

    if (!loadMoreOperation) {
      setLoading(true); setTransactions([]); setLastVisible(null); setHasMore(true);
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
      const transactionsCollectionRef = collection(db, 'transactions');
      const constraints: QueryConstraint[] = [];

      if (filterStatus !== 'all') {
        constraints.push(where('status', '==', filterStatus));
      }

      if (debouncedSearchTerm && filterType !== 'all' && filterType !== 'status') {
        constraints.push(where(filterType, '==', debouncedSearchTerm));
      }
      
      constraints.push(orderBy('transactionDate', 'desc'));

      if (loadMoreOperation && docToStartAfter) {
        constraints.push(startAfter(docToStartAfter));
      }
      constraints.push(limit(TRANSACTIONS_PER_PAGE));

      const q = query(transactionsCollectionRef, ...constraints);
      const querySnapshot = await getDocs(q);

      const rawTransactionsData = querySnapshot.docs.map(docSnap => ({
        id: docSnap.id,
        ...docSnap.data(),
        transactionDate: safeToDate(docSnap.data().transactionDate as Timestamp | undefined) || new Date(0),
        confirmationDate: safeToDate(docSnap.data().confirmationDate as Timestamp | undefined),
        paidDate: safeToDate(docSnap.data().paidDate as Timestamp | undefined),
        createdAt: safeToDate(docSnap.data().createdAt as Timestamp | undefined) || new Date(0),
        updatedAt: safeToDate(docSnap.data().updatedAt as Timestamp | undefined) || new Date(0),
      } as Transaction));

      const transactionsWithDetails = await fetchTransactionDetails(rawTransactionsData);
      
      if(isMounted){
        setTransactions(prev => loadMoreOperation ? [...prev, ...transactionsWithDetails] : transactionsWithDetails);
        setLastVisible(querySnapshot.docs[querySnapshot.docs.length - 1] || null);
        setHasMore(querySnapshot.docs.length === TRANSACTIONS_PER_PAGE && transactionsWithDetails.length > 0);
      }

    } catch (err) {
      console.error("AdminTransactions: Error fetching transactions:", err);
      const errorMsg = err instanceof Error ? err.message : "Failed to fetch transactions";
      if(isMounted) {
        setPageError(errorMsg);
        toast({ variant: "destructive", title: "Fetch Error", description: errorMsg });
        setHasMore(false);
      }
    } finally {
      if(isMounted){
        if(!loadMoreOperation) setLoading(false); else setLoadingMore(false);
        setIsSearching(false);
      }
    }
    return () => { isMounted = false; };
  }, [debouncedSearchTerm, filterType, filterStatus, toast, fetchTransactionDetails]);

  useEffect(() => {
    fetchTransactions(false, null);
  }, [fetchTransactions]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    fetchTransactions(false, null); 
  };

  const handleLoadMore = () => {
    if (!loadingMore && hasMore && lastVisible) {
      fetchTransactions(true, lastVisible);
    }
  };

  const openAddDialog = () => {
    addForm.reset({
      userId: '', storeId: '', storeName: '', orderId: '', clickId: '',
      productDetails: '', transactionDate: new Date(), saleAmount: 0,
      cashbackAmount: 0, status: 'pending', adminNotes: '', notesToUser: '', rejectionReason: ''
    });
    setIsAddDialogOpen(true);
  };

  const openEditDialog = (transaction: TransactionWithUser) => {
    setEditingTransaction(transaction);
    setCurrentEditStatus(transaction.status);
    setCurrentEditAdminNotes(transaction.adminNotes || '');
    setCurrentEditNotesToUser(transaction.notesToUser || '');
    setCurrentEditRejectionReason(transaction.rejectionReason || '');
    setIsEditDialogOpen(true);
  };

  const handleAddTransactionSubmit = async (data: TransactionFormValues) => {
    if (!db) { setPageError("Database not available."); setIsSaving(false); return; }
    setIsSaving(true);
    setPageError(null);
    
    try {
        await runTransaction(db, async (firestoreTransaction) => {
            const userDocRef = doc(db, 'users', data.userId);
            const userSnap = await firestoreTransaction.get(userDocRef);
            if (!userSnap.exists()) {
                throw new Error(`User with ID ${data.userId} not found.`);
            }

            const storeDocRef = doc(db, 'stores', data.storeId);
            const storeSnap = await firestoreTransaction.get(storeDocRef);
            const storeNameFromDb = storeSnap.exists() ? storeSnap.data()?.name : 'Unknown Store';
            
            const newTransactionRef = doc(collection(db, 'transactions'));
            const transactionDataToSave: Omit<Transaction, 'id'> = {
                userId: data.userId,
                storeId: data.storeId,
                storeName: data.storeName || storeNameFromDb,
                orderId: data.orderId || null,
                clickId: data.clickId || null,
                productDetails: data.productDetails || null,
                transactionDate: Timestamp.fromDate(data.transactionDate),
                saleAmount: data.saleAmount,
                initialCashbackAmount: data.cashbackAmount,
                finalSaleAmount: data.saleAmount, 
                finalCashbackAmount: data.cashbackAmount,
                currency: 'INR',
                status: data.status,
                confirmationDate: (data.status === 'confirmed' || data.status === 'paid') ? serverTimestamp() : null,
                paidDate: data.status === 'paid' ? serverTimestamp() : null,
                payoutId: null,
                reportedDate: serverTimestamp(),
                rejectionReason: (data.status === 'rejected' || data.status === 'cancelled') ? data.rejectionReason : null,
                adminNotes: data.adminNotes || null,
                notesToUser: data.notesToUser || null,
                createdAt: serverTimestamp(),
                updatedAt: serverTimestamp(),
            };
            firestoreTransaction.set(newTransactionRef, transactionDataToSave);

            const userProfileUpdates: Record<string, any> = { updatedAt: serverTimestamp() };
            if (data.status === 'pending') {
                userProfileUpdates.pendingCashback = increment(data.cashbackAmount);
            } else if (data.status === 'confirmed') { // Not 'paid' directly from add form
                userProfileUpdates.cashbackBalance = increment(data.cashbackAmount);
                userProfileUpdates.lifetimeCashback = increment(data.cashbackAmount);
            }
            // No direct update for 'paid' status here, that's part of payout flow
            if (Object.keys(userProfileUpdates).length > 1) { // only update if more than just updatedAt
                firestoreTransaction.update(userDocRef, userProfileUpdates);
            }
        });
        toast({ title: "Transaction Logged", description: `New transaction for user ${data.userId} has been logged.` });
        fetchTransactions(false, null); 
        setIsAddDialogOpen(false);
        addForm.reset();
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : "Could not add transaction.";
      setPageError(errorMsg);
      toast({ variant: "destructive", title: "Add Failed", description: errorMsg });
    } finally {
      setIsSaving(false);
    }
  };

  const handleTransactionStatusUpdate = async (newStatus: CashbackStatus) => {
    if (!editingTransaction || !editingTransaction.id || !db) {
        toast({ variant: "destructive", title: "Error", description: "No transaction selected or DB error." });
        return;
    }
    if (newStatus === 'rejected' && !currentEditRejectionReason.trim()) {
        toast({ variant: "destructive", title: "Rejection Failed", description: "Rejection reason is required." });
        return;
    }

    setIsSaving(true);
    setPageError(null);
    const originalStatus = editingTransaction.status;
    const transactionRef = doc(db, 'transactions', editingTransaction.id);
    const userRef = doc(db, 'users', editingTransaction.userId);

    try {
      await runTransaction(db, async (firestoreTransaction) => {
        const transactionSnap = await firestoreTransaction.get(transactionRef);
        const userSnap = await firestoreTransaction.get(userRef);

        if (!transactionSnap.exists()) throw new Error("Transaction not found.");
        if (!userSnap.exists()) throw new Error("User profile not found.");
        
        const currentTransactionData = transactionSnap.data() as Transaction;
        const cashbackAmount = currentTransactionData.finalCashbackAmount ?? currentTransactionData.initialCashbackAmount ?? 0;
        const userProfileUpdates: Record<string, any> = { updatedAt: serverTimestamp() };

        // Logic for balance adjustments based on status transitions
        if (originalStatus === 'pending') {
            if (newStatus === 'confirmed') {
                userProfileUpdates.pendingCashback = increment(-cashbackAmount);
                userProfileUpdates.cashbackBalance = increment(cashbackAmount);
                userProfileUpdates.lifetimeCashback = increment(cashbackAmount);
            } else if (newStatus === 'rejected' || newStatus === 'cancelled') {
                userProfileUpdates.pendingCashback = increment(-cashbackAmount);
            }
        } else if (originalStatus === 'confirmed') {
            if (newStatus === 'pending') { // Reverting confirmation
                userProfileUpdates.pendingCashback = increment(cashbackAmount);
                userProfileUpdates.cashbackBalance = increment(-cashbackAmount);
                userProfileUpdates.lifetimeCashback = increment(-cashbackAmount);
            } else if (newStatus === 'rejected' || newStatus === 'cancelled') {
                userProfileUpdates.cashbackBalance = increment(-cashbackAmount);
                userProfileUpdates.lifetimeCashback = increment(-cashbackAmount); // Assuming lifetime only counts successfully paid/confirmed cashback
            }
             // If moving from 'confirmed' to 'awaiting_payout' or 'paid', balance was already awarded.
             // 'paid' status is usually handled by the Payouts page.
        } else if (originalStatus === 'awaiting_payout') {
            if (newStatus === 'confirmed') { // Payout rejected by admin, transaction moved back to confirmed
                // No direct balance change here, user balance was already reduced on payout request.
                // This balance is restored on the Payouts page if payout is rejected.
            } else if (newStatus === 'paid') {
                // User balance already reduced. Lifetime was already incremented when it became 'confirmed'.
            }
        }

        const transactionUpdateData: Partial<Transaction> = {
            status: newStatus,
            updatedAt: serverTimestamp(),
            adminNotes: currentEditAdminNotes || null,
            notesToUser: currentEditNotesToUser || null,
        };

        if (newStatus === 'confirmed') transactionUpdateData.confirmationDate = serverTimestamp();
        if (newStatus === 'rejected' || newStatus === 'cancelled') transactionUpdateData.rejectionReason = currentEditRejectionReason.trim();
        else transactionUpdateData.rejectionReason = null;
        
        if (newStatus === 'paid') transactionUpdateData.paidDate = serverTimestamp(); // Should be set when payout is processed

        firestoreTransaction.update(transactionRef, transactionUpdateData);
        if (Object.keys(userProfileUpdates).length > 1) { // Only update if more than just updatedAt
            firestoreTransaction.update(userRef, userProfileUpdates);
        }
      });

      toast({ title: "Transaction Status Updated", description: `Transaction ${editingTransaction.id} status changed to ${newStatus}.` });
      fetchTransactions(false, null);
      setIsEditDialogOpen(false);
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : "Could not update transaction status.";
      setPageError(errorMsg);
      toast({ variant: "destructive", title: "Update Failed", description: errorMsg });
    } finally {
      setIsSaving(false);
    }
  };


  if (loading && transactions.length === 0 && !pageError) {
    return <AdminGuard><TransactionsTableSkeleton /></AdminGuard>;
  }

  return (
    <AdminGuard>
      <div className="space-y-6">
        <div className="flex justify-between items-center">
          <h1 className="text-3xl font-bold">Manage Transactions</h1>
            <Button onClick={openAddDialog}><PlusCircle className="mr-2 h-4 w-4" /> Log Reported Sale</Button>
        </div>

        {pageError && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>Error</AlertTitle>
            <AlertDescription>{pageError}</AlertDescription>
          </Alert>
        )}

        <Card>
          <CardHeader>
            <CardTitle>Filter & Search Transactions</CardTitle>
            <CardDescription>Filter by status or search by User ID, Store ID, or Order ID.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col sm:flex-row gap-4 items-end">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 w-full">
              <Select value={filterType} onValueChange={(value) => setFilterType(value as 'all' | 'userId' | 'storeId' | 'orderId' | 'status')}>
                <SelectTrigger><SelectValue placeholder="Filter by Field" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All (for general text search)</SelectItem>
                  <SelectItem value="userId">User ID</SelectItem>
                  <SelectItem value="storeId">Store ID</SelectItem>
                  <SelectItem value="orderId">Order ID</SelectItem>
                  <SelectItem value="status">Status</SelectItem>
                </SelectContent>
              </Select>
              {filterType === 'status' && (
                <Select value={filterStatus} onValueChange={(value) => { setFilterStatus(value as CashbackStatus | 'all'); fetchTransactions(false, null); }}>
                  <SelectTrigger><SelectValue placeholder="Select Status" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Statuses</SelectItem>
                    <SelectItem value="pending">Pending</SelectItem>
                    <SelectItem value="confirmed">Confirmed</SelectItem>
                    <SelectItem value="awaiting_payout">Awaiting Payout</SelectItem>
                    <SelectItem value="paid">Paid</SelectItem>
                    <SelectItem value="rejected">Rejected</SelectItem>
                    <SelectItem value="cancelled">Cancelled</SelectItem>
                  </SelectContent>
                </Select>
              )}
            </div>
            {filterType !== 'status' && (
              <form onSubmit={handleSearchSubmit} className="flex-1 flex gap-2 w-full sm:w-auto mt-4 sm:mt-0">
                <Input
                  type="search"
                  placeholder={`Search by ${filterType === 'all' ? 'any text' : filterType.replace('Id', ' ID')}...`}
                  value={searchTermInput}
                  onChange={(e) => setSearchTermInput(e.target.value)}
                  disabled={isSearching || loading}
                  className="h-10"
                />
                <Button type="submit" disabled={isSearching || loading} className="h-10">
                  {isSearching || (loading && debouncedSearchTerm) ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
                   <span className="sr-only sm:not-sr-only sm:ml-2">Search</span>
                </Button>
              </form>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Transaction List</CardTitle>
            <CardDescription>Review reported sales and manage cashback.</CardDescription>
          </CardHeader>
          <CardContent>
            {loading && transactions.length === 0 ? (
              <TransactionsTableSkeleton />
            ) : !loading && transactions.length === 0 && !pageError ? (
              <p className="text-center text-muted-foreground py-8">
                {debouncedSearchTerm || filterStatus !== 'all' ? 'No transactions found matching your criteria.' : 'No transactions recorded yet. Log a reported sale to begin.'}
              </p>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>User</TableHead>
                      <TableHead>Store</TableHead>
                      <TableHead>Order ID</TableHead>
                      <TableHead>Sale Amt.</TableHead>
                      <TableHead>Cashback Amt.</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Transaction Date</TableHead>
                      <TableHead>Details</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {transactions.map((transaction) => (
                      <TableRow key={transaction.id}>
                        <TableCell>
                          <div className="font-medium truncate max-w-[150px]" title={transaction.userDisplayName || transaction.userId}>
                            {transaction.userDisplayName || transaction.userId}
                          </div>
                          <div className="text-xs text-muted-foreground truncate max-w-[150px]" title={transaction.userEmail || undefined}>
                            {transaction.userEmail || 'N/A'}
                          </div>
                           <div className="text-[10px] font-mono text-muted-foreground/70">ID: {transaction.userId}</div>
                        </TableCell>
                        <TableCell className="truncate max-w-[150px]" title={transaction.storeName || transaction.storeId}>
                            {transaction.storeName || transaction.storeId}
                        </TableCell>
                        <TableCell className="font-mono text-xs truncate max-w-[120px]">{transaction.orderId || 'N/A'}</TableCell>
                        <TableCell>{formatCurrency(transaction.finalSaleAmount ?? transaction.saleAmount)}</TableCell>
                        <TableCell className="font-semibold text-primary">{formatCurrency(transaction.finalCashbackAmount ?? transaction.initialCashbackAmount ?? 0)}</TableCell>
                        <TableCell>
                          <Badge variant={getStatusVariant(transaction.status)} className="capitalize flex items-center gap-1 text-xs">
                            {getStatusIcon(transaction.status)}
                            {transaction.status}
                          </Badge>
                        </TableCell>
                        <TableCell className="whitespace-nowrap">{transaction.transactionDate ? format(new Date(transaction.transactionDate), 'PP') : 'N/A'}</TableCell>
                        <TableCell className="text-xs">
                           {transaction.confirmationDate && <div>Conf: {format(safeToDate(transaction.confirmationDate)!, 'PP')}</div>}
                           {transaction.paidDate && <div>Paid: {format(safeToDate(transaction.paidDate)!, 'PP')}</div>}
                           {transaction.rejectionReason && <div className="text-destructive">Rej: {transaction.rejectionReason}</div>}
                        </TableCell>
                        <TableCell className="text-right">
                              <Button variant="outline" size="sm" onClick={() => openEditDialog(transaction)}>
                                <Edit className="mr-1 h-3 w-3" /> Manage
                              </Button>
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

        <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
          <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Log Reported Sale / Add Transaction</DialogTitle>
              <DialogDescription>Manually enter transaction details as reported (e.g., from affiliate network).</DialogDescription>
            </DialogHeader>
            <form onSubmit={addForm.handleSubmit(handleAddTransactionSubmit)} className="grid gap-4 py-4">
              <div className="space-y-1">
                <Label htmlFor="userIdForm">User ID*</Label>
                <Input id="userIdForm" {...addForm.register('userId')} disabled={isSaving} />
                {addForm.formState.errors.userId && <p className="text-sm text-destructive">{addForm.formState.errors.userId.message}</p>}
              </div>
              <div className="space-y-1">
                <Label htmlFor="storeIdForm">Store ID*</Label>
                <Input id="storeIdForm" {...addForm.register('storeId')} disabled={isSaving}/>
                {addForm.formState.errors.storeId && <p className="text-sm text-destructive">{addForm.formState.errors.storeId.message}</p>}
              </div>
              <div className="space-y-1">
                <Label htmlFor="storeNameForm">Store Name (Optional)</Label>
                <Input id="storeNameForm" {...addForm.register('storeName')} disabled={isSaving} placeholder="Auto-filled if Store ID known"/>
              </div>
              <div className="space-y-1">
                <Label htmlFor="orderIdForm">Order ID</Label>
                <Input id="orderIdForm" {...addForm.register('orderId')} disabled={isSaving}/>
                 {addForm.formState.errors.orderId && <p className="text-sm text-destructive">{addForm.formState.errors.orderId.message}</p>}
              </div>
              <div className="space-y-1">
                <Label htmlFor="clickIdForm">Click ID (Optional)</Label>
                <Input id="clickIdForm" {...addForm.register('clickId')} disabled={isSaving}/>
              </div>
              <div className="space-y-1">
                <Label htmlFor="productDetailsForm">Product Details (Optional)</Label>
                <Textarea id="productDetailsForm" {...addForm.register('productDetails')} rows={2} disabled={isSaving}/>
              </div>
              <div className="space-y-1">
                 <Label htmlFor="transactionDateForm">Transaction Date*</Label>
                  <Controller name="transactionDate" control={addForm.control} render={({ field }) => (
                    <Popover>
                      <PopoverTrigger asChild>
                        <Button variant={"outline"} className={cn("w-full justify-start text-left font-normal h-10",!field.value && "text-muted-foreground")} disabled={isSaving}>
                          <CalendarIconLucide className="mr-2 h-4 w-4" />
                          {field.value ? format(field.value, "PPP") : <span>Pick a date</span>}
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0">
                        <Calendar mode="single" selected={field.value} onSelect={field.onChange} initialFocus disabled={isSaving}/>
                      </PopoverContent>
                    </Popover>
                  )} />
                  {addForm.formState.errors.transactionDate && <p className="text-sm text-destructive">{addForm.formState.errors.transactionDate.message}</p>}
              </div>
              <div className="space-y-1">
                <Label htmlFor="saleAmountForm">Sale Amount*</Label>
                <Input id="saleAmountForm" type="number" step="0.01" {...addForm.register('saleAmount', { valueAsNumber: true })} disabled={isSaving}/>
                {addForm.formState.errors.saleAmount && <p className="text-sm text-destructive">{addForm.formState.errors.saleAmount.message}</p>}
              </div>
               <div className="space-y-1">
                <Label htmlFor="cashbackAmountForm">Cashback Amount*</Label>
                <Input id="cashbackAmountForm" type="number" step="0.01" {...addForm.register('cashbackAmount', { valueAsNumber: true })} disabled={isSaving}/>
                {addForm.formState.errors.cashbackAmount && <p className="text-sm text-destructive">{addForm.formState.errors.cashbackAmount.message}</p>}
              </div>
              <div className="space-y-1">
                <Label htmlFor="statusForm">Status*</Label>
                <Controller name="status" control={addForm.control} render={({ field }) => (
                    <Select value={field.value} onValueChange={field.onChange} disabled={isSaving}>
                    <SelectTrigger id="statusForm"><SelectValue /></SelectTrigger>
                    <SelectContent>
                        <SelectItem value="pending">Pending</SelectItem>
                        <SelectItem value="confirmed">Confirmed</SelectItem>
                        <SelectItem value="rejected">Rejected</SelectItem>
                        <SelectItem value="cancelled">Cancelled</SelectItem>
                        {/* 'awaiting_payout' & 'paid' are typically set by other processes */}
                    </SelectContent>
                    </Select>
                )} />
                {addForm.formState.errors.status && <p className="text-sm text-destructive">{addForm.formState.errors.status.message}</p>}
              </div>
              {(addForm.watch('status') === 'rejected' || addForm.watch('status') === 'cancelled') && (
                  <div className="space-y-1">
                      <Label htmlFor="rejectionReasonForm">Rejection Reason</Label>
                      <Input id="rejectionReasonForm" {...addForm.register('rejectionReason')} placeholder="Required if rejected/cancelled"/>
                       {addForm.formState.errors.rejectionReason && <p className="text-sm text-destructive">{addForm.formState.errors.rejectionReason.message}</p>}
                  </div>
              )}
              <div className="space-y-1">
                <Label htmlFor="adminNotesForm">Admin Notes (Optional)</Label>
                <Textarea id="adminNotesForm" {...addForm.register('adminNotes')} rows={2} disabled={isSaving}/>
              </div>
              <div className="space-y-1">
                <Label htmlFor="notesToUserForm">Notes for User (Optional)</Label>
                <Textarea id="notesToUserForm" {...addForm.register('notesToUser')} rows={2} disabled={isSaving}/>
              </div>
              <DialogFooter>
                <DialogClose asChild>
                  <Button type="button" variant="outline" disabled={isSaving}>Cancel</Button>
                </DialogClose>
                <Button type="submit" disabled={isSaving}>
                  {isSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                  Log Transaction
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>

        <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
          <DialogContent className="sm:max-w-lg">
            <DialogHeader>
              <DialogTitle>Manage Transaction</DialogTitle>
              <DialogDescription>
                Review and update transaction ID: {editingTransaction?.id}
              </DialogDescription>
            </DialogHeader>
            {editingTransaction && (
              <div className="space-y-4 py-4">
                <p className="text-sm"><strong>User:</strong> {editingTransaction.userDisplayName} ({editingTransaction.userId})</p>
                <p className="text-sm"><strong>Store:</strong> {editingTransaction.storeName}</p>
                <p className="text-sm"><strong>Order ID:</strong> {editingTransaction.orderId || 'N/A'}</p>
                <p className="text-sm"><strong>Sale:</strong> {formatCurrency(editingTransaction.finalSaleAmount ?? editingTransaction.saleAmount)} | <strong>Cashback:</strong> {formatCurrency(editingTransaction.finalCashbackAmount ?? editingTransaction.initialCashbackAmount ?? 0)}</p>
                <p className="text-sm"><strong>Current Status:</strong> <Badge variant={getStatusVariant(editingTransaction.status)}>{editingTransaction.status}</Badge></p>
                <hr/>
                <div>
                  <Label htmlFor="editAdminNotes">Admin Notes</Label>
                  <Textarea id="editAdminNotes" value={currentEditAdminNotes} onChange={(e) => setCurrentEditAdminNotes(e.target.value)} disabled={isSaving} />
                </div>
                <div>
                  <Label htmlFor="editNotesToUser">Notes for User</Label>
                  <Textarea id="editNotesToUser" value={currentEditNotesToUser} onChange={(e) => setCurrentEditNotesToUser(e.target.value)} disabled={isSaving} />
                </div>

                {editingTransaction.status === 'pending' && (
                  <>
                    <hr/>
                    <div className="space-y-2">
                      <Label htmlFor="editRejectionReason">Rejection Reason (Required if rejecting)</Label>
                      <Textarea id="editRejectionReason" value={currentEditRejectionReason} onChange={(e) => setCurrentEditRejectionReason(e.target.value)} placeholder="Enter reason for rejection" disabled={isSaving} />
                    </div>
                    <DialogFooter>
                        <Button onClick={() => handleTransactionStatusUpdate('rejected')} variant="destructive" disabled={isSaving || !currentEditRejectionReason.trim()}>
                            {isSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <ThumbsDown className="mr-2 h-4 w-4" />} Reject
                        </Button>
                        <Button onClick={() => handleTransactionStatusUpdate('confirmed')} disabled={isSaving}>
                            {isSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <ThumbsUp className="mr-2 h-4 w-4" />} Approve
                        </Button>
                    </DialogFooter>
                  </>
                )}
                {editingTransaction.status === 'confirmed' && (
                    <DialogFooter>
                         <Button onClick={() => handleTransactionStatusUpdate('pending')} variant="outline" disabled={isSaving}>
                            {isSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null} Revert to Pending
                        </Button>
                        <Button onClick={() => handleTransactionStatusUpdate('rejected')} variant="destructive" disabled={isSaving || !currentEditRejectionReason.trim()}>
                           {isSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null} Reject
                        </Button>
                    </DialogFooter>
                )}
                 {(editingTransaction.status === 'rejected' || editingTransaction.status === 'cancelled') && (
                    <DialogFooter>
                         <Button onClick={() => handleTransactionStatusUpdate('pending')} variant="outline" disabled={isSaving}>
                            {isSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null} Re-evaluate (Set to Pending)
                        </Button>
                    </DialogFooter>
                )}
                 {/* For 'awaiting_payout' or 'paid', typically only notes might be updatable or status changes handled by payout system */}
                 {(editingTransaction.status === 'awaiting_payout' || editingTransaction.status === 'paid') && (
                     <DialogFooter>
                        <Button onClick={() => handleTransactionStatusUpdate(editingTransaction.status)} disabled={isSaving}>
                            {isSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null} Update Notes
                        </Button>
                    </DialogFooter>
                 )}
              </div>
            )}
             {editingTransaction && editingTransaction.status !== 'pending' && editingTransaction.status !== 'confirmed' && editingTransaction.status !== 'rejected' && editingTransaction.status !== 'cancelled' && (
                <DialogFooter className="pt-0">
                    <DialogClose asChild><Button variant="outline">Close</Button></DialogClose>
                </DialogFooter>
             )}
          </DialogContent>
        </Dialog>
      </div>
    </AdminGuard>
  );
}

    