"use client";

import * as React from 'react';
import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
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
  deleteDoc,
  serverTimestamp,
  where,
  QueryConstraint,
  DocumentData,
  QueryDocumentSnapshot,
  addDoc // Import addDoc for creating new stores
} from 'firebase/firestore';
import { db } from '@/lib/firebase/config';
import type { Store, CashbackType } from '@/lib/types'; // Ensure Store type is defined
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
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { AlertCircle, Loader2, Search, Edit, Trash2, PlusCircle, CheckCircle, XCircle, ExternalLink } from 'lucide-react';
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
  DialogTrigger
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import AdminGuard from '@/components/guards/admin-guard'; // Ensure page is protected
import Image from 'next/image'; // For logo preview
import { Switch } from '@/components/ui/switch'; // For toggling active status
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { MoreHorizontal } from "lucide-react";
import { safeToDate } from '@/lib/utils'; // Utility function

const STORES_PER_PAGE = 15;

// Zod schema for store form validation
const storeSchema = z.object({
  name: z.string().min(2, 'Store name must be at least 2 characters').max(100, 'Store name too long'),
  affiliateLink: z.string().url('Invalid URL format'),
  cashbackRate: z.string().min(1, 'Cashback rate display is required').max(50, 'Rate display too long'),
  cashbackRateValue: z.number().min(0, 'Cashback value must be non-negative'),
  cashbackType: z.enum(['percentage', 'fixed']),
  description: z.string().min(10, 'Description must be at least 10 characters').max(500, 'Description too long'),
  logoUrl: z.string().url('Invalid URL format').optional().or(z.literal('')), // Optional logo URL
  categories: z.array(z.string()).min(1, 'At least one category is required'),
  terms: z.string().optional(),
  isFeatured: z.boolean().default(false),
  isActive: z.boolean().default(true),
});

type StoreFormValues = z.infer<typeof storeSchema>;

// Helper function to map status to badge variant
const getStatusVariant = (isActive: boolean): "default" | "secondary" => {
  return isActive ? 'default' : 'secondary'; // Green for active, gray for inactive
};

function AdminStoresPageContent() {
  const [stores, setStores] = useState<Store[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastVisible, setLastVisible] = useState<QueryDocumentSnapshot<DocumentData> | null>(null);
  const [hasMore, setHasMore] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const { toast } = useToast();
  const router = useRouter();

  // Filtering and Searching State
  const [searchTerm, setSearchTerm] = useState(''); // For searching by Name
  const [isSearching, setIsSearching] = useState(false);

  // State for Add/Edit Dialog
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingStore, setEditingStore] = useState<Store | null>(null); // null for Add, Store object for Edit
  const [isSaving, setIsSaving] = useState(false);
  const [deletingStoreId, setDeletingStoreId] = useState<string | null>(null); // Track which store is being deleted
  const [updatingStoreId, setUpdatingStoreId] = useState<string | null>(null); // Track status updates


  // React Hook Form setup
  const form = useForm<StoreFormValues>({
    resolver: zodResolver(storeSchema),
    defaultValues: {
      name: '',
      affiliateLink: '',
      cashbackRate: '',
      cashbackRateValue: 0,
      cashbackType: 'percentage',
      description: '',
      logoUrl: '',
      categories: [],
      terms: '',
      isFeatured: false,
      isActive: true,
    },
  });

  const fetchStores = useCallback(async (loadMore = false, search = false) => {
    if (!loadMore) {
      setLoading(true);
      setLastVisible(null);
      setStores([]);
    } else {
      setLoadingMore(true);
    }
    setError(null);
    setIsSearching(search);

    try {
      const storesCollection = collection(db, 'stores');
      const constraints: QueryConstraint[] = [];

      // Apply searching by name (case-insensitive requires backend/alternative search)
      // Firestore basic search:
      if (search && searchTerm) {
        constraints.push(where('name', '>=', searchTerm));
        constraints.push(where('name', '<=', searchTerm + '\uf8ff'));
      }

      // Apply ordering and pagination
       constraints.push(orderBy('name')); // Primary order by name
       if (!search) {
         constraints.push(orderBy('createdAt', 'desc')); // Default secondary order
       }

      if (loadMore && lastVisible) {
        constraints.push(startAfter(lastVisible));
      }
      constraints.push(limit(STORES_PER_PAGE));

      const q = query(storesCollection, ...constraints);
      const querySnapshot = await getDocs(q);

      const storesData = querySnapshot.docs.map(docSnap => {
          const data = docSnap.data();
          return {
            id: docSnap.id,
            name: data.name || '',
            logoUrl: data.logoUrl || null,
            affiliateLink: data.affiliateLink || '',
            cashbackRate: data.cashbackRate || '',
            cashbackRateValue: typeof data.cashbackRateValue === 'number' ? data.cashbackRateValue : 0,
            cashbackType: data.cashbackType || 'percentage',
            description: data.description || '',
            categories: Array.isArray(data.categories) ? data.categories : [],
            terms: data.terms || '',
            isFeatured: typeof data.isFeatured === 'boolean' ? data.isFeatured : false,
            isActive: typeof data.isActive === 'boolean' ? data.isActive : true,
            createdAt: safeToDate(data.createdAt) || new Date(0),
            updatedAt: safeToDate(data.updatedAt) || new Date(0),
          } as Store;
      });


      if (loadMore) {
        setStores(prev => [...prev, ...storesData]);
      } else {
        setStores(storesData);
      }

      setLastVisible(querySnapshot.docs[querySnapshot.docs.length - 1] || null);
      setHasMore(querySnapshot.docs.length === STORES_PER_PAGE);

    } catch (err) {
      console.error("Error fetching stores:", err);
      const errorMsg = err instanceof Error ? err.message : "Failed to fetch stores";
      setError(errorMsg);
      toast({ variant: "destructive", title: "Fetch Error", description: errorMsg });
    } finally {
      setLoading(false);
      setLoadingMore(false);
      setIsSearching(false);
    }
  }, [searchTerm, lastVisible, toast]); // Add toast

  useEffect(() => {
    fetchStores(false, false); // Initial fetch on mount
  }, [fetchStores]); // fetchStores includes its dependencies

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    fetchStores(false, true); // Fetch with search term, reset pagination
  };

  const handleLoadMore = () => {
    if (!loadingMore && hasMore) {
      fetchStores(true, searchTerm !== ''); // Pass true for loadMore
    }
  };

  // --- Dialog and Form Handlers ---
  const openAddDialog = () => {
    setEditingStore(null);
    form.reset({ // Reset form to defaults for adding
        name: '', affiliateLink: '', cashbackRate: '', cashbackRateValue: 0,
        cashbackType: 'percentage', description: '', logoUrl: '',
        categories: [], terms: '', isFeatured: false, isActive: true,
    });
    setIsDialogOpen(true);
  };

  const openEditDialog = (store: Store) => {
    setEditingStore(store);
    form.reset({ // Reset form with the store's data for editing
      name: store.name,
      affiliateLink: store.affiliateLink,
      cashbackRate: store.cashbackRate,
      cashbackRateValue: store.cashbackRateValue,
      cashbackType: store.cashbackType,
      description: store.description,
      logoUrl: store.logoUrl || '',
      categories: store.categories || [],
      terms: store.terms || '',
      isFeatured: store.isFeatured,
      isActive: store.isActive,
    });
    setIsDialogOpen(true);
  };

  const onSubmit = async (data: StoreFormValues) => {
    setIsSaving(true);
    setError(null);

    try {
      if (editingStore) {
        // --- Update Existing Store ---
        const storeDocRef = doc(db, 'stores', editingStore.id);
        await updateDoc(storeDocRef, {
          ...data,
           logoUrl: data.logoUrl || null, // Ensure null if empty string
           terms: data.terms || null,
          updatedAt: serverTimestamp(),
        });
        // Update local state
        setStores(prev => prev.map(s => s.id === editingStore.id ? { ...s, ...data, updatedAt: new Date() } : s));
        toast({ title: "Store Updated", description: `${data.name} details saved.` });
      } else {
        // --- Add New Store ---
        const storesCollection = collection(db, 'stores');
        const newDocRef = await addDoc(storesCollection, {
          ...data,
           logoUrl: data.logoUrl || null, // Ensure null if empty string
           terms: data.terms || null,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
        // Add to local state (or refetch)
         const newStore: Store = { ...data, id: newDocRef.id, createdAt: new Date(), updatedAt: new Date() }; // Estimate dates
         setStores(prev => [newStore, ...prev]); // Add to beginning
        toast({ title: "Store Added", description: `${data.name} created successfully.` });
      }
      setIsDialogOpen(false); // Close dialog on success
      form.reset(); // Reset form after submission
    } catch (err) {
      console.error("Error saving store:", err);
      const errorMsg = err instanceof Error ? err.message : "Could not save store details.";
      setError(errorMsg);
      toast({ variant: "destructive", title: "Save Failed", description: errorMsg });
    } finally {
      setIsSaving(false);
    }
  };

   // --- Delete Store ---
   const handleDeleteStore = async () => {
     if (!deletingStoreId) return;
     console.log(`Attempting to delete store: ${deletingStoreId}`); // Debug log
     try {
       const storeDocRef = doc(db, 'stores', deletingStoreId);
       await deleteDoc(storeDocRef);
       setStores(prev => prev.filter(s => s.id !== deletingStoreId));
       toast({ title: "Store Deleted", description: "The store has been removed." });
     } catch (err) {
       console.error("Error deleting store:", err);
       const errorMsg = err instanceof Error ? err.message : "Could not delete the store.";
       toast({ variant: "destructive", title: "Deletion Failed", description: errorMsg });
     } finally {
       setDeletingStoreId(null); // Reset deleting state
     }
   };

    // --- Toggle Active Status ---
    const handleToggleActiveStatus = async (storeToUpdate: Store) => {
      if (!storeToUpdate) return;
      setUpdatingStoreId(storeToUpdate.id); // Indicate loading state for this specific store

      const storeDocRef = doc(db, 'stores', storeToUpdate.id);
      const newStatus = !storeToUpdate.isActive;

      try {
        await updateDoc(storeDocRef, {
          isActive: newStatus,
          updatedAt: serverTimestamp(),
        });

        // Update local state immediately
        setStores(prevStores =>
          prevStores.map(s =>
            s.id === storeToUpdate.id ? { ...s, isActive: newStatus, updatedAt: new Date() } : s // Estimate updatedAt
          )
        );

        toast({
          title: `Store ${newStatus ? 'Activated' : 'Deactivated'}`,
          description: `${storeToUpdate.name} status updated.`,
        });
      } catch (err) {
        console.error(`Error updating store ${storeToUpdate.id} status:`, err);
        const errorMsg = err instanceof Error ? err.message : "Could not update store status.";
        toast({
          variant: "destructive",
          title: "Update Failed",
          description: errorMsg,
        });
      } finally {
        setUpdatingStoreId(null); // Reset loading state for this user
      }
    };


  if (loading && stores.length === 0) {
    return <StoresTableSkeleton />;
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-3xl font-bold">Manage Stores</h1>
        <Button onClick={openAddDialog}>
          <PlusCircle className="mr-2 h-4 w-4" /> Add New Store
        </Button>
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Error</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {/* Filtering and Searching Controls */}
      <Card>
        <CardHeader>
          <CardTitle>Filter & Search Stores</CardTitle>
          <CardDescription>Search by store name.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col sm:flex-row gap-4">
          <form onSubmit={handleSearch} className="flex-1 flex gap-2">
            <Input
              type="search"
              placeholder="Search by Store Name..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              disabled={isSearching}
              className="h-10 text-base"
            />
            <Button type="submit" disabled={isSearching} className="h-10">
              {isSearching ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
               <span className="sr-only sm:not-sr-only sm:ml-2">Search</span>
            </Button>
          </form>
        </CardContent>
      </Card>

      {/* Stores Table */}
      <Card>
        <CardHeader>
          <CardTitle>Store List</CardTitle>
          <CardDescription>View and manage partner stores.</CardDescription>
        </CardHeader>
        <CardContent>
           {loading && stores.length === 0 ? (
             <StoresTableSkeleton />
           ) : stores.length === 0 ? (
             <p className="text-center text-muted-foreground py-8">No stores found matching your criteria.</p>
           ) : (
             <div className="overflow-x-auto">
               <Table>
                 <TableHeader>
                   <TableRow>
                     <TableHead>Logo</TableHead>
                     <TableHead>Name</TableHead>
                     <TableHead>Cashback Rate</TableHead>
                     <TableHead>Categories</TableHead>
                     <TableHead>Featured</TableHead>
                     <TableHead>Status</TableHead>
                     <TableHead>Actions</TableHead>
                   </TableRow>
                 </TableHeader>
                 <TableBody>
                   {stores.map((store) => (
                     <TableRow key={store.id} className={!store.isActive ? 'opacity-50 bg-muted/30' : ''}>
                       <TableCell>
                         {store.logoUrl ? (
                           <Image src={store.logoUrl} alt={`${store.name} logo`} width={60} height={30} className="object-contain rounded-sm" data-ai-hint={`${store.name} logo`}/>
                         ) : (
                           <div className="w-[60px] h-[30px] bg-muted flex items-center justify-center text-xs text-muted-foreground rounded-sm">No Logo</div>
                         )}
                       </TableCell>
                       <TableCell className="font-medium">{store.name}</TableCell>
                       <TableCell>{store.cashbackRate}</TableCell>
                       <TableCell className="max-w-[200px] truncate">
                         {store.categories.join(', ')}
                       </TableCell>
                        <TableCell>
                           {store.isFeatured ? <CheckCircle className="h-5 w-5 text-green-600" /> : <XCircle className="h-5 w-5 text-muted-foreground"/>}
                        </TableCell>
                       <TableCell>
                         <Switch
                            checked={store.isActive}
                            onCheckedChange={() => handleToggleActiveStatus(store)}
                            disabled={updatingStoreId === store.id}
                            aria-label={store.isActive ? 'Deactivate store' : 'Activate store'}
                         />
                          {updatingStoreId === store.id && <Loader2 className="h-4 w-4 animate-spin ml-2 inline-block" />}
                       </TableCell>
                       <TableCell>
                         <DropdownMenu>
                           <DropdownMenuTrigger asChild>
                             <Button variant="ghost" className="h-8 w-8 p-0">
                               <span className="sr-only">Open menu</span>
                               <MoreHorizontal className="h-4 w-4" />
                             </Button>
                           </DropdownMenuTrigger>
                           <DropdownMenuContent align="end">
                             <DropdownMenuLabel>Actions</DropdownMenuLabel>
                             <DropdownMenuItem onClick={() => openEditDialog(store)}>
                               <Edit className="mr-2 h-4 w-4" /> Edit Details
                             </DropdownMenuItem>
                              <DropdownMenuItem onClick={() => window.open(store.affiliateLink, '_blank')}>
                                <ExternalLink className="mr-2 h-4 w-4" /> Visit Link
                              </DropdownMenuItem>
                             <DropdownMenuSeparator />
                             <AlertDialog>
                               <AlertDialogTrigger asChild>
                                   {/* Custom styled button to match DropdownMenuItem */}
                                   <Button variant="ghost" className="w-full justify-start px-2 py-1.5 text-sm font-normal text-destructive hover:bg-destructive/10 focus:text-destructive focus:bg-destructive/10 h-auto relative flex cursor-default select-none items-center rounded-sm outline-none transition-colors data-[disabled]:pointer-events-none data-[disabled]:opacity-50">
                                      <Trash2 className="mr-2 h-4 w-4"/> Delete Store
                                   </Button>
                               </AlertDialogTrigger>
                               <AlertDialogContent>
                                 <AlertDialogHeader>
                                   <AlertDialogTitle>Are you sure?</AlertDialogTitle>
                                   <AlertDialogDescription>
                                     This action cannot be undone. This will permanently delete the store "{store.name}" and associated data.
                                   </AlertDialogDescription>
                                 </AlertDialogHeader>
                                 <AlertDialogFooter>
                                   <AlertDialogCancel onClick={() => setDeletingStoreId(null)}>Cancel</AlertDialogCancel>
                                   <AlertDialogAction
                                      onClick={() => {
                                           setDeletingStoreId(store.id); // Set the ID to delete
                                           handleDeleteStore(); // Call delete handler
                                      }}
                                      className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                                       Delete
                                    </AlertDialogAction>
                                 </AlertDialogFooter>
                               </AlertDialogContent>
                             </AlertDialog>
                           </DropdownMenuContent>
                         </DropdownMenu>
                       </TableCell>
                     </TableRow>
                   ))}
                 </TableBody>
               </Table>
             </div>
           )}
           {hasMore && (
            <div className="mt-6 text-center">
              <Button onClick={handleLoadMore} disabled={loadingMore}>
                {loadingMore ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                Load More Stores
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

       {/* Add/Edit Store Dialog */}
       <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
         <DialogContent className="sm:max-w-2xl max-h-[80vh] overflow-y-auto">
           <DialogHeader>
             <DialogTitle>{editingStore ? 'Edit Store' : 'Add New Store'}</DialogTitle>
             <DialogDescription>
               {editingStore ? `Update details for ${editingStore.name}.` : 'Enter the details for the new store.'}
             </DialogDescription>
           </DialogHeader>
           <form onSubmit={form.handleSubmit(onSubmit)} className="grid gap-4 py-4">
             {/* Store Name */}
             <div className="grid grid-cols-4 items-center gap-4">
               <Label htmlFor="name" className="text-right">Name</Label>
               <Input id="name" {...form.register('name')} className="col-span-3" disabled={isSaving} />
               {form.formState.errors.name && <p className="col-span-4 text-sm text-destructive">{form.formState.errors.name.message}</p>}
             </div>

              {/* Logo URL */}
             <div className="grid grid-cols-4 items-center gap-4">
               <Label htmlFor="logoUrl" className="text-right">Logo URL</Label>
               <Input id="logoUrl" {...form.register('logoUrl')} className="col-span-3" placeholder="https://..." disabled={isSaving} />
                {form.watch('logoUrl') && (
                    <div className="col-span-4 col-start-2">
                        <Image src={form.watch('logoUrl')!} alt="Logo Preview" width={80} height={40} className="object-contain border rounded-sm mt-1" />
                    </div>
                )}
               {form.formState.errors.logoUrl && <p className="col-span-4 text-sm text-destructive">{form.formState.errors.logoUrl.message}</p>}
             </div>

             {/* Affiliate Link */}
             <div className="grid grid-cols-4 items-center gap-4">
               <Label htmlFor="affiliateLink" className="text-right">Affiliate Link</Label>
               <Input id="affiliateLink" {...form.register('affiliateLink')} className="col-span-3" placeholder="https://..." disabled={isSaving} />
               {form.formState.errors.affiliateLink && <p className="col-span-4 text-sm text-destructive">{form.formState.errors.affiliateLink.message}</p>}
             </div>

             {/* Cashback Rate Display */}
             <div className="grid grid-cols-4 items-center gap-4">
               <Label htmlFor="cashbackRate" className="text-right">Rate Display</Label>
               <Input id="cashbackRate" {...form.register('cashbackRate')} className="col-span-3" placeholder="e.g., Up to 5% or Flat ₹100" disabled={isSaving} />
               {form.formState.errors.cashbackRate && <p className="col-span-4 text-sm text-destructive">{form.formState.errors.cashbackRate.message}</p>}
             </div>

              {/* Cashback Rate Value & Type */}
             <div className="grid grid-cols-4 items-center gap-4">
               <Label htmlFor="cashbackRateValue" className="text-right">Rate Value</Label>
               <div className="col-span-3 flex gap-2">
                  <Input
                    id="cashbackRateValue"
                    type="number"
                    step="0.01"
                    {...form.register('cashbackRateValue', { valueAsNumber: true })}
                    className="flex-1"
                    disabled={isSaving}
                  />
                 <Select
                   value={form.watch('cashbackType')}
                   onValueChange={(value) => form.setValue('cashbackType', value as CashbackType)}
                    disabled={isSaving}
                 >
                   <SelectTrigger className="w-[120px]">
                     <SelectValue placeholder="Type" />
                   </SelectTrigger>
                   <SelectContent>
                     <SelectItem value="percentage">%</SelectItem>
                     <SelectItem value="fixed">₹ (Fixed)</SelectItem>
                   </SelectContent>
                 </Select>
               </div>
                {form.formState.errors.cashbackRateValue && <p className="col-span-4 text-sm text-destructive">{form.formState.errors.cashbackRateValue.message}</p>}
                {form.formState.errors.cashbackType && <p className="col-span-4 text-sm text-destructive">{form.formState.errors.cashbackType.message}</p>}
             </div>


             {/* Description */}
             <div className="grid grid-cols-4 items-center gap-4">
               <Label htmlFor="description" className="text-right">Description</Label>
               <Textarea id="description" {...form.register('description')} className="col-span-3" rows={3} disabled={isSaving} />
               {form.formState.errors.description && <p className="col-span-4 text-sm text-destructive">{form.formState.errors.description.message}</p>}
             </div>

             {/* Categories */}
             <div className="grid grid-cols-4 items-center gap-4">
                <Label htmlFor="categories" className="text-right">Categories</Label>
                <Input
                    id="categories"
                    {...form.register('categories')}
                    className="col-span-3"
                    placeholder="Comma-separated (e.g., Fashion, Electronics)"
                    disabled={isSaving}
                    // Custom parsing logic to handle comma-separated input
                    onChange={(e) => {
                       const categoriesArray = e.target.value.split(',').map(cat => cat.trim()).filter(Boolean);
                       form.setValue('categories', categoriesArray);
                    }}
                    // Display the array back as a comma-separated string
                    value={Array.isArray(form.watch('categories')) ? form.watch('categories').join(', ') : ''}
                />
                {form.formState.errors.categories && <p className="col-span-4 text-sm text-destructive">{form.formState.errors.categories.message}</p>}
             </div>


             {/* Terms */}
             <div className="grid grid-cols-4 items-center gap-4">
               <Label htmlFor="terms" className="text-right">Terms</Label>
               <Textarea id="terms" {...form.register('terms')} className="col-span-3" rows={2} placeholder="Optional terms and conditions" disabled={isSaving} />
             </div>

              {/* Flags: Featured & Active */}
              <div className="grid grid-cols-4 items-start gap-4">
                 <Label className="text-right pt-2">Flags</Label>
                 <div className="col-span-3 space-y-3">
                     <div className="flex items-center space-x-2">
                         <Checkbox
                           id="isFeatured"
                           checked={form.watch('isFeatured')}
                           onCheckedChange={(checked) => form.setValue('isFeatured', !!checked)}
                           disabled={isSaving}
                         />
                         <Label htmlFor="isFeatured" className="font-normal">Featured Store (highlight on homepage)</Label>
                     </div>
                     <div className="flex items-center space-x-2">
                        <Checkbox
                          id="isActive"
                          checked={form.watch('isActive')}
                          onCheckedChange={(checked) => form.setValue('isActive', !!checked)}
                          disabled={isSaving}
                        />
                         <Label htmlFor="isActive" className="font-normal">Active (visible to users)</Label>
                     </div>
                 </div>
              </div>


             <DialogFooter>
               <DialogClose asChild>
                 <Button type="button" variant="outline" disabled={isSaving}>
                   Cancel
                 </Button>
               </DialogClose>
               <Button type="submit" disabled={isSaving}>
                 {isSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                 {editingStore ? 'Save Changes' : 'Add Store'}
               </Button>
             </DialogFooter>
           </form>
         </DialogContent>
       </Dialog>

    </div>
  );
}

// Skeleton Loader for the Table
function StoresTableSkeleton() {
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
        </div>
      </CardContent>
    </Card>
  );
}

export default function AdminStoresPage() {
    return (
      <AdminGuard>
        <AdminStoresPageContent />
      </AdminGuard>
    );
}
