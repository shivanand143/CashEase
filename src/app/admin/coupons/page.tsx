// src/app/admin/coupons/page.tsx
"use client";

import * as React from 'react';
import { useState, useEffect } from 'react';
import Link from 'next/link';
import { collection, getDocs, query, orderBy, doc, deleteDoc, getDoc, addDoc, updateDoc, serverTimestamp, Timestamp, where, getCountFromServer, writeBatch } from 'firebase/firestore';
import { db } from '@/lib/firebase/config';
import type { Coupon, Store } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { format } from 'date-fns';
import { AlertCircle, Tag, MoreHorizontal, PlusCircle, ExternalLink, Trash2, DatabaseZap } from 'lucide-react';
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
} from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import AdminGuard from '@/components/guards/admin-guard';
import CouponForm from '@/components/admin/coupon-form'; // Import the CouponForm component

// Example coupons (used for seeding)
const initialCouponsData = [
    { storeName: 'Myntra', code: 'MYNTRA200', description: '₹200 Off on Orders Above ₹1499', isFeatured: true, isActive: true },
    { storeName: 'Amazon IN', code: 'AMZSAVE10', description: '10% off Select Electronics (Max ₹500)', isFeatured: true, isActive: true },
    { storeName: 'Ajio', description: 'Flat 50-80% Off Top Brands', isFeatured: true, isActive: true, link: 'https://ajio.com/shop/sale' },
    { storeName: 'Flipkart', code: 'FLIPFIRST', description: '₹100 Off First Order on App', isFeatured: false, isActive: true },
    { storeName: 'BigBasket', description: 'Up to 50% Off Daily Essentials', isFeatured: false, isActive: true },
    { storeName: 'MakeMyTrip', code: 'FLYNOW', description: 'Flat ₹500 Off Domestic Flights', isFeatured: true, isActive: true },
];

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
  const [isSeeding, setIsSeeding] = useState(false);
  const [couponsExist, setCouponsExist] = useState(true); // Assume coupons exist initially

  // Define handleSeedData within the component scope
  const handleSeedData = React.useCallback(async (storesData: Store[]) => {
      setIsSeeding(true);
      setError(null);
      console.log("Seeding initial coupon data...");

      if (!storesData || storesData.length === 0) {
        setError("Cannot seed coupons because no stores exist. Please add stores first.");
        setIsSeeding(false);
        return;
      }

      try {
          const batch = writeBatch(db);
          const couponsCollection = collection(db, 'coupons');
          const storeNameToIdMap = new Map<string, string>(storesData.map(s => [s.name, s.id]));
          let seededCount = 0;

          // Seed Coupons
          initialCouponsData.forEach(couponData => {
              const storeId = storeNameToIdMap.get(couponData.storeName);
              if (!storeId) {
                  console.warn(`Skipping coupon "${couponData.description}" because store "${couponData.storeName}" was not found in the seed data.`);
                  return;
              }
              const couponDocRef = doc(couponsCollection);
              const newCoupon: Omit<Coupon, 'id' | 'createdAt' | 'updatedAt'> = {
                  storeId: storeId,
                  code: couponData.code || null,
                  description: couponData.description,
                  link: couponData.link || null,
                  expiryDate: null,
                  isFeatured: couponData.isFeatured,
                  isActive: couponData.isActive,
              };
              batch.set(couponDocRef, {
                  ...newCoupon,
                  createdAt: serverTimestamp(),
                  updatedAt: serverTimestamp(),
              });
              seededCount++;
          });
           console.log("Coupon seeding prepared.");

          await batch.commit();
          toast({
              title: "Coupon Data Seeded",
              description: `${seededCount} coupons added.`,
          });
      } catch (err) {
          console.error("Error seeding coupon data:", err);
          setError("Failed to seed initial coupon data. Please check console.");
          toast({
              variant: "destructive",
              title: "Seeding Failed",
              description: "Could not add initial coupon data. See console for details.",
          });
      } finally {
          setIsSeeding(false);
      }
  }, [toast]); // Removed fetchCouponsAndStores from deps


 const fetchCouponsAndStores = React.useCallback(async (shouldAutoSeed = false) => {
     setLoading(true);
     setError(null);
     let fetchedStores: Store[] = [];
     try {
       // 1. Fetch all stores first
       const storesCollection = collection(db, 'stores');
       const storesSnapshot = await getDocs(query(storesCollection, orderBy('name', 'asc')));
       fetchedStores = storesSnapshot.docs.map(doc => ({
           id: doc.id,
           ...doc.data(),
            createdAt: safeToDate(doc.data().createdAt) || new Date(),
            updatedAt: safeToDate(doc.data().updatedAt) || new Date(),
       })) as Store[];
       setStores(fetchedStores);
       const storesMap = new Map<string, string>(fetchedStores.map(s => [s.id, s.name]));

       // 2. Check if coupons exist
       const couponsCollection = collection(db, 'coupons');
       const countSnapshot = await getCountFromServer(query(couponsCollection, limit(1)));
       const hasCoupons = countSnapshot.data().count > 0;
       setCouponsExist(hasCoupons);

       if (hasCoupons) {
           // Fetch all coupons ordered by creation date
           const qCoupons = query(couponsCollection, orderBy('createdAt', 'desc'));
           const couponsSnapshot = await getDocs(qCoupons);
           const couponsData = couponsSnapshot.docs.map(doc => ({
               id: doc.id,
               ...doc.data(),
               expiryDate: safeToDate(doc.data().expiryDate),
               createdAt: safeToDate(doc.data().createdAt) || new Date(),
               updatedAt: safeToDate(doc.data().updatedAt) || new Date(),
           })) as Coupon[];

           // Combine coupon data with store names
           const combinedData = couponsData.map(coupon => ({
             ...coupon,
             storeName: storesMap.get(coupon.storeId) || 'Unknown Store',
           }));
           setCoupons(combinedData);

       } else if (shouldAutoSeed && fetchedStores.length > 0) {
           console.log("No coupons found, attempting to auto-seed...");
           await handleSeedData(fetchedStores);
           // Refetch coupons after seeding
           const qCoupons = query(couponsCollection, orderBy('createdAt', 'desc'));
           const couponsSnapshot = await getDocs(qCoupons);
           const couponsData = couponsSnapshot.docs.map(doc => ({
               id: doc.id,
               ...doc.data(),
               expiryDate: safeToDate(doc.data().expiryDate),
               createdAt: safeToDate(doc.data().createdAt) || new Date(),
               updatedAt: safeToDate(doc.data().updatedAt) || new Date(),
           })) as Coupon[];
            const combinedData = couponsData.map(coupon => ({
             ...coupon,
             storeName: storesMap.get(coupon.storeId) || 'Unknown Store',
           }));
           setCoupons(combinedData);
           setCouponsExist(combinedData.length > 0);
       } else {
            console.log("No coupons found, and auto-seeding not requested or no stores available.");
            setCoupons([]);
       }

     } catch (err) {
       console.error("Error fetching coupons or stores:", err);
       setError("Failed to load data. Please try again later.");
     } finally {
       setLoading(false);
     }
 }, [handleSeedData]); // Add handleSeedData as dependency

  useEffect(() => {
    fetchCouponsAndStores(true); // Fetch on mount, auto-seed if needed
  }, [fetchCouponsAndStores]);


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
       fetchCouponsAndStores(); // Refresh list after add/edit
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
            <div className="flex items-center gap-2">
                {/* Conditionally show Seed button only if stores exist, coupons don't, and not loading/seeding */}
                {stores.length > 0 && !couponsExist && !loading && !isSeeding && (
                   <Button onClick={() => handleSeedData(stores)} variant="secondary">
                      <DatabaseZap className="mr-2 h-4 w-4" /> Seed Example Coupons
                   </Button>
                )}
                <Button onClick={handleAddNew} disabled={isSeeding}>
                    <PlusCircle className="mr-2 h-4 w-4" /> Add New Coupon
                </Button>
            </div>
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
             <div className="text-center text-muted-foreground py-8 flex flex-col items-center gap-4">
                 <p>No coupons found in the database.</p>
                 {/* Show seed button if stores exist, coupons don't, and not loading/seeding */}
                 {stores.length > 0 && !loading && !isSeeding && (
                    <Button onClick={() => handleSeedData(stores)} variant="secondary">
                        <DatabaseZap className="mr-2 h-4 w-4" /> {isSeeding ? 'Seeding...' : 'Seed Example Coupons'}
                    </Button>
                 )}
             </div>
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