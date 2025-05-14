
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
  addDoc,
  getDoc
} from 'firebase/firestore';
import { db, firebaseInitializationError } from '@/lib/firebase/config';
import type { Coupon, Store } from '@/lib/types';
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
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { AlertCircle, Loader2, Search, Edit, Trash2, PlusCircle, CheckCircle, XCircle, ExternalLink, CalendarIcon, Star } from 'lucide-react';
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
import { format, isValid } from 'date-fns';
import { cn, safeToDate } from '@/lib/utils';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { MoreHorizontal } from "lucide-react";
import { useDebounce } from '@/hooks/use-debounce';
import { Switch } from '@/components/ui/switch';

const COUPONS_PER_PAGE = 20;

interface CouponWithStoreName extends Coupon {
  storeName?: string;
}

const couponSchema = z.object({
  storeId: z.string().min(1, 'Store is required'),
  code: z.string().optional().nullable(),
  description: z.string().min(5, 'Description is too short').max(250, 'Description too long'),
  link: z.string().url('Invalid URL format').optional().nullable(),
  expiryDate: z.date().optional().nullable(),
  isFeatured: z.boolean().default(false),
  isActive: z.boolean().default(true),
}).refine(data => data.code || data.link, {
  message: "Either a Coupon Code or a Link is required",
  path: ["code"],
});

type CouponFormValues = z.infer<typeof couponSchema>;

const getStatusVariant = (isActive: boolean, expiryDate?: Date | null): "default" | "secondary" | "destructive" => {
   const isExpired = expiryDate ? expiryDate < new Date() : false;
   if (isExpired) return 'destructive';
  return isActive ? 'default' : 'secondary';
};

function AdminCouponsPageContent() {
  const [coupons, setCoupons] = useState<CouponWithStoreName[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastVisible, setLastVisible] = useState<QueryDocumentSnapshot<DocumentData> | null>(null);
  const [hasMore, setHasMore] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const { toast } = useToast();
  const router = useRouter();

  const [searchTermInput, setSearchTermInput] = useState('');
  const debouncedSearchTerm = useDebounce(searchTermInput, 500);
  const [isSearching, setIsSearching] = useState(false);

  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingCoupon, setEditingCoupon] = useState<Coupon | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [deletingCouponId, setDeletingCouponId] = useState<string | null>(null);
  const [updatingFieldId, setUpdatingFieldId] = useState<string | null>(null);

  const [storeList, setStoreList] = useState<{ id: string; name: string }[]>([]);
   useEffect(() => {
     let isMounted = true;
     const fetchStores = async () => {
       if (!db || firebaseInitializationError) {
         if (isMounted) setError(firebaseInitializationError || "Database not available for fetching stores.");
         return;
       }
       try {
         const storesCollection = collection(db, 'stores');
         const q = query(storesCollection, orderBy('name'));
         const snapshot = await getDocs(q);
         if (isMounted) setStoreList(snapshot.docs.map(doc => ({ id: doc.id, name: doc.data().name || 'Unnamed Store' })));
       } catch (storeFetchError) {
         console.error("Error fetching store list:", storeFetchError);
         if (isMounted) toast({ variant: 'destructive', title: 'Store List Error', description: 'Could not load stores.' });
       }
     };
     fetchStores();
     return () => { isMounted = false; };
   }, [toast]);

  const form = useForm<CouponFormValues>({
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

  const fetchCoupons = useCallback(async (loadMore = false) => {
    let isMounted = true;
    if (!db || firebaseInitializationError) {
      if(isMounted) {
        setError(firebaseInitializationError || "Database connection not available.");
        if(!loadMore) setLoading(false); else setLoadingMore(false);
        setHasMore(false);
      }
      return;
    }

    const isInitialOrNewSearch = !loadMore;
    if (isInitialOrNewSearch) {
      setLoading(true); setLastVisible(null); setCoupons([]); setHasMore(true);
    } else {
      setLoadingMore(true);
    }
    setError(null);
    setIsSearching(debouncedSearchTerm !== '');

    try {
      const couponsCollection = collection(db, 'coupons');
      let constraints: QueryConstraint[] = [];

      if (debouncedSearchTerm) {
        if (debouncedSearchTerm.length === 20 && /^[a-zA-Z0-9]+$/.test(debouncedSearchTerm)) {
             constraints.push(where('storeId', '==', debouncedSearchTerm));
        }
        constraints.push(orderBy('createdAt', 'desc'));
      } else {
        constraints.push(orderBy('createdAt', 'desc'));
      }

      if (loadMore && lastVisible) {
        constraints.push(startAfter(lastVisible));
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
          expiryDate: safeToDate(data.expiryDate),
          isFeatured: typeof data.isFeatured === 'boolean' ? data.isFeatured : false,
          isActive: typeof data.isActive === 'boolean' ? data.isActive : true,
          createdAt: safeToDate(data.createdAt),
          updatedAt: safeToDate(data.updatedAt),
          storeName: 'Loading...'
        };

        try {
          if (coupon.storeId && db) {
            const storeDocRef = doc(db, 'stores', coupon.storeId);
            const storeSnap = await getDoc(storeDocRef);
            coupon.storeName = storeSnap.exists() ? storeSnap.data()?.name || 'Unknown Store' : 'Store Not Found';
          } else if (!coupon.storeId) {
             coupon.storeName = 'No Store ID';
          }
        } catch (storeFetchError) {
          console.error(`Error fetching store name for ${coupon.storeId}:`, storeFetchError);
          coupon.storeName = 'Error Loading Store';
        }
        return coupon;
      });

       let couponsWithNames = await Promise.all(couponsDataPromises);

      if (debouncedSearchTerm && !(debouncedSearchTerm.length === 20 && /^[a-zA-Z0-9]+$/.test(debouncedSearchTerm))) {
          couponsWithNames = couponsWithNames.filter(c =>
              c.description.toLowerCase().includes(debouncedSearchTerm.toLowerCase()) ||
              (c.storeName && c.storeName !== 'Loading...' && c.storeName.toLowerCase().includes(debouncedSearchTerm.toLowerCase()))
          );
      }
      if(isMounted){
        if (isInitialOrNewSearch) {
          setCoupons(couponsWithNames);
        } else {
          setCoupons(prev => [...prev, ...couponsWithNames]);
        }

        setLastVisible(querySnapshot.docs[querySnapshot.docs.length - 1] || null);
        setHasMore(querySnapshot.docs.length === COUPONS_PER_PAGE && couponsWithNames.length > 0);
      }
    } catch (err) {
      console.error("Error fetching coupons:", err);
      const errorMsg = err instanceof Error ? err.message : "Failed to fetch coupons";
      if(isMounted) {
        setError(errorMsg);
        toast({ variant: "destructive", title: "Fetch Error", description: errorMsg });
      }
    } finally {
      if(isMounted){
        if(!loadMore) setLoading(false); else setLoadingMore(false);
        setIsSearching(false);
      }
    }
    return () => {isMounted = false;}
  }, [debouncedSearchTerm, lastVisible, toast]);

  useEffect(() => {
    fetchCoupons(false);
  }, [debouncedSearchTerm, fetchCoupons]);

  const handleSearch = (e: React.FormEvent) => e.preventDefault();
  const handleLoadMore = () => !loadingMore && hasMore && fetchCoupons(true);
  const openAddDialog = () => router.push('/admin/coupons/new');

  const openEditDialog = (coupon: Coupon) => {
    setEditingCoupon(coupon);
    form.reset({
      storeId: coupon.storeId,
      code: coupon.code ?? null,
      description: coupon.description,
      link: coupon.link ?? null,
      expiryDate: coupon.expiryDate ? safeToDate(coupon.expiryDate) : null,
      isFeatured: coupon.isFeatured,
      isActive: coupon.isActive,
    });
    setIsDialogOpen(true);
  };

  const onSubmit = async (data: CouponFormValues) => {
    if (!db) { setError("Database not available."); setIsSaving(false); return; }
    setIsSaving(true); setError(null);
    const submissionData = {
        ...data,
        code: data.code || null,
        link: data.link || null,
        expiryDate: data.expiryDate ? data.expiryDate : null,
    };

    try {
      if (editingCoupon) {
        const couponDocRef = doc(db, 'coupons', editingCoupon.id);
        await updateDoc(couponDocRef, { ...submissionData, updatedAt: serverTimestamp() });
         const updatedCoupon: CouponWithStoreName = {
             ...editingCoupon, ...submissionData, updatedAt: new Date(),
             storeName: storeList.find(s => s.id === submissionData.storeId)?.name || 'Unknown Store'
         };
         setCoupons(prev => prev.map(c => c.id === editingCoupon.id ? updatedCoupon : c));
        toast({ title: "Coupon Updated" });
      }
      setIsDialogOpen(false); form.reset();
    } catch (err) {
      console.error("Error saving coupon:", err);
      const errorMsg = err instanceof Error ? err.message : "Could not save coupon details.";
      setError(errorMsg); toast({ variant: "destructive", title: "Save Failed", description: errorMsg });
    } finally {
      setIsSaving(false);
    }
  };

   const handleDeleteCoupon = async (couponId: string) => {
     if (!couponId || !db) return;
     setDeletingCouponId(couponId);
     try {
       await deleteDoc(doc(db, 'coupons', couponId));
       setCoupons(prev => prev.filter(c => c.id !== couponId));
       toast({ title: "Coupon Deleted" });
     } catch (err) {
       console.error("Error deleting coupon:", err);
       const errorMsg = err instanceof Error ? err.message : "Could not delete the coupon.";
       toast({ variant: "destructive", title: "Deletion Failed", description: errorMsg });
     } finally {
       setDeletingCouponId(null);
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
      toast({ title: `Coupon ${field} status updated` });
    } catch (err) {
      console.error(`Error toggling ${field}:`, err);
      toast({ variant: "destructive", title: "Update Failed", description: String(err) });
    } finally {
      setUpdatingFieldId(null);
    }
  };

  if (loading && coupons.length === 0 && !error) {
    return <CouponsTableSkeleton />;
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-3xl font-bold">Manage Coupons & Offers</h1>
        <Button onClick={openAddDialog}>
          <PlusCircle className="mr-2 h-4 w-4" /> Add New Coupon/Offer
        </Button>
      </div>

      {error && !loading && (
        <Alert variant="destructive"> <AlertCircle className="h-4 w-4" /> <AlertTitle>Error</AlertTitle> <AlertDescription>{error}</AlertDescription> </Alert>
      )}

      <Card>
        <CardHeader> <CardTitle>Filter & Search</CardTitle> <CardDescription>Search by Store ID or Description.</CardDescription> </CardHeader>
        <CardContent className="flex flex-col sm:flex-row gap-4">
          <form onSubmit={handleSearch} className="flex-1 flex gap-2">
            <Input type="search" placeholder="Search by Store ID or Description..." value={searchTermInput} onChange={(e) => setSearchTermInput(e.target.value)} disabled={isSearching || loading} className="h-10 text-base"/>
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
             <div className="overflow-x-auto">
               <Table>
                 <TableHeader>
                   <TableRow>
                     <TableHead>Store</TableHead>
                     <TableHead>Description</TableHead>
                     <TableHead>Code/Link</TableHead>
                     <TableHead>Expires</TableHead>
                     <TableHead>Active</TableHead>
                     <TableHead>Featured</TableHead>
                     <TableHead>Actions</TableHead>
                   </TableRow>
                 </TableHeader>
                 <TableBody>
                   {coupons.map((coupon) => {
                      const isExpired = coupon.expiryDate ? coupon.expiryDate < new Date() : false;
                      return (
                         <TableRow key={coupon.id} className={!coupon.isActive || isExpired ? 'opacity-50 bg-muted/30' : ''}>
                           <TableCell className="font-medium">
                             {coupon.storeName || coupon.storeId}
                              {!coupon.storeName?.includes(' ') && coupon.storeName !== 'Loading...' && ( <span className="block text-xs text-muted-foreground font-mono">ID: {coupon.storeId}</span> )}
                           </TableCell>
                           <TableCell className="max-w-[300px] truncate">{coupon.description}</TableCell>
                           <TableCell>
                              {coupon.code && <Badge variant="outline" className="font-mono">{coupon.code}</Badge>}
                              {coupon.link && ( <Button variant="link" size="sm" asChild className="p-0 h-auto ml-1"> <a href={coupon.link} target="_blank" rel="noopener noreferrer"> View Link <ExternalLink className="h-3 w-3 ml-1" /> </a> </Button> )}
                               {!coupon.code && !coupon.link && <span className="text-xs text-muted-foreground">-</span>}
                           </TableCell>
                           <TableCell>
                              {coupon.expiryDate ? format(coupon.expiryDate, 'PP') : 'N/A'}
                              {isExpired && <span className="text-xs text-destructive ml-1">(Expired)</span>}
                           </TableCell>
                            <TableCell>
                                <Switch checked={coupon.isActive} onCheckedChange={() => handleToggleField(coupon.id, 'isActive')} disabled={updatingFieldId === coupon.id} aria-label="Toggle Active"/>
                            </TableCell>
                            <TableCell>
                                <Switch checked={!!coupon.isFeatured} onCheckedChange={() => handleToggleField(coupon.id, 'isFeatured')} disabled={updatingFieldId === coupon.id} aria-label="Toggle Featured"/>
                                {updatingFieldId === coupon.id && <Loader2 className="h-4 w-4 animate-spin ml-2 inline-block" />}
                            </TableCell>
                           <TableCell>
                            <AlertDialogTrigger asChild>
                             <DropdownMenu>
                               <DropdownMenuTrigger asChild> <Button variant="ghost" className="h-8 w-8 p-0"> <span className="sr-only">Open menu</span> <MoreHorizontal className="h-4 w-4" /> </Button> </DropdownMenuTrigger>
                               <DropdownMenuContent align="end">
                                 <DropdownMenuLabel>Actions</DropdownMenuLabel>
                                 <DropdownMenuItem onClick={() => openEditDialog(coupon)}> <Edit className="mr-2 h-4 w-4" /> Edit Coupon </DropdownMenuItem>
                                 <DropdownMenuSeparator />
                                  <AlertDialog>
                                      <AlertDialogTrigger asChild>
                                        <Button variant="ghost" className="w-full justify-start px-2 py-1.5 text-sm font-normal text-destructive hover:bg-destructive/10 focus:text-destructive focus:bg-destructive/10 h-auto relative flex cursor-default select-none items-center rounded-sm outline-none transition-colors data-[disabled]:pointer-events-none data-[disabled]:opacity-50">
                                          <Trash2 className="mr-2 h-4 w-4"/> Delete Coupon
                                        </Button>
                                      </AlertDialogTrigger>
                                   <AlertDialogContent>
                                     <AlertDialogHeader> <AlertDialogTitle>Are you sure?</AlertDialogTitle> <AlertDialogDescription> This action cannot be undone. This will permanently delete the coupon/offer: "{coupon.description}". </AlertDialogDescription> </AlertDialogHeader>
                                     <AlertDialogFooter> <AlertDialogCancel onClick={() => { setDeletingCouponId(null); }}>Cancel</AlertDialogCancel> <AlertDialogAction onClick={() => handleDeleteCoupon(coupon.id)} className="bg-destructive text-destructive-foreground hover:bg-destructive/90"> Delete </AlertDialogAction> </AlertDialogFooter>
                                   </AlertDialogContent>
                                 </AlertDialog>
                               </DropdownMenuContent>
                             </DropdownMenu>
                             </AlertDialogTrigger>
                           </TableCell>
                         </TableRow>
                      )
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

       <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
         <DialogContent className="sm:max-w-lg">
           <DialogHeader> <DialogTitle>{editingCoupon ? 'Edit Coupon/Offer' : 'Add New Coupon/Offer'}</DialogTitle> <DialogDescription> {editingCoupon ? `Update details for coupon/offer.` : 'Enter the details for the new coupon or offer.'} </DialogDescription> </DialogHeader>
           <form onSubmit={form.handleSubmit(onSubmit)} className="grid gap-4 py-4">
             <div className="grid grid-cols-4 items-center gap-4">
               <Label htmlFor="storeIdEdit" className="text-right">Store*</Label>
               <div className="col-span-3">
                   <Controller name="storeId" control={form.control} render={({ field }) => ( <Select value={field.value} onValueChange={field.onChange} disabled={isSaving}> <SelectTrigger id="storeIdEdit"> <SelectValue placeholder="Select a store..." /> </SelectTrigger> <SelectContent> {storeList.length === 0 && <SelectItem value="loading" disabled>Loading stores...</SelectItem>} {storeList.map(store => ( <SelectItem key={store.id} value={store.id}> {store.name} </SelectItem> ))} </SelectContent> </Select> )}/>
                    {form.formState.errors.storeId && <p className="text-sm text-destructive mt-1">{form.formState.errors.storeId.message}</p>}
               </div>
             </div>
             <div className="grid grid-cols-4 items-center gap-4">
               <Label htmlFor="descriptionEdit" className="text-right">Description*</Label>
               <Textarea id="descriptionEdit" {...form.register('description')} className="col-span-3" rows={2} disabled={isSaving} />
               {form.formState.errors.description && <p className="col-span-4 text-sm text-destructive text-right">{form.formState.errors.description.message}</p>}
             </div>
             <div className="grid grid-cols-4 items-center gap-4">
               <Label htmlFor="codeEdit" className="text-right">Coupon Code</Label>
               <Input id="codeEdit" {...form.register('code')} className="col-span-3" placeholder="Optional code (e.g., SAVE10)" disabled={isSaving} />
             </div>
             <div className="grid grid-cols-4 items-center gap-4">
               <Label htmlFor="linkEdit" className="text-right">Link</Label>
               <Input id="linkEdit" {...form.register('link')} className="col-span-3" placeholder="Optional direct offer link (https://...)" disabled={isSaving} />
                {form.formState.errors.link && <p className="col-span-4 text-sm text-destructive text-right">{form.formState.errors.link.message}</p>}
             </div>
             <div className="grid grid-cols-4 items-center gap-4">
                <Label htmlFor="expiryDateEdit" className="text-right">Expiry Date</Label>
                <Controller name="expiryDate" control={form.control} render={({ field }) => ( <Popover> <PopoverTrigger asChild> <Button variant={"outline"} className={cn( "col-span-3 justify-start text-left font-normal h-10", !field.value && "text-muted-foreground" )} disabled={isSaving} > <CalendarIcon className="mr-2 h-4 w-4" /> {field.value ? format(field.value, "PPP") : <span>Optional: Pick a date</span>} </Button> </PopoverTrigger> <PopoverContent className="w-auto p-0"> <Calendar mode="single" selected={field.value || undefined} onSelect={(date) => field.onChange(date || null)} initialFocus /> </PopoverContent> </Popover> )}/>
             </div>
             <div className="grid grid-cols-4 items-start gap-4">
                <Label className="text-right pt-2">Flags</Label>
                <div className="col-span-3 space-y-3">
                    <div className="flex items-center space-x-2">
                         <Controller name="isActive" control={form.control} render={({ field }) => ( <Checkbox id="isActiveEdit" checked={field.value} onCheckedChange={field.onChange} disabled={isSaving} /> )}/>
                        <Label htmlFor="isActiveEdit" className="font-normal">Active</Label>
                    </div>
                    <div className="flex items-center space-x-2">
                         <Controller name="isFeatured" control={form.control} render={({ field }) => ( <Checkbox id="isFeaturedEdit" checked={field.value} onCheckedChange={field.onChange} disabled={isSaving} /> )}/>
                        <Label htmlFor="isFeaturedEdit" className="font-normal">Featured</Label>
                    </div>
                </div>
             </div>
             {form.formState.errors.code && form.formState.errors.code.type === 'refine' && ( <Alert variant="destructive" className="col-span-4"> <AlertCircle className="h-4 w-4" /> <AlertTitle>Input Required</AlertTitle> <AlertDescription>{form.formState.errors.code.message}</AlertDescription> </Alert> )}
             <DialogFooter> <DialogClose asChild> <Button type="button" variant="outline" disabled={isSaving}> Cancel </Button> </DialogClose> <Button type="submit" disabled={isSaving}> {isSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null} {editingCoupon ? 'Save Changes' : 'Add Coupon'} </Button> </DialogFooter>
           </form>
         </DialogContent>
       </Dialog>
    </div>
  );
}

function CouponsTableSkeleton() {
   return (
    <Card>
      <CardHeader> <Skeleton className="h-6 w-1/4 mb-2"/> <Skeleton className="h-4 w-1/2"/> </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow> {Array.from({ length: 7 }).map((_, index) => ( <TableHead key={index}><Skeleton className="h-5 w-full" /></TableHead> ))} </TableRow>
            </TableHeader>
            <TableBody> {Array.from({ length: 10 }).map((_, rowIndex) => ( <TableRow key={rowIndex}> {Array.from({ length: 7 }).map((_, colIndex) => ( <TableCell key={colIndex}><Skeleton className="h-5 w-full" /></TableCell> ))} </TableRow> ))} </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}

export default function AdminCouponsPage() {
    return ( <AdminGuard> <AdminCouponsPageContent /> </AdminGuard> );
}
