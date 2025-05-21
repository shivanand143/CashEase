
// src/app/admin/products/new/page.tsx
"use client";

import * as React from 'react';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { collection, addDoc, serverTimestamp, query, orderBy, getDocs, where } from 'firebase/firestore';
import { db, firebaseInitializationError } from '@/lib/firebase/config';
import type { ProductFormValues, Store, Category } from '@/lib/types';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { ArrowLeft, Loader2, PlusCircle, Package as PackageIcon, UploadCloud } from 'lucide-react';
import AdminGuard from '@/components/guards/admin-guard';
import Image from 'next/image';
import { Skeleton } from '@/components/ui/skeleton';

const productSchema = z.object({
  name: z.string().min(3, 'Product name must be at least 3 characters').max(150, 'Product name too long'),
  storeId: z.string().min(1, 'Store is required'),
  description: z.string().optional().nullable(),
  imageUrl: z.string().url('Invalid URL format').optional().or(z.literal('')).nullable(),
  affiliateLink: z.string().url('Affiliate link must be a valid URL'),
  price: z.number().min(0, 'Price must be non-negative').optional().nullable(),
  priceDisplay: z.string().optional().nullable(),
  category: z.string().optional().nullable(),
  brand: z.string().optional().nullable(),
  sku: z.string().optional().nullable(),
  isActive: z.boolean().default(true),
  isFeatured: z.boolean().default(false),
  isTodaysPick: z.boolean().default(false),
  dataAiHint: z.string().max(50, 'AI Hint too long').optional().nullable(),
});

function AddProductPageSkeleton() {
  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4"><Skeleton className="h-10 w-10 rounded-md" /><Skeleton className="h-9 w-1/2" /></div>
      <Card>
        <CardHeader><Skeleton className="h-7 w-1/3 mb-1" /><Skeleton className="h-4 w-2/3" /></CardHeader>
        <CardContent className="grid md:grid-cols-2 gap-x-6 gap-y-4">
          {Array.from({ length: 8 }).map((_, index) => (
            <div key={`form-field-skel-${index}`} className={`space-y-1 md:col-span-${index < 4 ? 1 : 2}`}>
              <Skeleton className="h-4 w-1/4" /><Skeleton className="h-10 w-full" />
            </div>
          ))}
          <div className="md:col-span-2 space-y-3 pt-2"><Skeleton className="h-5 w-1/2" /><Skeleton className="h-5 w-1/2" /><Skeleton className="h-5 w-1/2" /></div>
          <div className="md:col-span-2 flex justify-end gap-2 pt-4"><Skeleton className="h-10 w-24" /><Skeleton className="h-10 w-32" /></div>
        </CardContent>
      </Card>
    </div>
  );
}

export default function AddProductAdminPage() {
  const router = useRouter();
  const { toast } = useToast();
  const [isSaving, setIsSaving] = useState(false);
  const [storeList, setStoreList] = useState<{ id: string; name: string }[]>([]);
  const [categoryList, setCategoryList] = useState<{ id: string; name: string }[]>([]);
  const [loadingRelatedData, setLoadingRelatedData] = useState(true);

  const form = useForm<ProductFormValues>({
    resolver: zodResolver(productSchema),
    defaultValues: {
      name: '', storeId: '', description: '', imageUrl: '', affiliateLink: '',
      price: 0, priceDisplay: '', category: '', brand: '', sku: '',
      isActive: true, isFeatured: false, isTodaysPick: false, dataAiHint: '',
    },
  });

  useEffect(() => {
    let isMounted = true;
    const fetchRelatedData = async () => {
      if (!db || firebaseInitializationError) {
        if(isMounted) setLoadingRelatedData(false);
        return;
      }
      setLoadingRelatedData(true);
      try {
        const [storeSnapshot, categorySnapshot] = await Promise.all([
          getDocs(query(collection(db, 'stores'), where('isActive', '==', true), orderBy('name'))),
          getDocs(query(collection(db, 'categories'), where('isActive', '==', true), orderBy('name')))
        ]);
        if(isMounted){
          setStoreList(storeSnapshot.docs.map(doc => ({ id: doc.id, name: doc.data().name || 'Unnamed Store' })));
          setCategoryList(categorySnapshot.docs.map(doc => ({ id: doc.id, name: doc.data().name || 'Unnamed Category' })));
        }
      } catch (err) {
        if(isMounted) toast({ variant: 'destructive', title: 'Error', description: 'Could not load stores or categories.' });
      } finally {
        if(isMounted) setLoadingRelatedData(false);
      }
    };
    fetchRelatedData();
    return () => { isMounted = false; };
  }, [toast]);

  const onSubmit = async (data: ProductFormValues) => {
    if (!db || firebaseInitializationError) {
      toast({ variant: "destructive", title: "Error", description: "Database not available." });
      return;
    }
    setIsSaving(true);
    const submissionData = {
      ...data,
      imageUrl: data.imageUrl || null,
      description: data.description || null,
      price: data.price === null ? null : Number(data.price),
      priceDisplay: data.priceDisplay || null,
      category: data.category || null,
      brand: data.brand || null,
      sku: data.sku || null,
      dataAiHint: data.dataAiHint || null,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    };

    try {
      await addDoc(collection(db, 'products'), submissionData);
      toast({ title: "Product Added", description: `${data.name} has been successfully created.` });
      router.push('/admin/products');
    } catch (err) {
      console.error("Error adding product:", err);
      toast({ variant: "destructive", title: "Save Failed", description: err instanceof Error ? err.message : "Could not add product." });
    } finally {
      setIsSaving(false);
    }
  };
  
  if (loadingRelatedData && (storeList.length === 0 || categoryList.length === 0)) {
      return <AdminGuard><AddProductPageSkeleton/></AdminGuard>;
  }

  return (
    <AdminGuard>
      <div className="space-y-6">
        <div className="flex items-center gap-4">
          <Button variant="outline" size="icon" onClick={() => router.back()} aria-label="Go back">
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <h1 className="text-2xl sm:text-3xl font-bold flex items-center gap-2"><PackageIcon className="w-6 h-6 sm:w-7 sm:h-7" /> Add New Product</h1>
        </div>

        <Card className="shadow-lg border">
          <CardHeader>
            <CardTitle>Product Information</CardTitle>
            <CardDescription>Fill in the details for the new product.</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={form.handleSubmit(onSubmit)} className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-4">
              {/* Column 1 */}
              <div className="space-y-4">
                <div className="space-y-1">
                  <Label htmlFor="name">Product Name*</Label>
                  <Input id="name" {...form.register('name')} disabled={isSaving || loadingRelatedData} />
                  {form.formState.errors.name && <p className="text-sm text-destructive">{form.formState.errors.name.message}</p>}
                </div>
                <div className="space-y-1">
                  <Label htmlFor="storeId">Store*</Label>
                  <Controller name="storeId" control={form.control} render={({ field }) => (
                    <Select value={field.value} onValueChange={field.onChange} disabled={isSaving || loadingRelatedData}>
                      <SelectTrigger id="storeId"><SelectValue placeholder="Select store..." /></SelectTrigger>
                      <SelectContent>
                        {storeList.map(store => <SelectItem key={store.id} value={store.id}>{store.name}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  )}/>
                  {form.formState.errors.storeId && <p className="text-sm text-destructive">{form.formState.errors.storeId.message}</p>}
                </div>
                <div className="space-y-1">
                  <Label htmlFor="category">Category</Label>
                  <Controller name="category" control={form.control} render={({ field }) => (
                    <Select value={field.value || ""} onValueChange={field.onChange} disabled={isSaving || loadingRelatedData}>
                      <SelectTrigger id="category"><SelectValue placeholder="Select category..." /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="">No Category</SelectItem>
                        {categoryList.map(cat => <SelectItem key={cat.id} value={cat.id}>{cat.name}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  )}/>
                   {form.formState.errors.category && <p className="text-sm text-destructive">{form.formState.errors.category.message}</p>}
                </div>
                <div className="space-y-1">
                  <Label htmlFor="description">Description</Label>
                  <Textarea id="description" {...form.register('description')} rows={3} disabled={isSaving || loadingRelatedData} />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="imageUrl">Image URL</Label>
                  <Input id="imageUrl" {...form.register('imageUrl')} placeholder="https://..." disabled={isSaving || loadingRelatedData} />
                  {form.watch('imageUrl') && <Image src={form.watch('imageUrl')!} alt="Preview" width={80} height={80} className="mt-2 object-contain border rounded-sm bg-muted p-1" />}
                  {form.formState.errors.imageUrl && <p className="text-sm text-destructive">{form.formState.errors.imageUrl.message}</p>}
                </div>
                <div className="space-y-1">
                  <Label htmlFor="dataAiHint">Image AI Hint (for placeholder)</Label>
                  <Input id="dataAiHint" {...form.register('dataAiHint')} placeholder="e.g., red shoe" disabled={isSaving || loadingRelatedData} />
                </div>
              </div>
              {/* Column 2 */}
              <div className="space-y-4">
                <div className="space-y-1">
                  <Label htmlFor="affiliateLink">Affiliate Link* (use {"{CLICK_ID}"})</Label>
                  <Input id="affiliateLink" {...form.register('affiliateLink')} placeholder="https://...&subid={CLICK_ID}" disabled={isSaving || loadingRelatedData} />
                  {form.formState.errors.affiliateLink && <p className="text-sm text-destructive">{form.formState.errors.affiliateLink.message}</p>}
                </div>
                 <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1">
                        <Label htmlFor="price">Price (Numerical)</Label>
                        <Input id="price" type="number" step="0.01" {...form.register('price', { setValueAs: v => v === null || v === '' ? null : parseFloat(v) })} disabled={isSaving || loadingRelatedData} />
                        {form.formState.errors.price && <p className="text-sm text-destructive">{form.formState.errors.price.message}</p>}
                    </div>
                    <div className="space-y-1">
                        <Label htmlFor="priceDisplay">Price Display Text</Label>
                        <Input id="priceDisplay" {...form.register('priceDisplay')} placeholder="e.g. ₹1,999 or Sale!" disabled={isSaving || loadingRelatedData} />
                    </div>
                 </div>
                <div className="space-y-1">
                  <Label htmlFor="brand">Brand</Label>
                  <Input id="brand" {...form.register('brand')} disabled={isSaving || loadingRelatedData} />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="sku">SKU/Item ID</Label>
                  <Input id="sku" {...form.register('sku')} disabled={isSaving || loadingRelatedData} />
                </div>
                <div className="space-y-3 pt-2">
                    <div className="flex items-center space-x-2">
                    <Controller name="isActive" control={form.control} render={({ field }) => (<Checkbox id="isActive" checked={field.value} onCheckedChange={field.onChange} disabled={isSaving || loadingRelatedData} /> )} />
                    <Label htmlFor="isActive" className="font-normal">Active (Visible on site)</Label>
                    </div>
                    <div className="flex items-center space-x-2">
                    <Controller name="isFeatured" control={form.control} render={({ field }) => (<Checkbox id="isFeatured" checked={field.value} onCheckedChange={field.onChange} disabled={isSaving || loadingRelatedData} /> )}/>
                    <Label htmlFor="isFeatured" className="font-normal">Featured Product</Label>
                    </div>
                    <div className="flex items-center space-x-2">
                    <Controller name="isTodaysPick" control={form.control} render={({ field }) => ( <Checkbox id="isTodaysPick" checked={field.value} onCheckedChange={field.onChange} disabled={isSaving || loadingRelatedData} /> )}/>
                    <Label htmlFor="isTodaysPick" className="font-normal">Mark as Today's Pick</Label>
                    </div>
                </div>
              </div>
              <div className="md:col-span-2 flex flex-col sm:flex-row justify-end gap-2 pt-4 border-t">
                <Button type="button" variant="outline" onClick={() => router.back()} disabled={isSaving} className="w-full sm:w-auto">
                  Cancel
                </Button>
                <Button type="submit" disabled={isSaving || loadingRelatedData} className="w-full sm:w-auto">
                  {isSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <PlusCircle className="mr-2 h-4 w-4" />}
                  Add Product
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      </div>
    </AdminGuard>
  );
}
