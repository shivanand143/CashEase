// src/components/admin/store-form.tsx
"use client";

import * as React from 'react';
import { useState, useEffect } from 'react';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { doc, addDoc, updateDoc, serverTimestamp, collection } from 'firebase/firestore';
import { db } from '@/lib/firebase/config';
import type { Store } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogClose,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { AlertCircle, Upload, X } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton'; // Import Skeleton

// Basic URL validation, can be enhanced
const urlSchema = z.string().url({ message: "Please enter a valid URL (e.g., https://example.com)" }).or(z.literal('')).nullable().optional();

// Zod schema for store form validation
const storeSchema = z.object({
  name: z.string().min(2, { message: "Store name must be at least 2 characters" }),
  logoUrl: urlSchema,
  affiliateLink: urlSchema.refine(val => val && val.length > 0, { message: "Affiliate link is required" }), // Make required
  cashbackRate: z.string().min(1, { message: "Cashback rate description is required" }),
  description: z.string().optional(),
  categories: z.string().transform((val) => val.split(',').map(cat => cat.trim()).filter(cat => cat.length > 0)), // Convert comma-separated string to array
  isActive: z.boolean().default(true),
});

type StoreFormValues = z.infer<typeof storeSchema>;

interface StoreFormProps {
  store?: Store | null; // Existing store data for editing
  onClose: () => void;
  onSuccess: () => void; // Callback after successful save
}

export default function StoreForm({ store, onClose, onSuccess }: StoreFormProps) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const isEditing = !!store;

  const {
    register,
    handleSubmit,
    control,
    reset,
    formState: { errors },
  } = useForm<StoreFormValues>({
    resolver: zodResolver(storeSchema),
    defaultValues: {
      name: '',
      logoUrl: '',
      affiliateLink: '',
      cashbackRate: '',
      description: '',
      categories: '', // Initialize as string for input
      isActive: true,
    },
  });

  // Pre-fill form if editing
  useEffect(() => {
    if (isEditing && store) {
      reset({
        name: store.name,
        logoUrl: store.logoUrl || '',
        affiliateLink: store.affiliateLink || '',
        cashbackRate: store.cashbackRate,
        description: store.description || '',
        categories: store.categories.join(', '), // Convert array back to comma-separated string
        isActive: store.isActive,
      });
    } else {
        // Reset to defaults if adding or store becomes null
        reset({
          name: '',
          logoUrl: '',
          affiliateLink: '',
          cashbackRate: '',
          description: '',
          categories: '',
          isActive: true,
        });
    }
  }, [store, isEditing, reset]);

  const onSubmit = async (data: StoreFormValues) => {
    setLoading(true);
    setError(null);

    try {
      // Prepare data for Firestore, ensuring categories is an array
      const firestoreData = {
        ...data,
        categories: data.categories, // Zod transform already handled this
        updatedAt: serverTimestamp(),
      };

      if (isEditing && store) {
        // Update existing store
        const storeDocRef = doc(db, 'stores', store.id);
        await updateDoc(storeDocRef, firestoreData);
        toast({
          title: "Store Updated",
          description: `Store "${data.name}" has been successfully updated.`,
        });
      } else {
        // Add new store
        const storesCollection = collection(db, 'stores');
        await addDoc(storesCollection, {
          ...firestoreData,
          createdAt: serverTimestamp(), // Add createdAt for new stores
        });
        toast({
          title: "Store Added",
          description: `Store "${data.name}" has been successfully added.`,
        });
      }
      onSuccess(); // Call success callback (refetch list, close form)
    } catch (err: any) {
      console.error("Error saving store:", err);
      const errorMessage = err.message || "An unexpected error occurred.";
      setError(errorMessage);
      toast({
        variant: "destructive",
        title: "Save Failed",
        description: errorMessage,
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={true} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-[600px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEditing ? 'Edit Store' : 'Add New Store'}</DialogTitle>
          <DialogDescription>
            {isEditing ? `Update the details for ${store?.name}.` : 'Enter the details for the new store.'}
          </DialogDescription>
        </DialogHeader>

        {error && (
            <Alert variant="destructive" className="mt-4">
                <AlertCircle className="h-4 w-4" />
                <AlertTitle>Error</AlertTitle>
                <AlertDescription>{error}</AlertDescription>
            </Alert>
        )}

        <form onSubmit={handleSubmit(onSubmit)} className="grid gap-4 py-4">
          {/* Store Name */}
          <div className="grid grid-cols-4 items-center gap-4">
            <Label htmlFor="name" className="text-right">Name *</Label>
            <div className="col-span-3">
                <Input id="name" {...register('name')} disabled={loading} aria-invalid={errors.name ? "true" : "false"} />
                {errors.name && <p className="text-sm text-destructive mt-1">{errors.name.message}</p>}
            </div>
          </div>

          {/* Logo URL */}
          <div className="grid grid-cols-4 items-center gap-4">
            <Label htmlFor="logoUrl" className="text-right">Logo URL</Label>
            <div className="col-span-3">
                <Input id="logoUrl" {...register('logoUrl')} disabled={loading} placeholder="https://..." aria-invalid={errors.logoUrl ? "true" : "false"} />
                {errors.logoUrl && <p className="text-sm text-destructive mt-1">{errors.logoUrl.message}</p>}
            </div>
          </div>

          {/* Affiliate Link */}
          <div className="grid grid-cols-4 items-center gap-4">
            <Label htmlFor="affiliateLink" className="text-right">Affiliate Link *</Label>
            <div className="col-span-3">
                <Input id="affiliateLink" {...register('affiliateLink')} disabled={loading} placeholder="https://..." aria-invalid={errors.affiliateLink ? "true" : "false"} />
                {errors.affiliateLink && <p className="text-sm text-destructive mt-1">{errors.affiliateLink.message}</p>}
            </div>
          </div>

           {/* Cashback Rate */}
           <div className="grid grid-cols-4 items-center gap-4">
             <Label htmlFor="cashbackRate" className="text-right">Cashback Rate *</Label>
             <div className="col-span-3">
                 <Input id="cashbackRate" {...register('cashbackRate')} placeholder='e.g., "Up to 5%", "Flat ₹10"' disabled={loading} aria-invalid={errors.cashbackRate ? "true" : "false"} />
                 {errors.cashbackRate && <p className="text-sm text-destructive mt-1">{errors.cashbackRate.message}</p>}
             </div>
           </div>

           {/* Description */}
           <div className="grid grid-cols-4 items-center gap-4">
             <Label htmlFor="description" className="text-right">Description</Label>
              <div className="col-span-3">
                 <Textarea id="description" {...register('description')} placeholder="Optional: Terms, conditions, or details..." disabled={loading} />
                 {/* No validation error display needed for optional field unless specific validation is added */}
             </div>
           </div>

           {/* Categories */}
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="categories" className="text-right">Categories</Label>
              <div className="col-span-3">
                  <Input
                    id="categories"
                    {...register('categories')}
                    placeholder="e.g., Fashion, Electronics, Travel"
                    disabled={loading}
                    aria-invalid={errors.categories ? "true" : "false"}
                  />
                  <p className="text-xs text-muted-foreground mt-1">Enter categories separated by commas.</p>
                  {errors.categories && <p className="text-sm text-destructive mt-1">{errors.categories.message}</p>}
              </div>
            </div>

            {/* Is Active */}
           <div className="grid grid-cols-4 items-center gap-4">
             <Label htmlFor="isActive" className="text-right">Status</Label>
             <div className="col-span-3 flex items-center space-x-2">
                 <Controller
                    control={control}
                    name="isActive"
                    render={({ field }) => (
                        <Switch
                            id="isActive"
                            checked={field.value}
                            onCheckedChange={field.onChange}
                            disabled={loading}
                            aria-label="Store Status"
                        />
                    )}
                  />
               <span className="text-sm text-muted-foreground">
                 {control._getWatch('isActive') ? 'Active' : 'Inactive'}
               </span>
             </div>
           </div>

        </form>

        <DialogFooter>
          <DialogClose asChild>
            <Button type="button" variant="outline" onClick={onClose} disabled={loading}>Cancel</Button>
          </DialogClose>
          <Button type="submit" onClick={handleSubmit(onSubmit)} disabled={loading}>
            {loading ? 'Saving...' : (isEditing ? 'Save Changes' : 'Add Store')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
