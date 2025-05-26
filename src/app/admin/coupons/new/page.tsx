
// src/app/admin/coupons/new/page.tsx
"use client";

import * as React from 'react';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { collection, addDoc, serverTimestamp, query, orderBy, getDocs, where, Timestamp } from 'firebase/firestore';
import { db, firebaseInitializationError } from '@/lib/firebase/config';
import type { CouponFormValues, Store } from '@/lib/types';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ArrowLeft, Loader2, PlusCircle, CalendarIcon, BadgePercent } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import AdminGuard from '@/components/guards/admin-guard';
import { format } from 'date-fns';
import { cn, safeToDate } from '@/lib/utils';

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
  path: ["code"], // You can also use ["link"] or a more general path if needed
});

function AddCouponPageSkeleton() {
  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4"><Skeleton className="h-10 w-10 rounded-md" /><Skeleton className="h-9 w-1/2" /></div>
      <Card>
        <CardHeader><Skeleton className="h-7 w-1/3 mb-1" /><Skeleton className="h-4 w-2/3" /></CardHeader>
        <CardContent className="space-y-6">
          {Array.from({ length: 5 }).map((_, index) => (
            <div key={`form-group-skel-${index}`} className="space-y-2">
              <Skeleton className="h-4 w-1/4" /><Skeleton className="h-10 w-full" />
            </div>
          ))}
          <div className="space-y-2"><Skeleton className="h-5 w-1/2" /><Skeleton className="h-5 w-1/2" /></div>
          <div className="flex justify-end gap-2 pt-4"><Skeleton className="h-10 w-24" /><Skeleton className="h-10 w-32" /></div>
        </CardContent>
      </Card>
    </div>
  );
}

export default function AddCouponPage() {
  const router = useRouter();
  const { toast } = useToast();
  const [isSaving, setIsSaving] = useState(false);
  const [storeList, setStoreList] = useState<{ id: string; name: string }[]>([]);
  const [loadingStores, setLoadingStores] = useState(true);
  const [pageError, setPageError] = useState<string | null>(null);

  const form = useForm<CouponFormValues>({
    resolver: zodResolver(couponSchema),
    defaultValues: {
      storeId: '',
      code: null,
      description: '',
      link: null,
      expiryDate: null, // JS Date or null
      isFeatured: false,
      isActive: true,
    },
  });

  useEffect(() => {
    let isMounted = true;
    const fetchStores = async () => {
      if (!isMounted) return;
      if (!db || firebaseInitializationError) {
        if(isMounted) {
            const errorMsg = firebaseInitializationError || "Failed to connect to database.";
            setPageError(errorMsg);
            toast({ variant: 'destructive', title: 'Database Error', description: errorMsg });
            setLoadingStores(false);
        }
        return;
      }
      setLoadingStores(true);
      setPageError(null);
      try {
        const storesCollection = collection(db, 'stores');
        // Fetch only active stores for selection
        const q = query(storesCollection, where('isActive', '==', true), orderBy('name'));
        const snapshot = await getDocs(q);
        if(isMounted) {
            setStoreList(snapshot.docs.map(doc => ({ id: doc.id, name: doc.data().name || 'Unnamed Store' })));
        }
      } catch (storeFetchError) {
        console.error("Error fetching stores:", storeFetchError);
        if(isMounted) {
            const errorMsg = storeFetchError instanceof Error ? storeFetchError.message : 'Could not load stores.';
            setPageError(errorMsg);
            toast({ variant: 'destructive', title: 'Store List Error', description: errorMsg });
        }
      } finally {
        if(isMounted) {
            setLoadingStores(false);
        }
      }
    };
    fetchStores();
    return () => { isMounted = false; };
  }, [toast]);

  const onSubmit = async (data: CouponFormValues) => {
    if (!db || firebaseInitializationError) {
      toast({ variant: "destructive", title: "Error", description: firebaseInitializationError || "Database not available."});
      return;
    }
    setIsSaving(true);
    setPageError(null);

    // Convert JS Date from form (data.expiryDate) to Firestore Timestamp
    const jsExpiryDate = data.expiryDate ? safeToDate(data.expiryDate) : null;

    const submissionData = {
      ...data,
      code: data.code || null, // Ensure empty string becomes null
      link: data.link || null, // Ensure empty string becomes null
      expiryDate: jsExpiryDate ? Timestamp.fromDate(jsExpiryDate) : null, // Convert to Timestamp or null
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    };

    try {
      await addDoc(collection(db, 'coupons'), submissionData);
      toast({ title: "Coupon Added", description: `Coupon "${data.description.substring(0,30)}..." has been created.` });
      router.push('/admin/coupons');
    } catch (err) {
      console.error("Error adding coupon:", err);
      const errorMsg = err instanceof Error ? err.message : "Could not add coupon.";
      setPageError(errorMsg); // Display error on page if needed
      toast({ variant: "destructive", title: "Save Failed", description: errorMsg });
    } finally {
      setIsSaving(false);
    }
  };
  
  if (loadingStores && storeList.length === 0 && !pageError) {
      return <AdminGuard><AddCouponPageSkeleton/></AdminGuard>;
  }

  return (
    <AdminGuard>
      <div className="space-y-6">
        <div className="flex items-center gap-4">
          <Button variant="outline" size="icon" onClick={() => router.back()} aria-label="Go back">
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <h1 className="text-2xl sm:text-3xl font-bold flex items-center gap-2"><BadgePercent className="w-6 h-6 sm:w-7 sm:h-7" /> Add New Coupon/Offer</h1>
        </div>

        {pageError && (
            <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded relative mb-4" role="alert">
                <strong className="font-bold">Error: </strong>
                <span className="block sm:inline">{pageError}</span>
            </div>
        )}

        <Card className="shadow-lg border">
          <CardHeader>
            <CardTitle>Coupon Details</CardTitle>
            <CardDescription>Enter the information for the new coupon or promotional offer.</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-1">
                  <Label htmlFor="storeId">Store*</Label>
                  <Controller name="storeId" control={form.control} render={({ field }) => (
                    <Select value={field.value} onValueChange={field.onChange} disabled={isSaving || loadingStores}>
                      <SelectTrigger id="storeId"><SelectValue placeholder="Select a store..." /></SelectTrigger>
                      <SelectContent>
                        {loadingStores && <SelectItem value="loading" disabled>Loading stores...</SelectItem>}
                        {!loadingStores && storeList.length === 0 && <SelectItem value="no-stores" disabled>No active stores available</SelectItem>}
                        {storeList.map(store => (<SelectItem key={store.id} value={store.id}>{store.name}</SelectItem>))}
                      </SelectContent>
                    </Select>
                  )}/>
                  {form.formState.errors.storeId && <p className="text-sm text-destructive">{form.formState.errors.storeId.message}</p>}
                </div>
                <div className="space-y-1">
                  <Label htmlFor="code">Coupon Code</Label>
                  <Input id="code" {...form.register('code')} placeholder="Optional (e.g., SAVE10)" disabled={isSaving} />
                  {form.formState.errors.code && form.formState.errors.code.type !== 'refine' && <p className="text-sm text-destructive">{form.formState.errors.code.message}</p>}
                </div>
              </div>

              <div className="space-y-1">
                <Label htmlFor="description">Description*</Label>
                <Textarea id="description" {...form.register('description')} rows={3} disabled={isSaving} />
                {form.formState.errors.description && <p className="text-sm text-destructive">{form.formState.errors.description.message}</p>}
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-1">
                  <Label htmlFor="link">Link (to offer page)</Label>
                  <Input id="link" {...form.register('link')} placeholder="Optional (https://...)" disabled={isSaving} />
                  {form.formState.errors.link && <p className="text-sm text-destructive">{form.formState.errors.link.message}</p>}
                </div>
                <div className="space-y-1">
                  <Label htmlFor="expiryDate">Expiry Date</Label>
                  <Controller name="expiryDate" control={form.control} render={({ field }) => {
                      const dateForDisplay = field.value ? safeToDate(field.value) : null;
                      const dateForCalendar = dateForDisplay ?? undefined; // Pass Date or undefined
                      return (
                        <Popover>
                          <PopoverTrigger asChild>
                            <Button variant={"outline"} className={cn("w-full justify-start text-left font-normal h-10", !dateForDisplay && "text-muted-foreground")} disabled={isSaving}>
                              <CalendarIcon className="mr-2 h-4 w-4" />
                              {dateForDisplay ? format(dateForDisplay, "PPP") : <span>Optional: Pick a date</span>}
                            </Button>
                          </PopoverTrigger>
                          <PopoverContent className="w-auto p-0">
                            <Calendar 
                                mode="single" 
                                selected={dateForCalendar} 
                                onSelect={(date) => field.onChange(date || null)} 
                                initialFocus 
                                disabled={(date) => date < new Date(new Date().setHours(0,0,0,0))}
                            />
                          </PopoverContent>
                        </Popover>
                      );
                  }}/>
                </div>
              </div>
              
              <div className="flex flex-col sm:flex-row sm:items-center gap-4 sm:gap-6 pt-2">
                <div className="flex items-center space-x-2">
                  <Controller name="isActive" control={form.control} render={({ field }) => (<Checkbox id="isActive" checked={field.value} onCheckedChange={field.onChange} disabled={isSaving} />)}/>
                  <Label htmlFor="isActive" className="font-normal">Active (Visible on site)</Label>
                </div>
                <div className="flex items-center space-x-2">
                  <Controller name="isFeatured" control={form.control} render={({ field }) => (<Checkbox id="isFeatured" checked={field.value} onCheckedChange={field.onChange} disabled={isSaving} />)}/>
                  <Label htmlFor="isFeatured" className="font-normal">Featured Coupon</Label>
                </div>
              </div>

              {form.formState.errors.code && form.formState.errors.code.type === 'refine' && (
                  <p className="text-sm text-destructive col-span-full">{form.formState.errors.code.message}</p>
              )}

              <div className="flex flex-col sm:flex-row justify-end gap-2 pt-4 border-t">
                <Button type="button" variant="outline" onClick={() => router.back()} disabled={isSaving} className="w-full sm:w-auto">
                  Cancel
                </Button>
                <Button type="submit" disabled={isSaving || loadingStores} className="w-full sm:w-auto">
                  {isSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <PlusCircle className="mr-2 h-4 w-4" />}
                  Add Coupon
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      </div>
    </AdminGuard>
  );
}
