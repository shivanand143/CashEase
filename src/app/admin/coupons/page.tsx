
"use client";

import * as React from 'react';
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
  type QueryConstraint,
  type DocumentData,
  type QueryDocumentSnapshot,
  getDoc,
  Timestamp, // Ensure Timestamp is imported as a value
  type FieldValue, // Import FieldValue for serverTimestamp
  type WithFieldValue // Import WithFieldValue
} from 'firebase/firestore';
import { db, firebaseInitializationError } from '@/lib/firebase/config';
import type { Coupon, Store, CouponFormValues as AppCouponFormValues, CashbackType } from '@/lib/types';
import { useToast } from '@/hooks/use-toast';
import { Button, buttonVariants } from '@/components/ui/button';
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
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { AlertCircle, Loader2, Search, Edit, Trash2, PlusCircle, ExternalLink, CalendarIcon, Star, BadgePercent } from 'lucide-react';
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
import { format } from 'date-fns';
import { cn, safeToDate } from '@/lib/utils';
import { useDebounce } from '@/hooks/use-debounce';
import { Switch } from '@/components/ui/switch';

const COUPONS_PER_PAGE = 20;

interface CouponWithStoreName extends Coupon {
  storeName?: string;
}

const couponSchema = z.object({
  storeId: z.string().min(1, 'Store is required'),
  code: z.string().max(50, "Code too long").optional().nullable(),
  description: z.string().min(5, 'Description is too short').max(250, 'Description too long'),
  link: z.string().url('Invalid URL format').optional().or(z.literal('')).nullable(),
  expiryDate: z.date().optional().nullable(),
  isFeatured: z.boolean().default(false),
  isActive: z.boolean().default(true),
}).refine(data => data.code || data.link, {
  message: "Either a Coupon Code or a Link is required",
  path: ["code"],
});


function CouponsTableSkeleton() {
   return (
    <Card>
      <CardHeader> <Skeleton className="h-6 w-1/4 mb-2"/> <Skeleton className="h-4 w-1/2"/> </CardHeader>
      <CardContent>
        <div className="overflow-x-auto w-full">
          <Table>
            <TableHeader>
              <TableRow> {Array.from({ length: 7 }).map((_, index) => ( <TableHead key={index} className="min-w-[120px]"><Skeleton className="h-5 w-full" /></TableHead> ))} </TableRow>
            </TableHeader>
            <TableBody> {Array.from({ length: 10 }).map((_, rowIndex) => ( <TableRow key={rowIndex}> {Array.from({ length: 7 }).map((_, colIndex) => ( <TableCell key={colIndex}><Skeleton className="h-5 w-full" /></TableCell> ))} </TableRow> ))} </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}

export default function AdminCouponsPage() {
  const [coupons, setCoupons] = React.useState<CouponWithStoreName[]>([]);
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

  const [isEditDialogOpen, setIsEditDialogOpen] = React.useState(false);
  const [editingCoupon, setEditingCoupon] = React.useState<CouponWithStoreName | null>(null);
  const [isSaving, setIsSaving] = React.useState(false);
  
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = React.useState(false);
  const [couponToDelete, setCouponToDelete] = React.useState<CouponWithStoreName | null>(null);
  const [deletingCouponIdInternal, setDeletingCouponIdInternal] = React.useState<string | null>(null);

  const [updatingFieldId, setUpdatingFieldId] = React.useState<string | null>(null);
  const [loadingStoresForDialog, setLoadingStoresForDialog] = React.useState(false);
  const [storeListForDialog, setStoreListForDialog] = React.useState<{ id: string; name: string }[]>([]);

   React.useEffect(() => {
     let isMounted = true;
     const fetchStoresForDialog = async () => {
       if (!isMounted || !isEditDialogOpen) return; 
       if (!db || firebaseInitializationError) {
         if (isMounted) {
           setError(firebaseInitializationError || "Database not available for fetching stores.");
           setLoadingStoresForDialog(false);
         }
         return;
       }
       setLoadingStoresForDialog(true);
       try {
         const storesCollection = collection(db, 'stores');
         const q = query(storesCollection, where('isActive', '==', true) ,orderBy('name'));
         const snapshot = await getDocs(q);
         if (isMounted) {
           setStoreListForDialog(snapshot.docs.map(docSingle => ({ id: docSingle.id, name: docSingle.data().name || 'Unnamed Store' })));
         }
       } catch (storeFetchError) {
         console.error("Error fetching store list for dialog:", storeFetchError);
         if (isMounted) {
           toast({ variant: 'destructive', title: 'Store List Error', description: 'Could not load stores for selection.' });
         }
       } finally {
         if (isMounted) {
           setLoadingStoresForDialog(false);
         }
       }
     };
     
     if(isEditDialogOpen) {
        fetchStoresForDialog();
     }
     
     return () => { isMounted = false; };
   }, [isEditDialogOpen, toast]);

  const form = useForm<AppCouponFormValues>({ 
    resolver: zodResolver(couponSchema),
    defaultValues: {
      storeId: '',
      code: null,
      description: '',
      link: null,
      expiryDate: null, 
      isFeatured: false,
      isActive: true,
    },
  });

  const fetchCoupons = React.useCallback(async (
    isLoadMoreOperation: boolean,
    currentSearchTerm: string,
    docToStartAfter: QueryDocumentSnapshot<DocumentData> | null
  ) => {
    let isMounted = true;
    
    if (!isLoadMoreOperation) setLoading(true); else setLoadingMore(true);
    if (!isLoadMoreOperation) setError(null);
    setIsSearching(currentSearchTerm !== '');

    if (!db || firebaseInitializationError) {
      if(isMounted) {
        setError(firebaseInitializationError || "Database connection not available.");
        if(!isLoadMoreOperation) setLoading(false); else setLoadingMore(false);
        setHasMore(false);
      }
      return () => { isMounted = false; };
    }

    try {
      const couponsCollection = collection(db, 'coupons');
      let constraints: QueryConstraint[] = [];

      if (currentSearchTerm) {
        constraints.push(orderBy('description')); 
        constraints.push(where('description', '>=', currentSearchTerm));
        constraints.push(where('description', '<=', currentSearchTerm + '\uf8ff'));
      } else {
        constraints.push(orderBy('isFeatured', 'desc'));
        constraints.push(orderBy('createdAt', 'desc'));
      }

      if (isLoadMoreOperation && docToStartAfter) {
        constraints.push(startAfter(docToStartAfter));
      }
      constraints.push(limit(COUPONS_PER_PAGE));

      const q = query(couponsCollection, ...constraints);
      const querySnapshot = await getDocs(q);

      const couponsDataPromises = querySnapshot.docs.map(async (docSnap) => {
        const data = docSnap.data();
        const coupon: CouponWithStoreName = {
          id: docSnap.id,
          storeId: data.storeId || '',
          code: data.code || null,
          description: data.description || '',
          link: data.link || null,
          expiryDate: safeToDate(data.expiryDate as Timestamp | undefined) || null,
          isFeatured: typeof data.isFeatured === 'boolean' ? data.isFeatured : false,
          isActive: typeof data.isActive === 'boolean' ? data.isActive : true,
          createdAt: safeToDate(data.createdAt as Timestamp | undefined) || new Date(0),
          updatedAt: safeToDate(data.updatedAt as Timestamp | undefined) || new Date(0),
          storeName: 'Loading...' 
        };

        try {
          if (coupon.storeId && db) { // db check here too
            const storeDocRef = doc(db, 'stores', coupon.storeId);
            const storeSnap = await getDoc(storeDocRef);
            coupon.storeName = storeSnap.exists() ? storeSnap.data()?.name || 'Unknown Store' : 'Store Not Found';
          } else if (!coupon.storeId) {
             coupon.storeName = 'No Store ID';
          }
        } catch (storeFetchError) {
          console.error(`Error fetching store name for coupon ${coupon.id}, store ID ${coupon.storeId}:`, storeFetchError);
          coupon.storeName = 'Error Loading Store';
        }
        return coupon;
      });

       let couponsWithNames = await Promise.all(couponsDataPromises);
      
      if(isMounted){
        if (!isLoadMoreOperation) {
          setCoupons(couponsWithNames);
        } else {
          setCoupons(prev => {
            const existingIds = new Set(prev.map(c => c.id));
            const newUniqueCoupons = couponsWithNames.filter(c => !existingIds.has(c.id));
            return [...prev, ...newUniqueCoupons];
          });
        }

        setLastVisible(querySnapshot.docs[querySnapshot.docs.length - 1] || null);
        setHasMore(querySnapshot.docs.length === COUPONS_PER_PAGE); 
      }
    } catch (err) {
      console.error("Error fetching coupons:", err);
      if(isMounted){
        const errorMsg = err instanceof Error ? err.message : "Failed to fetch coupons";
        setError(errorMsg);
        toast({ variant: "destructive", title: "Fetch Error", description: errorMsg });
        setHasMore(false);
      }
    } finally {
      if(isMounted){
        if(!isLoadMoreOperation) setLoading(false); else setLoadingMore(false);
        setIsSearching(false);
      }
    }
    return () => { isMounted = false; };
  }, [toast]);

  React.useEffect(() => {
    let isMounted = true;
    if (isMounted) {
        fetchCoupons(false, debouncedSearchTerm, null);
    }
    return () => { isMounted = false; };
  }, [debouncedSearchTerm, fetchCoupons]);

  const handleSearch = (e: React.FormEvent) => e.preventDefault();

  const handleLoadMore = () => {
    if (!loadingMore && hasMore && lastVisible) { 
        fetchCoupons(true, debouncedSearchTerm, lastVisible);
    }
  };

  const openAddDialog = () => router.push('/admin/coupons/new');

  const openEditDialog = (coupon: CouponWithStoreName) => {
    setEditingCoupon(coupon);
    const expiryDateForForm = coupon.expiryDate ? safeToDate(coupon.expiryDate) : null;
    form.reset({
      storeId: coupon.storeId,
      code: coupon.code ?? null,
      description: coupon.description,
      link: coupon.link ?? null,
      expiryDate: expiryDateForForm,
      isFeatured: coupon.isFeatured,
      isActive: coupon.isActive,
    });
    setIsEditDialogOpen(true);
  };
  
  const handleOpenDeleteDialog = (coupon: CouponWithStoreName) => {
    setCouponToDelete(coupon);
    setIsDeleteDialogOpen(true);
  };

  const onSubmitEdit = async (data: AppCouponFormValues) => { 
    if (!db || !editingCoupon || firebaseInitializationError) { 
        setError(firebaseInitializationError || "Database not available or no coupon selected for edit."); 
        setIsSaving(false); return; 
    }
    setIsSaving(true); setError(null);

    const jsExpiryDateForSubmit = data.expiryDate ? safeToDate(data.expiryDate) : null;

    const submissionData: WithFieldValue<Partial<Omit<Coupon, 'id' | 'createdAt' | 'store'>>> = {
        storeId: data.storeId,
        code: data.code || null,
        description: data.description,
        link: data.link || null,
        isFeatured: data.isFeatured,
        isActive: data.isActive,
        expiryDate: jsExpiryDateForSubmit ? Timestamp.fromDate(jsExpiryDateForSubmit) : null,
        updatedAt: serverTimestamp()
    };

    try {
        const couponDocRef = doc(db, 'coupons', editingCoupon.id);
        await updateDoc(couponDocRef, submissionData);
        
         const updatedCoupon: CouponWithStoreName = {
             ...editingCoupon, 
             ...data, 
             expiryDate: jsExpiryDateForSubmit, 
             updatedAt: new Date(),
             storeName: storeListForDialog.find(s => s.id === data.storeId)?.name || editingCoupon.storeName || 'Unknown Store'
         };
         setCoupons(prev => prev.map(c => c.id === editingCoupon.id ? updatedCoupon : c));
        toast({ title: "Coupon Updated", description: `Coupon "${data.description.substring(0,30)}..." has been updated.` });
      setIsEditDialogOpen(false); form.reset(); setEditingCoupon(null);
    } catch (err) {
      console.error("Error saving coupon:", err);
      const errorMsg = err instanceof Error ? err.message : "Could not save coupon details.";
      setError(errorMsg); toast({ variant: "destructive", title: "Save Failed", description: errorMsg });
    } finally {
      setIsSaving(false);
    }
  };

   const handleDeleteCoupon = async () => {
     if (!couponToDelete || !couponToDelete.id || !db) return;
     setDeletingCouponIdInternal(couponToDelete.id);
     try {
       await deleteDoc(doc(db, 'coupons', couponToDelete.id));
       setCoupons(prev => prev.filter(c => c.id !== couponToDelete.id));
       toast({ title: "Coupon Deleted" });
     } catch (err) {
       console.error("Error deleting coupon:", err);
       const errorMsg = err instanceof Error ? err.message : "Could not delete the coupon.";
       toast({ variant: "destructive", title: "Deletion Failed", description: errorMsg });
     } finally {
       setDeletingCouponIdInternal(null);
       setIsDeleteDialogOpen(false);
       setCouponToDelete(null);
     }
   };

  const handleToggleField = async (couponId: string, field: 'isActive' | 'isFeatured') => {
    if (!db) return;
    setUpdatingFieldId(couponId);
    const couponToUpdate = coupons.find(c => c.id === couponId);
    if (!couponToUpdate) return;

    const newValue = !couponToUpdate[field];
    try {
      await updateDoc(doc(db, 'coupons', couponId), { [field]: newValue, updatedAt: serverTimestamp() });
      setCoupons(prev => prev.map(c => c.id === couponId ? { ...c, [field]: newValue, updatedAt: new Date() } : c));
      toast({ title: `Coupon ${field === 'isActive' ? 'Activation' : 'Feature'} Status Updated` });
    } catch (err) {
      console.error(`Error toggling ${field}:`, err);
      toast({ variant: "destructive", title: "Update Failed", description: String(err) });
    } finally {
      setUpdatingFieldId(null);
    }
  };

  if (loading && coupons.length === 0 && !error) {
    return (
      <AdminGuard>
        <CouponsTableSkeleton />
      </AdminGuard>
    );
  }

  return (
    <AdminGuard>
      <div className="space-y-6">
        <div className="flex justify-between items-center">
            <h1 className="text-2xl sm:text-3xl font-bold flex items-center gap-2"><BadgePercent className="w-6 h-6 sm:w-7 sm:h-7" /> Manage Coupons & Offers</h1>
            <Button onClick={openAddDialog}>
            <PlusCircle className="mr-2 h-4 w-4" /> Add New Coupon/Offer
            </Button>
        </div>

        {error && !loading && (
            <Alert variant="destructive"> <AlertCircle className="h-4 w-4" /> <AlertTitle>Error</AlertTitle> <AlertDescription>{error}</AlertDescription> </Alert>
        )}

        <Card>
            <CardHeader> <CardTitle>Filter & Search</CardTitle> <CardDescription>Search by coupon description.</CardDescription> </CardHeader>
            <CardContent className="flex flex-col sm:flex-row gap-4">
            <form onSubmit={handleSearch} className="flex-1 flex gap-2">
                <Input type="search" placeholder="Search by Coupon Description..." value={searchTermInput} onChange={(e) => setSearchTermInput(e.target.value)} disabled={isSearching || loading} className="h-10 text-base"/>
                <Button type="submit" disabled={isSearching || loading} className="h-10">
                {isSearching || (loading && debouncedSearchTerm) ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
                <span className="sr-only sm:not-sr-only sm:ml-2">Search</span>
                </Button>
            </form>
            </CardContent>
        </Card>

        <Card>
            <CardHeader> <CardTitle>Coupon List</CardTitle> <CardDescription>View and manage coupons and promotional offers.</CardDescription> </CardHeader>
            <CardContent>
            {loading && coupons.length === 0 && !error ? (
                <CouponsTableSkeleton />
            ) : !loading && coupons.length === 0 && !error ? (
                <p className="text-center text-muted-foreground py-8"> {debouncedSearchTerm ? `No coupons found matching "${debouncedSearchTerm}".` : "No coupons found."} </p>
            ) : (
                <div className="overflow-x-auto w-full">
                <Table className="min-w-[1000px]">
                    <TableHeader>
                    <TableRow>
                        <TableHead className="min-w-[150px]">Store</TableHead>
                        <TableHead className="min-w-[250px]">Description</TableHead>
                        <TableHead className="min-w-[150px]">Code/Link</TableHead>
                        <TableHead className="min-w-[120px]">Expires</TableHead>
                        <TableHead className="text-center">Active</TableHead>
                        <TableHead className="text-center">Featured</TableHead>
                        <TableHead className="text-right min-w-[100px]">Actions</TableHead>
                    </TableRow>
                    </TableHeader>
                    <TableBody>
                    {coupons.map((coupon) => {
                        const expiryDateForDisplay = coupon.expiryDate ? safeToDate(coupon.expiryDate) : null; 
                        const isExpired = expiryDateForDisplay ? expiryDateForDisplay < new Date(new Date().setHours(0,0,0,0)) : false;
                        return (
                            <TableRow key={coupon.id} className={!coupon.isActive || isExpired ? 'opacity-50 bg-muted/30' : ''}>
                            <TableCell className="font-medium text-xs truncate max-w-[150px]" title={coupon.storeName || coupon.storeId}>
                                {coupon.storeName || coupon.storeId}
                                {coupon.storeName !== 'Loading...' && coupon.storeName !== 'Store Not Found' && coupon.storeName !== 'No Store ID' && ( <span className="block text-[10px] text-muted-foreground font-mono">ID: {coupon.storeId}</span> )}
                            </TableCell>
                            <TableCell className="max-w-xs truncate text-sm" title={coupon.description}>{coupon.description}</TableCell>
                            <TableCell className="text-xs">
                                {coupon.code && <Badge variant="outline" className="font-mono text-xs">{coupon.code}</Badge>}
                                {coupon.link && ( <Button variant="link" size="sm" asChild className="p-0 h-auto ml-1 text-xs"> <a href={coupon.link} target="_blank" rel="noopener noreferrer"> View Link <ExternalLink className="h-3 w-3 ml-1" /> </a> </Button> )}
                                {!coupon.code && !coupon.link && <span className="text-xs text-muted-foreground">-</span>}
                            </TableCell>
                            <TableCell className="text-xs whitespace-nowrap">
                                {expiryDateForDisplay ? format(expiryDateForDisplay, 'PP') : 'N/A'}
                                {isExpired && <span className="text-xs text-destructive ml-1">(Expired)</span>}
                            </TableCell>
                                <TableCell className="text-center">
                                    <Switch checked={coupon.isActive} onCheckedChange={() => handleToggleField(coupon.id, 'isActive')} disabled={updatingFieldId === coupon.id} aria-label="Toggle Active"/>
                                </TableCell>
                                <TableCell className="text-center">
                                    <Switch checked={!!coupon.isFeatured} onCheckedChange={() => handleToggleField(coupon.id, 'isFeatured')} disabled={updatingFieldId === coupon.id} aria-label="Toggle Featured"/>
                                    {updatingFieldId === coupon.id && <Loader2 className="h-4 w-4 animate-spin ml-2 inline-block" />}
                                </TableCell>
                            <TableCell className="text-right">
                                <div className="flex gap-1 justify-end">
                                    <Button variant="outline" size="icon" onClick={() => openEditDialog(coupon)} className="h-8 w-8">
                                        <Edit className="h-4 w-4" />
                                        <span className="sr-only">Edit Coupon</span>
                                    </Button>
                                    <Button variant="destructive" size="icon" onClick={() => handleOpenDeleteDialog(coupon)} disabled={deletingCouponIdInternal === coupon.id} className="h-8 w-8">
                                        {deletingCouponIdInternal === coupon.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                                        <span className="sr-only">Delete Coupon</span>
                                    </Button>
                                </div>
                            </TableCell>
                            </TableRow>
                        );
                    })}
                    </TableBody>
                </Table>
                </div>
            )}
            {hasMore && !loading && coupons.length > 0 && (
                <div className="mt-6 text-center"> <Button onClick={handleLoadMore} disabled={loadingMore}> {loadingMore ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null} Load More Coupons </Button> </div>
            )}
            {loadingMore && <div className="text-center py-4"><Loader2 className="h-6 w-6 animate-spin text-primary mx-auto" /></div>}
            </CardContent>
        </Card>

        <Dialog open={isEditDialogOpen} onOpenChange={(isOpen) => {
            if(!isOpen) setEditingCoupon(null); 
            setIsEditDialogOpen(isOpen);
        }}>
            <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
            <DialogHeader> <DialogTitle>{editingCoupon ? 'Edit Coupon/Offer' : 'Add New Coupon/Offer'}</DialogTitle> <DialogDescription> {editingCoupon ? `Update details for coupon/offer "${editingCoupon.description.substring(0,30)}...".` : 'Enter the details for the new coupon or offer.'} </DialogDescription> </DialogHeader>
            <form onSubmit={form.handleSubmit(onSubmitEdit)} className="grid gap-4 py-4">
                <div className="grid grid-cols-4 items-center gap-4">
                <Label htmlFor="storeIdEdit" className="text-right">Store*</Label>
                <div className="col-span-3">
                    <Controller name="storeId" control={form.control} render={({ field }) => (
                        <Select value={field.value} onValueChange={field.onChange} disabled={isSaving || loadingStoresForDialog}>
                            <SelectTrigger id="storeIdEdit"> <SelectValue placeholder="Select a store..." /> </SelectTrigger>
                            <SelectContent>
                                {loadingStoresForDialog && <SelectItem value="loading" disabled>Loading stores...</SelectItem>}
                                {!loadingStoresForDialog && storeListForDialog.length === 0 && <SelectItem value="no-stores" disabled>No active stores available</SelectItem>}
                                {storeListForDialog.map(store => ( <SelectItem key={store.id} value={store.id}> {store.name} </SelectItem> ))}
                            </SelectContent>
                        </Select>
                    )}/>
                        {form.formState.errors.storeId && <p className="text-sm text-destructive mt-1">{form.formState.errors.storeId.message}</p>}
                </div>
                </div>
                <div className="grid grid-cols-4 items-center gap-4">
                <Label htmlFor="descriptionEdit" className="text-right">Description*</Label>
                <Textarea id="descriptionEdit" {...form.register('description')} className="col-span-3" rows={2} disabled={isSaving} />
                {form.formState.errors.description && <p className="col-span-4 text-sm text-destructive text-right mt-1">{form.formState.errors.description.message}</p>}
                </div>
                <div className="grid grid-cols-4 items-center gap-4">
                <Label htmlFor="codeEdit" className="text-right">Coupon Code</Label>
                <Input id="codeEdit" {...form.register('code')} className="col-span-3" placeholder="Optional code (e.g., SAVE10)" disabled={isSaving} />
                 {form.formState.errors.code && form.formState.errors.code.type !== 'refine' && <p className="col-span-4 text-sm text-destructive text-right mt-1">{form.formState.errors.code.message}</p>}
                </div>
                <div className="grid grid-cols-4 items-center gap-4">
                <Label htmlFor="linkEdit" className="text-right">Link</Label>
                <Input id="linkEdit" {...form.register('link')} className="col-span-3" placeholder="Optional direct offer link (https://...)" disabled={isSaving} />
                    {form.formState.errors.link && <p className="col-span-4 text-sm text-destructive text-right mt-1">{form.formState.errors.link.message}</p>}
                </div>
                <div className="grid grid-cols-4 items-center gap-4">
                    <Label htmlFor="expiryDateEdit" className="text-right">Expiry Date</Label>
                     <Controller name="expiryDate" control={form.control} render={({ field }) => {
                        const dateForPicker = safeToDate(field.value) ?? undefined; // Ensures undefined if null
                        return ( 
                        <Popover> 
                            <PopoverTrigger asChild> 
                                <Button variant={"outline"} className={cn( "col-span-3 justify-start text-left font-normal h-10", !dateForPicker && "text-muted-foreground" )} disabled={isSaving} > 
                                    <CalendarIcon className="mr-2 h-4 w-4" /> 
                                    {dateForPicker ? format(dateForPicker, "PPP") : <span>Optional: Pick a date</span>}
                                </Button> 
                            </PopoverTrigger> 
                            <PopoverContent className="w-auto p-0"> 
                                <Calendar 
                                    mode="single" 
                                    selected={dateForPicker} 
                                    onSelect={(date) => field.onChange(date || null)} 
                                    initialFocus 
                                    disabled={(d) => d < new Date(new Date().setHours(0,0,0,0))}
                                /> 
                            </PopoverContent> 
                        </Popover> 
                        );
                    }}/>
                     {form.formState.errors.expiryDate && <p className="col-span-4 text-sm text-destructive text-right mt-1">{form.formState.errors.expiryDate.message}</p>}
                </div>
                <div className="grid grid-cols-4 items-start gap-4">
                    <Label className="text-right pt-2">Flags</Label>
                    <div className="col-span-3 space-y-3">
                        <div className="flex items-center space-x-2">
                            <Controller name="isActive" control={form.control} render={({ field }) => ( <Checkbox id="isActiveEdit" checked={field.value} onCheckedChange={field.onChange} disabled={isSaving} /> )}/>
                            <Label htmlFor="isActiveEdit" className="font-normal">Active</Label>
                        </div>
                        <div className="flex items-center space-x-2">
                            <Controller name="isFeatured" control={form.control} render={({ field }) => ( <Checkbox id="isFeaturedEdit" checked={!!field.value} onCheckedChange={field.onChange} disabled={isSaving} /> )}/>
                            <Label htmlFor="isFeaturedEdit" className="font-normal">Featured</Label>
                        </div>
                    </div>
                </div>
                {form.formState.errors.code && form.formState.errors.code.type === 'refine' && ( <Alert variant="destructive" className="col-span-full"> <AlertCircle className="h-4 w-4" /> <AlertTitle>Input Required</AlertTitle> <AlertDescription>{form.formState.errors.code.message}</AlertDescription> </Alert> )}
                <DialogFooter className="flex-col sm:flex-row sm:justify-end gap-2 mt-2"> <DialogClose asChild> <Button type="button" variant="outline" disabled={isSaving} className="w-full sm:w-auto"> Cancel </Button> </DialogClose> <Button type="submit" disabled={isSaving || loadingStoresForDialog} className="w-full sm:w-auto"> {isSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null} {editingCoupon ? 'Save Changes' : 'Add Coupon'} </Button> </DialogFooter>
            </form>
            </DialogContent>
        </Dialog>

        <AlertDialog open={isDeleteDialogOpen} onOpenChange={(isOpen) => {
          if (!isOpen) setCouponToDelete(null);
          setIsDeleteDialogOpen(isOpen);
        }}>
            {couponToDelete && (
                <AlertDialogContent>
                    <AlertDialogHeader>
                    <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
                    <AlertDialogDescription>
                        This action cannot be undone. This will permanently delete the coupon
                        "{couponToDelete?.description || 'this coupon'}".
                    </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                    <AlertDialogCancel onClick={() => { setIsDeleteDialogOpen(false); setCouponToDelete(null); }}>Cancel</AlertDialogCancel>
                    <AlertDialogAction
                        onClick={handleDeleteCoupon}
                        className={cn(buttonVariants({ variant: "destructive" }))} // Use cn and buttonVariants
                        disabled={deletingCouponIdInternal === couponToDelete?.id}
                    >
                        {deletingCouponIdInternal === couponToDelete?.id ? <Loader2 className="mr-2 h-4 w-4 animate-spin"/> : null}
                        Delete
                    </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            )}
        </AlertDialog>
      </div>
    </AdminGuard>
  );
}

    