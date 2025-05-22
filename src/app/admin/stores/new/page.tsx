
// src/app/admin/stores/new/page.tsx
"use client";

import * as React from 'react';
import { useState, useEffect } from 'react'; // Added useState here
import { useRouter } from 'next/navigation';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { collection, addDoc, serverTimestamp, query, orderBy, getDocs, where, getDoc, limit } from 'firebase/firestore';
import { db, firebaseInitializationError } from '@/lib/firebase/config';
import type { StoreFormValues, Category, CashbackType } from '@/lib/types';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { ArrowLeft, Loader2, PlusCircle, UploadCloud, Store as StoreIcon } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import AdminGuard from '@/components/guards/admin-guard';
import { MultiSelect } from '@/components/ui/multi-select';
import Image from 'next/image';

const storeSchema = z.object({
  name: z.string().min(2, 'Store name must be at least 2 characters').max(100, 'Store name too long'),
  slug: z.string().min(2, 'Slug must be at least 2 characters').max(50, 'Slug too long').regex(/^[a-z0-9-]+$/, 'Slug can only contain lowercase letters, numbers, and hyphens').optional().nullable(),
  logoUrl: z.string().url('Invalid URL format').optional().or(z.literal('')).nullable(),
  heroImageUrl: z.string().url('Invalid URL format').optional().or(z.literal('')).nullable(),
  affiliateLink: z.string().url('Invalid URL format'),
  cashbackRate: z.string().min(1, 'Cashback rate display is required').max(50, 'Rate display too long'),
  cashbackRateValue: z.number().min(0, 'Cashback value must be non-negative'),
  cashbackType: z.enum(['percentage', 'fixed'] as [CashbackType, ...CashbackType[]]), // Ensures at least one value
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
  isTodaysDeal: z.boolean().default(false),
  dataAiHint: z.string().max(50, 'AI Hint too long').optional().nullable(),
});

function AddStorePageSkeleton() {
  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Skeleton className="h-10 w-10 rounded-md" /> {/* Back Button */}
        <Skeleton className="h-9 w-1/2" /> {/* Title */}
      </div>
      <Card>
        <CardHeader><Skeleton className="h-7 w-1/3 mb-1" /><Skeleton className="h-4 w-2/3" /></CardHeader>
        <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-4">
          {Array.from({ length: 10 }).map((_, index) => (
            <div key={`store-form-skel-${index}`} className="space-y-1 md:col-span-1">
              <Skeleton className="h-4 w-1/4" /><Skeleton className="h-10 w-full" />
            </div>
          ))}
          <div className="md:col-span-2 space-y-3 pt-2"><Skeleton className="h-5 w-1/2" /><Skeleton className="h-5 w-1/2" /></div>
          <div className="md:col-span-2 flex justify-end gap-2 pt-4"><Skeleton className="h-10 w-24" /><Skeleton className="h-10 w-32" /></div>
        </CardContent>
      </Card>
    </div>
  );
}

export default function AddStorePage() {
  const router = useRouter();
  const { toast } = useToast();
  const [isSaving, setIsSaving] = useState(false);
  const [categoriesList, setCategoriesList] = useState<{ value: string; label: string }[]>([]);
  const [loadingCategories, setLoadingCategories] = useState(true);

  const form = useForm<StoreFormValues>({
    resolver: zodResolver(storeSchema),
    defaultValues: {
      name: '', slug: '', logoUrl: '', heroImageUrl: '', affiliateLink: '',
      cashbackRate: '', cashbackRateValue: 0, cashbackType: 'percentage',
      description: '', detailedDescription: '', categories: [], rating: null, ratingCount: null,
      cashbackTrackingTime: null, cashbackConfirmationTime: null, cashbackOnAppOrders: false,
      detailedCashbackRatesLink: null, topOffersText: null, offerDetailsLink: null,
      terms: '', isFeatured: false, isActive: true, isTodaysDeal: false, dataAiHint: '',
    },
  });

  useEffect(() => {
    let isMounted = true;
    const fetchCategories = async () => {
      if (!isMounted) return;
      if (!db || firebaseInitializationError) {
        if (isMounted) {
          toast({ variant: "destructive", title: "Error", description: firebaseInitializationError || "Database not available." });
          setLoadingCategories(false);
        }
        return;
      }
      setLoadingCategories(true);
      try {
        const categoriesCollection = collection(db, 'categories');
        const q = query(categoriesCollection, where('isActive', '==', true), orderBy('name', 'asc'));
        const querySnapshot = await getDocs(q);
        if (isMounted) {
          setCategoriesList(querySnapshot.docs.map(doc => ({ value: doc.id, label: doc.data().name || doc.id })));
        }
      } catch (err) {
        if (isMounted) toast({ variant: "destructive", title: "Error", description: "Could not load categories." });
      } finally {
        if (isMounted) setLoadingCategories(false);
      }
    };
    fetchCategories();
    return () => { isMounted = false; };
  }, [toast]);

  const generateSlugFromName = (name: string) => {
    return name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
  };

  useEffect(() => {
      const subscription = form.watch((value, { name }) => {
        if (name === "name") {
          const newSlug = generateSlugFromName(value.name || "");
          if (form.getValues("slug") !== newSlug) {
            form.setValue("slug", newSlug, { shouldValidate: true });
          }
        }
      });
      return () => subscription.unsubscribe();
  }, [form]);

  const onSubmit = async (data: StoreFormValues) => {
    if (!db || firebaseInitializationError) {
      toast({ variant: "destructive", title: "Error", description: firebaseInitializationError || "Database not available." });
      return;
    }
    setIsSaving(true);

    const slugToSave = data.slug || generateSlugFromName(data.name);

    // Check if slug already exists
    if (slugToSave) {
        const storeRefBySlug = query(collection(db, 'stores'), where('slug', '==', slugToSave), limit(1));
        const slugSnapshot = await getDocs(storeRefBySlug);
        if (!slugSnapshot.empty) {
            form.setError('slug', { type: 'manual', message: 'This slug is already in use. Please choose a unique one or leave it blank to auto-generate.' });
            setIsSaving(false);
            return;
        }
    }


    const submissionData = {
      ...data,
      slug: slugToSave || null, // Ensure slug is null if not provided or generated empty
      logoUrl: data.logoUrl || null,
      heroImageUrl: data.heroImageUrl || null,
      detailedDescription: data.detailedDescription || null,
      rating: data.rating ?? null,
      ratingCount: data.ratingCount ?? null,
      cashbackTrackingTime: data.cashbackTrackingTime || null,
      cashbackConfirmationTime: data.cashbackConfirmationTime || null,
      cashbackOnAppOrders: data.cashbackOnAppOrders ?? false,
      detailedCashbackRatesLink: data.detailedCashbackRatesLink || null,
      topOffersText: data.topOffersText || null,
      offerDetailsLink: data.offerDetailsLink || null,
      terms: data.terms || null,
      dataAiHint: data.dataAiHint || null,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    };

    try {
      await addDoc(collection(db, 'stores'), submissionData);
      toast({ title: "Store Added", description: `${data.name} has been successfully created.` });
      router.push('/admin/stores');
    } catch (err) {
      console.error("Error adding store:", err);
      toast({ variant: "destructive", title: "Save Failed", description: err instanceof Error ? err.message : "Could not add store." });
    } finally {
      setIsSaving(false);
    }
  };

  if (loadingCategories && categoriesList.length === 0) {
      return <AdminGuard><AddStorePageSkeleton /></AdminGuard>;
  }


  return (
    <AdminGuard>
      <div className="space-y-6">
        <div className="flex items-center gap-4">
          <Button variant="outline" size="icon" onClick={() => router.back()} aria-label="Go back">
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <h1 className="text-2xl sm:text-3xl font-bold flex items-center gap-2"><StoreIcon className="w-6 h-6 sm:w-7 sm:h-7" /> Add New Store</h1>
        </div>

        <Card className="shadow-lg border">
          <CardHeader>
            <CardTitle>Store Details</CardTitle>
            <CardDescription>Fill in the information for the new store.</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={form.handleSubmit(onSubmit)} className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-4">
              {/* Column 1 */}
              <div className="space-y-4">
                <div className="space-y-1">
                  <Label htmlFor="name">Name*</Label>
                  <Input id="name" {...form.register('name')} disabled={isSaving} />
                  {form.formState.errors.name && <p className="text-sm text-destructive">{form.formState.errors.name.message}</p>}
                </div>
                <div className="space-y-1">
                  <Label htmlFor="slug">Slug (auto-generated or custom)</Label>
                  <Input id="slug" {...form.register('slug')} placeholder="e.g., my-awesome-store" disabled={isSaving} />
                  {form.formState.errors.slug && <p className="text-sm text-destructive">{form.formState.errors.slug.message}</p>}
                </div>
                <div className="space-y-1">
                  <Label htmlFor="logoUrl">Logo URL</Label>
                  <Input id="logoUrl" {...form.register('logoUrl')} placeholder="https://..." disabled={isSaving} />
                   {form.watch('logoUrl') && <Image src={form.watch('logoUrl')!} alt="Logo Preview" width={100} height={50} className="mt-2 object-contain border rounded-sm bg-muted p-1" data-ai-hint="store logo preview"/>}
                  {form.formState.errors.logoUrl && <p className="text-sm text-destructive">{form.formState.errors.logoUrl.message}</p>}
                </div>
                <div className="space-y-1">
                  <Label htmlFor="heroImageUrl">Hero Image URL</Label>
                  <Input id="heroImageUrl" {...form.register('heroImageUrl')} placeholder="https://..." disabled={isSaving} />
                  {form.watch('heroImageUrl') && <Image src={form.watch('heroImageUrl')!} alt="Hero Preview" width={200} height={100} className="mt-2 object-cover border rounded-sm aspect-video" data-ai-hint="store hero image preview"/>}
                  {form.formState.errors.heroImageUrl && <p className="text-sm text-destructive">{form.formState.errors.heroImageUrl.message}</p>}
                </div>
                 <div className="space-y-1">
                  <Label htmlFor="dataAiHint">Logo AI Hint (for placeholder)</Label>
                  <Input id="dataAiHint" {...form.register('dataAiHint')} placeholder="e.g., fashion brand" disabled={isSaving} />
                   {form.formState.errors.dataAiHint && <p className="text-sm text-destructive">{form.formState.errors.dataAiHint.message}</p>}
                </div>
                <div className="space-y-1">
                  <Label htmlFor="affiliateLink">Affiliate Link* (use {"{CLICK_ID}"} for click ID)</Label>
                  <Input id="affiliateLink" {...form.register('affiliateLink')} placeholder="https://...&subid={CLICK_ID}" disabled={isSaving} />
                  {form.formState.errors.affiliateLink && <p className="text-sm text-destructive">{form.formState.errors.affiliateLink.message}</p>}
                </div>
                <div className="space-y-1">
                  <Label htmlFor="cashbackRate">Cashback Rate Display*</Label>
                  <Input id="cashbackRate" {...form.register('cashbackRate')} placeholder="e.g., Up to 5% or Flat ₹100" disabled={isSaving} />
                  {form.formState.errors.cashbackRate && <p className="text-sm text-destructive">{form.formState.errors.cashbackRate.message}</p>}
                </div>
                <div className="grid grid-cols-3 gap-2 items-end">
                    <div className="space-y-1 col-span-2">
                      <Label htmlFor="cashbackRateValue">Numerical Rate Value*</Label>
                      <Input id="cashbackRateValue" type="number" step="0.01" {...form.register('cashbackRateValue', { valueAsNumber: true })} disabled={isSaving}/>
                      {form.formState.errors.cashbackRateValue && <p className="text-sm text-destructive">{form.formState.errors.cashbackRateValue.message}</p>}
                    </div>
                    <div className="space-y-1">
                        <Label htmlFor="cashbackType">Type*</Label>
                        <Controller name="cashbackType" control={form.control} render={({ field }) => (
                            <Select value={field.value} onValueChange={field.onChange} disabled={isSaving}>
                            <SelectTrigger id="cashbackType"><SelectValue /></SelectTrigger>
                            <SelectContent><SelectItem value="percentage">% (Percentage)</SelectItem><SelectItem value="fixed">₹ (Fixed)</SelectItem></SelectContent>
                            </Select>
                        )}/>
                         {form.formState.errors.cashbackType && <p className="text-sm text-destructive">{form.formState.errors.cashbackType.message}</p>}
                    </div>
                </div>
                <div className="space-y-1">
                  <Label htmlFor="description">Short Description* (for cards)</Label>
                  <Textarea id="description" {...form.register('description')} rows={2} disabled={isSaving} />
                  {form.formState.errors.description && <p className="text-sm text-destructive">{form.formState.errors.description.message}</p>}
                </div>
                 <div className="space-y-1">
                  <Label htmlFor="detailedDescription">Detailed Description (for store page)</Label>
                  <Textarea id="detailedDescription" {...form.register('detailedDescription')} rows={4} disabled={isSaving} />
                  {form.formState.errors.detailedDescription && <p className="text-sm text-destructive">{form.formState.errors.detailedDescription.message}</p>}
                </div>
              </div>

              {/* Column 2 */}
              <div className="space-y-4">
                <div className="space-y-1">
                  <Label htmlFor="categories">Categories*</Label>
                  <Controller control={form.control} name="categories"
                      render={({ field }) => (
                          <MultiSelect options={categoriesList} selected={field.value} onChange={field.onChange} isLoading={loadingCategories} disabled={isSaving || loadingCategories} placeholder="Select categories..." />
                      )}
                  />
                  {form.formState.errors.categories && <p className="text-sm text-destructive">{form.formState.errors.categories.message}</p>}
                </div>
                 <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1">
                        <Label htmlFor="rating">Rating (0-5)</Label>
                        <Input id="rating" type="number" step="0.1" {...form.register('rating', { setValueAs: v => v === null || v === '' ? null : parseFloat(v) })} disabled={isSaving} />
                        {form.formState.errors.rating && <p className="text-sm text-destructive">{form.formState.errors.rating.message}</p>}
                    </div>
                    <div className="space-y-1">
                        <Label htmlFor="ratingCount">Rating Count</Label>
                        <Input id="ratingCount" type="number" {...form.register('ratingCount', { setValueAs: v => v === null || v === '' ? null : parseInt(v, 10) })} disabled={isSaving} />
                         {form.formState.errors.ratingCount && <p className="text-sm text-destructive">{form.formState.errors.ratingCount.message}</p>}
                    </div>
                </div>
                <div className="space-y-1">
                    <Label htmlFor="cashbackTrackingTime">Cashback Tracking Time</Label>
                    <Input id="cashbackTrackingTime" {...form.register('cashbackTrackingTime')} placeholder="e.g., 36 Hours" disabled={isSaving} />
                     {form.formState.errors.cashbackTrackingTime && <p className="text-sm text-destructive">{form.formState.errors.cashbackTrackingTime.message}</p>}
                </div>
                <div className="space-y-1">
                    <Label htmlFor="cashbackConfirmationTime">Confirmation Time</Label>
                    <Input id="cashbackConfirmationTime" {...form.register('cashbackConfirmationTime')} placeholder="e.g., 35-70 Days" disabled={isSaving} />
                     {form.formState.errors.cashbackConfirmationTime && <p className="text-sm text-destructive">{form.formState.errors.cashbackConfirmationTime.message}</p>}
                </div>
                <div className="flex items-center space-x-2 pt-1">
                    <Controller control={form.control} name="cashbackOnAppOrders" render={({ field }) => ( <Checkbox id="cashbackOnAppOrders" checked={field.value ?? false} onCheckedChange={field.onChange} disabled={isSaving} /> )}/>
                    <Label htmlFor="cashbackOnAppOrders" className="font-normal">Cashback on App Orders?</Label>
                </div>
                <div className="space-y-1">
                  <Label htmlFor="detailedCashbackRatesLink">Detailed Cashback Rates Link</Label>
                  <Input id="detailedCashbackRatesLink" type="url" {...form.register('detailedCashbackRatesLink')} placeholder="https://..." disabled={isSaving} />
                   {form.formState.errors.detailedCashbackRatesLink && <p className="text-sm text-destructive">{form.formState.errors.detailedCashbackRatesLink.message}</p>}
                </div>
                <div className="space-y-1">
                  <Label htmlFor="topOffersText">Top Offers Text (Bullet points, one per line)</Label>
                  <Textarea id="topOffersText" {...form.register('topOffersText')} rows={3} placeholder="e.g., - Up to 50% Off&#10;- Extra 10% for new users" disabled={isSaving} />
                   {form.formState.errors.topOffersText && <p className="text-sm text-destructive">{form.formState.errors.topOffersText.message}</p>}
                </div>
                <div className="space-y-1">
                  <Label htmlFor="offerDetailsLink">Offer Details Link</Label>
                  <Input id="offerDetailsLink" type="url" {...form.register('offerDetailsLink')} placeholder="https://..." disabled={isSaving} />
                  {form.formState.errors.offerDetailsLink && <p className="text-sm text-destructive">{form.formState.errors.offerDetailsLink.message}</p>}
                </div>
                <div className="space-y-1">
                  <Label htmlFor="terms">Terms & Conditions</Label>
                  <Textarea id="terms" {...form.register('terms')} rows={3} placeholder="Optional terms..." disabled={isSaving} />
                </div>
                <div className="space-y-3 pt-2">
                    <div className="flex items-center space-x-2">
                        <Controller control={form.control} name="isFeatured" render={({ field }) => ( <Checkbox id="isFeatured" checked={field.value} onCheckedChange={field.onChange} disabled={isSaving} /> )}/>
                        <Label htmlFor="isFeatured" className="font-normal">Featured Store</Label>
                    </div>
                    <div className="flex items-center space-x-2">
                        <Controller control={form.control} name="isTodaysDeal" render={({ field }) => ( <Checkbox id="isTodaysDeal" checked={field.value} onCheckedChange={field.onChange} disabled={isSaving} /> )}/>
                        <Label htmlFor="isTodaysDeal" className="font-normal">Mark as Today's Deal Store</Label>
                    </div>
                    <div className="flex items-center space-x-2">
                        <Controller control={form.control} name="isActive" render={({ field }) => ( <Checkbox id="isActive" checked={field.value} onCheckedChange={field.onChange} disabled={isSaving} /> )}/>
                        <Label htmlFor="isActive" className="font-normal">Active (Visible on site)</Label>
                    </div>
                </div>
              </div>

              <div className="md:col-span-2 flex flex-col sm:flex-row justify-end gap-2 pt-4 border-t">
                <Button type="button" variant="outline" onClick={() => router.back()} disabled={isSaving} className="w-full sm:w-auto">
                  Cancel
                </Button>
                <Button type="submit" disabled={isSaving || loadingCategories} className="w-full sm:w-auto">
                  {isSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <PlusCircle className="mr-2 h-4 w-4" />}
                  Add Store
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      </div>
    </AdminGuard>
  );
}
