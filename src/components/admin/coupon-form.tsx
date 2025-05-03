// src/components/admin/coupon-form.tsx
"use client";

import * as React from 'react';
import { useState, useEffect } from 'react';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { doc, addDoc, updateDoc, serverTimestamp, collection, Timestamp } from 'firebase/firestore';
import { db } from '@/lib/firebase/config';
import type { Coupon, Store } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Checkbox } from '@/components/ui/checkbox'; // Use Checkbox for Featured
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { format } from "date-fns";
import { CalendarIcon } from "lucide-react";
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
import { AlertCircle } from 'lucide-react';
import { cn } from "@/lib/utils";

// Basic URL validation, can be enhanced
const urlSchema = z.string().url({ message: "Please enter a valid URL (e.g., https://example.com)" }).or(z.literal('')).nullable().optional();

// Zod schema for coupon form validation
const couponSchema = z.object({
  storeId: z.string().min(1, { message: "Please select a store" }),
  description: z.string().min(5, { message: "Description must be at least 5 characters" }),
  code: z.string().optional().nullable(), // Code is optional
  link: urlSchema,
  expiryDate: z.date().optional().nullable(), // Expiry date is optional
  isFeatured: z.boolean().default(false),
  isActive: z.boolean().default(true),
});

type CouponFormValues = z.infer<typeof couponSchema>;

interface CouponFormProps {
  stores: Store[]; // List of stores for the dropdown
  coupon?: Coupon | null; // Existing coupon data for editing
  onClose: () => void;
  onSuccess: () => void; // Callback after successful save
}

export default function CouponForm({ stores, coupon, onClose, onSuccess }: CouponFormProps) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const isEditing = !!coupon;

  const {
    register,
    handleSubmit,
    control,
    reset,
    setValue,
    watch,
    formState: { errors },
  } = useForm<CouponFormValues>({
    resolver: zodResolver(couponSchema),
    defaultValues: {
      storeId: '',
      description: '',
      code: '',
      link: '',
      expiryDate: null,
      isFeatured: false,
      isActive: true,
    },
  });

  // Pre-fill form if editing
  useEffect(() => {
    if (isEditing && coupon) {
      reset({
        storeId: coupon.storeId,
        description: coupon.description,
        code: coupon.code || '',
        link: coupon.link || '',
        // Convert Firestore Timestamp back to Date if necessary
        expiryDate: coupon.expiryDate instanceof Timestamp ? coupon.expiryDate.toDate() : (coupon.expiryDate || null),
        isFeatured: coupon.isFeatured,
        isActive: coupon.isActive,
      });
    } else {
       // Reset to defaults if adding or coupon becomes null
       reset({
         storeId: '',
         description: '',
         code: '',
         link: '',
         expiryDate: null,
         isFeatured: false,
         isActive: true,
       });
    }
  }, [coupon, isEditing, reset]);

  const onSubmit = async (data: CouponFormValues) => {
    setLoading(true);
    setError(null);

    try {
       // Prepare data for Firestore
       // Ensure expiryDate is null or a Firestore Timestamp
       const expiryTimestamp = data.expiryDate ? Timestamp.fromDate(data.expiryDate) : null;

       const firestoreData = {
         ...data,
         code: data.code || null, // Store null if empty string
         link: data.link || null, // Store null if empty string
         expiryDate: expiryTimestamp,
         updatedAt: serverTimestamp(),
       };

      if (isEditing && coupon) {
        // Update existing coupon
        const couponDocRef = doc(db, 'coupons', coupon.id);
        await updateDoc(couponDocRef, firestoreData);
        toast({
          title: "Coupon Updated",
          description: `Coupon "${data.description}" has been successfully updated.`,
        });
      } else {
        // Add new coupon
        const couponsCollection = collection(db, 'coupons');
        await addDoc(couponsCollection, {
          ...firestoreData,
          createdAt: serverTimestamp(), // Add createdAt for new coupons
        });
        toast({
          title: "Coupon Added",
          description: `Coupon "${data.description}" has been successfully added.`,
        });
      }
      onSuccess(); // Call success callback (refetch list, close form)
    } catch (err: any) {
      console.error("Error saving coupon:", err);
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

   // Watch expiry date for calendar display
   const expiryDateValue = watch("expiryDate");

  return (
    <Dialog open={true} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-[600px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEditing ? 'Edit Coupon' : 'Add New Coupon'}</DialogTitle>
          <DialogDescription>
            {isEditing ? `Update the details for this coupon.` : 'Enter the details for the new coupon.'}
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
          {/* Store Selection */}
           <div className="grid grid-cols-4 items-center gap-4">
             <Label htmlFor="storeId" className="text-right">Store *</Label>
             <div className="col-span-3">
               <Controller
                 control={control}
                 name="storeId"
                 render={({ field }) => (
                   <Select
                     onValueChange={field.onChange}
                     value={field.value}
                     disabled={loading || stores.length === 0}
                   >
                     <SelectTrigger id="storeId" aria-invalid={errors.storeId ? "true" : "false"}>
                       <SelectValue placeholder="Select a store..." />
                     </SelectTrigger>
                     <SelectContent>
                       {stores.length > 0 ? (
                         stores.map((store) => (
                           <SelectItem key={store.id} value={store.id}>{store.name}</SelectItem>
                         ))
                       ) : (
                         <SelectItem value="loading" disabled>Loading stores...</SelectItem>
                       )}
                     </SelectContent>
                   </Select>
                 )}
               />
               {errors.storeId && <p className="text-sm text-destructive mt-1">{errors.storeId.message}</p>}
             </div>
           </div>

          {/* Description */}
          <div className="grid grid-cols-4 items-center gap-4">
            <Label htmlFor="description" className="text-right">Description *</Label>
            <div className="col-span-3">
                <Textarea id="description" {...register('description')} disabled={loading} aria-invalid={errors.description ? "true" : "false"} />
                {errors.description && <p className="text-sm text-destructive mt-1">{errors.description.message}</p>}
            </div>
          </div>

          {/* Coupon Code */}
          <div className="grid grid-cols-4 items-center gap-4">
            <Label htmlFor="code" className="text-right">Code</Label>
            <div className="col-span-3">
                <Input id="code" {...register('code')} placeholder="Optional coupon code" disabled={loading} />
                {/* No error display needed for optional field */}
            </div>
          </div>

          {/* Offer Link */}
          <div className="grid grid-cols-4 items-center gap-4">
            <Label htmlFor="link" className="text-right">Offer Link</Label>
            <div className="col-span-3">
                <Input id="link" {...register('link')} placeholder="Optional direct link to offer (https://...)" disabled={loading} aria-invalid={errors.link ? "true" : "false"} />
                 {errors.link && <p className="text-sm text-destructive mt-1">{errors.link.message}</p>}
            </div>
          </div>

          {/* Expiry Date */}
           <div className="grid grid-cols-4 items-center gap-4">
             <Label htmlFor="expiryDate" className="text-right">Expiry Date</Label>
              <div className="col-span-3">
                 <Controller
                   control={control}
                   name="expiryDate"
                   render={({ field }) => (
                     <Popover>
                       <PopoverTrigger asChild>
                         <Button
                           variant={"outline"}
                           className={cn(
                             "w-full justify-start text-left font-normal",
                             !field.value && "text-muted-foreground"
                           )}
                           disabled={loading}
                         >
                           <CalendarIcon className="mr-2 h-4 w-4" />
                           {field.value ? format(field.value, "PPP") : <span>Pick a date (optional)</span>}
                         </Button>
                       </PopoverTrigger>
                       <PopoverContent className="w-auto p-0">
                         <Calendar
                           mode="single"
                           selected={field.value ?? undefined} // Handle null value for Calendar
                           onSelect={(date) => field.onChange(date || null)} // Pass null if date is cleared
                           initialFocus
                         />
                       </PopoverContent>
                     </Popover>
                   )}
                 />
                  {errors.expiryDate && <p className="text-sm text-destructive mt-1">{errors.expiryDate.message}</p>}
              </div>
           </div>

            {/* Status Switches */}
            <div className="grid grid-cols-4 items-center gap-4">
                 <Label className="text-right">Settings</Label>
                 <div className="col-span-3 space-y-2">
                    <div className="flex items-center space-x-2">
                       <Controller
                         control={control}
                         name="isActive"
                         render={({ field }) => (
                           <Switch
                             id="isActive"
                             checked={field.value}
                             onCheckedChange={field.onChange}
                             disabled={loading}
                           />
                         )}
                       />
                       <Label htmlFor="isActive">Active</Label>
                       <span className="text-xs text-muted-foreground">(Show this coupon to users)</span>
                    </div>
                    <div className="flex items-center space-x-2">
                        <Controller
                         control={control}
                         name="isFeatured"
                         render={({ field }) => (
                           <Switch
                             id="isFeatured"
                             checked={field.value}
                             onCheckedChange={field.onChange}
                             disabled={loading}
                           />
                         )}
                       />
                       <Label htmlFor="isFeatured">Featured</Label>
                       <span className="text-xs text-muted-foreground">(Highlight this coupon)</span>
                    </div>
                 </div>
             </div>

        </form>

        <DialogFooter>
          <DialogClose asChild>
            <Button type="button" variant="outline" onClick={onClose} disabled={loading}>Cancel</Button>
          </DialogClose>
          <Button type="submit" onClick={handleSubmit(onSubmit)} disabled={loading}>
            {loading ? 'Saving...' : (isEditing ? 'Save Changes' : 'Add Coupon')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
