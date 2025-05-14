
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
  getDoc
} from 'firebase/firestore';
import { db, firebaseInitializationError } from '@/lib/firebase/config';
import type { Product, ProductFormValues, Store, Category } from '@/lib/types';
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
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { AlertCircle, Loader2, Search, Edit, Trash2, PlusCircle, CheckCircle, XCircle, Package, ExternalLink } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogClose } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import AdminGuard from '@/components/guards/admin-guard';
import Image from 'next/image';
import { Switch } from '@/components/ui/switch';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { MoreHorizontal } from "lucide-react";
import { safeToDate, formatCurrency } from '@/lib/utils';
import { useDebounce } from '@/hooks/use-debounce';

const PRODUCTS_PER_PAGE = 15;

const productSchema = z.object({
  storeId: z.string().min(1, 'Store is required'),
  name: z.string().min(3, 'Product name too short').max(150, 'Product name too long'),
  description: z.string().max(1000, "Description too long").optional().nullable(),
  imageUrl: z.string().url('Invalid Image URL').optional().nullable().or(z.literal('')),
  affiliateLink: z.string().url('Invalid Affiliate URL'),
  price: z.number().min(0).optional().nullable(),
  priceDisplay: z.string().max(50, "Price display too long").optional().nullable(),
  category: z.string().optional().nullable(), // Assuming single category slug for now
  brand: z.string().max(50, "Brand name too long").optional().nullable(),
  sku: z.string().max(50, "SKU too long").optional().nullable(),
  isActive: z.boolean().default(true),
  isFeatured: z.boolean().default(false),
  dataAiHint: z.string().max(50, "AI Hint too long").optional().nullable(),
});

type ProductFormValuesType = z.infer<typeof productSchema>;

interface ProductWithStoreName extends Product {
  storeName?: string;
}

function AdminProductsPageContent() {
  const [products, setProducts] = useState<ProductWithStoreName[]>([]);
  const [loading, setLoading] = useState(true);
  const [pageError, setPageError] = useState<string | null>(null);
  const [lastVisible, setLastVisible] = useState<QueryDocumentSnapshot<DocumentData> | null>(null);
  const [hasMore, setHasMore] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const { toast } = useToast();
  const router = useRouter();

  const [searchTermInput, setSearchTermInput] = useState('');
  const debouncedSearchTerm = useDebounce(searchTermInput, 500);
  const [isSearching, setIsSearching] = useState(false);

  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<ProductWithStoreName | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [deletingProductId, setDeletingProductId] = useState<string | null>(null);
  const [updatingProductId, setUpdatingProductId] = useState<string | null>(null);

  const [storeList, setStoreList] = useState<{ id: string; name: string }[]>([]);
  const [categoryList, setCategoryList] = useState<{ id: string; name: string; slug: string }[]>([]);

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
      if (!db || firebaseInitializationError) {
        setPageError(firebaseInitializationError || "Database not available for fetching options.");
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
      }
    };
    fetchSelectOptions();
  }, [toast]);

  const fetchProducts = useCallback(async (
    isLoadMoreOperation: boolean,
    currentSearchTerm: string,
    docToStartAfter: QueryDocumentSnapshot<DocumentData> | null
  ) => {
    let isMounted = true;
    if (!db || firebaseInitializationError) {
      if (isMounted) {
        setPageError(firebaseInitializationError || "Database connection not available.");
        setLoading(false);
        setLoadingMore(false);
        setHasMore(false);
      }
      return () => { isMounted = false; };
    }

    if (!isLoadMoreOperation) {
      setLoading(true);
      setProducts([]);
    } else {
      setLoadingMore(true);
    }
    setPageError(null);
    setIsSearching(currentSearchTerm !== '');

    try {
      const productsCollection = collection(db, 'products');
      let constraints: QueryConstraint[] = [];

      if (currentSearchTerm) {
        constraints.push(where('name', '>=', currentSearchTerm));
        constraints.push(where('name', '<=', currentSearchTerm + '\uf8ff'));
        constraints.push(orderBy('name'));
      } else {
        constraints.push(orderBy('createdAt', 'desc'));
      }

      if (isLoadMoreOperation && docToStartAfter) {
        constraints.push(startAfter(docToStartAfter));
      }
      constraints.push(limit(PRODUCTS_PER_PAGE));

      const q = query(productsCollection, ...constraints);
      const querySnapshot = await getDocs(q);

      const productsDataPromises = querySnapshot.docs.map(async (docSnap) => {
        const data = docSnap.data();
        const product: ProductWithStoreName = {
          id: docSnap.id,
          name: data.name || '',
          storeId: data.storeId || '',
          affiliateLink: data.affiliateLink || '',
          imageUrl: data.imageUrl || null,
          price: data.price === undefined ? null : data.price,
          priceDisplay: data.priceDisplay || null,
          category: data.category || null,
          brand: data.brand || null,
          isActive: typeof data.isActive === 'boolean' ? data.isActive : true,
          isFeatured: typeof data.isFeatured === 'boolean' ? data.isFeatured : false,
          createdAt: safeToDate(data.createdAt),
          updatedAt: safeToDate(data.updatedAt),
          storeName: 'Loading...'
        };

        try {
          if (product.storeId && db) {
            const storeDocRef = doc(db, 'stores', product.storeId);
            const storeSnap = await getDoc(storeDocRef);
            product.storeName = storeSnap.exists() ? storeSnap.data()?.name : 'Unknown Store';
          } else if (!product.storeId) {
            product.storeName = 'No Store ID';
          }
        } catch (storeFetchError) {
          console.error(`Error fetching store name for product ${product.id}:`, storeFetchError);
          product.storeName = 'Error Loading Store';
        }
        return product;
      });

      const productsWithNames = await Promise.all(productsDataPromises);

      if (isMounted) {
        if (isLoadMoreOperation) {
          setProducts(prev => [...prev, ...productsWithNames]);
        } else {
          setProducts(productsWithNames);
        }
        const newLastVisible = querySnapshot.docs[querySnapshot.docs.length - 1] || null;
        setLastVisible(newLastVisible);
        setHasMore(querySnapshot.docs.length === PRODUCTS_PER_PAGE);
      }
    } catch (err) {
      console.error("Error fetching products:", err);
      if (isMounted) {
        const errorMsg = err instanceof Error ? err.message : "Failed to fetch products";
        setPageError(errorMsg);
        toast({ variant: "destructive", title: "Fetch Error", description: errorMsg });
        setHasMore(false);
      }
    } finally {
      if (isMounted) {
        setLoading(false);
        setLoadingMore(false);
        setIsSearching(false);
      }
    }
    return () => { isMounted = false; };
  }, [toast]);

  useEffect(() => {
    fetchProducts(false, debouncedSearchTerm, null);
  }, [debouncedSearchTerm, fetchProducts]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    fetchProducts(false, searchTermInput, null);
  };

  const handleLoadMore = () => {
    if (!loadingMore && hasMore) {
      fetchProducts(true, debouncedSearchTerm, lastVisible);
    }
  };

  const openAddDialog = () => router.push('/admin/products/new');

  const openEditDialog = (product: ProductWithStoreName) => {
    setEditingProduct(product);
    form.reset({
      storeId: product.storeId,
      name: product.name,
      description: product.description || '',
      imageUrl: product.imageUrl || '',
      affiliateLink: product.affiliateLink,
      price: product.price ?? null,
      priceDisplay: product.priceDisplay || '',
      category: product.category || '',
      brand: product.brand || '',
      sku: product.sku || '',
      isActive: product.isActive,
      isFeatured: product.isFeatured || false,
      dataAiHint: product.dataAiHint || '',
    });
    setIsDialogOpen(true);
  };

  const onSubmit = async (data: ProductFormValuesType) => {
    if (!db) {
      setPageError("Database not available.");
      setIsSaving(false);
      return;
    }
    setIsSaving(true);
    setPageError(null);

    const submissionData: Partial<ProductFormValues> = Object.fromEntries(
      Object.entries(data).map(([key, value]) => [key, value === '' ? null : value])
    );
    submissionData.isFeatured = !!data.isFeatured;
    submissionData.isActive = !!data.isActive;

    try {
      if (editingProduct) {
        const productDocRef = doc(db, 'products', editingProduct.id);
        await updateDoc(productDocRef, { ...submissionData, updatedAt: serverTimestamp() });
        setProducts(prev => prev.map(p => p.id === editingProduct.id ? { ...p, ...submissionData, updatedAt: new Date(), storeName: storeList.find(s => s.id === submissionData.storeId)?.name || 'Unknown Store' } as ProductWithStoreName : p));
        toast({ title: "Product Updated", description: `${data.name} details saved.` });
      } else {
        // This case is for adding directly on this page, ideally handled by /new page
      }
      setIsDialogOpen(false);
      form.reset();
    } catch (err) {
      console.error("Error saving product:", err);
      const errorMsg = err instanceof Error ? err.message : "Could not save product details.";
      setPageError(errorMsg);
      toast({ variant: "destructive", title: "Save Failed", description: errorMsg });
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeleteProduct = async () => {
    if (!deletingProductId || !db) return;
    try {
      await deleteDoc(doc(db, 'products', deletingProductId));
      setProducts(prev => prev.filter(p => p.id !== deletingProductId));
      toast({ title: "Product Deleted" });
    } catch (err) {
      console.error("Error deleting product:", err);
      toast({ variant: "destructive", title: "Deletion Failed", description: String(err) });
    } finally {
      setDeletingProductId(null);
    }
  };

  const handleToggleActiveStatus = async (product: ProductWithStoreName) => {
    if (!product.id || !db) return;
    setUpdatingProductId(product.id);
    try {
      const newStatus = !product.isActive;
      await updateDoc(doc(db, 'products', product.id), { isActive: newStatus, updatedAt: serverTimestamp() });
      setProducts(prev => prev.map(p => p.id === product.id ? { ...p, isActive: newStatus, updatedAt: new Date() } : p));
      toast({ title: `Product ${newStatus ? 'Activated' : 'Deactivated'}` });
    } catch (err) {
      console.error("Error toggling product status:", err);
      toast({ variant: "destructive", title: "Status Update Failed", description: String(err) });
    } finally {
      setUpdatingProductId(null);
    }
  };

  if (loading && products.length === 0 && !pageError) {
    return <ProductsTableSkeleton />;
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-3xl font-bold">Manage Products</h1>
        <Button onClick={openAddDialog}><PlusCircle className="mr-2 h-4 w-4" /> Add New Product</Button>
      </div>

      {pageError && !loading && (
        <Alert variant="destructive"><AlertCircle className="h-4 w-4" /><AlertTitle>Error</AlertTitle><AlertDescription>{pageError}</AlertDescription></Alert>
      )}

      <Card>
        <CardHeader><CardTitle>Filter & Search</CardTitle><CardDescription>Search by product name.</CardDescription></CardHeader>
        <CardContent>
          <form onSubmit={handleSearchSubmit} className="flex gap-2">
            <Input type="search" placeholder="Search by Product Name..." value={searchTermInput} onChange={(e) => setSearchTermInput(e.target.value)} disabled={isSearching || loading} className="h-10 text-base"/>
            <Button type="submit" disabled={isSearching || loading} className="h-10">{isSearching || (loading && debouncedSearchTerm) ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}<span className="sr-only sm:not-sr-only sm:ml-2">Search</span></Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Product List</CardTitle><CardDescription>View and manage products.</CardDescription></CardHeader>
        <CardContent>
          {loading && products.length === 0 && !pageError ? <ProductsTableSkeleton /> : !loading && products.length === 0 && !pageError ? (
            <p className="text-center text-muted-foreground py-8">{debouncedSearchTerm ? `No products found matching "${debouncedSearchTerm}".` : "No products found."}</p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Image</TableHead>
                    <TableHead>Name</TableHead>
                    <TableHead>Store</TableHead>
                    <TableHead>Price</TableHead>
                    <TableHead>Category</TableHead>
                    <TableHead>Featured</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {products.map((product) => (
                    <TableRow key={product.id} className={!product.isActive ? 'opacity-50 bg-muted/30' : ''}>
                      <TableCell>
                        {product.imageUrl ? (
                          <Image src={product.imageUrl} alt={product.name} width={50} height={50} className="object-contain rounded-sm border" data-ai-hint={product.dataAiHint || 'product image'}/>
                        ) : (<div className="w-[50px] h-[50px] bg-muted flex items-center justify-center text-xs text-muted-foreground rounded-sm border">No Img</div>)}
                      </TableCell>
                      <TableCell className="font-medium max-w-[200px] truncate" title={product.name}>{product.name}</TableCell>
                      <TableCell className="text-xs truncate max-w-[100px]" title={product.storeName}>{product.storeName || product.storeId}</TableCell>
                      <TableCell className="text-xs">{product.priceDisplay || (product.price ? formatCurrency(product.price) : '-')}</TableCell>
                      <TableCell className="text-xs capitalize truncate max-w-[100px]" title={product.category}>{product.category || '-'}</TableCell>
                      <TableCell>{product.isFeatured ? <CheckCircle className="h-5 w-5 text-green-600" /> : <XCircle className="h-5 w-5 text-muted-foreground"/>}</TableCell>
                      <TableCell>
                        <Switch checked={product.isActive} onCheckedChange={() => handleToggleActiveStatus(product)} disabled={updatingProductId === product.id} aria-label={product.isActive ? 'Deactivate' : 'Activate'} />
                        {updatingProductId === product.id && <Loader2 className="h-4 w-4 animate-spin ml-2 inline-block" />}
                      </TableCell>
                      <TableCell>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild><Button variant="ghost" className="h-8 w-8 p-0"><span className="sr-only">Menu</span><MoreHorizontal className="h-4 w-4" /></Button></DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuLabel>Actions</DropdownMenuLabel>
                            <DropdownMenuItem onClick={() => openEditDialog(product)}><Edit className="mr-2 h-4 w-4" />Edit</DropdownMenuItem>
                            <DropdownMenuItem onClick={() => window.open(product.affiliateLink, '_blank')}><ExternalLink className="mr-2 h-4 w-4" />View Link</DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <AlertDialog>
                              <AlertDialogTrigger asChild>
                                <Button variant="ghost" className="w-full justify-start px-2 py-1.5 text-sm font-normal text-destructive hover:bg-destructive/10 focus:text-destructive focus:bg-destructive/10 h-auto relative flex cursor-default select-none items-center rounded-sm outline-none transition-colors data-[disabled]:pointer-events-none data-[disabled]:opacity-50"><Trash2 className="mr-2 h-4 w-4"/>Delete</Button>
                              </AlertDialogTrigger>
                              <AlertDialogContent>
                                <AlertDialogHeader><AlertDialogTitle>Delete Product?</AlertDialogTitle><AlertDialogDescription>This will permanently delete "{product.name}". This action cannot be undone.</AlertDialogDescription></AlertDialogHeader>
                                <AlertDialogFooter><AlertDialogCancel onClick={() => setDeletingProductId(null)}>Cancel</AlertDialogCancel><AlertDialogAction onClick={() => { setDeletingProductId(product.id); handleDeleteProduct();}} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Delete</AlertDialogAction></AlertDialogFooter>
                              </AlertDialogContent>
                            </AlertDialog>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
          {hasMore && !loading && products.length > 0 && (
            <div className="mt-6 text-center"><Button onClick={handleLoadMore} disabled={loadingMore}>{loadingMore && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Load More</Button></div>
          )}
          {loadingMore && <div className="text-center py-4"><Loader2 className="h-6 w-6 animate-spin text-primary mx-auto" /></div>}
        </CardContent>
      </Card>

      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{editingProduct ? 'Edit Product' : 'Add New Product'}</DialogTitle><DialogDescription>{editingProduct ? `Update details for ${editingProduct.name}.` : 'Enter product details.'}</DialogDescription></DialogHeader>
          <form onSubmit={form.handleSubmit(onSubmit)} className="grid md:grid-cols-2 gap-4 py-4">
            {/* Store Selector */}
            <div className="space-y-1 md:col-span-1">
              <Label htmlFor="storeId">Store*</Label>
              <Controller name="storeId" control={form.control} render={({ field }) => (
                <Select value={field.value} onValueChange={field.onChange} disabled={isSaving}>
                  <SelectTrigger><SelectValue placeholder="Select store..." /></SelectTrigger>
                  <SelectContent>{storeList.map(s => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}</SelectContent>
                </Select>
              )} />
              {form.formState.errors.storeId && <p className="text-sm text-destructive">{form.formState.errors.storeId.message}</p>}
            </div>
             {/* Category Selector */}
            <div className="space-y-1 md:col-span-1">
              <Label htmlFor="category">Category</Label>
              <Controller name="category" control={form.control} render={({ field }) => (
                <Select value={field.value || ''} onValueChange={field.onChange} disabled={isSaving}>
                  <SelectTrigger><SelectValue placeholder="Select category..." /></SelectTrigger>
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
                  <Input id="price" type="number" step="0.01" {...form.register('price', { valueAsNumber: true, setValueAs: v => v === null || v === '' ? null : parseFloat(v)})} disabled={isSaving} />
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
              <div className="flex items-center space-x-2"><Controller name="isActive" control={form.control} render={({ field }) => (<Checkbox id="isActive" checked={field.value} onCheckedChange={field.onChange} disabled={isSaving} />)} /><Label htmlFor="isActive" className="font-normal">Active</Label></div>
              <div className="flex items-center space-x-2"><Controller name="isFeatured" control={form.control} render={({ field }) => (<Checkbox id="isFeatured" checked={field.value} onCheckedChange={field.onChange} disabled={isSaving} />)} /><Label htmlFor="isFeatured" className="font-normal">Featured</Label></div>
            </div>
            <DialogFooter className="md:col-span-2">
              <DialogClose asChild><Button type="button" variant="outline" disabled={isSaving}>Cancel</Button></DialogClose>
              <Button type="submit" disabled={isSaving}>{isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}{editingProduct ? 'Save Changes' : 'Add Product'}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function ProductsTableSkeleton() {
  return (
    <Card>
      <CardHeader><Skeleton className="h-6 w-1/4 mb-2"/><Skeleton className="h-4 w-1/2"/></CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader><TableRow>{Array.from({ length: 8 }).map((_, i) => <TableHead key={i}><Skeleton className="h-5 w-full" /></TableHead>)}</TableRow></TableHeader>
            <TableBody>{Array.from({ length: 10 }).map((_, i) => <TableRow key={i}>{Array.from({ length: 8 }).map((_, j) => <TableCell key={j}><Skeleton className="h-5 w-full" /></TableCell>)}</TableRow>)}</TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}

export default function AdminProductsPage() {
  return <AdminGuard><AdminProductsPageContent /></AdminGuard>;
}
