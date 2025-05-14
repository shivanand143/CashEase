
"use client";

import * as React from 'react';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { collection, addDoc, serverTimestamp, getDocs, query, orderBy } from 'firebase/firestore';
import { db } from '@/lib/firebase/config';
import type { Store, CashbackType, Category, StoreFormValues as StoreFormType } from '@/lib/types';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { AlertCircle, Loader2, ArrowLeft, PlusCircle } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import AdminGuard from '@/components/guards/admin-guard';
import Image from 'next/image';
import Link from 'next/link';
import { MultiSelect } from '@/components/ui/multi-select';


// Zod schema for store form validation (same as in stores/page.tsx)
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

function AddStorePageContent() {
  const router = useRouter();
  const { toast } = useToast();
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [categoriesList, setCategoriesList] = useState<{ value: string; label: string }[]>([]);
  const [loadingCategories, setLoadingCategories] = useState(true);

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
      isTodaysDeal: false, // Default for new stores
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
           value: doc.id,
           label: doc.data().name || doc.id,
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


  const onSubmit = async (data: StoreFormValues) => {
    setIsSaving(true);
    setError(null);

    const submissionData: Partial<StoreFormType> = Object.fromEntries(
      Object.entries(data).map(([key, value]) => [key, value === '' ? null : value])
    );
    submissionData.slug = data.slug || data.name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');


    try {
      const storesCollection = collection(db, 'stores');
      await addDoc(storesCollection, {
        ...submissionData,
        isTodaysDeal: !!data.isTodaysDeal, // Ensure boolean
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      toast({
        title: "Store Added",
        description: `Store "${data.name}" created successfully.`,
      });
      router.push('/admin/stores');

    } catch (err) {
      console.error("Error adding store:", err);
      const errorMsg = err instanceof Error ? err.message : "Could not add the store.";
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
            <Link href="/admin/stores">
               <ArrowLeft className="h-4 w-4" />
               <span className="sr-only">Back to Stores</span>
            </Link>
         </Button>
         <h1 className="text-3xl font-bold">Add New Store</h1>
        </div>

      <Card>
        <CardHeader>
          <CardTitle>Store Details</CardTitle>
          <CardDescription>Enter the information for the new store.</CardDescription>
        </CardHeader>
        <CardContent>
          {error && (
            <Alert variant="destructive" className="mb-6">
              <AlertCircle className="h-4 w-4" />
              <AlertTitle>Error</AlertTitle>
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
          <form onSubmit={form.handleSubmit(onSubmit)} className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-4">

             {/* Column 1 */}
             <div className="space-y-4">
                <div className="space-y-1">
                  <Label htmlFor="name">Name*</Label>
                  <Input id="name" {...form.register('name')} disabled={isSaving} />
                  {form.formState.errors.name && <p className="text-sm text-destructive">{form.formState.errors.name.message}</p>}
                </div>

                <div className="space-y-1">
                  <Label htmlFor="slug">Slug (URL Identifier)</Label>
                  <Input id="slug" {...form.register('slug')} placeholder="auto-generated from name if blank" disabled={isSaving} />
                  {form.formState.errors.slug && <p className="text-sm text-destructive">{form.formState.errors.slug.message}</p>}
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
                        name="isTodaysDeal"
                        render={({ field }) => (
                           <Checkbox id="isTodaysDeal" checked={field.value} onCheckedChange={field.onChange} disabled={isSaving} />
                        )}
                    />
                    <Label htmlFor="isTodaysDeal" className="font-normal">Today's Deal Store (highlight)</Label>
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

             <div className="md:col-span-2 flex justify-end gap-2 pt-4">
                <Button type="button" variant="outline" onClick={() => router.push('/admin/stores')} disabled={isSaving}>
                   Cancel
                </Button>
               <Button type="submit" disabled={isSaving || loadingCategories}>
                 {isSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <PlusCircle className="mr-2 h-4 w-4"/>}
                 Add Store
               </Button>
             </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}

export default function AddStorePage() {
  return (
    <AdminGuard>
      <AddStorePageContent />
    </AdminGuard>
  );
}
