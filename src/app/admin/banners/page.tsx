
"use client";

import * as React from 'react';
import { useState, useEffect, useCallback } from 'react';
import {
  collection,
  query,
  orderBy,
  getDocs,
  doc,
  updateDoc,
  deleteDoc,
  addDoc,
  serverTimestamp,
  Timestamp
} from 'firebase/firestore';
import { db, firebaseInitializationError } from '@/lib/firebase/config';
import type { Banner, BannerFormValues } from '@/lib/types';
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
import { AlertCircle, Loader2, Edit, Trash2, PlusCircle, Image as ImageIcon, ArrowUpDown } from 'lucide-react';
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
import { safeToDate } from '@/lib/utils';
import Image from 'next/image'; // For displaying images
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';

const bannerSchema = z.object({
  title: z.string().min(3, "Title must be at least 3 characters").max(100, "Title too long").optional().nullable(),
  subtitle: z.string().max(150, "Subtitle too long").optional().nullable(),
  imageUrl: z.string().url("Invalid URL format"),
  link: z.string().url("Invalid URL format").optional().or(z.literal('')).nullable(),
  altText: z.string().max(100, "Alt text too long").optional().nullable(),
  dataAiHint: z.string().max(50, "AI Hint too long").optional().nullable(),
  order: z.number().min(0, "Order must be non-negative").default(0),
  isActive: z.boolean().default(true),
});

function BannersPageSkeleton() {
  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <Skeleton className="h-9 w-1/3" /> {/* Title */}
        <Skeleton className="h-10 w-36" /> {/* Add Button */}
      </div>
      <Card>
        <CardHeader>
          <Skeleton className="h-7 w-1/4 mb-1" /> {/* Card Title */}
          <Skeleton className="h-4 w-1/2" /> {/* Card Description */}
        </CardHeader>
        <CardContent className="space-y-4">
          {Array.from({ length: 3 }).map((_, index) => (
            <div key={index} className="flex items-center gap-4 p-4 border rounded-lg">
              <Skeleton className="h-8 w-8" /> {/* Drag Handle area */}
              <Skeleton className="h-[75px] w-[150px] rounded-md" /> {/* Image */}
              <div className="flex-grow space-y-2">
                <Skeleton className="h-4 w-3/4" /> {/* Title */}
                <Skeleton className="h-3 w-1/2" /> {/* Subtitle */}
              </div>
              <Skeleton className="h-8 w-8" /> {/* Edit Button */}
              <Skeleton className="h-8 w-8" /> {/* Delete Button */}
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}


export default function AdminBannersPage() {
  const [banners, setBanners] = useState<Banner[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { toast } = useToast();

  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingBanner, setEditingBanner] = useState<Banner | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [deletingBannerId, setDeletingBannerId] = useState<string | null>(null);

  const form = useForm<BannerFormValues>({
    resolver: zodResolver(bannerSchema),
    defaultValues: {
      title: '',
      subtitle: '',
      imageUrl: '',
      link: '',
      altText: '',
      dataAiHint: '',
      order: 0,
      isActive: true,
    },
  });

  const fetchBanners = useCallback(async () => {
    let isMounted = true;
    setLoading(true);
    setError(null);

    if (firebaseInitializationError || !db) {
      if (isMounted) {
        setError(firebaseInitializationError || "Database connection not available.");
        setLoading(false);
      }
      return;
    }

    try {
      const bannersCollection = collection(db, 'banners');
      const q = query(bannersCollection, orderBy('order', 'asc'));
      const querySnapshot = await getDocs(q);
      const bannersData = querySnapshot.docs.map(docSnap => ({
        id: docSnap.id,
        ...docSnap.data(),
        createdAt: safeToDate(docSnap.data().createdAt as Timestamp | undefined),
        updatedAt: safeToDate(docSnap.data().updatedAt as Timestamp | undefined),
      } as Banner));
      if (isMounted) {
        setBanners(bannersData);
      }
    } catch (err) {
      console.error("Error fetching banners:", err);
      if (isMounted) {
        setError(err instanceof Error ? err.message : "Failed to fetch banners");
        toast({ variant: "destructive", title: "Fetch Error", description: String(err) });
      }
    } finally {
      if (isMounted) {
        setLoading(false);
      }
    }
  }, [toast]);

  useEffect(() => {
    fetchBanners();
  }, [fetchBanners]);

  const openAddDialog = () => {
    setEditingBanner(null);
    form.reset({
      title: '', subtitle: '', imageUrl: '', link: '', altText: '', dataAiHint: '', order: 0, isActive: true,
    });
    setIsDialogOpen(true);
  };

  const openEditDialog = (banner: Banner) => {
    setEditingBanner(banner);
    form.reset({
      title: banner.title || '',
      subtitle: banner.subtitle || '',
      imageUrl: banner.imageUrl,
      link: banner.link || '',
      altText: banner.altText || '',
      dataAiHint: banner.dataAiHint || '',
      order: banner.order,
      isActive: banner.isActive,
    });
    setIsDialogOpen(true);
  };

  const onSubmit = async (data: BannerFormValues) => {
    if (!db) {
      setError("Database not available.");
      setIsSaving(false);
      return;
    }
    setIsSaving(true);
    setError(null);

    const submissionData = {
      ...data,
      title: data.title || null,
      subtitle: data.subtitle || null,
      link: data.link || null,
      altText: data.altText || null,
      dataAiHint: data.dataAiHint || null,
    };

    try {
      if (editingBanner) {
        const bannerDocRef = doc(db, 'banners', editingBanner.id);
        await updateDoc(bannerDocRef, { ...submissionData, updatedAt: serverTimestamp() });
        toast({ title: "Banner Updated", description: `${data.title || 'Banner'} details saved.` });
      } else {
        await addDoc(collection(db, 'banners'), { ...submissionData, createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
        toast({ title: "Banner Added", description: `${data.title || 'New banner'} has been created.` });
      }
      setIsDialogOpen(false);
      form.reset();
      fetchBanners(); // Refresh the list
    } catch (err) {
      console.error("Error saving banner:", err);
      const errorMsg = err instanceof Error ? err.message : "Could not save banner details.";
      setError(errorMsg);
      toast({ variant: "destructive", title: "Save Failed", description: errorMsg });
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeleteBanner = async (bannerId: string) => {
    if (!bannerId || !db) return;
    setDeletingBannerId(bannerId); // Indicate loading for this specific delete action
    try {
      await deleteDoc(doc(db, 'banners', bannerId));
      toast({ title: "Banner Deleted" });
      fetchBanners(); // Refresh list
    } catch (err) {
      console.error("Error deleting banner:", err);
      const errorMsg = err instanceof Error ? err.message : "Could not delete the banner.";
      toast({ variant: "destructive", title: "Deletion Failed", description: errorMsg });
    } finally {
      setDeletingBannerId(null);
    }
  };

  if (loading) {
    return <AdminGuard><BannersPageSkeleton /></AdminGuard>;
  }

  return (
    <AdminGuard>
      <div className="space-y-6">
        <div className="flex justify-between items-center">
          <h1 className="text-3xl font-bold flex items-center gap-2"><ImageIcon className="w-7 h-7" /> Manage Banners</h1>
          <Button onClick={openAddDialog}>
            <PlusCircle className="mr-2 h-4 w-4" /> Add New Banner
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
            <CardTitle>Banner List</CardTitle>
            <CardDescription>Manage homepage promotional banners. Drag to reorder (not implemented yet).</CardDescription>
          </CardHeader>
          <CardContent>
            {banners.length === 0 && !error ? (
              <p className="text-center text-muted-foreground py-8">No banners found. Add one to get started!</p>
            ) : (
              <div className="space-y-4">
                {banners.map((banner) => (
                  <Card key={banner.id} className="flex items-center gap-4 p-4 hover:shadow-md transition-shadow">
                    <ImageIcon className="w-5 h-5 text-muted-foreground" /> {/* Placeholder for drag handle */}
                    <Image
                      src={banner.imageUrl || 'https://placehold.co/150x75.png'}
                      alt={banner.altText || banner.title || 'Banner image'}
                      width={150}
                      height={75}
                      className="rounded-md object-cover border"
                      data-ai-hint={banner.dataAiHint || "banner image"}
                    />
                    <div className="flex-grow">
                      <h3 className="font-semibold">{banner.title || "Untitled Banner"}</h3>
                      <p className="text-xs text-muted-foreground">{banner.subtitle || "No subtitle"}</p>
                      <p className="text-xs text-muted-foreground">Order: {banner.order} | Status: {banner.isActive ? "Active" : "Inactive"}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button variant="outline" size="icon" onClick={() => openEditDialog(banner)}>
                        <Edit className="h-4 w-4" />
                        <span className="sr-only">Edit Banner</span>
                      </Button>
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button variant="destructive" size="icon" disabled={deletingBannerId === banner.id}>
                            {deletingBannerId === banner.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                             <span className="sr-only">Delete Banner</span>
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Are you sure?</AlertDialogTitle>
                            <AlertDialogDescription>
                              This action cannot be undone. This will permanently delete the banner
                              "{banner.title || 'this banner'}".
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Cancel</AlertDialogCancel>
                            <AlertDialogAction onClick={() => handleDeleteBanner(banner.id)}>
                              Delete
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </div>
                  </Card>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogContent className="sm:max-w-lg">
            <DialogHeader>
              <DialogTitle>{editingBanner ? 'Edit Banner' : 'Add New Banner'}</DialogTitle>
              <DialogDescription>
                {editingBanner ? `Update details for banner "${editingBanner.title || ''}".` : 'Enter details for the new banner.'}
              </DialogDescription>
            </DialogHeader>
            <form onSubmit={form.handleSubmit(onSubmit)} className="grid gap-4 py-4">
              <div className="space-y-1">
                <Label htmlFor="titleDialog">Title</Label>
                <Input id="titleDialog" {...form.register('title')} disabled={isSaving} />
                {form.formState.errors.title && <p className="text-sm text-destructive">{form.formState.errors.title.message}</p>}
              </div>
              <div className="space-y-1">
                <Label htmlFor="subtitleDialog">Subtitle</Label>
                <Input id="subtitleDialog" {...form.register('subtitle')} disabled={isSaving} />
                {form.formState.errors.subtitle && <p className="text-sm text-destructive">{form.formState.errors.subtitle.message}</p>}
              </div>
              <div className="space-y-1">
                <Label htmlFor="imageUrlDialog">Image URL*</Label>
                <Input id="imageUrlDialog" {...form.register('imageUrl')} placeholder="https://..." disabled={isSaving} />
                {form.watch('imageUrl') && (
                    <div className="mt-2 rounded-md border overflow-hidden max-w-xs">
                        <Image
                            src={form.watch('imageUrl')!}
                            alt="Banner Preview"
                            width={200} // Adjusted for better preview within dialog
                            height={100} // Adjusted for better preview within dialog
                            className="object-contain"
                            data-ai-hint="banner image preview"
                            onError={(e) => (e.currentTarget.style.display = 'none')} // Hide if image fails to load
                        />
                    </div>
                )}
                {form.formState.errors.imageUrl && <p className="text-sm text-destructive">{form.formState.errors.imageUrl.message}</p>}
              </div>
              <div className="space-y-1">
                <Label htmlFor="dataAiHintDialog">Image AI Hint</Label>
                <Input id="dataAiHintDialog" {...form.register('dataAiHint')} placeholder="e.g. sale fashion" disabled={isSaving} />
                {form.formState.errors.dataAiHint && <p className="text-sm text-destructive">{form.formState.errors.dataAiHint.message}</p>}
              </div>
              <div className="space-y-1">
                <Label htmlFor="linkDialog">Link URL</Label>
                <Input id="linkDialog" {...form.register('link')} placeholder="https://..." disabled={isSaving} />
                {form.formState.errors.link && <p className="text-sm text-destructive">{form.formState.errors.link.message}</p>}
              </div>
              <div className="space-y-1">
                <Label htmlFor="altTextDialog">Alt Text (for Image)</Label>
                <Input id="altTextDialog" {...form.register('altText')} disabled={isSaving} />
                {form.formState.errors.altText && <p className="text-sm text-destructive">{form.formState.errors.altText.message}</p>}
              </div>
              <div className="space-y-1">
                <Label htmlFor="orderDialog">Display Order*</Label>
                <Input id="orderDialog" type="number" {...form.register('order', { valueAsNumber: true })} disabled={isSaving} />
                {form.formState.errors.order && <p className="text-sm text-destructive">{form.formState.errors.order.message}</p>}
              </div>
              <div className="flex items-center space-x-2">
                <Controller name="isActive" control={form.control} render={({ field }) => ( <Checkbox id="isActiveDialog" checked={field.value} onCheckedChange={field.onChange} disabled={isSaving} /> )}/>
                <Label htmlFor="isActiveDialog" className="font-normal">Active</Label>
              </div>
              <DialogFooter>
                <DialogClose asChild>
                  <Button type="button" variant="outline" disabled={isSaving}>Cancel</Button>
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
    </AdminGuard>
  );
}

    