"use client";

import * as React from 'react';
import { useState, useEffect, useCallback } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import {
  collection,
  query,
  orderBy,
  getDocs,
  doc,
  setDoc, // Use setDoc with merge option for create/update
  deleteDoc,
  serverTimestamp,
  DocumentData
} from 'firebase/firestore';
import { db } from '@/lib/firebase/config';
import type { Category } from '@/lib/types'; // Assume Category type exists
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
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import AdminGuard from '@/components/guards/admin-guard';
import { safeToDate } from '@/lib/utils'; // Utility function
import Image from 'next/image'; // For image preview


// Zod schema for category form validation
const categorySchema = z.object({
  name: z.string().min(2, 'Category name must be at least 2 characters').max(50, 'Category name too long'),
  slug: z.string().min(2, 'Slug must be at least 2 characters').max(50, 'Slug too long').regex(/^[a-z0-9-]+$/, 'Slug can only contain lowercase letters, numbers, and hyphens'),
  description: z.string().max(200, 'Description too long').optional(),
  imageUrl: z.string().url('Invalid URL format').optional().or(z.literal('')), // Optional image URL
  order: z.number().min(0).default(0), // Order for display
});

type CategoryFormValues = z.infer<typeof categorySchema>;

function AdminCategoriesPageContent() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { toast } = useToast();

  // State for Add/Edit Dialog
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingCategory, setEditingCategory] = useState<Category | null>(null); // null for Add, Category object for Edit
  const [isSaving, setIsSaving] = useState(false);
  const [deletingCategoryId, setDeletingCategoryId] = useState<string | null>(null); // Track which category is being deleted

  // React Hook Form setup
  const form = useForm<CategoryFormValues>({
    resolver: zodResolver(categorySchema),
    defaultValues: {
      name: '',
      slug: '',
      description: '',
      imageUrl: '',
      order: 0,
    },
  });

  // --- Fetch Categories ---
  const fetchCategories = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const categoriesCollection = collection(db, 'categories');
      const q = query(categoriesCollection, orderBy('order', 'asc'), orderBy('name', 'asc')); // Order by 'order' then 'name'
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
            createdAt: safeToDate(data.createdAt) || new Date(0),
            updatedAt: safeToDate(data.updatedAt) || new Date(0),
          } as Category;
      });
      setCategories(categoriesData);
    } catch (err) {
      console.error("Error fetching categories:", err);
      const errorMsg = err instanceof Error ? err.message : "Failed to fetch categories";
      setError(errorMsg);
      toast({ variant: "destructive", title: "Fetch Error", description: errorMsg });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    fetchCategories();
  }, [fetchCategories]);

  // --- Dialog and Form Handlers ---
  const openAddDialog = () => {
    setEditingCategory(null);
    form.reset({ // Reset form to defaults for adding
      name: '', slug: '', description: '', imageUrl: '', order: 0
    });
    setIsDialogOpen(true);
  };

  const openEditDialog = (category: Category) => {
    setEditingCategory(category);
    form.reset({ // Reset form with the category's data for editing
      name: category.name,
      slug: category.slug,
      description: category.description || '',
      imageUrl: category.imageUrl || '',
      order: category.order,
    });
    setIsDialogOpen(true);
  };

   // Generate slug from name
   const generateSlug = (name: string) => {
     return name
       .toLowerCase()
       .replace(/[^a-z0-9\s-]/g, '') // Remove special chars except space/hyphen
       .trim()
       .replace(/\s+/g, '-') // Replace spaces with hyphens
       .replace(/-+/g, '-'); // Replace multiple hyphens with single
   };

   // Update slug field when name changes (if adding new)
   useEffect(() => {
     if (!editingCategory) { // Only auto-generate for new categories
       const subscription = form.watch((value, { name }) => {
         if (name === 'name' && value.name) {
           form.setValue('slug', generateSlug(value.name), { shouldValidate: true });
         }
       });
       return () => subscription.unsubscribe();
     }
   }, [form, editingCategory]);


  const onSubmit = async (data: CategoryFormValues) => {
    setIsSaving(true);
    setError(null);

    try {
       // Use the slug as the document ID for simplicity and SEO-friendliness
       const categoryId = data.slug;
       const categoryDocRef = doc(db, 'categories', categoryId);

      if (editingCategory) {
         // Update Existing Category (Note: slug change not allowed easily if it's the ID)
         // If you need to allow slug changes, the ID structure needs rethinking
         if (editingCategory.slug !== data.slug) {
             throw new Error("Changing the slug (which acts as ID) is not allowed directly. Delete and recreate if necessary.");
         }
         await setDoc(categoryDocRef, {
           ...data,
           imageUrl: data.imageUrl || null, // Ensure null if empty
           updatedAt: serverTimestamp(),
         }, { merge: true }); // Merge to update existing fields
         setCategories(prev => prev.map(c => c.id === categoryId ? { ...c, ...data, updatedAt: new Date() } : c));
         toast({ title: "Category Updated", description: `${data.name} details saved.` });
      } else {
        // Add New Category
        await setDoc(categoryDocRef, {
          ...data,
           imageUrl: data.imageUrl || null, // Ensure null if empty
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
        // Add to local state
        const newCategory: Category = { ...data, id: categoryId, createdAt: new Date(), updatedAt: new Date() };
        setCategories(prev => [...prev, newCategory].sort((a, b) => a.order - b.order || a.name.localeCompare(b.name))); // Add and resort
        toast({ title: "Category Added", description: `${data.name} created successfully.` });
      }
      setIsDialogOpen(false); // Close dialog on success
      form.reset(); // Reset form after submission
    } catch (err) {
      console.error("Error saving category:", err);
      const errorMsg = err instanceof Error ? err.message : "Could not save category details.";
      setError(errorMsg);
      toast({ variant: "destructive", title: "Save Failed", description: errorMsg });
    } finally {
      setIsSaving(false);
    }
  };

   // --- Delete Category ---
   const handleDeleteCategory = async () => {
     if (!deletingCategoryId) return;
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
       setDeletingCategoryId(null); // Reset deleting state
     }
   };

  if (loading) {
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

      {error && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Error</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {/* Categories Table */}
      <Card>
        <CardHeader>
          <CardTitle>Category List</CardTitle>
          <CardDescription>View and manage store categories.</CardDescription>
        </CardHeader>
        <CardContent>
           {loading && categories.length === 0 ? (
             <CategoriesTableSkeleton />
           ) : categories.length === 0 ? (
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
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {categories.map((category) => (
                    <TableRow key={category.id}>
                      <TableCell className="w-16 text-center">{category.order}</TableCell>
                      <TableCell>
                        {category.imageUrl ? (
                          <Image src={category.imageUrl} alt={`${category.name} image`} width={50} height={50} className="object-cover rounded-sm w-12 h-12" data-ai-hint={`${category.name} category image`}/>
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
                                      onClick={handleDeleteCategory} // Call delete handler
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

      {/* Add/Edit Category Dialog */}
       <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
         <DialogContent className="sm:max-w-lg">
           <DialogHeader>
             <DialogTitle>{editingCategory ? 'Edit Category' : 'Add New Category'}</DialogTitle>
             <DialogDescription>
               {editingCategory ? `Update details for ${editingCategory.name}.` : 'Enter the details for the new category.'}
             </DialogDescription>
           </DialogHeader>
           <form onSubmit={form.handleSubmit(onSubmit)} className="grid gap-4 py-4">
              {/* Order */}
             <div className="grid grid-cols-4 items-center gap-4">
               <label htmlFor="order" className="text-right">Display Order</label>
               <Input
                 id="order"
                 type="number"
                 {...form.register('order', { valueAsNumber: true })}
                 className="col-span-3"
                 placeholder="0"
                 disabled={isSaving}
               />
               {form.formState.errors.order && <p className="col-span-4 text-sm text-destructive">{form.formState.errors.order.message}</p>}
             </div>
             {/* Category Name */}
             <div className="grid grid-cols-4 items-center gap-4">
               <label htmlFor="name" className="text-right">Name</label>
               <Input id="name" {...form.register('name')} className="col-span-3" disabled={isSaving} />
               {form.formState.errors.name && <p className="col-span-4 text-sm text-destructive">{form.formState.errors.name.message}</p>}
             </div>
             {/* Slug */}
             <div className="grid grid-cols-4 items-center gap-4">
               <label htmlFor="slug" className="text-right">Slug</label>
               <Input
                 id="slug"
                 {...form.register('slug')}
                 className="col-span-3"
                 placeholder="auto-generated or custom"
                 disabled={isSaving || !!editingCategory} // Disable editing slug for existing categories via this form
               />
                {editingCategory && <p className="col-span-4 text-xs text-muted-foreground">Slug cannot be changed after creation.</p>}
               {form.formState.errors.slug && <p className="col-span-4 text-sm text-destructive">{form.formState.errors.slug.message}</p>}
             </div>
             {/* Image URL */}
             <div className="grid grid-cols-4 items-center gap-4">
               <label htmlFor="imageUrl" className="text-right">Image URL</label>
               <Input id="imageUrl" {...form.register('imageUrl')} className="col-span-3" placeholder="https://... (Optional)" disabled={isSaving} />
                {form.watch('imageUrl') && (
                    <div className="col-span-4 col-start-2">
                        <Image src={form.watch('imageUrl')!} alt="Image Preview" width={60} height={60} className="object-cover border rounded-sm mt-1 w-16 h-16" />
                    </div>
                )}
               {form.formState.errors.imageUrl && <p className="col-span-4 text-sm text-destructive">{form.formState.errors.imageUrl.message}</p>}
             </div>
             {/* Description */}
             <div className="grid grid-cols-4 items-center gap-4">
               <label htmlFor="description" className="text-right">Description</label>
               <Textarea id="description" {...form.register('description')} className="col-span-3" rows={2} placeholder="Optional short description" disabled={isSaving} />
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

// Skeleton Loader for the Table
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
                {Array.from({ length: 6 }).map((_, index) => (
                  <TableHead key={index}><Skeleton className="h-5 w-full" /></TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {Array.from({ length: 5 }).map((_, rowIndex) => (
                <TableRow key={rowIndex}>
                  {Array.from({ length: 6 }).map((_, colIndex) => (
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
