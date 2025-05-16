
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
  writeBatch,
  addDoc
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
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { cn } from '@/lib/utils';

const TRANSACTIONS_PER_PAGE = 20;

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
      case 'confirmed':
      case 'paid': return <CheckCircle className="h-4 w-4 text-green-600" />;
      case 'pending': return <Hourglass className="h-4 w-4 text-yellow-600" />;
      case 'rejected':
      case 'cancelled': return <XCircle className="h-4 w-4 text-red-600" />;
      default: return <AlertCircle className="h-4 w-4 text-muted-foreground" />;
    }
};

// Schema for manual transaction form
const transactionFormSchema = z.object({
    userId: z.string().min(1, "User ID is required"),
    storeId: z.string().min(1, "Store ID is required"),
    storeName: z.string().optional().nullable(),
    orderId: z.string().optional().nullable(),
    clickId: z.string().optional().nullable(),
    saleAmount: z.number().min(0.01, "Sale amount must be positive"),
    cashbackAmount: z.number().min(0.01, "Cashback amount must be positive"),
    status: z.enum(['pending', 'confirmed', 'rejected', 'paid', 'cancelled']),
    transactionDate: z.date({ required_error: "Transaction date is required." }),
    adminNotes: z.string().optional().nullable(),
});


function AdminTransactionsPageContent() {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
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
      saleAmount: 0,
      cashbackAmount: 0,
      status: 'pending',
      transactionDate: new Date(),
      adminNotes: '',
    },
  });


  const fetchTransactions = useCallback(async (loadMore = false) => {
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
      setTransactions([]);
      setHasMore(true);
    } else {
      setLoadingMore(true);
    }
    if(!loadMore) setError(null); // Clear previous page-level errors only on initial fetch
    setIsSearching(debouncedSearchTerm !== '');

    try {
      const transactionsCollection = collection(db, 'transactions');
      const constraints: QueryConstraint[] = [];

      if (filterStatus !== 'all') {
        constraints.push(where('status', '==', filterStatus));
      }
      if (debouncedSearchTerm) { // Assuming search by userId
        constraints.push(where('userId', '==', debouncedSearchTerm));
      }

      constraints.push(orderBy('transactionDate', 'desc'));
      if (loadMore && lastVisible) {
        constraints.push(startAfter(lastVisible));
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
        setTransactions(prev => loadMore ? [...prev, ...transactionsData] : transactionsData);
        setLastVisible(querySnapshot.docs[querySnapshot.docs.length - 1] || null);
        setHasMore(querySnapshot.docs.length === TRANSACTIONS_PER_PAGE);
      }
    } catch (err) {
      console.error("Error fetching transactions:", err);
      if (isMounted) {
        setError(err instanceof Error ? err.message : "Failed to fetch transactions");
        toast({ variant: "destructive", title: "Fetch Error", description: String(err) });
        setHasMore(false); // Stop pagination on error
      }
    } finally {
      if (isMounted) {
        if (!loadMore) setLoading(false); else setLoadingMore(false);
        setIsSearching(false);
      }
    }
    return () => { isMounted = false; };
  }, [filterStatus, debouncedSearchTerm, lastVisible, toast]);

  useEffect(() => {
    fetchTransactions(false);
  }, [fetchTransactions]); // fetchTransactions is now stable

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    fetchTransactions(false); // Trigger fetch with new search term
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
     if (!editingTransactionId || !db) return;
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

     try {
        await runTransaction(db, async (transaction) => {
            const userSnap = await transaction.get(userDocRef);
            if (!userSnap.exists()) {
                throw new Error(`User profile for UID ${userId} not found.`);
            }
            const userProfile = userSnap.data() as UserProfile;
            const updateData: Partial<Transaction> = {
                status: newStatus,
                adminNotes: editData.adminNotes.trim() || null,
                notesToUser: editData.notesToUser.trim() || null,
                updatedAt: serverTimestamp(),
            };

            let userBalanceUpdate: Partial<UserProfile> = { updatedAt: serverTimestamp() };

            // Logic for balance adjustments
            if (newStatus === 'confirmed' && originalStatus === 'pending') {
                updateData.confirmationDate = serverTimestamp();
                userBalanceUpdate.cashbackBalance = (userProfile.cashbackBalance || 0) + cashbackAmount;
                userBalanceUpdate.pendingCashback = Math.max(0, (userProfile.pendingCashback || 0) - cashbackAmount);
                userBalanceUpdate.lifetimeCashback = (userProfile.lifetimeCashback || 0) + cashbackAmount;
            } else if (newStatus === 'rejected' && originalStatus === 'pending') {
                userBalanceUpdate.pendingCashback = Math.max(0, (userProfile.pendingCashback || 0) - cashbackAmount);
            } else if (newStatus === 'pending' && originalStatus === 'confirmed') {
                // Reverting from confirmed to pending
                updateData.confirmationDate = null; // Clear confirmation date
                userBalanceUpdate.cashbackBalance = Math.max(0, (userProfile.cashbackBalance || 0) - cashbackAmount);
                userBalanceUpdate.pendingCashback = (userProfile.pendingCashback || 0) + cashbackAmount;
                userBalanceUpdate.lifetimeCashback = Math.max(0, (userProfile.lifetimeCashback || 0) - cashbackAmount);
            }
            // Paid status is typically handled by payout process, not direct transaction edit.
            // If admin manually marks as paid here, balance should have been handled by payout.
             if (newStatus === 'paid' && (originalStatus === 'confirmed' || originalStatus === 'pending')) {
                updateData.paidDate = serverTimestamp();
                if (originalStatus === 'pending') { // If it was pending and now paid, it needs to be confirmed first.
                     // This case indicates a direct jump. Ensure pending is also cleared.
                     userBalanceUpdate.pendingCashback = Math.max(0, (userProfile.pendingCashback || 0) - cashbackAmount);
                     // Balance should have already been confirmed and moved to cashbackBalance before payout
                }
             }


            transaction.update(transactionDocRef, updateData);
            if(Object.keys(userBalanceUpdate).length > 1) { // Only update user if more than just updatedAt
                transaction.update(userDocRef, userBalanceUpdate);
            } else {
                 transaction.update(userDocRef, {updatedAt: serverTimestamp()}); // Still update timestamp
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
                         confirmationDate: newStatus === 'confirmed' ? new Date() : tx.confirmationDate,
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
    if (!db) return;
    setIsAddingTransaction(true);
    try {
        const newTransactionData = {
            ...data,
            transactionDate: Timestamp.fromDate(data.transactionDate),
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
            confirmationDate: data.status === 'confirmed' ? serverTimestamp() : null,
            paidDate: data.status === 'paid' ? serverTimestamp() : null,
            payoutId: null, // New transactions won't have a payout ID yet
        };
        const docRef = await addDoc(collection(db, 'transactions'), newTransactionData);

        // If confirmed, update user's balance
        if (data.status === 'confirmed') {
            const userDocRef = doc(db, 'users', data.userId);
            await runTransaction(db, async (transaction) => {
                const userSnap = await transaction.get(userDocRef);
                if (!userSnap.exists()) throw new Error("User not found for balance update.");
                const userProfile = userSnap.data() as UserProfile;
                const newCashbackBalance = (userProfile.cashbackBalance || 0) + data.cashbackAmount;
                const newLifetimeCashback = (userProfile.lifetimeCashback || 0) + data.cashbackAmount;
                transaction.update(userDocRef, {
                    cashbackBalance: newCashbackBalance,
                    lifetimeCashback: newLifetimeCashback,
                    updatedAt: serverTimestamp()
                });
            });
        }
        // If pending, update user's pendingCashback
        if (data.status === 'pending') {
            const userDocRef = doc(db, 'users', data.userId);
             await runTransaction(db, async (transaction) => {
                const userSnap = await transaction.get(userDocRef);
                if (!userSnap.exists()) throw new Error("User not found for pending balance update.");
                const userProfile = userSnap.data() as UserProfile;
                const newPendingCashback = (userProfile.pendingCashback || 0) + data.cashbackAmount;
                transaction.update(userDocRef, {
                    pendingCashback: newPendingCashback,
                    updatedAt: serverTimestamp()
                });
            });
        }


        setTransactions(prev => [{...newTransactionData, id: docRef.id, createdAt: new Date(), updatedAt: new Date(), transactionDate: data.transactionDate } as Transaction, ...prev]);
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


  if (loading && transactions.length === 0 && !error) {
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


      {error && !loading && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Error</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
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
              <SelectTrigger>
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
          {loading && transactions.length === 0 && !error ? (
             <TransactionsTableSkeleton />
           ) : !loading && transactions.length === 0 && !error ? (
             <p className="text-center text-muted-foreground py-8">
                {debouncedSearchTerm || filterStatus !== 'all' ? 'No transactions found matching your criteria.' : 'No transactions found.'}
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
                        <TableCell className="whitespace-nowrap">{tx.transactionDate ? format(new Date(tx.transactionDate), 'PPp') : 'N/A'}</TableCell>
                        <TableCell>
                        {editingTransactionId === tx.id ? (
                            <Select
                                value={editData.status}
                                onValueChange={(value) => setEditData(prev => ({ ...prev, status: value as CashbackStatus }))}
                                disabled={isSavingEdit}
                            >
                                <SelectTrigger className="h-8 text-xs w-[120px]">
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
                Load More
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
                            <Label htmlFor="userId">User ID*</Label>
                            <Input id="userId" {...addTransactionForm.register('userId')} disabled={isAddingTransaction} />
                            {addTransactionForm.formState.errors.userId && <p className="text-xs text-destructive">{addTransactionForm.formState.errors.userId.message}</p>}
                        </div>
                        <div className="space-y-1">
                            <Label htmlFor="storeId">Store ID*</Label>
                            <Input id="storeId" {...addTransactionForm.register('storeId')} disabled={isAddingTransaction} />
                            {addTransactionForm.formState.errors.storeId && <p className="text-xs text-destructive">{addTransactionForm.formState.errors.storeId.message}</p>}
                        </div>
                    </div>
                     <div className="space-y-1">
                        <Label htmlFor="storeName">Store Name (Optional)</Label>
                        <Input id="storeName" {...addTransactionForm.register('storeName')} disabled={isAddingTransaction} />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-1">
                            <Label htmlFor="orderId">Order ID (Optional)</Label>
                            <Input id="orderId" {...addTransactionForm.register('orderId')} disabled={isAddingTransaction} />
                        </div>
                        <div className="space-y-1">
                            <Label htmlFor="clickId">Click ID (Optional)</Label>
                            <Input id="clickId" {...addTransactionForm.register('clickId')} disabled={isAddingTransaction} />
                        </div>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-1">
                            <Label htmlFor="saleAmount">Sale Amount*</Label>
                            <Input id="saleAmount" type="number" step="0.01" {...addTransactionForm.register('saleAmount', { valueAsNumber: true })} disabled={isAddingTransaction} />
                            {addTransactionForm.formState.errors.saleAmount && <p className="text-xs text-destructive">{addTransactionForm.formState.errors.saleAmount.message}</p>}
                        </div>
                        <div className="space-y-1">
                            <Label htmlFor="cashbackAmount">Cashback Amount*</Label>
                            <Input id="cashbackAmount" type="number" step="0.01" {...addTransactionForm.register('cashbackAmount', { valueAsNumber: true })} disabled={isAddingTransaction} />
                            {addTransactionForm.formState.errors.cashbackAmount && <p className="text-xs text-destructive">{addTransactionForm.formState.errors.cashbackAmount.message}</p>}
                        </div>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-1">
                            <Label htmlFor="transactionDate">Transaction Date*</Label>
                            <Popover>
                                <PopoverTrigger asChild>
                                    <Button
                                        variant={"outline"}
                                        className={cn("w-full justify-start text-left font-normal h-10", !addTransactionForm.watch("transactionDate") && "text-muted-foreground")}
                                        disabled={isAddingTransaction}
                                    >
                                        <CalendarIcon className="mr-2 h-4 w-4" />
                                        {addTransactionForm.watch("transactionDate") ? format(addTransactionForm.watch("transactionDate"), "PPP") : <span>Pick a date</span>}
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
                            <Label htmlFor="status">Status*</Label>
                            <Select
                                value={addTransactionForm.watch('status')}
                                onValueChange={(value) => addTransactionForm.setValue('status', value as CashbackStatus, { shouldValidate: true })}
                                disabled={isAddingTransaction}
                            >
                                <SelectTrigger id="status">
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
                            {addTransactionForm.formState.errors.status && <p className="text-xs text-destructive">{addTransactionForm.formState.errors.status.message}</p>}
                        </div>
                    </div>
                    <div className="space-y-1">
                        <Label htmlFor="adminNotes">Admin Notes (Optional)</Label>
                        <Textarea id="adminNotes" {...addTransactionForm.register('adminNotes')} disabled={isAddingTransaction} rows={2}/>
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
                {Array.from({ length: 9 }).map((_, index) => ( // Increased for new notesToUser column
                    <TableHead key={index}><Skeleton className="h-5 w-full" /></TableHead>
                ))}
                </TableRow>
            </TableHeader>
            <TableBody>
                {Array.from({ length: 10 }).map((_, rowIndex) => (
                <TableRow key={rowIndex}>
                    {Array.from({ length: 9 }).map((_, colIndex) => ( // Increased
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
