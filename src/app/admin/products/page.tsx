
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
import type { Product, Store, Category, ProductFormValues as ProductFormType } from '@/lib/types';
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
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { AlertCircle, Loader2, Search, Edit, Trash2, PlusCircle, Package, ExternalLink, Star } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogClose,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import AdminGuard from '@/components/guards/admin-guard';
import Image from 'next/image';
import { Switch } from '@/components/ui/switch';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { MoreHorizontal } from "lucide-react";
import { formatCurrency, safeToDate } from '@/lib/utils';
import { MultiSelect } from '@/components/ui/multi-select'; // Assuming MultiSelect is for categories
import { useDebounce } from '@/hooks/use-debounce';

const PRODUCTS_PER_PAGE = 15;

const productSchema = z.object({
  name: z.string().min(3, 'Product name must be at least 3 characters').max(150, 'Product name too long'),
  storeId: z.string().min(1, 'Store is required'),
  description: z.string().optional().nullable(),
  imageUrl: z.string().url('Invalid URL format').optional().or(z.literal('')).nullable(),
  affiliateLink: z.string().url('Affiliate link must be a valid URL'),
  price: z.number().min(0, 'Price must be non-negative').optional().nullable(),
  priceDisplay: z.string().optional().nullable(),
  category: z.string().optional().nullable(), // Assuming single category slug for simplicity in form
  brand: z.string().optional().nullable(),
  sku: z.string().optional().nullable(),
  isActive: z.boolean().default(true),
  isFeatured: z.boolean().default(false),
  isTodaysPick: z.boolean().default(false),
  dataAiHint: z.string().max(50, 'AI Hint too long').optional().nullable(),
});

type ProductFormValues = z.infer<typeof productSchema>;

interface ProductWithStoreCategoryNames extends Product {
  storeName?: string;
  categoryName?: string;
}

function ProductsTableSkeleton() {
  return (
    <Card>
      <CardHeader>
        <Skeleton className="h-7 w-1/3 mb-1" />
        <Skeleton className="h-4 w-2/3" />
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                {Array.from({ length: 9 }).map((_, i) => <TableHead key={i}><Skeleton className="h-5 w-full" /></TableHead>)}
              </TableRow>
            </TableHeader>
            <TableBody>
              {Array.from({ length: 8 }).map((_, i) => (
                <TableRow key={i}>
                  {Array.from({ length: 9 }).map((_, j) => <TableCell key={j}><Skeleton className="h-5 w-full" /></TableCell>)}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}

export default function AdminProductsListPage() {
  const [products, setProducts] = useState<ProductWithStoreCategoryNames[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastVisible, setLastVisible] = useState<QueryDocumentSnapshot<DocumentData> | null>(null);
  const [hasMore, setHasMore] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const { toast } = useToast();
  const router = useRouter();

  const [searchTermInput, setSearchTermInput] = useState('');
  const debouncedSearchTerm = useDebounce(searchTermInput, 500);
  const [isSearching, setIsSearching] = useState(false);

  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<ProductWithStoreCategoryNames | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [deletingProductId, setDeletingProductId] = useState<string | null>(null);
  const [updatingFieldId, setUpdatingFieldId] = useState<string | null>(null);

  const [storeList, setStoreList] = useState<{ id: string; name: string }[]>([]);
  const [categoryList, setCategoryList] = useState<{ value: string; label: string }[]>([]); // For MultiSelect or Select
  const [loadingRelatedData, setLoadingRelatedData] = useState(true);

  const form = useForm<ProductFormValues>({
    resolver: zodResolver(productSchema),
    defaultValues: {
      name: '',
      storeId: '',
      description: '',
      imageUrl: '',
      affiliateLink: '',
      price: 0,
      priceDisplay: '',
      category: '',
      brand: '',
      sku: '',
      isActive: true,
      isFeatured: false,
      isTodaysPick: false,
      dataAiHint: '',
    },
  });

  useEffect(() => {
    let isMounted = true;
    const fetchRelatedData = async () => {
      if (!db || firebaseInitializationError) {
        if (isMounted) setError(firebaseInitializationError || "DB error for related data.");
        setLoadingRelatedData(false);
        return;
      }
      try {
        const [storeSnapshot, categorySnapshot] = await Promise.all([
          getDocs(query(collection(db, 'stores'), orderBy('name'))),
          getDocs(query(collection(db, 'categories'), orderBy('name')))
        ]);
        if (isMounted) {
          setStoreList(storeSnapshot.docs.map(doc => ({ id: doc.id, name: doc.data().name || 'Unnamed Store' })));
          setCategoryList(categorySnapshot.docs.map(doc => ({ value: doc.id, label: doc.data().name || 'Unnamed Category' })));
        }
      } catch (err) {
        console.error("Error fetching stores/categories:", err);
        if (isMounted) toast({ variant: 'destructive', title: 'Error', description: 'Could not load stores or categories.' });
      } finally {
        if (isMounted) setLoadingRelatedData(false);
      }
    };
    fetchRelatedData();
    return () => { isMounted = false; };
  }, [toast]);

  const fetchProducts = useCallback(async (
    isLoadMoreOp: boolean,
    currentSearchTerm: string,
    docToStartAfter: QueryDocumentSnapshot<DocumentData> | null
  ) => {
    let isMounted = true;
    if (!db || firebaseInitializationError) {
      if (isMounted) {
        setError(firebaseInitializationError || "Database connection not available.");
        if (!isLoadMoreOp) setLoading(false); else setLoadingMore(false);
        setHasMore(false);
      }
      return () => { isMounted = false; };
    }

    if (!isLoadMoreOp) {
      setLoading(true); setProducts([]); setLastVisible(null); setHasMore(true);
    } else {
      if (!docToStartAfter && isLoadMoreOp) {
          if(isMounted) setLoadingMore(false);
          return () => {isMounted = false;};
      }
      setLoadingMore(true);
    }
    if(!isLoadMoreOp) setError(null);
    setIsSearching(currentSearchTerm !== '');

    try {
      const productsCollection = collection(db, 'products');
      const constraints: QueryConstraint[] = [];

      if (currentSearchTerm) {
        constraints.push(orderBy('name'));
        constraints.push(where('name', '>=', currentSearchTerm));
        constraints.push(where('name', '<=', currentSearchTerm + '\uf8ff'));
      } else {
        constraints.push(orderBy('updatedAt', 'desc'));
      }

      if (isLoadMoreOp && docToStartAfter) {
        constraints.push(startAfter(docToStartAfter));
      }
      constraints.push(limit(PRODUCTS_PER_PAGE));

      const productSnap = await getDocs(query(productsCollection, ...constraints));
      
      const fetchedProductsPromises = productSnap.docs.map(async (docSnap) => {
        const data = docSnap.data();
        let storeName = 'N/A';
        let categoryName = 'N/A';
        if (data.storeId && db) {
            const storeDoc = await getDoc(doc(db, 'stores', data.storeId));
            if (storeDoc.exists()) storeName = storeDoc.data()?.name || 'Unknown Store';
        }
        if (data.category && db) { // Assuming category stores category ID
            const catDoc = await getDoc(doc(db, 'categories', data.category));
            if (catDoc.exists()) categoryName = catDoc.data()?.name || 'Unknown Category';
        }
        return {
          id: docSnap.id,
          ...data,
          storeName,
          categoryName,
          createdAt: safeToDate(data.createdAt),
          updatedAt: safeToDate(data.updatedAt),
        } as ProductWithStoreCategoryNames;
      });

      const productsWithDetails = await Promise.all(fetchedProductsPromises);

      if(isMounted){
        setProducts(prev => isLoadMoreOp ? [...prev, ...productsWithDetails] : productsWithDetails);
        setLastVisible(productSnap.docs[productSnap.docs.length - 1] || null);
        setHasMore(productSnap.docs.length === PRODUCTS_PER_PAGE);
      }
    } catch (err) {
      console.error("Error fetching products:", err);
      const errorMsg = err instanceof Error ? err.message : "Failed to fetch products.";
      if(isMounted) {
        setError(errorMsg);
        toast({ variant: "destructive", title: "Fetch Error", description: errorMsg });
      }
    } finally {
      if(isMounted){
        if (!isLoadMoreOp) setLoading(false); else setLoadingMore(false);
        setIsSearching(false);
      }
    }
    return () => { isMounted = false; };
  }, [toast]);

  useEffect(() => {
    fetchProducts(false, debouncedSearchTerm, null);
  }, [debouncedSearchTerm, fetchProducts]);

  const handleSearchSubmit = (e: React.FormEvent) => e.preventDefault();

  const handleLoadMore = () => {
    if (!loadingMore && hasMore && lastVisible) {
      fetchProducts(true, debouncedSearchTerm, lastVisible);
    }
  };

  const openAddDialog = () => router.push('/admin/products/new');

  const openEditDialog = (product: ProductWithStoreCategoryNames) => {
    setEditingProduct(product);
    form.reset({
      name: product.name,
      storeId: product.storeId,
      description: product.description || '',
      imageUrl: product.imageUrl || '',
      affiliateLink: product.affiliateLink,
      price: product.price ?? 0,
      priceDisplay: product.priceDisplay || '',
      category: product.category || '',
      brand: product.brand || '',
      sku: product.sku || '',
      isActive: product.isActive,
      isFeatured: product.isFeatured || false,
      isTodaysPick: product.isTodaysPick || false,
      dataAiHint: product.dataAiHint || '',
    });
    setIsDialogOpen(true);
  };

  const onSubmit = async (data: ProductFormValues) => {
    if (!db) { setError("Database not available."); setIsSaving(false); return; }
    setIsSaving(true); setError(null);

    const submissionData: Partial<ProductFormType> = {
      ...data,
      imageUrl: data.imageUrl || null,
      description: data.description || null,
      price: data.price === null ? null : Number(data.price),
      priceDisplay: data.priceDisplay || (data.price !== null ? formatCurrency(Number(data.price)) : null),
      category: data.category || null,
      brand: data.brand || null,
      sku: data.sku || null,
      dataAiHint: data.dataAiHint || null,
    };

    try {
      if (editingProduct) {
        const productDocRef = doc(db, 'products', editingProduct.id);
        await updateDoc(productDocRef, { ...submissionData, updatedAt: serverTimestamp() });
        setProducts(prev => prev.map(p => p.id === editingProduct.id ? { 
            ...p, 
            ...submissionData, 
            storeName: storeList.find(s => s.id === submissionData.storeId)?.name || p.storeName,
            categoryName: categoryList.find(c => c.value === submissionData.category)?.label || p.categoryName,
            updatedAt: new Date() 
        } as ProductWithStoreCategoryNames : p));
        toast({ title: "Product Updated", description: `${data.name} details saved.` });
      }
      setIsDialogOpen(false); form.reset();
    } catch (err) {
      console.error("Error saving product:", err);
      const errorMsg = err instanceof Error ? err.message : "Could not save product.";
      setError(errorMsg); toast({ variant: "destructive", title: "Save Failed", description: errorMsg });
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeleteProduct = async (productId: string) => {
    if (!productId || !db) return;
    setDeletingProductId(productId);
    try {
      await deleteDoc(doc(db, 'products', productId));
      setProducts(prev => prev.filter(p => p.id !== productId));
      toast({ title: "Product Deleted" });
    } catch (err) {
      console.error("Error deleting product:", err);
      toast({ variant: "destructive", title: "Deletion Failed", description: String(err) });
    } finally {
      setDeletingProductId(null);
    }
  };

  const handleToggleField = async (product: Product, field: 'isActive' | 'isFeatured' | 'isTodaysPick') => {
    if (!db) return;
    setUpdatingFieldId(product.id);
    const newValue = !product[field];
    try {
      await updateDoc(doc(db, 'products', product.id), { [field]: newValue, updatedAt: serverTimestamp() });
      setProducts(prev => prev.map(p => p.id === product.id ? { ...p, [field]: newValue, updatedAt: new Date() } : p));
      toast({ title: `Product ${field} status updated` });
    } catch (err) {
      console.error(`Error toggling ${field}:`, err);
      toast({ variant: "destructive", title: "Update Failed", description: String(err) });
    } finally {
      setUpdatingFieldId(null);
    }
  };

  if (loading && products.length === 0 && !error) {
    return <ProductsTableSkeleton />;
  }

  return (
    <AdminGuard>
      <div className="space-y-6">
        <div className="flex justify-between items-center">
          <h1 className="text-3xl font-bold flex items-center gap-2"><Package className="w-7 h-7" /> Manage Products</h1>
          <Button onClick={openAddDialog}>
            <PlusCircle className="mr-2 h-4 w-4" /> Add New Product
          </Button>
        </div>

        {error && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>Error</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        <Card>
          <CardHeader>
            <CardTitle>Filter & Search Products</CardTitle>
            <CardDescription>Search by product name.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col sm:flex-row gap-4">
            <form onSubmit={handleSearchSubmit} className="flex-1 flex gap-2">
              <Input
                type="search"
                placeholder="Search by Product Name..."
                value={searchTermInput}
                onChange={(e) => setSearchTermInput(e.target.value)}
                disabled={isSearching || loading}
                className="h-10 text-base"
              />
              <Button type="submit" disabled={isSearching || loading} className="h-10">
                {isSearching || (loading && debouncedSearchTerm) ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
                <span className="sr-only sm:not-sr-only sm:ml-2">Search</span>
              </Button>
            </form>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Product List</CardTitle>
            <CardDescription>View and manage products.</CardDescription>
          </CardHeader>
          <CardContent>
            {loading && products.length === 0 ? (
              <ProductsTableSkeleton />
            ) : !loading && products.length === 0 && !error ? (
              <p className="text-center text-muted-foreground py-8">
                {debouncedSearchTerm ? `No products found matching "${debouncedSearchTerm}".` : "No products found."}
              </p>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Image</TableHead>
                      <TableHead>Name</TableHead>
                      <TableHead>Store</TableHead>
                      <TableHead>Category</TableHead>
                      <TableHead>Price</TableHead>
                      <TableHead className="text-center">Active</TableHead>
                      <TableHead className="text-center">Featured</TableHead>
                      <TableHead className="text-center">Today's Pick</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {products.map((product) => (
                      <TableRow key={product.id} className={!product.isActive ? 'opacity-50 bg-muted/30' : ''}>
                        <TableCell>
                          {product.imageUrl ? (
                            <Image src={product.imageUrl} alt={product.name} width={50} height={50} className="rounded-sm object-contain" data-ai-hint={product.dataAiHint || "product image"} />
                          ) : (
                            <div className="w-[50px] h-[50px] bg-muted flex items-center justify-center text-xs text-muted-foreground rounded-sm"><Package className="w-6 h-6"/></div>
                          )}
                        </TableCell>
                        <TableCell className="font-medium max-w-xs truncate" title={product.name}>{product.name}</TableCell>
                        <TableCell className="text-xs">{product.storeName || product.storeId}</TableCell>
                        <TableCell className="text-xs">{product.categoryName || product.category || 'N/A'}</TableCell>
                        <TableCell>{product.priceDisplay || (product.price ? formatCurrency(product.price) : 'N/A')}</TableCell>
                        <TableCell className="text-center">
                          <Switch checked={product.isActive} onCheckedChange={() => handleToggleField(product, 'isActive')} disabled={updatingFieldId === product.id}/>
                        </TableCell>
                        <TableCell className="text-center">
                          <Switch checked={!!product.isFeatured} onCheckedChange={() => handleToggleField(product, 'isFeatured')} disabled={updatingFieldId === product.id}/>
                        </TableCell>
                        <TableCell className="text-center">
                          <Switch checked={!!product.isTodaysPick} onCheckedChange={() => handleToggleField(product, 'isTodaysPick')} disabled={updatingFieldId === product.id}/>
                           {updatingFieldId === product.id && <Loader2 className="h-4 w-4 animate-spin ml-2 inline-block" />}
                        </TableCell>
                        <TableCell className="text-right">
                          <AlertDialog>
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button variant="ghost" className="h-8 w-8 p-0">
                                  <span className="sr-only">Open menu</span>
                                  <MoreHorizontal className="h-4 w-4" />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end">
                                <DropdownMenuLabel>Actions</DropdownMenuLabel>
                                <DropdownMenuItem onClick={() => openEditDialog(product)}>
                                  <Edit className="mr-2 h-4 w-4" /> Edit
                                </DropdownMenuItem>
                                <DropdownMenuItem onClick={() => window.open(product.affiliateLink, '_blank')}>
                                  <ExternalLink className="mr-2 h-4 w-4" /> Visit Link
                                </DropdownMenuItem>
                                <DropdownMenuSeparator />
                                <AlertDialogTrigger asChild>
                                  <Button variant="ghost" className="w-full justify-start px-2 py-1.5 text-sm font-normal text-destructive hover:bg-destructive/10 focus:text-destructive focus:bg-destructive/10 h-auto relative flex cursor-default select-none items-center rounded-sm outline-none transition-colors data-[disabled]:pointer-events-none data-[disabled]:opacity-50">
                                    <Trash2 className="mr-2 h-4 w-4" /> Delete
                                  </Button>
                                </AlertDialogTrigger>
                              </DropdownMenuContent>
                            </DropdownMenu>
                            <AlertDialogContent>
                              <AlertDialogHeader>
                                <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
                                <AlertDialogDescription>
                                  This action cannot be undone. This will permanently delete the product "{product.name}".
                                </AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel onClick={() => setDeletingProductId(null)}>Cancel</AlertDialogCancel>
                                <AlertDialogAction onClick={() => handleDeleteProduct(product.id)} className="bg-destructive hover:bg-destructive/90">
                                  {deletingProductId === product.id ? <Loader2 className="mr-2 h-4 w-4 animate-spin"/> : null} Delete
                                </AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
            {hasMore && !loading && products.length > 0 && (
              <div className="mt-6 text-center">
                <Button onClick={handleLoadMore} disabled={loadingMore}>
                  {loadingMore ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                  Load More Products
                </Button>
              </div>
            )}
            {loadingMore && <div className="text-center py-4"><Loader2 className="h-6 w-6 animate-spin text-primary mx-auto" /></div>}
          </CardContent>
        </Card>

        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>{editingProduct ? 'Edit Product' : 'Add New Product'}</DialogTitle>
              <DialogDescription>
                {editingProduct ? `Update details for ${editingProduct.name}.` : 'Enter the details for the new product.'}
              </DialogDescription>
            </DialogHeader>
            <form onSubmit={form.handleSubmit(onSubmit)} className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-4 py-4">
              <div className="md:col-span-2 space-y-1">
                <Label htmlFor="nameEdit">Name*</Label>
                <Input id="nameEdit" {...form.register('name')} disabled={isSaving || loadingRelatedData} />
                {form.formState.errors.name && <p className="text-sm text-destructive mt-1">{form.formState.errors.name.message}</p>}
              </div>
              <div className="space-y-1">
                <Label htmlFor="storeIdEdit">Store*</Label>
                <Controller name="storeId" control={form.control} render={({ field }) => (
                  <Select value={field.value} onValueChange={field.onChange} disabled={isSaving || loadingRelatedData}>
                    <SelectTrigger id="storeIdEdit"><SelectValue placeholder="Select store..." /></SelectTrigger>
                    <SelectContent>
                      {storeList.length === 0 && <SelectItem value="loading" disabled>Loading stores...</SelectItem>}
                      {storeList.map(store => <SelectItem key={store.id} value={store.id}>{store.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                )}/>
                {form.formState.errors.storeId && <p className="text-sm text-destructive mt-1">{form.formState.errors.storeId.message}</p>}
              </div>
              <div className="space-y-1">
                <Label htmlFor="categoryEdit">Category</Label>
                 <Controller name="category" control={form.control} render={({ field }) => (
                  <Select value={field.value || ""} onValueChange={field.onChange} disabled={isSaving || loadingRelatedData}>
                    <SelectTrigger id="categoryEdit"><SelectValue placeholder="Select category..." /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="">No Category</SelectItem>
                      {categoryList.length === 0 && !loadingRelatedData && <SelectItem value="loading-cat" disabled>No categories found</SelectItem>}
                      {loadingRelatedData && <SelectItem value="loading-cat-true" disabled>Loading categories...</SelectItem>}
                      {categoryList.map(cat => <SelectItem key={cat.value} value={cat.value}>{cat.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                )}/>
                {form.formState.errors.category && <p className="text-sm text-destructive mt-1">{form.formState.errors.category.message}</p>}
              </div>
              <div className="md:col-span-2 space-y-1">
                <Label htmlFor="descriptionEdit">Description</Label>
                <Textarea id="descriptionEdit" {...form.register('description')} rows={3} disabled={isSaving || loadingRelatedData} />
                {form.formState.errors.description && <p className="text-sm text-destructive mt-1">{form.formState.errors.description.message}</p>}
              </div>
               <div className="space-y-1">
                <Label htmlFor="imageUrlEdit">Image URL</Label>
                <Input id="imageUrlEdit" {...form.register('imageUrl')} placeholder="https://..." disabled={isSaving || loadingRelatedData} />
                {form.watch('imageUrl') && <Image src={form.watch('imageUrl')!} alt="Preview" width={80} height={80} className="object-contain border rounded-sm mt-1" data-ai-hint="product image preview" />}
                {form.formState.errors.imageUrl && <p className="text-sm text-destructive mt-1">{form.formState.errors.imageUrl.message}</p>}
              </div>
              <div className="space-y-1">
                <Label htmlFor="dataAiHintEdit">Image AI Hint</Label>
                <Input id="dataAiHintEdit" {...form.register('dataAiHint')} placeholder="e.g. red shoe" disabled={isSaving || loadingRelatedData} />
                {form.formState.errors.dataAiHint && <p className="text-sm text-destructive mt-1">{form.formState.errors.dataAiHint.message}</p>}
              </div>
              <div className="md:col-span-2 space-y-1">
                <Label htmlFor="affiliateLinkEdit">Affiliate Link*</Label>
                <Input id="affiliateLinkEdit" {...form.register('affiliateLink')} placeholder="https://..." disabled={isSaving || loadingRelatedData} />
                {form.formState.errors.affiliateLink && <p className="text-sm text-destructive mt-1">{form.formState.errors.affiliateLink.message}</p>}
              </div>
              <div className="space-y-1">
                <Label htmlFor="priceEdit">Price (Number)</Label>
                <Input id="priceEdit" type="number" step="0.01" {...form.register('price', { setValueAs: v => v === null || v === '' ? null : parseFloat(v) })} disabled={isSaving || loadingRelatedData} />
                {form.formState.errors.price && <p className="text-sm text-destructive mt-1">{form.formState.errors.price.message}</p>}
              </div>
              <div className="space-y-1">
                <Label htmlFor="priceDisplayEdit">Price Display Text</Label>
                <Input id="priceDisplayEdit" {...form.register('priceDisplay')} placeholder="e.g. ₹1,999 or Sale!" disabled={isSaving || loadingRelatedData} />
                {form.formState.errors.priceDisplay && <p className="text-sm text-destructive mt-1">{form.formState.errors.priceDisplay.message}</p>}
              </div>
              <div className="space-y-1">
                <Label htmlFor="brandEdit">Brand</Label>
                <Input id="brandEdit" {...form.register('brand')} disabled={isSaving || loadingRelatedData} />
              </div>
              <div className="space-y-1">
                <Label htmlFor="skuEdit">SKU</Label>
                <Input id="skuEdit" {...form.register('sku')} disabled={isSaving || loadingRelatedData} />
              </div>
              <div className="md:col-span-2 grid grid-cols-3 gap-4 pt-2">
                <div className="flex items-center space-x-2">
                  <Controller name="isActive" control={form.control} render={({ field }) => (<Checkbox id="isActiveEdit" checked={field.value} onCheckedChange={field.onChange} disabled={isSaving || loadingRelatedData} /> )} />
                  <Label htmlFor="isActiveEdit" className="font-normal">Active</Label>
                </div>
                <div className="flex items-center space-x-2">
                   <Controller name="isFeatured" control={form.control} render={({ field }) => (<Checkbox id="isFeaturedEdit" checked={field.value} onCheckedChange={field.onChange} disabled={isSaving || loadingRelatedData} /> )}/>
                  <Label htmlFor="isFeaturedEdit" className="font-normal">Featured</Label>
                </div>
                <div className="flex items-center space-x-2">
                  <Controller name="isTodaysPick" control={form.control} render={({ field }) => ( <Checkbox id="isTodaysPickEdit" checked={field.value} onCheckedChange={field.onChange} disabled={isSaving || loadingRelatedData} /> )}/>
                  <Label htmlFor="isTodaysPickEdit" className="font-normal">Today's Pick</Label>
                </div>
              </div>
              <DialogFooter className="md:col-span-2">
                <DialogClose asChild>
                  <Button type="button" variant="outline" disabled={isSaving}>Cancel</Button>
                </DialogClose>
                <Button type="submit" disabled={isSaving || loadingRelatedData}>
                  {isSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                  {editingProduct ? 'Save Changes' : 'Add Product'}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>
    </AdminGuard>
  );
}

