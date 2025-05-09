"use client";

import * as React from 'react';
import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
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
  deleteDoc,
  serverTimestamp,
  where,
  QueryConstraint,
  DocumentData,
  QueryDocumentSnapshot,
  addDoc 
} from 'firebase/firestore';
import { db } from '@/lib/firebase/config';
import type { Store, CashbackType, Category, StoreFormValues as StoreFormType } from '@/lib/types'; 
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
import AdminGuard from '@/components/guards/admin-guard'; 
import Image from 'next/image'; 
import { Switch } from '@/components/ui/switch'; 
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { MoreHorizontal } from "lucide-react";
import { safeToDate } from '@/lib/utils'; 
import { MultiSelect } from '@/components/ui/multi-select';


const STORES_PER_PAGE = 15;

// Zod schema for store form validation
const storeSchema = z.object({
  name: z.string().min(2, 'Store name must be at least 2 characters').max(100, 'Store name too long'),
  logoUrl: z.string().url('Invalid URL format').optional().or(z.literal('')), 
  heroImageUrl: z.string().url('Invalid URL format').optional().or(z.literal('')),
  affiliateLink: z.string().url('Invalid URL format'),
  cashbackRate: z.string().min(1, 'Cashback rate display is required').max(50, 'Rate display too long'),
  cashbackRateValue: z.number().min(0, 'Cashback value must be non-negative'),
  cashbackType: z.enum(['percentage', 'fixed']),
  description: z.string().min(10, 'Description must be at least 10 characters').max(500, 'Description too long'),
  detailedDescription: z.string().max(2000, "Detailed description too long").optional().nullable(),
  categories: z.array(z.string()).min(1, 'At least one category is required'),
  rating: z.number().min(0).max(5).optional().nullable(),
  ratingCount: z.number().min(0).optional().nullable(),
  cashbackTrackingTime: z.string().max(50, "Tracking time too long").optional().nullable(),
  cashbackConfirmationTime: z.string().max(50, "Confirmation time too long").optional().nullable(),
  cashbackOnAppOrders: z.boolean().optional().nullable(),
  detailedCashbackRatesLink: z.string().url("Invalid URL").optional().nullable(),
  topOffersText: z.string().max(500, "Top offers text too long").optional().nullable(),
  offerDetailsLink: z.string().url("Invalid URL").optional().nullable(),
  terms: z.string().optional().nullable(),
  isFeatured: z.boolean().default(false),
  isActive: z.boolean().default(true),
  dataAiHint: z.string().max(50, 'AI Hint too long').optional().nullable(),
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
  const [categoriesList, setCategoriesList] = useState<{ value: string; label: string }[]>([]);
  const [loadingCategories, setLoadingCategories] = useState(true);


  // React Hook Form setup
  const form = useForm<StoreFormValues>({
    resolver: zodResolver(storeSchema),
    defaultValues: {
      name: '',
      logoUrl: '',
      heroImageUrl: '',
      affiliateLink: '',
      cashbackRate: '',
      cashbackRateValue: 0,
      cashbackType: 'percentage',
      description: '',
      detailedDescription: '',
      categories: [],
      rating: null,
      ratingCount: null,
      cashbackTrackingTime: null,
      cashbackConfirmationTime: null,
      cashbackOnAppOrders: null,
      detailedCashbackRatesLink: null,
      topOffersText: null,
      offerDetailsLink: null,
      terms: '',
      isFeatured: false,
      isActive: true,
      dataAiHint: '',
    },
  });

   // Fetch categories for the multi-select dropdown
   useEffect(() => {
    const fetchCategories = async () => {
      setLoadingCategories(true);
      try {
        const categoriesCollection = collection(db, 'categories');
        const q = query(categoriesCollection, orderBy('name', 'asc'));
        const querySnapshot = await getDocs(q);
        const fetchedCategories = querySnapshot.docs.map(doc => ({
           value: doc.id, // Use slug/ID as value
           label: doc.data().name || doc.id, // Use name as label
        }));
        setCategoriesList(fetchedCategories);
      } catch (err) {
        console.error("Error fetching categories:", err);
        toast({ variant: "destructive", title: "Error", description: "Could not load categories." });
      } finally {
        setLoadingCategories(false);
      }
    };
    fetchCategories();
  }, [toast]);


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

      if (search && searchTerm) {
        constraints.push(where('name', '>=', searchTerm));
        constraints.push(where('name', '<=', searchTerm + '\uf8ff'));
      }

       constraints.push(orderBy('name')); 
       if (!search) {
         constraints.push(orderBy('createdAt', 'desc')); 
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
            heroImageUrl: data.heroImageUrl || null,
            affiliateLink: data.affiliateLink || '',
            cashbackRate: data.cashbackRate || '',
            cashbackRateValue: typeof data.cashbackRateValue === 'number' ? data.cashbackRateValue : 0,
            cashbackType: data.cashbackType || 'percentage',
            description: data.description || '',
            detailedDescription: data.detailedDescription || null,
            categories: Array.isArray(data.categories) ? data.categories : [],
            rating: data.rating || null,
            ratingCount: data.ratingCount || null,
            cashbackTrackingTime: data.cashbackTrackingTime || null,
            cashbackConfirmationTime: data.cashbackConfirmationTime || null,
            cashbackOnAppOrders: data.cashbackOnAppOrders === undefined ? null : data.cashbackOnAppOrders,
            detailedCashbackRatesLink: data.detailedCashbackRatesLink || null,
            topOffersText: data.topOffersText || null,
            offerDetailsLink: data.offerDetailsLink || null,
            terms: data.terms || '',
            isFeatured: typeof data.isFeatured === 'boolean' ? data.isFeatured : false,
            isActive: typeof data.isActive === 'boolean' ? data.isActive : true,
            dataAiHint: data.dataAiHint || null,
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
  }, [searchTerm, lastVisible, toast]); 

  useEffect(() => {
    fetchStores(false, false); 
  }, [fetchStores]); 

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    fetchStores(false, true); 
  };

  const handleLoadMore = () => {
    if (!loadingMore && hasMore) {
      fetchStores(true, searchTerm !== ''); 
    }
  };

  // --- Dialog and Form Handlers ---
  const openAddDialog = () => {
    setEditingStore(null);
    form.reset({ 
        name: '', logoUrl: '', heroImageUrl: '', affiliateLink: '', cashbackRate: '', cashbackRateValue: 0,
        cashbackType: 'percentage', description: '', detailedDescription: '',
        categories: [], rating: null, ratingCount: null, cashbackTrackingTime: null,
        cashbackConfirmationTime: null, cashbackOnAppOrders: null, detailedCashbackRatesLink: null,
        topOffersText: null, offerDetailsLink: null, terms: '', isFeatured: false, isActive: true, dataAiHint: '',
    });
    setIsDialogOpen(true);
  };

  const openEditDialog = (store: Store) => {
    setEditingStore(store);
    form.reset({ 
      name: store.name,
      logoUrl: store.logoUrl || '',
      heroImageUrl: store.heroImageUrl || '',
      affiliateLink: store.affiliateLink,
      cashbackRate: store.cashbackRate,
      cashbackRateValue: store.cashbackRateValue,
      cashbackType: store.cashbackType,
      description: store.description,
      detailedDescription: store.detailedDescription || '',
      categories: store.categories || [],
      rating: store.rating || null,
      ratingCount: store.ratingCount || null,
      cashbackTrackingTime: store.cashbackTrackingTime || null,
      cashbackConfirmationTime: store.cashbackConfirmationTime || null,
      cashbackOnAppOrders: store.cashbackOnAppOrders === undefined ? null : store.cashbackOnAppOrders,
      detailedCashbackRatesLink: store.detailedCashbackRatesLink || null,
      topOffersText: store.topOffersText || null,
      offerDetailsLink: store.offerDetailsLink || null,
      terms: store.terms || '',
      isFeatured: store.isFeatured,
      isActive: store.isActive,
      dataAiHint: store.dataAiHint || '',
    });
    setIsDialogOpen(true);
  };

  const onSubmit = async (data: StoreFormValues) => {
    setIsSaving(true);
    setError(null);

    const submissionData: Partial<StoreFormType> = Object.fromEntries(
      Object.entries(data).map(([key, value]) => [key, value === '' ? null : value])
    );

    try {
      if (editingStore) {
        const storeDocRef = doc(db, 'stores', editingStore.id);
        await updateDoc(storeDocRef, {
          ...submissionData,
          updatedAt: serverTimestamp(),
        });
        setStores(prev => prev.map(s => s.id === editingStore.id ? { ...s, ...submissionData, updatedAt: new Date() } as Store : s));
        toast({ title: "Store Updated", description: `${data.name} details saved.` });
      } else {
        const storesCollection = collection(db, 'stores');
        const newDocRef = await addDoc(storesCollection, {
          ...submissionData,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
         const newStore: Store = { ...submissionData, id: newDocRef.id, createdAt: new Date(), updatedAt: new Date() } as Store; 
         setStores(prev => [newStore, ...prev]); 
        toast({ title: "Store Added", description: `${data.name} created successfully.` });
      }
      setIsDialogOpen(false); 
      form.reset(); 
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
     console.log(`Attempting to delete store: ${deletingStoreId}`); 
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
       setDeletingStoreId(null); 
     }
   };

    // --- Toggle Active Status ---
    const handleToggleActiveStatus = async (storeToUpdate: Store) => {
      if (!storeToUpdate) return;
      setUpdatingStoreId(storeToUpdate.id); 

      const storeDocRef = doc(db, 'stores', storeToUpdate.id);
      const newStatus = !storeToUpdate.isActive;

      try {
        await updateDoc(storeDocRef, {
          isActive: newStatus,
          updatedAt: serverTimestamp(),
        });

        setStores(prevStores =>
          prevStores.map(s =>
            s.id === storeToUpdate.id ? { ...s, isActive: newStatus, updatedAt: new Date() } : s 
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
        setUpdatingStoreId(null); 
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

      <Card>
        <CardHeader>
          <CardTitle>Filter &amp; Search Stores</CardTitle>
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
                                           setDeletingStoreId(store.id); 
                                           handleDeleteStore(); 
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
         <DialogContent className="sm:max-w-3xl max-h-[90vh] overflow-y-auto">
           <DialogHeader>
             <DialogTitle>{editingStore ? 'Edit Store' : 'Add New Store'}</DialogTitle>
             <DialogDescription>
               {editingStore ? `Update details for ${editingStore.name}.` : 'Enter the details for the new store.'}
             </DialogDescription>
           </DialogHeader>
           <form onSubmit={form.handleSubmit(onSubmit)} className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-4 py-4">
             
             {/* Column 1 */}
             <div className="space-y-4">
                <div className="space-y-1">
                  <Label htmlFor="name">Name*</Label>
                  <Input id="name" {...form.register('name')} disabled={isSaving} />
                  {form.formState.errors.name && <p className="text-sm text-destructive">{form.formState.errors.name.message}</p>}
                </div>

                <div className="space-y-1">
                  <Label htmlFor="logoUrl">Logo URL</Label>
                  <Input id="logoUrl" {...form.register('logoUrl')} placeholder="https://..." disabled={isSaving} />
                  {form.watch('logoUrl') && (
                      <div className="mt-1">
                          <Image src={form.watch('logoUrl')!} alt="Logo Preview" width={80} height={40} className="object-contain border rounded-sm" />
                      </div>
                  )}
                  {form.formState.errors.logoUrl && <p className="text-sm text-destructive">{form.formState.errors.logoUrl.message}</p>}
                </div>

                <div className="space-y-1">
                  <Label htmlFor="heroImageUrl">Hero Image URL (for store page)</Label>
                  <Input id="heroImageUrl" {...form.register('heroImageUrl')} placeholder="https://..." disabled={isSaving} />
                  {form.watch('heroImageUrl') && (
                      <div className="mt-1">
                          <Image src={form.watch('heroImageUrl')!} alt="Hero Preview" width={160} height={80} className="object-cover border rounded-sm aspect-[2/1]" />
                      </div>
                  )}
                  {form.formState.errors.heroImageUrl && <p className="text-sm text-destructive">{form.formState.errors.heroImageUrl.message}</p>}
                </div>

                <div className="space-y-1">
                  <Label htmlFor="affiliateLink">Affiliate Link*</Label>
                  <Input id="affiliateLink" {...form.register('affiliateLink')} placeholder="https://..." disabled={isSaving} />
                  {form.formState.errors.affiliateLink && <p className="text-sm text-destructive">{form.formState.errors.affiliateLink.message}</p>}
                </div>

                <div className="space-y-1">
                  <Label htmlFor="cashbackRate">Rate Display*</Label>
                  <Input id="cashbackRate" {...form.register('cashbackRate')} placeholder="e.g., Up to 5% or Flat ₹100" disabled={isSaving} />
                  {form.formState.errors.cashbackRate && <p className="text-sm text-destructive">{form.formState.errors.cashbackRate.message}</p>}
                </div>

                <div className="grid grid-cols-3 gap-2">
                    <div className="space-y-1 col-span-2">
                      <Label htmlFor="cashbackRateValue">Rate Value*</Label>
                      <Input id="cashbackRateValue" type="number" step="0.01" {...form.register('cashbackRateValue', { valueAsNumber: true })} disabled={isSaving}/>
                      {form.formState.errors.cashbackRateValue && <p className="text-sm text-destructive">{form.formState.errors.cashbackRateValue.message}</p>}
                    </div>
                    <div className="space-y-1">
                        <Label htmlFor="cashbackType">Type*</Label>
                        <Select value={form.watch('cashbackType')} onValueChange={(value) => form.setValue('cashbackType', value as CashbackType)} disabled={isSaving}>
                          <SelectTrigger id="cashbackType"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="percentage">%</SelectItem>
                            <SelectItem value="fixed">₹</SelectItem>
                          </SelectContent>
                        </Select>
                    </div>
                </div>
                 {form.formState.errors.cashbackType && <p className="text-sm text-destructive">{form.formState.errors.cashbackType.message}</p>}
                
                <div className="space-y-1">
                  <Label htmlFor="description">Short Description*</Label>
                  <Textarea id="description" {...form.register('description')} rows={3} disabled={isSaving} />
                  {form.formState.errors.description && <p className="text-sm text-destructive">{form.formState.errors.description.message}</p>}
                </div>

                <div className="space-y-1">
                  <Label htmlFor="detailedDescription">Detailed Description (for store page)</Label>
                  <Textarea id="detailedDescription" {...form.register('detailedDescription')} rows={5} disabled={isSaving} />
                </div>
             </div>

            {/* Column 2 */}
             <div className="space-y-4">
                <div className="space-y-1">
                  <Label htmlFor="categories">Categories*</Label>
                  <Controller
                      control={form.control}
                      name="categories"
                      render={({ field }) => (
                          <MultiSelect
                          options={categoriesList}
                          selected={field.value}
                          onChange={field.onChange}
                          isLoading={loadingCategories}
                          disabled={isSaving}
                          placeholder="Select categories..."
                          />
                      )}
                  />
                  {form.formState.errors.categories && <p className="text-sm text-destructive">{form.formState.errors.categories.message}</p>}
                </div>

                <div className="grid grid-cols-2 gap-2">
                    <div className="space-y-1">
                        <Label htmlFor="rating">Rating (0-5)</Label>
                        <Input id="rating" type="number" step="0.1" {...form.register('rating', { valueAsNumber: true, setValueAs: v => v === null || v === '' ? null : parseFloat(v) })} disabled={isSaving} />
                    </div>
                    <div className="space-y-1">
                        <Label htmlFor="ratingCount">Rating Count</Label>
                        <Input id="ratingCount" type="number" {...form.register('ratingCount', { valueAsNumber: true, setValueAs: v => v === null || v === '' ? null : parseInt(v) })} disabled={isSaving} />
                    </div>
                </div>

                <div className="space-y-1">
                    <Label htmlFor="cashbackTrackingTime">Cashback Tracking Time</Label>
                    <Input id="cashbackTrackingTime" {...form.register('cashbackTrackingTime')} placeholder="e.g., 36 Hours" disabled={isSaving} />
                </div>
                <div className="space-y-1">
                    <Label htmlFor="cashbackConfirmationTime">Cashback Confirmation Time</Label>
                    <Input id="cashbackConfirmationTime" {...form.register('cashbackConfirmationTime')} placeholder="e.g., 35 Days" disabled={isSaving} />
                </div>
                <div className="flex items-center space-x-2 pt-2">
                    <Controller
                        control={form.control}
                        name="cashbackOnAppOrders"
                        render={({ field }) => (
                            <Checkbox id="cashbackOnAppOrders" checked={field.value ?? false} onCheckedChange={field.onChange} disabled={isSaving} />
                        )}
                    />
                    <Label htmlFor="cashbackOnAppOrders" className="font-normal">Cashback on App Orders?</Label>
                </div>

                <div className="space-y-1">
                  <Label htmlFor="detailedCashbackRatesLink">Detailed Cashback Rates Link</Label>
                  <Input id="detailedCashbackRatesLink" type="url" {...form.register('detailedCashbackRatesLink')} placeholder="https://..." disabled={isSaving} />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="topOffersText">Top Offers Text (for store page)</Label>
                  <Textarea id="topOffersText" {...form.register('topOffersText')} rows={3} disabled={isSaving} />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="offerDetailsLink">"See Offer Details" Link</Label>
                  <Input id="offerDetailsLink" type="url" {...form.register('offerDetailsLink')} placeholder="https://..." disabled={isSaving} />
                </div>
                
                <div className="space-y-1">
                  <Label htmlFor="terms">Terms &amp; Conditions</Label>
                  <Textarea id="terms" {...form.register('terms')} rows={3} placeholder="Optional terms and conditions" disabled={isSaving} />
                </div>

                 <div className="space-y-1">
                    <Label htmlFor="dataAiHint">Logo AI Hint</Label>
                    <Input id="dataAiHint" {...form.register('dataAiHint')} placeholder="Keywords for logo (e.g., company name logo)" disabled={isSaving} />
                 </div>

                <div className="flex items-center space-x-2 pt-2">
                    <Controller
                        control={form.control}
                        name="isFeatured"
                        render={({ field }) => (
                            <Checkbox id="isFeatured" checked={field.value} onCheckedChange={field.onChange} disabled={isSaving} />
                        )}
                    />
                    <Label htmlFor="isFeatured" className="font-normal">Featured Store</Label>
                </div>
                <div className="flex items-center space-x-2">
                    <Controller
                        control={form.control}
                        name="isActive"
                        render={({ field }) => (
                           <Checkbox id="isActive" checked={field.value} onCheckedChange={field.onChange} disabled={isSaving} />
                        )}
                    />
                    <Label htmlFor="isActive" className="font-normal">Active (visible to users)</Label>
                </div>
            </div>

             <DialogFooter className="md:col-span-2">
               <DialogClose asChild>
                 <Button type="button" variant="outline" disabled={isSaving}>
                   Cancel
                 </Button>
               </DialogClose>
               <Button type="submit" disabled={isSaving || loadingCategories}>
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