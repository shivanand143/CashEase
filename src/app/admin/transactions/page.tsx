
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
} from "@/components/ui/dialog";
import AdminGuard from '@/components/guards/admin-guard';
import { formatCurrency, safeToDate } from '@/lib/utils';
import { format } from 'date-fns';
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { cn } from "@/lib/utils";
import { useDebounce } from '@/hooks/use-debounce';

const TRANSACTIONS_PER_PAGE = 15;

const transactionFormSchema = z.object({
  userId: z.string().min(1, "User ID is required."),
  storeId: z.string().min(1, "Store ID is required."),
  storeName: z.string().optional().nullable(),
  orderId: z.string().min(1, "Order ID is required").optional().nullable(),
  clickId: z.string().optional().nullable(),
  productDetails: z.string().optional().nullable(),
  transactionDate: z.date({ required_error: "Transaction date is required."}),
  saleAmount: z.number({ required_error: "Sale amount is required."}).min(0, "Sale amount must be non-negative."),
  cashbackAmount: z.number({ required_error: "Cashback amount is required."}).min(0, "Cashback amount must be non-negative."), // This is initialCashbackAmount
  status: z.enum(['pending', 'confirmed', 'rejected', 'cancelled'] as [CashbackStatus, ...CashbackStatus[]], { required_error: "Status is required."}), // Admin can only set these initial statuses
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
    case 'confirmed': return 'default'; // Green-like
    case 'paid': return 'secondary'; // Blue/Purple-like
    case 'pending': return 'outline'; // Yellow-like
    case 'awaiting_payout': return 'default'; // Can be similar to confirmed or a different shade
    case 'rejected':
    case 'cancelled': return 'destructive'; // Red-like
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

  // State for the edit/manage dialog's editable fields
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
     // eslint-disable-next-line react-hooks/exhaustive-deps
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
      console.log(`ADMIN_TX: Fetched ${querySnapshot.size} raw transactions.`);

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
        console.log(`ADMIN_TX: Processed ${transactionsWithDetails.length} transactions. HasMore: ${querySnapshot.docs.length === TRANSACTIONS_PER_PAGE && transactionsWithDetails.length > 0}`);
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
     // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterStatus, debouncedSearchTerm]); // Removed fetchTransactions

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
    setCurrentEditAdminNotes(transaction.adminNotes || '');
    setCurrentEditNotesToUser(transaction.notesToUser || '');
    setCurrentEditRejectionReason(transaction.rejectionReason || '');
    // Note: status change itself is handled by Approve/Reject buttons, not a Select here for pending.
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

            let storeNameFromDb = data.storeName;
            if (!storeNameFromDb && data.storeId) {
                const storeDocRef = doc(db, 'stores', data.storeId);
                const storeSnap = await firestoreTransaction.get(storeDocRef);
                storeNameFromDb = storeSnap.exists() ? storeSnap.data()?.name : 'Unknown Store';
            }
            
            const newTransactionRef = doc(collection(db, 'transactions'));
            const transactionDataToSave: Omit<Transaction, 'id'> = {
                userId: data.userId,
                storeId: data.storeId,
                storeName: storeNameFromDb || 'Unknown Store',
                orderId: data.orderId || null,
                clickId: data.clickId || null,
                productDetails: data.productDetails || null,
                transactionDate: Timestamp.fromDate(data.transactionDate),
                saleAmount: data.saleAmount,
                initialCashbackAmount: data.cashbackAmount, // Use form's cashbackAmount as initial
                finalSaleAmount: data.saleAmount, 
                finalCashbackAmount: data.cashbackAmount, // Default finalCashback to initial
                currency: 'INR',
                status: data.status,
                confirmationDate: (data.status === 'confirmed') ? serverTimestamp() : null,
                paidDate: null, // Paid status is handled by payout flow
                payoutId: null,
                reportedDate: serverTimestamp(),
                rejectionReason: (data.status === 'rejected' || data.status === 'cancelled') ? data.rejectionReason : null,
                adminNotes: data.adminNotes || null,
                notesToUser: data.notesToUser || null,
                createdAt: serverTimestamp(),
                updatedAt: serverTimestamp(),
            };
            firestoreTransaction.set(newTransactionRef, transactionDataToSave);
            console.log(`ADMIN_TX: Created new transaction ${newTransactionRef.id} with status ${data.status}`);

            // Update user balances based on initial status
            const userProfileUpdates: Record<string, any> = { updatedAt: serverTimestamp() };
            if (data.status === 'pending') {
                userProfileUpdates.pendingCashback = increment(data.cashbackAmount);
            } else if (data.status === 'confirmed') {
                userProfileUpdates.cashbackBalance = increment(data.cashbackAmount);
                userProfileUpdates.lifetimeCashback = increment(data.cashbackAmount);
            }
            // Only update if there are balance changes
            if (data.status === 'pending' || data.status === 'confirmed') {
                firestoreTransaction.update(userDocRef, userProfileUpdates);
                console.log(`ADMIN_TX: User ${data.userId} balances updated for new transaction. Pending: ${data.status === 'pending' ? data.cashbackAmount : 0}, Confirmed: ${data.status === 'confirmed' ? data.cashbackAmount : 0}`);
            }
        });
        toast({ title: "Transaction Logged", description: `New transaction for user ${data.userId} has been logged.` });
        fetchTransactions(false, null); 
        setIsAddDialogOpen(false);
        addForm.reset();
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : "Could not add transaction.";
      setPageError(errorMsg);
      console.error("ADMIN_TX: Error adding transaction:", err);
      toast({ variant: "destructive", title: "Add Failed", description: errorMsg });
    } finally {
      setIsSaving(false);
    }
  };

  const handleApproveTransaction = async () => {
    if (!editingTransaction || !editingTransaction.id || !db || editingTransaction.status !== 'pending') {
        toast({ variant: "destructive", title: "Error", description: "No valid pending transaction selected or DB error." });
        return;
    }
    setIsSaving(true);
    setPageError(null);
    const transactionRef = doc(db, 'transactions', editingTransaction.id);
    const userRef = doc(db, 'users', editingTransaction.userId);
    const cashbackAmount = editingTransaction.finalCashbackAmount ?? editingTransaction.initialCashbackAmount ?? 0;

    try {
      await runTransaction(db, async (firestoreTransaction) => {
        const transactionSnap = await firestoreTransaction.get(transactionRef);
        const userSnap = await firestoreTransaction.get(userRef);

        if (!transactionSnap.exists()) throw new Error("Transaction not found.");
        if (!userSnap.exists()) throw new Error("User profile not found.");
        
        const currentTransactionData = transactionSnap.data() as Transaction;
        if (currentTransactionData.status !== 'pending') throw new Error("Transaction is no longer pending.");

        firestoreTransaction.update(transactionRef, {
            status: 'confirmed' as CashbackStatus,
            confirmationDate: serverTimestamp(),
            updatedAt: serverTimestamp(),
            adminNotes: currentEditAdminNotes || null,
            notesToUser: currentEditNotesToUser || null,
            rejectionReason: null, 
        });
        
        firestoreTransaction.update(userRef, {
            pendingCashback: increment(-cashbackAmount),
            cashbackBalance: increment(cashbackAmount),
            lifetimeCashback: increment(cashbackAmount),
            updatedAt: serverTimestamp()
        });
        console.log(`ADMIN_TX: Approved transaction ${editingTransaction.id}. User ${editingTransaction.userId} balances updated. Cashback: ${cashbackAmount}`);
      });

      toast({ title: "Transaction Approved", description: `Transaction ${editingTransaction.id} status changed to Confirmed.` });
      fetchTransactions(false, null); // Refresh list
      setIsEditDialogOpen(false);
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : "Could not approve transaction.";
      setPageError(errorMsg);
      console.error("ADMIN_TX: Error approving transaction:", err);
      toast({ variant: "destructive", title: "Approval Failed", description: errorMsg });
    } finally {
      setIsSaving(false);
    }
  };

  const handleRejectTransaction = async () => {
    if (!editingTransaction || !editingTransaction.id || !db || editingTransaction.status !== 'pending') {
        toast({ variant: "destructive", title: "Error", description: "No valid pending transaction selected or DB error." });
        return;
    }
    if (!currentEditRejectionReason.trim()) {
        toast({ variant: "destructive", title: "Rejection Failed", description: "Rejection reason is required." });
        return;
    }
    setIsSaving(true);
    setPageError(null);
    const transactionRef = doc(db, 'transactions', editingTransaction.id);
    const userRef = doc(db, 'users', editingTransaction.userId);
    const cashbackAmount = editingTransaction.finalCashbackAmount ?? editingTransaction.initialCashbackAmount ?? 0;

    try {
      await runTransaction(db, async (firestoreTransaction) => {
        const transactionSnap = await firestoreTransaction.get(transactionRef);
        const userSnap = await firestoreTransaction.get(userRef);

        if (!transactionSnap.exists()) throw new Error("Transaction not found.");
        if (!userSnap.exists()) throw new Error("User profile not found.");

        const currentTransactionData = transactionSnap.data() as Transaction;
        if (currentTransactionData.status !== 'pending') throw new Error("Transaction is no longer pending.");

        firestoreTransaction.update(transactionRef, {
            status: 'rejected' as CashbackStatus,
            rejectionReason: currentEditRejectionReason.trim(),
            updatedAt: serverTimestamp(),
            adminNotes: currentEditAdminNotes || null,
            notesToUser: currentEditNotesToUser || null,
            confirmationDate: null, 
        });
        
        firestoreTransaction.update(userRef, {
            pendingCashback: increment(-cashbackAmount), // Decrement pending cashback
            updatedAt: serverTimestamp()
            // No change to cashbackBalance or lifetimeCashback
        });
        console.log(`ADMIN_TX: Rejected transaction ${editingTransaction.id}. User ${editingTransaction.userId} pendingCashback updated by -${cashbackAmount}. Rejection reason: ${currentEditRejectionReason.trim()}`);
      });

      toast({ title: "Transaction Rejected", description: `Transaction ${editingTransaction.id} status changed to Rejected.` });
      fetchTransactions(false, null); // Refresh list
      setIsEditDialogOpen(false);
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : "Could not reject transaction.";
      setPageError(errorMsg);
      console.error("ADMIN_TX: Error rejecting transaction:", err);
      toast({ variant: "destructive", title: "Rejection Failed", description: errorMsg });
    } finally {
      setIsSaving(false);
    }
  };
  
  // Handler for updating notes on an already processed transaction
  const handleUpdateNotes = async () => {
    if (!editingTransaction || !editingTransaction.id || !db) {
        toast({ variant: "destructive", title: "Error", description: "No transaction selected or DB error." });
        return;
    }
    if (editingTransaction.status === 'pending') {
        toast({ variant: "info", title: "Action Not Allowed", description: "Please approve or reject pending transactions first." });
        return;
    }
    setIsSaving(true);
    setPageError(null);
    const transactionRef = doc(db, 'transactions', editingTransaction.id);
    try {
        await updateDoc(transactionRef, {
            adminNotes: currentEditAdminNotes || null,
            notesToUser: currentEditNotesToUser || null,
            updatedAt: serverTimestamp()
        });
        toast({ title: "Transaction Notes Updated" });
        fetchTransactions(false, null); // Refresh list
        setIsEditDialogOpen(false);
    } catch (err) {
        const errorMsg = err instanceof Error ? err.message : "Could not update notes.";
        setPageError(errorMsg);
        console.error("ADMIN_TX: Error updating notes:", err);
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
                <Select value={filterStatus} onValueChange={(value) => { setFilterStatus(value as CashbackStatus | 'all'); }}>
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

        {/* Edit/Manage Transaction Dialog */}
        <Dialog open={isEditDialogOpen} onOpenChange={(isOpen) => {
            if (!isOpen) setEditingTransaction(null);
            setIsEditDialogOpen(isOpen);
        }}>
          <DialogContent className="sm:max-w-lg">
            <DialogHeader>
              <DialogTitle>Manage Transaction</DialogTitle>
              {editingTransaction && (
                <DialogDescription>
                  ID: {editingTransaction.id} <br/>
                  User: {editingTransaction.userDisplayName || editingTransaction.userId} ({editingTransaction.userEmail || 'N/A'}) <br/>
                  Store: {editingTransaction.storeName || editingTransaction.storeId} | Order ID: {editingTransaction.orderId || 'N/A'} <br/>
                  Sale: {formatCurrency(editingTransaction.finalSaleAmount ?? editingTransaction.saleAmount)} | Cashback: {formatCurrency(editingTransaction.finalCashbackAmount ?? editingTransaction.initialCashbackAmount ?? 0)} <br/>
                  Current Status: <Badge variant={getStatusVariant(editingTransaction.status)} className="capitalize">{editingTransaction.status}</Badge>
                </DialogDescription>
              )}
            </DialogHeader>
            {editingTransaction && (
              <div className="space-y-4 py-4">
                <div>
                  <Label htmlFor="editAdminNotes">Admin Notes</Label>
                  <Textarea id="editAdminNotes" value={currentEditAdminNotes} onChange={(e) => setCurrentEditAdminNotes(e.target.value)} disabled={isSaving} />
                </div>
                <div>
                  <Label htmlFor="editNotesToUser">Notes for User (will be visible in their history)</Label>
                  <Textarea id="editNotesToUser" value={currentEditNotesToUser} onChange={(e) => setCurrentEditNotesToUser(e.target.value)} disabled={isSaving} />
                </div>

                {editingTransaction.status === 'pending' && (
                  <>
                    <div className="space-y-2">
                      <Label htmlFor="editRejectionReason">Rejection Reason (Required if rejecting)</Label>
                      <Textarea id="editRejectionReason" value={currentEditRejectionReason} onChange={(e) => setCurrentEditRejectionReason(e.target.value)} placeholder="Enter reason for rejection" disabled={isSaving} />
                    </div>
                    <DialogFooter>
                        <Button onClick={handleRejectTransaction} variant="destructive" disabled={isSaving || !currentEditRejectionReason.trim()}>
                            {isSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <ThumbsDown className="mr-2 h-4 w-4" />} Reject
                        </Button>
                        <Button onClick={handleApproveTransaction} disabled={isSaving}>
                            {isSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <ThumbsUp className="mr-2 h-4 w-4" />} Approve
                        </Button>
                    </DialogFooter>
                  </>
                )}
                {editingTransaction.status !== 'pending' && (
                    <DialogFooter>
                        <DialogClose asChild><Button variant="outline" disabled={isSaving}>Cancel</Button></DialogClose>
                        <Button onClick={handleUpdateNotes} disabled={isSaving}>
                            {isSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null} Update Notes
                        </Button>
                    </DialogFooter>
                )}
              </div>
            )}
          </DialogContent>
        </Dialog>
      </div>
    </AdminGuard>
  );
}
