// src/app/admin/transactions/page.tsx
"use client";

import * as React from 'react';
import { useState, useEffect } from 'react';
import { collection, getDocs, query, orderBy, doc, getDoc, limit, startAfter, QueryDocumentSnapshot, DocumentData, Timestamp } from 'firebase/firestore'; // Import Timestamp
import { db } from '@/lib/firebase/config';
import type { Transaction, Store, UserProfile } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { format } from 'date-fns';
import { AlertCircle, MoreHorizontal, PlusCircle, ListOrdered, RefreshCw } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useToast } from "@/hooks/use-toast";
import AdminGuard from '@/components/guards/admin-guard';
import TransactionForm from '@/components/admin/transaction-processing'; // Import the TransactionForm component

const TRANSACTIONS_PER_PAGE = 20;

interface TransactionWithDetails extends Transaction {
  storeName?: string;
  userEmail?: string | null;
  userDisplayName?: string | null;
}

function AdminTransactionsPageContent() {
  const [transactions, setTransactions] = useState<TransactionWithDetails[]>([]);
  const [stores, setStores] = useState<Store[]>([]); // Needed for the form
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { toast } = useToast();
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [selectedTransaction, setSelectedTransaction] = useState<Transaction | null>(null);
  const [lastVisible, setLastVisible] = useState<QueryDocumentSnapshot<DocumentData> | null>(null);
  const [hasMore, setHasMore] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const fetchStores = async () => {
      // Fetch stores needed for the dropdown in TransactionForm
      try {
          const storesCollection = collection(db, 'stores');
          const storesSnapshot = await getDocs(query(storesCollection, orderBy('name', 'asc')));
          const storesData = storesSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Store));
          setStores(storesData);
      } catch (err) {
          console.error("Error fetching stores for form:", err);
          setError("Failed to load stores data needed for adding/editing transactions.");
      }
  };

 const fetchTransactions = async (loadMore = false) => {
     if (!loadMore) {
         setLoading(true);
         setTransactions([]);
         setLastVisible(null);
         setHasMore(true);
     } else {
         if (!lastVisible || !hasMore || loadingMore) return;
         setLoadingMore(true);
     }
     setError(null);

     try {
         const transactionsCollection = collection(db, 'transactions');
         let q;
         if (loadMore && lastVisible) {
             q = query(
                 transactionsCollection,
                 orderBy('transactionDate', 'desc'),
                 startAfter(lastVisible),
                 limit(TRANSACTIONS_PER_PAGE)
             );
         } else {
             q = query(
                 transactionsCollection,
                 orderBy('transactionDate', 'desc'),
                 limit(TRANSACTIONS_PER_PAGE)
             );
         }

         const querySnapshot = await getDocs(q);
         const newTransactionsData = querySnapshot.docs.map(doc => mapDocToTransaction(doc));

         // Fetch store and user details for these transactions
         const detailedTransactions = await fetchDetailsForTransactions(newTransactionsData);

         setTransactions(prev => loadMore ? [...prev, ...detailedTransactions] : detailedTransactions);
         setLastVisible(querySnapshot.docs[querySnapshot.docs.length - 1] ?? null); // Handle empty snapshot case
         setHasMore(querySnapshot.docs.length === TRANSACTIONS_PER_PAGE);

     } catch (err: any) {
         console.error("Error fetching transactions:", err);
         setError(`Failed to load transactions. Error: ${err.message}`); // Include error message
     } finally {
         if (!loadMore) setLoading(false);
         setLoadingMore(false);
         setIsRefreshing(false); // Stop refresh indicator
     }
 };

  // Function to fetch user and store details for a batch of transactions
  const fetchDetailsForTransactions = async (txs: Transaction[]): Promise<TransactionWithDetails[]> => {
      if (txs.length === 0) return [];

      const storeIds = Array.from(new Set(txs.map(tx => tx.storeId).filter(Boolean))); // Filter out undefined/null IDs
      const userIds = Array.from(new Set(txs.map(tx => tx.userId).filter(Boolean)));

      const storesMap = new Map<string, string>();
      const usersMap = new Map<string, Pick<UserProfile, 'email' | 'displayName'>>();

      // Fetch stores (consider fetching only if not already cached)
      if (storeIds.length > 0) {
          // Simplified fetch, batching might be needed for > 10 IDs in 'in' query
          const storesQuery = query(collection(db, 'stores'), where('__name__', 'in', storeIds));
          const storeDocs = await getDocs(storesQuery);
          storeDocs.forEach(docSnap => {
              if (docSnap.exists()) storesMap.set(docSnap.id, docSnap.data().name || 'Unknown Store');
          });
      }

      // Fetch users
      if (userIds.length > 0) {
         // Simplified fetch
         const usersQuery = query(collection(db, 'users'), where('__name__', 'in', userIds));
         const userDocs = await getDocs(usersQuery);
         userDocs.forEach(docSnap => {
             if (docSnap.exists()) {
                 usersMap.set(docSnap.id, {
                     email: docSnap.data().email || null,
                     displayName: docSnap.data().displayName || null
                 });
             }
         });
      }

      return txs.map(tx => ({
          ...tx,
          storeName: tx.storeId ? (storesMap.get(tx.storeId) || tx.storeId) : 'N/A', // Handle missing storeId
          userEmail: tx.userId ? usersMap.get(tx.userId)?.email : null,
          userDisplayName: tx.userId ? usersMap.get(tx.userId)?.displayName : null
      }));
  };


  useEffect(() => {
    fetchStores(); // Fetch stores once on mount
    fetchTransactions(); // Fetch initial transactions
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleRefresh = () => {
     setIsRefreshing(true);
     fetchTransactions(); // Fetch initial transactions again
  };

  const handleEdit = (tx: Transaction) => {
    setSelectedTransaction(tx);
    setIsFormOpen(true);
  };

  // Add delete handler if needed (use AlertDialog for confirmation)
  // const handleDelete = async (txId: string) => { ... }

  const handleAddNew = () => {
    setSelectedTransaction(null);
    setIsFormOpen(true);
  };

  const handleFormSuccess = () => {
    setIsFormOpen(false);
    setSelectedTransaction(null);
    fetchTransactions(); // Refresh the list after add/edit
  };

  const getStatusBadgeVariant = (status: Transaction['status']): "default" | "secondary" | "outline" | "destructive" => {
    switch (status) {
      case 'confirmed': return 'default';
      case 'paid': return 'secondary';
      case 'pending': return 'outline';
      case 'rejected': return 'destructive';
      default: return 'outline';
    }
  };

  // Helper function to safely convert Firestore Timestamps or Dates
  const safeToDate = (fieldValue: any): Date | null => {
    if (fieldValue instanceof Timestamp) return fieldValue.toDate();
    if (fieldValue instanceof Date) return fieldValue;
    // Add more checks if needed (e.g., for ISO string dates)
    return null; // Return null if conversion is not possible
  };


  const mapDocToTransaction = (docSnap: QueryDocumentSnapshot<DocumentData>): Transaction => {
      const data = docSnap.data();
      const transactionDate = safeToDate(data.transactionDate);
      const confirmationDate = safeToDate(data.confirmationDate);
      const createdAt = safeToDate(data.createdAt);
      const updatedAt = safeToDate(data.updatedAt);

      return {
          id: docSnap.id,
          userId: data.userId || '', // Provide default empty string
          storeId: data.storeId || '', // Provide default empty string
          clickId: data.clickId || null,
          saleAmount: typeof data.saleAmount === 'number' ? data.saleAmount : 0,
          cashbackAmount: typeof data.cashbackAmount === 'number' ? data.cashbackAmount : 0,
          status: data.status || 'pending', // Default status
          transactionDate: transactionDate || new Date(0), // Fallback date
          confirmationDate: confirmationDate, // Keep null if conversion failed
          payoutId: data.payoutId || null,
          adminNotes: data.adminNotes || null, // Ensure null if missing
          createdAt: createdAt || new Date(0), // Fallback date
          updatedAt: updatedAt || createdAt || new Date(0), // Fallback dates
      } as Transaction;
  };


  return (
    <AdminGuard>
       <Card>
         <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4">
            <div>
               <CardTitle className="text-2xl flex items-center gap-2">
                 <ListOrdered className="w-6 h-6"/> Manage Transactions
               </CardTitle>
               <CardDescription>View, add, or edit cashback transactions.</CardDescription>
            </div>
             <div className="flex items-center gap-2">
               <Button onClick={handleRefresh} variant="outline" size="icon" disabled={isRefreshing || loading}>
                  <RefreshCw className={`h-4 w-4 ${isRefreshing ? 'animate-spin' : ''}`} />
                  <span className="sr-only">Refresh</span>
               </Button>
               <Button onClick={handleAddNew} disabled={loading || isRefreshing}>
                   <PlusCircle className="mr-2 h-4 w-4" /> Add New Transaction
               </Button>
            </div>
         </CardHeader>
         <CardContent>
           {error && (
             <Alert variant="destructive" className="mb-4">
               <AlertCircle className="h-4 w-4" />
               <AlertTitle>Error</AlertTitle>
               <AlertDescription>{error}</AlertDescription>
             </Alert>
           )}
           {/* Conditionally render form in a Dialog/Sheet */}
           {isFormOpen && (
             <TransactionForm
               stores={stores}
               transaction={selectedTransaction}
               onClose={() => setIsFormOpen(false)}
               onSuccess={handleFormSuccess}
             />
           )}

           {/* Transaction Table */}
           {!isFormOpen && (
              loading ? (
                <TransactionsTableSkeleton />
              ) : transactions.length > 0 ? (
                 <>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Date</TableHead>
                        <TableHead>User</TableHead>
                        <TableHead>Store</TableHead>
                        <TableHead className="hidden md:table-cell text-right">Sale Amt</TableHead>
                        <TableHead className="text-right">Cashback</TableHead>
                        <TableHead className="text-center">Status</TableHead>
                         <TableHead className="hidden lg:table-cell">Notes</TableHead>
                        <TableHead className="text-center">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {transactions.map((tx) => (
                        <TableRow key={tx.id}>
                          <TableCell>{format(tx.transactionDate, 'PP')}</TableCell>
                           <TableCell>
                              <div className="font-medium truncate max-w-[150px]" title={tx.userDisplayName || tx.userEmail || tx.userId}>
                                  {tx.userDisplayName || tx.userEmail || tx.userId.substring(0, 8) + '...'}
                              </div>
                               <div className="text-xs text-muted-foreground truncate max-w-[150px]">{tx.userEmail ? tx.userEmail : tx.userId}</div>
                           </TableCell>
                          <TableCell className="max-w-[150px] truncate">{tx.storeName}</TableCell>
                          <TableCell className="hidden md:table-cell text-right">₹{tx.saleAmount?.toFixed(2) ?? 'N/A'}</TableCell>
                          <TableCell className="text-right font-semibold">₹{tx.cashbackAmount?.toFixed(2) ?? 'N/A'}</TableCell>
                          <TableCell className="text-center">
                            <Badge variant={getStatusBadgeVariant(tx.status)} className="capitalize">
                              {tx.status}
                            </Badge>
                          </TableCell>
                          <TableCell className="hidden lg:table-cell text-xs text-muted-foreground max-w-[150px] truncate" title={tx.adminNotes || ''}>
                              {tx.adminNotes || '-'}
                          </TableCell>
                          <TableCell className="text-center">
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button variant="ghost" className="h-8 w-8 p-0">
                                  <span className="sr-only">Open menu</span>
                                  <MoreHorizontal className="h-4 w-4" />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end">
                                <DropdownMenuLabel>Actions</DropdownMenuLabel>
                                <DropdownMenuItem onClick={() => handleEdit(tx)}>Edit Transaction</DropdownMenuItem>
                                {/* <DropdownMenuItem disabled>View Click Details</DropdownMenuItem> */}
                                {/* Add Delete option with confirmation if needed */}
                                {/*
                                <DropdownMenuSeparator />
                                <AlertDialog>
                                   <AlertDialogTrigger asChild>
                                        <Button variant="ghost" className="w-full justify-start px-2 py-1.5 text-sm font-normal text-destructive hover:bg-destructive/10 focus:text-destructive focus:bg-destructive/10 h-auto relative flex ...">
                                           <Trash2 className="mr-2 h-4 w-4"/> Delete
                                        </Button>
                                   </AlertDialogTrigger>
                                   <AlertDialogContent>...</AlertDialogContent>
                                 </AlertDialog>
                                */}
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                   {hasMore && (
                       <div className="mt-6 text-center">
                           <Button onClick={() => fetchTransactions(true)} disabled={loadingMore}>
                               {loadingMore ? 'Loading...' : 'Load More Transactions'}
                           </Button>
                       </div>
                   )}
                </>
              ) : (
                <p className="text-center text-muted-foreground py-8">No transactions found.</p>
              )
            )}
         </CardContent>
       </Card>
     </AdminGuard>
   );
}

export default AdminTransactionsPageContent;


function TransactionsTableSkeleton() {
   return (
      <Table>
        <TableHeader>
          <TableRow>
             <TableHead><Skeleton className="h-4 w-20" /></TableHead>
             <TableHead><Skeleton className="h-4 w-32" /></TableHead>
             <TableHead><Skeleton className="h-4 w-24" /></TableHead>
             <TableHead className="hidden md:table-cell text-right"><Skeleton className="h-4 w-20 ml-auto" /></TableHead>
             <TableHead className="text-right"><Skeleton className="h-4 w-16 ml-auto" /></TableHead>
             <TableHead className="text-center"><Skeleton className="h-4 w-16 mx-auto" /></TableHead>
             <TableHead className="hidden lg:table-cell"><Skeleton className="h-4 w-24" /></TableHead>
             <TableHead className="text-center"><Skeleton className="h-4 w-16 mx-auto" /></TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {[...Array(10)].map((_, i) => (
            <TableRow key={i}>
               <TableCell><Skeleton className="h-4 w-24" /></TableCell>
               <TableCell>
                  <Skeleton className="h-4 w-28 mb-1" />
                  <Skeleton className="h-3 w-36" />
               </TableCell>
               <TableCell><Skeleton className="h-4 w-32" /></TableCell>
               <TableCell className="hidden md:table-cell text-right"><Skeleton className="h-4 w-16 ml-auto" /></TableCell>
               <TableCell className="text-right"><Skeleton className="h-4 w-12 ml-auto" /></TableCell>
               <TableCell className="text-center"><Skeleton className="h-5 w-20 mx-auto rounded-full" /></TableCell>
               <TableCell className="hidden lg:table-cell"><Skeleton className="h-4 w-28" /></TableCell>
               <TableCell className="text-center"><Skeleton className="h-8 w-8 rounded-full mx-auto" /></TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
   )
}