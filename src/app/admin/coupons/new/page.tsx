
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
  addDoc,
  serverTimestamp,
  getDocs,
  query,
  orderBy,
  where
} from 'firebase/firestore';
import { db, firebaseInitializationError } from '@/lib/firebase/config';
import type { Coupon, Store, CouponFormValues as CouponFormType } from '@/lib/types';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { AlertCircle, Loader2, ArrowLeft, PlusCircle, CalendarIcon } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import AdminGuard from '@/components/guards/admin-guard';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

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

function AddCouponPageContent() {
  const router = useRouter();
  const { toast } = useToast();
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [storeList, setStoreList] = useState<{ id: string; name: string }[]>([]);
  const [loadingStores, setLoadingStores] = useState(true);

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

  useEffect(() => {
    const fetchStores = async () => {
      setLoadingStores(true);
      if (firebaseInitializationError || !db) {
          setError(firebaseInitializationError || "Database not available.");
          setLoadingStores(false);
          return;
      }
      try {
        const storesCollection = collection(db, 'stores');
        const q = query(storesCollection, where('isActive', '==', true), orderBy('name', 'asc'));
        const snapshot = await getDocs(q);
        setStoreList(snapshot.docs.map(doc => ({ id: doc.id, name: doc.data().name || 'Unnamed Store' })));
      } catch (storeFetchError) {
        console.error("Error fetching store list:", storeFetchError);
        toast({ variant: 'destructive', title: 'Store List Error', description: 'Could not load stores.' });
      } finally {
        setLoadingStores(false);
      }
    };
    fetchStores();
  }, [toast]);


  const onSubmit = async (data: CouponFormValues) => {
    setIsSaving(true);
    setError(null);
    if (!db) {
        setError("Database not available.");
        setIsSaving(false);
        return;
    }
    const submissionData = {
      ...data,
      code: data.code || null,
      link: data.link || null,
      expiryDate: data.expiryDate ? data.expiryDate : null,
    };

    try {
      const couponsCollection = collection(db, 'coupons');
      await addDoc(couponsCollection, {
        ...submissionData,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      toast({
        title: "Coupon Added",
        description: `New coupon/offer created successfully.`,
      });
      router.push('/admin/coupons');

    } catch (err) {
      console.error("Error adding coupon:", err);
      const errorMsg = err instanceof Error ? err.message : "Could not add the coupon.";
      setError(errorMsg);
      toast({ variant: "destructive", title: "Save Failed", description: errorMsg });
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="space-y-6">
        <div className="flex items-center gap-4">
            <Button variant="outline" size="icon" asChild>
                <Link href="/admin/coupons">
                    <ArrowLeft className="h-4 w-4" />
                    <span className="sr-only">Back to Coupons</span>
                </Link>
            </Button>
             <h1 className="text-3xl font-bold">Add New Coupon/Offer</h1>
        </div>

      <Card>
        <CardHeader>
          <CardTitle>Coupon/Offer Details</CardTitle>
          <CardDescription>Enter the information for the new coupon or promotional offer.</CardDescription>
        </CardHeader>
        <CardContent>
          {error && (
            <Alert variant="destructive" className="mb-6">
              <AlertCircle className="h-4 w-4" />
              <AlertTitle>Error</AlertTitle>
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">

             <div className="space-y-2">
               <Label htmlFor="storeId">Store*</Label>
               <Controller
                 control={form.control}
                 name="storeId"
                 render={({ field }) => (
                   <Select
                     value={field.value}
                     onValueChange={field.onChange}
                     disabled={isSaving || loadingStores}
                   >
                     <SelectTrigger id="storeId">
                       <SelectValue placeholder={loadingStores ? "Loading stores..." : "Select a store..."} />
                     </SelectTrigger>
                     <SelectContent>
                       {storeList.length === 0 && !loadingStores && <SelectItem value="no-stores" disabled>No active stores found</SelectItem>}
                       {storeList.map(store => (
                         <SelectItem key={store.id} value={store.id}>
                           {store.name}
                         </SelectItem>
                       ))}
                     </SelectContent>
                   </Select>
                 )}
               />
               {form.formState.errors.storeId && <p className="text-sm text-destructive">{form.formState.errors.storeId.message}</p>}
             </div>

             <div className="space-y-2">
               <Label htmlFor="description">Description*</Label>
               <Textarea id="description" {...form.register('description')} rows={3} disabled={isSaving} />
               {form.formState.errors.description && <p className="text-sm text-destructive">{form.formState.errors.description.message}</p>}
             </div>

             <div className="space-y-2">
               <Label htmlFor="code">Coupon Code</Label>
               <Input id="code" {...form.register('code')} placeholder="Optional code (e.g., SAVE10)" disabled={isSaving} />
             </div>

             <div className="space-y-2">
               <Label htmlFor="link">Link</Label>
               <Input id="link" {...form.register('link')} placeholder="Optional direct offer link (https://...)" disabled={isSaving} />
               {form.formState.errors.link && <p className="text-sm text-destructive">{form.formState.errors.link.message}</p>}
             </div>

             <div className="space-y-2">
               <Label htmlFor="expiryDate">Expiry Date</Label>
                <Controller
                    control={form.control}
                    name="expiryDate"
                    render={({ field }) => (
                        <Popover>
                            <PopoverTrigger asChild>
                                <Button
                                variant={"outline"}
                                className={cn(
                                    "w-full justify-start text-left font-normal h-10",
                                    !field.value && "text-muted-foreground"
                                )}
                                disabled={isSaving}
                                >
                                <CalendarIcon className="mr-2 h-4 w-4" />
                                {field.value ? format(field.value, "PPP") : <span>Optional: Pick a date</span>}
                                </Button>
                            </PopoverTrigger>
                            <PopoverContent className="w-auto p-0">
                                <Calendar
                                mode="single"
                                selected={field.value ?? undefined}
                                onSelect={(date) => field.onChange(date ?? null)}
                                initialFocus
                                />
                            </PopoverContent>
                        </Popover>
                    )}
                />
             </div>

             <div className="space-y-4">
                 <div className="flex items-center space-x-2">
                     <Controller
                        control={form.control}
                        name="isFeatured"
                        render={({ field }) => (
                            <Checkbox
                               id="isFeatured"
                               checked={field.value}
                               onCheckedChange={field.onChange}
                               disabled={isSaving}
                            />
                        )}
                     />
                     <Label htmlFor="isFeatured" className="font-normal">Featured Coupon (highlighted)</Label>
                 </div>
                 <div className="flex items-center space-x-2">
                      <Controller
                         control={form.control}
                         name="isActive"
                         render={({ field }) => (
                             <Checkbox
                                id="isActive"
                                checked={field.value}
                                onCheckedChange={field.onChange}
                                disabled={isSaving}
                             />
                         )}
                      />
                     <Label htmlFor="isActive" className="font-normal">Active (visible to users)</Label>
                 </div>
             </div>

             {form.formState.errors.code && form.formState.errors.code.type === 'refine' && (
               <Alert variant="destructive">
                 <AlertCircle className="h-4 w-4" />
                 <AlertTitle>Input Required</AlertTitle>
                 <AlertDescription>{form.formState.errors.code.message}</AlertDescription>
               </Alert>
             )}

             <div className="flex justify-end gap-2 pt-4">
               <Button type="button" variant="outline" onClick={() => router.push('/admin/coupons')} disabled={isSaving}>
                 Cancel
               </Button>
               <Button type="submit" disabled={isSaving || loadingStores}>
                 {isSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <PlusCircle className="mr-2 h-4 w-4" />}
                 Add Coupon
               </Button>
             </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}

export default function AddCouponPage() {
  return (
    <AdminGuard>
      <AddCouponPageContent />
    </AdminGuard>
  );
}
