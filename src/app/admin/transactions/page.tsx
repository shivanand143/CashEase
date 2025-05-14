
// src/app/admin/transactions/page.tsx
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
  Timestamp
} from 'firebase/firestore';
import { db, firebaseInitializationError } from '@/lib/firebase/config';
import type { Transaction, CashbackStatus } from '@/lib/types';
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
import { AlertCircle, Loader2, Search, Edit, Save, X } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { formatCurrency, safeToDate } from '@/lib/utils';
import AdminGuard from '@/components/guards/admin-guard';
import { useDebounce } from '@/hooks/use-debounce';

const TRANSACTIONS_PER_PAGE = 20;

const getStatusVariant = (status: CashbackStatus): "default" | "secondary" | "destructive" | "outline" => {
  switch (status) {
    case 'confirmed': return 'default';
    case 'paid': return 'secondary';
    case 'pending': return 'outline';
    case 'rejected': return 'destructive';
    default: return 'outline';
  }
};

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
  const [editData, setEditData] = useState<{ status: CashbackStatus; adminNotes: string }>({ status: 'pending', adminNotes: '' });
  const [isSavingEdit, setIsSavingEdit] = useState(false);

  const fetchTransactions = useCallback(async (loadMore = false) => {
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
      setTransactions([]);
      setHasMore(true);
    } else {
      setLoadingMore(true);
    }
    setError(null);
    setIsSearching(debouncedSearchTerm !== '');

    try {
      const transactionsCollection = collection(db, 'transactions');
      const constraints: QueryConstraint[] = [];

      if (filterStatus !== 'all') {
        constraints.push(where('status', '==', filterStatus));
      }
      if (debouncedSearchTerm) {
        constraints.push(where('userId', '==', debouncedSearchTerm));
      }

      constraints.push(orderBy('transactionDate', 'desc'));
      if (loadMore && lastVisible) {
        constraints.push(startAfter(lastVisible));
      }
      constraints.push(limit(TRANSACTIONS_PER_PAGE));

      const q = query(transactionsCollection, ...constraints);
      const querySnapshot = await getDocs(q);

      const transactionsData = querySnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
        createdAt: safeToDate(doc.data().createdAt),
        updatedAt: safeToDate(doc.data().updatedAt),
        transactionDate: safeToDate(doc.data().transactionDate),
        confirmationDate: safeToDate(doc.data().confirmationDate),
        paidDate: safeToDate(doc.data().paidDate),
      } as Transaction));

      if (isInitialOrNewSearch) {
        setTransactions(transactionsData);
      } else {
        setTransactions(prev => [...prev, ...transactionsData]);
      }

      setLastVisible(querySnapshot.docs[querySnapshot.docs.length - 1] || null);
      setHasMore(querySnapshot.docs.length === TRANSACTIONS_PER_PAGE);

    } catch (err) {
      console.error("Error fetching transactions:", err);
      setError(err instanceof Error ? err.message : "Failed to fetch transactions");
      toast({ variant: "destructive", title: "Fetch Error", description: String(err) });
    } finally {
      setLoading(false);
      setLoadingMore(false);
      setIsSearching(false);
    }
  }, [filterStatus, debouncedSearchTerm, lastVisible, toast]);

  useEffect(() => {
    fetchTransactions(false);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterStatus, debouncedSearchTerm, fetchTransactions]); // fetchTransactions is now stable

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    // useEffect will trigger fetch due to debouncedSearchTerm change
  };

  const handleLoadMore = () => {
    if (!loadingMore && hasMore) {
      fetchTransactions(true);
    }
  };

  const handleEditClick = (transaction: Transaction) => {
    setEditingTransactionId(transaction.id);
    setEditData({ status: transaction.status, adminNotes: transaction.adminNotes || '' });
  };

  const handleCancelEdit = () => {
    setEditingTransactionId(null);
  };

  const handleSaveEdit = async () => {
     if (!editingTransactionId || !db) return;
     setIsSavingEdit(true);
     try {
         const transactionRef = doc(db, 'transactions', editingTransactionId);
         await updateDoc(transactionRef, {
             status: editData.status,
             adminNotes: editData.adminNotes.trim() || null,
             updatedAt: serverTimestamp(),
             confirmationDate: editData.status === 'confirmed' && !transactions.find(tx => tx.id === editingTransactionId)?.confirmationDate ? serverTimestamp() : transactions.find(tx => tx.id === editingTransactionId)?.confirmationDate || null,
             paidDate: editData.status === 'paid' && !transactions.find(tx => tx.id === editingTransactionId)?.paidDate ? serverTimestamp() : transactions.find(tx => tx.id === editingTransactionId)?.paidDate || null,
         });

         setTransactions(prev =>
             prev.map(tx =>
                 tx.id === editingTransactionId
                     ? { ...tx, status: editData.status, adminNotes: editData.adminNotes.trim() || null, updatedAt: new Date(),
                         confirmationDate: editData.status === 'confirmed' ? new Date() : tx.confirmationDate,
                         paidDate: editData.status === 'paid' ? new Date() : tx.paidDate,
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

  if (loading && transactions.length === 0 && !error) {
    return <TransactionsTableSkeleton />;
  }

  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold">Manage Transactions</h1>

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
                    <TableHead>Store ID</TableHead>
                    <TableHead>Amount</TableHead>
                    <TableHead>Cashback</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Admin Notes</TableHead>
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
                        <TableCell className="font-mono text-xs truncate max-w-[100px]">{tx.storeId}</TableCell>
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
                                <SelectTrigger className="h-8 text-xs">
                                    <SelectValue/>
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="pending">Pending</SelectItem>
                                    <SelectItem value="confirmed">Confirmed</SelectItem>
                                    <SelectItem value="rejected">Rejected</SelectItem>
                                    <SelectItem value="paid">Paid</SelectItem>
                                </SelectContent>
                            </Select>
                        ) : (
                            <Badge variant={getStatusVariant(tx.status)}>{tx.status}</Badge>
                        )}
                        </TableCell>
                        <TableCell>
                        {editingTransactionId === tx.id ? (
                            <Textarea
                            value={editData.adminNotes}
                            onChange={(e) => setEditData(prev => ({ ...prev, adminNotes: e.target.value }))}
                            placeholder="Add notes (e.g., reason for rejection)"
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
                {Array.from({ length: 8 }).map((_, index) => (
                    <TableHead key={index}><Skeleton className="h-5 w-full" /></TableHead>
                ))}
                </TableRow>
            </TableHeader>
            <TableBody>
                {Array.from({ length: 10 }).map((_, rowIndex) => (
                <TableRow key={rowIndex}>
                    {Array.from({ length: 8 }).map((_, colIndex) => (
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
