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
  addDoc, // Import addDoc for creating new coupons
  getDoc // To fetch store name for display
} from 'firebase/firestore';
import { db } from '@/lib/firebase/config';
import type { Coupon, Store } from '@/lib/types'; // Ensure Coupon type is defined
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
import { AlertCircle, Loader2, Search, Edit, Trash2, PlusCircle, CheckCircle, XCircle, ExternalLink, CalendarIcon } from 'lucide-react';
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
import AdminGuard from '@/components/guards/admin-guard'; // Ensure page is protected
import { format, isValid } from 'date-fns'; // For date formatting
import { cn, safeToDate } from '@/lib/utils'; // Utility functions
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { MoreHorizontal } from "lucide-react";

const COUPONS_PER_PAGE = 20;

// Interface for Coupon with Store Name (fetched separately)
interface CouponWithStoreName extends Coupon {
  storeName?: string;
}

// Zod schema for coupon form validation
const couponSchema = z.object({
  storeId: z.string().min(1, 'Store ID is required'),
  code: z.string().optional().nullable(),
  description: z.string().min(5, 'Description is too short').max(250, 'Description too long'),
  link: z.string().url('Invalid URL format').optional().nullable(),
  expiryDate: z.date().optional().nullable(),
  isFeatured: z.boolean().default(false),
  isActive: z.boolean().default(true),
}).refine(data => data.code || data.link, {
  message: "Either a Coupon Code or a Link is required",
  path: ["code"], // Attach error to 'code' field for simplicity
});

type CouponFormValues = z.infer<typeof couponSchema>;

// Helper function to map status to badge variant
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

  // Filtering and Searching State
  const [searchTerm, setSearchTerm] = useState(''); // For searching by Store ID or Description
  const [isSearching, setIsSearching] = useState(false);

  // State for Add/Edit Dialog
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingCoupon, setEditingCoupon] = useState<Coupon | null>(null); // null for Add, Coupon object for Edit
  const [isSaving, setIsSaving] = useState(false);
  const [deletingCouponId, setDeletingCouponId] = useState<string | null>(null); // Track deletion

  // Store List for Dropdown (simplified - fetch all for now, consider pagination/search if many stores)
  const [storeList, setStoreList] = useState<{ id: string; name: string }[]>([]);
   useEffect(() => {
     const fetchStores = async () => {
       try {
         const storesCollection = collection(db, 'stores');
         const q = query(storesCollection, orderBy('name'));
         const snapshot = await getDocs(q);
         setStoreList(snapshot.docs.map(doc => ({ id: doc.id, name: doc.data().name || 'Unnamed Store' })));
       } catch (storeFetchError) {
         console.error("Error fetching store list:", storeFetchError);
         toast({ variant: 'destructive', title: 'Store List Error', description: 'Could not load stores.' });
       }
     };
     fetchStores();
   }, [toast]);

  // React Hook Form setup
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

  // Fetch Coupons with Store Names
  const fetchCoupons = useCallback(async (loadMore = false, search = false) => {
    if (!loadMore) {
      setLoading(true);
      setLastVisible(null);
      setCoupons([]);
    } else {
      setLoadingMore(true);
    }
    setError(null);
    setIsSearching(search);

    try {
      const couponsCollection = collection(db, 'coupons');
      const constraints: QueryConstraint[] = [];

      // --- Simple Search Logic (by Store ID first) ---
      // A more complex search would involve multiple queries or a dedicated search service.
      if (search && searchTerm) {
         // Example: Prioritize searching by storeId if the term looks like an ID
         // This is basic; a real app might need regex or better logic
         if (searchTerm.length === 20 && /^[a-zA-Z0-9]+$/.test(searchTerm)) { // Basic check for Firestore ID format
             constraints.push(where('storeId', '==', searchTerm));
         } else {
             // Fallback: Basic description search (often requires indexing)
             // Note: Firestore doesn't support case-insensitive or partial text search well natively.
             // This might require indexing description or using a different approach.
             // constraints.push(where('description', '>=', searchTerm));
             // constraints.push(where('description', '<=', searchTerm + '\uf8ff'));
              console.warn("Description search is limited in Firestore. Consider searching by Store ID.");
              // For now, let's keep it simple and maybe rely on client-side filtering if needed
         }
      }

      // Apply ordering and pagination
       constraints.push(orderBy('createdAt', 'desc')); // Default order

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
          createdAt: safeToDate(data.createdAt) || new Date(0),
          updatedAt: safeToDate(data.updatedAt) || new Date(0),
          storeName: 'Loading...' // Placeholder
        };

        // Fetch store name
        try {
          if (coupon.storeId) {
            const storeDocRef = doc(db, 'stores', coupon.storeId);
            const storeSnap = await getDoc(storeDocRef);
            if (storeSnap.exists()) {
              coupon.storeName = storeSnap.data()?.name || 'Unknown Store';
            } else {
               coupon.storeName = 'Store Not Found';
            }
          } else {
             coupon.storeName = 'No Store ID';
          }
        } catch (storeFetchError) {
          console.error(`Error fetching store name for ${coupon.storeId}:`, storeFetchError);
          coupon.storeName = 'Error Loading Store';
        }
        return coupon;
      });

       const couponsWithNames = await Promise.all(couponsDataPromises);

      // Apply client-side filtering if description search was intended
       const filteredCoupons = (search && searchTerm && !(searchTerm.length === 20 && /^[a-zA-Z0-9]+$/.test(searchTerm)))
         ? couponsWithNames.filter(c => c.description.toLowerCase().includes(searchTerm.toLowerCase()))
         : couponsWithNames;


      if (loadMore) {
        setCoupons(prev => [...prev, ...filteredCoupons]);
      } else {
        setCoupons(filteredCoupons);
      }

      setLastVisible(querySnapshot.docs[querySnapshot.docs.length - 1] || null);
      // Adjust hasMore based on whether client-side filtering happened
       setHasMore(filteredCoupons.length === COUPONS_PER_PAGE && querySnapshot.docs.length === COUPONS_PER_PAGE);


    } catch (err) {
      console.error("Error fetching coupons:", err);
      const errorMsg = err instanceof Error ? err.message : "Failed to fetch coupons";
      setError(errorMsg);
      toast({ variant: "destructive", title: "Fetch Error", description: errorMsg });
    } finally {
      setLoading(false);
      setLoadingMore(false);
      setIsSearching(false);
    }
  }, [searchTerm, lastVisible, toast]); // Add toast

  useEffect(() => {
    fetchCoupons(false, false); // Initial fetch on mount
  }, [fetchCoupons]);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    fetchCoupons(false, true); // Fetch with search term, reset pagination
  };

  const handleLoadMore = () => {
    if (!loadingMore && hasMore) {
      fetchCoupons(true, searchTerm !== ''); // Pass true for loadMore
    }
  };

  // --- Dialog and Form Handlers ---
  const openAddDialog = () => {
    setEditingCoupon(null);
    form.reset({ // Reset form to defaults
      storeId: '', code: null, description: '', link: null,
      expiryDate: null, isFeatured: false, isActive: true,
    });
    setIsDialogOpen(true);
  };

  const openEditDialog = (coupon: Coupon) => {
    setEditingCoupon(coupon);
    form.reset({ // Populate form with existing data
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
    setIsSaving(true);
    setError(null);
    const submissionData = {
        ...data,
        code: data.code || null, // Ensure null if empty string
        link: data.link || null,
        expiryDate: data.expiryDate ? data.expiryDate : null, // Keep as Date or null
    };


    try {
      if (editingCoupon) {
        // Update Existing Coupon
        const couponDocRef = doc(db, 'coupons', editingCoupon.id);
        await updateDoc(couponDocRef, {
          ...submissionData,
          updatedAt: serverTimestamp(),
        });
         // Update local state - fetch store name again if storeId changed (unlikely here)
         const updatedCoupon: CouponWithStoreName = {
             ...editingCoupon, // Keep original timestamps and ID
             ...submissionData, // Apply updated data
             updatedAt: new Date(), // Estimate update time
             storeName: storeList.find(s => s.id === submissionData.storeId)?.name || 'Unknown Store' // Update store name based on ID
         };
         setCoupons(prev => prev.map(c => c.id === editingCoupon.id ? updatedCoupon : c));

        toast({ title: "Coupon Updated", description: `Details for coupon updated.` });
      } else {
        // Add New Coupon
        const couponsCollection = collection(db, 'coupons');
        const newDocRef = await addDoc(couponsCollection, {
          ...submissionData,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
         // Add to local state with store name
         const newCoupon: CouponWithStoreName = {
             ...submissionData,
             id: newDocRef.id,
             createdAt: new Date(),
             updatedAt: new Date(),
             storeName: storeList.find(s => s.id === submissionData.storeId)?.name || 'Unknown Store'
         };
         setCoupons(prev => [newCoupon, ...prev]); // Add to beginning
        toast({ title: "Coupon Added", description: `New coupon created successfully.` });
      }
      setIsDialogOpen(false);
      form.reset();
    } catch (err) {
      console.error("Error saving coupon:", err);
      const errorMsg = err instanceof Error ? err.message : "Could not save coupon details.";
      setError(errorMsg);
      toast({ variant: "destructive", title: "Save Failed", description: errorMsg });
    } finally {
      setIsSaving(false);
    }
  };

   // --- Delete Coupon ---
   const handleDeleteCoupon = async () => {
     if (!deletingCouponId) return;
     try {
       const couponDocRef = doc(db, 'coupons', deletingCouponId);
       await deleteDoc(couponDocRef);
       setCoupons(prev => prev.filter(c => c.id !== deletingCouponId));
       toast({ title: "Coupon Deleted", description: "The coupon has been removed." });
     } catch (err) {
       console.error("Error deleting coupon:", err);
       const errorMsg = err instanceof Error ? err.message : "Could not delete the coupon.";
       toast({ variant: "destructive", title: "Deletion Failed", description: errorMsg });
     } finally {
       setDeletingCouponId(null); // Reset deleting state
     }
   };


  if (loading && coupons.length === 0) {
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
          <CardTitle>Filter & Search</CardTitle>
          <CardDescription>Search by Store ID or Description (case-sensitive).</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col sm:flex-row gap-4">
          <form onSubmit={handleSearch} className="flex-1 flex gap-2">
            <Input
              type="search"
              placeholder="Search by Store ID or Description..."
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

      {/* Coupons Table */}
      <Card>
        <CardHeader>
          <CardTitle>Coupon List</CardTitle>
          <CardDescription>View and manage coupons and promotional offers.</CardDescription>
        </CardHeader>
        <CardContent>
           {loading && coupons.length === 0 ? (
             <CouponsTableSkeleton />
           ) : coupons.length === 0 ? (
             <p className="text-center text-muted-foreground py-8">No coupons found matching your criteria.</p>
           ) : (
             <div className="overflow-x-auto">
               <Table>
                 <TableHeader>
                   <TableRow>
                     <TableHead>Store</TableHead>
                     <TableHead>Description</TableHead>
                     <TableHead>Code/Link</TableHead>
                     <TableHead>Expires</TableHead>
                     <TableHead>Featured</TableHead>
                     <TableHead>Status</TableHead>
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
                              {!coupon.storeName?.includes(' ') && coupon.storeName !== 'Loading...' && (
                                 <span className="block text-xs text-muted-foreground font-mono">ID: {coupon.storeId}</span>
                              )}
                           </TableCell>
                           <TableCell className="max-w-[300px] truncate">{coupon.description}</TableCell>
                           <TableCell>
                              {coupon.code && <Badge variant="outline" className="font-mono">{coupon.code}</Badge>}
                              {coupon.link && (
                                 <Button variant="link" size="sm" asChild className="p-0 h-auto ml-1">
                                    <a href={coupon.link} target="_blank" rel="noopener noreferrer">
                                        View Link <ExternalLink className="h-3 w-3 ml-1" />
                                    </a>
                                 </Button>
                              )}
                               {!coupon.code && !coupon.link && <span className="text-xs text-muted-foreground">-</span>}
                           </TableCell>
                           <TableCell>
                              {coupon.expiryDate ? format(coupon.expiryDate, 'PP') : 'N/A'}
                              {isExpired && <span className="text-xs text-destructive ml-1">(Expired)</span>}
                           </TableCell>
                            <TableCell>
                               {coupon.isFeatured ? <CheckCircle className="h-5 w-5 text-green-600" /> : <XCircle className="h-5 w-5 text-muted-foreground"/>}
                            </TableCell>
                           <TableCell>
                             <Badge variant={getStatusVariant(coupon.isActive, coupon.expiryDate)}>
                                {isExpired ? 'Expired' : coupon.isActive ? 'Active' : 'Inactive'}
                             </Badge>
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
                                 <DropdownMenuItem onClick={() => openEditDialog(coupon)}>
                                   <Edit className="mr-2 h-4 w-4" /> Edit Coupon
                                 </DropdownMenuItem>
                                 <DropdownMenuSeparator />
                                  <AlertDialog>
                                   <AlertDialogTrigger asChild>
                                      <Button variant="ghost" className="w-full justify-start px-2 py-1.5 text-sm font-normal text-destructive hover:bg-destructive/10 focus:text-destructive focus:bg-destructive/10 h-auto relative flex cursor-default select-none items-center rounded-sm outline-none transition-colors data-[disabled]:pointer-events-none data-[disabled]:opacity-50">
                                         <Trash2 className="mr-2 h-4 w-4"/> Delete Coupon
                                      </Button>
                                   </AlertDialogTrigger>
                                   <AlertDialogContent>
                                     <AlertDialogHeader>
                                       <AlertDialogTitle>Are you sure?</AlertDialogTitle>
                                       <AlertDialogDescription>
                                         This action cannot be undone. This will permanently delete the coupon/offer: "{coupon.description}".
                                       </AlertDialogDescription>
                                     </AlertDialogHeader>
                                     <AlertDialogFooter>
                                       <AlertDialogCancel onClick={() => setDeletingCouponId(null)}>Cancel</AlertDialogCancel>
                                       <AlertDialogAction
                                          onClick={() => {
                                               setDeletingCouponId(coupon.id); // Set ID to delete
                                               handleDeleteCoupon(); // Call handler
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
                      )
                   })}
                 </TableBody>
               </Table>
             </div>
           )}
           {hasMore && (
            <div className="mt-6 text-center">
              <Button onClick={handleLoadMore} disabled={loadingMore}>
                {loadingMore ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                Load More Coupons
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

       {/* Add/Edit Coupon Dialog */}
       <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
         <DialogContent className="sm:max-w-lg">
           <DialogHeader>
             <DialogTitle>{editingCoupon ? 'Edit Coupon/Offer' : 'Add New Coupon/Offer'}</DialogTitle>
             <DialogDescription>
               {editingCoupon ? `Update details for coupon/offer.` : 'Enter the details for the new coupon or offer.'}
             </DialogDescription>
           </DialogHeader>
           <form onSubmit={form.handleSubmit(onSubmit)} className="grid gap-4 py-4">

              {/* Store Selector */}
             <div className="grid grid-cols-4 items-center gap-4">
               <Label htmlFor="storeId" className="text-right">Store*</Label>
               <div className="col-span-3">
                   <Select
                       value={form.watch('storeId')}
                       onValueChange={(value) => form.setValue('storeId', value, { shouldValidate: true })}
                       disabled={isSaving}
                   >
                       <SelectTrigger id="storeId">
                           <SelectValue placeholder="Select a store..." />
                       </SelectTrigger>
                       <SelectContent>
                           {storeList.length === 0 && <SelectItem value="loading" disabled>Loading stores...</SelectItem>}
                           {storeList.map(store => (
                               <SelectItem key={store.id} value={store.id}>
                                   {store.name}
                               </SelectItem>
                           ))}
                       </SelectContent>
                   </Select>
                    {form.formState.errors.storeId && <p className="text-sm text-destructive mt-1">{form.formState.errors.storeId.message}</p>}
               </div>
             </div>

             {/* Description */}
             <div className="grid grid-cols-4 items-center gap-4">
               <Label htmlFor="description" className="text-right">Description*</Label>
               <Textarea id="description" {...form.register('description')} className="col-span-3" rows={2} disabled={isSaving} />
               {form.formState.errors.description && <p className="col-span-4 text-sm text-destructive">{form.formState.errors.description.message}</p>}
             </div>

             {/* Coupon Code */}
             <div className="grid grid-cols-4 items-center gap-4">
               <Label htmlFor="code" className="text-right">Coupon Code</Label>
               <Input id="code" {...form.register('code')} className="col-span-3" placeholder="Optional code (e.g., SAVE10)" disabled={isSaving} />
             </div>

              {/* Link */}
             <div className="grid grid-cols-4 items-center gap-4">
               <Label htmlFor="link" className="text-right">Link</Label>
               <Input id="link" {...form.register('link')} className="col-span-3" placeholder="Optional direct offer link (https://...)" disabled={isSaving} />
                {form.formState.errors.link && <p className="col-span-4 text-sm text-destructive">{form.formState.errors.link.message}</p>}
             </div>

             {/* Expiry Date */}
             <div className="grid grid-cols-4 items-center gap-4">
                <Label htmlFor="expiryDate" className="text-right">Expiry Date</Label>
                <Popover>
                    <PopoverTrigger asChild>
                        <Button
                        variant={"outline"}
                        className={cn(
                            "col-span-3 justify-start text-left font-normal h-10", // Match input height
                            !form.watch('expiryDate') && "text-muted-foreground"
                        )}
                        disabled={isSaving}
                        >
                        <CalendarIcon className="mr-2 h-4 w-4" />
                        {form.watch('expiryDate') ? format(form.watch('expiryDate')!, "PPP") : <span>Optional: Pick a date</span>}
                        </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0">
                        <Calendar
                           mode="single"
                           selected={form.watch('expiryDate') ?? undefined}
                           onSelect={(date) => form.setValue('expiryDate', date ?? null)} // Handle null case
                           initialFocus
                         />
                    </PopoverContent>
                </Popover>
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
                        <Label htmlFor="isFeatured" className="font-normal">Featured Coupon (highlighted)</Label>
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

             {/* General form error (e.g., code OR link required) */}
             {form.formState.errors.code && form.formState.errors.code.type === 'refine' && (
                <Alert variant="destructive" className="col-span-4">
                   <AlertCircle className="h-4 w-4" />
                   <AlertTitle>Input Required</AlertTitle>
                   <AlertDescription>{form.formState.errors.code.message}</AlertDescription>
                </Alert>
             )}


             <DialogFooter>
               <DialogClose asChild>
                 <Button type="button" variant="outline" disabled={isSaving}>
                   Cancel
                 </Button>
               </DialogClose>
               <Button type="submit" disabled={isSaving}>
                 {isSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                 {editingCoupon ? 'Save Changes' : 'Add Coupon'}
               </Button>
             </DialogFooter>
           </form>
         </DialogContent>
       </Dialog>

    </div>
  );
}

// Skeleton Loader for the Table
function CouponsTableSkeleton() {
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

export default function AdminCouponsPage() {
    return (
      <AdminGuard>
        <AdminCouponsPageContent />
      </AdminGuard>
    );
}
