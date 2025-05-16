
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
import type { Product, ProductFormValues as ProductFormValuesType, Store, Category } from '@/lib/types';
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
import { AlertCircle, Loader2, Search, Edit, Trash2, PlusCircle, ExternalLink, Star } from 'lucide-react'; // Added Star
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogClose } from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger, // Ensure this is imported
} from "@/components/ui/alert-dialog";
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
  price: z.number().min(0, "Price must be non-negative").optional().nullable(),
  priceDisplay: z.string().max(50, "Price display too long").optional().nullable(),
  category: z.string().optional().nullable(),
  brand: z.string().max(50, "Brand name too long").optional().nullable(),
  sku: z.string().max(50, "SKU too long").optional().nullable(),
  isActive: z.boolean().default(true),
  isFeatured: z.boolean().default(false),
  isTodaysPick: z.boolean().default(false), // New field
  dataAiHint: z.string().max(50, "AI Hint too long").optional().nullable(),
});

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
  const [filterStoreId, setFilterStoreId] = useState<string | 'all'>('all');


  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<ProductWithStoreName | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [deletingProductId, setDeletingProductId] = useState<string | null>(null);
  const [updatingProductId, setUpdatingProductId] = useState<string | null>(null);

  const [storeList, setStoreList] = useState<{ id: string; name: string }[]>([]);
  const [categoryList, setCategoryList] = useState<{ slug: string; name: string }[]>([]);
  const [loadingOptions, setLoadingOptions] = useState(true);


  const form = useForm<ProductFormValuesType>({
    resolver: zodResolver(productSchema),
    defaultValues: {
      isActive: true,
      isFeatured: false,
      isTodaysPick: false,
    },
  });

  useEffect(() => {
    let isMounted = true;
    const fetchSelectOptions = async () => {
      if (!isMounted) return;
      setLoadingOptions(true);
      if (!db || firebaseInitializationError) {
        if (isMounted) {
          setPageError(firebaseInitializationError || "Database not available for fetching options.");
          setLoadingOptions(false);
        }
        return;
      }
      try {
        const storesSnap = await getDocs(query(collection(db, 'stores'), orderBy('name')));
        if(isMounted) setStoreList(storesSnap.docs.map(doc => ({ id: doc.id, name: doc.data().name })));

        const categoriesSnap = await getDocs(query(collection(db, 'categories'), where('isActive', '==', true), orderBy('name')));
        if(isMounted) setCategoryList(categoriesSnap.docs.map(doc => ({ slug: doc.data().slug, name: doc.data().name })));
      } catch (err) {
        console.error("Error fetching stores/categories for product form:", err);
        if (isMounted) toast({ variant: "destructive", title: "Error", description: "Could not load store/category options." });
      } finally {
        if (isMounted) setLoadingOptions(false);
      }
    };
    fetchSelectOptions();
    return () => { isMounted = false; };
  }, [toast]);

  const fetchProducts = useCallback(async (
    isLoadMoreOperation: boolean,
    currentSearchTerm: string,
    currentFilterStoreId: string,
    docToStartAfter: QueryDocumentSnapshot<DocumentData> | null
  ) => {
    let isMounted = true;
    if (!db || firebaseInitializationError) {
      if (isMounted) {
        setPageError(firebaseInitializationError || "Database connection not available.");
        if (!isLoadMoreOperation) setLoading(false); else setLoadingMore(false);
        setHasMore(false);
      }
      return () => { isMounted = false; };
    }

    if (!isLoadMoreOperation) { setLoading(true); setProducts([]); setLastVisible(null); setHasMore(true); }
    else { setLoadingMore(true); }
    setPageError(null);
    setIsSearching(currentSearchTerm !== '' || currentFilterStoreId !== 'all');

    try {
      const productsCollection = collection(db, 'products');
      let constraints: QueryConstraint[] = [];

      if (currentFilterStoreId !== 'all') {
        constraints.push(where('storeId', '==', currentFilterStoreId));
      }

      if (currentSearchTerm) {
        constraints.push(orderBy('name')); // Order by name first for text search
        constraints.push(where('name', '>=', currentSearchTerm));
        constraints.push(where('name', '<=', currentSearchTerm + '\uf8ff'));
      } else if (currentFilterStoreId !== 'all') { // If filtering by store, still sort by name
        constraints.push(orderBy('name'));
      }
      else { // Default sort if no search/filter
        constraints.push(orderBy('createdAt', 'desc'));
      }

      if (docToStartAfter) {
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
          isTodaysPick: typeof data.isTodaysPick === 'boolean' ? data.isTodaysPick : false, // Handle new field
          createdAt: safeToDate(data.createdAt),
          updatedAt: safeToDate(data.updatedAt),
          storeName: 'Loading...'
        };

        if (product.storeId && db) {
          const storeDocRef = doc(db, 'stores', product.storeId);
          const storeSnap = await getDoc(storeDocRef);
          product.storeName = storeSnap.exists() ? storeSnap.data()?.name : 'Unknown Store';
        }
        return product;
      });

      const productsWithNames = await Promise.all(productsDataPromises);

      if (isMounted) {
        setProducts(prev => isLoadMoreOperation ? [...prev, ...productsWithNames] : productsWithNames);
        const newLastVisible = querySnapshot.docs[querySnapshot.docs.length - 1] || null;
        setLastVisible(newLastVisible);
        setHasMore(querySnapshot.docs.length === PRODUCTS_PER_PAGE);
      }
    } catch (err) {
      console.error("Error fetching products:", err);
      if (isMounted) {
        const errorMsg = err instanceof Error ? err.message : "Failed to fetch products";
        setPageError(errorMsg); toast({ variant: "destructive", title: "Fetch Error", description: errorMsg });
        setHasMore(false);
      }
    } finally {
      if (isMounted) { setLoading(false); setLoadingMore(false); setIsSearching(false); }
    }
    return () => { isMounted = false; };
  }, [toast]);


  useEffect(() => {
    fetchProducts(false, debouncedSearchTerm, filterStoreId, null);
  }, [debouncedSearchTerm, filterStoreId, fetchProducts]);


  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
     // fetchProducts will be called by the useEffect due to debouncedSearchTerm change
  };

  const handleLoadMore = () => {
    if (!loadingMore && hasMore) {
      fetchProducts(true, debouncedSearchTerm, filterStoreId, lastVisible);
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
      price: product.price ?? undefined,
      priceDisplay: product.priceDisplay || '',
      category: product.category || '',
      brand: product.brand || '',
      sku: product.sku || '',
      isActive: product.isActive,
      isFeatured: product.isFeatured || false,
      isTodaysPick: product.isTodaysPick || false, // Handle new field
      dataAiHint: product.dataAiHint || '',
    });
    setIsDialogOpen(true);
  };

  const onSubmit = async (data: ProductFormValuesType) => {
    if (!db || !editingProduct) {
      setPageError("Database not available or no product selected for editing.");
      setIsSaving(false);
      return;
    }
    setIsSaving(true);
    setPageError(null);

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
      isTodaysPick: !!data.isTodaysPick, // Ensure boolean
    };

    try {
      const productDocRef = doc(db, 'products', editingProduct.id);
      await updateDoc(productDocRef, { ...submissionData, updatedAt: serverTimestamp() });

      const storeName = storeList.find(s => s.id === submissionData.storeId)?.name || 'Unknown Store';
      setProducts(prev => prev.map(p => p.id === editingProduct.id ? { ...p, ...submissionData, storeName, updatedAt: new Date() } as ProductWithStoreName : p));
      toast({ title: "Product Updated", description: `${data.name} details saved.` });
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

  const handleToggleStatus = async (product: ProductWithStoreName, field: 'isActive' | 'isFeatured' | 'isTodaysPick') => {
    if (!product.id || !db) return;
    setUpdatingProductId(product.id);
    try {
      const newStatus = !product[field];
      await updateDoc(doc(db, 'products', product.id), { [field]: newStatus, updatedAt: serverTimestamp() });
      setProducts(prev => prev.map(p => p.id === product.id ? { ...p, [field]: newStatus, updatedAt: new Date() } : p));
      toast({ title: `Product ${field === 'isActive' ? (newStatus ? 'Activated' : 'Deactivated') : field === 'isFeatured' ? (newStatus ? 'Featured' : 'Unfeatured') : (newStatus ? "Set as Today's Pick" : "Removed from Today's Picks")}` });
    } catch (err) {
      console.error(`Error toggling product ${field} status:`, err);
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
        <CardHeader><CardTitle>Filter & Search</CardTitle><CardDescription>Search by product name or filter by store.</CardDescription></CardHeader>
        <CardContent className="flex flex-col sm:flex-row gap-4">
          <form onSubmit={handleSearchSubmit} className="flex-1 flex gap-2">
            <Input type="search" placeholder="Search by Product Name..." value={searchTermInput} onChange={(e) => setSearchTermInput(e.target.value)} disabled={isSearching || loading} className="h-10 text-base"/>
            <Button type="submit" disabled={isSearching || loading || loadingOptions} className="h-10">{isSearching || (loading && debouncedSearchTerm) ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}<span className="sr-only sm:not-sr-only sm:ml-2">Search</span></Button>
          </form>
          <div className="flex-1">
            <Select value={filterStoreId} onValueChange={(value) => setFilterStoreId(value)} disabled={isSearching || loading || loadingOptions}>
                <SelectTrigger className="h-10"><SelectValue placeholder={loadingOptions ? "Loading stores..." : "Filter by Store..."} /></SelectTrigger>
                <SelectContent>
                    <SelectItem value="all">All Stores</SelectItem>
                    {storeList.map(store => (<SelectItem key={store.id} value={store.id}>{store.name}</SelectItem>))}
                </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Product List</CardTitle><CardDescription>View and manage products.</CardDescription></CardHeader>
        <CardContent>
          {loading && products.length === 0 && !pageError ? <ProductsTableSkeleton /> : !loading && products.length === 0 && !pageError ? (
            <p className="text-center text-muted-foreground py-8">{debouncedSearchTerm || filterStoreId !== 'all' ? `No products found matching criteria.` : "No products found."}</p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Image</TableHead>
                    <TableHead>Name</TableHead>
                    <TableHead>Store</TableHead>
                    <TableHead>Price</TableHead>
                    <TableHead>Featured</TableHead>
                    <TableHead>Today's Pick</TableHead>
                    <TableHead>Active</TableHead>
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
                      <TableCell className="text-xs">{product.priceDisplay || (product.price !== null && product.price !== undefined ? formatCurrency(product.price) : '-')}</TableCell>
                      <TableCell>
                          <Switch id={`featured-${product.id}`} checked={!!product.isFeatured} onCheckedChange={() => handleToggleStatus(product, 'isFeatured')} disabled={updatingProductId === product.id} aria-label="Toggle Featured"/>
                      </TableCell>
                       <TableCell>
                          <Switch id={`todaysPick-${product.id}`} checked={!!product.isTodaysPick} onCheckedChange={() => handleToggleStatus(product, 'isTodaysPick')} disabled={updatingProductId === product.id} aria-label="Toggle Today's Pick"/>
                      </TableCell>
                      <TableCell>
                        <Switch id={`active-${product.id}`} checked={product.isActive} onCheckedChange={() => handleToggleStatus(product, 'isActive')} disabled={updatingProductId === product.id} aria-label="Toggle Active" />
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
            <div className="mt-6 text-center"><Button onClick={handleLoadMore} disabled={loadingMore || loadingOptions}>{loadingMore && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Load More</Button></div>
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
              <Label htmlFor="storeIdDialog">Store*</Label>
              <Controller name="storeId" control={form.control} render={({ field }) => (
                <Select value={field.value} onValueChange={field.onChange} disabled={isSaving || loadingOptions}>
                  <SelectTrigger id="storeIdDialog"><SelectValue placeholder={loadingOptions ? "Loading..." : "Select store"} /></SelectTrigger>
                  <SelectContent>{storeList.map(s => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}</SelectContent>
                </Select>
              )} />
              {form.formState.errors.storeId && <p className="text-sm text-destructive text-right">{form.formState.errors.storeId.message}</p>}
            </div>
             {/* Category Selector */}
            <div className="space-y-1 md:col-span-1">
              <Label htmlFor="categoryDialog">Category</Label>
              <Controller name="category" control={form.control} render={({ field }) => (
                <Select value={field.value || ''} onValueChange={field.onChange} disabled={isSaving || loadingOptions}>
                  <SelectTrigger id="categoryDialog"><SelectValue placeholder={loadingOptions ? "Loading..." : "Select category"} /></SelectTrigger>
                  <SelectContent>{categoryList.map(c => <SelectItem key={c.slug} value={c.slug}>{c.name}</SelectItem>)}</SelectContent>
                </Select>
              )} />
               {form.formState.errors.category && <p className="text-sm text-destructive text-right">{form.formState.errors.category.message}</p>}
            </div>
            {/* Name */}
            <div className="space-y-1 md:col-span-2">
              <Label htmlFor="nameDialog">Product Name*</Label>
              <Input id="nameDialog" {...form.register('name')} disabled={isSaving} />
              {form.formState.errors.name && <p className="text-sm text-destructive text-right">{form.formState.errors.name.message}</p>}
            </div>
            {/* Image URL */}
            <div className="space-y-1 md:col-span-2">
              <Label htmlFor="imageUrlDialog">Image URL</Label>
              <Input id="imageUrlDialog" {...form.register('imageUrl')} placeholder="https://example.com/image.jpg" disabled={isSaving} />
              {form.watch('imageUrl') && form.formState.errors.imageUrl?.type !== 'invalid_string' && <Image src={form.watch('imageUrl')!} alt="Preview" width={80} height={80} className="mt-1 object-contain border rounded-sm" data-ai-hint="product image preview"/>}
              {form.formState.errors.imageUrl && <p className="text-sm text-destructive text-right">{form.formState.errors.imageUrl.message}</p>}
            </div>
            {/* Data AI Hint */}
            <div className="space-y-1 md:col-span-2">
                <Label htmlFor="dataAiHintDialog">Image AI Hint</Label>
                <Input id="dataAiHintDialog" {...form.register('dataAiHint')} placeholder="e.g., blue running shoe" disabled={isSaving} />
                 {form.formState.errors.dataAiHint && <p className="text-sm text-destructive text-right">{form.formState.errors.dataAiHint.message}</p>}
            </div>
            {/* Affiliate Link */}
            <div className="space-y-1 md:col-span-2">
              <Label htmlFor="affiliateLinkDialog">Affiliate Link*</Label>
              <Input id="affiliateLinkDialog" {...form.register('affiliateLink')} placeholder="https://tracking.link/product" disabled={isSaving} />
              {form.formState.errors.affiliateLink && <p className="text-sm text-destructive text-right">{form.formState.errors.affiliateLink.message}</p>}
            </div>
            {/* Price & Price Display */}
            <div className="grid grid-cols-2 gap-4 md:col-span-2">
                <div className="space-y-1">
                  <Label htmlFor="priceDialog">Price (Numeric, Optional)</Label>
                  <Input id="priceDialog" type="number" step="0.01" {...form.register('price', { setValueAs: (v) => (v === "" || v === null || isNaN(parseFloat(v)) ? null : parseFloat(v)) })} placeholder="e.g., 2499.00" disabled={isSaving} />
                   {form.formState.errors.price && <p className="text-sm text-destructive text-right">{form.formState.errors.price.message}</p>}
                </div>
                <div className="space-y-1">
                  <Label htmlFor="priceDisplayDialog">Price Display Text (Optional)</Label>
                  <Input id="priceDisplayDialog" {...form.register('priceDisplay')} placeholder="e.g., ₹2,499 or Sale Price" disabled={isSaving} />
                   {form.formState.errors.priceDisplay && <p className="text-sm text-destructive text-right">{form.formState.errors.priceDisplay.message}</p>}
                </div>
            </div>
            {/* Brand & SKU */}
            <div className="grid grid-cols-2 gap-4 md:col-span-2">
              <div className="space-y-1">
                <Label htmlFor="brandDialog">Brand (Optional)</Label><Input id="brandDialog" {...form.register('brand')} disabled={isSaving} />
                {form.formState.errors.brand && <p className="text-sm text-destructive text-right">{form.formState.errors.brand.message}</p>}
              </div>
              <div className="space-y-1">
                <Label htmlFor="skuDialog">SKU (Optional)</Label><Input id="skuDialog" {...form.register('sku')} disabled={isSaving} />
                {form.formState.errors.sku && <p className="text-sm text-destructive text-right">{form.formState.errors.sku.message}</p>}
              </div>
            </div>
            {/* Description */}
            <div className="space-y-1 md:col-span-2">
              <Label htmlFor="descriptionDialog">Description (Optional)</Label>
              <Textarea id="descriptionDialog" {...form.register('description')} rows={3} placeholder="Detailed product description" disabled={isSaving} />
              {form.formState.errors.description && <p className="text-sm text-destructive text-right">{form.formState.errors.description.message}</p>}
            </div>
            {/* Flags */}
            <div className="md:col-span-2 space-y-3 pt-2">
              <div className="flex items-center space-x-2">
                <Controller name="isActive" control={form.control} render={({ field }) => (<Checkbox id="isActiveDialog" checked={field.value} onCheckedChange={field.onChange} disabled={isSaving} />)} />
                <Label htmlFor="isActiveDialog" className="font-normal">Active</Label>
              </div>
              <div className="flex items-center space-x-2">
                <Controller name="isFeatured" control={form.control} render={({ field }) => (<Checkbox id="isFeaturedDialog" checked={!!field.value} onCheckedChange={field.onChange} disabled={isSaving} />)} />
                <Label htmlFor="isFeaturedDialog" className="font-normal">Featured</Label>
              </div>
              <div className="flex items-center space-x-2">
                <Controller name="isTodaysPick" control={form.control} render={({ field }) => (<Checkbox id="isTodaysPickDialog" checked={!!field.value} onCheckedChange={field.onChange} disabled={isSaving} />)} />
                <Label htmlFor="isTodaysPickDialog" className="font-normal">Today's Pick</Label>
              </div>
            </div>
            <DialogFooter className="md:col-span-2">
              <DialogClose asChild><Button type="button" variant="outline" disabled={isSaving}>Cancel</Button></DialogClose>
              <Button type="submit" disabled={isSaving || loadingOptions}>{isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}{editingProduct ? 'Save Changes' : 'Add Product'}</Button>
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

export default function AdminProductsListPage() {
  return <AdminGuard><AdminProductsPageContent /></AdminGuard>;
}
