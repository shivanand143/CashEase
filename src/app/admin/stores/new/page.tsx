
"use client";

import * as React from 'react';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { collection, addDoc, serverTimestamp, getDocs, query, orderBy } from 'firebase/firestore';
import { db } from '@/lib/firebase/config';
import type { Store, CashbackType, Category } from '@/lib/types';
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
import { MultiSelect } from '@/components/ui/multi-select'; // Assuming a MultiSelect component exists


// Zod schema for store form validation (same as in stores/page.tsx)
const storeSchema = z.object({
  name: z.string().min(2, 'Store name must be at least 2 characters').max(100, 'Store name too long'),
  affiliateLink: z.string().url('Invalid URL format'),
  cashbackRate: z.string().min(1, 'Cashback rate display is required').max(50, 'Rate display too long'),
  cashbackRateValue: z.number().min(0, 'Cashback value must be non-negative'),
  cashbackType: z.enum(['percentage', 'fixed']),
  description: z.string().min(10, 'Description must be at least 10 characters').max(500, 'Description too long'),
  logoUrl: z.string().url('Invalid URL format').optional().or(z.literal('')),
  categories: z.array(z.string()).min(1, 'At least one category is required'),
  terms: z.string().optional(),
  isFeatured: z.boolean().default(false),
  isActive: z.boolean().default(true),
  dataAiHint: z.string().max(50, 'AI Hint too long').optional(),
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


  const onSubmit = async (data: StoreFormValues) => {
    setIsSaving(true);
    setError(null);

    try {
      const storesCollection = collection(db, 'stores');
      await addDoc(storesCollection, {
        ...data,
        logoUrl: data.logoUrl || null,
        terms: data.terms || null,
        dataAiHint: data.dataAiHint || null,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      toast({
        title: "Store Added",
        description: `Store "${data.name}" created successfully.`,
      });
      router.push('/admin/stores'); // Redirect back to the stores list

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
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
             {/* Store Name */}
             <div className="space-y-2">
               <Label htmlFor="name">Store Name*</Label>
               <Input id="name" {...form.register('name')} disabled={isSaving} />
               {form.formState.errors.name && <p className="text-sm text-destructive">{form.formState.errors.name.message}</p>}
             </div>

              {/* Logo URL */}
             <div className="space-y-2">
               <Label htmlFor="logoUrl">Logo URL</Label>
               <Input id="logoUrl" {...form.register('logoUrl')} placeholder="https://..." disabled={isSaving} />
                {form.watch('logoUrl') && (
                    <div className="mt-2">
                        <Image src={form.watch('logoUrl')!} alt="Logo Preview" width={80} height={40} className="object-contain border rounded-sm" />
                    </div>
                )}
               {form.formState.errors.logoUrl && <p className="text-sm text-destructive">{form.formState.errors.logoUrl.message}</p>}
             </div>

             {/* Affiliate Link */}
             <div className="space-y-2">
               <Label htmlFor="affiliateLink">Affiliate Link*</Label>
               <Input id="affiliateLink" {...form.register('affiliateLink')} placeholder="https://..." disabled={isSaving} />
               {form.formState.errors.affiliateLink && <p className="text-sm text-destructive">{form.formState.errors.affiliateLink.message}</p>}
             </div>

             {/* Cashback Rate Display */}
             <div className="space-y-2">
               <Label htmlFor="cashbackRate">Rate Display*</Label>
               <Input id="cashbackRate" {...form.register('cashbackRate')} placeholder="e.g., Up to 5% or Flat ₹100" disabled={isSaving} />
               {form.formState.errors.cashbackRate && <p className="text-sm text-destructive">{form.formState.errors.cashbackRate.message}</p>}
             </div>

              {/* Cashback Rate Value & Type */}
             <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="space-y-2 md:col-span-2">
                   <Label htmlFor="cashbackRateValue">Rate Value*</Label>
                   <Input
                     id="cashbackRateValue"
                     type="number"
                     step="0.01"
                     {...form.register('cashbackRateValue', { valueAsNumber: true })}
                     disabled={isSaving}
                   />
                   {form.formState.errors.cashbackRateValue && <p className="text-sm text-destructive">{form.formState.errors.cashbackRateValue.message}</p>}
                </div>
                 <div className="space-y-2">
                    <Label htmlFor="cashbackType">Rate Type*</Label>
                    <Select
                      value={form.watch('cashbackType')}
                      onValueChange={(value) => form.setValue('cashbackType', value as CashbackType)}
                       disabled={isSaving}
                    >
                      <SelectTrigger id="cashbackType">
                        <SelectValue placeholder="Type" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="percentage">%</SelectItem>
                        <SelectItem value="fixed">₹ (Fixed)</SelectItem>
                      </SelectContent>
                    </Select>
                     {form.formState.errors.cashbackType && <p className="text-sm text-destructive">{form.formState.errors.cashbackType.message}</p>}
                 </div>
             </div>

             {/* Description */}
             <div className="space-y-2">
               <Label htmlFor="description">Description*</Label>
               <Textarea id="description" {...form.register('description')} rows={4} disabled={isSaving} />
               {form.formState.errors.description && <p className="text-sm text-destructive">{form.formState.errors.description.message}</p>}
             </div>

             {/* Categories */}
             <div className="space-y-2">
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


             {/* Terms */}
             <div className="space-y-2">
               <Label htmlFor="terms">Terms</Label>
               <Textarea id="terms" {...form.register('terms')} rows={3} placeholder="Optional terms and conditions" disabled={isSaving} />
             </div>

             {/* AI Hint */}
             <div className="space-y-2">
               <Label htmlFor="dataAiHint">AI Hint</Label>
               <Input id="dataAiHint" {...form.register('dataAiHint')} placeholder="Optional keywords for AI (e.g., fashion sale)" disabled={isSaving} />
             </div>

              {/* Flags: Featured & Active */}
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
                      <Label htmlFor="isFeatured" className="font-normal">Featured Store (highlight on homepage)</Label>
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

             <div className="flex justify-end gap-2 pt-4">
                <Button type="button" variant="outline" onClick={() => router.push('/admin/stores')} disabled={isSaving}>
                   Cancel
                </Button>
               <Button type="submit" disabled={isSaving}>
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
