
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
  addDoc,
  getDoc
} from 'firebase/firestore';
import { db, firebaseInitializationError } from '@/lib/firebase/config';
import type { Category, CategoryFormValues as CategoryFormType } from '@/lib/types';
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
import { AlertCircle, Loader2, Search, Edit, Trash2, PlusCircle, CheckCircle, XCircle, Building2, UploadCloud } from 'lucide-react';
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
  DialogTrigger,
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
import { format, isValid } from 'date-fns';
import { cn, safeToDate } from '@/lib/utils';
import Image from 'next/image';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { MoreHorizontal } from "lucide-react";
import { useDebounce } from '@/hooks/use-debounce';
import { Switch } from '@/components/ui/switch';

const CATEGORIES_PER_PAGE = 20;

const categorySchema = z.object({
  name: z.string().min(2, 'Category name must be at least 2 characters').max(50, 'Name too long'),
  slug: z.string().min(2, 'Slug must be at least 2 characters').max(50, 'Slug too long').regex(/^[a-z0-9-]+$/, 'Slug can only contain lowercase letters, numbers, and hyphens'),
  description: z.string().max(200, "Description too long").optional().nullable(),
  imageUrl: z.string().url('Invalid URL format').optional().or(z.literal('')).nullable(),
  order: z.number().min(0, 'Order must be a non-negative number').default(0),
  isActive: z.boolean().default(true),
  dataAiHint: z.string().max(50, 'AI Hint too long').optional().nullable(),
});

type CategoryFormValues = z.infer<typeof categorySchema>;

function CategoriesTableSkeleton() {
  return (
    <Card>
      <CardHeader>
        <Skeleton className="h-6 w-1/4 mb-2" />
        <Skeleton className="h-4 w-1/2" />
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                {Array.from({ length: 7 }).map((_, index) => (
                  <TableHead key={index}><Skeleton className="h-5 w-full" /></TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {Array.from({ length: 5 }).map((_, rowIndex) => (
                <TableRow key={rowIndex}>
                  {Array.from({ length: 7 }).map((_, colIndex) => (
                    <TableCell key={colIndex}><Skeleton className="h-5 w-full" /></TableCell>
                  ))}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}

export default function AdminCategoriesPage() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastVisible, setLastVisible] = useState<QueryDocumentSnapshot<DocumentData> | null>(null);
  const [hasMore, setHasMore] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const { toast } = useToast();

  const [searchTermInput, setSearchTermInput] = useState('');
  const debouncedSearchTerm = useDebounce(searchTermInput, 500);
  const [isSearching, setIsSearching] = useState(false);

  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingCategory, setEditingCategory] = useState<Category | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [deletingCategoryId, setDeletingCategoryId] = useState<string | null>(null);
  const [updatingFieldId, setUpdatingFieldId] = useState<string | null>(null);

  const form = useForm<CategoryFormValues>({
    resolver: zodResolver(categorySchema),
    defaultValues: {
      name: '',
      slug: '',
      description: '',
      imageUrl: '',
      order: 0,
      isActive: true,
      dataAiHint: '',
    },
  });

  const fetchCategories = useCallback(async (
    isLoadMoreOperation: boolean,
    currentSearchTerm: string,
    docToStartAfter: QueryDocumentSnapshot<DocumentData> | null
  ) => {
    let isMounted = true;
    if (!db || firebaseInitializationError) {
      if(isMounted) {
        setError(firebaseInitializationError || "Database connection not available.");
        if(!isLoadMoreOperation) setLoading(false); else setLoadingMore(false);
        setHasMore(false);
      }
      return () => {isMounted = false;};
    }

    if (!isLoadMoreOperation) {
      setLoading(true); setCategories([]); setLastVisible(null); setHasMore(true);
    } else {
      if (!docToStartAfter && isLoadMoreOperation) {
          if(isMounted) setLoadingMore(false);
          return () => {isMounted = false;};
      }
      setLoadingMore(true);
    }
    if(!isLoadMoreOperation) setError(null);
    setIsSearching(currentSearchTerm !== '');

    try {
      const categoriesCollection = collection(db, 'categories');
      const constraints: QueryConstraint[] = [];

      if (currentSearchTerm) {
        constraints.push(orderBy('name'));
        constraints.push(where('name', '>=', currentSearchTerm));
        constraints.push(where('name', '<=', currentSearchTerm + '\uf8ff'));
      } else {
        constraints.push(orderBy('order', 'asc'));
        constraints.push(orderBy('name', 'asc'));
      }

      if (isLoadMoreOperation && docToStartAfter) {
        constraints.push(startAfter(docToStartAfter));
      }
      constraints.push(limit(CATEGORIES_PER_PAGE));

      const q = query(categoriesCollection, ...constraints);
      const querySnapshot = await getDocs(q);

      const categoriesData = querySnapshot.docs.map(docSnap => {
        const data = docSnap.data();
        return {
          id: docSnap.id,
          name: data.name || '',
          slug: data.slug || '',
          description: data.description || null,
          imageUrl: data.imageUrl || null,
          order: typeof data.order === 'number' ? data.order : 0,
          isActive: typeof data.isActive === 'boolean' ? data.isActive : true,
          dataAiHint: data.dataAiHint || null,
          createdAt: safeToDate(data.createdAt),
          updatedAt: safeToDate(data.updatedAt),
        } as Category;
      });

      if(isMounted){
        setCategories(prev => isLoadMoreOperation ? [...prev, ...categoriesData] : categoriesData);
        setLastVisible(querySnapshot.docs[querySnapshot.docs.length - 1] || null);
        setHasMore(querySnapshot.docs.length === CATEGORIES_PER_PAGE);
      }
    } catch (err) {
      console.error("Error fetching categories:", err);
      const errorMsg = err instanceof Error ? err.message : "Failed to fetch categories";
      if(isMounted) {
        setError(errorMsg);
        toast({ variant: "destructive", title: "Fetch Error", description: errorMsg });
        setHasMore(false);
      }
    } finally {
      if(isMounted){
        if(!isLoadMoreOperation) setLoading(false); else setLoadingMore(false);
        setIsSearching(false);
      }
    }
    return () => {isMounted = false;};
  }, [toast]);

  useEffect(() => {
    fetchCategories(false, debouncedSearchTerm, null);
  }, [debouncedSearchTerm, fetchCategories]);

  const handleSearchSubmit = (e: React.FormEvent) => e.preventDefault();

  const handleLoadMore = () => {
    if (!loadingMore && hasMore && lastVisible) {
      fetchCategories(true, debouncedSearchTerm, lastVisible);
    }
  };

  const openAddDialog = () => {
    setEditingCategory(null);
    form.reset({
      name: '', slug: '', description: '', imageUrl: '', order: 0, isActive: true, dataAiHint: '',
    });
    setIsDialogOpen(true);
  };

  const openEditDialog = (category: Category) => {
    setEditingCategory(category);
    form.reset({
      name: category.name,
      slug: category.slug,
      description: category.description || '',
      imageUrl: category.imageUrl || '',
      order: category.order,
      isActive: category.isActive,
      dataAiHint: category.dataAiHint || '',
    });
    setIsDialogOpen(true);
  };

   const generateSlugFromName = (name: string) => {
    return name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
   };

   useEffect(() => {
       const subscription = form.watch((value, { name }) => {
         if (name === "name" && !editingCategory && isDialogOpen) { // Only for new categories and when dialog is open
           const newSlug = generateSlugFromName(value.name || "");
           if (form.getValues("slug") !== newSlug) { // Avoid unnecessary updates
             form.setValue("slug", newSlug, { shouldValidate: true });
           }
         }
       });
       return () => subscription.unsubscribe();
   }, [form, editingCategory, isDialogOpen]);


  const onSubmit = async (data: CategoryFormValues) => {
    if (!db) {
      setError("Database not available.");
      setIsSaving(false);
      return;
    }
    setIsSaving(true);
    setError(null);

    const submissionData: Partial<CategoryFormType> = {
      ...data,
      imageUrl: data.imageUrl || null,
      description: data.description || null,
      dataAiHint: data.dataAiHint || null,
    };

    try {
      // Check if slug already exists for a new category or if it's changed for an existing one
      if (!editingCategory || (editingCategory && editingCategory.slug !== data.slug)) {
        const categoriesRef = collection(db, 'categories');
        const q = query(categoriesRef, where('slug', '==', data.slug));
        const querySnapshot = await getDocs(q);
        if (!querySnapshot.empty) {
          // If slug exists and it's not the current editing category's original slug
          if (!editingCategory || querySnapshot.docs[0].id !== editingCategory.id) {
            form.setError('slug', { type: 'manual', message: 'This slug is already in use. Please choose another.' });
            setIsSaving(false);
            return;
          }
        }
      }

      if (editingCategory) {
        const categoryDocRef = doc(db, 'categories', editingCategory.id);
        await updateDoc(categoryDocRef, { ...submissionData, updatedAt: serverTimestamp() });
        setCategories(prev => prev.map(c => c.id === editingCategory.id ? { ...c, ...submissionData, updatedAt: new Date() } as Category : c));
        toast({ title: "Category Updated", description: `${data.name} details saved.` });
      } else {
        const docRef = await addDoc(collection(db, 'categories'), { ...submissionData, createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
        const newCategory = { id: docRef.id, ...submissionData, createdAt: new Date(), updatedAt: new Date() } as Category;
        setCategories(prev => [newCategory, ...prev].sort((a,b) => (a.order ?? 0) - (b.order ?? 0) || a.name.localeCompare(b.name)));
        toast({ title: "Category Added", description: `${data.name} has been created.` });
      }
      setIsDialogOpen(false);
      form.reset();
    } catch (err) {
      console.error("Error saving category:", err);
      const errorMsg = err instanceof Error ? err.message : "Could not save category details.";
      setError(errorMsg);
      toast({ variant: "destructive", title: "Save Failed", description: errorMsg });
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeleteCategory = async (categoryId: string) => {
    if (!categoryId || !db) return;
    setDeletingCategoryId(categoryId);
    try {
      await deleteDoc(doc(db, 'categories', categoryId));
      setCategories(prev => prev.filter(c => c.id !== categoryId));
      toast({ title: "Category Deleted" });
    } catch (err) {
      console.error("Error deleting category:", err);
      const errorMsg = err instanceof Error ? err.message : "Could not delete the category.";
      toast({ variant: "destructive", title: "Deletion Failed", description: errorMsg });
    } finally {
      setDeletingCategoryId(null);
    }
  };

  const handleToggleActive = async (category: Category) => {
    if (!db) return;
    setUpdatingFieldId(category.id);
    const newActiveState = !category.isActive;
    try {
      await updateDoc(doc(db, 'categories', category.id), { isActive: newActiveState, updatedAt: serverTimestamp() });
      setCategories(prev => prev.map(c => c.id === category.id ? { ...c, isActive: newActiveState, updatedAt: new Date() } : c));
      toast({ title: `Category ${newActiveState ? 'Activated' : 'Deactivated'}` });
    } catch (err) {
      console.error("Error toggling active status:", err);
      toast({ variant: "destructive", title: "Update Failed", description: String(err) });
    } finally {
      setUpdatingFieldId(null);
    }
  };


  if (loading && categories.length === 0 && !error) {
    return <CategoriesTableSkeleton />;
  }

  return (
    <AdminGuard>
      <div className="space-y-6">
        <div className="flex justify-between items-center">
          <h1 className="text-3xl font-bold flex items-center gap-2"><Building2 className="w-7 h-7" /> Manage Categories</h1>
          <Button onClick={openAddDialog}>
            <PlusCircle className="mr-2 h-4 w-4" /> Add New Category
          </Button>
        </div>

        {error && !loading && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>Error</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        <Card>
          <CardHeader>
            <CardTitle>Filter & Search Categories</CardTitle>
            <CardDescription>Search by category name.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col sm:flex-row gap-4">
            <form onSubmit={handleSearchSubmit} className="flex-1 flex gap-2">
              <Input
                type="search"
                placeholder="Search by Category Name..."
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
            <CardTitle>Category List</CardTitle>
            <CardDescription>View and manage product categories.</CardDescription>
          </CardHeader>
          <CardContent>
            {loading && categories.length === 0 ? (
              <CategoriesTableSkeleton />
            ) : !loading && categories.length === 0 && !error ? (
              <p className="text-center text-muted-foreground py-8">
                {debouncedSearchTerm ? `No categories found matching "${debouncedSearchTerm}".` : "No categories found."}
              </p>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Image</TableHead>
                      <TableHead>Name</TableHead>
                      <TableHead>Slug</TableHead>
                      <TableHead>Description</TableHead>
                      <TableHead className="text-center">Order</TableHead>
                      <TableHead className="text-center">Active</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {categories.map((category) => (
                      <TableRow key={category.id} className={!category.isActive ? 'opacity-50 bg-muted/30' : ''}>
                        <TableCell>
                          {category.imageUrl ? (
                            <Image src={category.imageUrl} alt={category.name} width={40} height={40} className="rounded-sm object-contain" data-ai-hint={category.dataAiHint || "category icon"} />
                          ) : (
                            <div className="w-10 h-10 bg-muted flex items-center justify-center text-xs text-muted-foreground rounded-sm"><Building2 className="w-5 h-5"/></div>
                          )}
                        </TableCell>
                        <TableCell className="font-medium">{category.name}</TableCell>
                        <TableCell className="font-mono text-xs">{category.slug}</TableCell>
                        <TableCell className="text-xs text-muted-foreground max-w-xs truncate" title={category.description || ""}>{category.description || '-'}</TableCell>
                        <TableCell className="text-center">{category.order}</TableCell>
                        <TableCell className="text-center">
                          <Switch
                            checked={category.isActive}
                            onCheckedChange={() => handleToggleActive(category)}
                            disabled={updatingFieldId === category.id}
                            aria-label="Toggle Active Status"
                          />
                           {updatingFieldId === category.id && <Loader2 className="h-4 w-4 animate-spin ml-2 inline-block" />}
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
                                <DropdownMenuItem onClick={() => openEditDialog(category)}>
                                  <Edit className="mr-2 h-4 w-4" /> Edit
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
                                  This action cannot be undone. This will permanently delete the category "{category.name}".
                                </AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel onClick={() => setDeletingCategoryId(null)}>Cancel</AlertDialogCancel>
                                <AlertDialogAction onClick={() => handleDeleteCategory(category.id)} className="bg-destructive hover:bg-destructive/90">
                                  {deletingCategoryId === category.id ? <Loader2 className="mr-2 h-4 w-4 animate-spin"/> : null} Delete
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
            {hasMore && !loading && categories.length > 0 && (
              <div className="mt-6 text-center">
                <Button onClick={handleLoadMore} disabled={loadingMore}>
                  {loadingMore ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                  Load More Categories
                </Button>
              </div>
            )}
            {loadingMore && <div className="text-center py-4"><Loader2 className="h-6 w-6 animate-spin text-primary mx-auto" /></div>}
          </CardContent>
        </Card>

        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogContent className="sm:max-w-lg">
            <DialogHeader>
              <DialogTitle>{editingCategory ? 'Edit Category' : 'Add New Category'}</DialogTitle>
              <DialogDescription>
                {editingCategory ? `Update details for ${editingCategory.name}.` : 'Enter the details for the new category.'}
              </DialogDescription>
            </DialogHeader>
            <form onSubmit={form.handleSubmit(onSubmit)} className="grid gap-4 py-4">
              <div className="grid grid-cols-4 items-center gap-4">
                <Label htmlFor="nameDialog" className="text-right">Name*</Label>
                <Input id="nameDialog" {...form.register('name')} className="col-span-3" disabled={isSaving} />
                {form.formState.errors.name && <p className="col-span-3 col-start-2 text-sm text-destructive mt-1 text-right">{form.formState.errors.name.message}</p>}
              </div>
              <div className="grid grid-cols-4 items-center gap-4">
                <Label htmlFor="slugDialog" className="text-right">Slug*</Label>
                <Input id="slugDialog" {...form.register('slug')} className="col-span-3" disabled={isSaving || !!editingCategory} placeholder={editingCategory ? undefined : "auto-generated from name"} />
                {editingCategory && <p className="col-span-3 col-start-2 text-xs text-muted-foreground mt-1 text-right">Slug cannot be changed after creation.</p>}
                {form.formState.errors.slug && <p className="col-span-3 col-start-2 text-sm text-destructive mt-1 text-right">{form.formState.errors.slug.message}</p>}
              </div>
              <div className="grid grid-cols-4 items-center gap-4">
                <Label htmlFor="descriptionDialog" className="text-right">Description</Label>
                <Textarea id="descriptionDialog" {...form.register('description')} className="col-span-3" rows={2} disabled={isSaving} />
                {form.formState.errors.description && <p className="col-span-3 col-start-2 text-sm text-destructive mt-1 text-right">{form.formState.errors.description.message}</p>}
              </div>
              <div className="grid grid-cols-4 items-center gap-4">
                <Label htmlFor="imageUrlDialog" className="text-right">Image URL</Label>
                <Input id="imageUrlDialog" {...form.register('imageUrl')} className="col-span-3" placeholder="https://..." disabled={isSaving} />
                {form.watch('imageUrl') && <Image src={form.watch('imageUrl')!} alt="Image Preview" width={40} height={40} className="col-span-3 col-start-2 object-contain border rounded-sm mt-1" data-ai-hint="category icon preview"/>}
                {form.formState.errors.imageUrl && <p className="col-span-3 col-start-2 text-sm text-destructive mt-1 text-right">{form.formState.errors.imageUrl.message}</p>}
              </div>
               <div className="grid grid-cols-4 items-center gap-4">
                <Label htmlFor="dataAiHintDialog" className="text-right">AI Hint</Label>
                <Input id="dataAiHintDialog" {...form.register('dataAiHint')} className="col-span-3" placeholder="e.g., clothing fashion" disabled={isSaving} />
                {form.formState.errors.dataAiHint && <p className="col-span-3 col-start-2 text-sm text-destructive mt-1 text-right">{form.formState.errors.dataAiHint.message}</p>}
              </div>
              <div className="grid grid-cols-4 items-center gap-4">
                <Label htmlFor="orderDialog" className="text-right">Order*</Label>
                <Input id="orderDialog" type="number" {...form.register('order', { valueAsNumber: true })} className="col-span-3" disabled={isSaving} />
                 {form.formState.errors.order && <p className="col-span-3 col-start-2 text-sm text-destructive mt-1 text-right">{form.formState.errors.order.message}</p>}
              </div>
              <div className="grid grid-cols-4 items-center gap-4">
                 <Label htmlFor="isActiveDialog" className="text-right">Status</Label>
                <div className="col-span-3 flex items-center space-x-2">
                  <Controller name="isActive" control={form.control} render={({ field }) => ( <Checkbox id="isActiveDialog" checked={field.value} onCheckedChange={field.onChange} disabled={isSaving} /> )}/>
                  <Label htmlFor="isActiveDialog" className="font-normal">Active</Label>
                </div>
              </div>
              <DialogFooter>
                <DialogClose asChild>
                  <Button type="button" variant="outline" disabled={isSaving}>Cancel</Button>
                </DialogClose>
                <Button type="submit" disabled={isSaving}>
                  {isSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                  {editingCategory ? 'Save Changes' : 'Add Category'}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>
    </AdminGuard>
  );
}

    