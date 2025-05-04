// src/app/admin/coupons/page.tsx
"use client";

import * as React from 'react';
import { useState, useEffect } from 'react';
import Link from 'next/link';
import { collection, getDocs, query, orderBy, doc, deleteDoc, getDoc, addDoc, updateDoc, serverTimestamp, Timestamp } from 'firebase/firestore'; // Added Timestamp
import { db } from '@/lib/firebase/config';
import type { Coupon, Store } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { format } from 'date-fns';
import { AlertCircle, Tag, MoreHorizontal, PlusCircle, ExternalLink, Trash2 } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger, // Ensure AlertDialogTrigger is imported
} from "@/components/ui/alert-dialog"
import { useToast } from "@/hooks/use-toast";
import AdminGuard from '@/components/guards/admin-guard';
import CouponForm from '@/components/admin/coupon-form'; // Import the CouponForm component

// Helper to safely convert Timestamps
const safeToDate = (fieldValue: any): Date | null => {
    if (fieldValue instanceof Timestamp) return fieldValue.toDate();
    if (fieldValue instanceof Date) return fieldValue;
    return null;
};

// Combined type for display
interface CouponWithStoreName extends Coupon {
  storeName: string;
}

function AdminCouponsPageContent() {
  const [coupons, setCoupons] = useState<CouponWithStoreName[]>([]);
  const [stores, setStores] = useState<Store[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { toast } = useToast();
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [selectedCoupon, setSelectedCoupon] = useState<Coupon | null>(null);

 const fetchCouponsAndStores = async () => {
     setLoading(true);
     setError(null);
     try {
       // 1. Fetch all stores
       const storesCollection = collection(db, 'stores');
       const storesSnapshot = await getDocs(query(storesCollection, orderBy('name', 'asc')));
       const storesData = storesSnapshot.docs.map(doc => ({
           id: doc.id,
           ...doc.data(),
            createdAt: safeToDate(doc.data().createdAt) || new Date(),
            updatedAt: safeToDate(doc.data().updatedAt) || new Date(),
       })) as Store[];
       setStores(storesData);
       const storesMap = new Map<string, string>(storesData.map(s => [s.id, s.name]));

       // 2. Fetch all coupons ordered by creation date
       const couponsCollection = collection(db, 'coupons');
       const qCoupons = query(couponsCollection, orderBy('createdAt', 'desc'));
       const couponsSnapshot = await getDocs(qCoupons);
       const couponsData = couponsSnapshot.docs.map(doc => ({
           id: doc.id,
           ...doc.data(),
           expiryDate: safeToDate(doc.data().expiryDate),
           createdAt: safeToDate(doc.data().createdAt) || new Date(),
           updatedAt: safeToDate(doc.data().updatedAt) || new Date(),
       })) as Coupon[];

       // 3. Combine coupon data with store names
       const combinedData = couponsData.map(coupon => ({
         ...coupon,
         storeName: storesMap.get(coupon.storeId) || 'Unknown Store',
       }));

       setCoupons(combinedData);

     } catch (err) {
       console.error("Error fetching coupons or stores:", err);
       setError("Failed to load data. Please try again later.");
     } finally {
       setLoading(false);
     }
 };


  useEffect(() => {
    fetchCouponsAndStores();
  }, []);

   const handleEdit = (coupon: Coupon) => {
      setSelectedCoupon(coupon);
      setIsFormOpen(true);
   };

   const handleDelete = async (couponId: string, couponDesc: string) => {
       try {
           await deleteDoc(doc(db, 'coupons', couponId));
           toast({
               title: "Coupon Deleted",
               description: `Coupon "${couponDesc}" has been successfully deleted.`,
           });
           fetchCouponsAndStores(); // Refresh the list
       } catch (err) {
           console.error("Error deleting coupon:", err);
           toast({
               variant: "destructive",
               title: "Deletion Failed",
               description: `Could not delete coupon "${couponDesc}". Please try again. Error: ${err instanceof Error ? err.message : String(err)}`,
           });
           setError(`Failed to delete coupon ${couponDesc}.`);
       }
   };

   const handleAddNew = () => {
      setSelectedCoupon(null);
      setIsFormOpen(true);
   };

   const handleFormSuccess = () => {
       fetchCouponsAndStores();
       setIsFormOpen(false);
       setSelectedCoupon(null);
   };


  return (
    <AdminGuard>
       <Card>
         <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4">
            <div>
               <CardTitle className="text-2xl flex items-center gap-2">
                 <Tag className="w-6 h-6"/> Manage Coupons
               </CardTitle>
               <CardDescription>Add, edit, or remove store coupons and deals.</CardDescription>
            </div>
            <Button onClick={handleAddNew}>
                <PlusCircle className="mr-2 h-4 w-4" /> Add New Coupon
            </Button>
         </CardHeader>
         <CardContent>
           {error && (
             <Alert variant="destructive" className="mb-4">
               <AlertCircle className="h-4 w-4" />
               <AlertTitle>Error</AlertTitle>
               <AlertDescription>{error}</AlertDescription>
             </Alert>
           )}
           {loading ? (
             <CouponsTableSkeleton />
           ) : coupons.length > 0 ? (
             <Table>
               <TableHeader>
                 <TableRow>
                   <TableHead>Store</TableHead>
                   <TableHead>Description</TableHead>
                   <TableHead className="hidden md:table-cell">Code</TableHead>
                   <TableHead className="hidden lg:table-cell">Expires</TableHead>
                   <TableHead className="text-center">Status</TableHead>
                   <TableHead className="text-center">Featured</TableHead>
                    <TableHead className="text-center">Actions</TableHead>
                 </TableRow>
               </TableHeader>
               <TableBody>
                 {coupons.map((coupon) => (
                   <TableRow key={coupon.id}>
                      <TableCell className="font-medium">
                         <Link href={`/stores/${coupon.storeId}`} className="hover:underline">
                            {coupon.storeName}
                         </Link>
                      </TableCell>
                      <TableCell className="max-w-[300px] truncate">{coupon.description}</TableCell>
                      <TableCell className="hidden md:table-cell font-mono text-sm">
                         {coupon.code || <span className="text-muted-foreground italic">No Code</span>}
                      </TableCell>
                      <TableCell className="hidden lg:table-cell">
                         {coupon.expiryDate ? format(coupon.expiryDate, 'PP') : <span className="text-muted-foreground italic">No Expiry</span>}
                      </TableCell>
                      <TableCell className="text-center">
                         <Badge variant={coupon.isActive ? 'default' : 'outline'}>
                           {coupon.isActive ? 'Active' : 'Inactive'}
                         </Badge>
                      </TableCell>
                      <TableCell className="text-center">
                          <Badge variant={coupon.isFeatured ? 'secondary' : 'outline'}>
                           {coupon.isFeatured ? 'Yes' : 'No'}
                         </Badge>
                      </TableCell>
                     <TableCell className="text-center">
                       <DropdownMenu>
                         <DropdownMenuTrigger asChild>
                           <Button variant="ghost" className="h-8 w-8 p-0">
                             <span className="sr-only">Open menu</span>
                             <MoreHorizontal className="h-4 w-4" />
                           </Button>
                         </DropdownMenuTrigger>
                         <DropdownMenuContent align="end">
                           <DropdownMenuLabel>Actions</DropdownMenuLabel>
                           <DropdownMenuItem onClick={() => handleEdit(coupon)}>Edit Coupon</DropdownMenuItem>
                            {coupon.link && (
                                <DropdownMenuItem onClick={() => window.open(coupon.link!, '_blank')}>
                                    <ExternalLink className="mr-2 h-4 w-4" />View Offer Link
                                </DropdownMenuItem>
                            )}
                           <DropdownMenuSeparator />
                            <AlertDialog>
                               <AlertDialogTrigger asChild>
                                    {/* Ensure the trigger button is correctly formatted */}
                                    <Button variant="ghost" className="w-full justify-start px-2 py-1.5 text-sm font-normal text-destructive hover:bg-destructive/10 focus:text-destructive focus:bg-destructive/10 h-auto relative flex cursor-default select-none items-center rounded-sm outline-none transition-colors data-[disabled]:pointer-events-none data-[disabled]:opacity-50">
                                        <Trash2 className="mr-2 h-4 w-4"/> Delete Coupon
                                    </Button>
                               </AlertDialogTrigger>
                               <AlertDialogContent>
                                 <AlertDialogHeader>
                                   <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
                                   <AlertDialogDescription>
                                     This action cannot be undone. This will permanently delete the coupon: "{coupon.description}".
                                   </AlertDialogDescription>
                                 </AlertDialogHeader>
                                 <AlertDialogFooter>
                                   <AlertDialogCancel>Cancel</AlertDialogCancel>
                                   <AlertDialogAction
                                       onClick={() => handleDelete(coupon.id, coupon.description)}
                                       className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                                       Yes, delete coupon
                                   </AlertDialogAction>
                                 </AlertDialogFooter>
                               </AlertDialogContent>
                             </AlertDialog>
                         </DropdownMenuContent>
                       </DropdownMenu>
                     </TableCell>
                   </TableRow>
                 ))}
               </TableBody>
             </Table>
           ) : (
             <p className="text-center text-muted-foreground py-8">No coupons found. Add your first coupon!</p>
           )}
         </CardContent>
           {isFormOpen && (
               <CouponForm
                   stores={stores}
                   coupon={selectedCoupon}
                   onClose={() => setIsFormOpen(false)}
                   onSuccess={handleFormSuccess}
               />
           )}
       </Card>
     </AdminGuard>
   );
}

export default AdminCouponsPageContent;


function CouponsTableSkeleton() {
   return (
      <Table>
        <TableHeader>
          <TableRow>
             <TableHead><Skeleton className="h-5 w-24" /></TableHead>
             <TableHead><Skeleton className="h-5 w-48" /></TableHead>
             <TableHead className="hidden md:table-cell"><Skeleton className="h-5 w-20" /></TableHead>
             <TableHead className="hidden lg:table-cell"><Skeleton className="h-5 w-24" /></TableHead>
             <TableHead className="text-center"><Skeleton className="h-5 w-16 mx-auto" /></TableHead>
             <TableHead className="text-center"><Skeleton className="h-5 w-16 mx-auto" /></TableHead>
             <TableHead className="text-center"><Skeleton className="h-5 w-16 mx-auto" /></TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {[...Array(5)].map((_, i) => (
            <TableRow key={i}>
               <TableCell><Skeleton className="h-4 w-28" /></TableCell>
               <TableCell><Skeleton className="h-4 w-56" /></TableCell>
               <TableCell className="hidden md:table-cell"><Skeleton className="h-4 w-24" /></TableCell>
               <TableCell className="hidden lg:table-cell"><Skeleton className="h-4 w-28" /></TableCell>
               <TableCell className="text-center"><Skeleton className="h-5 w-20 mx-auto rounded-full" /></TableCell>
               <TableCell className="text-center"><Skeleton className="h-5 w-12 mx-auto rounded-full" /></TableCell>
               <TableCell className="text-center"><Skeleton className="h-8 w-8 rounded-full mx-auto" /></TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
   )
}
