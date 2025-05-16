
"use client";

import * as React from 'react';
import { useState, useEffect, useCallback } from 'react';
import { useForm, Controller } from 'react-hook-form'; // Added useForm and Controller
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
  serverTimestamp,
  where,
  QueryConstraint,
  DocumentData,
  QueryDocumentSnapshot,
  Timestamp,
  runTransaction,
  writeBatch,
  addDoc,
  increment,
  getDoc
} from 'firebase/firestore';
import { db, firebaseInitializationError } from '@/lib/firebase/config';
import type { Transaction, CashbackStatus, UserProfile, TransactionFormValues } from '@/lib/types';
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
import { format, isValid } from 'date-fns';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { AlertCircle, Loader2, Search, Edit, Save, X, CheckCircle, Hourglass, PlusCircle, CalendarIcon } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { formatCurrency, safeToDate } from '@/lib/utils';
import AdminGuard from '@/components/guards/admin-guard';
import { useDebounce } from '@/hooks/use-debounce';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogClose, DialogTrigger } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { cn } from '@/lib/utils';

const TRANSACTIONS_PER_PAGE = 20;

const getStatusVariant = (status: CashbackStatus): "default" | "secondary" | "destructive" | "outline" => {
  switch (status) {
    case 'confirmed': return 'default'; // Greenish
    case 'paid': return 'secondary'; // Bluish
    case 'pending': return 'outline'; // Default outline
    case 'rejected':
    case 'cancelled': return 'destructive'; // Reddish
    default: return 'outline';
  }
};

const getStatusIcon = (status: CashbackStatus) => {
    switch (status) {
      case 'confirmed':
      case 'paid': return <CheckCircle className="h-4 w-4 text-green-600" />;
      case 'pending': return <Hourglass className="h-4 w-4 text-yellow-600" />;
      case 'rejected':
      case 'cancelled': return <XCircle className="h-4 w-4 text-red-600" />;
      default: return <AlertCircle className="h-4 w-4 text-muted-foreground" />;
    }
};

const transactionFormSchema = z.object({
    userId: z.string().min(1, "User ID is required").trim(),
    storeId: z.string().min(1, "Store ID is required").trim(),
    storeName: z.string().trim().optional().nullable(),
    orderId: z.string().trim().optional().nullable(),
    clickId: z.string().trim().optional().nullable(),
    saleAmount: z.number({invalid_type_error: "Sale amount must be a number."}).min(0.01, "Sale amount must be positive"),
    cashbackAmount: z.number({invalid_type_error: "Cashback amount must be a number."}).min(0.01, "Cashback amount must be positive"),
    status: z.enum(['pending', 'confirmed', 'rejected', 'paid', 'cancelled'], {required_error: "Status is required."}),
    transactionDate: z.date({ required_error: "Transaction date is required." }),
    adminNotes: z.string().trim().optional().nullable(),
    notesToUser: z.string().trim().optional().nullable(),
});


function AdminTransactionsPageContent() {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [pageError, setPageError] = useState<string | null>(null);
  const [lastVisible, setLastVisible] = useState<QueryDocumentSnapshot<DocumentData> | null>(null);
  const [hasMore, setHasMore] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const { toast } = useToast();

  const [filterStatus, setFilterStatus] = useState<CashbackStatus | 'all'>('all');
  const [searchTermInput, setSearchTermInput] = useState('');
  const debouncedSearchTerm = useDebounce(searchTermInput, 500);
  const [isSearching, setIsSearching] = useState(false);

  const [editingTransactionId, setEditingTransactionId] = useState<string | null>(null);
  const [editData, setEditData] = useState<{ status: CashbackStatus; adminNotes: string; notesToUser: string }>({ status: 'pending', adminNotes: '', notesToUser: '' });
  const [isSavingEdit, setIsSavingEdit] = useState(false);

  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [isAddingTransaction, setIsAddingTransaction] = useState(false);

  const addTransactionForm = useForm<TransactionFormValues>({
    resolver: zodResolver(transactionFormSchema),
    defaultValues: {
      userId: '',
      storeId: '',
      storeName: '',
      orderId: '',
      clickId: '',
      saleAmount: undefined,
      cashbackAmount: undefined,
      status: 'pending',
      transactionDate: new Date(),
      adminNotes: '',
      notesToUser: '',
    },
  });

  const fetchTransactions = useCallback(async (
    isLoadMoreOperation = false,
    currentSearchTerm = debouncedSearchTerm,
    currentFilterStatus = filterStatus,
    docToStartAfter = lastVisible
  ) => {
    let isMounted = true;
    if (!db || firebaseInitializationError) {
        if (isMounted) {
            setPageError(firebaseInitializationError || "Database connection not available.");
            if (!isLoadMoreOperation) setLoading(false); else setLoadingMore(false);
            setHasMore(false);
        }
        return () => { isMounted = false; };
    }

    if (!isLoadMoreOperation) {
      setLoading(true);
      setTransactions([]);
      setLastVisible(null);
      setHasMore(true);
    } else {
      if (!docToStartAfter && isLoadMoreOperation) {
        if(isMounted) setLoadingMore(false);
        return () => { isMounted = false; };
      }
      setLoadingMore(true);
    }
    if(!isLoadMoreOperation) setPageError(null);
    setIsSearching(currentSearchTerm !== '' || currentFilterStatus !== 'all');

    try {
      const transactionsCollection = collection(db, 'transactions');
      const constraints: QueryConstraint[] = [];

      if (currentFilterStatus !== 'all') {
        constraints.push(where('status', '==', currentFilterStatus));
      }
      if (currentSearchTerm) {
        constraints.push(where('userId', '==', currentSearchTerm));
      }

      constraints.push(orderBy('transactionDate', 'desc'));
      if (isLoadMoreOperation && docToStartAfter) {
        constraints.push(startAfter(docToStartAfter));
      }
      constraints.push(limit(TRANSACTIONS_PER_PAGE));

      const q = query(transactionsCollection, ...constraints);
      const querySnapshot = await getDocs(q);

      const transactionsData = querySnapshot.docs.map(docSnap => ({
        id: docSnap.id,
        ...docSnap.data(),
        createdAt: safeToDate(docSnap.data().createdAt),
        updatedAt: safeToDate(docSnap.data().updatedAt),
        transactionDate: safeToDate(docSnap.data().transactionDate),
        confirmationDate: safeToDate(docSnap.data().confirmationDate),
        paidDate: safeToDate(docSnap.data().paidDate),
      } as Transaction));

      if(isMounted) {
        setTransactions(prev => isLoadMoreOperation ? [...prev, ...transactionsData] : transactionsData);
        setLastVisible(querySnapshot.docs[querySnapshot.docs.length - 1] || null);
        setHasMore(querySnapshot.docs.length === TRANSACTIONS_PER_PAGE);
      }
    } catch (err) {
      console.error("Error fetching transactions:", err);
      if (isMounted) {
        const errorMsg = err instanceof Error ? err.message : "Failed to fetch transactions";
        setPageError(errorMsg);
        toast({ variant: "destructive", title: "Fetch Error", description: errorMsg });
        setHasMore(false);
      }
    } finally {
      if (isMounted) {
        if (!isLoadMoreOperation) setLoading(false); else setLoadingMore(false);
        setIsSearching(false);
      }
    }
    return () => { isMounted = false; };
  }, [toast, debouncedSearchTerm, filterStatus, lastVisible]);

  useEffect(() => {
    fetchTransactions(false);
  }, [fetchTransactions]);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
  };

  const handleLoadMore = () => {
    if (!loadingMore && hasMore) {
      fetchTransactions(true);
    }
  };

  const handleEditClick = (transaction: Transaction) => {
    setEditingTransactionId(transaction.id);
    setEditData({ status: transaction.status, adminNotes: transaction.adminNotes || '', notesToUser: transaction.notesToUser || '' });
  };

  const handleCancelEdit = () => {
    setEditingTransactionId(null);
  };

  const handleSaveEdit = async () => {
     if (!editingTransactionId || !db) {
       toast({ variant: "destructive", title: "Error", description: "Database not available or transaction not selected." });
       return;
     }
     setIsSavingEdit(true);
     const originalTransaction = transactions.find(tx => tx.id === editingTransactionId);
     if (!originalTransaction) {
         toast({ variant: "destructive", title: "Error", description: "Original transaction not found." });
         setIsSavingEdit(false);
         return;
     }

     const originalStatus = originalTransaction.status;
     const newStatus = editData.status;
     const cashbackAmount = originalTransaction.cashbackAmount;
     const userId = originalTransaction.userId;

     const userDocRef = doc(db, 'users', userId);
     const transactionDocRef = doc(db, 'transactions', editingTransactionId);

     console.log(`ADMIN: Saving edit for Tx ID: ${editingTransactionId}. Original Status: ${originalStatus}, New Status: ${newStatus}, Cashback: ${cashbackAmount}`);

     try {
        await runTransaction(db, async (transactionRunner) => {
            const userSnap = await transactionRunner.get(userDocRef);
            if (!userSnap.exists()) {
                throw new Error(`User profile for UID ${userId} not found.`);
            }
            const userProfile = userSnap.data() as UserProfile;
            const transactionUpdateData: Partial<Transaction> = {
                status: newStatus,
                adminNotes: editData.adminNotes.trim() || null,
                notesToUser: editData.notesToUser.trim() || null,
                updatedAt: serverTimestamp(),
            };

            let userBalanceUpdate: Partial<UserProfile> = { updatedAt: serverTimestamp() };
            let currentPendingCashback = userProfile.pendingCashback || 0;
            let currentCashbackBalance = userProfile.cashbackBalance || 0;
            let currentLifetimeCashback = userProfile.lifetimeCashback || 0;

            if (newStatus === 'confirmed' && originalStatus === 'pending') {
                console.log("ADMIN: Tx changing PENDING -> CONFIRMED");
                transactionUpdateData.confirmationDate = serverTimestamp();
                userBalanceUpdate.cashbackBalance = increment(cashbackAmount);
                userBalanceUpdate.pendingCashback = increment(-cashbackAmount);
                userBalanceUpdate.lifetimeCashback = increment(cashbackAmount);
            } else if ((newStatus === 'rejected' || newStatus === 'cancelled') && originalStatus === 'pending') {
                console.log(`ADMIN: Tx changing PENDING -> ${newStatus.toUpperCase()}`);
                userBalanceUpdate.pendingCashback = increment(-cashbackAmount);
            } else if (newStatus === 'pending' && originalStatus === 'confirmed') {
                console.log("ADMIN: Tx changing CONFIRMED -> PENDING (Reverting)");
                transactionUpdateData.confirmationDate = null; // Or deleteField() if you want to remove it
                userBalanceUpdate.cashbackBalance = increment(-cashbackAmount);
                userBalanceUpdate.pendingCashback = increment(cashbackAmount);
                userBalanceUpdate.lifetimeCashback = increment(-cashbackAmount);
            } else if ((newStatus === 'rejected' || newStatus === 'cancelled') && originalStatus === 'confirmed') {
                console.log(`ADMIN: Tx changing CONFIRMED -> ${newStatus.toUpperCase()}`);
                userBalanceUpdate.cashbackBalance = increment(-cashbackAmount);
                userBalanceUpdate.lifetimeCashback = increment(-cashbackAmount);
            } else if (newStatus === 'paid' && originalStatus === 'confirmed') {
                 console.log("ADMIN: Tx changing CONFIRMED -> PAID (Already part of a payout)");
                 // This case usually means the payout was processed.
                 // Balance adjustments should have happened when payout was requested/approved.
                 // Just updating the transaction status and paidDate.
                 transactionUpdateData.paidDate = serverTimestamp();
            }


            console.log("ADMIN: Transaction Update Data:", transactionUpdateData);
            console.log("ADMIN: User Balance Update Data:", userBalanceUpdate);

            transactionRunner.update(transactionDocRef, transactionUpdateData);

            if (userBalanceUpdate.pendingCashback && typeof userBalanceUpdate.pendingCashback === 'object' && 'increment' in userBalanceUpdate.pendingCashback) {
                // @ts-ignore
                if (currentPendingCashback + userBalanceUpdate.pendingCashback.integerValue < 0) {
                    // @ts-ignore
                    userBalanceUpdate.pendingCashback = increment(-currentPendingCashback);
                }
            }
            if (userBalanceUpdate.cashbackBalance && typeof userBalanceUpdate.cashbackBalance === 'object' && 'increment' in userBalanceUpdate.cashbackBalance) {
                // @ts-ignore
                if (currentCashbackBalance + userBalanceUpdate.cashbackBalance.integerValue < 0) {
                    // @ts-ignore
                    userBalanceUpdate.cashbackBalance = increment(-currentCashbackBalance);
                }
            }
             if (userBalanceUpdate.lifetimeCashback && typeof userBalanceUpdate.lifetimeCashback === 'object' && 'increment' in userBalanceUpdate.lifetimeCashback) {
                // @ts-ignore
                if (currentLifetimeCashback + userBalanceUpdate.lifetimeCashback.integerValue < 0) {
                    // @ts-ignore
                    userBalanceUpdate.lifetimeCashback = increment(-currentLifetimeCashback);
                }
            }

            if(Object.keys(userBalanceUpdate).length > 1 || userBalanceUpdate.pendingCashback || userBalanceUpdate.cashbackBalance || userBalanceUpdate.lifetimeCashback) {
                transactionRunner.update(userDocRef, userBalanceUpdate);
            }
        });

         setTransactions(prev =>
             prev.map(tx =>
                 tx.id === editingTransactionId
                     ? { ...tx,
                         status: newStatus,
                         adminNotes: editData.adminNotes.trim() || null,
                         notesToUser: editData.notesToUser.trim() || null,
                         updatedAt: new Date(),
                         confirmationDate: newStatus === 'confirmed' ? new Date() : (originalStatus === 'confirmed' && newStatus !== 'confirmed' ? null : tx.confirmationDate),
                         paidDate: newStatus === 'paid' ? new Date() : tx.paidDate,
                       }
                     : tx
             )
         );

         toast({ title: "Transaction Updated", description: "Status and notes saved." });
         setEditingTransactionId(null);
     } catch (err) {
         console.error("Error updating transaction:", err);
         toast({ variant: "destructive", title: "Update Failed", description: err instanceof Error ? err.message : "Could not save changes." });
     } finally {
         setIsSavingEdit(false);
     }
  };

  const handleAddTransactionSubmit = async (data: TransactionFormValues) => {
    if (!db) {
        toast({ variant: "destructive", title: "Error", description: "Database not available." });
        return;
    }
    setIsAddingTransaction(true);
    console.log("ADMIN: Adding new transaction. Data:", data);

    try {
        const userDocRef = doc(db, 'users', data.userId);
        const userSnap = await getDoc(userDocRef);
        if (!userSnap.exists()) {
            throw new Error(`User with ID "${data.userId}" not found. Cannot add transaction.`);
        }

        const newTransactionData: Omit<Transaction, 'id'> = {
            ...data,
            storeName: data.storeName || null,
            orderId: data.orderId || null,
            clickId: data.clickId || null,
            transactionDate: Timestamp.fromDate(data.transactionDate),
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
            confirmationDate: data.status === 'confirmed' ? serverTimestamp() : null,
            paidDate: data.status === 'paid' ? serverTimestamp() : null,
            payoutId: null,
            adminNotes: data.adminNotes || null,
            notesToUser: data.notesToUser || null,
        };
        const docRef = await addDoc(collection(db, 'transactions'), newTransactionData);
        console.log("ADMIN: New transaction document created with ID:", docRef.id);

        await runTransaction(db, async (transactionRunner) => {
            const freshUserSnap = await transactionRunner.get(userDocRef);
            if (!freshUserSnap.exists()) throw new Error("User not found during balance update.");
            const currentProfile = freshUserSnap.data() as UserProfile;

            const userBalanceUpdate: Partial<UserProfile> = { updatedAt: serverTimestamp() };
            let currentPendingCashback = currentProfile.pendingCashback || 0;
            let currentCashbackBalance = currentProfile.cashbackBalance || 0;
            let currentLifetimeCashback = currentProfile.lifetimeCashback || 0;

            if (data.status === 'confirmed') {
                console.log("ADMIN: New transaction is CONFIRMED. Updating cashbackBalance and lifetimeCashback.");
                userBalanceUpdate.cashbackBalance = increment(data.cashbackAmount);
                userBalanceUpdate.lifetimeCashback = increment(data.cashbackAmount);
            } else if (data.status === 'pending') {
                console.log("ADMIN: New transaction is PENDING. Updating pendingCashback.");
                userBalanceUpdate.pendingCashback = increment(data.cashbackAmount);
            }

            if (userBalanceUpdate.pendingCashback && typeof userBalanceUpdate.pendingCashback === 'object' && 'increment' in userBalanceUpdate.pendingCashback) {
                // @ts-ignore
                if (currentPendingCashback + userBalanceUpdate.pendingCashback.integerValue < 0) { // @ts-ignore
                    userBalanceUpdate.pendingCashback = increment(-currentPendingCashback);
                }
            }
            if (userBalanceUpdate.cashbackBalance && typeof userBalanceUpdate.cashbackBalance === 'object' && 'increment' in userBalanceUpdate.cashbackBalance) {
                 // @ts-ignore
                if (currentCashbackBalance + userBalanceUpdate.cashbackBalance.integerValue < 0) { // @ts-ignore
                    userBalanceUpdate.cashbackBalance = increment(-currentCashbackBalance);
                }
            }
            if (userBalanceUpdate.lifetimeCashback && typeof userBalanceUpdate.lifetimeCashback === 'object' && 'increment' in userBalanceUpdate.lifetimeCashback) {
                 // @ts-ignore
                if (currentLifetimeCashback + userBalanceUpdate.lifetimeCashback.integerValue < 0) { // @ts-ignore
                    userBalanceUpdate.lifetimeCashback = increment(-currentLifetimeCashback);
                }
            }

            if(Object.keys(userBalanceUpdate).length > 1 || userBalanceUpdate.pendingCashback || userBalanceUpdate.cashbackBalance || userBalanceUpdate.lifetimeCashback) {
                transactionRunner.update(userDocRef, userBalanceUpdate);
                console.log("ADMIN: User balance updated in transaction for new transaction.");
            } else {
                console.log("ADMIN: No direct balance update needed for new transaction status:", data.status);
            }
        });

        setTransactions(prev => [{ ...newTransactionData, id: docRef.id, createdAt: new Date(), updatedAt: new Date(), transactionDate: data.transactionDate } as Transaction, ...prev].sort((a,b) => (b.transactionDate as Date).getTime() - (a.transactionDate as Date).getTime()));
        toast({ title: "Transaction Added", description: "New transaction recorded successfully." });
        setIsAddDialogOpen(false);
        addTransactionForm.reset();
    } catch (err) {
        console.error("Error adding transaction:", err);
        toast({ variant: "destructive", title: "Add Failed", description: err instanceof Error ? err.message : "Could not add transaction." });
    } finally {
        setIsAddingTransaction(false);
    }
  };


  if (loading && transactions.length === 0 && !pageError) {
    return <TransactionsTableSkeleton />;
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-3xl font-bold">Manage Transactions</h1>
        <Button onClick={() => setIsAddDialogOpen(true)}>
            <PlusCircle className="mr-2 h-4 w-4"/> Add Transaction
        </Button>
      </div>


      {pageError && !loading && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Error</AlertTitle>
          <AlertDescription>{pageError}</AlertDescription>
        </Alert>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Filter & Search</CardTitle>
          <CardDescription>Filter by status or search by User ID.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col sm:flex-row gap-4">
          <div className="flex-1">
            <Select value={filterStatus} onValueChange={(value) => setFilterStatus(value as CashbackStatus | 'all')}>
              <SelectTrigger id="filter-status-select">
                <SelectValue placeholder="Filter by Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Statuses</SelectItem>
                <SelectItem value="pending">Pending</SelectItem>
                <SelectItem value="confirmed">Confirmed</SelectItem>
                <SelectItem value="rejected">Rejected</SelectItem>
                <SelectItem value="paid">Paid</SelectItem>
                <SelectItem value="cancelled">Cancelled</SelectItem>
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
          <CardTitle>Transactions</CardTitle>
          <CardDescription>View and manage user cashback transactions.</CardDescription>
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
                    <TableHead>User ID</TableHead>
                    <TableHead>Store/Order ID</TableHead>
                    <TableHead>Amount</TableHead>
                    <TableHead>Cashback</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="min-w-[200px]">Admin Notes</TableHead>
                    <TableHead className="min-w-[200px]">Notes to User</TableHead>
                    <TableHead>Actions</TableHead>
                    </TableRow>
                </TableHeader>
                <TableBody>
                    {transactions.map((tx) => (
                    <TableRow key={tx.id}>
                        <TableCell className="font-mono text-xs truncate max-w-[100px]">
                            {tx.userId}
                            {tx.clickId && <span className="block text-muted-foreground text-[10px]">Click: {tx.clickId}</span>}
                        </TableCell>
                        <TableCell className="font-mono text-xs truncate max-w-[150px]">
                            {tx.storeName || tx.storeId}
                            {tx.orderId && <span className="block text-muted-foreground text-[10px]">Order: {tx.orderId}</span>}
                        </TableCell>
                        <TableCell>{formatCurrency(tx.saleAmount)}</TableCell>
                        <TableCell className="font-semibold">{formatCurrency(tx.cashbackAmount)}</TableCell>
                        <TableCell className="whitespace-nowrap">{tx.transactionDate && isValid(new Date(tx.transactionDate as Date)) ? format(new Date(tx.transactionDate as Date), 'PPp') : 'N/A'}</TableCell>
                        <TableCell>
                        {editingTransactionId === tx.id ? (
                            <Select
                                value={editData.status}
                                onValueChange={(value) => setEditData(prev => ({ ...prev, status: value as CashbackStatus }))}
                                disabled={isSavingEdit}
                            >
                                <SelectTrigger id={`status-edit-${tx.id}`} className="h-8 text-xs w-[120px]">
                                    <SelectValue/>
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="pending">Pending</SelectItem>
                                    <SelectItem value="confirmed">Confirmed</SelectItem>
                                    <SelectItem value="rejected">Rejected</SelectItem>
                                    <SelectItem value="paid">Paid</SelectItem>
                                    <SelectItem value="cancelled">Cancelled</SelectItem>
                                </SelectContent>
                            </Select>
                        ) : (
                            <Badge variant={getStatusVariant(tx.status)} className="flex items-center gap-1 w-fit">
                                {getStatusIcon(tx.status)}
                                {tx.status}
                            </Badge>
                        )}
                        </TableCell>
                        <TableCell>
                        {editingTransactionId === tx.id ? (
                            <Textarea
                            value={editData.adminNotes}
                            onChange={(e) => setEditData(prev => ({ ...prev, adminNotes: e.target.value }))}
                            placeholder="Internal notes"
                            className="h-16 text-xs resize-none"
                            disabled={isSavingEdit}
                            />
                        ) : (
                            <span className="text-xs text-muted-foreground truncate block max-w-[150px]">
                            {tx.adminNotes || '-'}
                            </span>
                        )}
                        </TableCell>
                         <TableCell>
                        {editingTransactionId === tx.id ? (
                            <Textarea
                            value={editData.notesToUser}
                            onChange={(e) => setEditData(prev => ({ ...prev, notesToUser: e.target.value }))}
                            placeholder="Visible to user (e.g., rejection reason)"
                            className="h-16 text-xs resize-none"
                            disabled={isSavingEdit}
                            />
                        ) : (
                            <span className="text-xs text-muted-foreground truncate block max-w-[150px]">
                            {tx.notesToUser || '-'}
                            </span>
                        )}
                        </TableCell>
                        <TableCell>
                        {editingTransactionId === tx.id ? (
                            <div className="flex gap-1">
                            <Button size="icon" variant="ghost" onClick={handleSaveEdit} disabled={isSavingEdit} className="h-7 w-7">
                                {isSavingEdit ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4 text-green-600"/>}
                            </Button>
                            <Button size="icon" variant="ghost" onClick={handleCancelEdit} disabled={isSavingEdit} className="h-7 w-7">
                                <X className="h-4 w-4 text-red-600"/>
                            </Button>
                            </div>
                        ) : (
                            <Button size="icon" variant="ghost" onClick={() => handleEditClick(tx)} className="h-7 w-7">
                            <Edit className="h-4 w-4" />
                            </Button>
                        )}
                        </TableCell>
                    </TableRow>
                    ))}
                </TableBody>
                </Table>
            </div>
          )}
          {hasMore && !loading && transactions.length > 0 && (
            <div className="mt-4 text-center">
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
            <DialogContent className="sm:max-w-xl">
                <DialogHeader>
                    <DialogTitle>Add New Transaction</DialogTitle>
                    <DialogDescription>Manually record a new cashback transaction.</DialogDescription>
                </DialogHeader>
                <form onSubmit={addTransactionForm.handleSubmit(handleAddTransactionSubmit)} className="space-y-4 py-4">
                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-1">
                            <Label htmlFor="add-userId">User ID*</Label>
                            <Input id="add-userId" {...addTransactionForm.register('userId')} disabled={isAddingTransaction} />
                            {addTransactionForm.formState.errors.userId && <p className="text-xs text-destructive">{addTransactionForm.formState.errors.userId.message}</p>}
                        </div>
                        <div className="space-y-1">
                            <Label htmlFor="add-storeId">Store ID*</Label>
                            <Input id="add-storeId" {...addTransactionForm.register('storeId')} disabled={isAddingTransaction} />
                            {addTransactionForm.formState.errors.storeId && <p className="text-xs text-destructive">{addTransactionForm.formState.errors.storeId.message}</p>}
                        </div>
                    </div>
                     <div className="space-y-1">
                        <Label htmlFor="add-storeName">Store Name (Optional)</Label>
                        <Input id="add-storeName" {...addTransactionForm.register('storeName')} disabled={isAddingTransaction} />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-1">
                            <Label htmlFor="add-orderId">Order ID (Optional)</Label>
                            <Input id="add-orderId" {...addTransactionForm.register('orderId')} disabled={isAddingTransaction} />
                        </div>
                        <div className="space-y-1">
                            <Label htmlFor="add-clickId">Click ID (Optional)</Label>
                            <Input id="add-clickId" {...addTransactionForm.register('clickId')} disabled={isAddingTransaction} />
                        </div>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-1">
                            <Label htmlFor="add-saleAmount">Sale Amount*</Label>
                            <Input id="add-saleAmount" type="number" step="0.01" {...addTransactionForm.register('saleAmount', { setValueAs: v => v === '' ? undefined : parseFloat(v) })} disabled={isAddingTransaction} />
                            {addTransactionForm.formState.errors.saleAmount && <p className="text-xs text-destructive">{addTransactionForm.formState.errors.saleAmount.message}</p>}
                        </div>
                        <div className="space-y-1">
                            <Label htmlFor="add-cashbackAmount">Cashback Amount*</Label>
                            <Input id="add-cashbackAmount" type="number" step="0.01" {...addTransactionForm.register('cashbackAmount', { setValueAs: v => v === '' ? undefined : parseFloat(v) })} disabled={isAddingTransaction} />
                            {addTransactionForm.formState.errors.cashbackAmount && <p className="text-xs text-destructive">{addTransactionForm.formState.errors.cashbackAmount.message}</p>}
                        </div>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-1">
                            <Label htmlFor="add-transactionDate">Transaction Date*</Label>
                            <Popover>
                                <PopoverTrigger asChild>
                                    <Button
                                        id="add-transactionDate-trigger"
                                        variant={"outline"}
                                        className={cn("w-full justify-start text-left font-normal h-10", !addTransactionForm.watch("transactionDate") && "text-muted-foreground")}
                                        disabled={isAddingTransaction}
                                    >
                                        <CalendarIcon className="mr-2 h-4 w-4" />
                                        {addTransactionForm.watch("transactionDate") ? format(addTransactionForm.watch("transactionDate")!, "PPP") : <span>Pick a date</span>}
                                    </Button>
                                </PopoverTrigger>
                                <PopoverContent className="w-auto p-0">
                                    <Calendar
                                        mode="single"
                                        selected={addTransactionForm.watch("transactionDate")}
                                        onSelect={(date) => addTransactionForm.setValue("transactionDate", date || new Date(), { shouldValidate: true })}
                                        initialFocus
                                    />
                                </PopoverContent>
                            </Popover>
                            {addTransactionForm.formState.errors.transactionDate && <p className="text-xs text-destructive">{addTransactionForm.formState.errors.transactionDate.message}</p>}
                        </div>
                         <div className="space-y-1">
                            <Label htmlFor="add-status">Status*</Label>
                            <Controller
                                control={addTransactionForm.control}
                                name="status"
                                render={({ field }) => (
                                    <Select
                                        value={field.value}
                                        onValueChange={(value) => field.onChange(value as CashbackStatus)}
                                        disabled={isAddingTransaction}
                                    >
                                        <SelectTrigger id="add-status-select">
                                            <SelectValue placeholder="Select status" />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="pending">Pending</SelectItem>
                                            <SelectItem value="confirmed">Confirmed</SelectItem>
                                            <SelectItem value="rejected">Rejected</SelectItem>
                                            <SelectItem value="paid">Paid</SelectItem>
                                            <SelectItem value="cancelled">Cancelled</SelectItem>
                                        </SelectContent>
                                    </Select>
                                )}
                            />
                            {addTransactionForm.formState.errors.status && <p className="text-xs text-destructive">{addTransactionForm.formState.errors.status.message}</p>}
                        </div>
                    </div>
                    <div className="space-y-1">
                        <Label htmlFor="add-adminNotes">Admin Notes (Optional)</Label>
                        <Textarea id="add-adminNotes" {...addTransactionForm.register('adminNotes')} disabled={isAddingTransaction} rows={2}/>
                    </div>
                     <div className="space-y-1">
                        <Label htmlFor="add-notesToUser">Notes to User (Optional)</Label>
                        <Textarea id="add-notesToUser" {...addTransactionForm.register('notesToUser')} disabled={isAddingTransaction} rows={2}/>
                    </div>
                    <DialogFooter>
                        <DialogClose asChild><Button type="button" variant="outline" disabled={isAddingTransaction}>Cancel</Button></DialogClose>
                        <Button type="submit" disabled={isAddingTransaction}>
                            {isAddingTransaction ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                            Add Transaction
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>

    </div>
  );
}

function TransactionsTableSkeleton() {
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

export default function AdminTransactionsPage() {
    return (
      <AdminGuard>
        <AdminTransactionsPageContent />
      </AdminGuard>
    );
}

