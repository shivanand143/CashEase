
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
import type { Transaction, CashbackStatus, UserProfile, Store, TransactionFormValues as AppTransactionFormValues } from '@/lib/types'; // Corrected type import
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
// Label was already imported from '@/components/ui/label'
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
import { useAuth } from '@/hooks/use-auth'; // Import useAuth
import { Label } from '@/components/ui/label'; // Ensure Label is imported


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
  cashbackAmount: z.number({ required_error: "Cashback amount is required."}).min(0, "Cashback amount must be non-negative."), // This will be initialCashbackAmount
  cashbackRateApplied: z.string().optional().nullable(),
  status: z.enum(['pending', 'confirmed', 'rejected', 'cancelled'] as [CashbackStatus, ...CashbackStatus[]], { required_error: "Status is required."}),
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
    case 'awaiting_payout': return 'default';
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
    case 'awaiting_payout': return <IndianRupee className="h-3 w-3 text-purple-600" />; // Awaiting Payout uses different icon
    case 'rejected':
    case 'cancelled': return <XCircle className="h-3 w-3 text-red-600" />;
    default: return <Info className="h-3 w-3 text-muted-foreground" />;
  }
};

export default function AdminTransactionsPage() {
  const { user: adminUser, loading: authLoading } = useAuth(); // For admin context
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

  // State for managing notes and rejection reason in the edit dialog directly
  const [currentEditAdminNotes, setCurrentEditAdminNotes] = React.useState('');
  const [currentEditNotesToUser, setCurrentEditNotesToUser] = React.useState('');
  const [currentEditRejectionReason, setCurrentEditRejectionReason] = React.useState('');
  const [currentEditFinalCashbackAmount, setCurrentEditFinalCashbackAmount] = React.useState<number | undefined>(undefined);
  const [currentEditFinalSaleAmount, setCurrentEditFinalSaleAmount] = React.useState<number | undefined>(undefined);


  const [userCache, setUserCache] = React.useState<Record<string, Pick<UserProfile, 'displayName' | 'email'>>>({});
  const [storeCache, setStoreCache] = React.useState<Record<string, Pick<Store, 'name'>>>({});

  const addForm = useForm<TransactionFormValues>({
    resolver: zodResolver(transactionFormSchema),
    defaultValues: {
      userId: '', storeId: '', storeName: '', orderId: '', clickId: '', conversionId: '',
      productDetails: '', transactionDate: new Date(), saleAmount: 0,
      cashbackAmount: 0, cashbackRateApplied: '', status: 'pending', adminNotes: '', notesToUser: '', rejectionReason: ''
    },
  });

  const fetchTransactionDetails = React.useCallback(async (rawTransactions: Transaction[]): Promise<TransactionWithUser[]> => {
    const operation = "fetchTransactionDetails";
    if (!db || firebaseInitializationError || rawTransactions.length === 0) {
      if (firebaseInitializationError) console.error(`%c[${ADMIN_TX_LOG_PREFIX}:${operation}]%c DB Error: ${firebaseInitializationError}`, "color: red; font-weight: bold;", "color: black;");
      return rawTransactions.map(txItem => ({ ...txItem, userDisplayName: txItem.userId, storeName: txItem.storeName || txItem.storeId }));
    }

    const userIdsToFetch = [...new Set(rawTransactions.map(txItem => txItem.userId).filter(id => id && !userCache[id]))];
    const storeIdsToFetch = [...new Set(rawTransactions.flatMap(txItem => (txItem.storeId && !storeCache[txItem.storeId] && !txItem.storeName) ? [txItem.storeId] : []))];

    try {
      if (userIdsToFetch.length > 0) {
        // Batch fetch users
        const newUsers: Record<string, Pick<UserProfile, 'displayName' | 'email'>> = {};
        for (let i = 0; i < userIdsToFetch.length; i += 30) { // Firestore 'in' query limit is 30
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
        // Batch fetch stores
        const newStores: Record<string, Pick<Store, 'name'>> = {};
         for (let i = 0; i < storeIdsToFetch.length; i += 30) { // Firestore 'in' query limit is 30
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
      console.error(`%c[${ADMIN_TX_LOG_PREFIX}:${operation}]%c Error fetching details (users/stores):`, "color: red; font-weight: bold;", "color: black;", detailError);
      toast({ variant: "destructive", title: "Detail Fetch Error", description: "Could not load some user/store names." });
    }
    return rawTransactions.map(txItem => ({
      ...txItem,
      userDisplayName: userCache[txItem.userId]?.displayName || txItem.userId,
      userEmail: userCache[txItem.userId]?.email,
      storeName: txItem.storeName || storeCache[txItem.storeId]?.name || txItem.storeId,
    }));
  }, [userCache, storeCache, toast]);


  const fetchTransactions = React.useCallback(async (
    loadMoreOp = false,
    docToStartAfter: QueryDocumentSnapshot<DocumentData> | null = null
  ) => {
    const operation = "fetchTransactions";
    let isMounted = true;
    console.log(`%c[${ADMIN_TX_LOG_PREFIX}:${operation}]%c Called. LoadMore: ${loadMoreOp}, Search: "${debouncedSearchTerm}", StatusFilter: ${filterStatus}`, "color: blue; font-weight: bold;", "color: black;");
    if (!isMounted) return () => {isMounted = false};

    if (firebaseInitializationError || !db) {
      if (isMounted) {
        setPageError(firebaseInitializationError || "Database connection not available.");
        setPageLoading(false); setLoadingMore(false); setHasMore(false);
      }
      return () => {isMounted = false};
    }

    if (!loadMoreOp) {
      setPageLoading(true); setTransactions([]); setLastVisible(null); setHasMore(true);
    } else {
       if (!docToStartAfter && loadMoreOp) { // Prevent load more if no cursor
          if (isMounted) setLoadingMore(false);
          return () => {isMounted = false};
      }
      setLoadingMore(true);
    }
    if (!loadMoreOp) setPageError(null);
    setIsSearching(debouncedSearchTerm !== '');

    try {
      const transactionsCollectionRef = collection(db, 'transactions');
      let constraints: QueryConstraint[] = [];

      if (filterStatus !== 'all') {
        constraints.push(where('status', '==', filterStatus));
      }

      if (debouncedSearchTerm.trim() && filterType !== 'all' && filterType !== 'status') {
          constraints.push(where(filterType, '==', debouncedSearchTerm.trim()));
      }
      
      constraints.push(orderBy('transactionDate', 'desc'));

      if (loadMoreOp && docToStartAfter) {
        constraints.push(startAfter(docToStartAfter));
      }
      constraints.push(limit(TRANSACTIONS_PER_PAGE));

      const q = query(transactionsCollectionRef, ...constraints);
      const querySnapshot = await getDocs(q);
      console.log(`%c[${ADMIN_TX_LOG_PREFIX}:${operation}]%c Fetched ${querySnapshot.size} raw transactions.`, "color: blue; font-weight: bold;", "color: black;");

      const rawTransactionsData = querySnapshot.docs.map(docSnap => ({
        id: docSnap.id,
        ...docSnap.data(),
        transactionDate: safeToDate(docSnap.data().transactionDate as Timestamp | undefined) || new Date(0),
        confirmationDate: safeToDate(docSnap.data().confirmationDate as Timestamp | undefined),
        paidDate: safeToDate(docSnap.data().paidDate as Timestamp | undefined),
        createdAt: safeToDate(docSnap.data().createdAt as Timestamp | undefined) || new Date(0),
        updatedAt: safeToDate(docSnap.data().updatedAt as Timestamp | undefined) || new Date(0),
      } as Transaction));
      
      let filteredForGeneralSearch = rawTransactionsData;
      if (debouncedSearchTerm && filterType === 'all') {
         // Client-side search for 'all' because Firestore doesn't support OR queries easily on multiple text fields
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
         console.log(`%c[${ADMIN_TX_LOG_PREFIX}:${operation}]%c Client-side filtered for 'all' to ${filteredForGeneralSearch.length} transactions.`, "color: blue; font-weight: bold;", "color: black;");
      }

      const transactionsWithDetails = await fetchTransactionDetails(filteredForGeneralSearch);
      
      if(isMounted){
        setTransactions(prev => loadMoreOp ? [...prev, ...transactionsWithDetails] : transactionsWithDetails);
        setLastVisible(querySnapshot.docs[querySnapshot.docs.length - 1] || null);
        setHasMore(querySnapshot.docs.length === TRANSACTIONS_PER_PAGE && transactionsWithDetails.length > 0);
        console.log(`%c[${ADMIN_TX_LOG_PREFIX}:${operation}]%c Processed ${transactionsWithDetails.length} transactions. HasMore: ${querySnapshot.docs.length === TRANSACTIONS_PER_PAGE && transactionsWithDetails.length > 0}`, "color: blue; font-weight: bold;", "color: black;");
      }

    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : "Failed to fetch transactions";
      console.error(`%c[${ADMIN_TX_LOG_PREFIX}:${operation}]%c Error: ${errorMsg}`, "color: red; font-weight: bold;", "color: black;", err);
      if(isMounted) {
        setPageError(errorMsg);
        toast({ variant: "destructive", title: "Fetch Error", description: errorMsg });
        setHasMore(false);
      }
    } finally {
      if(isMounted){
        setPageLoading(false); setLoadingMore(false); setIsSearching(false);
      }
    }
    return () => {isMounted = false};
  }, [debouncedSearchTerm, filterType, filterStatus, toast, fetchTransactionDetails]);

  React.useEffect(() => {
    let isMounted = true;
    if (authLoading) {
      if(isMounted) setPageLoading(true);
      return () => {isMounted = false;};
    }
    if (!adminUser && !authLoading) {
      if(isMounted) setPageLoading(false); // Stop loading, AdminGuard will handle redirect
      return () => {isMounted = false;};
    }
    // If adminUser is present (checked by AdminGuard), then fetch
    const cleanup = fetchTransactions(false, null);
    return () => {
        isMounted = false;
        if (typeof cleanup === 'function') cleanup();
    };
  }, [authLoading, adminUser, filterStatus, debouncedSearchTerm, fetchTransactions]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    // fetchTransactions is called by useEffect due to debouncedSearchTerm change
  };

  const handleLoadMore = () => {
    if (!loadingMore && hasMore && lastVisible) {
      fetchTransactions(true, lastVisible);
    }
  };

  const openAddDialog = () => {
    addForm.reset({
      userId: '', storeId: '', storeName: '', orderId: '', clickId: '', conversionId: '',
      productDetails: '', transactionDate: new Date(), saleAmount: 0,
      cashbackAmount: 0, cashbackRateApplied: '', status: 'pending', adminNotes: '', notesToUser: '', rejectionReason: ''
    });
    setIsAddDialogOpen(true);
  };

  const openEditDialog = (txItem: TransactionWithUser) => {
    setEditingTransaction(txItem);
    setCurrentEditAdminNotes(txItem.adminNotes || '');
    setCurrentEditNotesToUser(txItem.notesToUser || '');
    setCurrentEditRejectionReason(txItem.rejectionReason || '');
    setCurrentEditFinalSaleAmount(txItem.finalSaleAmount ?? txItem.saleAmount);
    setCurrentEditFinalCashbackAmount(txItem.finalCashbackAmount ?? txItem.initialCashbackAmount);
    setIsEditDialogOpen(true);
  };

  const handleAddTransactionSubmit = async (data: TransactionFormValues) => {
    const operation = "handleAddTransactionSubmit";
    console.log(`%c[${ADMIN_TX_LOG_PREFIX}:${operation}]%c Attempting to add transaction:`, "color: blue; font-weight: bold;", "color: black;", data);
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
                try {
                  const storeDocRef = doc(db, 'stores', data.storeId);
                  const storeSnap = await firestoreTransaction.get(storeDocRef);
                  storeNameFromDb = storeSnap.exists() ? storeSnap.data()?.name : 'Unknown Store';
                } catch (storeFetchError) {
                  console.warn(`%c[${ADMIN_TX_LOG_PREFIX}:${operation}]%c Could not fetch store name for ${data.storeId}, using 'Unknown Store'. Error: ${storeFetchError}`, "color: orange; font-weight: bold;", "color: black;");
                  storeNameFromDb = 'Unknown Store';
                }
            }
            
            const newTransactionRef = doc(collection(db, 'transactions'));
            const transactionDataToSave: Omit<Transaction, 'id'> = {
                userId: data.userId,
                storeId: data.storeId,
                storeName: storeNameFromDb || 'Unknown Store',
                orderId: data.orderId || null,
                clickId: data.clickId || null,
                conversionId: data.conversionId || null,
                productDetails: data.productDetails || null,
                transactionDate: Timestamp.fromDate(data.transactionDate),
                saleAmount: data.saleAmount,
                initialCashbackAmount: data.cashbackAmount,
                finalSaleAmount: data.saleAmount, 
                finalCashbackAmount: data.cashbackAmount,
                currency: 'INR', // Default currency
                status: data.status,
                confirmationDate: (data.status === 'confirmed') ? serverTimestamp() : null,
                paidDate: null,
                payoutId: null,
                reportedDate: serverTimestamp(),
                rejectionReason: (data.status === 'rejected' || data.status === 'cancelled') ? data.rejectionReason || null : null,
                adminNotes: data.adminNotes || null,
                notesToUser: data.notesToUser || null,
                createdAt: serverTimestamp(),
                updatedAt: serverTimestamp(),
            };
            firestoreTransaction.set(newTransactionRef, transactionDataToSave);
            console.log(`%c[${ADMIN_TX_LOG_PREFIX}:${operation}]%c Transaction doc ${newTransactionRef.id} prepared for user ${data.userId}, status ${data.status}.`, "color: blue; font-weight: bold;", "color: black;");

            const userProfileUpdates: Record<string, any> = { updatedAt: serverTimestamp() };
            if (data.status === 'pending') {
                userProfileUpdates.pendingCashback = increment(data.cashbackAmount);
            } else if (data.status === 'confirmed') {
                userProfileUpdates.pendingCashback = increment(0); // Ensure it's not negative if previously pending then directly confirmed
                userProfileUpdates.cashbackBalance = increment(data.cashbackAmount);
                userProfileUpdates.lifetimeCashback = increment(data.cashbackAmount);
            }
            if (Object.keys(userProfileUpdates).length > 1) { // Only update if there are balance changes
              firestoreTransaction.update(userDocRef, userProfileUpdates);
              console.log(`%c[${ADMIN_TX_LOG_PREFIX}:${operation}]%c User ${data.userId} balances updated. Status: ${data.status}, Amount: ${data.cashbackAmount}.`, "color: blue; font-weight: bold;", "color: black;");
            }
        });
        toast({ title: "Transaction Logged", description: `New transaction for user ${data.userId} has been logged.` });
        fetchTransactions(false, null); 
        setIsAddDialogOpen(false);
        addForm.reset();
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : "Could not add transaction.";
      setPageError(errorMsg);
      console.error(`%c[${ADMIN_TX_LOG_PREFIX}:${operation}]%c Error: ${errorMsg}`, "color: red; font-weight: bold;", "color: black;", err);
      toast({ variant: "destructive", title: "Add Failed", description: errorMsg });
    } finally {
      setIsSaving(false);
    }
  };

  const handleApproveTransaction = async () => {
    const operation = "handleApproveTransaction";
    if (!editingTransaction || !editingTransaction.id || !db || editingTransaction.status !== 'pending') {
        toast({ variant: "destructive", title: "Invalid Action", description: "No valid pending transaction selected or DB error." });
        return;
    }
    setIsSaving(true);
    setPageError(null);
    const transactionRef = doc(db, 'transactions', editingTransaction.id);
    const userRef = doc(db, 'users', editingTransaction.userId);
    
    const finalSaleAmt = currentEditFinalSaleAmount ?? editingTransaction.saleAmount;
    const finalCashbackAmt = currentEditFinalCashbackAmount ?? editingTransaction.initialCashbackAmount ?? 0;

    if (finalCashbackAmt <= 0) {
        toast({variant: "destructive", title: "Invalid Amount", description: "Final cashback amount must be positive to approve."});
        setIsSaving(false);
        return;
    }

    console.log(`%c[${ADMIN_TX_LOG_PREFIX}:${operation}]%c Approving Tx ID: ${editingTransaction.id} for User: ${editingTransaction.userId}. Original Initial CB: ${editingTransaction.initialCashbackAmount}, New Final CB: ${finalCashbackAmt}`, "color: blue; font-weight: bold;", "color: black;");

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
            finalSaleAmount: finalSaleAmt,
            finalCashbackAmount: finalCashbackAmt,
            adminNotes: currentEditAdminNotes || null,
            notesToUser: currentEditNotesToUser || null,
            rejectionReason: null, 
            updatedAt: serverTimestamp(),
        });
        
        firestoreTransaction.update(userRef, {
            pendingCashback: increment(-(currentTransactionData.initialCashbackAmount ?? 0)), // Deduct original pending amount
            cashbackBalance: increment(finalCashbackAmt), // Add final confirmed amount
            lifetimeCashback: increment(finalCashbackAmt), // Add final confirmed amount to lifetime
            updatedAt: serverTimestamp()
        });
        console.log(`%c[${ADMIN_TX_LOG_PREFIX}:${operation}]%c Tx ${editingTransaction.id} approved. User ${editingTransaction.userId} balances updated. Pending decreased by ${currentTransactionData.initialCashbackAmount}, Confirmed & Lifetime increased by ${finalCashbackAmt}.`, "color: green; font-weight: bold;", "color: black;");
      });

      toast({ title: "Transaction Approved", description: `Transaction ${editingTransaction.id} status changed to Confirmed.` });
      fetchTransactions(false, null); 
      setIsEditDialogOpen(false);
      setEditingTransaction(null);
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : "Could not approve transaction.";
      setPageError(errorMsg);
      console.error(`%c[${ADMIN_TX_LOG_PREFIX}:${operation}]%c Error: ${errorMsg}`, "color: red; font-weight: bold;", "color: black;", err);
      toast({ variant: "destructive", title: "Approval Failed", description: errorMsg });
    } finally {
      setIsSaving(false);
    }
  };

  const handleRejectTransaction = async () => {
    const operation = "handleRejectTransaction";
    if (!editingTransaction || !editingTransaction.id || !db || editingTransaction.status !== 'pending') {
        toast({ variant: "destructive", title: "Invalid Action", description: "No valid pending transaction selected or DB error." });
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
    
    console.log(`%c[${ADMIN_TX_LOG_PREFIX}:${operation}]%c Rejecting Tx ID: ${editingTransaction.id} for User: ${editingTransaction.userId}. Reason: ${currentEditRejectionReason.trim()}`, "color: blue; font-weight: bold;", "color: black;");

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
            finalSaleAmount: currentEditFinalSaleAmount ?? currentTransactionData.saleAmount, // Keep original or update
            finalCashbackAmount: 0, // Rejected cashback is 0
            adminNotes: currentEditAdminNotes || null,
            notesToUser: currentEditNotesToUser || null,
            confirmationDate: null, 
            updatedAt: serverTimestamp(),
        });
        
        const initialCashbackToDeduct = currentTransactionData.initialCashbackAmount ?? 0;
        if (initialCashbackToDeduct > 0) { // Only deduct if there was something pending
            firestoreTransaction.update(userRef, {
                pendingCashback: increment(-initialCashbackToDeduct),
                updatedAt: serverTimestamp()
            });
             console.log(`%c[${ADMIN_TX_LOG_PREFIX}:${operation}]%c Tx ${editingTransaction.id} rejected. User ${editingTransaction.userId} pendingCashback decreased by ${initialCashbackToDeduct}.`, "color: green; font-weight: bold;", "color: black;");
        } else {
             firestoreTransaction.update(userRef, { updatedAt: serverTimestamp() }); 
             console.log(`%c[${ADMIN_TX_LOG_PREFIX}:${operation}]%c Tx ${editingTransaction.id} rejected. No pending cashback to adjust for user ${editingTransaction.userId}.`, "color: orange; font-weight: bold;", "color: black;");
        }
      });

      toast({ title: "Transaction Rejected", description: `Transaction ${editingTransaction.id} status changed to Rejected.` });
      fetchTransactions(false, null); 
      setIsEditDialogOpen(false);
      setEditingTransaction(null);
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : "Could not reject transaction.";
      setPageError(errorMsg);
      console.error(`%c[${ADMIN_TX_LOG_PREFIX}:${operation}]%c Error: ${errorMsg}`, "color: red; font-weight: bold;", "color: black;", err);
      toast({ variant: "destructive", title: "Rejection Failed", description: errorMsg });
    } finally {
      setIsSaving(false);
    }
  };
  
  const handleUpdateNotesOrAmounts = async () => {
    const operation = "handleUpdateNotesOrAmounts";
    if (!editingTransaction || !editingTransaction.id || !db) {
        toast({ variant: "destructive", title: "Error", description: "No transaction selected or DB error." });
        return;
    }
    // This function is for non-pending transactions, or for updating amounts/notes on pending ones without changing status yet
    if (editingTransaction.status === 'pending' && 
        (currentEditFinalSaleAmount === editingTransaction.saleAmount && 
         currentEditFinalCashbackAmount === editingTransaction.initialCashbackAmount &&
         currentEditAdminNotes === (editingTransaction.adminNotes || '') &&
         currentEditNotesToUser === (editingTransaction.notesToUser || ''))) {
        toast({ variant: "info", title: "No Changes", description: "No changes detected to save." });
        return;
    }

    setIsSaving(true);
    setPageError(null);
    const transactionRef = doc(db, 'transactions', editingTransaction.id);
    console.log(`%c[${ADMIN_TX_LOG_PREFIX}:${operation}]%c Updating notes/amounts for Tx ID: ${editingTransaction.id}. New Sale: ${currentEditFinalSaleAmount}, New CB: ${currentEditFinalCashbackAmount}`, "color: blue; font-weight: bold;", "color: black;");
    try {
        const updateData: Partial<Transaction> = {
            adminNotes: currentEditAdminNotes || null,
            notesToUser: currentEditNotesToUser || null,
            updatedAt: serverTimestamp()
        };

        if (currentEditFinalSaleAmount !== undefined && currentEditFinalSaleAmount !== (editingTransaction.finalSaleAmount ?? editingTransaction.saleAmount)) {
            updateData.finalSaleAmount = currentEditFinalSaleAmount;
        }
        if (currentEditFinalCashbackAmount !== undefined && currentEditFinalCashbackAmount !== (editingTransaction.finalCashbackAmount ?? editingTransaction.initialCashbackAmount)) {
            updateData.finalCashbackAmount = currentEditFinalCashbackAmount;
            // Note: If status is 'confirmed', changing finalCashbackAmount here would require adjusting user's cashbackBalance.
            // This is complex and typically done *during* the approval step. For already confirmed/paid, this change is just informational
            // unless further logic for balance rollback/adjustment is added.
            if (editingTransaction.status === 'confirmed' || editingTransaction.status === 'awaiting_payout' || editingTransaction.status === 'paid') {
                 console.warn(`%c[${ADMIN_TX_LOG_PREFIX}:${operation}]%c Warning: Changing finalCashbackAmount for a transaction with status '${editingTransaction.status}'. This does NOT automatically adjust user's cashbackBalance here. Balance adjustments for confirmed/paid transactions are complex and usually handled via rejections/rollbacks.`, "color: orange; font-weight: bold;", "color: black;");
                 toast({variant: "default", title: "Cashback Amount Updated", description: "Note: User's overall balance might need manual review if this transaction was already confirmed or paid.", duration: 10000});
            }
        }


        await updateDoc(transactionRef, updateData);
        toast({ title: "Transaction Details Updated" });
        
        setTransactions(prev => prev.map(tx => tx.id === editingTransaction!.id ? {
            ...tx,
            adminNotes: currentEditAdminNotes || null,
            notesToUser: currentEditNotesToUser || null,
            finalSaleAmount: currentEditFinalSaleAmount ?? tx.finalSaleAmount ?? tx.saleAmount,
            finalCashbackAmount: currentEditFinalCashbackAmount ?? tx.finalCashbackAmount ?? tx.initialCashbackAmount,
            updatedAt: new Date() 
        } : tx));
        setIsEditDialogOpen(false);
        setEditingTransaction(null);
    } catch (err) {
        const errorMsg = err instanceof Error ? err.message : "Could not update notes/amounts.";
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
            <CardDescription>Filter by status or search by User ID, Store ID, Order ID, Click ID, or Conversion ID.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col sm:flex-row gap-4 items-end">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 w-full flex-grow-[2]">
              <Select value={filterType} onValueChange={(value) => setFilterType(value as any)}>
                <SelectTrigger><SelectValue placeholder="Filter by Field" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All (for general text search)</SelectItem>
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
                {debouncedSearchTerm || filterStatus !== 'all' || filterType !== 'all' ? 'No transactions found matching your criteria.' : 'No transactions recorded yet. Log a sale or wait for postbacks.'}
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
                      <TableHead className="min-w-[110px] text-right">Cashback</TableHead>
                      <TableHead className="min-w-[120px]">Status</TableHead>
                      <TableHead className="min-w-[120px]">Txn Date</TableHead>
                      <TableHead className="min-w-[150px]">Click/Conv. ID</TableHead>
                      <TableHead className="min-w-[200px]">Admin Notes</TableHead>
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

        <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
          <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Log Reported Sale / Add Transaction</DialogTitle>
              <DialogDescription>Manually enter transaction details (e.g., from affiliate network or missing sale).</DialogDescription>
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
                <Label htmlFor="conversionIdForm">Conversion ID (Optional - from postback)</Label>
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
                <Label htmlFor="cashbackAmountForm">(Initial) Cashback Amount*</Label>
                <Input id="cashbackAmountForm" type="number" step="0.01" {...addForm.register('cashbackAmount', { valueAsNumber: true })} disabled={isSaving}/>
                {addForm.formState.errors.cashbackAmount && <p className="text-sm text-destructive">{addForm.formState.errors.cashbackAmount.message}</p>}
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
          <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Manage Transaction</DialogTitle>
              {editingTransaction && (
                <DialogDescription>
                  Tx ID: {editingTransaction.id} <br/>
                  User: {editingTransaction.userDisplayName || editingTransaction.userId} ({editingTransaction.userEmail || 'N/A'}) <br/>
                  Store: {editingTransaction.storeName || editingTransaction.storeId} | Order ID: {editingTransaction.orderId || 'N/A'} <br/>
                  Initial Sale: {formatCurrency(editingTransaction.saleAmount)} | Initial CB: {formatCurrency(editingTransaction.initialCashbackAmount ?? 0)} <br/>
                  Current Status: <Badge variant={getStatusVariant(editingTransaction.status)} className="capitalize">{editingTransaction.status.replace('_', ' ')}</Badge>
                </DialogDescription>
              )}
            </DialogHeader>
            {editingTransaction && (
              <div className="space-y-4 py-4">
                {/* Fields to potentially edit final amounts for pending/confirmed transactions */}
                {(editingTransaction.status === 'pending' || editingTransaction.status === 'confirmed') && (
                    <>
                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-1">
                                <Label htmlFor="editFinalSaleAmount">Final Sale Amount</Label>
                                <Input id="editFinalSaleAmount" type="number" step="0.01"
                                    value={currentEditFinalSaleAmount ?? ''}
                                    onChange={(e) => setCurrentEditFinalSaleAmount(e.target.value ? parseFloat(e.target.value) : undefined)}
                                    placeholder={formatCurrency(editingTransaction.saleAmount)}
                                    disabled={isSaving} />
                            </div>
                            <div className="space-y-1">
                                <Label htmlFor="editFinalCashbackAmount">Final Cashback Amount</Label>
                                <Input id="editFinalCashbackAmount" type="number" step="0.01"
                                    value={currentEditFinalCashbackAmount ?? ''}
                                    onChange={(e) => setCurrentEditFinalCashbackAmount(e.target.value ? parseFloat(e.target.value) : undefined)}
                                    placeholder={formatCurrency(editingTransaction.initialCashbackAmount ?? 0)}
                                    disabled={isSaving} />
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
                        <Button onClick={handleRejectTransaction} variant="destructive" disabled={isSaving || !currentEditRejectionReason.trim()} className="w-full sm:w-auto">
                            {isSaving && editingTransaction.status === 'pending' ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <ThumbsDown className="mr-2 h-4 w-4" />} Reject
                        </Button>
                        <Button onClick={handleApproveTransaction} disabled={isSaving} className="w-full sm:w-auto">
                            {isSaving && editingTransaction.status === 'pending' ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <ThumbsUp className="mr-2 h-4 w-4" />} Approve
                        </Button>
                    </DialogFooter>
                  </>
                )}
                {editingTransaction.status !== 'pending' && (
                    <DialogFooter className="mt-2">
                        <DialogClose asChild><Button variant="outline" disabled={isSaving}>Cancel</Button></DialogClose>
                        <Button onClick={handleUpdateNotesOrAmounts} disabled={isSaving}>
                            {isSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null} Update Notes/Amounts
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

    