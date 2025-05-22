
"use client";

import * as React from 'react';
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
  increment,
  writeBatch
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
import { AlertCircle, Loader2, Search, Edit, PlusCircle, CheckCircle, XCircle, Info, ListFilter, Calendar as CalendarIconLucide, IndianRupee, ThumbsUp, ThumbsDown, Eye } from 'lucide-react';
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
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { useAuth } from '@/hooks/use-auth';

const TRANSACTIONS_PER_PAGE = 15;
const ADMIN_TX_LOG_PREFIX = "ADMIN_TXN_PAGE:";

const transactionFormSchema = z.object({
  userId: z.string().min(1, "User ID is required."),
  storeId: z.string().min(1, "Store ID is required."),
  storeName: z.string().optional().nullable(),
  orderId: z.string().min(1, "Order ID is required").optional().nullable(),
  clickId: z.string().optional().nullable(),
  conversionId: z.string().optional().nullable(),
  productDetails: z.string().optional().nullable(),
  transactionDate: z.date({ required_error: "Transaction date is required."}),
  saleAmount: z.number({ required_error: "Sale amount is required."}).min(0, "Sale amount must be non-negative."),
  initialCashbackAmount: z.number({ required_error: "Cashback amount is required."}).min(0, "Cashback amount must be non-negative."),
  cashbackRateApplied: z.string().optional().nullable(),
  status: z.enum(['pending', 'confirmed', 'rejected', 'cancelled'] as [CashbackStatus, ...CashbackStatus[]], { required_error: "Status is required."}),
  adminNotes: z.string().optional().nullable(),
  notesToUser: z.string().optional().nullable(),
  rejectionReason: z.string().optional().nullable(),
}).refine(data => !( (data.status === 'rejected' || data.status === 'cancelled') && !data.rejectionReason?.trim()), {
    message: "Rejection reason is required if status is 'rejected' or 'cancelled'.",
    path: ["rejectionReason"],
});

// For the edit dialog, we might use a simpler schema or direct state manipulation for status changes
const editTransactionStatusSchema = z.object({
    status: z.enum(['pending', 'confirmed', 'rejected', 'paid', 'cancelled'] as [CashbackStatus, ...CashbackStatus[]]),
    finalSaleAmount: z.number().min(0).optional().nullable(),
    finalCashbackAmount: z.number().min(0).optional().nullable(),
    adminNotes: z.string().optional().nullable(),
    notesToUser: z.string().optional().nullable(),
    rejectionReason: z.string().optional().nullable(),
});


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
        <div className="overflow-x-auto w-full">
          <Table>
            <TableHeader>
              <TableRow>
                {Array.from({ length: 10 }).map((_, index) => ( // Increased column count
                  <TableHead key={index} className="min-w-[120px]"><Skeleton className="h-5 w-full" /></TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {Array.from({ length: 10 }).map((_, rowIndex) => (
                <TableRow key={rowIndex}>
                  {Array.from({ length: 10 }).map((_, colIndex) => (
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
    case 'awaiting_payout': return 'default'; // Assuming this is a positive intermediate step
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
    case 'awaiting_payout': return <Hourglass className="h-3 w-3 text-purple-600" />;
    case 'rejected':
    case 'cancelled': return <XCircle className="h-3 w-3 text-red-600" />;
    default: return <Info className="h-3 w-3 text-muted-foreground" />;
  }
};

export default function AdminTransactionsPage() {
  const { user: adminUser, loading: authLoading } = useAuth();
  const [transactions, setTransactions] = React.useState<TransactionWithUser[]>([]);
  const [pageLoading, setPageLoading] = React.useState(true);
  const [pageError, setPageError] = React.useState<string | null>(null);
  const [lastVisible, setLastVisible] = React.useState<QueryDocumentSnapshot<DocumentData> | null>(null);
  const [hasMore, setHasMore] = React.useState(true);
  const [loadingMore, setLoadingMore] = React.useState(false);
  const { toast } = useToast();

  const [filterType, setFilterType] = React.useState<'all' | 'userId' | 'storeId' | 'orderId' | 'status' | 'clickId' | 'conversionId'>('all');
  const [filterStatus, setFilterStatus] = React.useState<CashbackStatus | 'all'>('all');
  const [searchTermInput, setSearchTermInput] = React.useState('');
  const debouncedSearchTerm = useDebounce(searchTermInput, 500);
  const [isSearching, setIsSearching] = React.useState(false);

  const [isAddDialogOpen, setIsAddDialogOpen] = React.useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = React.useState(false);
  const [editingTransaction, setEditingTransaction] = React.useState<TransactionWithUser | null>(null);
  const [isSaving, setIsSaving] = React.useState(false);

  // States for edit dialog inputs (to manage them outside react-hook-form for simple edits)
  const [currentEditStatus, setCurrentEditStatus] = React.useState<CashbackStatus>('pending');
  const [currentEditAdminNotes, setCurrentEditAdminNotes] = React.useState('');
  const [currentEditNotesToUser, setCurrentEditNotesToUser] = React.useState('');
  const [currentEditRejectionReason, setCurrentEditRejectionReason] = React.useState('');
  const [currentEditFinalSaleAmount, setCurrentEditFinalSaleAmount] = React.useState<number | undefined>(undefined);
  const [currentEditFinalCashbackAmount, setCurrentEditFinalCashbackAmount] = React.useState<number | undefined>(undefined);


  const [userCache, setUserCache] = React.useState<Record<string, Pick<UserProfile, 'displayName' | 'email'>>>({});
  const [storeCache, setStoreCache] = React.useState<Record<string, Pick<Store, 'name'>>>({});
  const isMountedRef = React.useRef(true);

  const addForm = useForm<AppTransactionFormValues>({ // Use AppTransactionFormValues
    resolver: zodResolver(transactionFormSchema), // Use the correct Zod schema
    defaultValues: {
      userId: '', storeId: '', storeName: '', orderId: null, clickId: null, conversionId: null,
      productDetails: '', transactionDate: new Date(), saleAmount: 0,
      initialCashbackAmount: 0, cashbackRateApplied: '', status: 'pending', adminNotes: '', notesToUser: '', rejectionReason: ''
    },
  });

  // Fetch User/Store details for display
  const fetchTransactionDetails = React.useCallback(async (rawTransactions: Transaction[]): Promise<TransactionWithUser[]> => {
    // ... (implementation remains similar to previous, ensure userCache and storeCache are used) ...
     if (!db || firebaseInitializationError || rawTransactions.length === 0) {
      return rawTransactions.map(tx => ({ ...tx, userDisplayName: tx.userId, storeName: tx.storeName || tx.storeId }));
    }
    const userIdsToFetch = [...new Set(rawTransactions.map(tx => tx.userId).filter(id => id && !userCache[id]))];
    const storeIdsToFetch = [...new Set(rawTransactions.flatMap(tx => (tx.storeId && !storeCache[tx.storeId] && !tx.storeName) ? [tx.storeId] : []))];

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
        setUserCache(prev => ({ ...prev, ...newUsers }));
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
        setStoreCache(prev => ({ ...prev, ...newStores }));
      }
    } catch (detailError) {
      toast({ variant: "destructive", title: "Detail Fetch Error", description: "Could not load some user/store names." });
    }
    return rawTransactions.map(tx => ({
      ...tx,
      userDisplayName: userCache[tx.userId]?.displayName || tx.userId,
      userEmail: userCache[tx.userId]?.email,
      storeName: tx.storeName || storeCache[tx.storeId]?.name || tx.storeId,
    }));
  }, [userCache, storeCache, toast]);


  const fetchTransactions = React.useCallback(async (
    loadMoreOp = false,
    docToStartAfter: QueryDocumentSnapshot<DocumentData> | null = null
  ) => {
    if (!isMountedRef.current) return;
    if (!db || firebaseInitializationError) {
      setPageError(firebaseInitializationError || "DB not ready.");
      setPageLoading(false); setLoadingMore(false); setHasMore(false);
      return;
    }

    if (!loadMoreOp) {
      setPageLoading(true); setTransactions([]); setLastVisible(null); setHasMore(true);
    } else {
      if (!docToStartAfter) { setLoadingMore(false); return; }
      setLoadingMore(true);
    }
    if(!loadMoreOp) setPageError(null);
    setIsSearching(debouncedSearchTerm !== '');

    try {
      const transactionsCollectionRef = collection(db, 'transactions');
      let constraints: QueryConstraint[] = [];

      if (filterStatus !== 'all') constraints.push(where('status', '==', filterStatus));
      if (debouncedSearchTerm.trim() && filterType !== 'all' && filterType !== 'status') {
          constraints.push(where(filterType, '==', debouncedSearchTerm.trim()));
      }
      constraints.push(orderBy('transactionDate', 'desc'));
      if (loadMoreOp && docToStartAfter) constraints.push(startAfter(docToStartAfter));
      constraints.push(limit(TRANSACTIONS_PER_PAGE));

      const q = query(transactionsCollectionRef, ...constraints);
      const querySnapshot = await getDocs(q);

      const rawTransactionsData = querySnapshot.docs.map(docSnap => ({
        id: docSnap.id, ...docSnap.data(),
        transactionDate: safeToDate(docSnap.data().transactionDate as Timestamp | undefined) || new Date(0),
        confirmationDate: safeToDate(docSnap.data().confirmationDate as Timestamp | undefined),
        paidDate: safeToDate(docSnap.data().paidDate as Timestamp | undefined),
        createdAt: safeToDate(docSnap.data().createdAt as Timestamp | undefined) || new Date(0),
        updatedAt: safeToDate(docSnap.data().updatedAt as Timestamp | undefined) || new Date(0),
      } as Transaction));
      
      let filteredForGeneralSearch = rawTransactionsData;
      if (debouncedSearchTerm && filterType === 'all') {
         const lowerSearch = debouncedSearchTerm.toLowerCase();
         filteredForGeneralSearch = rawTransactionsData.filter(tx =>
           (tx.userId && tx.userId.toLowerCase().includes(lowerSearch)) ||
           (tx.storeId && tx.storeId.toLowerCase().includes(lowerSearch)) ||
           (tx.storeName && tx.storeName.toLowerCase().includes(lowerSearch)) ||
           (tx.orderId && tx.orderId.toLowerCase().includes(lowerSearch)) ||
           (tx.clickId && tx.clickId.toLowerCase().includes(lowerSearch)) ||
           (tx.conversionId && tx.conversionId.toLowerCase().includes(lowerSearch)) ||
           (tx.productDetails && tx.productDetails.toLowerCase().includes(lowerSearch))
         );
      }
      const transactionsWithDetails = await fetchTransactionDetails(filteredForGeneralSearch);
      
      if(isMountedRef.current){
        setTransactions(prev => loadMoreOp ? [...prev, ...transactionsWithDetails] : transactionsWithDetails);
        setLastVisible(querySnapshot.docs[querySnapshot.docs.length - 1] || null);
        setHasMore(transactionsWithDetails.length === TRANSACTIONS_PER_PAGE);
      }
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : "Failed to fetch transactions";
      if(isMountedRef.current) { setPageError(errorMsg); toast({ variant: "destructive", title: "Fetch Error", description: errorMsg }); setHasMore(false); }
    } finally {
      if(isMountedRef.current){ setPageLoading(false); setLoadingMore(false); setIsSearching(false); }
    }
  }, [debouncedSearchTerm, filterType, filterStatus, toast, fetchTransactionDetails]);

  React.useEffect(() => {
    isMountedRef.current = true;
    if (authLoading) { setPageLoading(true); return; }
    if (!adminUser && !authLoading) { setPageLoading(false); return; }
    fetchTransactions(false, null);
    return () => { isMountedRef.current = false; };
  }, [authLoading, adminUser, filterStatus, debouncedSearchTerm, fetchTransactions]);


  const handleSearchSubmit = (e: React.FormEvent) => e.preventDefault();
  const handleLoadMore = () => { if (!loadingMore && hasMore && lastVisible) fetchTransactions(true, lastVisible); };

  const openAddDialog = () => {
    addForm.reset({
      userId: '', storeId: '', storeName: '', orderId: null, clickId: null, conversionId: null,
      productDetails: '', transactionDate: new Date(), saleAmount: 0,
      initialCashbackAmount: 0, cashbackRateApplied: '', status: 'pending', adminNotes: '', notesToUser: '', rejectionReason: ''
    });
    setIsAddDialogOpen(true);
  };

  const openEditDialog = (txItem: TransactionWithUser) => {
    setEditingTransaction(txItem);
    setCurrentEditStatus(txItem.status);
    setCurrentEditAdminNotes(txItem.adminNotes || '');
    setCurrentEditNotesToUser(txItem.notesToUser || '');
    setCurrentEditRejectionReason(txItem.rejectionReason || '');
    setCurrentEditFinalSaleAmount(txItem.finalSaleAmount ?? txItem.saleAmount);
    setCurrentEditFinalCashbackAmount(txItem.finalCashbackAmount ?? txItem.initialCashbackAmount);
    setIsEditDialogOpen(true);
  };

  const handleAddTransactionSubmit = async (data: AppTransactionFormValues) => {
    const operation = "handleAddTransactionSubmit";
    console.log(`%c[${ADMIN_TX_LOG_PREFIX}:${operation}]%c Attempting to add transaction:`, "color: blue; font-weight: bold;", "color: black;", data);
    if (!db) { setPageError("Database not available."); setIsSaving(false); return; }
    setIsSaving(true); setPageError(null);
    
    try {
        await runTransaction(db, async (firestoreTransaction) => {
            const userDocRef = doc(db, 'users', data.userId);
            const userSnap = await firestoreTransaction.get(userDocRef);
            if (!userSnap.exists()) throw new Error(`User with ID ${data.userId} not found.`);

            let storeNameFromDb = data.storeName;
            if (!storeNameFromDb && data.storeId) {
                const storeDocRef = doc(db, 'stores', data.storeId);
                const storeSnap = await firestoreTransaction.get(storeDocRef);
                storeNameFromDb = storeSnap.exists() ? storeSnap.data()?.name : 'Unknown Store';
            }
            
            const newTransactionRef = doc(collection(db, 'transactions'));
            const transactionDataToSave: Omit<Transaction, 'id'> = {
                userId: data.userId, storeId: data.storeId, storeName: storeNameFromDb || 'Unknown Store',
                orderId: data.orderId || null, clickId: data.clickId || null, conversionId: data.conversionId || null,
                productDetails: data.productDetails || null, transactionDate: Timestamp.fromDate(data.transactionDate),
                saleAmount: data.saleAmount, initialCashbackAmount: data.initialCashbackAmount,
                finalSaleAmount: data.saleAmount, finalCashbackAmount: data.initialCashbackAmount, // Initially same
                currency: 'INR', status: data.status, confirmationDate: (data.status === 'confirmed') ? serverTimestamp() : null,
                paidDate: null, payoutId: null, reportedDate: serverTimestamp(),
                rejectionReason: (data.status === 'rejected' || data.status === 'cancelled') ? data.rejectionReason || null : null,
                adminNotes: data.adminNotes || null, notesToUser: data.notesToUser || null,
                createdAt: serverTimestamp(), updatedAt: serverTimestamp(),
            };
            firestoreTransaction.set(newTransactionRef, transactionDataToSave);

            const userProfileUpdates: Record<string, any> = { updatedAt: serverTimestamp() };
            if (data.status === 'pending') {
                userProfileUpdates.pendingCashback = increment(data.initialCashbackAmount);
            } else if (data.status === 'confirmed') {
                userProfileUpdates.cashbackBalance = increment(data.initialCashbackAmount);
                userProfileUpdates.lifetimeCashback = increment(data.initialCashbackAmount);
            }
             if (Object.keys(userProfileUpdates).length > 1) firestoreTransaction.update(userDocRef, userProfileUpdates);
        });
        toast({ title: "Transaction Logged", description: `New transaction for user ${data.userId} has been logged.` });
        fetchTransactions(false, null); setIsAddDialogOpen(false); addForm.reset();
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : "Could not add transaction.";
      setPageError(errorMsg); toast({ variant: "destructive", title: "Add Failed", description: errorMsg });
    } finally {
      setIsSaving(false);
    }
  };

  const handleTransactionStatusUpdate = async (newStatus: CashbackStatus) => {
    const operation = "handleTransactionStatusUpdate";
    if (!editingTransaction || !editingTransaction.id || !db) {
        toast({ variant: "destructive", title: "Error", description: "No transaction selected or DB error." }); return;
    }
    if ((newStatus === 'rejected' || newStatus === 'cancelled') && !currentEditRejectionReason.trim()) {
        toast({ variant: "destructive", title: "Input Required", description: "Reason is required for rejection/cancellation." }); return;
    }
    setIsSaving(true); setPageError(null);

    const transactionRef = doc(db, 'transactions', editingTransaction.id);
    const userRef = doc(db, 'users', editingTransaction.userId);
    const originalStatus = editingTransaction.status;
    const originalInitialCashback = editingTransaction.initialCashbackAmount || 0;
    const originalFinalCashback = editingTransaction.finalCashbackAmount ?? originalInitialCashback;
    
    // Use current values from state for final amounts if admin modified them
    const newFinalSaleAmount = currentEditFinalSaleAmount ?? editingTransaction.finalSaleAmount ?? editingTransaction.saleAmount;
    const newFinalCashbackAmount = currentEditFinalCashbackAmount ?? editingTransaction.finalCashbackAmount ?? originalInitialCashback;

    console.log(`%c[${ADMIN_TX_LOG_PREFIX}:${operation}]%c Updating Tx ID: ${editingTransaction.id} from ${originalStatus} to ${newStatus}. OriginalCB: ${originalInitialCashback}, NewFinalCB: ${newFinalCashbackAmount}`, "color: blue; font-weight: bold;", "color: black;");

    try {
      await runTransaction(db, async (firestoreTransaction) => {
        const transactionSnap = await firestoreTransaction.get(transactionRef);
        const userSnap = await firestoreTransaction.get(userRef);
        if (!transactionSnap.exists()) throw new Error("Transaction not found.");
        if (!userSnap.exists()) throw new Error("User profile not found.");
        
        const currentTransactionData = transactionSnap.data() as Transaction; // Ensure we use fresh data
        if (currentTransactionData.status !== originalStatus) throw new Error("Transaction status changed since opening dialog. Please refresh.");

        const updateTxData: Partial<Transaction> = {
            status: newStatus,
            adminNotes: currentEditAdminNotes.trim() || null,
            notesToUser: currentEditNotesToUser.trim() || null,
            updatedAt: serverTimestamp(),
            finalSaleAmount: newFinalSaleAmount,
            finalCashbackAmount: newFinalCashbackAmount, // Set this regardless of status for record keeping
        };
        
        const userProfileUpdates: Record<string, any> = { updatedAt: serverTimestamp() };

        if (newStatus === 'confirmed') {
            updateTxData.confirmationDate = serverTimestamp();
            updateTxData.rejectionReason = null; // Clear rejection reason if any
            if (originalStatus === 'pending') {
                userProfileUpdates.pendingCashback = increment(-originalInitialCashback);
                userProfileUpdates.cashbackBalance = increment(newFinalCashbackAmount);
                userProfileUpdates.lifetimeCashback = increment(newFinalCashbackAmount);
            } else if (originalStatus === 'rejected' || originalStatus === 'cancelled') {
                // Moving from rejected/cancelled to confirmed (less common, but possible)
                // pendingCashback was already likely zeroed out or not incremented
                userProfileUpdates.cashbackBalance = increment(newFinalCashbackAmount);
                userProfileUpdates.lifetimeCashback = increment(newFinalCashbackAmount);
            } // No balance change if moving from confirmed to confirmed with different amounts (handled by admin logic)
        } else if (newStatus === 'rejected' || newStatus === 'cancelled') {
            updateTxData.rejectionReason = currentEditRejectionReason.trim();
            updateTxData.confirmationDate = null;
            if (originalStatus === 'pending') {
                userProfileUpdates.pendingCashback = increment(-originalInitialCashback);
            } else if (originalStatus === 'confirmed' || originalStatus === 'awaiting_payout') { // If it was confirmed or awaiting payout
                userProfileUpdates.cashbackBalance = increment(-originalFinalCashback); // Revert the confirmed amount
                userProfileUpdates.lifetimeCashback = increment(-originalFinalCashback); // Revert from lifetime
                 // No change to pending, it was already processed out of pending
            }
        }
        // Other status changes (e.g., to 'paid' or 'awaiting_payout') handled by Payouts page
        // or if you want direct admin control here, add more conditions.

        firestoreTransaction.update(transactionRef, updateTxData);
        if (Object.keys(userProfileUpdates).length > 1) { // Only update if there are balance changes
            firestoreTransaction.update(userRef, userProfileUpdates);
            console.log(`%c[${ADMIN_TX_LOG_PREFIX}:${operation}]%c User ${editingTransaction.userId} balances update queued:`, "color: green; font-weight: bold;", "color: black;", userProfileUpdates);
        }
      });

      toast({ title: "Transaction Updated", description: `Transaction ${editingTransaction.id} status changed to ${newStatus}.` });
      fetchTransactions(false, null); 
      setIsEditDialogOpen(false);
      setEditingTransaction(null);
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : "Could not update transaction.";
      setPageError(errorMsg);
      console.error(`%c[${ADMIN_TX_LOG_PREFIX}:${operation}]%c Error: ${errorMsg}`, "color: red; font-weight: bold;", "color: black;", err);
      toast({ variant: "destructive", title: "Update Failed", description: errorMsg });
    } finally {
      setIsSaving(false);
    }
  };
  
  if (authLoading || (pageLoading && transactions.length === 0 && !pageError)) {
    return <AdminGuard><TransactionsTableSkeleton /></AdminGuard>;
  }

  return (
    <AdminGuard>
      <div className="space-y-6">
        <div className="flex justify-between items-center">
          <h1 className="text-3xl font-bold">Manage Transactions</h1>
            <Button onClick={openAddDialog}><PlusCircle className="mr-2 h-4 w-4" /> Add New Transaction</Button>
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
            <CardDescription>Filter by status or search by specific IDs.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col sm:flex-row gap-4 items-end">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 w-full flex-grow-[2]">
              <Select value={filterType} onValueChange={(value) => setFilterType(value as any)}>
                <SelectTrigger><SelectValue placeholder="Filter by Field" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All (General Text Search)</SelectItem>
                  <SelectItem value="userId">User ID</SelectItem>
                  <SelectItem value="storeId">Store ID</SelectItem>
                  <SelectItem value="orderId">Order ID</SelectItem>
                  <SelectItem value="clickId">Click ID</SelectItem>
                  <SelectItem value="conversionId">Conversion ID</SelectItem>
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
                  disabled={isSearching || pageLoading}
                  className="h-10"
                />
                <Button type="submit" disabled={isSearching || pageLoading} className="h-10">
                  {isSearching || (pageLoading && debouncedSearchTerm) ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
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
            {pageLoading && transactions.length === 0 && !pageError ? (
              <TransactionsTableSkeleton />
            ) : !pageLoading && transactions.length === 0 && !pageError ? (
              <p className="text-center text-muted-foreground py-8">
                {debouncedSearchTerm || filterStatus !== 'all' || filterType !== 'all' ? 'No transactions found matching your criteria.' : 'No transactions recorded yet.'}
              </p>
            ) : (
              <div className="overflow-x-auto w-full">
                <Table className="min-w-[1200px]">
                  <TableHeader>
                    <TableRow>
                      <TableHead className="min-w-[180px]">User</TableHead>
                      <TableHead className="min-w-[150px]">Store</TableHead>
                      <TableHead className="min-w-[120px]">Order ID</TableHead>
                      <TableHead className="min-w-[100px] text-right">Sale Amt.</TableHead>
                      <TableHead className="min-w-[110px] text-right">CB Amt.</TableHead>
                      <TableHead className="min-w-[120px]">Status</TableHead>
                      <TableHead className="min-w-[120px]">Txn Date</TableHead>
                      <TableHead className="min-w-[150px]">Click/Conv. ID</TableHead>
                      <TableHead className="min-w-[200px]">Notes</TableHead>
                      <TableHead className="text-right min-w-[100px]">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {transactions.map((txItem) => ( 
                      <TableRow key={txItem.id}>
                        <TableCell>
                           <TooltipProvider>
                            <Tooltip>
                                <TooltipTrigger asChild>
                                    <div className="font-medium truncate max-w-[180px]" title={txItem.userDisplayName || txItem.userId}>
                                        {txItem.userDisplayName || txItem.userId}
                                    </div>
                                </TooltipTrigger>
                                <TooltipContent>
                                    <p>UID: {txItem.userId}</p>
                                    {txItem.userEmail && <p>Email: {txItem.userEmail}</p>}
                                </TooltipContent>
                            </Tooltip>
                           </TooltipProvider>
                           <div className="text-xs text-muted-foreground truncate max-w-[180px]" title={txItem.userEmail || undefined}>
                            {txItem.userEmail || 'N/A'}
                           </div>
                        </TableCell>
                        <TableCell className="truncate max-w-[150px]" title={txItem.storeName || txItem.storeId}>
                            {txItem.storeName || txItem.storeId}
                        </TableCell>
                        <TableCell className="font-mono text-xs truncate max-w-[120px]">{txItem.orderId || 'N/A'}</TableCell>
                        <TableCell className="text-right">{formatCurrency(txItem.finalSaleAmount ?? txItem.saleAmount)}</TableCell>
                        <TableCell className="font-semibold text-primary text-right">{formatCurrency(txItem.finalCashbackAmount ?? txItem.initialCashbackAmount ?? 0)}</TableCell>
                        <TableCell>
                          <Badge variant={getStatusVariant(txItem.status)} className="capitalize flex items-center gap-1 text-xs whitespace-nowrap">
                            {getStatusIcon(txItem.status)}
                            {txItem.status.replace('_', ' ')}
                          </Badge>
                        </TableCell>
                        <TableCell className="whitespace-nowrap">{txItem.transactionDate ? format(new Date(txItem.transactionDate), 'PP') : 'N/A'}</TableCell>
                        <TableCell className="font-mono text-xs">
                            {txItem.clickId && <div className="truncate max-w-[100px]" title={`Click: ${txItem.clickId}`}>C: {txItem.clickId}</div>}
                            {txItem.conversionId && <div className="truncate max-w-[100px]" title={`Conv: ${txItem.conversionId}`}>V: {txItem.conversionId}</div>}
                            {!txItem.clickId && !txItem.conversionId && '-'}
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                           <TooltipProvider>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <span
                                  className="truncate block max-w-[200px] cursor-pointer hover:underline"
                                   onClick={() => openEditDialog(txItem)}
                                >
                                  {txItem.adminNotes || txItem.notesToUser || txItem.rejectionReason || '-'}
                                </span>
                              </TooltipTrigger>
                              <TooltipContent>
                                <p className="max-w-xs break-words">
                                  Admin: {txItem.adminNotes || 'N/A'} <br/>
                                  User: {txItem.notesToUser || 'N/A'} <br/>
                                  Rejection: {txItem.rejectionReason || 'N/A'}
                                </p>
                              </TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
                        </TableCell>
                        <TableCell className="text-right">
                              <Button variant="outline" size="sm" onClick={() => openEditDialog(txItem)}>
                                <Edit className="mr-1 h-3 w-3" /> Manage
                              </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
            {hasMore && !pageLoading && transactions.length > 0 && (
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

        {/* Add New Transaction Dialog */}
        <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
          <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Add New Transaction</DialogTitle>
              <DialogDescription>Manually enter transaction details.</DialogDescription>
            </DialogHeader>
            <form onSubmit={addForm.handleSubmit(handleAddTransactionSubmit)} className="grid gap-4 py-4">
              {/* Form fields from previous implementation of add dialog */}
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
                <Label htmlFor="conversionIdForm">Conversion ID (Optional)</Label>
                <Input id="conversionIdForm" {...addForm.register('conversionId')} disabled={isSaving}/>
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
                <Label htmlFor="initialCashbackAmountForm">Initial Cashback Amount*</Label>
                <Input id="initialCashbackAmountForm" type="number" step="0.01" {...addForm.register('initialCashbackAmount', { valueAsNumber: true })} disabled={isSaving}/>
                {addForm.formState.errors.initialCashbackAmount && <p className="text-sm text-destructive">{addForm.formState.errors.initialCashbackAmount.message}</p>}
              </div>
              <div className="space-y-1">
                <Label htmlFor="cashbackRateAppliedForm">Cashback Rate Applied (Display, optional)</Label>
                <Input id="cashbackRateAppliedForm" {...addForm.register('cashbackRateApplied')} placeholder="e.g., 5% or Store Default" disabled={isSaving}/>
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
                <Label htmlFor="adminNotesForm">Admin Notes (Internal)</Label>
                <Textarea id="adminNotesForm" {...addForm.register('adminNotes')} rows={2} disabled={isSaving}/>
              </div>
              <div className="space-y-1">
                <Label htmlFor="notesToUserForm">Notes for User (Visible in their history)</Label>
                <Textarea id="notesToUserForm" {...addForm.register('notesToUser')} rows={2} disabled={isSaving}/>
              </div>
              <DialogFooter className="flex-col sm:flex-row sm:justify-end gap-2 mt-2">
                <DialogClose asChild>
                  <Button type="button" variant="outline" disabled={isSaving} className="w-full sm:w-auto">Cancel</Button>
                </DialogClose>
                <Button type="submit" disabled={isSaving} className="w-full sm:w-auto">
                  {isSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                  Add Transaction
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>

        {/* Manage/Edit Transaction Dialog (Approve/Reject focused) */}
        <Dialog open={isEditDialogOpen} onOpenChange={(isOpen) => {
            if (!isOpen) setEditingTransaction(null); 
            setIsEditDialogOpen(isOpen);
        }}>
          <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Manage Transaction</DialogTitle>
              {editingTransaction && (
                <DialogDescription>
                  Tx ID: {editingTransaction.id} <br/>
                  User: {editingTransaction.userDisplayName || editingTransaction.userId} ({editingTransaction.userEmail || 'N/A'}) <br/>
                  Store: {editingTransaction.storeName || editingTransaction.storeId} | Order ID: {editingTransaction.orderId || 'N/A'} <br/>
                  Reported Sale: {formatCurrency(editingTransaction.saleAmount)} | Initial CB: {formatCurrency(editingTransaction.initialCashbackAmount ?? 0)} <br/>
                  Current Status: <Badge variant={getStatusVariant(editingTransaction.status)} className="capitalize">{editingTransaction.status.replace('_', ' ')}</Badge>
                </DialogDescription>
              )}
            </DialogHeader>
            {editingTransaction && (
              <div className="space-y-4 py-4">
                {/* Display Click and Conversion IDs if available */}
                {editingTransaction.clickId && <p className="text-sm"><strong>Click ID:</strong> {editingTransaction.clickId}</p>}
                {editingTransaction.conversionId && <p className="text-sm"><strong>Conversion ID:</strong> {editingTransaction.conversionId}</p>}
                {editingTransaction.productDetails && <p className="text-sm"><strong>Product Details:</strong> {editingTransaction.productDetails}</p>}


                {(editingTransaction.status === 'pending' || editingTransaction.status === 'confirmed') && (
                    <>
                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-1">
                                <Label htmlFor="editFinalSaleAmount">Final Sale Amount</Label>
                                <Input id="editFinalSaleAmount" type="number" step="0.01"
                                    value={currentEditFinalSaleAmount ?? ''}
                                    onChange={(e) => setCurrentEditFinalSaleAmount(e.target.value ? parseFloat(e.target.value) : undefined)}
                                    placeholder={formatCurrency(editingTransaction.saleAmount)}
                                    disabled={isSaving || editingTransaction.status !== 'pending'} />
                            </div>
                            <div className="space-y-1">
                                <Label htmlFor="editFinalCashbackAmount">Final Cashback Amount</Label>
                                <Input id="editFinalCashbackAmount" type="number" step="0.01"
                                    value={currentEditFinalCashbackAmount ?? ''}
                                    onChange={(e) => setCurrentEditFinalCashbackAmount(e.target.value ? parseFloat(e.target.value) : undefined)}
                                    placeholder={formatCurrency(editingTransaction.initialCashbackAmount ?? 0)}
                                    disabled={isSaving || editingTransaction.status !== 'pending'} />
                            </div>
                        </div>
                    </>
                )}
                <div>
                  <Label htmlFor="editAdminNotes">Admin Notes (Internal)</Label>
                  <Textarea id="editAdminNotes" value={currentEditAdminNotes} onChange={(e) => setCurrentEditAdminNotes(e.target.value)} disabled={isSaving} rows={2}/>
                </div>
                <div>
                  <Label htmlFor="editNotesToUser">Notes for User (Visible in their history)</Label>
                  <Textarea id="editNotesToUser" value={currentEditNotesToUser} onChange={(e) => setCurrentEditNotesToUser(e.target.value)} disabled={isSaving} rows={2}/>
                </div>

                {editingTransaction.status === 'pending' && (
                  <>
                    <div className="space-y-1">
                      <Label htmlFor="editRejectionReason">Rejection Reason (Required if rejecting)</Label>
                      <Textarea id="editRejectionReason" value={currentEditRejectionReason} onChange={(e) => setCurrentEditRejectionReason(e.target.value)} placeholder="Enter reason for rejection" disabled={isSaving} rows={2}/>
                    </div>
                    <DialogFooter className="flex-col sm:flex-row sm:justify-end gap-2 mt-2">
                        <Button onClick={() => handleTransactionStatusUpdate('rejected')} variant="destructive" disabled={isSaving || !currentEditRejectionReason.trim()} className="w-full sm:w-auto">
                            {isSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <ThumbsDown className="mr-2 h-4 w-4" />} Reject
                        </Button>
                        <Button onClick={() => handleTransactionStatusUpdate('confirmed')} disabled={isSaving} className="w-full sm:w-auto">
                            {isSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <ThumbsUp className="mr-2 h-4 w-4" />} Approve
                        </Button>
                    </DialogFooter>
                  </>
                )}
                {editingTransaction.status !== 'pending' && editingTransaction.status !== 'paid' && editingTransaction.status !== 'cancelled' && ( // For confirmed, awaiting_payout
                    <DialogFooter className="mt-2">
                         <Label htmlFor="newStatusForProcessed">Change Status</Label>
                         <Select value={currentEditStatus} onValueChange={(value) => setCurrentEditStatus(value as CashbackStatus)} disabled={isSaving}>
                            <SelectTrigger id="newStatusForProcessed">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                {editingTransaction.status === 'confirmed' && <SelectItem value="confirmed">Confirmed</SelectItem>}
                                {editingTransaction.status === 'confirmed' && <SelectItem value="pending">Move to Pending (Revert)</SelectItem>}
                                {editingTransaction.status === 'awaiting_payout' && <SelectItem value="awaiting_payout">Awaiting Payout</SelectItem>}
                                {editingTransaction.status === 'awaiting_payout' && <SelectItem value="confirmed">Move to Confirmed (Revert)</SelectItem>}
                                <SelectItem value="rejected">Reject</SelectItem>
                                <SelectItem value="cancelled">Cancel</SelectItem>
                            </SelectContent>
                        </Select>
                        {(currentEditStatus === 'rejected' || currentEditStatus === 'cancelled') && (
                            <div className="w-full mt-2">
                                <Label htmlFor="editRejectionReasonProcessed">Reason for {currentEditStatus}</Label>
                                <Textarea id="editRejectionReasonProcessed" value={currentEditRejectionReason} onChange={(e) => setCurrentEditRejectionReason(e.target.value)} placeholder={`Reason for ${currentEditStatus}`} disabled={isSaving} rows={2}/>
                            </div>
                        )}
                        <DialogClose asChild><Button variant="outline" disabled={isSaving}>Cancel</Button></DialogClose>
                        <Button onClick={() => handleTransactionStatusUpdate(currentEditStatus)} disabled={isSaving || ((currentEditStatus === 'rejected' || currentEditStatus === 'cancelled') && !currentEditRejectionReason.trim())}>
                            {isSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null} Update Status
                        </Button>
                    </DialogFooter>
                )}
                 { (editingTransaction.status === 'paid' || editingTransaction.status === 'cancelled' || editingTransaction.status === 'rejected') && (
                    <DialogFooter className="mt-2">
                         <DialogClose asChild><Button variant="outline">Close</Button></DialogClose>
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

    