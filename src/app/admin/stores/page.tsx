
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
import { db, firebaseInitializationError } from '@/lib/firebase/config';
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
import { AlertCircle, Loader2, Search, Edit, Trash2, PlusCircle, CheckCircle, XCircle, ExternalLink, Star } from 'lucide-react';
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
import { useDebounce } from '@/hooks/use-debounce';
import { Timestamp } from "firebase/firestore";


const STORES_PER_PAGE = 15;

// Zod schema for store form validation
const storeSchema = z.object({
  name: z.string().min(2, 'Store name must be at least 2 characters').max(100, 'Store name too long'),
  slug: z.string().min(2, 'Slug must be at least 2 characters').max(50, 'Slug too long').regex(/^[a-z0-9-]+$/, 'Slug can only contain lowercase letters, numbers, and hyphens').optional().nullable(),
  logoUrl: z.string().url('Invalid URL format').optional().or(z.literal('')).nullable(),
  heroImageUrl: z.string().url('Invalid URL format').optional().or(z.literal('')).nullable(),
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
  isTodaysDeal: z.boolean().default(false), // Added for "Today's Deal"
  dataAiHint: z.string().max(50, 'AI Hint too long').optional().nullable(),
});


type StoreFormValues = z.infer<typeof storeSchema>;

function AdminStoresPageContent() {
  const [stores, setStores] = React.useState<Store[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [lastVisible, setLastVisible] = React.useState<QueryDocumentSnapshot<DocumentData> | null>(null);
  const [hasMore, setHasMore] = React.useState(true);
  const [loadingMore, setLoadingMore] = React.useState(false);
  const { toast } = useToast();
  const router = useRouter();

  const [searchTermInput, setSearchTermInput] = React.useState('');
  const debouncedSearchTerm = useDebounce(searchTermInput, 500);
  const [isSearching, setIsSearching] = React.useState(false);

  const [isDialogOpen, setIsDialogOpen] = React.useState(false);
  const [editingStore, setEditingStore] = React.useState<Store | null>(null);
  const [isSaving, setIsSaving] = React.useState(false);
  const [deletingStoreId, setDeletingStoreId] = React.useState<string | null>(null);
  const [updatingStoreId, setUpdatingStoreId] = React.useState<string | null>(null);
  const [categoriesList, setCategoriesList] = React.useState<{ value: string; label: string }[]>([]);
  const [loadingCategories, setLoadingCategories] = React.useState(true);
  const form = useForm<StoreFormValues>({
    resolver: zodResolver(storeSchema),
    defaultValues: {
      name: '',
      slug: '',
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
      cashbackOnAppOrders: false,
      detailedCashbackRatesLink: null,
      topOffersText: null,
      offerDetailsLink: null,
      terms: '',
      isFeatured: false,
      isActive: true,
      isTodaysDeal: false,
      dataAiHint: '',
    },
  });

   React.useEffect(() => {
    let isMounted = true;
    const fetchCategories = async () => {
      if (!isMounted) return;
      if (!db || firebaseInitializationError) {
        if (isMounted) {
          setError(firebaseInitializationError || "Database not available for fetching categories.");
          setLoadingCategories(false);
        }
        return;
      }
      setLoadingCategories(true);
      try {
        const categoriesCollection = collection(db, 'categories');
        const q = query(categoriesCollection, orderBy('name', 'asc'));
        const querySnapshot = await getDocs(q);
        const fetchedCategories = querySnapshot.docs.map(doc => ({
           value: doc.id,
           label: doc.data().name || doc.id,
        }));
        if (isMounted) {
            setCategoriesList(fetchedCategories);
        }
      } catch (err) {
        console.error("Error fetching categories:", err);
        if (isMounted) {
            toast({ variant: "destructive", title: "Error", description: "Could not load categories." });
        }
      } finally {
        if (isMounted) {
            setLoadingCategories(false);
        }
      }
    };
    fetchCategories();
    return () => { isMounted = false; };
  }, [toast]);


  const fetchStores = React.useCallback(async (
    isLoadMoreOperation: boolean,
    currentSearchTerm: string,
    docToStartAfter: QueryDocumentSnapshot<DocumentData> | null
  ) => {
    let isMounted = true;
    if (!isMounted) return;

    if (!db || firebaseInitializationError) {
        if (isMounted) {
            setError(firebaseInitializationError || "Database connection not available.");
            if (!isLoadMoreOperation) setLoading(false); else setLoadingMore(false);
            setHasMore(false);
        }
      return;
    }

    if (!isLoadMoreOperation) {
      setLoading(true);
      setStores([]);
      setLastVisible(null);
      setHasMore(true);
    } else {
      setLoadingMore(true);
    }
    setError(null);
    setIsSearching(currentSearchTerm !== '');

    try {
      const storesCollection = collection(db, 'stores');
      let constraints: QueryConstraint[] = [];

      if (currentSearchTerm) {
        constraints.push(orderBy('name')); // Order by name first for text search
        constraints.push(where('name', '>=', currentSearchTerm));
        constraints.push(where('name', '<=', currentSearchTerm + '\uf8ff'));
      } else {
        constraints.push(orderBy('isFeatured', 'desc'));
        constraints.push(orderBy('createdAt', 'desc'));
      }

      if (isLoadMoreOperation && docToStartAfter) {
        constraints.push(startAfter(docToStartAfter));
      }
      constraints.push(limit(STORES_PER_PAGE));

      const q = query(storesCollection, ...constraints);
      const querySnapshot = await getDocs(q);

      const storesData = querySnapshot.docs.map(docSnap => {
          const data = docSnap.data();
          return {
            id: docSnap.id,
            name: data.name || '',
            slug: data.slug || null,
            logoUrl: data.logoUrl || null,
            heroImageUrl: data.heroImageUrl || null,
            affiliateLink: data.affiliateLink || '',
            cashbackRate: data.cashbackRate || '',
            cashbackRateValue: typeof data.cashbackRateValue === 'number' ? data.cashbackRateValue : 0,
            cashbackType: data.cashbackType || 'percentage',
            description: data.description || '',
            detailedDescription: data.detailedDescription || null,
            categories: Array.isArray(data.categories) ? data.categories : [],
            rating: data.rating === undefined ? null : data.rating,
            ratingCount: data.ratingCount === undefined ? null : data.ratingCount,
            cashbackTrackingTime: data.cashbackTrackingTime === undefined ? null : data.cashbackTrackingTime,
            cashbackConfirmationTime: data.cashbackConfirmationTime === undefined ? null : data.cashbackConfirmationTime,
            cashbackOnAppOrders: data.cashbackOnAppOrders === undefined ? null : data.cashbackOnAppOrders,
            detailedCashbackRatesLink: data.detailedCashbackRatesLink === undefined ? null : data.detailedCashbackRatesLink,
            topOffersText: data.topOffersText === undefined ? null : data.topOffersText,
            offerDetailsLink: data.offerDetailsLink === undefined ? null : data.offerDetailsLink,
            terms: data.terms || null,
            isFeatured: typeof data.isFeatured === 'boolean' ? data.isFeatured : false,
            isActive: typeof data.isActive === 'boolean' ? data.isActive : true,
            isTodaysDeal: typeof data.isTodaysDeal === 'boolean' ? data.isTodaysDeal : false,
            dataAiHint: data.dataAiHint || null,
            createdAt: data.createdAt,
            updatedAt: data.updatedAt,
          } as Store;
      });

      if (isMounted) {
        if (isLoadMoreOperation) {
            setStores(prev => [...prev, ...storesData]);
        } else {
            setStores(storesData);
        }
        const newLastVisible = querySnapshot.docs[querySnapshot.docs.length - 1] || null;
        setLastVisible(newLastVisible);
        setHasMore(querySnapshot.docs.length === STORES_PER_PAGE);
      }

    } catch (err) {
      console.error("Error fetching stores:", err);
      const errorMsg = err instanceof Error ? err.message : "Failed to fetch stores";
       if (isMounted) {
            setError(errorMsg);
            toast({ variant: "destructive", title: "Fetch Error", description: errorMsg });
            setHasMore(false);
       }
    } finally {
       if (isMounted) {
            if (!isLoadMoreOperation) setLoading(false); else setLoadingMore(false);
            setIsSearching(false);
       }
    }
  }, [toast]);

  useEffect(() => {
    fetchStores(false, debouncedSearchTerm, null);
  }, [debouncedSearchTerm, fetchStores]);


  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    // fetchStores is called by useEffect due to debouncedSearchTerm change
  };

  const handleLoadMore = () => {
    if (!loadingMore && hasMore) {
      fetchStores(true, debouncedSearchTerm, lastVisible);
    }
  };

  const openAddDialog = () => {
    router.push('/admin/stores/new');
  };

  const openEditDialog = (store: Store) => {
    setEditingStore(store);
    form.reset({
      name: store.name,
      slug: store.slug || '',
      logoUrl: store.logoUrl || '',
      heroImageUrl: store.heroImageUrl || '',
      affiliateLink: store.affiliateLink,
      cashbackRate: store.cashbackRate,
      cashbackRateValue: store.cashbackRateValue,
      cashbackType: store.cashbackType,
      description: store.description,
      detailedDescription: store.detailedDescription || '',
      categories: store.categories || [],
      rating: store.rating ?? null,
      ratingCount: store.ratingCount ?? null,
      cashbackTrackingTime: store.cashbackTrackingTime ?? null,
      cashbackConfirmationTime: store.cashbackConfirmationTime ?? null,
      cashbackOnAppOrders: store.cashbackOnAppOrders ?? false,
      detailedCashbackRatesLink: store.detailedCashbackRatesLink ?? null,
      topOffersText: store.topOffersText ?? null,
      offerDetailsLink: store.offerDetailsLink ?? null,
      terms: store.terms || '',
      isFeatured: store.isFeatured,
      isActive: store.isActive,
      isTodaysDeal: store.isTodaysDeal || false,
      dataAiHint: store.dataAiHint || '',
    });
    setIsDialogOpen(true);
  };

  const onSubmit = async (data: StoreFormValues) => {
    let isMounted = true;
    if (!db || firebaseInitializationError) {
        if(isMounted) setError(firebaseInitializationError || "Database not available. Please try again later.");
        setIsSaving(false);
        return () => {isMounted = false;};
    }
    setIsSaving(true);
    setError(null);

    const submissionData: Partial<StoreFormType> = Object.fromEntries(
      Object.entries(data).map(([key, value]) => {
        if (['logoUrl', 'heroImageUrl', 'detailedDescription', 'rating', 'ratingCount', 'cashbackTrackingTime', 'cashbackConfirmationTime', 'cashbackOnAppOrders', 'detailedCashbackRatesLink', 'topOffersText', 'offerDetailsLink', 'terms', 'dataAiHint', 'slug'].includes(key)) {
          return [key, value === '' || value === undefined ? null : value];
        }
        return [key, value];
      })
    );
    submissionData.slug = data.slug || data.name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
    submissionData.isFeatured = !!data.isFeatured;
    submissionData.isActive = !!data.isActive;
    submissionData.isTodaysDeal = !!data.isTodaysDeal;
    submissionData.cashbackOnAppOrders = data.cashbackOnAppOrders === null ? null : !!data.cashbackOnAppOrders;


    try {
      if (editingStore) {
        const storeDocRef = doc(db, 'stores', editingStore.id);
        await updateDoc(storeDocRef, {
          ...submissionData,
          updatedAt: serverTimestamp(),
        });
        if (isMounted) {
            setStores(prev => prev.map(s => s.id === editingStore.id ? { ...s, ...submissionData, updatedAt: Timestamp.now() } as Store : s));
            toast({ title: "Store Updated", description: `${data.name} details saved.` });
        }
      } else {
        // New store creation is handled by /admin/stores/new
      }
      if (isMounted) {
        setIsDialogOpen(false);
        form.reset();
      }
    } catch (err) {
      console.error("Error saving store:", err);
      const errorMsg = err instanceof Error ? err.message : "Could not save store details.";
      if (isMounted) {
        setError(errorMsg);
        toast({ variant: "destructive", title: "Save Failed", description: errorMsg });
      }
    } finally {
      if (isMounted) setIsSaving(false);
    }
     return () => { isMounted = false; };
  };

   const handleDeleteStore = async () => {
     if (!deletingStoreId || !db) return;
     let isMounted = true;
     try {
       const storeDocRef = doc(db, 'stores', deletingStoreId);
       await deleteDoc(storeDocRef);
       if(isMounted) {
        setStores(prev => prev.filter(s => s.id !== deletingStoreId));
        toast({ title: "Store Deleted", description: "The store has been removed." });
       }
     } catch (err) {
       console.error("Error deleting store:", err);
       const errorMsg = err instanceof Error ? err.message : "Could not delete the store.";
       if (isMounted) toast({ variant: "destructive", title: "Deletion Failed", description: errorMsg });
     } finally {
       if (isMounted) setDeletingStoreId(null);
     }
      return () => { isMounted = false; };
   };

    const handleToggleField = async (storeToUpdate: Store, field: 'isActive' | 'isFeatured' | 'isTodaysDeal') => {
      if (!storeToUpdate || !db) return;
      let isMounted = true;
      setUpdatingStoreId(storeToUpdate.id);

      const storeDocRef = doc(db, 'stores', storeToUpdate.id);
      const newValue = !storeToUpdate[field];

      try {
        await updateDoc(storeDocRef, {
          [field]: newValue,
          updatedAt: serverTimestamp(),
        });
        if (isMounted) {
            setStores(prevStores =>
            prevStores.map(s =>
                s.id === storeToUpdate.id ? { ...s, [field]: newValue, updatedAt: Timestamp.now() } : s
            )
            );
            toast({
            title: `Store ${field} Updated`,
            description: `${storeToUpdate.name} ${field} status set to ${newValue}.`,
            });
        }
      } catch (err) {
        console.error(`Error updating store ${storeToUpdate.id} ${field} status:`, err);
        const errorMsg = err instanceof Error ? err.message : `Could not update ${field} status.`;
        if (isMounted) {
            toast({ variant: "destructive", title: "Update Failed", description: errorMsg });
        }
      } finally {
        if (isMounted) setUpdatingStoreId(null);
      }
       return () => { isMounted = false; };
    };


  if (loading && stores.length === 0 && !error) {
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

      {error && !loading && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Error</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Filter &amp; Search Stores</CardTitle>
          <CardDescription>Search by store name. Active stores are shown by default.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col sm:flex-row gap-4">
          <form onSubmit={handleSearchSubmit} className="flex-1 flex gap-2">
            <Input
              type="search"
              placeholder="Search by Store Name..."
              value={searchTermInput}
              onChange={(e) => setSearchTermInput(e.target.value)}
              disabled={isSearching || loading}
              className="h-10 text-base"
            />
            <Button type="submit" disabled={isSearching || loading} className="h-10">
              {isSearching || (loading && debouncedSearchTerm) ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
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
           {loading && stores.length === 0 && !error ? (
             <StoresTableSkeleton />
           ) : !loading && stores.length === 0 && !error ? (
             <p className="text-center text-muted-foreground py-8">
                {debouncedSearchTerm ? `No stores found matching "${debouncedSearchTerm}". Try a different term.` : "No stores found. Add one to get started!"}
             </p>
           ) : (
             <div className="overflow-x-auto">
               <Table>
                 <TableHeader>
                   <TableRow>
                     <TableHead>Logo</TableHead>
                     <TableHead>Name</TableHead>
                     <TableHead>Cashback Rate</TableHead>
                     <TableHead>Featured</TableHead>
                     <TableHead>Today's Deal</TableHead>
                     <TableHead>Status (Active)</TableHead>
                     <TableHead>Actions</TableHead>
                   </TableRow>
                 </TableHeader>
                 <TableBody>
                   {stores.map((store) => (
                     <TableRow key={store.id} className={!store.isActive ? 'opacity-50 bg-muted/30' : ''}>
                       <TableCell>
                         {store.logoUrl ? (
                           <Image src={store.logoUrl} alt={`${store.name} logo`} width={60} height={30} className="object-contain rounded-sm" data-ai-hint={store.dataAiHint || `${store.name} company logo`}/>
                         ) : (
                           <div className="w-[60px] h-[30px] bg-muted flex items-center justify-center text-xs text-muted-foreground rounded-sm">No Logo</div>
                         )}
                       </TableCell>
                       <TableCell className="font-medium">{store.name}</TableCell>
                       <TableCell>{store.cashbackRate}</TableCell>
                        <TableCell>
                            <Switch checked={!!store.isFeatured} onCheckedChange={() => handleToggleField(store, 'isFeatured')} disabled={updatingStoreId === store.id} aria-label="Toggle Featured"/>
                        </TableCell>
                        <TableCell>
                            <Switch checked={!!store.isTodaysDeal} onCheckedChange={() => handleToggleField(store, 'isTodaysDeal')} disabled={updatingStoreId === store.id} aria-label="Toggle Today's Deal"/>
                        </TableCell>
                       <TableCell>
                         <Switch
                            checked={store.isActive}
                            onCheckedChange={() => handleToggleField(store, 'isActive')}
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
           {hasMore && !loading && stores.length > 0 && (
            <div className="mt-6 text-center">
              <Button onClick={handleLoadMore} disabled={loadingMore}>
                {loadingMore ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                Load More Stores
              </Button>
            </div>
          )}
           {loadingMore && <div className="text-center py-4"><Loader2 className="h-6 w-6 animate-spin text-primary mx-auto" /></div>}
        </CardContent>
      </Card>

       <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
         <DialogContent className="sm:max-w-3xl max-h-[90vh] overflow-y-auto">
           <DialogHeader>
             <DialogTitle>{editingStore ? 'Edit Store' : 'Add New Store'}</DialogTitle>
             <DialogDescription>
               {editingStore ? `Update details for ${editingStore.name}.` : 'Enter the details for the new store.'}
             </DialogDescription>
           </DialogHeader>
           <form onSubmit={form.handleSubmit(onSubmit)} className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-4 py-4">

             <div className="space-y-4">
                <div className="space-y-1">
                  <Label htmlFor="nameDialog">Name*</Label>
                  <Input id="nameDialog" {...form.register('name')} disabled={isSaving} />
                  {form.formState.errors.name && <p className="text-sm text-destructive">{form.formState.errors.name.message}</p>}
                </div>
                 <div className="space-y-1">
                  <Label htmlFor="slugDialog">Slug</Label>
                  <Input id="slugDialog" {...form.register('slug')} placeholder="auto-generated or custom" disabled={isSaving || !!editingStore} />
                   {editingStore && <p className="text-xs text-muted-foreground">Slug cannot be changed after creation.</p>}
                  {form.formState.errors.slug && <p className="text-sm text-destructive">{form.formState.errors.slug.message}</p>}
                </div>
                <div className="space-y-1">
                  <Label htmlFor="logoUrlDialog">Logo URL</Label>
                  <Input id="logoUrlDialog" {...form.register('logoUrl')} placeholder="https://..." disabled={isSaving} />
                  {form.watch('logoUrl') && <Image src={form.watch('logoUrl')!} alt="Logo Preview" width={80} height={40} className="object-contain border rounded-sm mt-1" />}
                  {form.formState.errors.logoUrl && <p className="text-sm text-destructive">{form.formState.errors.logoUrl.message}</p>}
                </div>
                <div className="space-y-1">
                  <Label htmlFor="heroImageUrlDialog">Hero Image URL</Label>
                  <Input id="heroImageUrlDialog" {...form.register('heroImageUrl')} placeholder="https://..." disabled={isSaving} />
                  {form.watch('heroImageUrl') && <Image src={form.watch('heroImageUrl')!} alt="Hero Preview" width={160} height={80} className="object-cover border rounded-sm aspect-[2/1] mt-1" />}
                  {form.formState.errors.heroImageUrl && <p className="text-sm text-destructive">{form.formState.errors.heroImageUrl.message}</p>}
                </div>
                <div className="space-y-1">
                  <Label htmlFor="affiliateLinkDialog">Affiliate Link*</Label>
                  <Input id="affiliateLinkDialog" {...form.register('affiliateLink')} placeholder="https://..." disabled={isSaving} />
                  {form.formState.errors.affiliateLink && <p className="text-sm text-destructive">{form.formState.errors.affiliateLink.message}</p>}
                </div>
                <div className="space-y-1">
                  <Label htmlFor="cashbackRateDialog">Rate Display*</Label>
                  <Input id="cashbackRateDialog" {...form.register('cashbackRate')} placeholder="e.g., Up to 5% or Flat ₹100" disabled={isSaving} />
                  {form.formState.errors.cashbackRate && <p className="text-sm text-destructive">{form.formState.errors.cashbackRate.message}</p>}
                </div>
                <div className="grid grid-cols-3 gap-2">
                    <div className="space-y-1 col-span-2">
                      <Label htmlFor="cashbackRateValueDialog">Rate Value*</Label>
                      <Input id="cashbackRateValueDialog" type="number" step="0.01" {...form.register('cashbackRateValue', { valueAsNumber: true })} disabled={isSaving}/>
                      {form.formState.errors.cashbackRateValue && <p className="text-sm text-destructive">{form.formState.errors.cashbackRateValue.message}</p>}
                    </div>
                    <div className="space-y-1">
                        <Label htmlFor="cashbackTypeDialog">Type*</Label>
                        <Controller name="cashbackType" control={form.control} render={({ field }) => (
                            <Select value={field.value} onValueChange={field.onChange} disabled={isSaving}>
                            <SelectTrigger id="cashbackTypeDialog"><SelectValue /></SelectTrigger>
                            <SelectContent><SelectItem value="percentage">%</SelectItem><SelectItem value="fixed">₹</SelectItem></SelectContent>
                            </Select>
                        )}/>
                    </div>
                </div>
                 {form.formState.errors.cashbackType && <p className="text-sm text-destructive">{form.formState.errors.cashbackType.message}</p>}
                <div className="space-y-1">
                  <Label htmlFor="descriptionDialog">Short Description*</Label>
                  <Textarea id="descriptionDialog" {...form.register('description')} rows={3} disabled={isSaving} />
                  {form.formState.errors.description && <p className="text-sm text-destructive">{form.formState.errors.description.message}</p>}
                </div>
                <div className="space-y-1">
                  <Label htmlFor="detailedDescriptionDialog">Detailed Description</Label>
                  <Textarea id="detailedDescriptionDialog" {...form.register('detailedDescription')} rows={5} disabled={isSaving} />
                   {form.formState.errors.detailedDescription && <p className="text-sm text-destructive">{form.formState.errors.detailedDescription.message}</p>}
                </div>
             </div>
             <div className="space-y-4">
                <div className="space-y-1">
                  <Label htmlFor="categoriesDialog">Categories*</Label>
                  <Controller control={form.control} name="categories"
                      render={({ field }) => (
                          <MultiSelect options={categoriesList} selected={field.value} onChange={field.onChange} isLoading={loadingCategories} disabled={isSaving} placeholder="Select categories..." />
                      )}
                  />
                  {form.formState.errors.categories && <p className="text-sm text-destructive">{form.formState.errors.categories.message}</p>}
                </div>
                <div className="grid grid-cols-2 gap-2">
                    <div className="space-y-1">
                        <Label htmlFor="ratingDialog">Rating (0-5)</Label>
                        <Input id="ratingDialog" type="number" step="0.1" {...form.register('rating', { valueAsNumber: true, setValueAs: v => v === null || v === '' ? null : parseFloat(v) })} disabled={isSaving} />
                        {form.formState.errors.rating && <p className="text-sm text-destructive">{form.formState.errors.rating.message}</p>}
                    </div>
                    <div className="space-y-1">
                        <Label htmlFor="ratingCountDialog">Rating Count</Label>
                        <Input id="ratingCountDialog" type="number" {...form.register('ratingCount', { valueAsNumber: true, setValueAs: v => v === null || v === '' ? null : parseInt(v, 10) })} disabled={isSaving} />
                         {form.formState.errors.ratingCount && <p className="text-sm text-destructive">{form.formState.errors.ratingCount.message}</p>}
                    </div>
                </div>
                <div className="space-y-1">
                    <Label htmlFor="cashbackTrackingTimeDialog">Tracking Time</Label>
                    <Input id="cashbackTrackingTimeDialog" {...form.register('cashbackTrackingTime')} placeholder="e.g., 36 Hours" disabled={isSaving} />
                    {form.formState.errors.cashbackTrackingTime && <p className="text-sm text-destructive">{form.formState.errors.cashbackTrackingTime.message}</p>}
                </div>
                <div className="space-y-1">
                    <Label htmlFor="cashbackConfirmationTimeDialog">Confirmation Time</Label>
                    <Input id="cashbackConfirmationTimeDialog" {...form.register('cashbackConfirmationTime')} placeholder="e.g., 35 Days" disabled={isSaving} />
                    {form.formState.errors.cashbackConfirmationTime && <p className="text-sm text-destructive">{form.formState.errors.cashbackConfirmationTime.message}</p>}
                </div>
                <div className="flex items-center space-x-2 pt-2">
                    <Controller control={form.control} name="cashbackOnAppOrders" render={({ field }) => ( <Checkbox id="cashbackOnAppOrdersDialog" checked={field.value ?? false} onCheckedChange={field.onChange} disabled={isSaving} /> )}/>
                    <Label htmlFor="cashbackOnAppOrdersDialog" className="font-normal">Cashback on App Orders?</Label>
                </div>
                <div className="space-y-1">
                  <Label htmlFor="detailedCashbackRatesLinkDialog">Detailed Rates Link</Label>
                  <Input id="detailedCashbackRatesLinkDialog" type="url" {...form.register('detailedCashbackRatesLink')} placeholder="https://..." disabled={isSaving} />
                  {form.formState.errors.detailedCashbackRatesLink && <p className="text-sm text-destructive">{form.formState.errors.detailedCashbackRatesLink.message}</p>}
                </div>
                <div className="space-y-1">
                  <Label htmlFor="topOffersTextDialog">Top Offers Text</Label>
                  <Textarea id="topOffersTextDialog" {...form.register('topOffersText')} rows={3} disabled={isSaving} />
                   {form.formState.errors.topOffersText && <p className="text-sm text-destructive">{form.formState.errors.topOffersText.message}</p>}
                </div>
                <div className="space-y-1">
                  <Label htmlFor="offerDetailsLinkDialog">Offer Details Link</Label>
                  <Input id="offerDetailsLinkDialog" type="url" {...form.register('offerDetailsLink')} placeholder="https://..." disabled={isSaving} />
                  {form.formState.errors.offerDetailsLink && <p className="text-sm text-destructive">{form.formState.errors.offerDetailsLink.message}</p>}
                </div>
                <div className="space-y-1">
                  <Label htmlFor="termsDialog">Terms &amp; Conditions</Label>
                  <Textarea id="termsDialog" {...form.register('terms')} rows={3} placeholder="Optional terms" disabled={isSaving} />
                </div>
                 <div className="space-y-1">
                    <Label htmlFor="dataAiHintDialog">Logo AI Hint</Label>
                    <Input id="dataAiHintDialog" {...form.register('dataAiHint')} placeholder="Keywords for logo" disabled={isSaving} />
                    {form.formState.errors.dataAiHint && <p className="text-sm text-destructive">{form.formState.errors.dataAiHint.message}</p>}
                 </div>
                <div className="flex items-center space-x-2 pt-2">
                    <Controller control={form.control} name="isFeatured" render={({ field }) => ( <Checkbox id="isFeaturedDialog" checked={field.value} onCheckedChange={field.onChange} disabled={isSaving} /> )}/>
                    <Label htmlFor="isFeaturedDialog" className="font-normal">Featured Store</Label>
                </div>
                 <div className="flex items-center space-x-2">
                    <Controller control={form.control} name="isTodaysDeal" render={({ field }) => ( <Checkbox id="isTodaysDealDialog" checked={field.value} onCheckedChange={field.onChange} disabled={isSaving} /> )}/>
                    <Label htmlFor="isTodaysDealDialog" className="font-normal">Today's Deal Store</Label>
                </div>
                <div className="flex items-center space-x-2">
                    <Controller control={form.control} name="isActive" render={({ field }) => ( <Checkbox id="isActiveDialog" checked={field.value} onCheckedChange={field.onChange} disabled={isSaving} /> )}/>
                    <Label htmlFor="isActiveDialog" className="font-normal">Active</Label>
                </div>
            </div>

             <DialogFooter className="md:col-span-2">
               <DialogClose asChild>
                 <Button type="button" variant="outline" disabled={isSaving}>Cancel</Button>
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
