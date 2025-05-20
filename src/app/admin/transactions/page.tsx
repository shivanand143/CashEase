
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
import type { Transaction, CashbackStatus, UserProfile, Store } from '@/lib/types';
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
import { AlertCircle, Loader2, Search, Edit, PlusCircle, CheckCircle, XCircle, Info, ListFilter, Calendar as CalendarIconLucide, IndianRupee } from 'lucide-react';
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
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { cn } from "@/lib/utils";
import { useDebounce } from '@/hooks/use-debounce';


const TRANSACTIONS_PER_PAGE = 15;

const transactionFormSchema = z.object({
  userId: z.string().min(1, "User ID is required."),
  storeId: z.string().min(1, "Store ID is required."),
  storeName: z.string().optional().nullable(),
  orderId: z.string().optional().nullable(),
  clickId: z.string().optional().nullable(),
  productDetails: z.string().optional().nullable(),
  transactionDate: z.date({ required_error: "Transaction date is required."}),
  saleAmount: z.number({ required_error: "Sale amount is required."}).min(0, "Sale amount must be non-negative."),
  cashbackAmount: z.number({ required_error: "Cashback amount is required."}).min(0, "Cashback amount must be non-negative."),
  status: z.enum(['pending', 'confirmed', 'rejected', 'cancelled', 'paid'] as [CashbackStatus, ...CashbackStatus[]], { required_error: "Status is required."}),
  adminNotes: z.string().optional().nullable(),
  notesToUser: z.string().optional().nullable(),
  rejectionReason: z.string().optional().nullable(),
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
    case 'rejected':
    case 'cancelled': return 'destructive';
    default: return 'outline';
  }
};

const getStatusIcon = (status: CashbackStatus) => {
  switch (status) {
    case 'confirmed': return <CheckCircle className="h-3 w-3 text-green-600" />;
    case 'paid': return <IndianRupee className="h-3 w-3 text-blue-600" />; // Changed icon for paid
    case 'pending': return <Loader2 className="h-3 w-3 animate-spin text-yellow-600" />;
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

  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingTransaction, setEditingTransaction] = useState<TransactionWithUser | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const [userCache, setUserCache] = useState<Record<string, Pick<UserProfile, 'displayName' | 'email'>>>({});
  const [storeCache, setStoreCache] = useState<Record<string, Pick<Store, 'name'>>>({});


  const form = useForm<TransactionFormValues>({
    resolver: zodResolver(transactionFormSchema),
    defaultValues: {
      userId: '',
      storeId: '',
      storeName: '',
      orderId: '',
      clickId: '',
      productDetails: '',
      transactionDate: new Date(),
      saleAmount: 0,
      cashbackAmount: 0,
      status: 'pending',
      adminNotes: '',
      notesToUser: '',
      rejectionReason: '',
    },
  });

  const fetchTransactionDetails = useCallback(async (rawTransactions: Transaction[]): Promise<TransactionWithUser[]> => {
    if (!db || firebaseInitializationError || rawTransactions.length === 0) return rawTransactions;

    const userIdsToFetch = [...new Set(rawTransactions.map(t => t.userId).filter(id => id && !userCache[id]))];
    const storeIdsToFetch = [...new Set(rawTransactions.map(t => t.storeId).filter(id => id && !storeCache[id] && !t.storeName))];

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
      console.error("Error fetching transaction details (users/stores):", detailError);
      toast({ variant: "destructive", title: "Detail Fetch Error", description: "Could not load some user/store names." });
    }

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
      console.error("Error fetching transactions:", err);
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

  const handleSearchSubmit = (e: React.FormEvent) => e.preventDefault();

  const handleLoadMore = () => {
    if (!loadingMore && hasMore && lastVisible) {
      fetchTransactions(true, lastVisible);
    }
  };

  const openAddDialog = () => {
    setEditingTransaction(null);
    form.reset({
      userId: '', storeId: '', storeName: '', orderId: '', clickId: '',
      productDetails: '', transactionDate: new Date(), saleAmount: 0,
      cashbackAmount: 0, status: 'pending', adminNotes: '', notesToUser: '', rejectionReason: ''
    });
    setIsDialogOpen(true);
  };

  const openEditDialog = (transaction: TransactionWithUser) => {
    setEditingTransaction(transaction);
    form.reset({
      userId: transaction.userId,
      storeId: transaction.storeId,
      storeName: transaction.storeName || '',
      orderId: transaction.orderId || '',
      clickId: transaction.clickId || '',
      productDetails: transaction.productDetails || '',
      transactionDate: safeToDate(transaction.transactionDate) || new Date(),
      saleAmount: transaction.finalSaleAmount ?? transaction.saleAmount,
      cashbackAmount: transaction.finalCashbackAmount ?? transaction.initialCashbackAmount ?? 0,
      status: transaction.status,
      adminNotes: transaction.adminNotes || '',
      notesToUser: transaction.notesToUser || '',
      rejectionReason: transaction.rejectionReason || '',
    });
    setIsDialogOpen(true);
  };

  const handleAddOrEditTransactionSubmit = async (data: TransactionFormValues) => {
    if (!db) { setPageError("Database not available."); setIsSaving(false); return; }
    setIsSaving(true);
    setPageError(null);

    const originalTransaction = editingTransaction;
    const newStatus = data.status;
    const oldStatus = originalTransaction?.status;

    try {
      if (editingTransaction) { // --- EDITING EXISTING TRANSACTION ---
        await runTransaction(db, async (firestoreTransaction) => {
          const transactionDocRef = doc(db, 'transactions', editingTransaction.id);
          const userDocRef = doc(db, 'users', editingTransaction.userId);

          const transactionSnap = await firestoreTransaction.get(transactionDocRef);
          const userSnap = await firestoreTransaction.get(userDocRef);

          if (!transactionSnap.exists()) throw new Error("Transaction not found.");
          if (!userSnap.exists()) throw new Error("User profile not found.");

          const currentTransactionData = transactionSnap.data() as Transaction;
          
          const updatesForTransaction: Partial<Transaction> = {
            ...data,
            storeName: data.storeName || (storeCache[data.storeId]?.name || null),
            finalSaleAmount: data.saleAmount,
            finalCashbackAmount: data.cashbackAmount,
            updatedAt: serverTimestamp(),
            rejectionReason: (newStatus === 'rejected' || newStatus === 'cancelled') ? data.rejectionReason : null,
            notesToUser: data.notesToUser || null,
            adminNotes: data.adminNotes || null,
          };

          const userProfileUpdates: Record<string, any> = { updatedAt: serverTimestamp() };
          const oldCashbackInDb = currentTransactionData.finalCashbackAmount ?? currentTransactionData.initialCashbackAmount ?? 0;
          const newCashbackAmountFromForm = data.cashbackAmount;

          if (newStatus !== oldStatus) {
            updatesForTransaction.confirmationDate = (newStatus === 'confirmed' || newStatus === 'paid') ? 
                                                     (currentTransactionData.confirmationDate || serverTimestamp()) : null;
            updatesForTransaction.paidDate = newStatus === 'paid' ? (currentTransactionData.paidDate || serverTimestamp()) : null;

            // Reverting from Confirmed/Paid to Pending/Rejected/Cancelled
            if ((oldStatus === 'confirmed' || oldStatus === 'paid') && (newStatus === 'pending' || newStatus === 'rejected' || newStatus === 'cancelled')) {
              userProfileUpdates.cashbackBalance = increment(-oldCashbackInDb);
              if (oldStatus !== 'paid') userProfileUpdates.lifetimeCashback = increment(-oldCashbackInDb); // Don't double-deduct lifetime if it was already paid
              if (newStatus === 'pending') userProfileUpdates.pendingCashback = increment(newCashbackAmountFromForm); // Add the new amount to pending
            }
            // Reverting from Pending to Rejected/Cancelled
            else if (oldStatus === 'pending' && (newStatus === 'rejected' || newStatus === 'cancelled')) {
              userProfileUpdates.pendingCashback = increment(-oldCashbackInDb);
            }
            // Moving to Confirmed/Paid from Pending
            else if (oldStatus === 'pending' && (newStatus === 'confirmed' || newStatus === 'paid')) {
              userProfileUpdates.pendingCashback = increment(-oldCashbackInDb);
              userProfileUpdates.cashbackBalance = increment(newCashbackAmountFromForm);
              userProfileUpdates.lifetimeCashback = increment(newCashbackAmountFromForm);
            }
            // Moving to Paid from Confirmed (No change to user balance fields, only transaction status)
            // else if (oldStatus === 'confirmed' && newStatus === 'paid') { /* No direct balance change here */ }
          } else { // Status is the same, but amounts might have changed
            if (newStatus === 'confirmed' || newStatus === 'paid') {
              if (newCashbackAmountFromForm !== oldCashbackInDb) {
                const diff = newCashbackAmountFromForm - oldCashbackInDb;
                userProfileUpdates.cashbackBalance = increment(diff);
                userProfileUpdates.lifetimeCashback = increment(diff);
              }
            } else if (newStatus === 'pending') {
              if (newCashbackAmountFromForm !== oldCashbackInDb) {
                const diff = newCashbackAmountFromForm - oldCashbackInDb;
                userProfileUpdates.pendingCashback = increment(diff);
              }
            }
          }

          firestoreTransaction.update(transactionDocRef, updatesForTransaction);
          if (Object.keys(userProfileUpdates).length > 1) {
            firestoreTransaction.update(userDocRef, userProfileUpdates);
          }
        });

        toast({ title: "Transaction Updated", description: `Transaction ${editingTransaction.id} details saved.` });
        fetchTransactions(false, null); // Re-fetch

      } else { // --- ADDING NEW TRANSACTION ---
        await runTransaction(db, async (firestoreTransaction) => {
            const userDocRef = doc(db, 'users', data.userId);
            const userSnap = await firestoreTransaction.get(userDocRef);
            if (!userSnap.exists()) throw new Error(`User with ID ${data.userId} not found.`);

            const newTransactionRef = doc(collection(db, 'transactions'));
            const transactionDataToSave: Omit<Transaction, 'id'> = {
                ...data,
                storeName: data.storeName || (storeCache[data.storeId]?.name || null),
                transactionDate: data.transactionDate, // Already a Date object from form
                initialCashbackAmount: data.cashbackAmount,
                finalSaleAmount: data.saleAmount,
                finalCashbackAmount: data.cashbackAmount,
                rejectionReason: (data.status === 'rejected' || data.status === 'cancelled') ? data.rejectionReason : null,
                confirmationDate: (data.status === 'confirmed' || data.status === 'paid') ? serverTimestamp() : null,
                paidDate: data.status === 'paid' ? serverTimestamp() : null,
                payoutId: null,
                reportedDate: serverTimestamp(),
                createdAt: serverTimestamp(),
                updatedAt: serverTimestamp(),
                currency: 'INR', // Assuming INR
                notesToUser: data.notesToUser || null,
                adminNotes: data.adminNotes || null,
            };
            firestoreTransaction.set(newTransactionRef, transactionDataToSave);

            const userProfileUpdates: Record<string, any> = { updatedAt: serverTimestamp() };
            if (data.status === 'pending') {
                userProfileUpdates.pendingCashback = increment(data.cashbackAmount);
            } else if (data.status === 'confirmed' || data.status === 'paid') {
                userProfileUpdates.cashbackBalance = increment(data.cashbackAmount);
                userProfileUpdates.lifetimeCashback = increment(data.cashbackAmount);
            }
            if (Object.keys(userProfileUpdates).length > 1) {
                firestoreTransaction.update(userDocRef, userProfileUpdates);
            }
        });
        toast({ title: "Transaction Added", description: `New transaction has been created.` });
        fetchTransactions(false, null); // Re-fetch
      }
      setIsDialogOpen(false);
      form.reset();
    } catch (err) {
      console.error("Error saving transaction:", err);
      const errorMsg = err instanceof Error ? err.message : "Could not save transaction details.";
      setPageError(errorMsg);
      toast({ variant: "destructive", title: "Save Failed", description: errorMsg });
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
            <Button onClick={openAddDialog}><PlusCircle className="mr-2 h-4 w-4" /> Add Transaction</Button>
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
                <Select value={filterStatus} onValueChange={(value) => setFilterStatus(value as CashbackStatus | 'all')}>
                  <SelectTrigger><SelectValue placeholder="Select Status" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Statuses</SelectItem>
                    <SelectItem value="pending">Pending</SelectItem>
                    <SelectItem value="confirmed">Confirmed</SelectItem>
                    <SelectItem value="rejected">Rejected</SelectItem>
                    <SelectItem value="cancelled">Cancelled</SelectItem>
                    <SelectItem value="paid">Paid</SelectItem>
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
            <CardDescription>Review and manage user transactions and cashback.</CardDescription>
          </CardHeader>
          <CardContent>
            {loading && transactions.length === 0 ? (
              <TransactionsTableSkeleton />
            ) : !loading && transactions.length === 0 && !pageError ? (
              <p className="text-center text-muted-foreground py-8">
                {debouncedSearchTerm || filterStatus !== 'all' ? 'No transactions found matching your criteria.' : 'No transactions recorded yet.'}
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
                      <TableHead>Confirmed/Paid Date</TableHead>
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
                        <TableCell className="whitespace-nowrap text-xs">
                            {transaction.confirmationDate ? `Conf: ${format(safeToDate(transaction.confirmationDate)!, 'PP')}` : ''}
                            {transaction.confirmationDate && transaction.paidDate ? <br /> : ''}
                            {transaction.paidDate ? `Paid: ${format(safeToDate(transaction.paidDate)!, 'PP')}` : ''}
                            {!transaction.confirmationDate && !transaction.paidDate ? 'N/A' : ''}
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

        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>{editingTransaction ? 'Edit Transaction' : 'Add New Transaction'}</DialogTitle>
              <DialogDescription>
                {editingTransaction ? `Update details for transaction ID: ${editingTransaction.id}` : 'Manually enter a new transaction.'}
              </DialogDescription>
            </DialogHeader>
            <form onSubmit={form.handleSubmit(handleAddOrEditTransactionSubmit)} className="grid gap-4 py-4">
              <div className="grid grid-cols-4 items-center gap-4">
                <Label htmlFor="userIdForm" className="text-right col-span-1">User ID*</Label>
                <Input id="userIdForm" {...form.register('userId')} className="col-span-3" disabled={isSaving || !!editingTransaction} />
                {form.formState.errors.userId && <p className="col-span-3 col-start-2 text-sm text-destructive">{form.formState.errors.userId.message}</p>}
              </div>
              <div className="grid grid-cols-4 items-center gap-4">
                <Label htmlFor="storeIdForm" className="text-right col-span-1">Store ID*</Label>
                <Input id="storeIdForm" {...form.register('storeId')} className="col-span-3" disabled={isSaving || !!editingTransaction}/>
                {form.formState.errors.storeId && <p className="col-span-3 col-start-2 text-sm text-destructive">{form.formState.errors.storeId.message}</p>}
              </div>
              <div className="grid grid-cols-4 items-center gap-4">
                <Label htmlFor="storeNameForm" className="text-right col-span-1">Store Name</Label>
                <Input id="storeNameForm" {...form.register('storeName')} className="col-span-3" disabled={isSaving} placeholder="Auto-filled if Store ID known"/>
              </div>
              <div className="grid grid-cols-4 items-center gap-4">
                <Label htmlFor="orderIdForm" className="text-right col-span-1">Order ID</Label>
                <Input id="orderIdForm" {...form.register('orderId')} className="col-span-3" disabled={isSaving}/>
              </div>
              <div className="grid grid-cols-4 items-center gap-4">
                <Label htmlFor="clickIdForm" className="text-right col-span-1">Click ID</Label>
                <Input id="clickIdForm" {...form.register('clickId')} className="col-span-3" disabled={isSaving}/>
              </div>
              <div className="grid grid-cols-4 items-center gap-4">
                <Label htmlFor="productDetailsForm" className="text-right col-span-1">Product Details</Label>
                <Textarea id="productDetailsForm" {...form.register('productDetails')} className="col-span-3" rows={2} disabled={isSaving}/>
              </div>
              <div className="grid grid-cols-4 items-center gap-4">
                 <Label htmlFor="transactionDateForm" className="text-right col-span-1">Transaction Date*</Label>
                  <Controller name="transactionDate" control={form.control} render={({ field }) => (
                    <Popover>
                      <PopoverTrigger asChild>
                        <Button variant={"outline"} className={cn("col-span-3 justify-start text-left font-normal h-10",!field.value && "text-muted-foreground")} disabled={isSaving}>
                          <CalendarIconLucide className="mr-2 h-4 w-4" />
                          {field.value ? format(field.value, "PPP") : <span>Pick a date</span>}
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0">
                        <Calendar mode="single" selected={field.value} onSelect={field.onChange} initialFocus disabled={isSaving}/>
                      </PopoverContent>
                    </Popover>
                  )} />
                  {form.formState.errors.transactionDate && <p className="col-span-3 col-start-2 text-sm text-destructive">{form.formState.errors.transactionDate.message}</p>}
              </div>
              <div className="grid grid-cols-4 items-center gap-4">
                <Label htmlFor="saleAmountForm" className="text-right col-span-1">Sale Amount*</Label>
                <Input id="saleAmountForm" type="number" step="0.01" {...form.register('saleAmount', { valueAsNumber: true })} className="col-span-3" disabled={isSaving}/>
                {form.formState.errors.saleAmount && <p className="col-span-3 col-start-2 text-sm text-destructive">{form.formState.errors.saleAmount.message}</p>}
              </div>
               <div className="grid grid-cols-4 items-center gap-4">
                <Label htmlFor="cashbackAmountForm" className="text-right col-span-1">Cashback Amount*</Label>
                <Input id="cashbackAmountForm" type="number" step="0.01" {...form.register('cashbackAmount', { valueAsNumber: true })} className="col-span-3" disabled={isSaving}/>
                {form.formState.errors.cashbackAmount && <p className="col-span-3 col-start-2 text-sm text-destructive">{form.formState.errors.cashbackAmount.message}</p>}
              </div>
              <div className="grid grid-cols-4 items-center gap-4">
                <Label htmlFor="statusForm" className="text-right col-span-1">Status*</Label>
                <Controller name="status" control={form.control} render={({ field }) => (
                    <Select value={field.value} onValueChange={field.onChange} disabled={isSaving}>
                    <SelectTrigger id="statusForm" className="col-span-3"><SelectValue /></SelectTrigger>
                    <SelectContent>
                        <SelectItem value="pending">Pending</SelectItem>
                        <SelectItem value="confirmed">Confirmed</SelectItem>
                        <SelectItem value="rejected">Rejected</SelectItem>
                        <SelectItem value="cancelled">Cancelled</SelectItem>
                        <SelectItem value="paid">Paid</SelectItem>
                    </SelectContent>
                    </Select>
                )} />
                {form.formState.errors.status && <p className="col-span-3 col-start-2 text-sm text-destructive">{form.formState.errors.status.message}</p>}
              </div>
              {(form.watch('status') === 'rejected' || form.watch('status') === 'cancelled') && (
                  <div className="grid grid-cols-4 items-center gap-4">
                      <Label htmlFor="rejectionReasonForm" className="text-right col-span-1">Rejection Reason</Label>
                      <Input id="rejectionReasonForm" {...form.register('rejectionReason')} className="col-span-3" disabled={isSaving} placeholder="Required if rejected/cancelled"/>
                  </div>
              )}
              <div className="grid grid-cols-4 items-center gap-4">
                <Label htmlFor="adminNotesForm" className="text-right col-span-1">Admin Notes</Label>
                <Textarea id="adminNotesForm" {...form.register('adminNotes')} className="col-span-3" rows={2} disabled={isSaving}/>
              </div>
              <div className="grid grid-cols-4 items-center gap-4">
                <Label htmlFor="notesToUserForm" className="text-right col-span-1">Notes for User</Label>
                <Textarea id="notesToUserForm" {...form.register('notesToUser')} className="col-span-3" rows={2} disabled={isSaving}/>
              </div>
              <DialogFooter>
                <DialogClose asChild>
                  <Button type="button" variant="outline" disabled={isSaving}>Cancel</Button>
                </DialogClose>
                <Button type="submit" disabled={isSaving}>
                  {isSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                  {editingTransaction ? 'Save Changes' : 'Add Transaction'}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>
    </AdminGuard>
  );
}
