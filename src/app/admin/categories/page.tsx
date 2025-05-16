
"use client";

import * as React from 'react';
import { useState, useEffect, useCallback } from 'react';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import {
  collection,
  query,
  orderBy,
  getDocs,
  doc,
  setDoc,
  deleteDoc,
  serverTimestamp,
  getDoc,
  updateDoc,
  DocumentData
} from 'firebase/firestore';
import { db, firebaseInitializationError } from '@/lib/firebase/config';
import type { Category } from '@/lib/types';
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
import { AlertCircle, Loader2, Edit, Trash2, PlusCircle } from 'lucide-react';
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
  DialogTrigger
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
  AlertDialogTrigger, // Ensure this is imported
} from "@/components/ui/alert-dialog";
import AdminGuard from '@/components/guards/admin-guard';
import { safeToDate } from '@/lib/utils';
import Image from 'next/image';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch'; // Import Switch

const categorySchema = z.object({
  name: z.string().min(2, 'Category name must be at least 2 characters').max(50, 'Category name too long'),
  slug: z.string().min(2, 'Slug must be at least 2 characters').max(50, 'Slug too long').regex(/^[a-z0-9-]+$/, 'Slug can only contain lowercase letters, numbers, and hyphens'),
  description: z.string().max(200, 'Description too long').optional().nullable(),
  imageUrl: z.string().url('Invalid URL format').optional().nullable().or(z.literal('')),
  order: z.number().min(0).default(0),
  isActive: z.boolean().default(true), // Added isActive
  dataAiHint: z.string().max(50, 'AI Hint too long').optional().nullable(),
});

type CategoryFormValues = z.infer<typeof categorySchema>;

function AdminCategoriesPageContent() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { toast } = useToast();

  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingCategory, setEditingCategory] = useState<Category | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [deletingCategoryId, setDeletingCategoryId] = useState<string | null>(null);
  const [updatingStatusId, setUpdatingStatusId] = useState<string | null>(null);


  const form = useForm<CategoryFormValues>({
    resolver: zodResolver(categorySchema),
    defaultValues: {
      name: '',
      slug: '',
      description: '',
      imageUrl: '',
      order: 0,
      isActive: true, // Default for new categories
      dataAiHint: '',
    },
  });

  const fetchCategories = useCallback(async () => {
    let isMounted = true;
    if (firebaseInitializationError) {
      if(isMounted) {
        setError(`Firebase initialization error: ${firebaseInitializationError}`);
        setLoading(false);
      }
      return () => {isMounted = false;};
    }
    if (!db) {
      if(isMounted) {
        setError("Database connection not available.");
        setLoading(false);
      }
      return () => {isMounted = false;};
    }
    setLoading(true);
    setError(null);
    try {
      const categoriesCollection = collection(db, 'categories');
      const q = query(categoriesCollection, orderBy('order', 'asc'), orderBy('name', 'asc'));
      const querySnapshot = await getDocs(q);
      const categoriesData = querySnapshot.docs.map(docSnap => {
          const data = docSnap.data();
          return {
            id: docSnap.id,
            name: data.name || '',
            slug: data.slug || '',
            description: data.description || '',
            imageUrl: data.imageUrl || null,
            order: typeof data.order === 'number' ? data.order : 0,
            isActive: typeof data.isActive === 'boolean' ? data.isActive : true, // Ensure isActive is handled
            dataAiHint: data.dataAiHint || null,
            createdAt: safeToDate(data.createdAt),
            updatedAt: safeToDate(data.updatedAt),
          } as Category;
      });
      if(isMounted) setCategories(categoriesData);
    } catch (err) {
      console.error("Error fetching categories:", err);
      const errorMsg = err instanceof Error ? err.message : "Failed to fetch categories";
      if(isMounted) {
        setError(errorMsg);
        toast({ variant: "destructive", title: "Fetch Error", description: errorMsg });
      }
    } finally {
      if(isMounted) setLoading(false);
    }
    return () => {isMounted = false;};
  }, [toast]);

  useEffect(() => {
    fetchCategories();
  }, [fetchCategories]);

  const openAddDialog = () => {
    setEditingCategory(null);
    form.reset({
      name: '', slug: '', description: '', imageUrl: '', dataAiHint: '',
      order: categories.length > 0 ? Math.max(...categories.map(c => c.order)) + 1 : 0,
      isActive: true,
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

   const generateSlug = (name: string) => {
     return name
       .toLowerCase()
       .replace(/[^a-z0-9\s-]/g, '')
       .trim()
       .replace(/\s+/g, '-')
       .replace(/-+/g, '-');
   };

    useEffect(() => {
        if (!editingCategory && isDialogOpen) { // Only auto-generate slug for new categories when dialog is open
            const subscription = form.watch((value, { name: fieldName }) => {
                if (fieldName === 'name' && value.name && !form.formState.dirtyFields.slug) {
                    form.setValue('slug', generateSlug(value.name), { shouldValidate: true });
                }
            });
            return () => subscription.unsubscribe();
        }
    }, [form, editingCategory, isDialogOpen]);


  const onSubmit = async (data: CategoryFormValues) => {
    if (!db) {
        setError("Database not available. Please try again later.");
        setIsSaving(false);
        return;
    }
    setIsSaving(true);
    setError(null);

    const submissionData = {
        ...data,
        imageUrl: data.imageUrl || null,
        description: data.description || null,
        dataAiHint: data.dataAiHint || null,
    };

    try {
       const categoryId = data.slug;
       const categoryDocRef = doc(db, 'categories', categoryId);

      if (editingCategory) {
         if (editingCategory.slug !== data.slug) {
             toast({
                 variant: "destructive",
                 title: "Slug Change Not Allowed",
                 description: "Changing the category slug (ID) is not permitted for existing categories.",
             });
             setIsSaving(false);
             return;
         }
         await updateDoc(categoryDocRef, { // Use updateDoc for existing
           ...submissionData,
           updatedAt: serverTimestamp(),
         });
         setCategories(prev => prev.map(c => c.id === categoryId ? { ...c, ...submissionData, updatedAt: new Date() } : c).sort((a, b) => a.order - b.order || a.name.localeCompare(b.name)));
         toast({ title: "Category Updated", description: `${data.name} details saved.` });
      } else {
        const existingDoc = await getDoc(categoryDocRef);
        if (existingDoc.exists()) {
            toast({
                variant: "destructive",
                title: "Slug Already Exists",
                description: `The slug "${data.slug}" is already in use. Please choose a unique slug or edit the existing category.`,
            });
            setIsSaving(false);
            return;
        }
        await setDoc(categoryDocRef, { // Use setDoc for new
          ...submissionData,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
        const newCategory: Category = { ...submissionData, id: categoryId, createdAt: new Date(), updatedAt: new Date() };
        setCategories(prev => [...prev, newCategory].sort((a, b) => a.order - b.order || a.name.localeCompare(b.name)));
        toast({ title: "Category Added", description: `${data.name} created successfully.` });
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

   const handleDeleteCategory = async () => {
     if (!deletingCategoryId || !db) return;
     try {
       const categoryDocRef = doc(db, 'categories', deletingCategoryId);
       await deleteDoc(categoryDocRef);
       setCategories(prev => prev.filter(c => c.id !== deletingCategoryId));
       toast({ title: "Category Deleted", description: "The category has been removed." });
     } catch (err) {
       console.error("Error deleting category:", err);
       const errorMsg = err instanceof Error ? err.message : "Could not delete the category.";
       toast({ variant: "destructive", title: "Deletion Failed", description: errorMsg });
     } finally {
       setDeletingCategoryId(null);
     }
   };

   const handleToggleActiveStatus = async (categoryToUpdate: Category) => {
     if (!categoryToUpdate || !db) return;
     setUpdatingStatusId(categoryToUpdate.id);
     const categoryDocRef = doc(db, 'categories', categoryToUpdate.id);
     const newStatus = !categoryToUpdate.isActive;

     try {
       await updateDoc(categoryDocRef, {
         isActive: newStatus,
         updatedAt: serverTimestamp(),
       });
       setCategories(prevCategories =>
         prevCategories.map(c =>
           c.id === categoryToUpdate.id ? { ...c, isActive: newStatus, updatedAt: new Date() } : c
         )
       );
       toast({ title: `Category ${newStatus ? 'Activated' : 'Deactivated'}`, description: `${categoryToUpdate.name} status updated.` });
     } catch (err) {
       console.error(`Error updating category ${categoryToUpdate.id} status:`, err);
       const errorMsg = err instanceof Error ? err.message : "Could not update category status.";
       toast({ variant: "destructive", title: "Update Failed", description: errorMsg });
     } finally {
       setUpdatingStatusId(null);
     }
   };


  if (loading && categories.length === 0 && !error) {
    return <CategoriesTableSkeleton />;
  }


  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-3xl font-bold">Manage Categories</h1>
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
          <CardTitle>Category List</CardTitle>
          <CardDescription>View and manage store categories.</CardDescription>
        </CardHeader>
        <CardContent>
           {loading && categories.length === 0 && !error ? (
             <CategoriesTableSkeleton />
           ) : !loading && categories.length === 0 && !error ? (
             <p className="text-center text-muted-foreground py-8">No categories found.</p>
           ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Order</TableHead>
                    <TableHead>Image</TableHead>
                    <TableHead>Name</TableHead>
                    <TableHead>Slug</TableHead>
                    <TableHead>Description</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {categories.map((category) => (
                    <TableRow key={category.id} className={!category.isActive ? 'opacity-50 bg-muted/30' : ''}>
                      <TableCell className="w-16 text-center">{category.order}</TableCell>
                      <TableCell>
                        {category.imageUrl ? (
                          <Image src={category.imageUrl} alt={`${category.name} image`} width={50} height={50} className="object-cover rounded-sm w-12 h-12" data-ai-hint={`${category.dataAiHint || category.name + ' category icon'}`}/>
                        ) : (
                          <div className="w-12 h-12 bg-muted flex items-center justify-center text-xs text-muted-foreground rounded-sm">No Img</div>
                        )}
                      </TableCell>
                      <TableCell className="font-medium">{category.name}</TableCell>
                      <TableCell className="font-mono text-xs">{category.slug}</TableCell>
                      <TableCell className="max-w-[300px] truncate text-sm text-muted-foreground">
                        {category.description || '-'}
                      </TableCell>
                      <TableCell>
                         <Switch
                           checked={category.isActive}
                           onCheckedChange={() => handleToggleActiveStatus(category)}
                           disabled={updatingStatusId === category.id}
                           aria-label={category.isActive ? 'Deactivate category' : 'Activate category'}
                         />
                         {updatingStatusId === category.id && <Loader2 className="h-4 w-4 animate-spin ml-2 inline-block" />}
                      </TableCell>
                      <TableCell>
                        <div className="flex gap-2">
                           <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => openEditDialog(category)}>
                              <Edit className="h-4 w-4" />
                              <span className="sr-only">Edit</span>
                           </Button>
                           <AlertDialog>
                               <AlertDialogTrigger asChild>
                                  <Button variant="destructive" size="icon" className="h-8 w-8" onClick={() => setDeletingCategoryId(category.id)}>
                                     <Trash2 className="h-4 w-4"/>
                                     <span className="sr-only">Delete</span>
                                  </Button>
                               </AlertDialogTrigger>
                               <AlertDialogContent>
                                 <AlertDialogHeader>
                                   <AlertDialogTitle>Are you sure?</AlertDialogTitle>
                                   <AlertDialogDescription>
                                     This action cannot be undone. This will permanently delete the category "{category.name}". Stores in this category will not be deleted but may become uncategorized.
                                   </AlertDialogDescription>
                                 </AlertDialogHeader>
                                 <AlertDialogFooter>
                                   <AlertDialogCancel onClick={() => setDeletingCategoryId(null)}>Cancel</AlertDialogCancel>
                                   <AlertDialogAction
                                      onClick={handleDeleteCategory}
                                      className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                                       Delete
                                    </AlertDialogAction>
                                 </AlertDialogFooter>
                               </AlertDialogContent>
                           </AlertDialog>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
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
               <Label htmlFor="order" className="text-right">Display Order</Label>
               <Input
                 id="order"
                 type="number"
                 {...form.register('order', { valueAsNumber: true })}
                 className="col-span-3"
                 placeholder="0"
                 disabled={isSaving}
               />
               {form.formState.errors.order && <p className="col-span-4 text-sm text-destructive text-right">{form.formState.errors.order.message}</p>}
             </div>
             <div className="grid grid-cols-4 items-center gap-4">
               <Label htmlFor="name" className="text-right">Name*</Label>
               <Input id="name" {...form.register('name')} className="col-span-3" disabled={isSaving} />
               {form.formState.errors.name && <p className="col-span-4 text-sm text-destructive text-right">{form.formState.errors.name.message}</p>}
             </div>
             <div className="grid grid-cols-4 items-center gap-4">
               <Label htmlFor="slug" className="text-right">Slug*</Label>
               <Input
                 id="slug"
                 {...form.register('slug')}
                 className="col-span-3"
                 placeholder="auto-generated or custom"
                 disabled={isSaving || !!editingCategory}
               />
                {editingCategory && <p className="col-span-4 text-xs text-muted-foreground text-right">Slug cannot be changed after creation.</p>}
               {form.formState.errors.slug && <p className="col-span-4 text-sm text-destructive text-right">{form.formState.errors.slug.message}</p>}
             </div>
             <div className="grid grid-cols-4 items-center gap-4">
               <Label htmlFor="imageUrl" className="text-right">Image URL</Label>
               <Input id="imageUrl" {...form.register('imageUrl')} className="col-span-3" placeholder="https://..." disabled={isSaving} />
                {form.watch('imageUrl') && form.formState.errors.imageUrl?.type !== 'invalid_string' && (
                    <div className="col-start-2 col-span-3 mt-1">
                        <Image src={form.watch('imageUrl')!} alt="Image Preview" width={60} height={60} className="object-cover border rounded-sm w-16 h-16" />
                    </div>
                )}
               {form.formState.errors.imageUrl && <p className="col-span-4 text-sm text-destructive text-right">{form.formState.errors.imageUrl.message}</p>}
             </div>
              <div className="grid grid-cols-4 items-center gap-4">
               <Label htmlFor="dataAiHint" className="text-right">AI Hint</Label>
               <Input id="dataAiHint" {...form.register('dataAiHint')} className="col-span-3" placeholder="e.g., clothing fashion" disabled={isSaving} />
               {form.formState.errors.dataAiHint && <p className="col-span-4 text-sm text-destructive text-right">{form.formState.errors.dataAiHint.message}</p>}
             </div>
             <div className="grid grid-cols-4 items-center gap-4">
               <Label htmlFor="description" className="text-right">Description</Label>
               <Textarea id="description" {...form.register('description')} className="col-span-3" rows={2} placeholder="Optional short description" disabled={isSaving} />
               {form.formState.errors.description && <p className="col-span-4 text-sm text-destructive text-right">{form.formState.errors.description.message}</p>}
             </div>
             <div className="grid grid-cols-4 items-center gap-4">
                <Label htmlFor="isActive" className="text-right">Status</Label>
                <div className="col-span-3 flex items-center space-x-2">
                    <Checkbox
                       id="isActive"
                       checked={form.watch('isActive')}
                       onCheckedChange={(checked) => form.setValue('isActive', !!checked)}
                       disabled={isSaving}
                     />
                     <Label htmlFor="isActive" className="font-normal">Active (Category is visible)</Label>
                </div>
             </div>


             <DialogFooter>
               <DialogClose asChild>
                 <Button type="button" variant="outline" disabled={isSaving}>
                   Cancel
                 </Button>
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
  );
}

function CategoriesTableSkeleton() {
   return (
    <Card>
      <CardHeader>
         <Skeleton className="h-6 w-1/4 mb-2"/>
         <Skeleton className="h-4 w-1/2"/>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                {Array.from({ length: 7 }).map((_, index) => ( // Increased length for new Status column
                  <TableHead key={index}><Skeleton className="h-5 w-full" /></TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {Array.from({ length: 5 }).map((_, rowIndex) => (
                <TableRow key={rowIndex}>
                  {Array.from({ length: 7 }).map((_, colIndex) => ( // Increased length
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
    return (
      <AdminGuard>
        <AdminCategoriesPageContent />
      </AdminGuard>
    );
}
