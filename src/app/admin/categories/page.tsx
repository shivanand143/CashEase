
"use client";

import * as React from 'react';
import { useState, useEffect, useCallback } from 'react';
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
  type QueryConstraint,
  type DocumentData,
  type QueryDocumentSnapshot,
  addDoc,
  getDoc,
  Timestamp, // Value import
  type FieldValue // Type import
} from 'firebase/firestore';
import { db, firebaseInitializationError } from '@/lib/firebase/config';
import type { Category, CategoryFormValues as AppCategoryFormValues } from '@/lib/types'; // Renamed CategoryFormValues to avoid conflict
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
import { AlertCircle, Loader2, Search, Edit, Trash2, PlusCircle, Building2, MoreHorizontal } from 'lucide-react';
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
import { format } from 'date-fns';
import { cn } from '@/lib/utils';
import Image from 'next/image';
import { useDebounce } from '@/hooks/use-debounce';
import { Switch } from '@/components/ui/switch';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

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

function AdminCategoriesPageContent() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [pageLoading, setPageLoading] = useState(true); // Renamed for clarity
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
  
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = React.useState(false);
  const [categoryToDelete, setCategoryToDelete] = React.useState<Category | null>(null);

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
    if (!db || firebaseInitializationError) {
      setError(firebaseInitializationError || "Database connection not available.");
      if (!isLoadMoreOperation) setPageLoading(false); else setLoadingMore(false);
      setHasMore(false);
      return;
    }

    if (!isLoadMoreOperation) {
      setPageLoading(true); setCategories([]); setLastVisible(null); setHasMore(true);
    } else {
      if (!docToStartAfter && isLoadMoreOperation) {
        setLoadingMore(false);
        return;
      }
      setLoadingMore(true);
    }
    if (!isLoadMoreOperation) setError(null);
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
        const createdAtFromServer = data.createdAt;
        const updatedAtFromServer = data.updatedAt;
        return {
          id: docSnap.id,
          name: data.name || '',
          slug: data.slug || '',
          description: data.description || null,
          imageUrl: data.imageUrl || null,
          order: typeof data.order === 'number' ? data.order : 0,
          isActive: typeof data.isActive === 'boolean' ? data.isActive : true,
          dataAiHint: data.dataAiHint || null,
          createdAt: createdAtFromServer instanceof Timestamp ? createdAtFromServer : Timestamp.fromDate(new Date(0)),
          updatedAt: updatedAtFromServer instanceof Timestamp ? updatedAtFromServer : Timestamp.fromDate(new Date(0)),
        } as Category; // Ensure the object conforms to the Category type
      });

      setCategories(prev => isLoadMoreOperation ? [...prev, ...categoriesData] : categoriesData);
      setLastVisible(querySnapshot.docs[querySnapshot.docs.length - 1] || null);
      setHasMore(querySnapshot.docs.length === CATEGORIES_PER_PAGE);
    } catch (err) {
      console.error("Error fetching categories:", err);
      const errorMsg = err instanceof Error ? err.message : "Failed to fetch categories";
      setError(errorMsg);
      toast({ variant: "destructive", title: "Fetch Error", description: errorMsg });
      setHasMore(false);
    } finally {
      if (!isLoadMoreOperation) setPageLoading(false); else setLoadingMore(false);
      setIsSearching(false);
    }
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
    const subscription = form.watch((value, { name, type }) => {
      if (name === "name" && !editingCategory && isDialogOpen && type === 'change') { // Only auto-generate for new categories
        const newSlug = generateSlugFromName(value.name || "");
        if (form.getValues("slug") !== newSlug || form.getValues("slug") === '') {
          form.setValue("slug", newSlug, { shouldValidate: true });
        }
      }
    });
    return () => subscription.unsubscribe();
  }, [form, editingCategory, isDialogOpen]);


  const onSubmit = async (data: CategoryFormValues) => {
    if (!db || firebaseInitializationError) {
      setError(firebaseInitializationError || "Database not available.");
      setIsSaving(false);
      return;
    }
    setIsSaving(true);
    setError(null);

    const finalSlug = data.slug || generateSlugFromName(data.name);
    if (!finalSlug) {
        form.setError('slug', {type: 'manual', message: 'Slug could not be generated. Please enter a name.'});
        setIsSaving(false);
        return;
    }

    // Check for slug uniqueness
    if (!editingCategory || (editingCategory && editingCategory.slug !== finalSlug)) {
        const categoriesRef = collection(db, 'categories');
        const q = query(categoriesRef, where('slug', '==', finalSlug), limit(1));
        const querySnapshot = await getDocs(q);
        if (!querySnapshot.empty) {
            // Check if the found document is the one being edited
            if (!editingCategory || querySnapshot.docs[0].id !== editingCategory.id) {
                form.setError('slug', { type: 'manual', message: 'This slug is already in use. Please choose a unique one.' });
                setIsSaving(false);
                return;
            }
        }
    }
    
    const submissionData: Omit<AppCategoryFormValues, 'slug'> & { slug: string; updatedAt: FieldValue; createdAt?: FieldValue } = {
      name: data.name,
      slug: finalSlug,
      description: data.description || null,
      imageUrl: data.imageUrl || null,
      order: data.order,
      isActive: data.isActive,
      dataAiHint: data.dataAiHint || null,
      updatedAt: serverTimestamp(),
    };

    try {
      if (editingCategory) {
        const categoryDocRef = doc(db, 'categories', editingCategory.id);
        // Slug is not updated for existing categories
        const { slug, ...updateData } = submissionData;
        await updateDoc(categoryDocRef, updateData);
        
        const updatedCategoryForState: Category = {
          ...editingCategory,
          name: data.name,
          description: data.description || null,
          imageUrl: data.imageUrl || null,
          order: data.order,
          isActive: data.isActive,
          dataAiHint: data.dataAiHint || null,
          updatedAt: Timestamp.now(), // Optimistic update with current client Timestamp
        };
        setCategories(prev => prev.map(c => c.id === editingCategory!.id ? updatedCategoryForState : c));
        toast({ title: "Category Updated", description: `${data.name} details saved.` });
      } else {
        submissionData.createdAt = serverTimestamp();
        const docRef = await addDoc(collection(db, 'categories'), submissionData);
        
        const newCategoryForState: Category = {
          id: docRef.id,
          name: data.name,
          slug: finalSlug,
          description: data.description || null,
          imageUrl: data.imageUrl || null,
          order: data.order,
          isActive: data.isActive,
          dataAiHint: data.dataAiHint || null,
          createdAt: Timestamp.now(), // Optimistic update with current client Timestamp
          updatedAt: Timestamp.now(), // Optimistic update with current client Timestamp
        };
        setCategories(prev => [newCategoryForState, ...prev].sort((a,b) => (a.order ?? 0) - (b.order ?? 0) || a.name.localeCompare(b.name)));
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
    try {
      await deleteDoc(doc(db, 'categories', categoryId));
      setCategories(prev => prev.filter(c => c.id !== categoryId));
      toast({ title: "Category Deleted" });
    } catch (err) {
      console.error("Error deleting category:", err);
      const errorMsg = err instanceof Error ? err.message : "Could not delete the category.";
      toast({ variant: "destructive", title: "Deletion Failed", description: errorMsg });
    } finally {
      setIsDeleteDialogOpen(false); 
      setCategoryToDelete(null); 
    }
  };

  const handleToggleActive = async (category: Category) => {
    if (!db) return;
    setUpdatingFieldId(category.id);
    const newActiveState = !category.isActive;
    try {
      await updateDoc(doc(db, 'categories', category.id), { isActive: newActiveState, updatedAt: serverTimestamp() });
      setCategories(prev => prev.map(c => c.id === category.id ? { ...c, isActive: newActiveState, updatedAt: Timestamp.now() } : c));
      toast({ title: `Category ${newActiveState ? 'Activated' : 'Deactivated'}` });
    } catch (err) {
      console.error("Error toggling active status:", err);
      toast({ variant: "destructive", title: "Update Failed", description: String(err) });
    } finally {
      setUpdatingFieldId(null);
    }
  };

  const handleOpenDeleteDialog = (category: Category) => {
    setCategoryToDelete(category);
    setIsDeleteDialogOpen(true);
  };

  if (pageLoading && categories.length === 0 && !error) {
    return <CategoriesTableSkeleton />;
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-3xl font-bold flex items-center gap-2"><Building2 className="w-7 h-7" /> Manage Categories</h1>
        <Button onClick={openAddDialog}>
          <PlusCircle className="mr-2 h-4 w-4" /> Add New Category
        </Button>
      </div>

      {error && !pageLoading && (
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
              disabled={isSearching || pageLoading}
              className="h-10 text-base"
            />
            <Button type="submit" disabled={isSearching || pageLoading} className="h-10">
              {isSearching || (pageLoading && debouncedSearchTerm) ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
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
          {categories.length === 0 && !error && !pageLoading ? (
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
                                <Edit className="mr-2 h-4 w-4" /> <span>Edit</span>
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem
                                onSelect={() => handleOpenDeleteDialog(category)}
                                className="text-destructive hover:!bg-destructive/10 focus:!bg-destructive/10 focus:!text-destructive"
                            >
                                <Trash2 className="mr-2 h-4 w-4" /> <span>Delete</span>
                            </DropdownMenuItem>
                            </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
          {hasMore && !pageLoading && categories.length > 0 && (
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

        <AlertDialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
            {categoryToDelete && (
                <AlertDialogContent>
                    <AlertDialogHeader>
                    <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
                    <AlertDialogDescription>
                        This action cannot be undone. This will permanently delete the category "{categoryToDelete?.name}".
                    </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                    <AlertDialogCancel onClick={() => { setIsDeleteDialogOpen(false); setCategoryToDelete(null); }}>Cancel</AlertDialogCancel>
                    <AlertDialogAction
                        onClick={() => handleDeleteCategory(categoryToDelete.id)}
                        className="bg-destructive hover:bg-destructive/90"
                        disabled={isSaving}
                    >
                        {isSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin"/> : null}
                        Delete
                    </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            )}
        </AlertDialog>
    </div>
  );
}


export default function AdminCategoriesPage() {
    return (
      <AdminGuard>
        <AdminCategoriesPageContent />
      </AdminGuard>
    );
}

    