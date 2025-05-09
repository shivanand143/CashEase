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
  addDoc, // Import addDoc
  deleteDoc,
  serverTimestamp,
  updateDoc,
  writeBatch // For reordering
} from 'firebase/firestore';
import { db } from '@/lib/firebase/config';
import type { Banner } from '@/lib/types'; // Assume Banner type exists
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { AlertCircle, Loader2, Edit, Trash2, PlusCircle, GripVertical, ArrowUp, ArrowDown } from 'lucide-react';
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
import Image from 'next/image'; // For image preview
import { Switch } from '@/components/ui/switch'; // For toggling active status
import { safeToDate } from '@/lib/utils'; // Utility function

// Zod schema for banner form validation
const bannerSchema = z.object({
  title: z.string().max(100, 'Title too long').optional(),
  subtitle: z.string().max(200, 'Subtitle too long').optional(),
  imageUrl: z.string().url('Invalid Image URL format'),
  link: z.string().url('Invalid Link URL format').optional().nullable(),
  altText: z.string().min(1, 'Alt text is required').max(150, 'Alt text too long'),
  dataAiHint: z.string().max(50, 'AI Hint too long').optional(),
  order: z.number().min(0).default(0), // Order for display
  isActive: z.boolean().default(true),
});

type BannerFormValues = z.infer<typeof bannerSchema>;

function AdminBannersPageContent() {
  const [banners, setBanners] = useState<Banner[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { toast } = useToast();

  // State for Add/Edit Dialog
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingBanner, setEditingBanner] = useState<Banner | null>(null); // null for Add, Banner object for Edit
  const [isSaving, setIsSaving] = useState(false);
  const [deletingBannerId, setDeletingBannerId] = useState<string | null>(null); // Track deletion
  const [updatingBannerId, setUpdatingBannerId] = useState<string | null>(null); // Track status/order updates

  // React Hook Form setup
  const form = useForm<BannerFormValues>({
    resolver: zodResolver(bannerSchema),
    defaultValues: {
      title: '',
      subtitle: '',
      imageUrl: '',
      link: null,
      altText: '',
      dataAiHint: '',
      order: 0,
      isActive: true,
    },
  });

  // --- Fetch Banners ---
  const fetchBanners = useCallback(async () => {
    setLoading(true);
    setError(null);
    if (!db) {
        setError("Database not available. Please try again later.");
        setLoading(false);
        return;
    }
    try {
      const bannersCollection = collection(db, 'banners');
      const q = query(bannersCollection, orderBy('order', 'asc')); // Order by 'order'
      const querySnapshot = await getDocs(q);
      const bannersData = querySnapshot.docs.map((docSnap, index) => {
          const data = docSnap.data();
          return {
            id: docSnap.id,
            title: data.title || '',
            subtitle: data.subtitle || '',
            imageUrl: data.imageUrl || '',
            link: data.link || null,
            altText: data.altText || 'Banner Image',
            dataAiHint: data.dataAiHint || '',
             // Ensure order is consistent, potentially re-assign based on fetch order if needed
            order: typeof data.order === 'number' ? data.order : index,
            isActive: typeof data.isActive === 'boolean' ? data.isActive : true,
            createdAt: safeToDate(data.createdAt) || new Date(0),
            updatedAt: safeToDate(data.updatedAt) || new Date(0),
          } as Banner;
      });
       // Ensure banners have sequential order numbers after fetching if they are missing or inconsistent
       const orderedBanners = bannersData.map((banner, index) => ({ ...banner, order: index }));
       setBanners(orderedBanners);
       // Optional: If orders were corrected, update Firestore (might be better done less frequently)
       // await updateBannerOrderInFirestore(orderedBanners);

    } catch (err) {
      console.error("Error fetching banners:", err);
      const errorMsg = err instanceof Error ? err.message : "Failed to fetch banners";
      setError(errorMsg);
      toast({ variant: "destructive", title: "Fetch Error", description: errorMsg });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    fetchBanners();
  }, [fetchBanners]);

   // --- Update Banner Order in Firestore ---
   const updateBannerOrderInFirestore = async (orderedBanners: Banner[]) => {
     if (!db) {
        toast({ variant: "destructive", title: "DB Error", description: "Database not available." });
        return;
    }
     const batch = writeBatch(db);
     orderedBanners.forEach((banner) => {
       const bannerRef = doc(db, 'banners', banner.id);
       batch.update(bannerRef, { order: banner.order, updatedAt: serverTimestamp() });
     });
     try {
       await batch.commit();
       console.log("Banner order updated in Firestore.");
     } catch (orderError) {
       console.error("Error updating banner order in Firestore:", orderError);
       toast({ variant: "destructive", title: "Order Update Error", description: "Could not save new banner order." });
     }
   };

  // --- Dialog and Form Handlers ---
  const openAddDialog = () => {
    setEditingBanner(null);
    form.reset({ // Reset form to defaults
      title: '', subtitle: '', imageUrl: '', link: null, altText: '', dataAiHint: '',
      // Set default order to be the next available number
      order: banners.length > 0 ? Math.max(...banners.map(b => b.order)) + 1 : 0,
      isActive: true,
    });
    setIsDialogOpen(true);
  };

  const openEditDialog = (banner: Banner) => {
    setEditingBanner(banner);
    form.reset({ // Populate form with existing data
      title: banner.title || '',
      subtitle: banner.subtitle || '',
      imageUrl: banner.imageUrl,
      link: banner.link || null,
      altText: banner.altText,
      dataAiHint: banner.dataAiHint || '',
      order: banner.order,
      isActive: banner.isActive,
    });
    setIsDialogOpen(true);
  };

  const onSubmit = async (data: BannerFormValues) => {
    setIsSaving(true);
    setError(null);
    if (!db) {
        setError("Database not available. Please try again later.");
        setIsSaving(false);
        return;
    }
     const submissionData = {
       ...data,
       link: data.link || null, // Ensure null if empty
       title: data.title || null,
       subtitle: data.subtitle || null,
       dataAiHint: data.dataAiHint || null,
     };

    try {
      if (editingBanner) {
        // --- Update Existing Banner ---
        const bannerDocRef = doc(db, 'banners', editingBanner.id);
        await updateDoc(bannerDocRef, {
          ...submissionData,
          updatedAt: serverTimestamp(),
        });
        // Update local state
        const updatedBanners = banners.map(b =>
           b.id === editingBanner.id ? { ...b, ...submissionData, updatedAt: new Date() } : b
        ).sort((a, b) => a.order - b.order); // Re-sort after update
        setBanners(updatedBanners);
        toast({ title: "Banner Updated", description: `Details for banner saved.` });
      } else {
        // --- Add New Banner ---
         // Ensure the order is set correctly for a new banner
         const finalOrder = typeof data.order === 'number' ? data.order : (banners.length > 0 ? Math.max(...banners.map(b => b.order)) + 1 : 0);
        const bannersCollection = collection(db, 'banners');
        const newDocRef = await addDoc(bannersCollection, { // Using addDoc here
          ...submissionData,
           order: finalOrder, // Use calculated order
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
        // Add to local state
         const newBanner: Banner = { ...submissionData, id: newDocRef.id, order: finalOrder, createdAt: new Date(), updatedAt: new Date() };
         setBanners(prev => [...prev, newBanner].sort((a, b) => a.order - b.order)); // Add and sort
        toast({ title: "Banner Added", description: `New banner created successfully.` });
      }
      setIsDialogOpen(false);
      form.reset();
    } catch (err) {
      console.error("Error saving banner:", err);
      const errorMsg = err instanceof Error ? err.message : "Could not save banner details.";
      setError(errorMsg);
      toast({ variant: "destructive", title: "Save Failed", description: errorMsg });
    } finally {
      setIsSaving(false);
    }
  };

   // --- Delete Banner ---
   const handleDeleteBanner = async () => {
     if (!deletingBannerId || !db) return;
     const bannerToDelete = banners.find(b => b.id === deletingBannerId);
     if (!bannerToDelete) return;

     try {
       const bannerDocRef = doc(db, 'banners', deletingBannerId);
       await deleteDoc(bannerDocRef);
       // Update local state and re-order remaining banners
       const remainingBanners = banners
           .filter(b => b.id !== deletingBannerId)
           .sort((a, b) => a.order - b.order) // Sort by original order first
           .map((banner, index) => ({ ...banner, order: index })); // Re-assign sequential order

       setBanners(remainingBanners);
       await updateBannerOrderInFirestore(remainingBanners); // Update order in DB
       toast({ title: "Banner Deleted", description: "The banner has been removed." });
     } catch (err) {
       console.error("Error deleting banner:", err);
       const errorMsg = err instanceof Error ? err.message : "Could not delete the banner.";
       toast({ variant: "destructive", title: "Deletion Failed", description: errorMsg });
     } finally {
       setDeletingBannerId(null); // Reset deleting state
     }
   };

    // --- Toggle Active Status ---
    const handleToggleActiveStatus = async (bannerToUpdate: Banner) => {
      if (!bannerToUpdate || !db) return;
      setUpdatingBannerId(bannerToUpdate.id);

      const bannerDocRef = doc(db, 'banners', bannerToUpdate.id);
      const newStatus = !bannerToUpdate.isActive;

      try {
        await updateDoc(bannerDocRef, {
          isActive: newStatus,
          updatedAt: serverTimestamp(),
        });
        setBanners(prevBanners =>
          prevBanners.map(b =>
            b.id === bannerToUpdate.id ? { ...b, isActive: newStatus, updatedAt: new Date() } : b
          )
        );
        toast({ title: `Banner ${newStatus ? 'Activated' : 'Deactivated'}`, description: `Banner visibility updated.` });
      } catch (err) {
        console.error(`Error updating banner ${bannerToUpdate.id} status:`, err);
        const errorMsg = err instanceof Error ? err.message : "Could not update banner status.";
        toast({ variant: "destructive", title: "Update Failed", description: errorMsg });
      } finally {
        setUpdatingBannerId(null);
      }
    };

    // --- Reorder Banners ---
    const moveBanner = async (index: number, direction: 'up' | 'down') => {
       const newIndex = direction === 'up' ? index - 1 : index + 1;
       if (newIndex < 0 || newIndex >= banners.length) return; // Boundary check

       setUpdatingBannerId(banners[index].id); // Indicate loading/updating

       const updatedBanners = [...banners];
       // Swap banner positions
       [updatedBanners[index], updatedBanners[newIndex]] = [updatedBanners[newIndex], updatedBanners[index]];

       // Re-assign order numbers sequentially
       const finalOrderedBanners = updatedBanners.map((banner, idx) => ({ ...banner, order: idx }));

       setBanners(finalOrderedBanners); // Update local state immediately

       try {
         await updateBannerOrderInFirestore(finalOrderedBanners); // Update Firestore
         toast({ title: "Banner Reordered", description: "Banner order saved." });
       } catch (err) {
         // Revert local state on error
         setBanners(banners); // Revert to original order before Firestore update
         console.error("Error reordering banners:", err);
       } finally {
          setUpdatingBannerId(null);
       }
    };


  if (loading && banners.length === 0 && !error) {
    return <BannersTableSkeleton />;
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-3xl font-bold">Manage Banners</h1>
        <Button onClick={openAddDialog}>
          <PlusCircle className="mr-2 h-4 w-4" /> Add New Banner
        </Button>
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Error</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {/* Banners List */}
      <Card>
        <CardHeader>
          <CardTitle>Banner List</CardTitle>
          <CardDescription>Manage promotional banners displayed on the homepage.</CardDescription>
        </CardHeader>
        <CardContent>
           {loading && banners.length === 0 ? (
             <BannersTableSkeleton />
           ) : banners.length === 0 ? (
             <p className="text-center text-muted-foreground py-8">No banners found. Add one to get started!</p>
           ) : (
            <div className="space-y-2">
              {banners.map((banner, index) => (
                <Card key={banner.id} className={`flex flex-col sm:flex-row items-center gap-4 p-4 border rounded-lg ${!banner.isActive ? 'opacity-50 bg-muted/30' : ''}`}>
                   {/* Drag Handle & Reorder Buttons */}
                  <div className="flex flex-col items-center gap-1 shrink-0">
                      <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => moveBanner(index, 'up')} disabled={index === 0 || !!updatingBannerId}>
                          <ArrowUp className="h-4 w-4" />
                          <span className="sr-only">Move Up</span>
                      </Button>
                      <GripVertical className="h-5 w-5 text-muted-foreground cursor-grab" />
                      <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => moveBanner(index, 'down')} disabled={index === banners.length - 1 || !!updatingBannerId}>
                          <ArrowDown className="h-4 w-4" />
                           <span className="sr-only">Move Down</span>
                      </Button>
                  </div>

                   {/* Banner Image Preview */}
                  <Image
                     src={banner.imageUrl || 'https://picsum.photos/seed/placeholder/150/75'}
                     alt={banner.altText || 'Banner Preview'}
                     width={150}
                     height={75}
                     className="object-cover rounded-md border aspect-[2/1]"
                     data-ai-hint={banner.dataAiHint || 'promotional banner'}
                   />

                   {/* Banner Details */}
                   <div className="flex-grow space-y-1 text-sm">
                      <p className="font-semibold">{banner.title || <span className="text-muted-foreground italic">No Title</span>}</p>
                      <p className="text-muted-foreground text-xs truncate">{banner.subtitle || <span className="italic">No Subtitle</span>}</p>
                      <p className="text-xs">Alt: <span className="italic">{banner.altText}</span></p>
                      {banner.link && <p className="text-xs">Link: <a href={banner.link} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline truncate block">{banner.link}</a></p>}
                   </div>

                    {/* Status & Actions */}
                   <div className="flex flex-col sm:flex-row items-center gap-2 sm:ml-auto shrink-0">
                      <Switch
                         checked={banner.isActive}
                         onCheckedChange={() => handleToggleActiveStatus(banner)}
                         disabled={updatingBannerId === banner.id}
                         aria-label={banner.isActive ? 'Deactivate banner' : 'Activate banner'}
                       />
                       <div className="flex gap-1">
                           <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => openEditDialog(banner)}>
                              <Edit className="h-4 w-4" />
                               <span className="sr-only">Edit</span>
                           </Button>
                            <AlertDialog>
                               <AlertDialogTrigger asChild>
                                  <Button variant="destructive" size="icon" className="h-8 w-8" onClick={() => setDeletingBannerId(banner.id)}>
                                     <Trash2 className="h-4 w-4"/>
                                      <span className="sr-only">Delete</span>
                                  </Button>
                               </AlertDialogTrigger>
                               <AlertDialogContent>
                                 <AlertDialogHeader>
                                   <AlertDialogTitle>Are you sure?</AlertDialogTitle>
                                   <AlertDialogDescription>
                                     This action cannot be undone. This will permanently delete this banner.
                                   </AlertDialogDescription>
                                 </AlertDialogHeader>
                                 <AlertDialogFooter>
                                   <AlertDialogCancel onClick={() => setDeletingBannerId(null)}>Cancel</AlertDialogCancel>
                                   <AlertDialogAction
                                      onClick={handleDeleteBanner}
                                      className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                                       Delete
                                    </AlertDialogAction>
                                 </AlertDialogFooter>
                               </AlertDialogContent>
                           </AlertDialog>
                       </div>
                   </div>
                   {updatingBannerId === banner.id && <Loader2 className="h-4 w-4 animate-spin ml-2" />}
                </Card>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Add/Edit Banner Dialog */}
       <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
         <DialogContent className="sm:max-w-2xl">
           <DialogHeader>
             <DialogTitle>{editingBanner ? 'Edit Banner' : 'Add New Banner'}</DialogTitle>
             <DialogDescription>
               {editingBanner ? `Update details for the banner.` : 'Enter the details for the new banner.'}
             </DialogDescription>
           </DialogHeader>
           <form onSubmit={form.handleSubmit(onSubmit)} className="grid gap-4 py-4">
             {/* Order */}
             <div className="grid grid-cols-4 items-center gap-4">
               <Label htmlFor="order" className="text-right">Display Order</Label>
               <Input
                 id="order"
                 type="number"
                 {...form.register('order', { valueAsNumber: true })}
                 className="col-span-3"
                 placeholder="e.g., 0, 1, 2..."
                 disabled={isSaving}
               />
                {form.formState.errors.order && <p className="col-span-4 text-sm text-destructive">{form.formState.errors.order.message}</p>}
             </div>
             {/* Image URL */}
             <div className="grid grid-cols-4 items-center gap-4">
               <Label htmlFor="imageUrl" className="text-right">Image URL*</Label>
               <Input id="imageUrl" {...form.register('imageUrl')} className="col-span-3" placeholder="https://..." disabled={isSaving} />
               {form.watch('imageUrl') && (
                    <div className="col-span-4 col-start-2">
                        <Image src={form.watch('imageUrl')!} alt="Image Preview" width={150} height={75} className="object-cover border rounded-sm mt-1 aspect-[2/1]" />
                    </div>
                )}
               {form.formState.errors.imageUrl && <p className="col-span-4 text-sm text-destructive">{form.formState.errors.imageUrl.message}</p>}
             </div>
             {/* Alt Text */}
             <div className="grid grid-cols-4 items-center gap-4">
               <Label htmlFor="altText" className="text-right">Alt Text*</Label>
               <Input id="altText" {...form.register('altText')} className="col-span-3" placeholder="Describe the image for accessibility" disabled={isSaving} />
               {form.formState.errors.altText && <p className="col-span-4 text-sm text-destructive">{form.formState.errors.altText.message}</p>}
             </div>
             {/* Link URL */}
             <div className="grid grid-cols-4 items-center gap-4">
               <Label htmlFor="link" className="text-right">Link URL</Label>
               <Input id="link" {...form.register('link')} className="col-span-3" placeholder="https://... (Optional destination)" disabled={isSaving} />
               {form.formState.errors.link && <p className="col-span-4 text-sm text-destructive">{form.formState.errors.link.message}</p>}
             </div>
             {/* Title */}
             <div className="grid grid-cols-4 items-center gap-4">
               <Label htmlFor="title" className="text-right">Title</Label>
               <Input id="title" {...form.register('title')} className="col-span-3" placeholder="Optional title overlay" disabled={isSaving} />
             </div>
             {/* Subtitle */}
             <div className="grid grid-cols-4 items-center gap-4">
               <Label htmlFor="subtitle" className="text-right">Subtitle</Label>
               <Textarea id="subtitle" {...form.register('subtitle')} className="col-span-3" rows={2} placeholder="Optional subtitle overlay" disabled={isSaving} />
             </div>
             {/* AI Hint */}
             <div className="grid grid-cols-4 items-center gap-4">
               <Label htmlFor="dataAiHint" className="text-right">AI Hint</Label>
               <Input id="dataAiHint" {...form.register('dataAiHint')} className="col-span-3" placeholder="Optional keywords for AI (e.g., sale fashion)" disabled={isSaving} />
             </div>
              {/* Active Status */}
              <div className="grid grid-cols-4 items-center gap-4">
                 <Label htmlFor="isActive" className="text-right">Status</Label>
                 <div className="col-span-3 flex items-center space-x-2">
                     <Checkbox
                        id="isActive"
                        checked={form.watch('isActive')}
                        onCheckedChange={(checked) => form.setValue('isActive', !!checked)}
                        disabled={isSaving}
                      />
                      <Label htmlFor="isActive" className="font-normal">Active (Banner is visible)</Label>
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
                 {editingBanner ? 'Save Changes' : 'Add Banner'}
               </Button>
             </DialogFooter>
           </form>
         </DialogContent>
       </Dialog>

    </div>
  );
}

// Skeleton Loader
function BannersTableSkeleton() {
   return (
    <Card>
      <CardHeader>
         <Skeleton className="h-6 w-1/4 mb-2"/>
         <Skeleton className="h-4 w-1/2"/>
      </CardHeader>
      <CardContent className="space-y-4">
        {Array.from({ length: 3 }).map((_, index) => (
          <div key={index} className="flex items-center gap-4 p-4 border rounded-lg">
             <Skeleton className="h-8 w-8" /> {/* Drag/Reorder */}
             <Skeleton className="h-[75px] w-[150px] rounded-md" /> {/* Image */}
             <div className="flex-grow space-y-2">
                <Skeleton className="h-4 w-3/4" /> {/* Title */}
                <Skeleton className="h-3 w-1/2" /> {/* Subtitle/Alt */}
                <Skeleton className="h-3 w-full" /> {/* Link */}
             </div>
             <Skeleton className="h-8 w-8" /> {/* Actions */}
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

export default function AdminBannersPage() {
    return (
      <AdminGuard>
        <AdminBannersPageContent />
      </AdminGuard>
    );
}