
"use client";

import * as React from 'react';
import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { collection, addDoc, serverTimestamp, getDocs, query, orderBy, where } from 'firebase/firestore';
import { db, firebaseInitializationError } from '@/lib/firebase/config';
import type { ProductFormValues as ProductFormValuesType, Store, Category } from '@/lib/types';
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

// Zod schema for product form validation
const productSchema = z.object({
  storeId: z.string().min(1, 'Store is required'),
  name: z.string().min(3, 'Product name too short').max(150, 'Product name too long'),
  description: z.string().max(1000, "Description too long").optional().nullable(),
  imageUrl: z.string().url('Invalid Image URL').optional().nullable().or(z.literal('')),
  affiliateLink: z.string().url('Invalid Affiliate URL'),
  price: z.number().min(0, "Price must be non-negative").optional().nullable(),
  priceDisplay: z.string().max(50, "Price display too long").optional().nullable(),
  category: z.string().optional().nullable(), // Category slug
  brand: z.string().max(50, "Brand name too long").optional().nullable(),
  sku: z.string().max(50, "SKU too long").optional().nullable(),
  isActive: z.boolean().default(true),
  isFeatured: z.boolean().default(false),
  isTodaysPick: z.boolean().default(false), // New field
  dataAiHint: z.string().max(50, "AI Hint too long").optional().nullable(),
});

function AddProductPageContent() {
  const router = useRouter();
  const { toast } = useToast();
  const [isSaving, setIsSaving] = useState(false);
  const [pageError, setPageError] = useState<string | null>(null);
  const [storeList, setStoreList] = useState<{ id: string; name: string }[]>([]);
  const [categoryList, setCategoryList] = useState<{ slug: string; name: string }[]>([]);
  const [loadingOptions, setLoadingOptions] = useState(true);

  const form = useForm<ProductFormValuesType>({
    resolver: zodResolver(productSchema),
    defaultValues: {
      storeId: '',
      name: '',
      description: '',
      imageUrl: '',
      affiliateLink: '',
      price: undefined,
      priceDisplay: '',
      category: '',
      brand: '',
      sku: '',
      isActive: true,
      isFeatured: false,
      isTodaysPick: false, // Default value
      dataAiHint: '',
    },
  });

  useEffect(() => {
    const fetchSelectOptions = async () => {
      setLoadingOptions(true);
      if (!db || firebaseInitializationError) {
        setPageError(firebaseInitializationError || "Database not available for fetching options.");
        setLoadingOptions(false);
        return;
      }
      try {
        const storesSnap = await getDocs(query(collection(db, 'stores'), where('isActive', '==', true), orderBy('name')));
        setStoreList(storesSnap.docs.map(doc => ({ id: doc.id, name: doc.data().name })));

        const categoriesSnap = await getDocs(query(collection(db, 'categories'), where('isActive', '==', true), orderBy('name')));
        setCategoryList(categoriesSnap.docs.map(doc => ({ slug: doc.data().slug, name: doc.data().name })));
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

    const submissionData: Omit<ProductFormValuesType, 'price'> & { price?: number | null } = {
      ...data,
      price: data.price === undefined || isNaN(data.price as number) ? null : Number(data.price),
      imageUrl: data.imageUrl || null,
      description: data.description || null,
      priceDisplay: data.priceDisplay || null,
      category: data.category || null,
      brand: data.brand || null,
      sku: data.sku || null,
      dataAiHint: data.dataAiHint || null,
      isTodaysPick: !!data.isTodaysPick,
    };

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
          <Link href="/admin/products"><ArrowLeft className="h-4 w-4" /><span className="sr-only">Back to Products</span></Link>
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
                  <SelectTrigger id="storeId"><SelectValue placeholder={loadingOptions ? "Loading stores..." : "Select store"} /></SelectTrigger>
                  <SelectContent>{storeList.map(s => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}</SelectContent>
                </Select>
              )} />
              {form.formState.errors.storeId && <p className="text-sm text-destructive text-right">{form.formState.errors.storeId.message}</p>}
            </div>
            {/* Category Selector */}
            <div className="space-y-1 md:col-span-1">
              <Label htmlFor="category">Category</Label>
              <Controller name="category" control={form.control} render={({ field }) => (
                <Select value={field.value || ''} onValueChange={field.onChange} disabled={isSaving || loadingOptions}>
                  <SelectTrigger id="category"><SelectValue placeholder={loadingOptions ? "Loading categories..." : "Select category"} /></SelectTrigger>
                  <SelectContent>{categoryList.map(c => <SelectItem key={c.slug} value={c.slug}>{c.name}</SelectItem>)}</SelectContent>
                </Select>
              )} />
              {form.formState.errors.category && <p className="text-sm text-destructive text-right">{form.formState.errors.category.message}</p>}
            </div>
            {/* Name */}
            <div className="space-y-1 md:col-span-2">
              <Label htmlFor="name">Product Name*</Label>
              <Input id="name" {...form.register('name')} disabled={isSaving} />
              {form.formState.errors.name && <p className="text-sm text-destructive text-right">{form.formState.errors.name.message}</p>}
            </div>
            {/* Image URL */}
            <div className="space-y-1 md:col-span-2">
              <Label htmlFor="imageUrl">Image URL</Label>
              <Input id="imageUrl" {...form.register('imageUrl')} placeholder="https://example.com/image.jpg" disabled={isSaving} />
              {form.watch('imageUrl') && form.formState.errors.imageUrl?.type !== 'invalid_string' && (
                <Image src={form.watch('imageUrl')!} alt="Preview" width={80} height={80} className="mt-1 object-contain border rounded-sm" data-ai-hint="product image preview" />
              )}
              {form.formState.errors.imageUrl && <p className="text-sm text-destructive text-right">{form.formState.errors.imageUrl.message}</p>}
            </div>
             {/* Data AI Hint */}
             <div className="space-y-1 md:col-span-2">
                <Label htmlFor="dataAiHint">Image AI Hint (for placeholder)</Label>
                <Input id="dataAiHint" {...form.register('dataAiHint')} placeholder="e.g., red shoe" disabled={isSaving} />
                {form.formState.errors.dataAiHint && <p className="text-sm text-destructive text-right">{form.formState.errors.dataAiHint.message}</p>}
            </div>
            {/* Affiliate Link */}
            <div className="space-y-1 md:col-span-2">
              <Label htmlFor="affiliateLink">Affiliate Link*</Label>
              <Input id="affiliateLink" {...form.register('affiliateLink')} placeholder="https://trackinglink.com/product" disabled={isSaving} />
              {form.formState.errors.affiliateLink && <p className="text-sm text-destructive text-right">{form.formState.errors.affiliateLink.message}</p>}
            </div>
            {/* Price & Price Display */}
            <div className="grid grid-cols-2 gap-4 md:col-span-2">
                <div className="space-y-1">
                  <Label htmlFor="price">Price (Numeric, Optional)</Label>
                  <Input id="price" type="number" step="0.01" {...form.register('price', { setValueAs: (v) => (v === "" || v === null || isNaN(parseFloat(v)) ? null : parseFloat(v)) })} placeholder="e.g., 1999.50" disabled={isSaving} />
                  {form.formState.errors.price && <p className="text-sm text-destructive text-right">{form.formState.errors.price.message}</p>}
                </div>
                <div className="space-y-1">
                  <Label htmlFor="priceDisplay">Price Display Text (Optional)</Label>
                  <Input id="priceDisplay" {...form.register('priceDisplay')} placeholder="e.g., ₹1,999 or Sale: ₹1,499" disabled={isSaving} />
                   {form.formState.errors.priceDisplay && <p className="text-sm text-destructive text-right">{form.formState.errors.priceDisplay.message}</p>}
                </div>
            </div>
            {/* Brand & SKU */}
            <div className="grid grid-cols-2 gap-4 md:col-span-2">
              <div className="space-y-1">
                <Label htmlFor="brand">Brand (Optional)</Label>
                <Input id="brand" {...form.register('brand')} disabled={isSaving} />
                {form.formState.errors.brand && <p className="text-sm text-destructive text-right">{form.formState.errors.brand.message}</p>}
              </div>
              <div className="space-y-1">
                <Label htmlFor="sku">SKU (Optional)</Label>
                <Input id="sku" {...form.register('sku')} disabled={isSaving} />
                {form.formState.errors.sku && <p className="text-sm text-destructive text-right">{form.formState.errors.sku.message}</p>}
              </div>
            </div>
            {/* Description */}
            <div className="space-y-1 md:col-span-2">
              <Label htmlFor="description">Description (Optional)</Label>
              <Textarea id="description" {...form.register('description')} rows={3} placeholder="Briefly describe the product" disabled={isSaving} />
              {form.formState.errors.description && <p className="text-sm text-destructive text-right">{form.formState.errors.description.message}</p>}
            </div>
            {/* Flags */}
            <div className="md:col-span-2 space-y-3 pt-2">
              <div className="flex items-center space-x-2">
                <Controller name="isActive" control={form.control} render={({ field }) => (<Checkbox id="isActive" checked={field.value} onCheckedChange={field.onChange} disabled={isSaving} />)} />
                <Label htmlFor="isActive" className="font-normal">Active (Product is visible to users)</Label>
              </div>
              <div className="flex items-center space-x-2">
                <Controller name="isFeatured" control={form.control} render={({ field }) => (<Checkbox id="isFeatured" checked={field.value} onCheckedChange={field.onChange} disabled={isSaving} />)} />
                <Label htmlFor="isFeatured" className="font-normal">Featured Product (Highlight on relevant pages)</Label>
              </div>
              <div className="flex items-center space-x-2">
                <Controller name="isTodaysPick" control={form.control} render={({ field }) => (<Checkbox id="isTodaysPick" checked={field.value} onCheckedChange={field.onChange} disabled={isSaving} />)} />
                <Label htmlFor="isTodaysPick" className="font-normal">Today's Pick (Feature on homepage Amazon section)</Label>
              </div>
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

export default function AddProductAdminPage() {
  return <AdminGuard><AddProductPageContent /></AdminGuard>;
}
