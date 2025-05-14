
"use client";

import * as React from 'react';
import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { collection, addDoc, serverTimestamp, getDocs, query, orderBy } from 'firebase/firestore';
import { db, firebaseInitializationError } from '@/lib/firebase/config';
import type { ProductFormValues, Store, Category } from '@/lib/types';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { AlertCircle, Loader2, ArrowLeft, PlusCircle } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import AdminGuard from '@/components/guards/admin-guard';
import Image from 'next/image';

// Zod schema for product form validation (same as products/page.tsx)
const productSchema = z.object({
  storeId: z.string().min(1, 'Store is required'),
  name: z.string().min(3, 'Product name too short').max(150, 'Product name too long'),
  description: z.string().max(1000, "Description too long").optional().nullable(),
  imageUrl: z.string().url('Invalid Image URL').optional().nullable().or(z.literal('')),
  affiliateLink: z.string().url('Invalid Affiliate URL'),
  price: z.number().min(0).optional().nullable(),
  priceDisplay: z.string().max(50, "Price display too long").optional().nullable(),
  category: z.string().optional().nullable(),
  brand: z.string().max(50, "Brand name too long").optional().nullable(),
  sku: z.string().max(50, "SKU too long").optional().nullable(),
  isActive: z.boolean().default(true),
  isFeatured: z.boolean().default(false),
  dataAiHint: z.string().max(50, "AI Hint too long").optional().nullable(),
});

type ProductFormValuesType = z.infer<typeof productSchema>;

function AddProductPageContent() {
  const router = useRouter();
  const { toast } = useToast();
  const [isSaving, setIsSaving] = useState(false);
  const [pageError, setPageError] = useState<string | null>(null); // Renamed from error
  const [storeList, setStoreList] = useState<{ id: string; name: string }[]>([]);
  const [categoryList, setCategoryList] = useState<{ id: string; name: string; slug: string }[]>([]);
  const [loadingOptions, setLoadingOptions] = useState(true);

  const form = useForm<ProductFormValuesType>({
    resolver: zodResolver(productSchema),
    defaultValues: {
      storeId: '',
      name: '',
      description: '',
      imageUrl: '',
      affiliateLink: '',
      price: null,
      priceDisplay: '',
      category: '',
      brand: '',
      sku: '',
      isActive: true,
      isFeatured: false,
      dataAiHint: '',
    },
  });

  // Fetch stores and categories for dropdowns
  useEffect(() => {
    const fetchSelectOptions = async () => {
      setLoadingOptions(true);
      if (!db || firebaseInitializationError) {
        setPageError(firebaseInitializationError || "Database not available for fetching options.");
        setLoadingOptions(false);
        return;
      }
      try {
        const storesSnap = await getDocs(query(collection(db, 'stores'), orderBy('name')));
        setStoreList(storesSnap.docs.map(doc => ({ id: doc.id, name: doc.data().name })));

        const categoriesSnap = await getDocs(query(collection(db, 'categories'), orderBy('name')));
        setCategoryList(categoriesSnap.docs.map(doc => ({ id: doc.id, name: doc.data().name, slug: doc.data().slug })));
      } catch (err) {
        console.error("Error fetching stores/categories for product form:", err);
        toast({ variant: "destructive", title: "Error", description: "Could not load store/category options." });
      } finally {
        setLoadingOptions(false);
      }
    };
    fetchSelectOptions();
  }, [toast]);

  const onSubmit = async (data: ProductFormValuesType) => {
    setIsSaving(true);
    setPageError(null);
    if (!db) {
        setPageError("Database not available.");
        setIsSaving(false);
        return;
    }

    const submissionData: Partial<ProductFormValues> = Object.fromEntries(
      Object.entries(data).map(([key, value]) => [key, value === '' ? null : value])
    );
    submissionData.isFeatured = !!data.isFeatured;
    submissionData.isActive = !!data.isActive;

    try {
      const productsCollection = collection(db, 'products');
      await addDoc(productsCollection, {
        ...submissionData,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      toast({
        title: "Product Added",
        description: `Product "${data.name}" created successfully.`,
      });
      router.push('/admin/products');
    } catch (err) {
      console.error("Error adding product:", err);
      const errorMsg = err instanceof Error ? err.message : "Could not add the product.";
      setPageError(errorMsg);
      toast({ variant: "destructive", title: "Save Failed", description: errorMsg });
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="outline" size="icon" asChild>
          <Link href="/admin/products"><ArrowLeft className="h-4 w-4" /><span className="sr-only">Back</span></Link>
        </Button>
        <h1 className="text-3xl font-bold">Add New Product</h1>
      </div>

      <Card>
        <CardHeader><CardTitle>Product Details</CardTitle><CardDescription>Enter information for the new product.</CardDescription></CardHeader>
        <CardContent>
          {pageError && (
            <Alert variant="destructive" className="mb-6"><AlertCircle className="h-4 w-4" /><AlertTitle>Error</AlertTitle><AlertDescription>{pageError}</AlertDescription></Alert>
          )}
          <form onSubmit={form.handleSubmit(onSubmit)} className="grid md:grid-cols-2 gap-x-6 gap-y-4">
            {/* Store Selector */}
            <div className="space-y-1 md:col-span-1">
              <Label htmlFor="storeId">Store*</Label>
              <Controller name="storeId" control={form.control} render={({ field }) => (
                <Select value={field.value} onValueChange={field.onChange} disabled={isSaving || loadingOptions}>
                  <SelectTrigger><SelectValue placeholder={loadingOptions ? "Loading..." : "Select store"} /></SelectTrigger>
                  <SelectContent>{storeList.map(s => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}</SelectContent>
                </Select>
              )} />
              {form.formState.errors.storeId && <p className="text-sm text-destructive">{form.formState.errors.storeId.message}</p>}
            </div>
            {/* Category Selector */}
            <div className="space-y-1 md:col-span-1">
              <Label htmlFor="category">Category</Label>
              <Controller name="category" control={form.control} render={({ field }) => (
                <Select value={field.value || ''} onValueChange={field.onChange} disabled={isSaving || loadingOptions}>
                  <SelectTrigger><SelectValue placeholder={loadingOptions ? "Loading..." : "Select category"} /></SelectTrigger>
                  <SelectContent>{categoryList.map(c => <SelectItem key={c.id} value={c.slug}>{c.name}</SelectItem>)}</SelectContent>
                </Select>
              )} />
            </div>
            {/* Name */}
            <div className="space-y-1 md:col-span-2">
              <Label htmlFor="name">Product Name*</Label>
              <Input id="name" {...form.register('name')} disabled={isSaving} />
              {form.formState.errors.name && <p className="text-sm text-destructive">{form.formState.errors.name.message}</p>}
            </div>
            {/* Image URL */}
            <div className="space-y-1 md:col-span-2">
              <Label htmlFor="imageUrl">Image URL</Label>
              <Input id="imageUrl" {...form.register('imageUrl')} placeholder="https://..." disabled={isSaving} />
              {form.watch('imageUrl') && <Image src={form.watch('imageUrl')!} alt="Preview" width={80} height={80} className="mt-1 object-contain border rounded-sm"/>}
              {form.formState.errors.imageUrl && <p className="text-sm text-destructive">{form.formState.errors.imageUrl.message}</p>}
            </div>
            {/* Affiliate Link */}
            <div className="space-y-1 md:col-span-2">
              <Label htmlFor="affiliateLink">Affiliate Link*</Label>
              <Input id="affiliateLink" {...form.register('affiliateLink')} placeholder="https://..." disabled={isSaving} />
              {form.formState.errors.affiliateLink && <p className="text-sm text-destructive">{form.formState.errors.affiliateLink.message}</p>}
            </div>
            {/* Price & Price Display */}
            <div className="grid grid-cols-2 gap-4 md:col-span-2">
                <div className="space-y-1">
                  <Label htmlFor="price">Price (Numeric, Optional)</Label>
                  <Input id="price" type="number" step="0.01" {...form.register('price', { valueAsNumber: true, setValueAs: v => v === null || v === '' ? null : parseFloat(v) })} disabled={isSaving} />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="priceDisplay">Price Display (e.g., ₹199)</Label>
                  <Input id="priceDisplay" {...form.register('priceDisplay')} disabled={isSaving} />
                </div>
            </div>
            {/* Brand & SKU */}
            <div className="grid grid-cols-2 gap-4 md:col-span-2">
              <div className="space-y-1"><Label htmlFor="brand">Brand</Label><Input id="brand" {...form.register('brand')} disabled={isSaving} /></div>
              <div className="space-y-1"><Label htmlFor="sku">SKU</Label><Input id="sku" {...form.register('sku')} disabled={isSaving} /></div>
            </div>
            {/* Description */}
            <div className="space-y-1 md:col-span-2">
              <Label htmlFor="description">Description</Label>
              <Textarea id="description" {...form.register('description')} rows={3} disabled={isSaving} />
            </div>
            {/* Data AI Hint */}
            <div className="space-y-1 md:col-span-2">
                <Label htmlFor="dataAiHint">Image AI Hint</Label>
                <Input id="dataAiHint" {...form.register('dataAiHint')} placeholder="Keywords for image (e.g., product name)" disabled={isSaving} />
            </div>
            {/* Flags */}
            <div className="md:col-span-2 space-y-3 pt-2">
              <div className="flex items-center space-x-2"><Controller name="isActive" control={form.control} render={({ field }) => (<Checkbox id="isActive" checked={field.value} onCheckedChange={field.onChange} disabled={isSaving} />)} /><Label htmlFor="isActive" className="font-normal">Active (Visible to users)</Label></div>
              <div className="flex items-center space-x-2"><Controller name="isFeatured" control={form.control} render={({ field }) => (<Checkbox id="isFeatured" checked={field.value} onCheckedChange={field.onChange} disabled={isSaving} />)} /><Label htmlFor="isFeatured" className="font-normal">Featured Product</Label></div>
            </div>

            <div className="md:col-span-2 flex justify-end gap-2 pt-4">
              <Button type="button" variant="outline" onClick={() => router.push('/admin/products')} disabled={isSaving}>Cancel</Button>
              <Button type="submit" disabled={isSaving || loadingOptions}>{isSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <PlusCircle className="mr-2 h-4 w-4" />}Add Product</Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}

export default function AddProductPage() {
  return <AdminGuard><AddProductPageContent /></AdminGuard>;
}
